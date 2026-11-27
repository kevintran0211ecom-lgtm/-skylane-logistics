import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orderPackages, orders, pricingVersions, routes } from "@/drizzle/schema";
import { searchMode } from "@/lib/search";
import { dayRangeIso, type OrderListFilter, type OrderSortKey } from "./filters";
import type { OrderStatus } from "./schemas";
import type { OrderTotals } from "./totals";

export interface OrderFilter extends Partial<OrderListFilter> {
  saleUserId?: string | null; // SALE: chỉ khách mình phụ trách
  page: number;
  pageSize: number;
}

/** 1 mã → tìm gần đúng (mã, tracking, mã/tên khách); nhiều mã → khớp chính xác mã vận đơn hoặc tracking */
function searchWhere(q?: string): SQL | undefined {
  const m = searchMode(q);
  if (m.kind === "none") return undefined;
  if (m.kind === "codes") return or(inArray(orders.billCode, m.codes), inArray(sql`upper(${orders.trackingNumber})`, m.codes));
  const like = `%${m.term}%`;
  return or(ilike(orders.billCode, like), ilike(orders.trackingNumber, like), ilike(orders.customerCode, like), ilike(customers.name, like));
}

function dateWhere(f: Partial<OrderListFilter>): SQL | undefined {
  if (!f.from && !f.to) return undefined;
  if ((f.dateField ?? "sent") === "sent") {
    return and(f.from ? gte(orders.pricingDate, f.from) : undefined, f.to ? lte(orders.pricingDate, f.to) : undefined);
  }
  const col = f.dateField === "exported" ? orders.exportedAt : orders.createdAt;
  const r = dayRangeIso(f.from, f.to);
  return and(r.gte ? gte(col, r.gte) : undefined, r.lt ? lt(col, r.lt) : undefined);
}

const SORT_COLUMN: Record<OrderSortKey, AnyColumn | SQL> = {
  billCode: orders.billCode,
  trackingNumber: orders.trackingNumber,
  customerCode: orders.customerCode,
  customerName: customers.name,
  routeCode: orders.routeCode,
  destinationIso2: orders.destinationIso2,
  status: orders.status,
  pricingDate: orders.pricingDate,
  exportedAt: orders.exportedAt,
  packageCount: orders.packageCount,
  actualWeight: orders.actualWeight,
  volumetricWeight: orders.volumetricWeight,
  billedWeight: orders.billedWeight,
  shippedWeight: orders.shippedWeight,
  sellAmount: orders.sellAmount,
  costAmount: orders.costAmount,
  profit: orders.profit,
  debtStatus: orders.debtStatus,
  createdAt: orders.createdAt,
};

function orderBy(f: Partial<OrderListFilter>): SQL[] {
  if (!f.sort) return [desc(orders.createdAt), desc(orders.id)];
  const col = SORT_COLUMN[f.sort];
  return [f.dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`, desc(orders.id)];
}

function whereOf(f: OrderFilter) {
  const scope = f.saleUserId ? eq(customers.saleUserId, f.saleUserId) : undefined;
  const base = and(searchWhere(f.q), dateWhere(f), scope); // dùng cho số đếm các tab trạng thái
  return { base, where: and(base, f.status ? eq(orders.status, f.status) : undefined) };
}

const fromOrders = () => db.select().from(orders).innerJoin(customers, eq(customers.customerCode, orders.customerCode)).$dynamic();

export async function listOrders(f: OrderFilter) {
  const { base, where } = whereOf(f);
  const [rows, [agg], counts] = await Promise.all([
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
        exportedAt: orders.exportedAt,
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
      .orderBy(...orderBy(f))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    // Dòng tổng theo toàn bộ bộ lọc (không chỉ trang hiện tại)
    db
      .select({
        orders: sql<number>`count(*)::int`,
        packages: sql<number>`coalesce(sum(${orders.packageCount}), 0)::int`,
        actualWeight: sql<string>`coalesce(sum(${orders.actualWeight}), 0)::text`,
        billedWeight: sql<string>`coalesce(sum(${orders.billedWeight}), 0)::text`,
        shippedWeight: sql<string>`coalesce(sum(${orders.shippedWeight}), 0)::text`,
        costAmount: sql<string>`coalesce(sum(${orders.costAmount}), 0)::text`,
        sellAmount: sql<string>`coalesce(sum(${orders.sellAmount}), 0)::text`,
        profit: sql<string>`coalesce(sum(${orders.sellAmount} - ${orders.costAmount}), 0)::text`,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(where),
    // Số đơn theo trạng thái (theo từ khóa + thời gian) cho các tab lọc
    db
      .select({ status: orders.status, n: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(base)
      .groupBy(orders.status),
  ]);
  const totals: OrderTotals = agg;
  return {
    rows,
    total: agg.orders,
    totals,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Partial<Record<OrderStatus, number>>,
  };
}
export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/** Mã vận đơn của TẤT CẢ đơn theo bộ lọc (sao chép "tất cả dòng") — tối đa 20.000 */
export async function listOrderCodes(f: Omit<OrderFilter, "page" | "pageSize">, limit = 20_000) {
  const { where } = whereOf({ ...f, page: 1, pageSize: limit });
  const rows = await fromOrders()
    .where(where)
    .orderBy(...orderBy(f))
    .limit(limit);
  return rows.map((r) => ({ billCode: r.orders.billCode, trackingNumber: r.orders.trackingNumber }));
}

/** Chi tiết 1 đơn cho cửa sổ xem/sửa (kèm kiện) */
export async function getOrderDetail(id: number) {
  const [row] = await db
    .select({
      o: orders,
      customerName: customers.name,
      saleUserId: customers.saleUserId,
      currency: customers.currency,
      sellScope: sql<"CUSTOMER" | "GROUP" | "DEFAULT" | null>`case when ${pricingVersions.id} is null then null when ${pricingVersions.customerCode} is not null then 'CUSTOMER' when ${pricingVersions.priceGroupCode} is not null then 'GROUP' else 'DEFAULT' end`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
    .leftJoin(pricingVersions, eq(pricingVersions.id, orders.sellVersionId))
    .where(eq(orders.id, id));
  if (!row) return null;
  const packages = await db
    .select({ lengthCm: orderPackages.lengthCm, widthCm: orderPackages.widthCm, heightCm: orderPackages.heightCm, actualWeight: orderPackages.actualWeight })
    .from(orderPackages)
    .where(eq(orderPackages.orderId, id))
    .orderBy(orderPackages.seq);
  const o = row.o;
  return {
    id: o.id,
    rowVersion: o.rowVersion,
    customerCode: o.customerCode,
    customerName: row.customerName,
    saleUserId: row.saleUserId,
    currency: row.currency,
    billCode: o.billCode,
    trackingNumber: o.trackingNumber,
    routeCode: o.routeCode,
    assignedRouteCode: o.assignedRouteCode,
    destinationIso2: o.destinationIso2,
    status: o.status,
    debtStatus: o.debtStatus,
    createdAt: o.createdAt,
    shippedAt: o.shippedAt,
    exportedAt: o.exportedAt,
    pricingDate: o.pricingDate,
    receiverName: o.receiverName,
    receiverAddress: o.receiverAddress,
    receiverCity: o.receiverCity,
    receiverState: o.receiverState,
    receiverPostalCode: o.receiverPostalCode,
    receiverPhone: o.receiverPhone,
    receiverEmail: o.receiverEmail,
    hsCode: o.hsCode,
    goodsDescription: o.goodsDescription,
    goodsNameEn: o.goodsNameEn,
    declaredValueUsd: o.declaredValueUsd,
    note: o.note,
    packageCount: o.packageCount,
    actualWeight: o.actualWeight,
    volumetricWeight: o.volumetricWeight,
    billedWeight: o.billedWeight,
    shippedWeight: o.shippedWeight,
    sellAmount: o.sellAmount,
    costAmount: o.costAmount,
    profit: o.profit,
    priceLocked: o.priceLocked,
    manualOverrides: o.manualOverrides,
    sellScope: row.sellScope,
    packages,
  };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

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
