import "server-only";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { appUsers, customers, orders, statements } from "@/drizzle/schema";

export interface DashboardFilter {
  from: string; // YYYY-MM-DD (Ngày gửi hàng)
  to: string;
  granularity: "day" | "month";
  customerCode?: string;
  saleUserId?: string; // lọc theo Nhân viên Sale (hoặc phạm vi bắt buộc của SALE)
}

const n = (v: unknown) => Number(v ?? 0);

/** Dashboard: doanh thu / giá vốn / lợi nhuận theo Ngày gửi hàng; công nợ phải thu tại thời điểm hiện tại */
export async function getDashboard(f: DashboardFilter) {
  const party: SQL | undefined = and(
    f.customerCode ? eq(customers.customerCode, f.customerCode) : undefined,
    f.saleUserId ? eq(customers.saleUserId, f.saleUserId) : undefined,
  );
  const inRange = and(gte(orders.pricingDate, f.from), lte(orders.pricingDate, f.to), party);
  const bucket =
    f.granularity === "month"
      ? sql<string>`to_char(date_trunc('month', ${orders.pricingDate}), 'YYYY-MM')`
      : sql<string>`to_char(${orders.pricingDate}, 'YYYY-MM-DD')`;

  const money = {
    revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
    cost: sql<string>`coalesce(sum(${orders.costAmount}), 0)::text`,
    profit: sql<string>`coalesce(sum(${orders.profit}), 0)::text`,
  };

  const [[totals], series, byCustomer, bySale, [billedDebt], [unbilledDebt]] = await Promise.all([
    db
      .select({ ...money, orders: sql<number>`count(*)::int`, weight: sql<string>`coalesce(sum(${orders.billedWeight}), 0)::text` })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(inRange),
    db
      .select({ bucket, ...money })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(inRange)
      .groupBy(bucket)
      .orderBy(bucket),
    db
      .select({ code: customers.customerCode, name: customers.name, orders: sql<number>`count(*)::int`, ...money })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(inRange)
      .groupBy(customers.customerCode, customers.name)
      .orderBy(sql`sum(${orders.totalAmount}) desc nulls last`)
      .limit(10),
    db
      .select({ saleId: appUsers.id, sale: appUsers.fullName, orders: sql<number>`count(*)::int`, ...money })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .leftJoin(appUsers, eq(appUsers.id, customers.saleUserId))
      .where(inRange)
      .groupBy(appUsers.id, appUsers.fullName)
      .orderBy(sql`sum(${orders.totalAmount}) desc nulls last`),
    // Công nợ đã lên bảng kê: còn lại của bảng kê hiệu lực
    db
      .select({ v: sql<string>`coalesce(sum(${statements.balanceAmount}), 0)::text`, cnt: sql<number>`count(*) filter (where ${statements.balanceAmount} > 0)::int` })
      .from(statements)
      .innerJoin(customers, eq(customers.customerCode, statements.customerCode))
      .where(and(eq(statements.status, "ACTIVE"), party)),
    // Đơn chưa lên bảng kê (đã phát sinh doanh thu, chưa đòi)
    db
      .select({ v: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`, cnt: sql<number>`count(*)::int` })
      .from(orders)
      .innerJoin(customers, eq(customers.customerCode, orders.customerCode))
      .where(and(eq(orders.debtStatus, "Chưa thanh toán"), party)),
  ]);

  // Lấp đủ các mốc thời gian trống để biểu đồ liên tục
  const byBucket = new Map(series.map((s) => [s.bucket, s]));
  const points: { bucket: string; revenue: number; cost: number; profit: number }[] = [];
  const cur = new Date(`${f.from}T00:00:00Z`);
  const end = new Date(`${f.to}T00:00:00Z`);
  if (f.granularity === "month") cur.setUTCDate(1);
  for (let i = 0; cur <= end && i < 400; i++) {
    const key = f.granularity === "month" ? cur.toISOString().slice(0, 7) : cur.toISOString().slice(0, 10);
    const s = byBucket.get(key);
    points.push({ bucket: key, revenue: n(s?.revenue), cost: n(s?.cost), profit: n(s?.profit) });
    if (f.granularity === "month") cur.setUTCMonth(cur.getUTCMonth() + 1);
    else cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return {
    totals: { revenue: n(totals.revenue), cost: n(totals.cost), profit: n(totals.profit), orders: totals.orders, weight: n(totals.weight) },
    receivable: {
      billed: n(billedDebt.v),
      billedStatements: billedDebt.cnt,
      unbilled: n(unbilledDebt.v),
      unbilledOrders: unbilledDebt.cnt,
      total: n(billedDebt.v) + n(unbilledDebt.v),
    },
    points,
    byCustomer: byCustomer.map((c) => ({ ...c, revenue: n(c.revenue), cost: n(c.cost), profit: n(c.profit) })),
    bySale: bySale.map((s) => ({ ...s, sale: s.sale ?? "Chưa gán Sale", revenue: n(s.revenue), cost: n(s.cost), profit: n(s.profit) })),
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
