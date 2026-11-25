"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { appUsers } from "@/drizzle/schema";
import { authAdmin, supabaseServer } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/db/errors";
import type { ActionState } from "@/lib/action-state";
import { guard } from "./session";

export async function signIn(_p: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Nhập email và mật khẩu." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message === "Invalid login credentials" ? "Email hoặc mật khẩu không đúng." : error.message };
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

// =============================================================================
// Quản lý người dùng (Admin)
// =============================================================================
const userSchema = z.object({
  mode: z.enum(["create", "edit"]),
  id: z.string().optional(),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Email không hợp lệ")),
  fullName: z.string().trim().min(1, "Nhập họ tên"),
  role: z.enum(["ADMIN", "KE_TOAN", "SALE", "KHO"], { error: "Chọn vai trò" }),
  password: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function saveUser(_p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("users.manage");
  if (!g.ok) return g;
  const parsed = userSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    if (d.mode === "create") {
      if (!d.password || d.password.length < 8) return { ok: false, error: "Mật khẩu tạm tối thiểu 8 ký tự." };
      const created = await authAdmin("users", {
        method: "POST",
        body: { email: d.email, password: d.password, email_confirm: true, user_metadata: { full_name: d.fullName } },
      });
      try {
        await db.insert(appUsers).values({ id: created.id!, email: d.email, fullName: d.fullName, role: d.role, isActive: d.isActive });
      } catch (e) {
        await authAdmin(`users/${created.id}`, { method: "DELETE" }).catch(() => undefined);
        throw e;
      }
    } else {
      if (!d.id) return { ok: false, error: "Thiếu mã người dùng." };
      if (d.id === g.user.id && (d.role !== "ADMIN" || !d.isActive)) return { ok: false, error: "Không thể tự hạ quyền hoặc khóa chính mình." };
      await db.update(appUsers).set({ fullName: d.fullName, role: d.role, isActive: d.isActive }).where(eq(appUsers.id, d.id));
      if (d.password) {
        if (d.password.length < 8) return { ok: false, error: "Mật khẩu mới tối thiểu 8 ký tự." };
        await authAdmin(`users/${d.id}`, { method: "PUT", body: { password: d.password } });
      }
      await authAdmin(`users/${d.id}`, { method: "PUT", body: { ban_duration: d.isActive ? "none" : "876000h" } });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error && !("code" in e) ? e.message : dbErrorMessage(e) };
  }
  revalidatePath("/nguoi-dung");
  return { ok: true, message: d.mode === "create" ? `Đã tạo tài khoản ${d.email}.` : `Đã cập nhật ${d.email}.` };
}
