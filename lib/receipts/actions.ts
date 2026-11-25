"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage } from "@/lib/db/errors";
import type { ActionState } from "@/lib/action-state";
import { deleteProofs, uploadProof } from "@/lib/storage";
import { DEFAULT_RECEIVED_ACCOUNT, parseThousands } from "./format";
import { ReceiptError, saveReceipt, todaySaigon } from "./service";
import { guard } from "@/lib/auth/session";

const MAX_IMAGES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export interface SaveReceiptResult {
  receiptNo: string;
  allocated: string;
  overpaid: string;
  statements: { statementNo: string; status: string }[];
}

export async function saveReceiptAction(_p: ActionState<SaveReceiptResult>, fd: FormData): Promise<ActionState<SaveReceiptResult>> {
  const g = await guard("receipts.manage");
  if (!g.ok) return g;
  const customerCode = String(fd.get("customerCode") ?? "").trim().toUpperCase();
  const amount = parseThousands(String(fd.get("amount") ?? ""));
  if (!customerCode) return { ok: false, error: "Chọn khách hàng." };
  if (!amount || Number(amount) <= 0) return { ok: false, error: "Nhập số tiền nhận.", fieldErrors: { amount: "Nhập số tiền nhận" } };

  let allocations: { statementId: number; amount: string }[] = [];
  try {
    const raw = JSON.parse(String(fd.get("allocations") ?? "[]")) as { statementId: unknown; amount: unknown }[];
    allocations = raw.map((a) => ({ statementId: Number(a.statementId), amount: parseThousands(String(a.amount)) })).filter((a) => a.statementId > 0 && Number(a.amount) > 0);
  } catch {
    return { ok: false, error: "Dữ liệu phân bổ không hợp lệ." };
  }

  const receivedRaw = String(fd.get("receivedAt") ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(receivedRaw);
  const receivedAt = m ? `${m[1]}T${m[2]}:00+07:00` : null;
  const method = (["CHUYEN_KHOAN", "TIEN_MAT", "KHAC"] as const).find((x) => x === fd.get("method")) ?? "CHUYEN_KHOAN";

  // Ảnh minh chứng (dán Ctrl+V hoặc chọn file) → Storage trước, DB sau; lỗi DB thì xóa ảnh đã tải
  const files = fd.getAll("proofs").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_IMAGES) return { ok: false, error: `Tối đa ${MAX_IMAGES} ảnh minh chứng.` };
  for (const f of files) {
    if (!EXT[f.type]) return { ok: false, error: `Ảnh "${f.name}" phải là PNG, JPG, WEBP hoặc GIF.` };
    if (f.size > MAX_BYTES) return { ok: false, error: `Ảnh "${f.name}" vượt 5 MB.` };
  }
  const uploaded: string[] = [];
  try {
    for (const f of files) {
      const path = `${customerCode}/${todaySaigon().slice(0, 7)}/${randomUUID()}.${EXT[f.type]}`;
      await uploadProof(path, f);
      uploaded.push(path);
    }
  } catch (e) {
    await deleteProofs(uploaded);
    return { ok: false, error: e instanceof Error ? e.message : "Không tải được ảnh minh chứng." };
  }

  try {
    const r = await saveReceipt({
      customerCode,
      amount,
      receivedAt,
      method,
      receivedAccount: String(fd.get("receivedAccount") ?? "").trim() || DEFAULT_RECEIVED_ACCOUNT,
      bankRef: String(fd.get("bankRef") ?? "").trim() || null,
      payerName: String(fd.get("payerName") ?? "").trim() || null,
      note: String(fd.get("note") ?? "").trim() || null,
      allocations,
      proofImages: uploaded,
    });
    revalidatePath("/doi-soat");
    revalidatePath("/bang-ke");
    revalidatePath("/don-hang");
    const over = Number(r.overpaid);
    return {
      ok: true,
      message: `Đã lưu phiếu thu ${r.receiptNo}${over > 0 ? ` — ghi nhận Thu thừa ${over.toLocaleString("vi-VN")} đ` : ""}.`,
      data: r,
    };
  } catch (e) {
    await deleteProofs(uploaded);
    return { ok: false, error: e instanceof ReceiptError ? e.message : dbErrorMessage(e, "Không lưu được phiếu thu.") };
  }
}
