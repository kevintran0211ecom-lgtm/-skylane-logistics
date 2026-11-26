import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import QRCode from "qrcode";
import { vietQrPayload } from "./format";
import { layoutStatementSheet, type StatementImages } from "./excel-layout";
import type { StatementDetail } from "./service";

/** Tạo file .xlsx bảng kê theo đúng mẫu hóa đơn SkyLane (bố cục ở excel-layout.ts, dùng chung với bản chạy thử) */
export async function buildStatementXlsx(st: StatementDetail): Promise<Buffer> {
  const images: StatementImages = {};
  try {
    images.logo = { buffer: await readFile(path.join(process.cwd(), "public", "logo.png")), extension: "png" };
  } catch {
    // thiếu file logo → vẫn xuất bảng kê
  }
  if (st.status !== "CANCELLED") {
    const payload = vietQrPayload({ amount: st.currency === "VND" ? st.balanceAmount : null, note: st.statementNo });
    images.qr = { buffer: await QRCode.toBuffer(payload, { type: "png", width: 300, margin: 1, errorCorrectionLevel: "M" }), extension: "png" };
  }
  const wb = new ExcelJS.Workbook();
  layoutStatementSheet(
    wb,
    {
      statementNo: st.statementNo,
      name: st.name,
      customerName: st.customerName,
      currency: st.currency || "VND",
      totalAmount: st.totalAmount ?? st.subtotalAmount,
      status: st.status,
      cancelReason: st.cancelReason,
      items: st.items
        .filter((i) => i.isActive || st.status === "CANCELLED")
        .map((it) => ({
          lineNo: it.lineNo,
          shippedDate: it.shippedDate,
          billCode: it.billCode,
          trackingNumber: it.snapshot?.trackingNumber ?? null,
          destinationIso2: it.destinationIso2,
          receiverName: it.receiverName,
          packageCount: it.packageCount,
          billedWeight: it.billedWeight,
          routeCode: it.routeCode,
          totalAmount: it.totalAmount,
          note: it.snapshot?.note ?? null,
        })),
    },
    images,
  );
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
