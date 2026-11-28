import Link from "next/link";
import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { listSuppliers } from "@/lib/catalog/queries";
import { packageRowsFromParams, parseQuoteInput, type QuoteSearchParams } from "@/lib/pricing/quote-input";
import { quoteCostRoutes } from "@/lib/pricing/quote-service";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { requirePage } from "@/lib/auth/session";
import { QuoteForm } from "./quote-form";

export const metadata = { title: "Tra cứu báo giá tuyến gốc — SkyLane" };

const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

export default async function CostQuotePage({ searchParams }: { searchParams: Promise<QuoteSearchParams> }) {
  await requirePage("quote.view");
  const sp = await searchParams;
  const { input, error } = parseQuoteInput(sp, todaySaigon());
  const [result, suppliers] = await Promise.all([
    input
      ? quoteCostRoutes({ iso2: input.iso2, packages: input.packages, date: input.date, supplierCode: input.supplierCode, serviceType: input.serviceType })
      : null,
    listSuppliers(),
  ]);
  const cheapest = result?.rows.find((r) => r.currency === "VND")?.amount;
  const filterText = [input?.supplierCode && `NCC ${input.supplierCode}`, input?.serviceType && `dịch vụ ${input.serviceType}`].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader title="Tra cứu báo giá tuyến gốc" description="So sánh giá gốc nhà cung cấp của mọi tuyến theo điểm đến, trọng lượng và kích thước." />

      <Card className="mb-5 p-4">
        <QuoteForm
          defaults={{ to: sp.to ?? "", kg: sp.kg ?? "", cbm: sp.cbm ?? "", ncc: (sp.ncc ?? "").toUpperCase(), dv: (sp.dv ?? "").toUpperCase(), date: sp.date || todaySaigon() }}
          rows={packageRowsFromParams(sp.p)}
          suppliers={suppliers}
          autoFocus={!input}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Hàng nhiều kiện: bấm “Kích thước thông tin” để nhập từng nhóm kiện (số kiện, cân/kiện, Dài × Rộng × Cao) — Trọng lượng và CBM tự cộng. Hàng 1 kiện chỉ cần nhập Trọng lượng (và CBM nếu có). Mỗi tuyến tự áp DIM, cách tính cân và quy tắc làm tròn riêng.
        </p>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {result && input && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{result.rows.length} tuyến phù hợp</span>
            <span className="text-muted-foreground">
              → {input.iso2} · {input.pieces} kiện · {formatKg(input.totalActual)} kg
              {input.totalCbm && ` · ${Number(input.totalCbm).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³`} · áp giá ngày {viDate(input.date)}
              {filterText && ` · lọc ${filterText}`}
            </span>
          </div>

          {result.rows.length === 0 ? (
            <Alert tone="warning">
              Không có tuyến nào{filterText && ` (${filterText})`} có bảng giá gốc tới {input.iso2} hiệu lực ngày {viDate(input.date)}.{" "}
              <Link href="/bang-gia/import" className="underline">
                Nhập bảng giá
              </Link>
            </Alert>
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH className="w-10">#</TH>
                  <TH>Tuyến</TH>
                  <TH>Dịch vụ</TH>
                  <TH className="text-right">Cân tính phí</TH>
                  <TH className="text-right">Đơn giá/kg</TH>
                  <TH className="bg-primary/10 text-right text-primary">Tổng tiền (VND)</TH>
                  <TH className="text-right">DIM</TH>
                  <TH>Hiệu lực bảng giá</TH>
                </TR>
              </THead>
              <TBody>
                {result.rows.map((r, i) => {
                  const best = r.currency === "VND" && r.amount === cheapest;
                  return (
                    <TR key={r.routeCode} className={best ? "bg-emerald-50/60 dark:bg-emerald-950/20" : undefined}>
                      <TD className="text-muted-foreground tabular-nums">{i + 1}</TD>
                      <TD>
                        <span className="font-medium">{r.routeCode}</span>
                        {r.routeName !== r.routeCode && <span className="block text-xs text-muted-foreground">{r.routeName}</span>}
                        {r.supplierCode && <span className="block text-xs text-muted-foreground">NCC: {r.supplierCode}</span>}
                      </TD>
                      <TD>
                        <Badge tone="info">{r.serviceType}</Badge>
                      </TD>
                      <TD className="text-right tabular-nums">
                        <span className="font-medium">{formatKg(r.chargeableWeight)} kg</span>
                        {Number(r.volumetricWeight) > 0 && r.weightCalcMode === "MAX_ACTUAL_VOL" && (
                          <span className="block text-xs text-muted-foreground">quy đổi {formatKg(r.volumetricWeight)}</span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {r.unitPrice ? formatMoney(r.unitPrice, r.currency) : <span className="text-xs text-muted-foreground">Trọn mốc</span>}
                      </TD>
                      <TD className="bg-primary/5 text-right text-base font-semibold tabular-nums text-primary">
                        {formatMoney(r.amount, r.currency)}
                        {r.currency === "USD" && <span className="ml-1 text-xs font-normal">USD</span>}
                        {best && <Badge tone="success" className="ml-2 align-middle">Rẻ nhất</Badge>}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {r.weightCalcMode === "ACTUAL_ONLY" ? <Badge tone="warning">Cân thực</Badge> : Number(r.dimDivisor).toLocaleString("vi-VN")}
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">
                        <Link href={`/bang-gia/${r.versionId}`} className="hover:underline">
                          {viDate(r.effectiveFrom)} → {viDate(r.effectiveTo)}
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}

          {result.unavailable.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">{result.unavailable.length} tuyến có bảng giá tới {input.iso2} nhưng không phục vụ mức cân này</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {result.unavailable.map((u) => (
                  <li key={u.routeCode}>
                    <span className="font-medium">{u.routeCode}</span>: {u.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </>
  );
}
