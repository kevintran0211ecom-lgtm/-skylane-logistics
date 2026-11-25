import "server-only";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
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
        allocs: sql<{ statementId: number; statementNo: string; amount: string; balance: string }[]>`coalesce((select json_agg(json_build_object(
            'statementId', s.id, 'statementNo', s.statement_no, 'amount', ra.amount::bigint::text, 'balance', s.balance_amount::bigint::text) order by s.issued_at)
          from receipt_allocations ra join statements s on s.id = ra.statement_id where ra.receipt_id = ${receipts.id}), '[]')`,
        method: receipts.method,
        receivedAccount: receipts.receivedAccount,
        payerName: receipts.payerName,
        note: receipts.note,
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
  const allocTotal = allocs.reduce((t, a) => t + Number(a.amount), 0);
  if (allocTotal > amount) throw new ReceiptError("Tổng phân bổ vượt quá số tiền nhận.");

  return db.transaction(async (tx) => {
    const [cust] = await tx.select({ code: customers.customerCode }).from(customers).where(eq(customers.customerCode, input.customerCode));
    if (!cust) throw new ReceiptError(`Không tìm thấy khách hàng ${input.customerCode}.`);

    // Khóa các bảng kê được phân bổ & kiểm tra còn nợ
    await checkAllocations(tx, input.customerCode, allocs);
    const ids = allocs.map((a) => a.statementId);

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
    const updated = await syncDebt(tx, ids);

    return {
      id: rc.id,
      receiptNo,
      allocated: String(allocTotal),
      overpaid: String(amount - allocTotal),
      statements: updated,
    };
  });
}

// =============================================================================
// Công nợ bảng kê & đơn theo số đã thu (dùng chung: lập / sửa / hủy phiếu thu, dùng thu thừa)
// =============================================================================
async function syncDebt(tx: Tx, statementIds: number[]) {
  const ids = [...new Set(statementIds)];
  if (!ids.length) return [];
  const rows = await tx
    .select({ id: statements.id, statementNo: statements.statementNo, total: statements.totalAmount, paid: statements.paidAmount, status: statements.status })
    .from(statements)
    .where(inArray(statements.id, ids));
  const out: { statementNo: string; status: string }[] = [];
  for (const s of rows) {
    if (s.status !== "ACTIVE") continue;
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
    out.push({ statementNo: s.statementNo, status });
  }
  return out;
}

/** Kiểm tra phân bổ: cùng khách, bảng kê còn hiệu lực, không vượt số còn nợ (sau khi đã gỡ phân bổ cũ) */
async function checkAllocations(tx: Tx, customerCode: string, allocs: { statementId: number; amount: string }[]) {
  if (new Set(allocs.map((a) => a.statementId)).size !== allocs.length) throw new ReceiptError("Mỗi bảng kê chỉ phân bổ một lần.");
  const ids = allocs.map((a) => a.statementId);
  const locked = ids.length ? await tx.select().from(statements).where(inArray(statements.id, ids)).for("update") : [];
  for (const a of allocs) {
    const s = locked.find((x) => x.id === a.statementId);
    if (!s || s.customerCode !== customerCode) throw new ReceiptError("Bảng kê không thuộc khách hàng này.");
    if (s.status !== "ACTIVE") throw new ReceiptError(`Bảng kê ${s.statementNo} đã hủy.`);
    if (Number(a.amount) > Number(s.balanceAmount)) {
      throw new ReceiptError(`Phân bổ cho ${s.statementNo} vượt số còn nợ (${Number(s.balanceAmount).toLocaleString("vi-VN")}).`);
    }
  }
}

async function lockReceipt(tx: Tx, id: number) {
  const [rc] = await tx.select().from(receipts).where(eq(receipts.id, id)).for("update");
  if (!rc) throw new ReceiptError("Không tìm thấy phiếu thu.");
  if (rc.status !== "ACTIVE") throw new ReceiptError(`Phiếu thu ${rc.receiptNo} đã hủy.`);
  const old = await tx.delete(receiptAllocations).where(eq(receiptAllocations.receiptId, id)).returning({ statementId: receiptAllocations.statementId });
  return { rc, oldStatementIds: old.map((o) => o.statementId) };
}

// =============================================================================
// Hủy phiếu thu — gỡ toàn bộ phân bổ, công nợ bảng kê & đơn trở về như trước khi nhận
// =============================================================================
export async function cancelReceipt(id: number, reason: string | null, userId: string | null) {
  return db.transaction(async (tx) => {
    const { rc, oldStatementIds } = await lockReceipt(tx, id);
    await tx
      .update(receipts)
      .set({ status: "CANCELLED", cancelledAt: sql`now()`, cancelledBy: userId, cancelReason: reason })
      .where(eq(receipts.id, id));
    const statementsAfter = await syncDebt(tx, oldStatementIds);
    return { receiptNo: rc.receiptNo, statements: statementsAfter };
  });
}

// =============================================================================
// Sửa phiếu thu — gỡ phân bổ cũ, cập nhật thông tin, phân bổ lại (1 transaction)
// =============================================================================
export interface UpdateReceiptInput {
  amount: string;
  receivedAt: string | null;
  method: "CHUYEN_KHOAN" | "TIEN_MAT" | "KHAC";
  receivedAccount: string;
  bankRef: string | null;
  payerName: string | null;
  note: string | null;
  allocations: { statementId: number; amount: string }[];
}

export async function updateReceipt(id: number, input: UpdateReceiptInput) {
  const amount = Number(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new ReceiptError("Số tiền nhận phải lớn hơn 0.");
  const allocs = input.allocations.filter((a) => Number(a.amount) > 0);
  if (allocs.reduce((t, a) => t + Number(a.amount), 0) > amount) throw new ReceiptError("Tổng phân bổ vượt quá số tiền nhận.");
  return db.transaction(async (tx) => {
    const { rc, oldStatementIds } = await lockReceipt(tx, id);
    await checkAllocations(tx, rc.customerCode, allocs);
    await tx
      .update(receipts)
      .set({
        amount: String(amount),
        ...(input.receivedAt && { receivedAt: input.receivedAt }),
        method: input.method,
        receivedAccount: input.receivedAccount,
        bankRef: input.bankRef,
        payerName: input.payerName,
        note: input.note,
      })
      .where(eq(receipts.id, id));
    if (allocs.length) await tx.insert(receiptAllocations).values(allocs.map((a) => ({ receiptId: id, statementId: a.statementId, amount: a.amount })));
    const statementsAfter = await syncDebt(tx, [...oldStatementIds, ...allocs.map((a) => a.statementId)]);
    const allocated = allocs.reduce((t, a) => t + Number(a.amount), 0);
    return { receiptNo: rc.receiptNo, overpaid: String(amount - allocated), statements: statementsAfter };
  });
}

// =============================================================================
// Dùng tiền Thu thừa — Kế toán/Admin phân bổ số dư có vào bảng kê mới (lấy phiếu thu cũ nhất trước)
// =============================================================================
export async function applyCredit(customerCode: string, requests: { statementId: number; amount: string }[]) {
  const allocs = requests.filter((a) => Number(a.amount) > 0);
  if (!allocs.length) throw new ReceiptError("Nhập số tiền dùng cho ít nhất một bảng kê.");
  return db.transaction(async (tx) => {
    await checkAllocations(tx, customerCode, allocs);
    const credits = await tx
      .select({ id: receipts.id, receiptNo: receipts.receiptNo, left: receipts.overpaidAmount })
      .from(receipts)
      .where(and(eq(receipts.customerCode, customerCode), eq(receipts.status, "ACTIVE"), sql`${receipts.amount} > ${receipts.allocatedAmount}`))
      .orderBy(asc(receipts.receivedAt), asc(receipts.id))
      .for("update");
    const pool = credits.map((c) => ({ ...c, left: Number(c.left) }));
    const need = allocs.reduce((t, a) => t + Number(a.amount), 0);
    const have = pool.reduce((t, c) => t + c.left, 0);
    if (need > have) throw new ReceiptError(`Số dư Thu thừa chỉ còn ${have.toLocaleString("vi-VN")} đ.`);

    const used: string[] = [];
    for (const a of allocs) {
      let rest = Number(a.amount);
      for (const c of pool) {
        if (rest <= 0) break;
        if (c.left <= 0) continue;
        const take = Math.min(rest, c.left);
        await tx
          .insert(receiptAllocations)
          .values({ receiptId: c.id, statementId: a.statementId, amount: String(take), note: "Dùng tiền Thu thừa" })
          .onConflictDoUpdate({
            target: [receiptAllocations.receiptId, receiptAllocations.statementId],
            set: { amount: sql`${receiptAllocations.amount} + excluded.amount` },
          });
        c.left -= take;
        rest -= take;
        if (!used.includes(c.receiptNo)) used.push(c.receiptNo);
      }
    }
    const statementsAfter = await syncDebt(tx, allocs.map((a) => a.statementId));
    return { used: need, fromReceipts: used, creditLeft: have - need, statements: statementsAfter };
  });
}
