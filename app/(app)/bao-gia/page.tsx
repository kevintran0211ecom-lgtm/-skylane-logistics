import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form";
import { Alert, Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { parseNumberCell } from "@/lib/pricing/import-excel";
import { quoteCostRoutes, type CostQuoteInput } from "@/lib/pricing/quote-service";
import { isIsoDate, viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";
import { requirePage } from "@/lib/auth/session";

export const metadata = { title: "Tra cứu báo giá tuyến gốc — SkyLane" };

type SP = { to?: string; kg?: string; vol?: string; l?: string; w?: string; h?: string; cbm?: string; date?: string };

const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());
const num = (s: string | undefined) => (s?.trim() ? parseNumberCell(s.trim(), "weight") : null);

function readInput(sp: SP): { input?: CostQuoteInput; error?: string } {
  if (!sp.to && !sp.kg) return {};
  const iso2 = (sp.to ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) return { error: "Điểm đến phải là mã quốc gia ISO2 (VD: US, GB, AU)." };
  const weight = num(sp.kg);
  if (!weight || weight === "0") return { error: "Nhập trọng lượng lớn hơn 0 kg." };
  const date = sp.date?.trim() || todaySaigon();
  if (!isIsoDate(date)) return { error: "Ngày áp giá không hợp lệ." };

  let volume: CostQuoteInput["volume"] = { type: "NONE" };
  if (sp.vol === "DIM" && (sp.l || sp.w || sp.h)) {
    const [l, w, h] = [num(sp.l), num(sp.w), num(sp.h)];
    if (!l || !w || !h) return { error: "Nhập đủ Dài, Rộng, Cao (cm) hợp lệ." };
    volume = { type: "DIM", l, w, h };
  } else if (sp.vol === "CBM" && sp.cbm) {
    const cbm = parseNumberCell(sp.cbm.trim(), "price");
    if (!cbm || cbm === "0") return { error: "Thể tích (CBM) không hợp lệ." };
    volume = { type: "CBM", cbm };
  }
  return { input: { iso2, weight, volume, date } };
}

export default async function CostQuotePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("quote.view");
  const sp = await searchParams;
  const { input, error } = readInput(sp);
  const result = input ? await quoteCostRoutes(input) : null;
  const vol = sp.vol === "CBM" ? "CBM" : "DIM";
  const cheapest = result?.rows.find((r) => r.currency === "VND")?.amount;

  return (
    <>
      <PageHeader title="Tra cứu báo giá tuyến gốc" description="So sánh giá gốc nhà cung cấp của mọi tuyến theo điểm đến, trọng lượng và kích thước." />

      <Card className="mb-5 p-4">
        <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[110px_120px_140px_1fr_150px_auto]">
          <Field label="Điểm đến (ISO2)" htmlFor="to">
            <Input id="to" name="to" defaultValue={sp.to ?? ""} placeholder="US" maxLength={2} required className="uppercase" autoFocus={!input} />
          </Field>
          <Field label="Trọng lượng (kg)" htmlFor="kg">
            <Input id="kg" name="kg" defaultValue={sp.kg ?? ""} inputMode="decimal" placeholder="1,5" required />
          </Field>
          <Field label="Thể tích theo" htmlFor="vol">
            <NativeSelect id="vol" name="vol" defaultValue={vol}>
              <option value="DIM">Kích thước (cm)</option>
              <option value="CBM">Thể tích (CBM)</option>
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Dài" htmlFor="l">
              <Input id="l" name="l" defaultValue={sp.l ?? ""} inputMode="decimal" placeholder="cm" />
            </Field>
            <Field label="Rộng" htmlFor="w">
              <Input id="w" name="w" defaultValue={sp.w ?? ""} inputMode="decimal" placeholder="cm" />
            </Field>
            <Field label="Cao" htmlFor="h">
              <Input id="h" name="h" defaultValue={sp.h ?? ""} inputMode="decimal" placeholder="cm" />
            </Field>
            <Field label="CBM" htmlFor="cbm">
              <Input id="cbm" name="cbm" defaultValue={sp.cbm ?? ""} inputMode="decimal" placeholder="m³" />
            </Field>
          </div>
          <Field label="Ngày áp giá" htmlFor="date">
            <Input id="date" name="date" type="date" defaultValue={sp.date || todaySaigon()} />
          </Field>
          <Button type="submit">
            <Search /> Tra cứu
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Để trống kích thước nếu chỉ tính theo cân thực. Chọn “Thể tích theo” để dùng Dài/Rộng/Cao hoặc CBM. Mỗi tuyến tự áp DIM, cách tính cân và quy tắc làm tròn riêng.
        </p>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      {result && input && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{result.rows.length} tuyến phù hợp</span>
            <span className="text-muted-foreground">
              → {input.iso2} · {formatKg(input.weight)} kg
              {input.volume.type === "DIM" && ` · ${input.volume.l}×${input.volume.w}×${input.volume.h} cm`}
              {input.volume.type === "CBM" && ` · ${input.volume.cbm} m³`} · áp giá ngày {viDate(input.date)}
            </span>
          </div>

          {result.rows.length === 0 ? (
            <Alert tone="warning">
              Không có tuyến nào có bảng giá gốc tới {input.iso2} hiệu lực ngày {viDate(input.date)}.{" "}
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
