import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, priceGroups, pricingVersions, routes } from "@/drizzle/schema";
import { repriceOpenOrdersOfCustomers, type RepriceReport } from "@/lib/orders/reprice";
import { scaleZones } from "./group-table";
import { getVersionDetail } from "./queries";
import { insertBlock } from "./import-service";
import { viDate } from "./versioning";
import type { ImportBlock } from "./import-excel";
import type { Currency } from "./engine";
import type { ImportCommitResult } from "./import-types";

export class GroupTableError extends Error {}

const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());
const activeOn = (date: string) =>
  and(eq(pricingVersions.status, "ACTIVE"), lte(pricingVersions.effectiveFrom, date), or(isNull(pricingVersions.effectiveTo), gte(pricingVersions.effectiveTo, date)));

/**
 * Chi tiết nhóm cho cửa sổ sửa: mỗi tuyến có bảng giá bán chung → nhóm đang dùng bảng riêng hay giá chung × (1 + %),
 * cùng danh sách khách trong nhóm và khách có thể thêm vào.
 */
export async function getPriceGroupDetail(code: string) {
  const [g] = await db.select({ code: priceGroups.code, adjustPct: priceGroups.adjustPct }).from(priceGroups).where(eq(priceGroups.code, code));
  if (!g) return null;
  const today = todayVn();
  const [general, own, members, others] = await Promise.all([
    db
      .select({ id: pricingVersions.id, routeCode: pricingVersions.routeCode, effectiveFrom: pricingVersions.effectiveFrom, currency: pricingVersions.currency })
      .from(pricingVersions)
      .innerJoin(routes, eq(routes.routeCode, pricingVersions.routeCode))
      .where(and(eq(routes.isActive, true), eq(pricingVersions.priceKind, "SELL"), isNull(pricingVersions.customerCode), isNull(pricingVersions.priceGroupCode), activeOn(today)))
      .orderBy(asc(pricingVersions.routeCode), desc(pricingVersions.effectiveFrom)),
    db
      .select({ id: pricingVersions.id, routeCode: pricingVersions.routeCode, effectiveFrom: pricingVersions.effectiveFrom, effectiveTo: pricingVersions.effectiveTo })
      .from(pricingVersions)
      .where(and(eq(pricingVersions.priceKind, "SELL"), eq(pricingVersions.priceGroupCode, code), eq(pricingVersions.status, "ACTIVE"), or(isNull(pricingVersions.effectiveTo), gte(pricingVersions.effectiveTo, today))))
      .orderBy(asc(pricingVersions.routeCode), asc(pricingVersions.effectiveFrom)),
    db.select({ code: customers.customerCode, name: customers.name, adjustPct: customers.priceAdjustPct }).from(customers).where(eq(customers.priceGroupCode, code)).orderBy(asc(customers.customerCode)),
    db
      .select({ code: customers.customerCode, name: customers.name, group: customers.priceGroupCode })
      .from(customers)
      .where(and(eq(customers.isActive, true), or(isNull(customers.priceGroupCode), sql`${customers.priceGroupCode} <> ${code}`)))
      .orderBy(asc(customers.customerCode)),
  ]);
  const seen = new Set<string>();
  const routesInfo = general
    .filter((v) => !seen.has(v.routeCode) && seen.add(v.routeCode))
    .map((v) => ({ routeCode: v.routeCode, generalVersionId: v.id, generalFrom: v.effectiveFrom, own: own.filter((o) => o.routeCode === v.routeCode) }));
  // Tuyến chỉ có bảng riêng (không có giá chung)
  for (const o of own) if (!seen.has(o.routeCode) && seen.add(o.routeCode)) routesInfo.push({ routeCode: o.routeCode, generalVersionId: 0, generalFrom: "", own: own.filter((x) => x.routeCode === o.routeCode) });
  return { code: g.code, adjustPct: g.adjustPct, routes: routesInfo, members, others };
}
export type PriceGroupDetail = NonNullable<Awaited<ReturnType<typeof getPriceGroupDetail>>>;

/**
 * Thêm tuyến BẢNG GIÁ RIÊNG cho nhóm: sao chép bảng giá bán chung đang hiệu lực tại ngày bắt đầu,
 * nhân (1 + % nhóm), lưu thành phiên bản riêng của nhóm (phiên bản riêng cũ cùng tuyến được chốt ngày kết thúc).
 * Sau đó giá nhóm tuyến này độc lập với giá chung — sửa bằng Import bảng giá (phạm vi = nhóm). Tính lại giá đơn chưa khóa.
 */
export async function createGroupOwnTable(groupCode: string, routeCode: string, effectiveFrom: string): Promise<{ result: ImportCommitResult; reprice: RepriceReport; baseFrom: string }> {
  const [g] = await db.select({ code: priceGroups.code, adjustPct: priceGroups.adjustPct }).from(priceGroups).where(eq(priceGroups.code, groupCode));
  if (!g) throw new GroupTableError(`Không có nhóm giá ${groupCode}.`);
  const [base] = await db
    .select({ id: pricingVersions.id })
    .from(pricingVersions)
    .where(and(eq(pricingVersions.routeCode, routeCode), eq(pricingVersions.priceKind, "SELL"), isNull(pricingVersions.customerCode), isNull(pricingVersions.priceGroupCode), activeOn(effectiveFrom)))
    .orderBy(desc(pricingVersions.effectiveFrom))
    .limit(1);
  if (!base) throw new GroupTableError(`Tuyến ${routeCode} chưa có bảng giá bán chung hiệu lực ngày ${viDate(effectiveFrom)} để sao chép. Hãy import bảng giá riêng cho nhóm ở Kho bảng giá.`);
  const d = (await getVersionDetail(Number(base.id)))!;
  const zones = d.zones.map((z) => ({
    zoneCode: z.zoneCode,
    zoneName: z.zoneName ?? z.zoneCode,
    countries: z.countries,
    matrix: d.matrix.filter((t) => t.zoneId === z.id).map((t) => ({ weightMax: String(t.weightMax), price: String(t.price) })),
    perKg: d.perKg.filter((t) => t.zoneId === z.id).map((t) => ({ weightMin: String(t.weightMin), weightMax: t.weightMax === null ? null : String(t.weightMax), unitPrice: String(t.unitPrice) })),
  }));
  const currency = (d.version.currency === "USD" ? "USD" : "VND") as Currency;
  const block: ImportBlock = {
    sheet: "",
    cellRef: "",
    routeName: routeCode,
    routeCode,
    currency,
    mode: d.version.pricingMode as ImportBlock["mode"],
    countries: zones.flatMap((z) => z.countries),
    zones: scaleZones(zones, g.adjustPct, currency),
    fixedWeights: [],
    ranges: [],
    warnings: [],
  };
  const result: ImportCommitResult = { created: [], closed: [] };
  const reprice = await db.transaction(async (tx) => {
    await insertBlock(
      tx,
      block,
      { kind: "SELL", scope: { type: "GROUP", code: groupCode }, effectiveFrom, note: null, skipUnknownRoutes: false },
      `Sao chép bảng giá bán chung (từ ${viDate(d.version.effectiveFrom)}) × (1 ${Number(g.adjustPct) < 0 ? "−" : "+"} ${Math.abs(Number(g.adjustPct))}%)`,
      result,
    );
    const members = await tx.select({ c: customers.customerCode }).from(customers).where(eq(customers.priceGroupCode, groupCode));
    return repriceOpenOrdersOfCustomers(tx, members.map((m) => m.c));
  });
  return { result, reprice, baseFrom: d.version.effectiveFrom };
}

/** Gán khách vào nhóm (hoặc bỏ khỏi nhóm → giá chung) và tính lại giá các đơn chưa khóa của khách */
export async function setCustomerGroup(customerCode: string, groupCode: string | null): Promise<RepriceReport> {
  return db.transaction(async (tx) => {
    if (groupCode) {
      const [g] = await tx.select({ c: priceGroups.code }).from(priceGroups).where(eq(priceGroups.code, groupCode));
      if (!g) throw new GroupTableError(`Không có nhóm giá ${groupCode}.`);
    }
    const r = await tx.update(customers).set({ priceGroupCode: groupCode }).where(eq(customers.customerCode, customerCode)).returning({ c: customers.customerCode });
    if (!r.length) throw new GroupTableError(`Không có khách hàng ${customerCode}.`);
    return repriceOpenOrdersOfCustomers(tx, [customerCode]);
  });
}
