import { PageHeader } from "@/components/ui/misc";
import { listActiveRoutes, listOrderCodes, listOrderCustomers, listOrders } from "@/lib/orders/queries";
import { countPendingDrafts } from "@/lib/orders/drafts-service";
import { parseOrderFilter } from "@/lib/orders/filters";
import { ORDER_EDIT_FIELDS_BY_ROLE } from "@/lib/orders/edit";
import { missingCodes, searchMode } from "@/lib/search";
import { OrdersView } from "./orders-view";
import { requirePage } from "@/lib/auth/session";
import { BULK_FIELDS_BY_ROLE, can } from "@/lib/auth/permissions";

export const metadata = { title: "Quản lý vận đơn — SkyLane" };
const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = parseOrderFilter(sp);
  const mode = searchMode(filter.q);
  const editFields = [...ORDER_EDIT_FIELDS_BY_ROLE[user.role]];
  const [{ rows, total, totals, counts }, routes, pendingDrafts, customers, found] = await Promise.all([
    listOrders({ ...filter, page, pageSize: PAGE_SIZE, saleUserId: user.saleScope }),
    listActiveRoutes(),
    can(user.role, "drafts.view") ? countPendingDrafts() : 0,
    editFields.includes("customerCode") ? listOrderCustomers(user.saleScope) : [],
    // Tìm nhiều mã: báo những mã không có trong hệ thống
    mode.kind === "codes" ? listOrderCodes({ q: filter.q, saleUserId: user.saleScope }, mode.codes.length * 2) : null,
  ]);
  const notFound = mode.kind === "codes" && found ? missingCodes(mode.codes, found.flatMap((f) => [f.billCode, f.trackingNumber])) : [];

  // Kho: loại bỏ tiền ngay ở server — không gửi xuống trình duyệt
  const showMoney = can(user.role, "orders.viewMoney");
  const safeRows = showMoney ? rows : rows.map((r) => ({ ...r, sellAmount: "", costAmount: "", profit: "" }));
  const safeTotals = showMoney ? totals : { ...totals, sellAmount: "0", costAmount: "0", profit: "0" };
  const perms = {
    showMoney,
    drafts: can(user.role, "drafts.view"),
    bulkFields: [...BULK_FIELDS_BY_ROLE[user.role]],
    editPackages: can(user.role, "orders.editPackages"),
    editLocked: can(user.role, "orders.editLocked"),
    editFields,
  };
  return (
    <>
      <PageHeader title="Quản lý vận đơn" description="Bấm vào mã vận đơn để xem & sửa đầy đủ. Đơn chưa khóa giá được tính lại giá ngay khi đổi kích thước, cân nặng hoặc tuyến." />
      <OrdersView
        rows={safeRows}
        perms={perms}
        total={total}
        totals={safeTotals}
        counts={counts}
        page={page}
        pageSize={PAGE_SIZE}
        filter={filter}
        notFound={notFound}
        routes={routes}
        customers={customers.map((c) => ({ code: c.code, name: c.name, hasSync: false }))}
        pendingDrafts={pendingDrafts}
      />
    </>
  );
}
