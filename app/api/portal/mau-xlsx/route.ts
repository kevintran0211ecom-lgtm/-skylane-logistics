import ExcelJS from "exceljs";
import { portalGuard } from "@/lib/portal/session";
import { portalCustomerName, portalRoutes } from "@/lib/portal/queries";
import { layoutOrderTemplate, orderTemplateFilename } from "@/lib/orders/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cổng khách: file mẫu nhập nhiều đơn (mẫu SKL116) ghi sẵn mã khách — danh sách tuyến = tuyến khách có giá */
export async function GET() {
  const g = await portalGuard(false);
  if (!g.ok) return new Response(g.error, { status: 403 });
  const [name, routeRows] = await Promise.all([portalCustomerName(g.s.customerCode), portalRoutes(g.s.customerCode, g.s.priceGroupCode)]);
  const wb = new ExcelJS.Workbook();
  layoutOrderTemplate(wb, { customerCode: g.s.customerCode, customerName: name ?? undefined, routes: routeRows.map((r) => r.code) });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${orderTemplateFilename(g.s.customerCode, name ?? undefined)}"`,
      "Cache-Control": "no-store",
    },
  });
}
