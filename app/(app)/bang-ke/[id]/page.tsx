import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { getStatement } from "@/lib/statements/service";
import { BANK } from "@/lib/statements/format";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { CancelStatement } from "./cancel-statement";

export default async function StatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("statements.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const st = await getStatement(id);
  if (!st || (user.saleScope && st.saleUserId !== user.saleScope)) notFound();
  const cur = st.currency === "USD" ? "USD" : "VND";
  const cancelled = st.status === "CANCELLED";

  return (
    <>
      <Link href="/bang-ke" className={buttonVariants({ variant: "link", className: "mb-2 h-auto px-0" })}>
        <ArrowLeft /> Bảng kê
      </Link>
      <PageHeader
        title={st.statementNo}
        description={st.name}
        actions={
          <>
            <a href={`/api/bang-ke/${st.id}/xlsx`} className={buttonVariants()}>
              <Download /> Tải Excel (.xlsx)
            </a>
            {!cancelled && can(user.role, "statements.manage") && <CancelStatement id={st.id} disabled={Number(st.paidAmount) > 0} />}
          </>
        }
      />
      {cancelled && (
        <Alert tone="danger" className="mb-4" title={`Đã hủy lúc ${new Date(st.cancelledAt!).toLocaleString("vi-VN", { timeZone: "Asia/Saigon" })}`}>
          {st.cancelReason ?? "Không ghi lý do."} Các đơn không thuộc bảng kê hiệu lực khác đã về “Chưa thanh toán”.
        </Alert>
      )}

      <Card className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
        <Info label="Khách hàng">
          {st.customerName} ({st.customerCode})
        </Info>
        <Info label="Kỳ (ngày gửi)">
          {st.periodFrom || st.periodTo ? `${st.periodFrom ? viDate(st.periodFrom) : "…"} → ${st.periodTo ? viDate(st.periodTo) : "…"}` : "—"}
        </Info>
        <Info label="Trạng thái">{cancelled ? <Badge tone="danger">Đã hủy</Badge> : <Badge tone="success">Đang hiệu lực</Badge>}</Info>
        <Info label="Công nợ">
          <Badge tone="info">{st.debtStatus}</Badge>
        </Info>
        <Info label="Tổng tiền">
          <span className="text-base text-primary">{formatMoney(st.totalAmount, cur)} {cur}</span>
        </Info>
        <Info label="Đã thu">{formatMoney(st.paidAmount, cur)}</Info>
        <Info label="Còn lại">{formatMoney(st.balanceAmount, cur)}</Info>
        <Info label="Tài khoản nhận">
          {BANK.bankName} {BANK.accountNo} — {BANK.accountName}
        </Info>
        {st.note && <p className="col-span-full text-xs text-muted-foreground">{st.note}</p>}
      </Card>

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            {["STT", "Thời gian", "Mã vận đơn", "Tracking", "Điểm đến", "Người nhận", "Số kiện", "Trọng lượng tính phí", "Tuyến vận chuyển", "Chi phí", "Ghi chú"].map((h, i) => (
              <TH key={h} className={[6, 7, 9].includes(i) ? "text-right" : undefined}>
                {h}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {st.items.map((it) => (
            <TR key={it.id} className={it.isActive ? undefined : "text-muted-foreground"}>
              <TD className="tabular-nums">{it.lineNo}</TD>
              <TD className="whitespace-nowrap tabular-nums">{viDate(it.shippedDate)}</TD>
              <TD className="font-medium">{it.billCode}</TD>
              <TD>{it.snapshot?.trackingNumber}</TD>
              <TD>{it.destinationIso2}</TD>
              <TD className="max-w-40 truncate">{it.receiverName}</TD>
              <TD className="text-right tabular-nums">{it.packageCount}</TD>
              <TD className="text-right tabular-nums">{formatKg(it.billedWeight)}</TD>
              <TD>{it.routeCode}</TD>
              <TD className="text-right tabular-nums">{formatMoney(it.totalAmount, cur)}</TD>
              <TD className="max-w-48 truncate">{it.snapshot?.note}</TD>
            </TR>
          ))}
          <TR className="font-semibold hover:bg-transparent">
            <TD colSpan={8} />
            <TD className="text-center">TỔNG</TD>
            <TD className="text-right tabular-nums">{formatMoney(st.totalAmount, cur)}</TD>
            <TD className="text-center">{cur}</TD>
          </TR>
        </TBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Chi tiết là bản chụp (snapshot) tại thời điểm tạo bảng kê — không đổi khi đơn gốc được sửa sau này.</p>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}
