import ExcelJS from "exceljs";
import { authorize } from "@/lib/auth/session";
import { layoutPriceTemplate, PRICE_TEMPLATE_FILENAME } from "@/lib/pricing/template";

export const runtime = "nodejs";

/** File Excel mẫu import bảng giá (ma trận ngang) — tạo từ cùng module với bản chạy thử */
export async function GET() {
  try {
    await authorize("pricing.view");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const wb = new ExcelJS.Workbook();
  layoutPriceTemplate(wb);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${PRICE_TEMPLATE_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
