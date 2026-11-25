import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appUsers } from "@/drizzle/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { can, isScopedToOwnCustomers, type Permission, type Role } from "./permissions";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** SALE: chỉ thấy khách hàng có sale_user_id = id này; vai trò khác: null (thấy tất cả) */
  saleScope: string | null;
}

export class ForbiddenError extends Error {
  constructor(message = "Bạn không có quyền thực hiện thao tác này.") {
    super(message);
  }
}

/**
 * Người dùng hiện tại = tài khoản Supabase Auth + hồ sơ app_users (vai trò).
 * Khởi tạo: nếu bảng app_users còn trống, người đăng nhập đầu tiên được cấp ADMIN.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  let [profile] = await db.select().from(appUsers).where(eq(appUsers.id, user.id));
  if (!profile) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(appUsers);
    if (n === 0) {
      [profile] = await db
        .insert(appUsers)
        .values({ id: user.id, email: user.email.toLowerCase(), fullName: user.email.split("@")[0], role: "ADMIN" })
        .onConflictDoNothing()
        .returning();
    }
  }
  if (!profile || !profile.isActive) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    saleScope: isScopedToOwnCustomers(profile.role) ? profile.id : null,
  };
});

/** Trang: bắt buộc đăng nhập + có quyền, không thì chuyển hướng */
export async function requirePage(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/khong-co-quyen?reason=account");
  if (permission && !can(user.role, permission)) redirect("/khong-co-quyen");
  return user;
}

/** Server action / API: ném ForbiddenError nếu thiếu quyền */
export async function authorize(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ForbiddenError("Phiên đăng nhập hết hạn hoặc tài khoản chưa được cấp quyền.");
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}

/** Dùng đầu server action: trả lỗi dạng ActionState thay vì ném */
export async function guard(permission: Permission): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  try {
    return { ok: true, user: await authorize(permission) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Không có quyền." };
  }
}
