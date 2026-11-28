import { Download } from "lucide-react";
import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { listPortalStatements, portalDebt } from "@/lib/portal/queries";
import { listUnbilledOrders } from "@/lib/statements/service";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { PORTAL_STATUS_TONE } from "../status-tone";

export const metadata = { title: "Công nợ & bảng kê — Cổng khách hàng SkyLane" };
const DEBT_TONE: Record<string, "muted" | "info" | "warning" | "success"> = { "xuất bảng kê": "info", "Thanh toán 1 phần": "warning", "Đã thanh toán": "success", "Chưa thanh toán": "muted" };

export default async function PortalDebtPage() {
  const s = await requirePortal();
  const [debt, sts, unbilled] = await Promise.all([portalDebt(s.customerCode), listPortalStatements(s.customerCode), listUnbilledOrders({ customerCode: s.customerCode })]);
  const card = (label: string, value: number, sub: string, strong = false) => (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${strong ? "text-primary" : ""}`}>{formatMoney(value)} đ</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
  return (
    <>
      <PageHeader title="Công nợ & bảng kê" description="Bảng kê SkyLane đã chốt và các vận đơn chưa lên bảng kê. Chuyển khoản theo QR trên file bảng kê." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {card("Tổng công nợ còn lại", debt.total, "Bảng kê còn nợ + đơn chưa lên bảng kê", true)}
        {card("Bảng kê còn nợ", debt.billed, `${debt.billedStatements} bảng kê chưa thanh toán đủ`)}
        {card("Chưa lên bảng kê", debt.unbilled, `${debt.unbilledOrders} vận đơn — sẽ được tổng hợp vào bảng kê kỳ tới`)}
      </div>

      <h2 className="mb-2 font-semibold">Bảng kê đã chốt</h2>
      <Table className="mb-8">
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Mã bảng kê</TH>
            <TH>Tên</TH>
            <TH>Ngày lập</TH>
            <TH>Kỳ</TH>
            <TH className="text-right">Số đơn</TH>
            <TH className="text-right">Tổng tiền</TH>
            <TH className="text-right">Đã thanh toán</TH>
            <TH className="text-right">Còn nợ</TH>
            <TH>Trạng thái</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {sts.map((x) => (
            <TR key={x.id}>
              <TD className="font-medium">{x.statementNo}</TD>
              <TD className="max-w-56 truncate">{x.name}</TD>
              <TD className="tabular-nums">{viDate(String(x.issuedAt).slice(0, 10))}</TD>
              <TD className="whitespace-nowrap tabular-nums text-xs">{x.periodFrom ? `${viDate(x.periodFrom)} → ${viDate(x.periodTo)}` : "–"}</TD>
              <TD className="text-right tabular-nums">{x.orderCount}</TD>
              <TD className="text-right tabular-nums">{formatMoney(x.totalAmount)}</TD>
              <TD className="text-right tabular-nums">{formatMoney(x.paidAmount)}</TD>
              <TD className={`text-right font-semibold tabular-nums ${Number(x.balanceAmount) > 0 ? "text-red-600" : ""}`}>{formatMoney(x.balanceAmount)}</TD>
              <TD>
                <Badge tone={DEBT_TONE[x.debtStatus] ?? "muted"}>{x.debtStatus === "xuất bảng kê" ? "Chưa thanh toán" : x.debtStatus}</Badge>
              </TD>
              <TD>
                <a href={`/api/portal/bang-ke/${x.id}`} className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-primary hover:underline">
                  <Download className="size-3.5" /> .xlsx
                </a>
              </TD>
            </TR>
          ))}
          {sts.length === 0 && (
            <TR>
              <TD colSpan={10} className="py-6 text-center text-muted-foreground">
                Chưa có bảng kê.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>

      <h2 className="mb-2 font-semibold">
        Vận đơn chưa lên bảng kê <span className="text-sm font-normal text-muted-foreground">({unbilled.length})</span>
      </h2>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Mã vận đơn</TH>
            <TH>Ngày gửi</TH>
            <TH>Tuyến</TH>
            <TH>Điểm đến</TH>
            <TH>Trạng thái</TH>
            <TH className="text-right">Số kiện</TH>
            <TH className="text-right">Cân tính phí</TH>
            <TH className="text-right">Thành tiền</TH>
          </TR>
        </THead>
        <TBody>
          {unbilled.map((o) => (
            <TR key={o.id}>
              <TD className="font-medium">{o.billCode}</TD>
              <TD className="tabular-nums">{viDate(o.pricingDate)}</TD>
              <TD>{o.routeCode}</TD>
              <TD>{o.destinationIso2}</TD>
              <TD>
                <Badge tone={PORTAL_STATUS_TONE[o.status] ?? "muted"}>{o.status}</Badge>
              </TD>
              <TD className="text-right tabular-nums">{o.packageCount}</TD>
              <TD className="text-right tabular-nums">{formatKg(o.billedWeight)}</TD>
              <TD className="text-right font-medium tabular-nums">{formatMoney(o.totalAmount)}</TD>
            </TR>
          ))}
          {unbilled.length === 0 ? (
            <TR>
              <TD colSpan={8} className="py-6 text-center text-muted-foreground">
                Không có đơn chưa lên bảng kê.
              </TD>
            </TR>
          ) : (
            <TR className="bg-muted/40 font-semibold">
              <TD colSpan={7}>Tổng</TD>
              <TD className="text-right tabular-nums">{formatMoney(debt.unbilled)}</TD>
            </TR>
          )}
        </TBody>
      </Table>
    </>
  );
}
