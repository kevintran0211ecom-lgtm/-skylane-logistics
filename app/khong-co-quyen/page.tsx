import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

export const metadata = { title: "Không có quyền — SkyLane" };

export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const account = reason === "account";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <ShieldX className="mx-auto mb-3 size-10 text-destructive" />
        <h1 className="mb-2 text-lg font-semibold">{account ? "Tài khoản chưa được cấp quyền" : "Bạn không có quyền truy cập trang này"}</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          {account
            ? "Tài khoản đăng nhập chưa có vai trò trong hệ thống hoặc đã bị khóa. Liên hệ Quản trị để được cấp quyền."
            : "Vai trò hiện tại không được phép xem nội dung này."}
        </p>
        <div className="flex justify-center gap-2">
          {!account && (
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Về trang chủ
            </Link>
          )}
          <form action={signOut}>
            <button type="submit" className={buttonVariants()}>
              Đăng xuất
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
