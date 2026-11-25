import "server-only";
import { and, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { db } from "@/lib/db";
import {
  pricingMatrixTiers,
  pricingPerKgTiers,
  pricingVersions,
  pricingZoneCountries,
  pricingZones,
  routes,
} from "@/drizzle/schema";
import type { PriceVersion, PricingCatalog, RouteConfig } from "./engine";

/**
 * Nạp dữ liệu tuyến + mọi phiên bản giá ACTIVE (COST/SELL, mọi phạm vi) của các tuyến
 * có hiệu lực giao với [minDate, maxDate] → PricingCatalog cho engine.
 * Việc chọn phiên bản / phạm vi / vùng / mốc vẫn do engine quyết định.
 */
export async function loadPricingCatalog(
  exec: Pick<typeof db, "select">,
  routeCodes: string[],
  minDate: string,
  maxDate: string,
): Promise<PricingCatalog> {
  const codes = [...new Set(routeCodes)];
  if (codes.length === 0) return { routes: [], versions: [] };

  const [routeRows, versionRows] = await Promise.all([
    exec
      .select({
        routeCode: routes.routeCode,
        serviceType: routes.serviceType,
        weightCalcMode: routes.weightCalcMode,
        dimDivisor: routes.dimDivisor,
      })
      .from(routes)
      .where(inArray(routes.routeCode, codes)),
    exec
      .select({
        id: pricingVersions.id,
        routeCode: pricingVersions.routeCode,
        kind: pricingVersions.priceKind,
        customerCode: pricingVersions.customerCode,
        priceGroupCode: pricingVersions.priceGroupCode,
        mode: pricingVersions.pricingMode,
        currency: pricingVersions.currency,
        effectiveFrom: pricingVersions.effectiveFrom,
        effectiveTo: pricingVersions.effectiveTo,
      })
      .from(pricingVersions)
      .where(
        and(
          inArray(pricingVersions.routeCode, codes),
          inArray(pricingVersions.status, ["ACTIVE"]),
          lte(pricingVersions.effectiveFrom, maxDate),
          or(isNull(pricingVersions.effectiveTo), gte(pricingVersions.effectiveTo, minDate)),
        ),
      ),
  ]);

  const versionIds = versionRows.map((v) => v.id);
  const zones = versionIds.length
    ? await exec
        .select({ id: pricingZones.id, versionId: pricingZones.versionId, zoneCode: pricingZones.zoneCode })
        .from(pricingZones)
        .where(inArray(pricingZones.versionId, versionIds))
    : [];
  const zoneIds = zones.map((z) => z.id);
  const [countries, matrix, perKg] = zoneIds.length
    ? await Promise.all([
        exec
          .select({ zoneId: pricingZoneCountries.zoneId, iso2: pricingZoneCountries.iso2 })
          .from(pricingZoneCountries)
          .where(inArray(pricingZoneCountries.versionId, versionIds)),
        exec
          .select({ zoneId: pricingMatrixTiers.zoneId, weightMax: pricingMatrixTiers.weightMax, price: pricingMatrixTiers.price })
          .from(pricingMatrixTiers)
          .where(inArray(pricingMatrixTiers.zoneId, zoneIds)),
        exec
          .select({
            zoneId: pricingPerKgTiers.zoneId,
            weightMin: pricingPerKgTiers.weightMin,
            weightMax: pricingPerKgTiers.weightMax,
            unitPrice: pricingPerKgTiers.unitPrice,
          })
          .from(pricingPerKgTiers)
          .where(inArray(pricingPerKgTiers.zoneId, zoneIds)),
      ])
    : [[], [], []];

  const group = <T extends { zoneId: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) m.set(r.zoneId, [...(m.get(r.zoneId) ?? []), r]);
    return m;
  };
  const cByZone = group(countries);
  const mByZone = group(matrix);
  const kByZone = group(perKg);

  const versions: PriceVersion[] = versionRows.map((v) => ({
    id: v.id,
    routeCode: v.routeCode,
    kind: v.kind,
    customerCode: v.customerCode,
    priceGroupCode: v.priceGroupCode,
    mode: v.mode,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    status: "ACTIVE",
    currency: v.currency === "USD" ? "USD" : "VND",
    zones: zones
      .filter((z) => z.versionId === v.id)
      .map((z) => ({
        zoneCode: z.zoneCode,
        countries: (cByZone.get(z.id) ?? []).map((c) => c.iso2),
        matrix: mByZone.get(z.id) ?? [],
        perKg: kByZone.get(z.id) ?? [],
      })),
  }));
  const routeConfigs: RouteConfig[] = routeRows;
  return { routes: routeConfigs, versions };
}
