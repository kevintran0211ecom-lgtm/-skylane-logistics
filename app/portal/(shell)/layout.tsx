import { Eye } from "lucide-react";
import { PortalMobileNav, PortalSidebar } from "@/components/portal-sidebar";
import { requirePortal } from "@/lib/portal/session";
import { portalSignOut } from "@/lib/portal/actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePortal();
  return (
    <div className="flex min-h-screen bg-muted/30">
      <PortalSidebar customerCode={s.customerCode} customerName={s.customerName} email={s.email} viewAs={!!s.viewAs} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
        {s.viewAs && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="flex items-center gap-2">
              <Eye className="size-4" /> {s.viewAs.staffName} đang xem cổng với tư cách khách <b>{s.customerCode}</b> — chỉ xem, không đặt / sửa đơn được.
            </span>
            <form action={portalSignOut}>
              <button type="submit" className="rounded-md border border-amber-400 px-2 py-0.5 text-xs hover:bg-amber-100 dark:hover:bg-amber-900">
                Thoát chế độ xem
              </button>
            </form>
          </div>
        )}
        <PortalMobileNav />
        {children}
      </main>
    </div>
  );
}
