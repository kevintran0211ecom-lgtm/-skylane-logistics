"use server";

import { revalidatePath } from "next/cache";
import { inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbErrorMessage } from "@/lib/db/errors";
import { formToObject, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { orderPackages, orders } from "@/drizzle/schema";
import { createOrderSchema, packageSchema, parseBulkEdit } from "./schemas";
import { guard } from "@/lib/auth/session";
import { BULK_FIELDS_BY_ROLE, can } from "@/lib/auth/permissions";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { repriceMessage, repriceOrders, type RepriceReport } from "./reprice";
import {
  commitOrderImport,
  OrderImportError,
  previewOrderImport,
  readOrderImportForm,
  type OrderImportPreview,
  type OrderImportResult,
} from "./import-service";

const textArray = (items: string[]): SQL =>
  items.length ? sql`ARRAY[${sql.join(items.map((i) => sql`${i}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;

// =============================================================================
// Tạo đơn nội bộ (nhiều kiện) → tính giá ngay
// =============================================================================
export async function createOrder(_prev: ActionState<RepriceReport>, fd: FormData): Promise<ActionState<RepriceReport>> {
  const g = await guard("orders.create");
  if (!g.ok) return g;
  const parsed = createOrderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: "Vui lòng kiểm tra lại thông tin.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const d = parsed.data;
  try {
    const report = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(orders)
        .values({
          customerCode: d.customerCode,
          billCode: d.billCode,
          trackingNumber: d.trackingNumber,
          source: "MANUAL",
          routeCode: d.routeCode,
          assignedRouteCode: d.assignedRouteCode ?? d.routeCode,
          destinationIso2: d.destinationIso2,
          shippedAt: d.shippedAt,
          receiverName: d.receiverName,
          receiverPhone: d.receiverPhone,
          receiverEmail: d.receiverEmail?.toLowerCase() ?? null,
          receiverAddress: d.receiverAddress,
          receiverCity: d.receiverCity,
          receiverState: d.receiverState,
          receiverPostalCode: d.receiverPostalCode,
          goodsDescription: d.goodsDescription,
          hsCode: d.hsCode,
          declaredValueUsd: d.declaredValueUsd?.replace(",", ".") ?? null,
          note: d.note,
        })
        .returning({ id: orders.id });
      if (d.packages.length) await tx.insert(orderPackages).values(d.packages.map((p, i) => ({ orderId: o.id, seq: i + 1, ...p })));
      return repriceOrders(tx, [o.id]);
    });
    revalidatePath("/don-hang");
    const warn = report.failed[0]?.message;
    return { ok: true, message: `Đã tạo đơn ${d.billCode}${warn ? ` — chưa tra được giá: ${warn}` : "."}`, data: report };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không tạo được đơn.") };
  }
}

// =============================================================================
// Import đơn từ Excel / CSV / Google Sheet — chặn trùng order_key
// =============================================================================
const importError = (e: unknown) =>
  ({ ok: false, error: e instanceof OrderImportError || (e instanceof Error && e.message.startsWith("Không đọc được file")) ? e.message : dbErrorMessage(e, "Không nhập được đơn.") }) as const;

export async function previewOrders(_p: ActionState<OrderImportPreview>, fd: FormData): Promise<ActionState<OrderImportPreview>> {
  const g = await guard("orders.import");
  if (!g.ok) return g;
  try {
    const { options, file } = readOrderImportForm(fd);
    return { ok: true, data: await previewOrderImport(options, file) };
  } catch (e) {
    return importError(e);
  }
}

export async function importOrders(_p: ActionState<OrderImportResult>, fd: FormData): Promise<ActionState<OrderImportResult>> {
  const g = await guard("orders.import");
  if (!g.ok) return g;
  try {
    const { options, file } = readOrderImportForm(fd);
    const r = await commitOrderImport(options, file);
    revalidatePath("/don-hang");
    const extra = repriceMessage(r.reprice);
    return {
      ok: true,
      message: `Đã nhập ${r.inserted} đơn${r.duplicates ? `, chặn ${r.duplicates} đơn trùng` : ""}${extra ? `; ${extra}` : ""}.`,
      data: r,
    };
  } catch (e) {
    return importError(e);
  }
}

// =============================================================================
// Sửa đổi hàng loạt — chỉ cập nhật trường được tick, rồi tính lại giá đơn chưa khóa
// =============================================================================
export async function bulkEditOrders(_p: ActionState<RepriceReport>, fd: FormData): Promise<ActionState<RepriceReport>> {
  const g = await guard("orders.bulkEdit");
  if (!g.ok) return g;
  const parsed = parseBulkEdit(formToObject(fd));
  if (!parsed.ok) return parsed;
  const p = parsed.plan;
  const allowed = BULK_FIELDS_BY_ROLE[g.user.role] as readonly string[];
  const denied = p.fields.filter((f) => !allowed.includes(f));
  if (denied.length) return { ok: false, error: `Vai trò của bạn không được sửa: ${denied.join(", ")}.` };
  if (p.priceLocked !== undefined && !can(g.user.role, "orders.unlock")) return { ok: false, error: "Chỉ Admin và Kế toán được khóa/mở khóa giá." };
  // Vai trò không được sửa đơn đã khóa giá → chỉ áp cho đơn chưa khóa
  const lockedFilter = can(g.user.role, "orders.editLocked") ? undefined : eq(orders.priceLocked, false);

  const set: Record<string, unknown> = {};
  if (p.routeCode !== undefined) set.routeCode = p.routeCode;
  if (p.assignedRouteCode !== undefined) set.assignedRouteCode = p.assignedRouteCode ?? p.routeCode ?? sql`${orders.routeCode}`;
  if (p.destinationIso2 !== undefined) set.destinationIso2 = p.destinationIso2;
  if (p.status !== undefined) {
    set.status = p.status;
    if (p.status === "Đã nhận kho") set.receivedAt = sql`coalesce(${orders.receivedAt}, now())`;
    if (p.status === "Đã giao hàng") set.deliveredAt = sql`coalesce(${orders.deliveredAt}, now())`;
  }
  if (p.trackingNumber !== undefined) set.trackingNumber = p.trackingNumber;
  if (p.note !== undefined) set.note = p.note;
  if (p.priceLocked !== undefined) {
    set.priceLocked = p.priceLocked;
    if (p.priceLocked) set.priceLockedAt = sql`coalesce(${orders.priceLockedAt}, now())`;
  }
  const column = { actual_weight: "actualWeight", volumetric_weight: "volumetricWeight", billed_weight: "billedWeight", shipped_weight: "shippedWeight" } as const;
  const add: string[] = [];
  const remove: string[] = [];
  for (const [key, value] of Object.entries(p.weights) as [keyof typeof column, string | null][]) {
    if (value === null) remove.push(key);
    else {
      add.push(key);
      set[column[key]] = value;
    }
  }
  if (add.length || remove.length) {
    set.manualOverrides = sql`(select coalesce(array_agg(distinct x order by x), '{}'::text[])
      from unnest(${orders.manualOverrides} || ${textArray(add)}) as x
      where not (x = any(${textArray(remove)})))`;
  }

  try {
    const { updated, report } = await db.transaction(async (tx) => {
      const rows = await tx.update(orders).set(set).where(and(inArray(orders.id, p.ids), lockedFilter)).returning({ id: orders.id });
      const report = p.affectsPricing ? await repriceOrders(tx, rows.map((r) => r.id)) : null;
      return { updated: rows.length, report };
    });
    revalidatePath("/don-hang");
    const extra = report ? repriceMessage(report) : "";
    const skipped = p.ids.length - updated;
    return {
      ok: true,
      message: `Đã cập nhật ${updated} đơn${extra ? `; ${extra}` : ""}${skipped ? `; bỏ qua ${skipped} đơn đã khóa giá (cần Admin/Kế toán)` : ""}.`,
      data: report ?? { repriced: 0, locked: 0, failed: [] },
    };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không cập nhật được đơn.") };
  }
}

// =============================================================================
// Sửa kích thước / cân từng kiện (Kho, Kế toán, Admin) → tính lại giá ngay
// =============================================================================
const packagesInput = z.array(packageSchema).max(500, "Tối đa 500 kiện");

export async function updateOrderPackages(orderId: number, _p: ActionState<RepriceReport>, fd: FormData): Promise<ActionState<RepriceReport>> {
  const g = await guard("orders.editPackages");
  if (!g.ok) return g;
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("packages") ?? "[]"));
  } catch {
    return { ok: false, error: "Danh sách kiện không hợp lệ." };
  }
  const parsed = packagesInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const report = await db.transaction(async (tx) => {
      const [o] = await tx.select({ id: orders.id, priceLocked: orders.priceLocked, billCode: orders.billCode }).from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) throw new Error("NOT_FOUND");
      if (o.priceLocked && !can(g.user.role, "orders.editLocked")) throw new Error("LOCKED");
      await tx.delete(orderPackages).where(eq(orderPackages.orderId, orderId));
      if (parsed.data.length) await tx.insert(orderPackages).values(parsed.data.map((p, i) => ({ orderId, seq: i + 1, ...p })));
      return repriceOrders(tx, [orderId]);
    });
    revalidatePath("/don-hang");
    const extra = repriceMessage(report);
    return { ok: true, message: `Đã lưu ${parsed.data.length} kiện${extra ? `; ${extra}` : ""}.`, data: report };
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: "Không tìm thấy đơn." };
    if (e instanceof Error && e.message === "LOCKED") return { ok: false, error: "Đơn đã khóa giá — chỉ Admin hoặc Kế toán được sửa." };
    return { ok: false, error: dbErrorMessage(e, "Không lưu được kiện hàng.") };
  }
}

/** Kiện hiện có của 1 đơn (để mở form sửa) */
export async function getOrderPackages(orderId: number) {
  const g = await guard("orders.editPackages");
  if (!g.ok) return [];
  return db
    .select({ lengthCm: orderPackages.lengthCm, widthCm: orderPackages.widthCm, heightCm: orderPackages.heightCm, actualWeight: orderPackages.actualWeight })
    .from(orderPackages)
    .where(and(eq(orderPackages.orderId, orderId)))
    .orderBy(orderPackages.seq);
}
