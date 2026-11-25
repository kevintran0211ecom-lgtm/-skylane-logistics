import ExcelJS from "exceljs";
import { authorize } from "@/lib/auth/session";
import { ORDER_TEMPLATE_HEADERS, ORDER_TEMPLATE_NOTES, ORDER_TEMPLATE_SAMPLE, ORDER_TEMPLATE_WIDTHS } from "@/lib/orders/template";

export const runtime = "nodejs";

/** File mẫu nhập vận đơn (.xlsx) — đúng cột tab DON của file SKL116 */
export async function GET() {
  try {
    await authorize("drafts.manage");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DON", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...ORDER_TEMPLATE_HEADERS]);
  ws.addRow(ORDER_TEMPLATE_SAMPLE);
  ws.columns.forEach((c, i) => (c.width = ORDER_TEMPLATE_WIDTHS[i] ?? 12));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A8A" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  ws.getColumn(18).numFmt = "0.000";

  const guide = wb.addWorksheet("Hướng dẫn");
  guide.getColumn(1).width = 110;
  guide.addRow(["HƯỚNG DẪN NHẬP ĐƠN — SKYLANE LOGISTICS"]).font = { bold: true, size: 13 };
  for (const n of ORDER_TEMPLATE_NOTES) guide.addRow([`• ${n}`]);

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Mau-nhap-don-SkyLane.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
