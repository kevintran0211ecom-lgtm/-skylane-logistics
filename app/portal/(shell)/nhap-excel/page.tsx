import { Download } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { PortalImportForm } from "./import-form";

export const metadata = { title: "Nhập đơn bằng Excel — Cổng khách hàng SkyLane" };

export default async function PortalImportPage() {
  const s = await requirePortal();
  return (
    <>
      <PageHeader title="Nhập nhiều đơn bằng Excel" description="Tải file mẫu, điền mỗi dòng 1 kiện (đơn nhiều kiện: lặp lại mã vận đơn), rồi tải lên để kiểm tra và gửi." />
      <Card className="mb-4 flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
        <div className="max-w-3xl text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Cách dùng</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>Tải file mẫu (đã ghi sẵn mã khách {s.customerCode} và danh sách tuyến bạn được báo giá).</li>
            <li>
              Điền tab <b>DON</b>: Mã vận đơn, Tuyến vận chuyển, Điểm đến, Tên người nhận, SĐT, Địa chỉ, Thành phố, Mã bưu chính, Tên hàng, Giá trị khai báo, Số kiện, Trọng
              lượng, Dài, Rộng, Cao.
            </li>
            <li>Bấm “Kiểm tra dữ liệu” để xem lỗi trước, rồi “Gửi đơn cho SkyLane”. Đơn vào trạng thái Chờ xác nhận.</li>
          </ol>
        </div>
        <a href="/api/portal/mau-xlsx" className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-medium text-primary hover:bg-accent">
          <Download className="size-4" /> Tải file mẫu
        </a>
      </Card>
      <Card className="p-4 md:p-6">
        <PortalImportForm readOnly={!!s.viewAs} />
      </Card>
    </>
  );
}
