import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { getVersionDetail } from "@/lib/pricing/queries";
import { viDate } from "@/lib/pricing/versioning";
import { formatMoney } from "@/lib/utils";
import { formatKg, PRICE_KIND_LABEL, PRICING_MODE_LABEL, PRICING_STATUS, scopeLabel } from "@/lib/labels";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { VersionActions } from "./version-actions";

export default async function VersionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("pricing.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = await getVersionDetail(id);
  if (!detail) notFound();
  const { version: v, zones, matrix, perKg, history } = detail;
  const currency = v.currency === "USD" ? "USD" : "VND";
  const st = PRICING_STATUS[v.status];

  // Lưới ma trận: dòng = mốc cân, cột = vùng
  const weights = [...new Set(matrix.map((t) => t.weightMax))].sort((a, b) => Number(a) - Number(b));
  const matrixAt = new Map(matrix.map((t) => [`${t.zoneId}|${t.weightMax}`, t.price]));
  const ranges = [...new Map(perKg.map((t) => [`${t.weightMin}|${t.weightMax ?? ""}`, t])).values()].sort(
    (a, b) => Number(a.weightMin) - Number(b.weightMin),
  );
  const perKgAt = new Map(perKg.map((t) => [`${t.zoneId}|${t.weightMin}|${t.weightMax ?? ""}`, t.unitPrice]));

  return (
    <>
      <Link href="/bang-gia" className={buttonVariants({ variant: "link", className: "mb-2 h-auto px-0" })}>
        <ArrowLeft /> Kho bảng giá
      </Link>
      <PageHeader title={`#${v.id} · ${v.routeCode}`} description={v.name} actions={can(user.role, "pricing.manage") ? <VersionActions id={v.id} status={v.status} /> : undefined} />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
          <Info label="Loại">
            <Badge tone={v.priceKind === "COST" ? "warning" : "info"}>{PRICE_KIND_LABEL[v.priceKind]}</Badge>
          </Info>
          <Info label="Phạm vi">{scopeLabel(v.customerCode, v.priceGroupCode)}</Info>
          <Info label="Chế độ">{PRICING_MODE_LABEL[v.pricingMode]}</Info>
          <Info label="Trạng thái">
            <Badge tone={st.tone}>{st.label}</Badge>
          </Info>
          <Info label="Hiệu lực từ">{viDate(v.effectiveFrom)}</Info>
          <Info label="Hiệu lực đến">{v.effectiveTo ? viDate(v.effectiveTo) : "Không thời hạn"}</Info>
          <Info label="Dịch vụ">{v.serviceType}</Info>
          <Info label="Tiền tệ">{currency}</Info>
          {v.note && <p className="col-span-full text-xs text-muted-foreground">{v.note}</p>}
        </Card>
        <Card className="p-4 text-sm">
          <p className="mb-2 font-medium">Lịch sử phiên bản</p>
          <ol className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <Link href={`/bang-gia/${h.id}`} className={h.id === v.id ? "font-semibold" : "text-primary hover:underline"}>
                  #{h.id} · {viDate(h.effectiveFrom)} → {viDate(h.effectiveTo)}
                </Link>
                <Badge tone={PRICING_STATUS[h.status].tone}>{PRICING_STATUS[h.status].label}</Badge>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <h2 className="mb-2 font-semibold">Vùng giá</h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {zones.map((z) => (
          <Card key={z.id} className="px-3 py-2 text-sm">
            <span className="font-medium">{z.zoneCode}</span>
            <span className="ml-2 text-muted-foreground">{z.countries.join(", ")}</span>
          </Card>
        ))}
      </div>

      {weights.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">
            Ma trận — giá trọn mốc ({currency}){v.pricingMode === "MA_TRAN+THEO_KG" && <span className="font-normal text-muted-foreground"> · áp dụng tới 20 kg</span>}
          </h2>
          <div className="mb-6">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="sticky left-0 bg-muted">Mốc ≤ kg</TH>
                {zones.map((z) => (
                  <TH key={z.id} className="text-right" title={z.countries.join(", ")}>
                    {z.zoneCode}
                    <span className="block font-normal">{z.countries.length > 3 ? `${z.countries.slice(0, 3).join(", ")}…` : z.countries.join(", ")}</span>
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {weights.map((w) => (
                <TR key={w}>
                  <TD className="sticky left-0 bg-card font-medium tabular-nums">{formatKg(w)}</TD>
                  {zones.map((z) => {
                    const p = matrixAt.get(`${z.id}|${w}`);
                    return (
                      <TD key={z.id} className="text-right tabular-nums">
                        {p ? formatMoney(p, currency) : <span className="text-muted-foreground">–</span>}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
          </div>
        </>
      )}

      {ranges.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold">Theo kg — đơn giá / kg ({currency})</h2>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="sticky left-0 bg-muted">Khoảng cân</TH>
                {zones.map((z) => (
                  <TH key={z.id} className="text-right">
                    {z.zoneCode}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {ranges.map((r) => (
                <TR key={`${r.weightMin}|${r.weightMax}`}>
                  <TD className="sticky left-0 bg-card font-medium whitespace-nowrap">
                    &gt; {formatKg(r.weightMin)} {r.weightMax ? `– ${formatKg(r.weightMax)}` : "trở lên"} kg
                  </TD>
                  {zones.map((z) => {
                    const p = perKgAt.get(`${z.id}|${r.weightMin}|${r.weightMax ?? ""}`);
                    return (
                      <TD key={z.id} className="text-right tabular-nums">
                        {p ? formatMoney(p, currency) : <span className="text-muted-foreground">–</span>}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
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
