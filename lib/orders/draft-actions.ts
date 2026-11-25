"use server";
/** Server actions — Đơn hàng dự báo (nhận đơn → xác nhận → Vận đơn) */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, routes } from "@/drizzle/schema";
import { dbErrorMessage } from "@/lib/db/errors";
import { formToObject, zodFieldErrors, type ActionState } from "@/lib/action-state";
import { guard } from "@/lib/auth/session";
import { createOrderSchema, draftFromInput } from "./schemas";
import { confirmDrafts, rejectDrafts, restoreDrafts, stageDrafts, type ConfirmResult, type StageResult } from "./drafts-service";
import { OrderImportError, previewOrderImport, readOrderImportForm, stageOrderImport, type OrderImportPreview } from "./import-service";
import { repriceMessage } from "./reprice";

const done = () => {
  revalidatePath("/don-du-bao");
  revalidatePath("/don-hang");
};
const ids = z.array(z.coerce.number().int().positive()).min(1, "Chọn ít nhất một đơn.").max(2000, "Tối đa 2.000 đơn mỗi lần.");
const readIds = (fd: FormData) => ids.safeParse(String(fd.get("ids") ?? "").split(",").filter(Boolean));

// -----------------------------------------------------------------------------
// Nhập tay (nội bộ)
// -----------------------------------------------------------------------------
export async function createDraft(_p: ActionState<StageResult>, fd: FormData): Promise<ActionState<StageResult>> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  const parsed = createOrderSchema.safeParse(formToObject(fd));
  if (!parsed.success) return { ok: false, error: "Vui lòng kiểm tra lại thông tin.", fieldErrors: zodFieldErrors(parsed.error.issues) };
  const d = parsed.data;
  try {
    const [c, r] = await Promise.all([
      db.select({ c: customers.customerCode }).from(customers).where(inArray(customers.customerCode, [d.customerCode])),
      db.select({ c: routes.routeCode }).from(routes).where(inArray(routes.routeCode, [d.routeCode, d.assignedRouteCode ?? d.routeCode])),
    ]);
    if (!c.length) return { ok: false, error: `Không có khách hàng ${d.customerCode}.` };
    if (r.length < new Set([d.routeCode, d.assignedRouteCode ?? d.routeCode]).size) return { ok: false, error: "Tuyến không có trong Danh mục." };
    const res = await stageDrafts([draftFromInput(d)], { source: "MANUAL", userId: g.user.id });
    if (!res.added) return { ok: false, error: `Trùng order_key ${d.customerCode}|${d.billCode} — đơn đã có trong Vận đơn hoặc Đơn hàng dự báo.` };
    done();
    return { ok: true, message: `Đã thêm ${d.billCode} vào Đơn hàng dự báo — chờ xác nhận.`, data: res };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không thêm được đơn.") };
  }
}

// -----------------------------------------------------------------------------
// Import file Excel (mẫu SKL116) / Đồng bộ Google Sheet khách
// -----------------------------------------------------------------------------
const importError = (e: unknown) =>
  ({
    ok: false,
    error: e instanceof OrderImportError || (e instanceof Error && e.message.startsWith("Không đọc được file")) ? e.message : dbErrorMessage(e, "Không nhập được đơn."),
  }) as const;

export async function previewOrders(_p: ActionState<OrderImportPreview>, fd: FormData): Promise<ActionState<OrderImportPreview>> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  try {
    const { options, file } = readOrderImportForm(fd);
    return { ok: true, data: await previewOrderImport(options, file) };
  } catch (e) {
    return importError(e);
  }
}

export async function importOrders(_p: ActionState<StageResult>, fd: FormData): Promise<ActionState<StageResult>> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  try {
    const { options, file } = readOrderImportForm(fd);
    const r = await stageOrderImport(options, file, g.user.id);
    done();
    return {
      ok: true,
      message: `Đã đưa ${r.added} đơn vào Đơn hàng dự báo${r.skipped ? `, bỏ qua ${r.skipped} đơn trùng` : ""}. Chọn đơn và bấm “Xác nhận” để chuyển sang Vận đơn.`,
      data: r,
    };
  } catch (e) {
    return importError(e);
  }
}

// -----------------------------------------------------------------------------
// Xác nhận / Loại / Khôi phục
// -----------------------------------------------------------------------------
export async function confirmDraftsAction(_p: ActionState<ConfirmResult>, fd: FormData): Promise<ActionState<ConfirmResult>> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  const p = readIds(fd);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    const r = await confirmDrafts(p.data, g.user.id);
    done();
    const extra = repriceMessage(r.reprice);
    return {
      ok: true,
      message: `Đã chuyển ${r.confirmed} đơn sang Vận đơn${r.duplicates.length ? `; ${r.duplicates.length} đơn đã có vận đơn từ trước` : ""}${extra ? `; ${extra}` : ""}.`,
      data: r,
    };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không xác nhận được đơn.") };
  }
}

export async function rejectDraftsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  const p = readIds(fd);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const reason = String(fd.get("reason") ?? "").trim() || null;
  try {
    const n = await rejectDrafts(p.data, reason, g.user.id);
    done();
    return { ok: true, message: `Đã loại ${n} đơn. Đơn đã loại không bị đồng bộ lại.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không loại được đơn.") };
  }
}

export async function restoreDraftsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("drafts.manage");
  if (!g.ok) return g;
  const p = readIds(fd);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  try {
    const n = await restoreDrafts(p.data);
    done();
    return { ok: true, message: `Đã đưa ${n} đơn về “Chờ xác nhận”.` };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e, "Không khôi phục được đơn.") };
  }
}
