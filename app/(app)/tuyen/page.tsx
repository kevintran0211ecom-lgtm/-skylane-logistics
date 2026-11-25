import { PageHeader } from "@/components/ui/misc";
import { listRoutes, listSuppliers } from "@/lib/catalog/queries";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { RoutesView } from "./routes-view";

export const metadata = { title: "Tuyến vận chuyển — SkyLane" };

export default async function RoutesPage() {
  const user = await requirePage("catalog.view");
  const [rows, suppliers] = await Promise.all([listRoutes(), listSuppliers()]);
  return (
    <>
      <PageHeader
        title="Tuyến vận chuyển"
        description="Loại hình dịch vụ quyết định quy tắc làm tròn; cách tính cân & hệ số DIM quyết định cân quy đổi."
      />
      <RoutesView rows={rows} suppliers={suppliers} canManage={can(user.role, "catalog.manage")} />
    </>
  );
}
