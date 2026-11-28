import ExcelJS from "exceljs";
import { portalGuard } from "@/lib/portal/session";
import { listOrdersForExport } from "@/lib/orders/queries";
import { exportFileName, fillOrdersSheet, resolveColumns, type ExportOrder } from "@/lib/orders/export-columns";
import { PORTAL_EXPORT_COLUMNS } from "@/lib/portal/rules";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ROWS = 20_000;
const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Cổng khách: tải vận đơn của chính khách (.xlsx) theo bộ lọc đang xem — chỉ cột khách được thấy */
export async function GET(req: Request) {
  const g = await portalGuard(false);
  if (!g.ok) return new Response(g.error, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const tab = sp.get("tab");
  const status = (ORDER_STATUSES as readonly string[]).includes(tab ?? "") ? (tab as OrderStatus) : undefined;
  const rows = await listOrdersForExport(
    {
      customerCode: g.s.customerCode,
      q: sp.get("q") ?? "",
      status,
      dateField: "sent",
      from: isDate(sp.get("from")) ? sp.get("from")! : undefined,
      to: isDate(sp.get("to")) ? sp.get("to")! : undefined,
      dir: "desc",
    },
    null,
    MAX_ROWS,
  );
  const wb = new ExcelJS.Workbook();
  wb.creator = "SkyLane Logistics";
  fillOrdersSheet(wb, rows as ExportOrder[], resolveColumns(PORTAL_EXPORT_COLUMNS, true));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFileName().replace("Van-don-SkyLane", `Van-don-${g.s.customerCode}`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
