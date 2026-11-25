import { getStatement } from "@/lib/statements/service";
import { buildStatementXlsx } from "@/lib/statements/excel";
import { authorize } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tải bảng kê định dạng Excel (.xlsx) — định dạng xuất duy nhất */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await authorize("statements.view");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Mã bảng kê không hợp lệ", { status: 400 });
  const st = await getStatement(id);
  if (!st || (user.saleScope && st.saleUserId !== user.saleScope)) return new Response("Không tìm thấy bảng kê", { status: 404 });

  const buf = await buildStatementXlsx(st);
  const ascii = `${st.statementNo}.xlsx`;
  const full = `${st.name}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`,
      "Cache-Control": "no-store",
    },
  });
}
