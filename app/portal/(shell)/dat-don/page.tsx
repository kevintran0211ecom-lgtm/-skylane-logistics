import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { portalRoutes } from "@/lib/portal/queries";
import { PortalOrderForm } from "./order-form";

export const metadata = { title: "Đặt đơn — Cổng khách hàng SkyLane" };

export default async function PlaceOrderPage() {
  const s = await requirePortal();
  const routes = await portalRoutes(s.customerCode, s.priceGroupCode);
  return (
    <>
      <PageHeader
        title="Đặt đơn"
        description="Đơn gửi đi sẽ ở trạng thái “Chờ xác nhận” cho tới khi SkyLane kiểm tra và xác nhận. Bạn sửa được đơn khi còn chờ xác nhận hoặc ở trạng thái Phát sinh."
      />
      {routes.length === 0 && (
        <Alert tone="warning" className="mb-4">
          Tài khoản chưa có tuyến nào được báo giá — vui lòng liên hệ SkyLane.
        </Alert>
      )}
      <Card className="p-4 md:p-6">
        <PortalOrderForm routes={routes} readOnly={s.viewAs ? "Bạn đang xem cổng với tư cách khách hàng — không gửi đơn được." : false} />
      </Card>
      <p className="mt-3 text-sm text-muted-foreground">
        Nhiều đơn cùng lúc?{" "}
        <Link href="/portal/nhap-excel" className="text-primary hover:underline">
          Nhập bằng file Excel
        </Link>
        .
      </p>
    </>
  );
}
