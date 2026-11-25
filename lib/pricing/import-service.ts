import "server-only";
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  customers,
  priceGroups,
  pricingMatrixTiers,
  pricingPerKgTiers,
  pricingVersions,
  pricingZoneCountries,
  pricingZones,
  routes,
} from "@/drizzle/schema";
import { normCode } from "./engine";
import { parsePriceWorkbook, type ImportBlock } from "./import-excel";
import { readWorkbook } from "./read-xlsx";
import { isIsoDate, planNewVersion, viDate } from "./versioning";
import type { ImportBlockPreview, ImportCommitResult, ImportOptions, ImportPreview } from "./import-types";
import { PRICE_KIND_LABEL, scopeLabel } from "@/lib/labels";

export class ImportError extends Error {}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK = 2000;

// -----------------------------------------------------------------------------
// Đọc tùy chọn từ form
// -----------------------------------------------------------------------------
export function readImportForm(formData: FormData): { file: File; options: ImportOptions } {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("Chọn file Excel bảng giá (.xlsx).");
  if (!/\.xlsx$/i.test(file.name)) throw new ImportError("Chỉ hỗ trợ file Excel .xlsx.");
  if (file.size > MAX_FILE_BYTES) throw new ImportError("File vượt quá 10 MB.");

  const kind = formData.get("kind") === "SELL" ? "SELL" : "COST";
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "").trim();
  if (!effectiveFrom) throw new ImportError("Bắt buộc chọn Ngày hiệu lực cho phiên bản mới.");
  if (!isIsoDate(effectiveFrom)) throw new ImportError("Ngày hiệu lực không hợp lệ.");

  const scopeType = String(formData.get("scopeType") ?? "DEFAULT");
  const scopeCode = normCode(String(formData.get("scopeCode") ?? ""));
  let scope: ImportOptions["scope"] = { type: "DEFAULT" };
  if (kind === "SELL" && scopeType === "GROUP") {
    if (!scopeCode) throw new ImportError("Chọn nhóm giá áp dụng.");
    scope = { type: "GROUP", code: scopeCode };
  } else if (kind === "SELL" && scopeType === "CUSTOMER") {
    if (!scopeCode) throw new ImportError("Chọn khách hàng áp dụng.");
    scope = { type: "CUSTOMER", code: scopeCode };
  }
  const note = String(formData.get("note") ?? "").trim() || null;
  const skipUnknownRoutes = formData.get("skipUnknownRoutes") === "on";
  return { file, options: { kind, scope, effectiveFrom, note, skipUnknownRoutes } };
}

const scopeOf = (o: ImportOptions) => ({
  customerCode: o.scope.type === "CUSTOMER" ? o.scope.code : null,
  priceGroupCode: o.scope.type === "GROUP" ? o.scope.code : null,
});

function scopeWhere(o: ImportOptions): SQL {
  const s = scopeOf(o);
  return and(
    s.customerCode ? eq(pricingVersions.customerCode, s.customerCode) : isNull(pricingVersions.customerCode),
    s.priceGroupCode ? eq(pricingVersions.priceGroupCode, s.priceGroupCode) : isNull(pricingVersions.priceGroupCode),
  )!;
}

async function activeVersions(exec: Pick<typeof db, "select">, routeCode: string, o: ImportOptions, lock: boolean) {
  const q = exec
    .select({ id: pricingVersions.id, effectiveFrom: pricingVersions.effectiveFrom, effectiveTo: pricingVersions.effectiveTo })
    .from(pricingVersions)
    .where(
      and(
        eq(pricingVersions.routeCode, routeCode),
        eq(pricingVersions.priceKind, o.kind),
        eq(pricingVersions.status, "ACTIVE"),
        scopeWhere(o),
      ),
    );
  return lock ? q.for("update") : q;
}

/** Đơn chưa khóa giá có Ngày gửi hàng rơi vào khoảng hiệu lực mới → sẽ dùng giá mới khi tính lại */
async function countAffectedOrders(routeCode: string, o: ImportOptions, to: string | null): Promise<number> {
  const col = sql.raw(o.kind === "SELL" ? "route_code" : "assigned_route_code");
  const s = scopeOf(o);
  const scopeFilter = s.customerCode
    ? sql`and customer_code = ${s.customerCode}`
    : s.priceGroupCode
      ? sql`and customer_code in (select customer_code from customers where price_group_code = ${s.priceGroupCode})`
      : sql``;
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from orders
    where ${col} = ${routeCode} and price_locked = false
      and pricing_date >= ${o.effectiveFrom} ${to ? sql`and pricing_date <= ${to}` : sql``}
      ${scopeFilter}`);
  return Number(rows[0]?.n ?? 0);
}

async function validateScope(o: ImportOptions): Promise<string | null> {
  if (o.scope.type === "GROUP") {
    const r = await db.select({ code: priceGroups.code }).from(priceGroups).where(eq(priceGroups.code, o.scope.code));
    if (r.length === 0) return `Nhóm giá ${o.scope.code} không tồn tại.`;
  }
  if (o.scope.type === "CUSTOMER") {
    const r = await db.select({ code: customers.customerCode }).from(customers).where(eq(customers.customerCode, o.scope.code));
    if (r.length === 0) return `Khách hàng ${o.scope.code} không tồn tại.`;
  }
  return null;
}

const optionScopeLabel = (o: ImportOptions) =>
  `${PRICE_KIND_LABEL[o.kind]} · ${scopeLabel(scopeOf(o).customerCode, scopeOf(o).priceGroupCode)}`;

// -----------------------------------------------------------------------------
// Bước 1: xem trước (không ghi DB)
// -----------------------------------------------------------------------------
export async function previewImport(file: File, options: ImportOptions): Promise<ImportPreview> {
  const parsed = parsePriceWorkbook(await readWorkbook(await file.arrayBuffer()));
  const errors = [...parsed.errors];
  const scopeError = await validateScope(options);
  if (scopeError) errors.push(scopeError);

  const codes = parsed.blocks.map((b) => b.routeCode);
  const existing = codes.length
    ? await db.select({ code: routes.routeCode }).from(routes).where(inArray(routes.routeCode, codes))
    : [];
  const known = new Set(existing.map((r) => r.code));

  const blocks: ImportBlockPreview[] = [];
  for (const b of parsed.blocks) {
    const routeExists = known.has(b.routeCode);
    const willImport = routeExists;
    let plan: ImportBlockPreview["plan"] = null;
    let affectedOrders = 0;
    if (routeExists) {
      plan = planNewVersion(await activeVersions(db, b.routeCode, options, false), options.effectiveFrom);
      if (plan.ok) affectedOrders = await countAffectedOrders(b.routeCode, options, plan.newEffectiveTo);
    }
    blocks.push({
      sheet: b.sheet,
      cellRef: b.cellRef,
      routeCode: b.routeCode,
      routeName: b.routeName,
      routeExists,
      willImport,
      currency: b.currency,
      mode: b.mode,
      countryCount: b.countries.length,
      zones: b.zones.map((z) => ({
        zoneCode: z.zoneCode,
        countries: z.countries,
        matrixCount: z.matrix.length,
        perKgCount: z.perKg.length,
      })),
      fixedWeights: b.fixedWeights,
      ranges: b.ranges,
      warnings: b.warnings,
      plan,
      affectedOrders,
    });
  }

  const unknown = blocks.filter((b) => !b.routeExists);
  if (unknown.length && !options.skipUnknownRoutes) {
    errors.push(
      `Chưa có tuyến trong Danh mục: ${unknown.map((b) => b.routeCode).join(", ")}. Hãy tạo tuyến trước hoặc chọn "Bỏ qua tuyến chưa có".`,
    );
  }
  for (const b of blocks) if (b.plan && !b.plan.ok) errors.push(`${b.routeCode}: ${b.plan.error}`);
  const importable = blocks.filter((b) => b.willImport);
  if (importable.length === 0 && errors.length === 0) errors.push("Không có tuyến nào để nhập.");

  return {
    fileName: file.name,
    options,
    scopeLabel: optionScopeLabel(options),
    errors,
    blocks,
    canCommit: errors.length === 0 && importable.length > 0,
  };
}

// -----------------------------------------------------------------------------
// Bước 2: ghi DB — toàn bộ file trong 1 transaction
// -----------------------------------------------------------------------------
async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

async function insertBlock(tx: Tx, b: ImportBlock, o: ImportOptions, fileName: string, result: ImportCommitResult) {
  const existing = await activeVersions(tx, b.routeCode, o, true);
  const plan = planNewVersion(existing, o.effectiveFrom);
  if (!plan.ok) throw new ImportError(`${b.routeCode}: ${plan.error}`);

  // Chỉ chốt ngày kết thúc của phiên bản cũ — không sửa giá cũ (giữ lịch sử cho đơn quá khứ)
  for (const c of plan.close) {
    await tx.update(pricingVersions).set({ effectiveTo: c.newEffectiveTo }).where(eq(pricingVersions.id, Number(c.id)));
    result.closed.push({ id: Number(c.id), routeCode: b.routeCode, newEffectiveTo: c.newEffectiveTo });
  }

  const s = scopeOf(o);
  const [version] = await tx
    .insert(pricingVersions)
    .values({
      routeCode: b.routeCode,
      priceKind: o.kind,
      customerCode: s.customerCode,
      priceGroupCode: s.priceGroupCode,
      name: `${b.routeCode} · ${optionScopeLabel(o)} · từ ${viDate(o.effectiveFrom)}`,
      pricingMode: b.mode,
      currency: b.currency,
      effectiveFrom: o.effectiveFrom,
      effectiveTo: plan.newEffectiveTo,
      status: "ACTIVE",
      note: [`Import từ file "${fileName}" (${b.sheet}!${b.cellRef})`, o.note].filter(Boolean).join(" — "),
    })
    .returning({ id: pricingVersions.id });

  const zoneRows = await tx
    .insert(pricingZones)
    .values(b.zones.map((z, i) => ({ versionId: version.id, zoneCode: z.zoneCode, zoneName: z.zoneName, sortOrder: i })))
    .returning({ id: pricingZones.id, zoneCode: pricingZones.zoneCode });
  const zoneId = new Map(zoneRows.map((z) => [z.zoneCode, z.id]));

  const countries = b.zones.flatMap((z) => z.countries.map((iso2) => ({ versionId: version.id, iso2, zoneId: zoneId.get(z.zoneCode)! })));
  const matrix = b.zones.flatMap((z) => z.matrix.map((t) => ({ zoneId: zoneId.get(z.zoneCode)!, weightMax: t.weightMax, price: t.price })));
  const perKg = b.zones.flatMap((z) =>
    z.perKg.map((t) => ({ zoneId: zoneId.get(z.zoneCode)!, weightMin: t.weightMin, weightMax: t.weightMax, unitPrice: t.unitPrice })),
  );
  await insertChunks(countries, (c) => tx.insert(pricingZoneCountries).values(c));
  await insertChunks(matrix, (c) => tx.insert(pricingMatrixTiers).values(c));
  await insertChunks(perKg, (c) => tx.insert(pricingPerKgTiers).values(c));

  result.created.push({ id: version.id, routeCode: b.routeCode, zones: zoneRows.length, tiers: matrix.length + perKg.length });
}

export async function commitImport(file: File, options: ImportOptions): Promise<ImportCommitResult> {
  const parsed = parsePriceWorkbook(await readWorkbook(await file.arrayBuffer()));
  if (parsed.errors.length) throw new ImportError(parsed.errors.join("\n"));
  const scopeError = await validateScope(options);
  if (scopeError) throw new ImportError(scopeError);

  const codes = parsed.blocks.map((b) => b.routeCode);
  const known = new Set(
    (await db.select({ code: routes.routeCode }).from(routes).where(inArray(routes.routeCode, codes))).map((r) => r.code),
  );
  const unknown = codes.filter((c) => !known.has(c));
  if (unknown.length && !options.skipUnknownRoutes) throw new ImportError(`Chưa có tuyến trong Danh mục: ${unknown.join(", ")}.`);
  const blocks = parsed.blocks.filter((b) => known.has(b.routeCode));
  if (blocks.length === 0) throw new ImportError("Không có tuyến nào để nhập.");

  const result: ImportCommitResult = { created: [], closed: [] };
  await db.transaction(async (tx) => {
    for (const b of blocks) await insertBlock(tx, b, options, file.name, result);
  });
  return result;
}
