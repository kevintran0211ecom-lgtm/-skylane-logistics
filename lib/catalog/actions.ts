"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbErrorMessage } from "@/lib/db/errors";
import { formToObject, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { customers, priceGroups, routes, suppliers } from "@/drizzle/schema";
import { customerSchema, routeSchema } from "./schemas";
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
  try {
    await db.transaction(async (tx) => {
      if (d.priceGroupCode) {
        await tx.insert(priceGroups).values({ code: d.priceGroupCode, name: d.priceGroupCode }).onConflictDoNothing();
      }
      if (d.mode === "create") {
        await tx.insert(customers).values({ customerCode: d.customerCode, ...values });
      } else {
        const res = await tx
          .update(customers)
          .set(values)
          .where(eq(customers.customerCode, d.customerCode))
          .returning({ code: customers.customerCode });
        if (res.length === 0) throw new Error("NOT_FOUND");
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return { ok: false, error: `Không tìm thấy khách hàng ${d.customerCode}.` };
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/khach-hang");
  return { ok: true, message: d.mode === "create" ? `Đã thêm khách hàng ${d.customerCode}.` : `Đã cập nhật ${d.customerCode}.` };
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
