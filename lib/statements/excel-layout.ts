/**
 * BỐ CỤC FILE EXCEL BẢNG KÊ (module thuần — dùng chung cho server Next.js và bản chạy thử trong trình duyệt).
 * Không tự đọc file / tạo QR: nơi gọi truyền sẵn ảnh logo & QR (PNG/GIF dạng bytes).
 */
import type ExcelJS from "exceljs";
import { BANK } from "./format";

export interface StatementSheetItem {
  lineNo: number;
  shippedDate: string | null; // YYYY-MM-DD
  billCode: string;
  trackingNumber: string | null;
  destinationIso2: string;
  receiverName: string | null;
  packageCount: number;
  billedWeight: string | number;
  routeCode: string;
  totalAmount: string | number;
  note: string | null;
}
export interface StatementSheetData {
  statementNo: string;
  name: string;
  customerName: string;
  currency: string;
  totalAmount: string | number;
  status: "ACTIVE" | "CANCELLED";
  cancelReason?: string | null;
  items: StatementSheetItem[];
}
export interface StatementImages {
  logo?: { buffer: ArrayBuffer | Uint8Array; extension: "png" | "gif" | "jpeg" };
  qr?: { buffer: ArrayBuffer | Uint8Array; extension: "png" | "gif" | "jpeg" };
}

const FONT = "Times New Roman";
const COLS = 11; // A..K
/** Độ rộng cột theo mẫu Google Sheet (px → đơn vị Excel ≈ px/7) */
const WIDTHS_PX = [56, 108, 130, 140, 90, 155, 78, 135, 135, 120, 145];
const HEADERS = ["STT", "Thời gian", "Mã vận đơn", "Tracking", "Điểm Đến", "Người nhận", "Số kiện", "Trọng lượng tính phí", "Tuyến vận chuyển", "Chi phí", "Ghi chú"];
const NOTES = [
  "Để bảo vệ quyền lợi của quý khách hàng và tránh ảnh hưởng thời gian giao hàng, quý khách hàng vui lòng đối chiếu và thanh toán số tiền trên trong đúng thời gian quy định.",
  "Trong trường hợp quý khách hàng không thanh toán kịp thời dẫn đến việc giao hàng bị chậm trễ hoặc các vấn đề phát sinh khác, công ty chúng tôi không chịu bất kỳ trách nhiệm nào.",
];
const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

/** Dựng sheet bảng kê theo đúng mẫu hóa đơn SkyLane vào workbook có sẵn */
export function layoutStatementSheet(wb: ExcelJS.Workbook, st: StatementSheetData, images: StatementImages = {}): ExcelJS.Worksheet {
  wb.creator = "SkyLane Logistics";
  wb.created = new Date();
  const ws = wb.addWorksheet(st.statementNo, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = WIDTHS_PX.map((px) => ({ width: Math.round((px / 7) * 10) / 10 }));
  const font = (size = 11, bold = false, italic = false): Partial<ExcelJS.Font> => ({ name: FONT, size, bold, italic });

  // --- Dòng 1–3: tiêu đề
  ws.mergeCells(1, 1, 1, COLS);
  ws.getCell("A1").value = "CÔNG TY TNHH SKYLANE LOGISTICS";
  ws.getCell("A1").font = font(20, true);
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 58; // 78px

  ws.mergeCells(2, 1, 2, COLS);
  ws.getCell("A2").value = "BẢNG KÊ CHI TIẾT CƯỚC VẬN CHUYỂN";
  ws.getCell("A2").font = font(22, true);
  ws.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 26;

  ws.mergeCells(3, 1, 3, 2);
  ws.mergeCells(3, 3, 3, COLS);
  ws.getCell("A3").value = "Tên khách hàng:";
  ws.getCell("A3").font = font(12, true);
  ws.getCell("A3").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("C3").value = st.customerName;
  ws.getCell("C3").font = font(12, true);
  ws.getCell("C3").alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(3).height = 21;

  // --- Dòng 4: tiêu đề bảng 11 cột
  const head = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = font(11, true);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = box;
  });
  head.height = 30;

  // --- Chi tiết (snapshot)
  const items = st.items;
  let r = 5;
  for (const it of items) {
    const row = ws.getRow(r);
    const values: ExcelJS.CellValue[] = [
      it.lineNo,
      it.shippedDate ? new Date(`${it.shippedDate}T00:00:00Z`) : null,
      it.billCode,
      it.trackingNumber,
      it.destinationIso2,
      it.receiverName,
      it.packageCount,
      Number(it.billedWeight),
      it.routeCode,
      Number(it.totalAmount),
      it.note,
    ];
    values.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      c.font = font(11);
      c.border = box;
      c.alignment = { vertical: "middle", horizontal: [0, 1].includes(i) ? "center" : [6, 7, 9].includes(i) ? "right" : "left", wrapText: i === 5 || i === 10 };
    });
    row.getCell(2).numFmt = "yyyy-mm-dd";
    row.getCell(8).numFmt = "#,##0.00";
    row.getCell(10).numFmt = "#,##0";
    r++;
  }

  // --- Dòng TỔNG (VND)
  const firstItem = 5;
  const lastItem = r - 1;
  const total = ws.getRow(r);
  total.getCell(9).value = "TỔNG";
  total.getCell(10).value =
    lastItem >= firstItem
      ? { formula: `SUM(J${firstItem}:J${lastItem})`, result: Number(st.totalAmount) }
      : 0;
  total.getCell(11).value = st.currency || "VND";
  for (const [col, align] of [[9, "center"], [10, "right"], [11, "center"]] as const) {
    const c = total.getCell(col);
    c.font = font(11, true);
    c.alignment = { horizontal: align, vertical: "middle" };
    c.border = box;
  }
  total.getCell(10).numFmt = "#,##0";
  r += 4;

  // --- LƯU Ý (2 dòng)
  ws.getCell(r, 1).value = "  LƯU Ý:";
  ws.getCell(r, 1).font = font(11, true);
  r++;
  for (const n of NOTES) {
    ws.mergeCells(r, 1, r, COLS);
    const c = ws.getCell(r, 1);
    c.value = n;
    c.font = font(11);
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    ws.getRow(r).height = 30;
    r++;
  }
  r += 2;

  // --- Tài khoản MSB + QR
  const bankStart = r;
  const bankLines: [string, boolean][] = [
    ["Quý công ty vui lòng thanh toán theo tài khoản dưới đây:", false],
    ["TÀI KHOẢN NHẬN TIỀN: ", true],
    [`Tên người nhận: ${BANK.accountName}`, false],
    [`Ngân hàng: ${BANK.bankName}`, false],
    [`Số tài khoản: ${BANK.accountNo}`, false],
    [`Nội dung chuyển khoản: ${st.statementNo}`, false],
  ];
  for (const [text, bold] of bankLines) {
    ws.getCell(r, 1).value = text;
    ws.getCell(r, 1).font = font(11, bold);
    r++;
  }

  if (st.status === "CANCELLED") {
    ws.getCell(r + 1, 1).value = `BẢNG KÊ ĐÃ HỦY${st.cancelReason ? ` — ${st.cancelReason}` : ""}`;
    ws.getCell(r + 1, 1).font = { ...font(14, true), color: { argb: "FFC00000" } };
  }

  // Logo góc trái trên
  if (images.logo) {
    const id = wb.addImage({ buffer: images.logo.buffer as unknown as ExcelJS.Buffer, extension: images.logo.extension });
    ws.addImage(id, { tl: { col: 0.15, row: 0.08 }, ext: { width: 80, height: 76 } });
  }

  // QR MSB (VietQR có sẵn số tiền & nội dung) ở cuối bảng kê, cạnh thông tin tài khoản
  if (st.status !== "CANCELLED" && images.qr) {
    const id = wb.addImage({ buffer: images.qr.buffer as unknown as ExcelJS.Buffer, extension: images.qr.extension });
    ws.addImage(id, { tl: { col: 4.2, row: bankStart - 1 }, ext: { width: 140, height: 140 } });
    ws.getCell(bankStart + 7, 5).value = "Quét mã để chuyển khoản";
    ws.getCell(bankStart + 7, 5).font = font(10, false, true);
  }

  ws.headerFooter.oddFooter = `&L&"Times New Roman"&9${st.name}&R&"Times New Roman"&9Trang &P/&N`;
  ws.pageSetup.printArea = `A1:K${r + 3}`;
  ws.pageSetup.printTitlesRow = "4:4";
  return ws;
}
