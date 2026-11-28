/**
 * Tra cứu giá bán cho 1 khách hàng (thuần — dùng chung trang Next.js và bản chạy thử).
 *
 * Mỗi tuyến tính đúng như khi lên vận đơn (engine.calcPriceSide):
 *   giá riêng KH → bảng riêng nhóm × (1 + %KH) → giá chung × (1 + %nhóm) × (1 + %KH).
 * Kèm giá gốc chung của tuyến để thấy lợi nhuận.
 */
import { calcPriceSide, PricingError, type Currency, type Num, type PackageInput, type PriceScope, type PricingCatalog, type ServiceType } from "./engine";

export interface SellQuoteCustomer {
  customerCode: string;
  priceGroupCode: string | null;
  groupAdjustPct: Num | null;
  priceAdjustPct: Num | null;
}

export interface SellQuoteRouteMeta {
  routeCode: string;
  supplierCode: string | null;
}

export interface SellQuoteRow {
  routeCode: string;
  supplierCode: string | null;
  serviceType: ServiceType;
  chargeableWeight: string;
  totalVolumetric: string;
  sellAmount: string;
  currency: Currency;
  avgUnitPrice: string | null; // giá bán / cân tính phí (VND/kg)
  scope: PriceScope;
  adjustPct: string; // % tổng đã áp (nhóm × khách)
  sellVersionId: number | string | null;
  costAmount: string | null; // null = tuyến chưa có giá gốc phục vụ mức cân này
  profit: string | null;
  marginPct: string | null; // lợi nhuận / giá bán
}

export interface SellQuoteResult {
  rows: SellQuoteRow[]; // giá bán tăng dần (VND trước)
  unavailable: { routeCode: string; reason: string }[]; // có bảng giá bán nhưng không phục vụ nước/mức cân
  noSellPrice: string[]; // tuyến chưa có bảng giá bán hiệu lực cho khách (kể cả giá chung)
}

export const SCOPE_LABEL: Record<PriceScope, string> = { CUSTOMER: "Giá riêng KH", GROUP: "Bảng giá nhóm", DEFAULT: "Giá chung" };

const round = (n: number, d: number) => {
  const s = n.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

export function quoteSellRoutes(
  catalog: PricingCatalog,
  customer: SellQuoteCustomer,
  routes: SellQuoteRouteMeta[],
  q: { iso2: string; date: string; packages: PackageInput[] },
): SellQuoteResult {
  const rows: SellQuoteRow[] = [];
  const unavailable: SellQuoteResult["unavailable"] = [];
  const noSellPrice: string[] = [];

  for (const r of routes) {
    if (!catalog.routes.some((x) => x.routeCode === r.routeCode)) continue;
    const input = {
      customerCode: customer.customerCode,
      priceGroupCode: customer.priceGroupCode,
      groupAdjustPct: customer.groupAdjustPct,
      priceAdjustPct: customer.priceAdjustPct,
      routeCode: r.routeCode,
      assignedRouteCode: r.routeCode,
      destinationIso2: q.iso2,
      createdAt: q.date,
      shippedAt: q.date,
      packages: q.packages,
    };
    let sell;
    try {
      sell = calcPriceSide(input, catalog, "SELL");
    } catch (e) {
      if (!(e instanceof PricingError)) throw e;
      if (e.code === "NO_VERSION") noSellPrice.push(r.routeCode);
      else if (e.code !== "ZONE_NOT_FOUND") unavailable.push({ routeCode: r.routeCode, reason: e.message }); // không bay nước này → bỏ qua
      continue;
    }
    let cost: string | null = null;
    try {
      const c = calcPriceSide(input, catalog, "COST");
      if (c.currency === sell.currency) cost = c.amount;
    } catch (e) {
      if (!(e instanceof PricingError)) throw e;
    }
    const s = Number(sell.amount);
    const w = Number(sell.weight);
    const profit = cost === null ? null : round(s - Number(cost), sell.currency === "VND" ? 0 : 2);
    rows.push({
      routeCode: r.routeCode,
      supplierCode: r.supplierCode,
      serviceType: sell.serviceType,
      chargeableWeight: sell.weight,
      totalVolumetric: sell.totalVolumetric,
      sellAmount: sell.amount,
      currency: sell.currency,
      avgUnitPrice: w > 0 ? round(s / w, sell.currency === "VND" ? 0 : 2) : null,
      scope: sell.scope ?? "DEFAULT",
      adjustPct: sell.adjustPct,
      sellVersionId: sell.versionId,
      costAmount: cost,
      profit,
      marginPct: profit !== null && s > 0 ? round((Number(profit) / s) * 100, 1) : null,
    });
  }
  rows.sort((a, b) => (a.currency !== b.currency ? (a.currency === "VND" ? -1 : 1) : Number(a.sellAmount) - Number(b.sellAmount)));
  return { rows, unavailable, noSellPrice };
}
