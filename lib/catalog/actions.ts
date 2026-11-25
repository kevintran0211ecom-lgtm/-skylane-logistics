"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbErrorMessage } from "@/lib/db/errors";
import { formToObject, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { customers, priceGroups, routes, suppliers } from "@/drizzle/schema";
import { customerSchema, priceGroupSchema, routeSchema } from "./schemas";
import { repriceMessage, repriceOpenOrdersOfCustomers } from "@/lib/orders/reprice";
import { guard } from "@/lib/auth/session";

// =============================================================================
// Khách hàng
// =============================================================================
export async function saveCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard("catalog.manage");
  if (!g.ok) return g;
  const parsed = customerSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: "Vui lòng kiểm tra lại thông tin.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }
  const d = parsed.data;
  if (d.syncEnabled && d.syncSourceType === "NONE") {
    return { ok: false, error: "Chọn nguồn đồng bộ trước khi bật đồng bộ.", fieldErrors: { syncSourceType: "Chọn nguồn đồng bộ" } };
  }
  if (d.syncSourceType === "GOOGLE_SHEET" && d.syncEnabled && !d.syncUrl) {
    return { ok: false, error: "Nhập link Google Sheet nguồn.", fieldErrors: { syncUrl: "Nhập link Google Sheet" } };
  }
  const values = {
    name: d.name,
    phone: d.phone,
    email: d.email?.toLowerCase() ?? null,
    address: d.address,
    saleUserId: d.saleUserId,
    priceGroupCode: d.priceGroupCode,
    priceAdjustPct: d.priceAdjustPct,
    currency: d.currency,
    syncSourceType: d.syncSourceType,
    syncEnabled: d.syncEnabled,
    syncConfig: d.syncSourceType === "NONE" ? {} : { url: d.syncUrl ?? undefined, sheet: d.syncSheet ?? undefined },
    isActive: d.isActive,
    note: d.note,
  };
  let extra = "";
  try {
    await db.transaction(async (tx) => {
      if (d.priceGroupCode) {
        const [grp] = await tx.select({ code: priceGroups.code }).from(priceGroups).where(eq(priceGroups.code, d.priceGroupCode));
        if (!grp) throw new Error("NO_GROUP");
      }
      if (d.mode === "create") {
        await tx.insert(customers).values({ customerCode: d.customerCode, ...values });
      } else {
        const [old] = await tx
          .select({ g: customers.priceGroupCode, p: customers.priceAdjustPct })
          .from(customers)
          .where(eq(customers.customerCode, d.customerCode))
          .for("update");
        if (!old) throw new Error("NOT_FOUND");
        await tx.update(customers).set(values).where(eq(customers.customerCode, d.customerCode));
        // Đổi nhóm giá / % điều chỉnh → tính lại giá bán các đơn chưa khóa giá
        if (old.g !== d.priceGroupCode || Number(old.p) !== Number(d.priceAdjustPct)) {
          extra = repriceMessage(await repriceOpenOrdersOfCustomers(tx, [d.customerCode]));
        }
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: `Không tìm thấy khách hàng ${d.customerCode}.` };
    if (e instanceof Error && e.message === "NO_GROUP") {
      return { ok: false, error: `Nhóm giá ${d.priceGroupCode} chưa có — tạo ở mục Nhóm giá.`, fieldErrors: { priceGroupCode: "Nhóm giá chưa có" } };
    }
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/khach-hang");
  revalidatePath("/don-hang");
  return {
    ok: true,
    message: `${d.mode === "create" ? `Đã thêm khách hàng ${d.customerCode}` : `Đã cập nhật ${d.customerCode}`}${extra ? `; ${extra}` : ""}.`,
  };
}

// =============================================================================
// Nhóm giá — % so với bảng giá chung (bảng giá riêng của nhóm nhập ở Kho bảng giá)
// =============================================================================
export async function savePriceGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard("catalog.manage");
  if (!g.ok) return g;
  const parsed = priceGroupSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: "Vui lòng kiểm tra lại thông tin.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }
  const d = parsed.data;
  const values = { name: d.name, adjustPct: d.adjustPct, isActive: d.isActive, note: d.note };
  let extra = "";
  try {
    await db.transaction(async (tx) => {
      if (d.mode === "create") {
        await tx.insert(priceGroups).values({ code: d.code, ...values });
        return;
      }
      const [old] = await tx.select({ pct: priceGroups.adjustPct }).from(priceGroups).where(eq(priceGroups.code, d.code)).for("update");
      if (!old) throw new Error("NOT_FOUND");
      await tx.update(priceGroups).set(values).where(eq(priceGroups.code, d.code));
      if (Number(old.pct) !== Number(d.adjustPct)) {
        const members = await tx.select({ c: customers.customerCode }).from(customers).where(eq(customers.priceGroupCode, d.code));
        extra = repriceMessage(await repriceOpenOrdersOfCustomers(tx, members.map((m) => m.c)));
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: `Không tìm thấy nhóm giá ${d.code}.` };
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/nhom-gia");
  revalidatePath("/khach-hang");
  return { ok: true, message: `${d.mode === "create" ? "Đã thêm" : "Đã cập nhật"} nhóm giá ${d.code}${extra ? `; ${extra}` : ""}.` };
}

// =============================================================================
// Tuyến vận chuyển
// =============================================================================
export async function saveRoute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard("catalog.manage");
  if (!g.ok) return g;
  const parsed = routeSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: "Vui lòng kiểm tra lại thông tin.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  }
  const d = parsed.data;
  const values = {
    name: d.name,
    supplierCode: d.supplierCode,
    serviceType: d.serviceType,
    weightCalcMode: d.weightCalcMode,
    dimDivisor: d.dimDivisor,
    isActive: d.isActive,
    note: d.note,
  };
  try {
    await db.transaction(async (tx) => {
      if (d.supplierCode) {
        await tx.insert(suppliers).values({ supplierCode: d.supplierCode, name: d.supplierCode }).onConflictDoNothing();
      }
      if (d.mode === "create") {
        await tx.insert(routes).values({ routeCode: d.routeCode, ...values });
      } else {
        const res = await tx.update(routes).set(values).where(eq(routes.routeCode, d.routeCode)).returning({ code: routes.routeCode });
        if (res.length === 0) throw new Error("NOT_FOUND");
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: `Không tìm thấy tuyến ${d.routeCode}.` };
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/tuyen");
  return { ok: true, message: d.mode === "create" ? `Đã thêm tuyến ${d.routeCode}.` : `Đã cập nhật tuyến ${d.routeCode}.` };
}
