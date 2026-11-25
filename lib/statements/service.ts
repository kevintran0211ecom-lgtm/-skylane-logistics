import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orders, statementItems, statements } from "@/drizzle/schema";
import { formatStatementNo, STATEMENT_PREFIX, statementName } from "./format";
import { repriceOrders, type RepriceReport } from "@/lib/orders/reprice";

export class StatementError extends Error {}

const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

// =============================================================================
// Đơn chưa lên bảng kê
// =============================================================================
export async function listUnbilledOrders(f: { customerCode: string; from?: string; to?: string }) {
  return db
    .select({
      id: orders.id,
      billCode: orders.billCode,
      trackingNumber: orders.trackingNumber,
      pricingDate: orders.pricingDate,
      status: orders.status,
      routeCode: orders.routeCode,
      destinationIso2: orders.destinationIso2,
      receiverName: orders.receiverName,
      packageCount: orders.packageCount,
      billedWeight: orders.billedWeight,
      sellAmount: orders.sellAmount,
      surchargeAmount: orders.surchargeAmount,
      totalAmount: orders.totalAmount,
      priceLocked: orders.priceLocked,
    })
    .from(orders)
    .where(
      and(
        eq(orders.customerCode, f.customerCode),
        eq(orders.debtStatus, "Chưa thanh toán"),
        f.from ? gte(orders.pricingDate, f.from) : undefined,
        f.to ? lte(orders.pricingDate, f.to) : undefined,
        // chưa nằm trong bảng kê hiệu lực nào (phòng dữ liệu cũ)
        sql`not exists (select 1 from statement_items si where si.order_id = ${orders.id} and si.is_active)`,
      ),
    )
    .orderBy(asc(orders.pricingDate), asc(orders.id))
    .limit(2000);
}
export type UnbilledOrder = Awaited<ReturnType<typeof listUnbilledOrders>>[number];

// =============================================================================
// Tạo bảng kê — 1 transaction
// =============================================================================
export async function createStatement(input: {
  customerCode: string;
  orderIds: number[];
  periodFrom: string | null;
  periodTo: string | null;
  note: string | null;
}): Promise<{ id: number; statementNo: string; name: string; orderCount: number; total: string }> {
  const ids = [...new Set(input.orderIds)];
  if (ids.length === 0) throw new StatementError("Chưa chọn vận đơn nào.");
  if (ids.length > 2000) throw new StatementError("Một bảng kê tối đa 2.000 vận đơn.");

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select({ code: customers.customerCode, name: customers.name, currency: customers.currency })
      .from(customers)
      .where(eq(customers.customerCode, input.customerCode));
    if (!customer) throw new StatementError(`Không tìm thấy khách hàng ${input.customerCode}.`);

    // Khóa các đơn để không ai sửa/lên bảng kê khác cùng lúc
    const rows = await tx
      .select()
      .from(orders)
      .where(inArray(orders.id, ids))
      .orderBy(asc(orders.pricingDate), asc(orders.id))
      .for("update");
    if (rows.length !== ids.length) throw new StatementError("Một số vận đơn không còn tồn tại — tải lại danh sách.");
    const wrongCustomer = rows.filter((o) => o.customerCode !== customer.code);
    if (wrongCustomer.length) throw new StatementError(`Đơn ${wrongCustomer[0].billCode} không thuộc khách hàng ${customer.code}.`);
    const billed = rows.filter((o) => o.debtStatus !== "Chưa thanh toán");
    if (billed.length) {
      throw new StatementError(`Đơn ${billed.map((o) => o.billCode).slice(0, 5).join(", ")} đã lên bảng kê (${billed[0].debtStatus}).`);
    }

    // Cấp số trong ngày (atomic): SKLddMMyy + 4 số
    const day = todaySaigon();
    const counter = await tx.execute<{ last_no: number }>(sql`
      insert into doc_counters (prefix, day, last_no) values (${STATEMENT_PREFIX}, ${day}, 1)
      on conflict (prefix, day) do update set last_no = doc_counters.last_no + 1
      returning last_no`);
    const statementNo = formatStatementNo(day, Number(counter[0].last_no));
    const name = statementName(customer.name, customer.code, statementNo);

    const subtotal = await tx.execute<{ w: string; t: string }>(sql`
      select coalesce(sum(billed_weight), 0)::text as w, coalesce(sum(total_amount), 0)::text as t
      from orders where id in ${sql`(${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`}`);

    const [st] = await tx
      .insert(statements)
      .values({
        statementNo,
        name,
        customerCode: customer.code,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        currency: customer.currency,
        orderCount: rows.length,
        totalWeight: subtotal[0].w,
        subtotalAmount: subtotal[0].t,
        debtStatus: "xuất bảng kê",
        note: input.note,
      })
      .returning({ id: statements.id });

    // Snapshot chi tiết đơn tại thời điểm xuất bảng kê
    for (let i = 0; i < rows.length; i += 1000) {
      await tx.insert(statementItems).values(
        rows.slice(i, i + 1000).map((o, k) => ({
          statementId: st.id,
          orderId: o.id,
          lineNo: i + k + 1,
          orderKey: o.orderKey!,
          billCode: o.billCode,
          shippedDate: o.pricingDate,
          routeCode: o.routeCode,
          destinationIso2: o.destinationIso2,
          receiverName: o.receiverName,
          packageCount: o.packageCount,
          billedWeight: o.billedWeight,
          sellAmount: o.sellAmount,
          surchargeAmount: o.surchargeAmount,
          totalAmount: o.totalAmount!,
          snapshot: { trackingNumber: o.trackingNumber, note: o.note, createdAt: o.createdAt },
        })),
      );
    }

    // Chuyển công nợ + khóa cứng giá (trigger DB cũng tự khóa khi sang 'xuất bảng kê')
    await tx
      .update(orders)
      .set({ debtStatus: "xuất bảng kê", priceLocked: true, priceLockedAt: sql`coalesce(${orders.priceLockedAt}, now())` })
      .where(inArray(orders.id, ids));

    return { id: st.id, statementNo, name, orderCount: rows.length, total: subtotal[0].t };
  });
}

// =============================================================================
// Hủy bảng kê — 1 transaction
// =============================================================================
export async function cancelStatement(id: number, reason: string | null) {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(statements).where(eq(statements.id, id)).for("update");
    if (!st) throw new StatementError("Không tìm thấy bảng kê.");
    if (st.status === "CANCELLED") throw new StatementError("Bảng kê đã hủy trước đó.");
    if (Number(st.paidAmount) > 0) {
      throw new StatementError("Bảng kê đã có phiếu thu phân bổ — hãy gỡ phân bổ thanh toán trước khi hủy.");
    }

    await tx
      .update(statements)
      .set({ status: "CANCELLED", cancelledAt: sql`now()`, cancelReason: reason })
      .where(eq(statements.id, id));
    const items = await tx
      .update(statementItems)
      .set({ isActive: false })
      .where(and(eq(statementItems.statementId, id), eq(statementItems.isActive, true)))
      .returning({ orderId: statementItems.orderId });

    // Đơn không còn thuộc bảng kê hiệu lực nào khác: công nợ về "Chưa thanh toán",
    // MỞ KHÓA GIÁ để sửa được và tính lại giá ngay (trừ trường đang ghi đè thủ công).
    const orderIds = items.map((i) => i.orderId);
    let restored = 0;
    let reprice: RepriceReport = { repriced: 0, locked: 0, failed: [] };
    if (orderIds.length) {
      const res = await tx
        .update(orders)
        .set({ debtStatus: "Chưa thanh toán", priceLocked: false, priceLockedAt: null })
        .where(
          and(
            inArray(orders.id, orderIds),
            sql`not exists (select 1 from statement_items si where si.order_id = ${orders.id} and si.is_active)`,
          ),
        )
        .returning({ id: orders.id });
      restored = res.length;
      reprice = await repriceOrders(tx, res.map((r) => r.id));
    }
    return { statementNo: st.statementNo, restored, total: orderIds.length, reprice };
  });
}

// =============================================================================
// Truy vấn
// =============================================================================
export async function listStatements(f: {
  q?: string;
  customerCode?: string;
  status?: "ACTIVE" | "CANCELLED";
  saleUserId?: string | null;
  page: number;
  pageSize: number;
}) {
  const term = f.q?.trim();
  const where = and(
    term ? or(ilike(statements.statementNo, `%${term}%`), ilike(statements.name, `%${term}%`)) : undefined,
    f.customerCode ? eq(statements.customerCode, f.customerCode) : undefined,
    f.status ? eq(statements.status, f.status) : undefined,
    f.saleUserId ? eq(customers.saleUserId, f.saleUserId) : undefined,
  );
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: statements.id,
        statementNo: statements.statementNo,
        name: statements.name,
        customerCode: statements.customerCode,
        issuedAt: statements.issuedAt,
        periodFrom: statements.periodFrom,
        periodTo: statements.periodTo,
        orderCount: statements.orderCount,
        totalAmount: statements.totalAmount,
        paidAmount: statements.paidAmount,
        balanceAmount: statements.balanceAmount,
        currency: statements.currency,
        debtStatus: statements.debtStatus,
        status: statements.status,
      })
      .from(statements)
      .innerJoin(customers, eq(customers.customerCode, statements.customerCode))
      .where(where)
      .orderBy(desc(statements.issuedAt), desc(statements.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(statements)
      .innerJoin(customers, eq(customers.customerCode, statements.customerCode))
      .where(where),
  ]);
  return { rows, total: count };
}
export type StatementRow = Awaited<ReturnType<typeof listStatements>>["rows"][number];

export async function getStatement(id: number) {
  const [st] = await db
    .select({ st: statements, customerName: customers.name, saleUserId: customers.saleUserId })
    .from(statements)
    .innerJoin(customers, eq(customers.customerCode, statements.customerCode))
    .where(eq(statements.id, id));
  if (!st) return null;
  const items = await db.select().from(statementItems).where(eq(statementItems.statementId, id)).orderBy(asc(statementItems.lineNo));
  return { ...st.st, customerName: st.customerName, saleUserId: st.saleUserId, items };
}
export type StatementDetail = NonNullable<Awaited<ReturnType<typeof getStatement>>>;
