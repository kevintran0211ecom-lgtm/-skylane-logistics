import "server-only";
/**
 * Truy vấn cổng khách hàng — LUÔN lọc theo mã khách của phiên, chỉ trả cột khách được thấy
 * (không giá gốc / lợi nhuận / tuyến chỉ định / nhà cung cấp / ghi chú nội bộ).
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { customerAccounts, customers, orderDrafts, orderPackages, orders, pricingVersions, routes, statements } from "@/drizzle/schema";
import { searchMode } from "@/lib/search";
import type { DraftData } from "@/lib/orders/import-parse";
import { canCustomerEditOrder, type PortalTab } from "./rules";

const n = (v: unknown) => Number(v ?? 0);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

// -----------------------------------------------------------------------------
// Tuyến khách đặt được: đang hoạt động và có bảng giá bán hiệu lực hôm nay cho khách
// (giá riêng khách, bảng giá nhóm của khách, hoặc giá chung)
// -----------------------------------------------------------------------------
export async function portalRoutes(customerCode: string, priceGroupCode: string | null) {
  const d = today();
  const scope = or(
    and(isNull(pricingVersions.customerCode), isNull(pricingVersions.priceGroupCode)),
    eq(pricingVersions.customerCode, customerCode),
    priceGroupCode ? and(isNull(pricingVersions.customerCode), eq(pricingVersions.priceGroupCode, priceGroupCode)) : undefined,
  );
  return db
    .selectDistinct({ code: routes.routeCode, name: routes.name, serviceType: routes.serviceType })
    .from(routes)
    .innerJoin(pricingVersions, eq(pricingVersions.routeCode, routes.routeCode))
    .where(
      and(
        eq(routes.isActive, true),
        eq(pricingVersions.priceKind, "SELL"),
        eq(pricingVersions.status, "ACTIVE"),
        lte(pricingVersions.effectiveFrom, d),
        or(isNull(pricingVersions.effectiveTo), gte(pricingVersions.effectiveTo, d)),
        scope,
      ),
    )
    .orderBy(asc(routes.routeCode));
}
export type PortalRoute = Awaited<ReturnType<typeof portalRoutes>>[number];

// -----------------------------------------------------------------------------
// Công nợ: bảng kê còn nợ + đơn chưa lên bảng kê
// -----------------------------------------------------------------------------
export async function portalDebt(customerCode: string) {
  const [[billed], [unbilled]] = await Promise.all([
    db
      .select({ v: sql<string>`coalesce(sum(${statements.balanceAmount}), 0)::text`, cnt: sql<number>`count(*) filter (where ${statements.balanceAmount} > 0)::int` })
      .from(statements)
      .where(and(eq(statements.customerCode, customerCode), eq(statements.status, "ACTIVE"))),
    db
      .select({ v: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`, cnt: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.customerCode, customerCode), eq(orders.debtStatus, "Chưa thanh toán"))),
  ]);
  return {
    billed: n(billed.v),
    billedStatements: billed.cnt,
    unbilled: n(unbilled.v),
    unbilledOrders: unbilled.cnt,
    total: n(billed.v) + n(unbilled.v),
  };
}

// -----------------------------------------------------------------------------
// Tổng quan
// -----------------------------------------------------------------------------
export async function portalDashboard(customerCode: string) {
  const monthStart = `${today().slice(0, 7)}-01`;
  const [byStatus, [pending], [month], debt, recent] = await Promise.all([
    db
      .select({ status: orders.status, cnt: sql<number>`count(*)::int` })
      .from(orders)
      .where(eq(orders.customerCode, customerCode))
      .groupBy(orders.status),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(orderDrafts)
      .where(and(eq(orderDrafts.customerCode, customerCode), eq(orderDrafts.status, "CHO_XAC_NHAN"))),
    db
      .select({ cnt: sql<number>`count(*)::int`, amount: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`, weight: sql<string>`coalesce(sum(${orders.billedWeight}), 0)::text` })
      .from(orders)
      .where(and(eq(orders.customerCode, customerCode), gte(orders.pricingDate, monthStart))),
    portalDebt(customerCode),
    db
      .select({
        id: orders.id,
        billCode: orders.billCode,
        routeCode: orders.routeCode,
        destinationIso2: orders.destinationIso2,
        status: orders.status,
        pricingDate: orders.pricingDate,
        billedWeight: orders.billedWeight,
        totalAmount: sql<string>`${orders.totalAmount}::text`,
      })
      .from(orders)
      .where(eq(orders.customerCode, customerCode))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(8),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.cnt])) as Record<string, number>,
    totalOrders: byStatus.reduce((t, r) => t + r.cnt, 0),
    pendingDrafts: pending.cnt,
    month: { orders: month.cnt, amount: n(month.amount), weight: n(month.weight) },
    debt,
    recent,
  };
}

// -----------------------------------------------------------------------------
// Danh sách đơn: tab "Chờ xác nhận"/"Đã hủy" = Đơn hàng dự báo; còn lại = Vận đơn theo trạng thái
// -----------------------------------------------------------------------------
export interface PortalOrderRow {
  kind: "draft" | "order";
  id: number;
  billCode: string;
  trackingNumber: string | null;
  routeCode: string;
  destinationIso2: string;
  status: string;
  date: string | null; // ngày gửi (vận đơn) hoặc ngày đặt (đơn chờ)
  receiverName: string | null;
  packageCount: number;
  actualWeight: string;
  volumetricWeight: string | null;
  billedWeight: string | null;
  totalAmount: string | null;
  debtStatus: string | null;
  editable: boolean;
  note: string | null; // lý do từ chối / hủy
}

export interface PortalListFilter {
  tab?: PortalTab;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

function orderSearch(q?: string): SQL | undefined {
  const m = searchMode(q);
  if (m.kind === "none") return undefined;
  if (m.kind === "codes") return or(inArray(orders.billCode, m.codes), inArray(sql`upper(${orders.trackingNumber})`, m.codes));
  const like = `%${m.term}%`;
  return or(ilike(orders.billCode, like), ilike(orders.trackingNumber, like), ilike(orders.receiverName, like));
}
function draftSearch(q?: string): SQL | undefined {
  const m = searchMode(q);
  if (m.kind === "none") return undefined;
  if (m.kind === "codes") return inArray(orderDrafts.billCode, m.codes);
  return ilike(orderDrafts.billCode, `%${m.term}%`);
}

export async function listPortalOrders(customerCode: string, f: PortalListFilter) {
  const isDraftTab = f.tab === "CHO_XAC_NHAN" || f.tab === "DA_LOAI";
  const orderWhere = and(
    eq(orders.customerCode, customerCode),
    orderSearch(f.q),
    f.from ? gte(orders.pricingDate, f.from) : undefined,
    f.to ? lte(orders.pricingDate, f.to) : undefined,
  );
  const draftDay = sql`(${orderDrafts.createdAt} at time zone 'Asia/Saigon')::date`;
  const draftWhereBase = and(
    eq(orderDrafts.customerCode, customerCode),
    draftSearch(f.q),
    f.from ? sql`${draftDay} >= ${f.from}` : undefined,
    f.to ? sql`${draftDay} <= ${f.to}` : undefined,
  );

  const [statusCounts, draftCounts] = await Promise.all([
    db.select({ k: orders.status, cnt: sql<number>`count(*)::int` }).from(orders).where(orderWhere).groupBy(orders.status),
    db
      .select({ k: orderDrafts.status, cnt: sql<number>`count(*)::int` })
      .from(orderDrafts)
      .where(and(draftWhereBase, inArray(orderDrafts.status, ["CHO_XAC_NHAN", "DA_LOAI"])))
      .groupBy(orderDrafts.status),
  ]);
  const counts: Record<string, number> = {};
  for (const r of [...statusCounts, ...draftCounts]) counts[r.k] = r.cnt;
  counts.ALL = statusCounts.reduce((t, r) => t + r.cnt, 0);

  if (isDraftTab) {
    const where = and(draftWhereBase, eq(orderDrafts.status, f.tab as "CHO_XAC_NHAN" | "DA_LOAI"));
    const rows = await db
      .select({ id: orderDrafts.id, billCode: orderDrafts.billCode, data: orderDrafts.data, createdAt: orderDrafts.createdAt, status: orderDrafts.status, rejectReason: orderDrafts.rejectReason })
      .from(orderDrafts)
      .where(where)
      .orderBy(desc(orderDrafts.createdAt), desc(orderDrafts.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);
    const list: PortalOrderRow[] = rows.map((r) => {
      const d = r.data as DraftData;
      const kg = d.packages.reduce((t, p) => t + Number(p.actualWeight || 0), 0);
      return {
        kind: "draft",
        id: r.id,
        billCode: r.billCode,
        trackingNumber: d.trackingNumber,
        routeCode: d.routeCode,
        destinationIso2: d.destinationIso2,
        status: r.status === "CHO_XAC_NHAN" ? "Chờ xác nhận" : "Đã hủy / từ chối",
        date: String(r.createdAt),
        receiverName: d.receiverName,
        packageCount: d.packages.length,
        actualWeight: kg.toFixed(3),
        volumetricWeight: null,
        billedWeight: null,
        totalAmount: null,
        debtStatus: null,
        editable: r.status === "CHO_XAC_NHAN",
        note: r.rejectReason,
      };
    });
    return { rows: list, total: counts[f.tab!] ?? 0, counts, totals: null };
  }

  const where = and(orderWhere, f.tab ? eq(orders.status, f.tab as (typeof orders.status.enumValues)[number]) : undefined);
  const [rows, [agg]] = await Promise.all([
    db
      .select({
        id: orders.id,
        billCode: orders.billCode,
        trackingNumber: orders.trackingNumber,
        routeCode: orders.routeCode,
        destinationIso2: orders.destinationIso2,
        status: orders.status,
        pricingDate: orders.pricingDate,
        receiverName: orders.receiverName,
        packageCount: orders.packageCount,
        actualWeight: orders.actualWeight,
        volumetricWeight: orders.volumetricWeight,
        billedWeight: orders.billedWeight,
        totalAmount: sql<string>`${orders.totalAmount}::text`,
        debtStatus: orders.debtStatus,
        priceLocked: orders.priceLocked,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.pricingDate), desc(orders.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({
        cnt: sql<number>`count(*)::int`,
        pieces: sql<string>`coalesce(sum(${orders.packageCount}), 0)::text`,
        billed: sql<string>`coalesce(sum(${orders.billedWeight}), 0)::text`,
        amount: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
      })
      .from(orders)
      .where(where),
  ]);
  const list: PortalOrderRow[] = rows.map((o) => ({
    kind: "order",
    id: o.id,
    billCode: o.billCode,
    trackingNumber: o.trackingNumber,
    routeCode: o.routeCode,
    destinationIso2: o.destinationIso2,
    status: o.status,
    date: o.pricingDate,
    receiverName: o.receiverName,
    packageCount: o.packageCount,
    actualWeight: o.actualWeight,
    volumetricWeight: o.volumetricWeight,
    billedWeight: o.billedWeight,
    totalAmount: o.totalAmount,
    debtStatus: o.debtStatus,
    editable: canCustomerEditOrder(o),
    note: null,
  }));
  return { rows: list, total: agg.cnt, counts, totals: { orders: agg.cnt, pieces: n(agg.pieces), billed: n(agg.billed), amount: n(agg.amount) } };
}

// -----------------------------------------------------------------------------
// Mở 1 đơn để sửa (chỉ đơn của khách, còn sửa được)
// -----------------------------------------------------------------------------
export async function getPortalOrder(customerCode: string, kind: "draft" | "order", id: number) {
  if (kind === "draft") {
    const [d] = await db
      .select({ id: orderDrafts.id, status: orderDrafts.status, data: orderDrafts.data })
      .from(orderDrafts)
      .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerCode, customerCode)));
    if (!d) return null;
    return { kind, id: d.id, editable: d.status === "CHO_XAC_NHAN", data: d.data as DraftData };
  }
  const [o] = await db
    .select({
      id: orders.id,
      billCode: orders.billCode,
      trackingNumber: orders.trackingNumber,
      routeCode: orders.routeCode,
      destinationIso2: orders.destinationIso2,
      status: orders.status,
      priceLocked: orders.priceLocked,
      receiverName: orders.receiverName,
      receiverPhone: orders.receiverPhone,
      receiverEmail: orders.receiverEmail,
      receiverAddress: orders.receiverAddress,
      receiverCity: orders.receiverCity,
      receiverState: orders.receiverState,
      receiverPostalCode: orders.receiverPostalCode,
      goodsDescription: orders.goodsDescription,
      goodsNameEn: orders.goodsNameEn,
      hsCode: orders.hsCode,
      declaredValueUsd: orders.declaredValueUsd,
      note: orders.note,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.customerCode, customerCode)));
  if (!o) return null;
  const packages = await db
    .select({ lengthCm: orderPackages.lengthCm, widthCm: orderPackages.widthCm, heightCm: orderPackages.heightCm, actualWeight: orderPackages.actualWeight })
    .from(orderPackages)
    .where(eq(orderPackages.orderId, id))
    .orderBy(asc(orderPackages.seq));
  const { status, priceLocked, id: _id, ...rest } = o;
  return { kind, id, editable: canCustomerEditOrder({ status, priceLocked }), status, data: { ...rest, packages } };
}

// -----------------------------------------------------------------------------
// Bảng kê của khách (đã chốt)
// -----------------------------------------------------------------------------
export async function listPortalStatements(customerCode: string) {
  return db
    .select({
      id: statements.id,
      statementNo: statements.statementNo,
      name: statements.name,
      issuedAt: statements.issuedAt,
      periodFrom: statements.periodFrom,
      periodTo: statements.periodTo,
      orderCount: statements.orderCount,
      totalAmount: sql<string>`${statements.totalAmount}::text`,
      paidAmount: statements.paidAmount,
      balanceAmount: sql<string>`${statements.balanceAmount}::text`,
      debtStatus: statements.debtStatus,
    })
    .from(statements)
    .where(and(eq(statements.customerCode, customerCode), eq(statements.status, "ACTIVE")))
    .orderBy(desc(statements.issuedAt), desc(statements.id))
    .limit(500);
}

/** Khách còn hoạt động (dùng cho tải file mẫu) */
export async function portalCustomerName(customerCode: string) {
  const [c] = await db.select({ name: customers.name }).from(customers).where(eq(customers.customerCode, customerCode));
  return c?.name ?? null;
}

// -----------------------------------------------------------------------------
// Nội bộ: danh sách khách + số tài khoản cổng (trang Cổng khách hàng)
// -----------------------------------------------------------------------------
export async function listPortalCustomers(saleUserId?: string | null) {
  return db
    .select({
      code: customers.customerCode,
      name: customers.name,
      isActive: customers.isActive,
      accounts: sql<number>`count(${customerAccounts.id})::int`,
      activeAccounts: sql<number>`count(${customerAccounts.id}) filter (where ${customerAccounts.isActive})::int`,
      lastLoginAt: sql<string | null>`max(${customerAccounts.lastLoginAt})::text`,
    })
    .from(customers)
    .leftJoin(customerAccounts, eq(customerAccounts.customerCode, customers.customerCode))
    .where(saleUserId ? eq(customers.saleUserId, saleUserId) : undefined)
    .groupBy(customers.customerCode, customers.name, customers.isActive)
    .orderBy(asc(customers.customerCode));
}
export type PortalCustomerRow = Awaited<ReturnType<typeof listPortalCustomers>>[number];
