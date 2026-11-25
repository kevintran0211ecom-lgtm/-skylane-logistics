"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbErrorMessage } from "@/lib/db/errors";
import type { ActionState } from "@/lib/action-state";
import { pricingVersions } from "@/drizzle/schema";
import { commitImport, ImportError, previewImport, readImportForm } from "./import-service";
import type { ImportCommitResult, ImportPreview } from "./import-types";
import { guard } from "@/lib/auth/session";

function toError(e: unknown): { ok: false; error: string } {
  if (e instanceof ImportError) return { ok: false, error: e.message };
  if (e instanceof Error && e.message.startsWith("Không đọc được file")) return { ok: false, error: e.message };
  return { ok: false, error: dbErrorMessage(e, "Không nhập được bảng giá.") };
}

/** Bước 1: đọc file & xem trước — không ghi DB */
export async function previewPriceImport(_prev: ActionState<ImportPreview>, formData: FormData): Promise<ActionState<ImportPreview>> {
  const g = await guard("pricing.manage");
  if (!g.ok) return g;
  try {
    const { file, options } = readImportForm(formData);
    return { ok: true, data: await previewImport(file, options) };
  } catch (e) {
    return toError(e);
  }
}

/** Bước 2: tạo phiên bản mới (1 transaction cho cả file) */
export async function commitPriceImport(
  _prev: ActionState<ImportCommitResult>,
  formData: FormData,
): Promise<ActionState<ImportCommitResult>> {
  const g = await guard("pricing.manage");
  if (!g.ok) return g;
  try {
    const { file, options } = readImportForm(formData);
    const data = await commitImport(file, options);
    revalidatePath("/bang-gia");
    return { ok: true, message: `Đã tạo ${data.created.length} phiên bản bảng giá.`, data };
  } catch (e) {
    return toError(e);
  }
}

/** Kích hoạt / lưu trữ 1 phiên bản (không sửa nội dung giá) */
export async function setVersionStatus(
  id: number,
  status: "ACTIVE" | "ARCHIVED",
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const g = await guard("pricing.manage");
  if (!g.ok) return g;
  try {
    const res = await db
      .update(pricingVersions)
      .set({ status })
      .where(eq(pricingVersions.id, id))
      .returning({ id: pricingVersions.id });
    if (res.length === 0) return { ok: false, error: "Không tìm thấy phiên bản." };
  } catch (e) {
    return { ok: false, error: dbErrorMessage(e) };
  }
  revalidatePath("/bang-gia");
  revalidatePath(`/bang-gia/${id}`);
  return { ok: true, message: status === "ACTIVE" ? "Đã kích hoạt phiên bản." : "Đã lưu trữ phiên bản." };
}
