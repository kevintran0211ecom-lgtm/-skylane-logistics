import { PageHeader } from "@/components/ui/misc";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listDrafts, type DraftStatus } from "@/lib/orders/drafts-service";
import { listActiveRoutes, listOrderCustomers } from "@/lib/orders/queries";
import { DraftsView } from "./drafts-view";

export const metadata = { title: "Đơn hàng dự báo — SkyLane" };
const PAGE_SIZE = 50;
const STATUSES: DraftStatus[] = ["CHO_XAC_NHAN", "DA_XAC_NHAN", "DA_LOAI"];

export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; kh?: string; page?: string }> }) {
  const user = await requirePage("drafts.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = STATUSES.includes(sp.status as DraftStatus) ? (sp.status as DraftStatus) : "CHO_XAC_NHAN";
  const customerCode = sp.kh?.trim().toUpperCase() || undefined;
  const [list, routes, customers] = await Promise.all([
    listDrafts({ status, q: sp.q, customerCode, saleUserId: user.saleScope, page, pageSize: PAGE_SIZE }),
    listActiveRoutes(),
    listOrderCustomers(user.saleScope),
  ]);
  return (
    <>
      <PageHeader
        title="Đơn hàng dự báo"
        description="Đơn khách nhập trên Google Sheet, file Excel hoặc nhập tay nội bộ vào đây trước. Kiểm tra, chọn đơn rồi bấm Xác nhận để chuyển sang Vận đơn."
      />
      <DraftsView
        {...list}
        status={status}
        q={sp.q ?? ""}
        customerCode={customerCode ?? ""}
        page={page}
        pageSize={PAGE_SIZE}
        routes={routes}
        customers={customers.map((c) => ({ code: c.code, name: c.name, hasSync: !!c.syncConfig?.url }))}
        canManage={can(user.role, "drafts.manage")}
      />
    </>
  );
}
