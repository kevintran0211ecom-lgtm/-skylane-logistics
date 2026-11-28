import ExcelJS from "exceljs";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { parseOrderFilter } from "@/lib/orders/filters";
import { listOrdersForExport } from "@/lib/orders/queries";
import { exportFileName, fillOrdersSheet, resolveColumns, type ExportOrder } from "@/lib/orders/export-columns";

export const runtime = "nodejs";
const MAX_ROWS = 20_000;

/**
 * Tải xuống vận đơn (.xlsx) theo các cột đã chọn — gửi bằng form POST:
 *   cols=billCode,status,…   ids=1,2,3 (tùy chọn: chỉ đơn đã chọn)   + bộ lọc màn Vận đơn (q, status, df, from, to, sort, dir)
 * Kho không được xuất cột tiền (lọc lại ở server). SALE chỉ thấy khách mình.
 */
export async function POST(req: Request) {
  let user;
  try {
    user = await authorize("orders.view");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const fd = await req.formData();
  const get = (k: string) => (typeof fd.get(k) === "string" ? String(fd.get(k)) : undefined);
  const showMoney = can(user.role, "orders.viewMoney");
  const cols = resolveColumns((get("cols") ?? "").split(","), showMoney);
  if (cols.length === 0) return new Response("Chưa chọn cột nào để xuất.", { status: 400 });
  const ids = get("ids")
    ? get("ids")!.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX_ROWS)
    : null;
  const filter = parseOrderFilter({ q: get("q"), status: get("status"), df: get("df"), from: get("from"), to: get("to"), sort: get("sort"), dir: get("dir") });

  const rows = await listOrdersForExport({ ...(ids ? { dir: filter.dir, sort: filter.sort } : filter), saleUserId: user.saleScope }, ids, MAX_ROWS);
  const wb = new ExcelJS.Workbook();
  wb.creator = "SkyLane Logistics";
  fillOrdersSheet(wb, rows as ExportOrder[], cols);
  const buf = await wb.xlsx.writeBuffer();
  const name = exportFileName();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Row-Count": String(rows.length),
    },
  });
}
