import Link from "next/link";
import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { listCustomerOptions, listSuppliers } from "@/lib/catalog/queries";
import { packageRowsFromParams, parseQuoteInput, type QuoteSearchParams } from "@/lib/pricing/quote-input";
import { quoteSellForCustomer } from "@/lib/pricing/sell-quote-service";
import { SCOPE_LABEL } from "@/lib/pricing/sell-quote";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { requirePage } from "@/lib/auth/session";
import { QuoteForm } from "../bao-gia/quote-form";

export const metadata = { title: "Tra cứu giá bán — SkyLane" };

const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());
const pct = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0);
  return `${n > 0 ? "+" : ""}${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
};

export default async function SellQuotePage({ searchParams }: { searchParams: Promise<QuoteSearchParams> }) {
  const user = await requirePage("quote.view");
  const sp = await searchParams;
  const kh = (sp.kh ?? "").trim().toUpperCase();
  const parsed = parseQuoteInput(sp, todaySaigon());
  const error = parsed.error ?? (parsed.input && !kh ? "Chọn khách hàng cần tra giá bán." : undefined);
  const input = error ? undefined : parsed.input;

  const [res, customers, suppliers] = await Promise.all([
    input
      ? quoteSellForCustomer({
          customerCode: kh,
          iso2: input.iso2,
          date: input.date,
          packages: input.packages,
          supplierCode: input.supplierCode,
          serviceType: input.serviceType,
          saleScope: user.saleScope,
        })
      : null,
    listCustomerOptions(user.saleScope),
    listSuppliers(),
  ]);
  const data = res && "result" in res ? res : null;
  const err = error ?? (res && "error" in res ? res.error : undefined);
  const filterText = [input?.supplierCode && `NCC ${input.supplierCode}`, input?.serviceType && `dịch vụ ${input.serviceType}`].filter(Boolean).join(", ");
  const cheapest = data?.result.rows.find((r) => r.currency === "VND")?.sellAmount;

  return (
    <>
      <PageHeader
        title="Tra cứu giá bán"
        description="Giá bán đã nhập cho khách hàng trên mọi tuyến — áp đúng thứ tự giá riêng khách → bảng giá nhóm → giá chung và % điều chỉnh, như khi lên vận đơn."
      />

      <Card className="mb-5 p-4">
        <QuoteForm
          defaults={{ to: sp.to ?? "", kg: sp.kg ?? "", cbm: sp.cbm ?? "", ncc: (sp.ncc ?? "").toUpperCase(), dv: (sp.dv ?? "").toUpperCase(), date: sp.date || todaySaigon(), kh }}
          rows={packageRowsFromParams(sp.p)}
          suppliers={suppliers}
          customers={customers}
          autoFocus={!input}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Hàng nhiều kiện: bấm “Kích thước thông tin”. Giá gốc và lợi nhuận lấy theo bảng giá gốc chung của chính tuyến đó (tuyến chỉ định = tuyến vận chuyển).
        </p>
      </Card>

      {err && <Alert tone="danger">{err}</Alert>}

      {data && input && (
        <>
          <Card className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-sm">
            <span>
              <span className="font-semibold">{data.customer.customerCode}</span> — {data.customer.name}
            </span>
            <span className="text-muted-foreground">
              Nhóm giá:{" "}
              {data.customer.priceGroupCode ? (
                <span className="text-foreground">
                  {data.customer.groupName ?? data.customer.priceGroupCode} ({pct(data.customer.groupAdjustPct)} so với giá chung)
                </span>
              ) : (
                <span className="text-foreground">Bảng giá chung</span>
              )}
            </span>
            <span className="text-muted-foreground">
              % riêng của khách: <span className="text-foreground">{pct(data.customer.priceAdjustPct)}</span>
            </span>
          </Card>

          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{data.result.rows.length} tuyến có giá bán</span>
            <span className="text-muted-foreground">
              → {input.iso2} · {input.pieces} kiện · {formatKg(input.totalActual)} kg
              {input.totalCbm && ` · ${Number(input.totalCbm).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³`} · áp giá ngày {viDate(input.date)}
              {filterText && ` · lọc ${filterText}`}
            </span>
          </div>

          {data.result.rows.length === 0 ? (
            <Alert tone="warning">
              Không có tuyến nào{filterText && ` (${filterText})`} có giá bán tới {input.iso2} cho khách {data.customer.customerCode} hiệu lực ngày {viDate(input.date)}.{" "}
              <Link href="/bang-gia" className="underline">
                Xem kho bảng giá
              </Link>
            </Alert>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">#</TH>
                  <TH>Tuyến</TH>
                  <TH>Dịch vụ</TH>
                  <TH>Nguồn giá</TH>
                  <TH className="text-right">Cân tính phí</TH>
                  <TH className="text-right">Đơn giá TB/kg</TH>
                  <TH className="bg-primary/10 text-right text-primary">Giá bán</TH>
                  <TH className="text-right">Giá gốc</TH>
                  <TH className="text-right">Lợi nhuận</TH>
                </TR>
              </THead>
              <TBody>
                {data.result.rows.map((r, i) => {
                  const best = r.currency === "VND" && r.sellAmount === cheapest;
                  const loss = r.profit !== null && Number(r.profit) < 0;
                  return (
                    <TR key={r.routeCode} className={best ? "bg-emerald-50/60 dark:bg-emerald-950/20" : undefined}>
                      <TD className="text-muted-foreground tabular-nums">{i + 1}</TD>
                      <TD>
                        <span className="font-medium">{r.routeCode}</span>
                        {r.supplierCode && <span className="block text-xs text-muted-foreground">NCC: {r.supplierCode}</span>}
                      </TD>
                      <TD>
                        <Badge tone="info">{r.serviceType}</Badge>
                      </TD>
                      <TD>
                        {r.sellVersionId ? (
                          <Link href={`/bang-gia/${r.sellVersionId}`} className="hover:underline">
                            {SCOPE_LABEL[r.scope]}
                          </Link>
                        ) : (
                          SCOPE_LABEL[r.scope]
                        )}
                        {Number(r.adjustPct) !== 0 && <span className="block text-xs text-muted-foreground">đã áp {pct(r.adjustPct)}</span>}
                      </TD>
                      <TD className="text-right tabular-nums">
                        <span className="font-medium">{formatKg(r.chargeableWeight)} kg</span>
                        {Number(r.totalVolumetric) > 0 && <span className="block text-xs text-muted-foreground">quy đổi {formatKg(r.totalVolumetric)}</span>}
                      </TD>
                      <TD className="text-right tabular-nums">{r.avgUnitPrice ? formatMoney(r.avgUnitPrice, r.currency) : "–"}</TD>
                      <TD className="bg-primary/5 text-right text-base font-semibold tabular-nums text-primary">
                        {formatMoney(r.sellAmount, r.currency)}
                        {r.currency === "USD" && <span className="ml-1 text-xs font-normal">USD</span>}
                        {best && <Badge tone="success" className="ml-2 align-middle">Rẻ nhất</Badge>}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {r.costAmount !== null ? formatMoney(r.costAmount, r.currency) : <span className="text-xs text-muted-foreground">Chưa có giá gốc</span>}
                      </TD>
                      <TD className={`text-right tabular-nums ${loss ? "font-semibold text-red-600" : ""}`}>
                        {r.profit !== null ? (
                          <>
                            {formatMoney(r.profit, r.currency)}
                            {r.marginPct !== null && <span className="block text-xs text-muted-foreground">{Number(r.marginPct).toLocaleString("vi-VN")}%</span>}
                          </>
                        ) : (
                          "–"
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}

          {(data.result.unavailable.length > 0 || data.result.noSellPrice.length > 0) && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {data.result.unavailable.length + data.result.noSellPrice.length} tuyến không có giá bán phù hợp
              </summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {data.result.unavailable.map((u) => (
                  <li key={u.routeCode}>
                    <span className="font-medium">{u.routeCode}</span>: {u.reason}
                  </li>
                ))}
                {data.result.noSellPrice.length > 0 && (
                  <li>
                    Chưa có bảng giá bán hiệu lực ngày {viDate(input.date)}: <span className="font-medium">{data.result.noSellPrice.join(", ")}</span>
                  </li>
                )}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}
