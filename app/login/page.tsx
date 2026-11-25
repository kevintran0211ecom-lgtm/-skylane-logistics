import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập — SkyLane" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/logo.png" alt="SkyLane Logistics" width={72} height={68} priority />
          <h1 className="text-lg font-semibold">Đăng nhập hệ thống</h1>
          <p className="text-sm text-muted-foreground">Quản lý vận hành & tài chính SkyLane</p>
        </div>
        <LoginForm next={next ?? ""} />
      </div>
    </main>
  );
}
