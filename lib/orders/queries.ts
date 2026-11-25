import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orders, routes } from "@/drizzle/schema";
import type { OrderStatus } from "./schemas";

export interface OrderFilter {
  q?: string;
  status?: OrderStatus;
  saleUserId?: string | null; // SALE: chỉ khách mình phụ trách
  page: number;
  pageSize: number;
}

function searchWhere(q?: string) {
  const term = q?.trim();
  if (!term) return undefined;
  const like = `%${term}%`;
  return or(
    ilike(orders.billCode, like),
    ilike(orders.trackingNumber, like),
    ilike(orders.customerCode, like),
    ilike(customers.name, like),
  );
}

export async function listOrders(f: OrderFilter) {
  const search = and(searchWhere(f.q), f.saleUserId ? eq(customers.saleUserId, f.saleUserId) : undefined);
  const where = and(search, f.status ? eq(orders.status, f.status) : undefined);
  const [rows, [{ count }], counts] = await Promise.all([
    db
      .select({
        id: orders.id,
        billCode: orders.billCode,
        customerCode: orders.customerCode,
        customerName: customers.name,
        trackingNumber: orders.trackingNumber,
        routeCode: orders.routeCode,
        assignedRouteCode: orders.assignedRouteCode,
        destinationIso2: orders.destinationIso2,
        status: orders.status,
        debtStatus: orders.debtStatus,
        createdAt: orders.createdAt,
        pricingDate: orders.pricingDate,
        packageCount: orders.packageCount,
        actualWeight: orders.actualWeight,
        volumetricWeight: orders.volumetricWeight,
        billedWeight: orders.billedWeight,
        shippedWeight: orders.shippedWeight,
        sellAmount: orders.sellAmount,
        costAmount: orders.costAmount,
        profit: orders.profit,
        priceLocked: orders.priceLocked,
        manualOverrides: orders.manualOverrides,
        receiverName: orders.receiverName,
        note: orders.note,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(where),
    // Số đơn theo trạng thái (theo từ khóa tìm kiếm) cho các tab lọc
    db
      .select({ status: orders.status, n: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(search)
      .groupBy(orders.status),
  ]);
  return { rows, total: count, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<OrderStatus, number>> };
}
export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

export const listActiveRoutes = () =>
  db
    .select({ code: routes.routeCode, name: routes.name, serviceType: routes.serviceType })
    .from(routes)
    .where(eq(routes.isActive, true))
    .orderBy(asc(routes.routeCode));

export const listOrderCustomers = (saleUserId?: string | null) =>
  db
    .select({ code: customers.customerCode, name: customers.name, syncConfig: customers.syncConfig })
    .from(customers)
    .where(and(eq(customers.isActive, true), saleUserId ? eq(customers.saleUserId, saleUserId) : undefined))
    .orderBy(asc(customers.customerCode));
