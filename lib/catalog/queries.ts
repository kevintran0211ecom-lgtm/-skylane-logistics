import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appUsers, customers, priceGroups, routes, suppliers } from "@/drizzle/schema";

export async function listCustomers({ q, page, pageSize }: { q?: string; page: number; pageSize: number }) {
  const term = q?.trim();
  const where = term ? or(ilike(customers.customerCode, `%${term}%`), ilike(customers.name, `%${term}%`)) : undefined;
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        customerCode: customers.customerCode,
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        address: customers.address,
        saleUserId: customers.saleUserId,
        saleName: appUsers.fullName,
        priceGroupCode: customers.priceGroupCode,
        priceAdjustPct: customers.priceAdjustPct,
        currency: customers.currency,
        syncSourceType: customers.syncSourceType,
        syncEnabled: customers.syncEnabled,
        syncConfig: customers.syncConfig,
        isActive: customers.isActive,
        note: customers.note,
      })
      .from(customers)
      .leftJoin(appUsers, eq(appUsers.id, customers.saleUserId))
      .where(where)
      .orderBy(asc(customers.customerCode))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);
  return { rows, total: count };
}
export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

export async function listRoutes() {
  return db
    .select({
      routeCode: routes.routeCode,
      name: routes.name,
      supplierCode: routes.supplierCode,
      supplierName: suppliers.name,
      serviceType: routes.serviceType,
      weightCalcMode: routes.weightCalcMode,
      dimDivisor: routes.dimDivisor,
      isActive: routes.isActive,
      note: routes.note,
    })
    .from(routes)
    .leftJoin(suppliers, eq(suppliers.supplierCode, routes.supplierCode))
    .orderBy(asc(routes.routeCode));
}
export type RouteRow = Awaited<ReturnType<typeof listRoutes>>[number];

export const listSuppliers = () =>
  db.select({ code: suppliers.supplierCode, name: suppliers.name }).from(suppliers).orderBy(asc(suppliers.supplierCode));

export const listPriceGroups = () =>
  db
    .select({ code: priceGroups.code, name: priceGroups.name, adjustPct: priceGroups.adjustPct })
    .from(priceGroups)
    .where(eq(priceGroups.isActive, true))
    .orderBy(asc(priceGroups.code));

/** Trang Nhóm giá: % so với giá chung, số khách, số tuyến có bảng giá riêng đang áp dụng */
export const listPriceGroupsDetail = () =>
  db
    .select({
      code: priceGroups.code,
      name: priceGroups.name,
      adjustPct: priceGroups.adjustPct,
      isActive: priceGroups.isActive,
      note: priceGroups.note,
      customerCount: sql<number>`(select count(*)::int from customers c where c.price_group_code = ${priceGroups.code})`,
      ownRoutes: sql<string[]>`coalesce((select array_agg(distinct v.route_code order by v.route_code) from pricing_versions v
        where v.price_group_code = ${priceGroups.code} and v.price_kind = 'SELL' and v.status = 'ACTIVE'
          and (v.effective_to is null or v.effective_to >= (now() at time zone 'Asia/Saigon')::date)), '{}')`,
    })
    .from(priceGroups)
    .orderBy(asc(priceGroups.code));
export type PriceGroupRow = Awaited<ReturnType<typeof listPriceGroupsDetail>>[number];

export const listSaleUsers = () =>
  db
    .select({ id: appUsers.id, fullName: appUsers.fullName })
    .from(appUsers)
    .where(and(eq(appUsers.isActive, true), eq(appUsers.role, "SALE")))
    .orderBy(asc(appUsers.fullName));

export const listCustomerOptions = (saleUserId?: string | null) =>
  db
    .select({ code: customers.customerCode, name: customers.name })
    .from(customers)
    .where(and(eq(customers.isActive, true), saleUserId ? eq(customers.saleUserId, saleUserId) : undefined))
    .orderBy(asc(customers.customerCode));
