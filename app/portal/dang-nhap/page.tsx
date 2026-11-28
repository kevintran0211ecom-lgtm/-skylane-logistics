import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/session";
import { PortalLoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập — Cổng khách hàng SkyLane" };

export default async function PortalLoginPage() {
  const s = await getPortalSession();
  if (s && !s.viewAs) redirect(s.mustChangePassword ? "/portal/doi-mat-khau" : "/portal");
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Image src="/logo.png" alt="SkyLane Logistics" width={72} height={68} priority />
          <h1 className="text-lg font-semibold">Cổng khách hàng SkyLane</h1>
          <p className="text-sm text-muted-foreground">Đặt đơn, theo dõi vận đơn và công nợ</p>
        </div>
        <PortalLoginForm />
        <p className="mt-4 text-center text-xs text-muted-foreground">Chưa có tài khoản hoặc quên mật khẩu? Liên hệ nhân viên SkyLane phụ trách để được cấp lại.</p>
      </div>
    </main>
  );
}
