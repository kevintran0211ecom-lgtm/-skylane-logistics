import { PageHeader } from "@/components/ui/misc";
import { listPriceGroupsDetail } from "@/lib/catalog/queries";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { PriceGroupsView } from "./price-groups-view";

export const metadata = { title: "Nhóm giá — SkyLane" };

export default async function PriceGroupsPage() {
  const user = await requirePage("catalog.view");
  const rows = await listPriceGroupsDetail();
  return (
    <>
      <PageHeader
        title="Nhóm giá"
        description="Mỗi nhóm khai báo % so với bảng giá chung. Tuyến nào nhóm có bảng giá bán riêng (nhập ở Kho bảng giá) thì dùng bảng riêng, không cộng %."
      />
      <PriceGroupsView rows={rows} canManage={can(user.role, "catalog.manage")} canPricing={can(user.role, "pricing.manage")} />
    </>
  );
}
