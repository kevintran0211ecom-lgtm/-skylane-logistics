import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client phía server (Server Component / Server Action / Route Handler), phiên lưu trong cookie */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component không ghi được cookie — middleware đã làm mới phiên
        }
      },
    },
  });
}

/** Gọi Supabase Auth Admin API bằng service role (tạo / cập nhật tài khoản đăng nhập) */
export async function authAdmin(path: string, init: { method: string; body?: unknown }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY để quản lý tài khoản.");
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; msg?: string; message?: string; error_description?: string };
  if (!res.ok) throw new Error(json.msg ?? json.message ?? json.error_description ?? `Lỗi Supabase Auth (${res.status})`);
  return json;
}
