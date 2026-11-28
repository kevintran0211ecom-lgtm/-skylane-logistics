import "server-only";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pricingMatrixTiers,
  pricingPerKgTiers,
  pricingVersions,
  pricingZoneCountries,
  routes,
} from "@/drizzle/schema";
import { sumDecimal } from "./quote-input";
import { calcBillWeight, PricingError, quoteVersion, type PackageInput, type PriceVersion, type RouteConfig } from "./engine";

export interface CostQuoteInput {
  iso2: string;
  packages: PackageInput[]; // mỗi phần tử = 1 kiện (đã nhân theo số kiện)
  date: string; // YYYY-MM-DD — ngày áp giá
  supplierCode?: string | null; // lọc theo nhà cung cấp
  serviceType?: RouteConfig["serviceType"] | null; // lọc theo loại dịch vụ
}

export interface CostQuoteRow {
  routeCode: string;
  routeName: string;
  supplierCode: string | null;
  serviceType: RouteConfig["serviceType"];
  weightCalcMode: RouteConfig["weightCalcMode"];
  dimDivisor: string;
  volumetricWeight: string;
  chargeableWeight: string;
  amount: string;
  currency: "VND" | "USD";
  basis: "MA_TRAN" | "THEO_KG";
  unitPrice: string | null;
  versionId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface CostQuoteResult {
  rows: CostQuoteRow[]; // sắp xếp Tổng tiền tăng dần (VND trước)
  unavailable: { routeCode: string; reason: string }[]; // có bảng giá tới nước này nhưng không phục vụ mốc cân
}

/**
 * Báo giá gốc mọi tuyến đang hoạt động (lọc theo NCC / dịch vụ nếu chọn) có bảng giá COST (chung) hiệu lực tại ngày áp giá
 * và có vùng giá cho nước đến. Tính cân & giá hoàn toàn qua engine.
 */
export async function quoteCostRoutes(input: CostQuoteInput): Promise<CostQuoteResult> {
  const versions = await db
    .select({
      id: pricingVersions.id,
      routeCode: pricingVersions.routeCode,
      routeName: routes.name,
      supplierCode: routes.supplierCode,
      serviceType: routes.serviceType,
      weightCalcMode: routes.weightCalcMode,
      dimDivisor: routes.dimDivisor,
      mode: pricingVersions.pricingMode,
      currency: pricingVersions.currency,
      effectiveFrom: pricingVersions.effectiveFrom,
      effectiveTo: pricingVersions.effectiveTo,
      zoneId: pricingZoneCountries.zoneId,
    })
    .from(pricingVersions)
    .innerJoin(routes, eq(routes.routeCode, pricingVersions.routeCode))
    .innerJoin(
      pricingZoneCountries,
      and(eq(pricingZoneCountries.versionId, pricingVersions.id), eq(pricingZoneCountries.iso2, input.iso2)),
    )
    .where(
      and(
        eq(routes.isActive, true),
        input.supplierCode ? eq(routes.supplierCode, input.supplierCode) : undefined,
        input.serviceType ? eq(routes.serviceType, input.serviceType) : undefined,
        eq(pricingVersions.priceKind, "COST"),
        eq(pricingVersions.status, "ACTIVE"),
        isNull(pricingVersions.customerCode),
        isNull(pricingVersions.priceGroupCode),
        lte(pricingVersions.effectiveFrom, input.date),
        or(isNull(pricingVersions.effectiveTo), gte(pricingVersions.effectiveTo, input.date)),
      ),
    );
  if (versions.length === 0) return { rows: [], unavailable: [] };

  const zoneIds = versions.map((v) => v.zoneId);
  const [matrix, perKg] = await Promise.all([
    db
      .select({ zoneId: pricingMatrixTiers.zoneId, weightMax: pricingMatrixTiers.weightMax, price: pricingMatrixTiers.price })
      .from(pricingMatrixTiers)
      .where(inArray(pricingMatrixTiers.zoneId, zoneIds)),
    db
      .select({
        zoneId: pricingPerKgTiers.zoneId,
        weightMin: pricingPerKgTiers.weightMin,
        weightMax: pricingPerKgTiers.weightMax,
        unitPrice: pricingPerKgTiers.unitPrice,
      })
      .from(pricingPerKgTiers)
      .where(inArray(pricingPerKgTiers.zoneId, zoneIds)),
  ]);

  const rows: CostQuoteRow[] = [];
  const unavailable: CostQuoteResult["unavailable"] = [];
  for (const v of versions) {
    const route: RouteConfig = {
      routeCode: v.routeCode,
      serviceType: v.serviceType,
      weightCalcMode: v.weightCalcMode,
      dimDivisor: v.dimDivisor,
    };
    const currency = v.currency === "USD" ? "USD" : "VND";
    const version: PriceVersion = {
      id: v.id,
      routeCode: v.routeCode,
      kind: "COST",
      mode: v.mode,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      currency,
      zones: [
        {
          zoneCode: String(v.zoneId),
          countries: [input.iso2],
          matrix: matrix.filter((t) => t.zoneId === v.zoneId),
          perKg: perKg.filter((t) => t.zoneId === v.zoneId),
        },
      ],
    };
    try {
      const bill = calcBillWeight(input.packages, route);
      const q = quoteVersion(version, input.iso2, bill.totalWeight);
      rows.push({
        routeCode: v.routeCode,
        routeName: v.routeName,
        supplierCode: v.supplierCode,
        serviceType: v.serviceType,
        weightCalcMode: v.weightCalcMode,
        dimDivisor: v.dimDivisor,
        volumetricWeight: sumDecimal(bill.packages.map((p) => p.volumetricWeight)),
        chargeableWeight: bill.totalWeight,
        amount: q.amount,
        currency,
        basis: q.basis,
        unitPrice: q.unitPrice,
        versionId: v.id,
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
      });
    } catch (e) {
      if (e instanceof PricingError) unavailable.push({ routeCode: v.routeCode, reason: e.message });
      else throw e;
    }
  }

  rows.sort((a, b) => (a.currency !== b.currency ? (a.currency === "VND" ? -1 : 1) : Number(a.amount) - Number(b.amount)));
  return { rows, unavailable };
}
