import { PageHeader } from "@/components/ui/misc";
import { listActiveRoutes, listOrderCustomers, listOrders } from "@/lib/orders/queries";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/schemas";
import { OrdersView } from "./orders-view";
import { requirePage } from "@/lib/auth/session";
import { BULK_FIELDS_BY_ROLE, can } from "@/lib/auth/permissions";

export const metadata = { title: "Quản lý vận đơn — SkyLane" };
const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requirePage("orders.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as OrderStatus) : undefined;
  const [{ rows, total, counts }, routes, customers] = await Promise.all([
    listOrders({ q: sp.q, status, page, pageSize: PAGE_SIZE, saleUserId: user.saleScope }),
    listActiveRoutes(),
    listOrderCustomers(user.saleScope),
  ]);
  // Kho: loại bỏ tiền ngay ở server — không gửi xuống trình duyệt
  const showMoney = can(user.role, "orders.viewMoney");
  const safeRows = showMoney ? rows : rows.map((r) => ({ ...r, sellAmount: "", costAmount: "", profit: "" }));
  const perms = {
    showMoney,
    create: can(user.role, "orders.create"),
    import: can(user.role, "orders.import"),
    bulkFields: [...BULK_FIELDS_BY_ROLE[user.role]],
    editPackages: can(user.role, "orders.editPackages"),
    editLocked: can(user.role, "orders.editLocked"),
  };
  return (
    <>
      <PageHeader title="Quản lý vận đơn" description="Đơn chưa khóa giá được tính lại giá gốc, giá bán và lợi nhuận ngay khi đổi kích thước, cân nặng hoặc tuyến." />
      <OrdersView
        rows={safeRows}
        perms={perms}
        total={total}
        counts={counts}
        page={page}
        pageSize={PAGE_SIZE}
        q={sp.q ?? ""}
        status={status}
        routes={routes}
        customers={customers.map((c) => ({ code: c.code, name: c.name, hasSync: !!c.syncConfig?.url }))}
      />
    </>
  );
}
