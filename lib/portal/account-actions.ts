"use server";
/** Nội bộ: quản lý tài khoản cổng khách hàng (Admin / Kế toán) */
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appUsers, customerAccounts, customers } from "@/drizzle/schema";
import { authAdmin } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db/errors";
import type { ActionState } from "@/lib/action-state";
import { guard } from "@/lib/auth/session";
import { DEFAULT_PASSWORD, isEmail, normEmail } from "./rules";

export interface CustomerAccountRow {
  id: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export async function listCustomerAccountsAction(customerCode: string): Promise<{ ok: true; rows: CustomerAccountRow[] } | { ok: false; error: string }> {
  const g = await guard("portal.accounts");
  if (!g.ok) return g;
  const rows = await db
    .select({
      id: customerAccounts.id,
      email: customerAccounts.email,
      isActive: customerAccounts.isActive,
      mustChangePassword: customerAccounts.mustChangePassword,
      lastLoginAt: customerAccounts.lastLoginAt,
      createdAt: customerAccounts.createdAt,
    })
    .from(customerAccounts)
    .where(eq(customerAccounts.customerCode, customerCode))
    .orderBy(asc(customerAccounts.email));
  return { ok: true, rows: rows.map((r) => ({ ...r, lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : null, createdAt: String(r.createdAt) })) };
}

const errMsg = (e: unknown) => (e instanceof Error && !("code" in e) ? e.message : dbErrorMessage(e));

/** Tạo tài khoản: tên đăng nhập = email khách cung cấp, mật khẩu mặc định 123456 (bắt đổi ở lần đăng nhập đầu) */
export async function createCustomerAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("portal.accounts");
  if (!g.ok) return g;
  const customerCode = String(fd.get("customerCode") ?? "").trim().toUpperCase();
  const email = normEmail(String(fd.get("email") ?? ""));
  if (!isEmail(email)) return { ok: false, error: "Email không hợp lệ.", fieldErrors: { email: "Email không hợp lệ" } };
  const [[c], [staff], [dup]] = await Promise.all([
    db.select({ code: customers.customerCode }).from(customers).where(eq(customers.customerCode, customerCode)),
    db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.email, email)),
    db.select({ code: customerAccounts.customerCode }).from(customerAccounts).where(eq(customerAccounts.email, email)),
  ]);
  if (!c) return { ok: false, error: `Không có khách hàng ${customerCode}.` };
  if (staff) return { ok: false, error: "Email này đang là tài khoản nhân viên SkyLane — dùng email khác cho khách." };
  if (dup) return { ok: false, error: `Email này đã là tài khoản của khách ${dup.code}.` };
  try {
    const created = await authAdmin("users", {
      method: "POST",
      body: { email, password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: { customer_code: customerCode, portal: true } },
    });
    try {
      await db.insert(customerAccounts).values({ id: created.id!, customerCode, email, createdBy: g.user.id });
    } catch (e) {
      await authAdmin(`users/${created.id}`, { method: "DELETE" }).catch(() => undefined);
      throw e;
    }
  } catch (e) {
    const m = errMsg(e);
    return { ok: false, error: /already been registered|already exists/i.test(m) ? "Email này đã có tài khoản đăng nhập Supabase — liên hệ Admin để xử lý." : m };
  }
  revalidatePath("/khach-hang");
  return { ok: true, message: `Đã tạo tài khoản ${email} — mật khẩu mặc định ${DEFAULT_PASSWORD}, khách sẽ phải đổi ở lần đăng nhập đầu.` };
}

/** Đặt lại mật khẩu về 123456 (bắt đổi lại) hoặc khóa / mở khóa */
export async function updateCustomerAccount(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("portal.accounts");
  if (!g.ok) return g;
  const id = String(fd.get("id") ?? "");
  const op = String(fd.get("op") ?? "");
  const [acc] = await db.select({ email: customerAccounts.email }).from(customerAccounts).where(eq(customerAccounts.id, id));
  if (!acc) return { ok: false, error: "Không tìm thấy tài khoản." };
  try {
    if (op === "reset") {
      await authAdmin(`users/${id}`, { method: "PUT", body: { password: DEFAULT_PASSWORD } });
      await db.update(customerAccounts).set({ mustChangePassword: true }).where(eq(customerAccounts.id, id));
    } else if (op === "lock" || op === "unlock") {
      await authAdmin(`users/${id}`, { method: "PUT", body: { ban_duration: op === "lock" ? "876000h" : "none" } });
      await db.update(customerAccounts).set({ isActive: op === "unlock" }).where(and(eq(customerAccounts.id, id)));
    } else return { ok: false, error: "Thao tác không hợp lệ." };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
  revalidatePath("/khach-hang");
  return {
    ok: true,
    message:
      op === "reset" ? `Đã đặt lại mật khẩu ${acc.email} về ${DEFAULT_PASSWORD}.` : op === "lock" ? `Đã khóa tài khoản ${acc.email}.` : `Đã mở khóa tài khoản ${acc.email}.`,
  };
}
