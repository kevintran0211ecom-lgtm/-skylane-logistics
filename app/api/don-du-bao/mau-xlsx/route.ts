import ExcelJS from "exceljs";
import { and, eq } from "drizzle-orm";
import { authorize } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { customers, routes } from "@/drizzle/schema";
import { layoutOrderTemplate, orderTemplateFilename } from "@/lib/orders/template";

export const runtime = "nodejs";

/**
 * File mẫu nhập vận đơn (.xlsx) — đúng cột tab DON của file SKL116.
 * ?customer=SKL126 → mẫu riêng cho khách (ghi mã khách ở sheet Hướng dẫn để import tự nhận khách).
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await authorize("drafts.manage");
  } catch {
    return new Response("Không có quyền", { status: 403 });
  }
  const code = new URL(req.url).searchParams.get("customer")?.trim().toUpperCase() || null;
  const [cust] = code
    ? await db
        .select({ name: customers.name })
        .from(customers)
        .where(and(eq(customers.customerCode, code), user.saleScope ? eq(customers.saleUserId, user.saleScope) : undefined))
    : [];
  if (code && !cust) return new Response("Không tìm thấy khách hàng", { status: 404 });
  const routeRows = await db.select({ c: routes.routeCode }).from(routes).where(eq(routes.isActive, true));

  const wb = new ExcelJS.Workbook();
  layoutOrderTemplate(wb, { customerCode: code, customerName: cust?.name, routes: routeRows.map((r) => r.c) });
  const buf = await wb.xlsx.writeBuffer();
  const filename = orderTemplateFilename(code, cust?.name);
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
