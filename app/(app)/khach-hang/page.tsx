import { PageHeader } from "@/components/ui/misc";
import { SearchForm } from "@/components/search-form";
import { listCustomers, listPriceGroups, listSaleUsers } from "@/lib/catalog/queries";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { CustomersView } from "./customers-view";

export const metadata = { title: "Khách hàng — SkyLane" };
const PAGE_SIZE = 50;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requirePage("catalog.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total }, groups, users] = await Promise.all([
    listCustomers({ q: sp.q, page, pageSize: PAGE_SIZE }),
    listPriceGroups(),
    listSaleUsers(),
  ]);
  return (
    <>
      <PageHeader title="Khách hàng" description="Mã KH, sale phụ trách, nhóm giá mặc định, % điều chỉnh giá và nguồn đồng bộ đơn." />
      <SearchForm q={sp.q} placeholder="Tìm theo mã hoặc tên khách hàng" />
      <CustomersView rows={rows} total={total} page={page} pageSize={PAGE_SIZE} groups={groups} users={users} canManage={can(user.role, "catalog.manage")} />
    </>
  );
}
