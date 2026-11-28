import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePortal } from "@/lib/portal/session";
import { ChangePasswordForm } from "./password-form";

export const metadata = { title: "Đổi mật khẩu — Cổng khách hàng SkyLane" };

export default async function ChangePasswordPage() {
  const s = await requirePortal({ allowMustChange: true });
  if (s.viewAs) redirect("/portal");
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="SkyLane Logistics" width={56} height={53} priority />
          <h1 className="text-lg font-semibold">{s.mustChangePassword ? "Đặt mật khẩu mới" : "Đổi mật khẩu"}</h1>
          <p className="text-sm text-muted-foreground">
            {s.mustChangePassword
              ? "Đây là lần đăng nhập đầu tiên — vui lòng đổi mật khẩu mặc định để bảo vệ tài khoản."
              : `${s.customerCode} · ${s.email}`}
          </p>
        </div>
        <ChangePasswordForm firstTime={s.mustChangePassword} />
        {!s.mustChangePassword && (
          <Link href="/portal" className="mt-4 block text-center text-sm text-muted-foreground hover:underline">
            ← Quay lại
          </Link>
        )}
      </div>
    </main>
  );
}
