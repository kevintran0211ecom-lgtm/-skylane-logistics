import Link from "next/link";
import { ArrowRight, PlusSquare, Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { portalDashboard } from "@/lib/portal/queries";
import { ORDER_STATUSES } from "@/lib/orders/status";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";
import { PORTAL_STATUS_TONE } from "./status-tone";

export const metadata = { title: "Tổng quan — Cổng khách hàng SkyLane" };

export default async function PortalHome() {
  const s = await requirePortal();
  const d = await portalDashboard(s.customerCode);
  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode, href?: string) => {
    const body = (
      <Card className={cn("h-full p-4", href && "transition-colors hover:border-primary/50")}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </Card>
    );
    return href ? <Link href={href}>{body}</Link> : body;
  };
  return (
    <>
      <PageHeader
        title={`Xin chào, ${s.customerName}`}
        description={`Mã khách hàng ${s.customerCode}`}
        actions={
          <div className="flex gap-2">
            <Link href="/portal/nhap-excel" className={buttonVariants({ variant: "outline" })}>
              <Upload /> Nhập Excel
            </Link>
            <Link href="/portal/dat-don" className={buttonVariants()}>
              <PlusSquare /> Đặt đơn
            </Link>
          </div>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Công nợ còn lại", `${formatMoney(d.debt.total)} đ`, `Bảng kê còn nợ ${formatMoney(d.debt.billed)} · chưa lên bảng kê ${formatMoney(d.debt.unbilled)}`, "/portal/cong-no")}
        {stat("Đơn chờ SkyLane xác nhận", d.pendingDrafts.toLocaleString("vi-VN"), "Đơn bạn đã gửi, chưa được xác nhận", "/portal/van-don?tab=CHO_XAC_NHAN")}
        {stat("Đơn tháng này", d.month.orders.toLocaleString("vi-VN"), `${formatKg(d.month.weight)} kg tính phí · ${formatMoney(d.month.amount)} đ`)}
        {stat("Tổng vận đơn", d.totalOrders.toLocaleString("vi-VN"), "Tất cả vận đơn đã xác nhận", "/portal/van-don")}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="p-4">
          <p className="mb-2 font-medium">Vận đơn theo trạng thái</p>
          <ul className="grid gap-1.5 text-sm">
            {ORDER_STATUSES.map((st) => (
              <li key={st}>
                <Link href={`/portal/van-don?tab=${encodeURIComponent(st)}`} className="flex items-center justify-between rounded-md px-1 py-0.5 hover:bg-accent">
                  <Badge tone={PORTAL_STATUS_TONE[st]}>{st}</Badge>
                  <span className="font-medium tabular-nums">{(d.byStatus[st] ?? 0).toLocaleString("vi-VN")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Vận đơn gần đây</p>
            <Link href="/portal/van-don" className="flex items-center gap-1 text-sm text-primary hover:underline">
              Xem tất cả <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Mã vận đơn</TH>
                <TH>Tuyến</TH>
                <TH>Điểm đến</TH>
                <TH>Trạng thái</TH>
                <TH>Ngày gửi</TH>
                <TH className="text-right">Cân tính phí</TH>
                <TH className="text-right">Thành tiền</TH>
              </TR>
            </THead>
            <TBody>
              {d.recent.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium">{o.billCode}</TD>
                  <TD>{o.routeCode}</TD>
                  <TD>{o.destinationIso2}</TD>
                  <TD>
                    <Badge tone={PORTAL_STATUS_TONE[o.status]}>{o.status}</Badge>
                  </TD>
                  <TD className="tabular-nums">{viDate(o.pricingDate)}</TD>
                  <TD className="text-right tabular-nums">{formatKg(o.billedWeight)} kg</TD>
                  <TD className="text-right font-medium tabular-nums">{formatMoney(o.totalAmount)}</TD>
                </TR>
              ))}
              {d.recent.length === 0 && (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                    Chưa có vận đơn. Bấm “Đặt đơn” để gửi đơn đầu tiên.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </div>
    </>
  );
}
