import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { requirePortal } from "@/lib/portal/session";
import { packageRowsFromParams, parseQuoteInput, type QuoteSearchParams } from "@/lib/pricing/quote-input";
import { quoteSellForCustomer } from "@/lib/pricing/sell-quote-service";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { QuoteForm } from "@/app/(app)/bao-gia/quote-form";

export const metadata = { title: "Tra cứu giá — Cổng khách hàng SkyLane" };
const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

/** Cổng khách: giá bán của chính khách theo từng tuyến — chỉ cân tính phí & thành tiền */
export default async function PortalQuotePage({ searchParams }: { searchParams: Promise<QuoteSearchParams> }) {
  const s = await requirePortal();
  const sp = await searchParams;
  const { input, error } = parseQuoteInput({ ...sp, ncc: undefined, date: undefined }, todaySaigon());
  const res = input
    ? await quoteSellForCustomer({ customerCode: s.customerCode, iso2: input.iso2, date: input.date, packages: input.packages, serviceType: input.serviceType })
    : null;
  const rows = res && "result" in res ? res.result.rows : null;
  const cheapest = rows?.find((r) => r.currency === "VND")?.sellAmount;

  return (
    <>
      <PageHeader title="Tra cứu giá" description="Giá áp dụng cho tài khoản của bạn hôm nay, theo điểm đến, cân nặng và kích thước. Thành tiền chính thức theo cân tại kho SkyLane." />
      <Card className="mb-5 p-4">
        <QuoteForm
          defaults={{ to: sp.to ?? "", kg: sp.kg ?? "", cbm: sp.cbm ?? "", ncc: "", dv: (sp.dv ?? "").toUpperCase(), date: todaySaigon() }}
          rows={packageRowsFromParams(sp.p)}
          suppliers={[]}
          hideSupplier
          autoFocus={!input}
        />
      </Card>
      {error && <Alert tone="danger">{error}</Alert>}
      {res && "error" in res && <Alert tone="danger">{res.error}</Alert>}
      {rows && input && (
        <>
          <p className="mb-2 text-sm">
            <span className="font-medium">{rows.length} tuyến</span>{" "}
            <span className="text-muted-foreground">
              → {input.iso2} · {input.pieces} kiện · {formatKg(input.totalActual)} kg
              {input.totalCbm && ` · ${Number(input.totalCbm).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³`} · giá ngày {viDate(input.date)}
            </span>
          </p>
          {rows.length === 0 ? (
            <Alert tone="warning">Chưa có tuyến nào được báo giá tới {input.iso2} cho mức cân này — vui lòng liên hệ SkyLane.</Alert>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">#</TH>
                  <TH>Tuyến</TH>
                  <TH>Dịch vụ</TH>
                  <TH className="text-right">Cân tính phí</TH>
                  <TH className="bg-primary/10 text-right text-primary">Thành tiền</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => {
                  const best = r.currency === "VND" && r.sellAmount === cheapest;
                  return (
                    <TR key={r.routeCode} className={best ? "bg-emerald-50/60 dark:bg-emerald-950/20" : undefined}>
                      <TD className="text-muted-foreground tabular-nums">{i + 1}</TD>
                      <TD className="font-medium">{r.routeCode}</TD>
                      <TD>
                        <Badge tone="info">{r.serviceType}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        <span className="font-medium">{formatKg(r.chargeableWeight)} kg</span>
                        {Number(r.totalVolumetric) > 0 && <span className="block text-xs text-muted-foreground">quy đổi {formatKg(r.totalVolumetric)}</span>}
                      </TD>
                      <TD className="bg-primary/5 text-right text-base font-semibold tabular-nums text-primary">
                        {formatMoney(r.sellAmount, r.currency)} {r.currency === "USD" ? "USD" : "đ"}
                        {best && <Badge tone="success" className="ml-2 align-middle">Rẻ nhất</Badge>}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </>
      )}
    </>
  );
}
