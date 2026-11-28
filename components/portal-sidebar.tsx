"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeDollarSign, FileSpreadsheet, KeyRound, LayoutDashboard, LogOut, Package, PlusSquare, Upload } from "lucide-react";
import { portalSignOut } from "@/lib/portal/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/portal", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/portal/dat-don", label: "Đặt đơn", icon: PlusSquare },
  { href: "/portal/nhap-excel", label: "Nhập đơn bằng Excel", icon: Upload },
  { href: "/portal/van-don", label: "Vận đơn", icon: Package },
  { href: "/portal/tra-gia", label: "Tra cứu giá", icon: BadgeDollarSign },
  { href: "/portal/cong-no", label: "Công nợ & bảng kê", icon: FileSpreadsheet },
];

export function PortalSidebar({ customerCode, customerName, email, viewAs }: { customerCode: string; customerName: string; email: string; viewAs: boolean }) {
  const pathname = usePathname();
  const link = (href: string, active: boolean) => cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent", active && "bg-primary/10 font-medium text-primary");
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
      <Link href="/portal" className="flex items-center gap-2 px-4 py-4">
        <Image src="/logo.png" alt="SkyLane Logistics" width={40} height={38} priority />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide text-primary">SKYLANE</p>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground">CỔNG KHÁCH HÀNG</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map((it) => {
          const active = it.href === "/portal" ? pathname === "/portal" : pathname === it.href || pathname.startsWith(`${it.href}/`);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={link(it.href, active)}>
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <p className="truncate text-sm font-medium">
          {customerCode} — {customerName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
        {!viewAs && (
          <Link href="/portal/doi-mat-khau" className={cn(link("", pathname === "/portal/doi-mat-khau"), "mt-2 text-muted-foreground")}>
            <KeyRound className="size-4" /> Đổi mật khẩu
          </Link>
        )}
        <form action={portalSignOut}>
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            <LogOut className="size-4" /> {viewAs ? "Thoát chế độ xem" : "Đăng xuất"}
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Menu ngang cho màn hình nhỏ */
export function PortalMobileNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto md:hidden">
      {NAV.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn("whitespace-nowrap rounded-md border px-2.5 py-1 text-sm", pathname === it.href && "border-primary bg-primary/10 text-primary")}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
