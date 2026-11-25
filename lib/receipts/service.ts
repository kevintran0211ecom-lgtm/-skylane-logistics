import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, orders, receiptAllocations, receipts, statementItems, statements } from "@/drizzle/schema";
import { formatReceiptNo, RECEIPT_PREFIX } from "./format";

export class ReceiptError extends Error {}

export const todaySaigon = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());

// =============================================================================
// Công nợ khách hàng
// =============================================================================
export async function getCustomerDebt(customerCode: string) {
  const [summary] = await db
    .select({
      total: sql<string>`coalesce(sum(${statements.totalAmount}), 0)::text`,
      paid: sql<string>`coalesce(sum(${statements.paidAmount}), 0)::text`,
      balance: sql<string>`coalesce(sum(${statements.balanceAmount}), 0)::text`,
    })
    .from(statements)
    .where(and(eq(statements.customerCode, customerCode), eq(statements.status, "ACTIVE")));
  const [credit] = await db
    .select({ credit: sql<string>`coalesce(sum(${receipts.overpaidAmount}), 0)::text` })
    .from(receipts)
    .where(and(eq(receipts.customerCode, customerCode), eq(receipts.status, "ACTIVE")));

  const [open, history] = await Promise.all([
    db
      .select({
        id: statements.id,
        statementNo: statements.statementNo,
        name: statements.name,
        issuedAt: statements.issuedAt,
        orderCount: statements.orderCount,
        totalAmount: statements.totalAmount,
        paidAmount: statements.paidAmount,
        balance: statements.balanceAmount,
        debtStatus: statements.debtStatus,
      })
      .from(statements)
      .where(and(eq(statements.customerCode, customerCode), eq(statements.status, "ACTIVE"), gt(statements.balanceAmount, "0")))
      .orderBy(asc(statements.issuedAt), asc(statements.id)),
    db
      .select({
        id: receipts.id,
        receiptNo: receipts.receiptNo,
        receivedAt: receipts.receivedAt,
        amount: receipts.amount,
        allocatedAmount: receipts.allocatedAmount,
        overpaidAmount: receipts.overpaidAmount,
        bankRef: receipts.bankRef,
        proofImages: receipts.proofImages,
        allocations: sql<string>`coalesce((select string_agg(s.statement_no || ': ' || ra.amount::bigint, ', ' order by s.issued_at)
          from receipt_allocations ra join statements s on s.id = ra.statement_id where ra.receipt_id = ${receipts.id}), '')`,
      })
      .from(receipts)
      .where(and(eq(receipts.customerCode, customerCode), eq(receipts.status, "ACTIVE")))
      .orderBy(desc(receipts.receivedAt), desc(receipts.id))
      .limit(20),
  ]);
  return { ...summary, credit: credit.credit, open, history };
}
export type CustomerDebt = Awaited<ReturnType<typeof getCustomerDebt>>;

/** Mã phiếu thu dự kiến (số chính thức cấp khi lưu) */
export async function previewReceiptNo(): Promise<string> {
  const day = todaySaigon();
  const r = await db.execute<{ last_no: number }>(sql`select last_no from doc_counters where prefix = ${RECEIPT_PREFIX} and day = ${day}`);
  return formatReceiptNo(day, Math.min(999, Number(r[0]?.last_no ?? 0) + 1));
}

// =============================================================================
// Lưu phiếu thu + phân bổ — 1 transaction
// =============================================================================
export interface SaveReceiptInput {
  customerCode: string;
  amount: string; // VND nguyên
  receivedAt: string | null; // ISO +07:00
  method: "CHUYEN_KHOAN" | "TIEN_MAT" | "KHAC";
  receivedAccount: string;
  bankRef: string | null;
  payerName: string | null;
  note: string | null;
  allocations: { statementId: number; amount: string }[];
  proofImages: string[];
}

const debtOf = (total: number, paid: number) =>
  paid <= 0 ? ("xuất bảng kê" as const) : paid >= total ? ("Đã thanh toán" as const) : ("Thanh toán 1 phần" as const);

export async function saveReceipt(input: SaveReceiptInput) {
  const amount = Number(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ReceiptError("Số tiền nhận phải lớn hơn 0.");
  const allocs = input.allocations.filter((a) => Number(a.amount) > 0);
  if (new Set(allocs.map((a) => a.statementId)).size !== allocs.length) throw new ReceiptError("Mỗi bảng kê chỉ phân bổ một lần.");
  const allocTotal = allocs.reduce((t, a) => t + Number(a.amount), 0);
  if (allocTotal > amount) throw new ReceiptError("Tổng phân bổ vượt quá số tiền nhận.");

  return db.transaction(async (tx) => {
    const [cust] = await tx.select({ code: customers.customerCode }).from(customers).where(eq(customers.customerCode, input.customerCode));
    if (!cust) throw new ReceiptError(`Không tìm thấy khách hàng ${input.customerCode}.`);

    // Khóa các bảng kê được phân bổ & kiểm tra còn nợ
    const ids = allocs.map((a) => a.statementId);
    const locked = ids.length
      ? await tx.select().from(statements).where(inArray(statements.id, ids)).for("update")
      : [];
    for (const a of allocs) {
      const s = locked.find((x) => x.id === a.statementId);
      if (!s || s.customerCode !== input.customerCode) throw new ReceiptError("Bảng kê không thuộc khách hàng này.");
      if (s.status !== "ACTIVE") throw new ReceiptError(`Bảng kê ${s.statementNo} đã hủy.`);
      if (Number(a.amount) > Number(s.balanceAmount)) {
        throw new ReceiptError(`Phân bổ cho ${s.statementNo} vượt số còn nợ (${Number(s.balanceAmount).toLocaleString("vi-VN")}).`);
      }
    }

    const day = todaySaigon();
    const counter = await tx.execute<{ last_no: number }>(sql`
      insert into doc_counters (prefix, day, last_no) values (${RECEIPT_PREFIX}, ${day}, 1)
      on conflict (prefix, day) do update set last_no = doc_counters.last_no + 1
      returning last_no`);
    const receiptNo = formatReceiptNo(day, Number(counter[0].last_no));

    const [rc] = await tx
      .insert(receipts)
      .values({
        receiptNo,
        customerCode: input.customerCode,
        ...(input.receivedAt && { receivedAt: input.receivedAt }),
        amount: String(amount),
        method: input.method,
        receivedAccount: input.receivedAccount,
        bankRef: input.bankRef,
        payerName: input.payerName,
        proofImages: input.proofImages,
        note: input.note,
      })
      .returning({ id: receipts.id });

    // Trigger DB cộng dồn statements.paid_amount & receipts.allocated_amount (CHECK chặn vượt)
    if (allocs.length) {
      await tx.insert(receiptAllocations).values(allocs.map((a) => ({ receiptId: rc.id, statementId: a.statementId, amount: a.amount })));
    }

    // Trạng thái công nợ bảng kê & đơn hàng theo số đã thu
    const updated = ids.length
      ? await tx
          .select({ id: statements.id, statementNo: statements.statementNo, total: statements.totalAmount, paid: statements.paidAmount })
          .from(statements)
          .where(inArray(statements.id, ids))
      : [];
    for (const s of updated) {
      const status = debtOf(Number(s.total), Number(s.paid));
      await tx.update(statements).set({ debtStatus: status }).where(eq(statements.id, s.id));
      await tx
        .update(orders)
        .set({ debtStatus: status })
        .where(
          inArray(
            orders.id,
            tx
              .select({ id: statementItems.orderId })
              .from(statementItems)
              .where(and(eq(statementItems.statementId, s.id), eq(statementItems.isActive, true))),
          ),
        );
    }

    return {
      id: rc.id,
      receiptNo,
      allocated: String(allocTotal),
      overpaid: String(amount - allocTotal),
      statements: updated.map((s) => ({ statementNo: s.statementNo, status: debtOf(Number(s.total), Number(s.paid)) })),
    };
  });
}
