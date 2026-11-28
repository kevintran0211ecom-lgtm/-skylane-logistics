"use server";
/** Server actions — CỔNG KHÁCH HÀNG */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts, customers, orderDrafts, orderPackages, orders, routes } from "@/drizzle/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db/errors";
import { formToObject, type ActionState } from "@/lib/action-state";
import { authorize } from "@/lib/auth/session";
import { stageDrafts, rejectDrafts, type StageResult } from "@/lib/orders/drafts-service";
import { OrderImportError, previewOrderImport, readOrderImportForm, stageOrderImport, type OrderImportPreview } from "@/lib/orders/import-service";
import { repriceOrders } from "@/lib/orders/reprice";
import { canCustomerEditOrder, normEmail, parsePortalOrder, portalFormValues, toDraftData, validateNewPassword } from "./rules";
import { getPortalOrder } from "./queries";
import { getPortalSession, portalGuard, VIEW_AS_COOKIE } from "./session";

const refresh = () => {
  revalidatePath("/portal", "layout");
  revalidatePath("/don-du-bao");
  revalidatePath("/don-hang");
};

// =============================================================================
// Đăng nhập / đăng xuất / đổi mật khẩu
// =============================================================================
export async function portalSignIn(_p: ActionState, fd: FormData): Promise<ActionState> {
  const email = normEmail(String(fd.get("email") ?? ""));
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Nhập email và mật khẩu." };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: error?.message === "Invalid login credentials" || !data.user ? "Email hoặc mật khẩu không đúng." : error!.message };

  const [acc] = await db
    .select({ isActive: customerAccounts.isActive, mustChange: customerAccounts.mustChangePassword, customerActive: customers.isActive })
    .from(customerAccounts)
    .innerJoin(customers, eq(customers.customerCode, customerAccounts.customerCode))
    .where(eq(customerAccounts.id, data.user.id));
  if (!acc || !acc.isActive || !acc.customerActive) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: !acc ? "Email này không phải tài khoản khách hàng. Nhân viên SkyLane vui lòng đăng nhập hệ thống nội bộ." : "Tài khoản đã bị khóa — vui lòng liên hệ SkyLane.",
    };
  }
  await db.update(customerAccounts).set({ lastLoginAt: new Date().toISOString() }).where(eq(customerAccounts.id, data.user.id));
  redirect(acc.mustChange ? "/portal/doi-mat-khau" : "/portal");
}

export async function portalSignOut() {
  const store = await cookies();
  if (store.get(VIEW_AS_COOKIE)) {
    // Nhân viên đang xem như khách → chỉ thoát chế độ xem, không đăng xuất hệ thống nội bộ
    store.delete(VIEW_AS_COOKIE);
    redirect("/khach-hang");
  }
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/portal/dang-nhap");
}

export async function changePortalPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getPortalSession();
  if (!s || !s.accountId) return { ok: false, error: s?.viewAs ? "Nhân viên không đổi mật khẩu thay khách được." : "Phiên đăng nhập hết hạn." };
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const bad = validateNewPassword(next, String(fd.get("confirm") ?? ""));
  if (bad) return { ok: false, error: bad, fieldErrors: { password: bad } };
  const supabase = await supabaseServer();
  const check = await supabase.auth.signInWithPassword({ email: s.email, password: current });
  if (check.error) return { ok: false, error: "Mật khẩu hiện tại không đúng.", fieldErrors: { current: "Mật khẩu hiện tại không đúng" } };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, error: `Không đổi được mật khẩu: ${error.message}` };
  await db.update(customerAccounts).set({ mustChangePassword: false }).where(eq(customerAccounts.id, s.accountId));
  if (s.mustChangePassword) redirect("/portal");
  return { ok: true, message: "Đã đổi mật khẩu." };
}

// =============================================================================
// Đặt đơn / sửa đơn / hủy đơn chờ xác nhận
// =============================================================================
async function routeOk(code: string) {
  const [r] = await db.select({ active: routes.isActive }).from(routes).where(eq(routes.routeCode, code));
  return !!r?.active;
}

/**
 * mode = "create" → thêm vào Đơn hàng dự báo (chờ SkyLane xác nhận)
 * mode = "draft"  → sửa đơn đang chờ xác nhận (id)
 * mode = "order"  → sửa vận đơn "Phát sinh" chưa khóa giá (id) — không đổi mã vận đơn; tính lại giá
 */
export async function savePortalOrder(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await portalGuard(true);
  if (!g.ok) return g;
  const s = g.s;
  const form = formToObject(fd);
  const mode = form.mode === "draft" || form.mode === "order" ? form.mode : "create";
  const id = Number(form.id);
  const parsed = parsePortalOrder(form);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  if (!(await routeOk(d.routeCode))) return { ok: false, error: `Tuyến ${d.routeCode} không còn hoạt động.`, fieldErrors: { routeCode: "Chọn tuyến khác" } };

  try {
    if (mode === "create") {
      const res: StageResult = await stageDrafts([toDraftData(s.customerCode, d)], {
        source: "PORTAL",
        label: `Cổng KH · ${s.email}`,
        userId: null,
        accountId: s.accountId,
      });
      if (!res.added) return { ok: false, error: `Mã vận đơn ${d.billCode} đã có trong hệ thống — vui lòng dùng mã khác.`, fieldErrors: { billCode: "Mã vận đơn đã tồn tại" } };
      refresh();
      return { ok: true, message: `Đã gửi đơn ${d.billCode} — SkyLane sẽ xác nhận và báo giá chính thức sau khi cân tại kho.` };
    }

    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Mã đơn không hợp lệ." };

    if (mode === "draft") {
      const [cur] = await db
        .select({ status: orderDrafts.status })
        .from(orderDrafts)
        .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerCode, s.customerCode)));
      if (!cur) return { ok: false, error: "Không tìm thấy đơn." };
      if (cur.status !== "CHO_XAC_NHAN") return { ok: false, error: "Đơn đã được SkyLane xử lý — không sửa được nữa." };
      const [dup] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderKey, `${s.customerCode}|${d.billCode}`));
      if (dup) return { ok: false, error: `Mã vận đơn ${d.billCode} đã có trong hệ thống.`, fieldErrors: { billCode: "Mã vận đơn đã tồn tại" } };
      const upd = await db
        .update(orderDrafts)
        .set({ billCode: d.billCode, data: toDraftData(s.customerCode, d) })
        .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerCode, s.customerCode), eq(orderDrafts.status, "CHO_XAC_NHAN")))
        .returning({ id: orderDrafts.id });
      if (!upd.length) return { ok: false, error: "Đơn vừa được SkyLane xử lý — không sửa được nữa." };
      refresh();
      return { ok: true, message: `Đã lưu đơn ${d.billCode}.` };
    }

    // mode === "order"
    await db.transaction(async (tx) => {
      const [o] = await tx
        .select({ billCode: orders.billCode, status: orders.status, priceLocked: orders.priceLocked })
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.customerCode, s.customerCode)))
        .for("update");
      if (!o) throw new PortalError("Không tìm thấy vận đơn.");
      if (!canCustomerEditOrder(o)) throw new PortalError("Vận đơn đã được SkyLane nhận kho / chốt giá — vui lòng liên hệ SkyLane nếu cần sửa.");
      if (o.billCode !== d.billCode) throw new PortalError("Không đổi được mã vận đơn của đơn đã xác nhận.");
      await tx
        .update(orders)
        .set({
          trackingNumber: d.trackingNumber,
          routeCode: d.routeCode,
          destinationIso2: d.destinationIso2,
          receiverName: d.receiverName,
          receiverPhone: d.receiverPhone,
          receiverEmail: d.receiverEmail,
          receiverAddress: d.receiverAddress,
          receiverCity: d.receiverCity,
          receiverState: d.receiverState,
          receiverPostalCode: d.receiverPostalCode,
          goodsDescription: d.goodsDescription,
          goodsNameEn: d.goodsNameEn,
          hsCode: d.hsCode,
          declaredValueUsd: d.declaredValueUsd,
          note: d.note,
        })
        .where(eq(orders.id, id));
      await tx.delete(orderPackages).where(eq(orderPackages.orderId, id));
      await tx.insert(orderPackages).values(d.packages.map((p, i) => ({ orderId: id, seq: i + 1, ...p })));
      await repriceOrders(tx, [id]);
    });
    refresh();
    return { ok: true, message: `Đã lưu vận đơn ${d.billCode} và tính lại thành tiền.` };
  } catch (e) {
    if (e instanceof PortalError) return { ok: false, error: e.message };
    return { ok: false, error: dbErrorMessage(e, "Không lưu được đơn.") };
  }
}
class PortalError extends Error {}

/** Mở 1 đơn để xem / sửa (đơn chờ xác nhận hoặc vận đơn của chính khách) */
export async function getPortalOrderAction(
  kind: "draft" | "order",
  id: number,
): Promise<{ ok: true; editable: boolean; values: Record<string, string>; packages: { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string }[] } | { ok: false; error: string }> {
  const g = await portalGuard(false);
  if (!g.ok) return g;
  const o = await getPortalOrder(g.s.customerCode, kind, id);
  if (!o) return { ok: false, error: "Không tìm thấy đơn." };
  const f = portalFormValues(o.data);
  return { ok: true, editable: o.editable && !g.s.viewAs, ...f };
}

export async function cancelPortalDraft(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await portalGuard(true);
  if (!g.ok) return g;
  const id = Number(fd.get("id"));
  const [d] = await db
    .select({ status: orderDrafts.status, billCode: orderDrafts.billCode })
    .from(orderDrafts)
    .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerCode, g.s.customerCode)));
  if (!d) return { ok: false, error: "Không tìm thấy đơn." };
  if (d.status !== "CHO_XAC_NHAN") return { ok: false, error: "Đơn đã được SkyLane xử lý — không hủy được." };
  await rejectDrafts([id], `Khách hủy trên cổng (${g.s.email})`, null);
  refresh();
  return { ok: true, message: `Đã hủy đơn ${d.billCode}.` };
}

// =============================================================================
// Nhập nhiều đơn bằng Excel (mẫu SKL116) — khóa theo mã khách của tài khoản
// =============================================================================
function portalImportForm(fd: FormData, customerCode: string) {
  fd.set("source", "FILE");
  fd.set("customerCode", customerCode);
  const r = readOrderImportForm(fd);
  return { ...r, options: { ...r.options, lockCustomer: true } };
}
const importError = (e: unknown) =>
  ({
    ok: false,
    error: e instanceof OrderImportError || (e instanceof Error && e.message.startsWith("Không đọc được file")) ? e.message : dbErrorMessage(e, "Không nhập được đơn."),
  }) as const;

export async function previewPortalImport(_p: ActionState<OrderImportPreview>, fd: FormData): Promise<ActionState<OrderImportPreview>> {
  const g = await portalGuard(false);
  if (!g.ok) return g;
  try {
    const { options, file } = portalImportForm(fd, g.s.customerCode);
    return { ok: true, data: await previewOrderImport(options, file) };
  } catch (e) {
    return importError(e);
  }
}

export async function importPortalOrders(_p: ActionState<StageResult>, fd: FormData): Promise<ActionState<StageResult>> {
  const g = await portalGuard(true);
  if (!g.ok) return g;
  try {
    const { options, file } = portalImportForm(fd, g.s.customerCode);
    const r = await stageOrderImport(options, file, null, { accountId: g.s.accountId, email: g.s.email });
    refresh();
    return { ok: true, message: `Đã gửi ${r.added} đơn — chờ SkyLane xác nhận${r.skipped ? `; bỏ qua ${r.skipped} đơn trùng mã` : ""}.`, data: r };
  } catch (e) {
    return importError(e);
  }
}

// =============================================================================
// Nội bộ: nhân viên "Xem như khách" (chỉ xem)
// =============================================================================
export async function startViewAs(customerCode: string) {
  const user = await authorize("portal.viewAs");
  const code = customerCode.trim().toUpperCase();
  const [c] = await db
    .select({ code: customers.customerCode })
    .from(customers)
    .where(and(eq(customers.customerCode, code), user.saleScope ? eq(customers.saleUserId, user.saleScope) : undefined));
  if (!c) throw new Error("Không tìm thấy khách hàng.");
  (await cookies()).set(VIEW_AS_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  redirect("/portal");
}
