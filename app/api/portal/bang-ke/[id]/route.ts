import { getStatement } from "@/lib/statements/service";
import { buildStatementXlsx } from "@/lib/statements/excel";
import { portalGuard } from "@/lib/portal/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cổng khách: tải bảng kê (.xlsx) — chỉ bảng kê hiệu lực của chính khách */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await portalGuard(false);
  if (!g.ok) return new Response(g.error, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Mã bảng kê không hợp lệ", { status: 400 });
  const st = await getStatement(id);
  if (!st || st.customerCode !== g.s.customerCode || st.status !== "ACTIVE") return new Response("Không tìm thấy bảng kê", { status: 404 });
  const buf = await buildStatementXlsx(st);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${st.statementNo}.xlsx"; filename*=UTF-8''${encodeURIComponent(`${st.name || st.statementNo}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
