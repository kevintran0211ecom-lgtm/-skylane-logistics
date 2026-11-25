"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/db/errors";
import type { ActionState } from "@/lib/action-state";
import { isIsoDate } from "@/lib/pricing/versioning";
import { cancelStatement, createStatement, StatementError } from "./service";
import { guard } from "@/lib/auth/session";

const fail = (e: unknown, fallback: string) =>
  ({ ok: false, error: e instanceof StatementError ? e.message : dbErrorMessage(e, fallback) }) as const;

export async function createStatementAction(
  _p: ActionState<{ id: number; statementNo: string }>,
  fd: FormData,
): Promise<ActionState<{ id: number; statementNo: string }>> {
  const g = await guard("statements.manage");
  if (!g.ok) return g;
  const customerCode = String(fd.get("customerCode") ?? "").trim().toUpperCase();
  const ids = String(fd.get("orderIds") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const date = (k: string) => {
    const v = String(fd.get(k) ?? "").trim();
    return v && isIsoDate(v) ? v : null;
  };
  if (!customerCode) return { ok: false, error: "Chọn khách hàng." };
  try {
    const r = await createStatement({
      customerCode,
      orderIds: ids,
      periodFrom: date("from"),
      periodTo: date("to"),
      note: String(fd.get("note") ?? "").trim() || null,
    });
    revalidatePath("/bang-ke");
    revalidatePath("/don-hang");
    return { ok: true, message: `Đã tạo bảng kê ${r.name} (${r.orderCount} đơn) và khóa giá các đơn.`, data: { id: r.id, statementNo: r.statementNo } };
  } catch (e) {
    return fail(e, "Không tạo được bảng kê.");
  }
}

export async function cancelStatementAction(id: number, _p: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard("statements.manage");
  if (!g.ok) return g;
  try {
    const r = await cancelStatement(id, String(fd.get("reason") ?? "").trim() || null);
    revalidatePath("/bang-ke");
    revalidatePath(`/bang-ke/${id}`);
    revalidatePath("/don-hang");
    return { ok: true, message: `Đã hủy ${r.statementNo}; hoàn "Chưa thanh toán" cho ${r.restored}/${r.total} đơn.` };
  } catch (e) {
    return fail(e, "Không hủy được bảng kê.");
  }
}
