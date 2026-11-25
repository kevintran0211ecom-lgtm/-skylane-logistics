"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, FileSpreadsheet, Inbox, LayoutDashboard, LogOut, Package, Receipt, Route, Scale, ShieldCheck, Tags, Users } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { can, ROLE_LABEL, ROUTE_PERMISSION, type Role } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

const NAV = [
  {
    group: "Vận hành",
    items: [
      { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
      { href: "/don-du-bao", label: "Đơn hàng dự báo", icon: Inbox },
      { href: "/don-hang", label: "Vận đơn", icon: Package },
      { href: "/bao-gia", label: "Tra cứu giá gốc", icon: Scale },
    ],
  },
  {
    group: "Tài chính",
    items: [
      { href: "/bang-ke", label: "Bảng kê", icon: FileSpreadsheet },
      { href: "/doi-soat", label: "Đối soát thu tiền", icon: Receipt },
    ],
  },
  {
    group: "Danh mục",
    items: [
      { href: "/khach-hang", label: "Khách hàng", icon: Users },
      { href: "/nhom-gia", label: "Nhóm giá", icon: Tags },
      { href: "/tuyen", label: "Tuyến vận chuyển", icon: Route },
      { href: "/bang-gia", label: "Kho bảng giá", icon: BookOpenText },
      { href: "/nguoi-dung", label: "Người dùng & quyền", icon: ShieldCheck },
    ],
  },
];

export function AppSidebar({ user }: { user: { fullName: string; email: string; role: Role } }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
      <Link href="/" className="flex items-center gap-2 px-4 py-4">
        <Image src="/logo.png" alt="SkyLane Logistics" width={40} height={38} priority />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide text-primary">SKYLANE</p>
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground">LOGISTICS</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV.map((g) => {
          const items = g.items.filter((it) => can(user.role, ROUTE_PERMISSION[it.href]));
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.group}</p>
              {items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent", active && "bg-primary/10 font-medium text-primary")}
                  >
                    <Icon className="size-4" />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-3">
        <p className="truncate text-sm font-medium">{user.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ROLE_LABEL[user.role]} · {user.email}
        </p>
        <form action={signOut} className="mt-2">
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}
