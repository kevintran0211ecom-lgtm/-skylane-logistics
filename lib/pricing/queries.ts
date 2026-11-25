import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  pricingMatrixTiers,
  pricingPerKgTiers,
  pricingVersions,
  pricingZoneCountries,
  pricingZones,
  routes,
} from "@/drizzle/schema";

export interface VersionFilter {
  routeCode?: string;
  kind?: "COST" | "SELL";
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  page: number;
  pageSize: number;
}

const versionColumns = {
  id: pricingVersions.id,
  routeCode: pricingVersions.routeCode,
  serviceType: routes.serviceType,
  priceKind: pricingVersions.priceKind,
  customerCode: pricingVersions.customerCode,
  priceGroupCode: pricingVersions.priceGroupCode,
  name: pricingVersions.name,
  pricingMode: pricingVersions.pricingMode,
  currency: pricingVersions.currency,
  effectiveFrom: pricingVersions.effectiveFrom,
  effectiveTo: pricingVersions.effectiveTo,
  status: pricingVersions.status,
  note: pricingVersions.note,
  createdAt: pricingVersions.createdAt,
};

export async function listVersions(f: VersionFilter) {
  const where = and(
    f.routeCode ? eq(pricingVersions.routeCode, f.routeCode) : undefined,
    f.kind ? eq(pricingVersions.priceKind, f.kind) : undefined,
    f.status ? eq(pricingVersions.status, f.status) : undefined,
  );
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        ...versionColumns,
        zoneCount: sql<number>`(select count(*)::int from pricing_zones z where z.version_id = ${pricingVersions.id})`,
        countryCount: sql<number>`(select count(*)::int from pricing_zone_countries c where c.version_id = ${pricingVersions.id})`,
      })
      .from(pricingVersions)
      .innerJoin(routes, eq(routes.routeCode, pricingVersions.routeCode))
      .where(where)
      .orderBy(asc(pricingVersions.routeCode), asc(pricingVersions.priceKind), desc(pricingVersions.effectiveFrom), desc(pricingVersions.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(pricingVersions).where(where),
  ]);
  return { rows, total: count };
}
export type VersionRow = Awaited<ReturnType<typeof listVersions>>["rows"][number];

export async function getVersionDetail(id: number) {
  const [version] = await db
    .select(versionColumns)
    .from(pricingVersions)
    .innerJoin(routes, eq(routes.routeCode, pricingVersions.routeCode))
    .where(eq(pricingVersions.id, id));
  if (!version) return null;

  const zones = await db
    .select({ id: pricingZones.id, zoneCode: pricingZones.zoneCode, zoneName: pricingZones.zoneName })
    .from(pricingZones)
    .where(eq(pricingZones.versionId, id))
    .orderBy(asc(pricingZones.sortOrder), asc(pricingZones.zoneCode));
  const zoneIds = zones.map((z) => z.id);

  const [countries, matrix, perKg, history] = await Promise.all([
    db
      .select({ zoneId: pricingZoneCountries.zoneId, iso2: pricingZoneCountries.iso2 })
      .from(pricingZoneCountries)
      .where(eq(pricingZoneCountries.versionId, id))
      .orderBy(asc(pricingZoneCountries.iso2)),
    zoneIds.length
      ? db
          .select({ zoneId: pricingMatrixTiers.zoneId, weightMax: pricingMatrixTiers.weightMax, price: pricingMatrixTiers.price })
          .from(pricingMatrixTiers)
          .where(inArray(pricingMatrixTiers.zoneId, zoneIds))
      : [],
    zoneIds.length
      ? db
          .select({
            zoneId: pricingPerKgTiers.zoneId,
            weightMin: pricingPerKgTiers.weightMin,
            weightMax: pricingPerKgTiers.weightMax,
            unitPrice: pricingPerKgTiers.unitPrice,
          })
          .from(pricingPerKgTiers)
          .where(inArray(pricingPerKgTiers.zoneId, zoneIds))
      : [],
    // Lịch sử: các phiên bản cùng tuyến + loại + phạm vi
    db
      .select({
        id: pricingVersions.id,
        effectiveFrom: pricingVersions.effectiveFrom,
        effectiveTo: pricingVersions.effectiveTo,
        status: pricingVersions.status,
        pricingMode: pricingVersions.pricingMode,
      })
      .from(pricingVersions)
      .where(
        and(
          eq(pricingVersions.routeCode, version.routeCode),
          eq(pricingVersions.priceKind, version.priceKind),
          version.customerCode ? eq(pricingVersions.customerCode, version.customerCode) : isNull(pricingVersions.customerCode),
          version.priceGroupCode ? eq(pricingVersions.priceGroupCode, version.priceGroupCode) : isNull(pricingVersions.priceGroupCode),
        ),
      )
      .orderBy(desc(pricingVersions.effectiveFrom), desc(pricingVersions.id)),
  ]);

  return {
    version,
    zones: zones.map((z) => ({ ...z, countries: countries.filter((c) => c.zoneId === z.id).map((c) => c.iso2) })),
    matrix,
    perKg,
    history,
  };
}
export type VersionDetail = NonNullable<Awaited<ReturnType<typeof getVersionDetail>>>;
