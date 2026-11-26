/**
 * Mẫu file Excel nhập vận đơn — đúng thứ tự cột tab "DON" trong file SKL116 - Chị Thanh.
 * Module thuần (file mẫu tải về ở web thật & bản chạy thử, link mẫu Google Sheet, kiểm thử).
 */
import type ExcelJS from "exceljs";
import type { Cell } from "../pricing/import-excel";
import { parseSheetUrl } from "./import-parse";
export const ORDER_TEMPLATE_HEADERS = [
  "Thời gian phát sinh đơn",
  "STT",
  "Mã vận đơn",
  "Tuyến vận chuyển",
  "Giá trị khai báo",
  "Tên hàng tiếng Việt",
  "Tên hàng tiếng anh",
  "Mã HS (hải quan)",
  "Người nhận",
  "Địa chỉ người nhận",
  "Thành phố người nhận",
  "Bang/tỉnh người nhận",
  "Mã bưu chính người nhận",
  "SĐT người nhận",
  "Mail người nhận",
  "Điểm đến",
  "Số kiện",
  "Trọng lượng thực tế(kg)",
  "Dài",
  "Rộng",
  "Cao",
] as const;

/** Độ rộng cột (ký tự) cho file mẫu */
export const ORDER_TEMPLATE_WIDTHS = [20, 6, 14, 16, 12, 20, 20, 12, 20, 40, 16, 14, 12, 16, 22, 9, 8, 12, 7, 7, 7];

export const ORDER_TEMPLATE_SAMPLE: (string | number)[] = [
  "18/11/2026 15:19:43", 1, "#AP1376", "VNFZZXR", 20, "Quần áo", "Clothes", "", "David Lee",
  "308 N Fillmore St, Bruning, Nebraska, 68322, US", "Bruning", "NE", "68322", "+12698047967", "abc@gmail.com",
  "US", 1, 0.786, 34, 23, 11,
];

export const ORDER_TEMPLATE_NOTES = [
  "Bắt buộc: Mã vận đơn, Tuyến vận chuyển, Điểm đến (mã nước 2 chữ, VD US, GB).",
  "Thời gian phát sinh đơn: dd/mm/yyyy hh:mm:ss. Cân nặng (kg) & kích thước (cm) dùng dấu phẩy hoặc dấu chấm thập phân.",
  "Số kiện > 1 với một bộ kích thước → tạo nhiều kiện giống nhau, cân thực chia đều.",
  "Mã vận đơn đã có (cùng khách hàng) sẽ tự động bị chặn trùng.",
];

// =============================================================================
// MẪU NHẬP ĐƠN RIÊNG CHO TỪNG KHÁCH (file Excel + link Google Sheet)
// =============================================================================
/** Ô đánh dấu khách hàng trong sheet "Hướng dẫn" — import đọc lại để tự chọn khách */
export const TEMPLATE_CUSTOMER_LABEL = "Mã khách hàng:";

export function orderTemplateFilename(customerCode?: string | null, customerName?: string | null): string {
  if (!customerCode) return "Mau-nhap-don-SkyLane.xlsx";
  const name = (customerName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `Mau-nhap-don-${customerCode}${name ? `-${name}` : ""}.xlsx`;
}

/**
 * Dựng file mẫu nhập đơn: tab DON (đúng cột, chọn tuyến bằng danh sách thả xuống) + tab Hướng dẫn
 * (có ô "Mã khách hàng: SKL126" để khi khách gửi lại / tải từ Google Sheet, hệ thống tự nhận khách).
 */
export function layoutOrderTemplate(
  wb: ExcelJS.Workbook,
  opts: { customerCode?: string | null; customerName?: string | null; routes?: string[] } = {},
): void {
  wb.creator = "SkyLane Logistics";
  const ws = wb.addWorksheet("DON", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...ORDER_TEMPLATE_HEADERS]);
  ws.columns.forEach((c, i) => (c.width = ORDER_TEMPLATE_WIDTHS[i] ?? 12));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A8A" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  ws.getColumn(18).numFmt = "0.000";
  // Danh sách thả xuống: tuyến (từ sheet Danh mục), điểm đến 2 chữ cái
  const routes = [...new Set((opts.routes ?? []).map((r) => r.trim().toUpperCase()).filter(Boolean))].sort();
  if (routes.length) {
    const dm = wb.addWorksheet("Danh mục", { state: "visible" });
    dm.getColumn(1).width = 24;
    dm.addRow(["Tuyến vận chuyển"]).font = { bold: true };
    routes.forEach((r) => dm.addRow([r]));
  }
  for (let r = 2; r <= 1000; r++) {
    if (routes.length)
      ws.getCell(r, 4).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Danh mục'!$A$2:$A$${routes.length + 1}`],
        showErrorMessage: true,
        errorTitle: "Tuyến không có trong danh mục",
        error: "Chọn tuyến trong danh sách (sheet Danh mục).",
      };
    ws.getCell(r, 16).dataValidation = {
      type: "textLength",
      operator: "equal",
      allowBlank: true,
      formulae: [2],
      showErrorMessage: true,
      errorTitle: "Điểm đến",
      error: "Nhập mã nước 2 chữ cái, VD US, GB, CA.",
    };
  }

  const g = wb.addWorksheet("Hướng dẫn");
  g.getColumn(1).width = 26;
  g.getColumn(2).width = 90;
  g.addRow(["HƯỚNG DẪN NHẬP ĐƠN — SKYLANE LOGISTICS"]).font = { bold: true, size: 13, color: { argb: "FF1F3A8A" } };
  if (opts.customerCode) {
    const r = g.addRow([TEMPLATE_CUSTOMER_LABEL, opts.customerCode]);
    r.font = { bold: true };
    if (opts.customerName) g.addRow(["Tên khách hàng:", opts.customerName]);
  }
  g.addRow([]);
  for (const n of [
    "Nhập mỗi kiện/đơn một dòng ở tab DON, bắt đầu từ dòng 2. Không đổi tên tab và không sửa dòng tiêu đề.",
    ...ORDER_TEMPLATE_NOTES,
    "Tuyến vận chuyển: chọn trong danh sách thả xuống (sheet Danh mục).",
    "Dùng Google Sheet: SkyLane đồng bộ trực tiếp từ link. Dùng Excel: gửi lại file cho SkyLane (hoặc tải từ Google Sheet: Tệp → Tải xuống → Microsoft Excel) để import.",
  ])
    g.addRow(["•", n]).alignment = { wrapText: true, vertical: "top" };
  g.addRow([]);
  g.addRow(["Ví dụ một dòng ở tab DON:"]).font = { italic: true };
  const h = g.addRow([...ORDER_TEMPLATE_HEADERS]);
  h.font = { bold: true, size: 9 };
  g.addRow(ORDER_TEMPLATE_SAMPLE).font = { size: 9, color: { argb: "FF64748B" } };
}

/** Nhận mã khách từ file mẫu đã điền (sheet "Hướng dẫn": "Mã khách hàng: | SKL126"), rồi từ tên file */
export function detectTemplateCustomer(sheets: { name: string; rows: Cell[][] }[], filename?: string | null): string | null {
  for (const sh of sheets) {
    for (const row of sh.rows.slice(0, 12)) {
      const i = (row ?? []).findIndex((c) => typeof c === "string" && c.trim().toLowerCase() === TEMPLATE_CUSTOMER_LABEL.toLowerCase());
      const v = i >= 0 ? row[i + 1] : null;
      if (v !== null && v !== undefined && String(v).trim()) return String(v).trim().toUpperCase();
    }
  }
  const m = filename ? /Mau-nhap-don-([A-Za-z0-9]+)/i.exec(filename) : null;
  return m ? m[1].toUpperCase() : null;
}

/** Link "tạo bản sao" từ Google Sheet mẫu gốc của SkyLane: khách bấm là có ngay sheet nhập đơn của mình */
export function googleSheetCopyLink(masterUrl: string | null | undefined): string | null {
  const p = masterUrl ? parseSheetUrl(masterUrl) : null;
  return p ? `https://docs.google.com/spreadsheets/d/${p.id}/copy` : null;
}

/** Tin nhắn gửi khách kèm link (Zalo / email) */
export function templateMessage(o: { customerCode: string; customerName: string; copyLink?: string | null; sheetLink?: string | null }): string {
  const lines = [`Chào ${o.customerName}, SkyLane gửi mẫu nhập đơn (mã khách ${o.customerCode}).`];
  if (o.sheetLink) lines.push(`Link Google Sheet nhập đơn của anh/chị: ${o.sheetLink}`, "Anh/chị nhập đơn vào tab DON, SkyLane sẽ đồng bộ đơn trực tiếp từ link này.");
  else if (o.copyLink)
    lines.push(
      `1. Bấm link để tạo bản sao mẫu: ${o.copyLink}`,
      '2. Bấm "Chia sẻ" → "Bất kỳ ai có đường liên kết" → quyền "Người xem", rồi gửi lại link cho SkyLane.',
      "3. Nhập đơn vào tab DON (giữ nguyên dòng tiêu đề). SkyLane đồng bộ đơn từ link anh/chị gửi.",
    );
  lines.push("Nếu dùng Excel: điền file mẫu đính kèm và gửi lại cho SkyLane.");
  return lines.join("\n");
}
