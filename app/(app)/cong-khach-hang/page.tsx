import { PageHeader } from "@/components/ui/misc";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { listPortalCustomers } from "@/lib/portal/queries";
import { PortalCustomersView } from "./portal-customers-view";

export const metadata = { title: "Cổng khách hàng — SkyLane" };

export default async function PortalAdminPage() {
  const user = await requirePage("portal.viewAs");
  const rows = await listPortalCustomers(user.saleScope);
  return (
    <>
      <PageHeader
        title="Cổng khách hàng"
        description="Cấp tài khoản cho khách đăng nhập cổng khách hàng (tên đăng nhập = email khách, mật khẩu mặc định 123456 — khách phải đổi ở lần đăng nhập đầu). “Xem như khách” để mở cổng đúng như khách thấy (chỉ xem)."
      />
      <PortalCustomersView rows={rows} canManage={can(user.role, "portal.accounts")} portalUrl={process.env.PORTAL_HOST ? `https://${process.env.PORTAL_HOST}` : null} />
    </>
  );
}
