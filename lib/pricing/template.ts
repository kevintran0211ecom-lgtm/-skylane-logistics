/**
 * FILE EXCEL MẪU IMPORT BẢNG GIÁ (module thuần — dùng chung web thật & bản chạy thử).
 * Định dạng "ma trận ngang" mà bộ đọc import-excel.ts hiểu:
 *
 *   Dòng 1 : tên tuyến (gộp ô theo cụm cột của tuyến) — trùng mã tuyến trong Danh mục
 *   Dòng 2 : "Khối lượng (KG)" | "US – Mỹ (VND)" | "GB – Anh (VND)" … (mã ISO2 đứng đầu; (USD) nếu giá USD)
 *   Dữ liệu: mốc cân 0,1 … 20 → giá trọn mốc (Ma trận); 21-44, 45-99, 100+, 300+ → đơn giá/kg (Theo kg)
 */
import type ExcelJS from "exceljs";
import type { Cell } from "./import-excel";

interface Block {
  route: string;
  countries: [string, string][]; // [ISO2, tên]
  currency: "VND" | "USD";
  /** [mốc cân hoặc nhãn khoảng, ...giá theo từng nước] — "" = không phục vụ */
  rows: (string | number)[][];
}

export const PRICE_TEMPLATE_BLOCKS: Block[] = [
  {
    route: "VNFZZXR",
    currency: "VND",
    countries: [["US", "Mỹ"], ["GB", "Anh"], ["DE", "Đức"], ["AU", "Úc"]],
    rows: [
      [0.1, 151000, 86500, 140300, 128000],
      [0.2, 163500, 93600, 151900, 139000],
      [0.3, 176000, 100800, 163500, 150000],
      [0.5, 201000, 115100, 186600, 172000],
      [1, 263300, 150800, 244600, 226000],
      [2, 388000, 222200, 360400, 334000],
      [5, 762100, 436500, 707900, 655000],
      [10, 1385700, 793600, 1287100, 1190000],
      [20, 2632900, 1507800, 2445500, 2262000],
    ],
  },
  {
    route: "UPS HAN S5500",
    currency: "VND",
    countries: [["US", "Mỹ"], ["CA", "Canada"]],
    rows: [
      [0.5, 435000, 478500],
      [1, 570000, 627000],
      [2, 840000, 924000],
      [5, 1650000, 1815000],
      [10, 3000000, 3300000],
      [15, 4350000, 4785000],
      [20, 5700000, 6270000],
      ["21-44", 246000, 251000],
      ["45-99", 240000, 245000],
      ["100+", 235000, 240000],
      ["300+", 230000, 235000],
    ],
  },
];

export const PRICE_TEMPLATE_NOTES = [
  "Mỗi tuyến là một CỤM CỘT: cột đầu “Khối lượng (KG)”, các cột sau là từng nước. Có thể đặt nhiều tuyến cạnh nhau (cách nhau 1 cột trống) hoặc ở nhiều sheet.",
  "Dòng 1: tên tuyến, gộp ô trên cụm cột của tuyến. Tên phải TRÙNG mã tuyến trong Danh mục › Tuyến vận chuyển (không phân biệt hoa thường).",
  "Dòng 2: tiêu đề cột nước bắt đầu bằng mã ISO2: “US – Mỹ (VND)”, “GB – Anh (VND)”. Ghi (USD) nếu giá tính bằng USD.",
  "Mốc cân dạng số (0,1 … 20): giá TRỌN MỐC cho đơn có cân tính phí ≤ mốc đó (Ma trận).",
  "Nhãn khoảng 21-44, 45-99, 100+, 300+: ĐƠN GIÁ / KG cho đơn trên 20 kg (Theo kg). Tuyến chỉ có ma trận thì bỏ các dòng này.",
  "Ô trống hoặc “-” = không phục vụ mốc / nước đó. Số dùng dấu chấm hoặc dấu phẩy đều được (151.000 hoặc 151000).",
  "Các nước có toàn bộ giá giống nhau được tự gom chung 1 vùng giá.",
  "Khi tải lên, chọn Loại (Giá gốc NCC / Giá bán chung / theo nhóm / theo khách) và NGÀY HIỆU LỰC: hệ thống tạo phiên bản mới, phiên bản cũ được giữ làm lịch sử để tính đúng đơn quá khứ.",
];

/** Lưới ô của sheet "Bảng giá" (để kiểm thử & bản chạy thử dùng trực tiếp) */
export function priceTemplateGrid(): { rows: Cell[][]; merges: { row: number; from: number; to: number }[] } {
  const height = 2 + Math.max(...PRICE_TEMPLATE_BLOCKS.map((b) => b.rows.length));
  const rows: Cell[][] = Array.from({ length: height }, () => []);
  const merges: { row: number; from: number; to: number }[] = [];
  let col = 0;
  for (const b of PRICE_TEMPLATE_BLOCKS) {
    const width = 1 + b.countries.length;
    for (let c = 0; c < width; c++) rows[0][col + c] = b.route;
    merges.push({ row: 0, from: col, to: col + width - 1 });
    rows[1][col] = "Khối lượng (KG)";
    b.countries.forEach(([iso, name], i) => (rows[1][col + 1 + i] = `${iso} – ${name} (${b.currency})`));
    b.rows.forEach((r, i) => r.forEach((v, j) => (rows[2 + i][col + j] = v === "" ? null : v)));
    col += width + 1; // 1 cột trống giữa các tuyến
  }
  const w = col - 1;
  return { rows: rows.map((r) => Array.from({ length: w }, (_, i) => r[i] ?? null)), merges };
}

/** Dựng file mẫu (sheet Bảng giá + Hướng dẫn) vào workbook ExcelJS có sẵn */
export function layoutPriceTemplate(wb: ExcelJS.Workbook): void {
  wb.creator = "SkyLane Logistics";
  const { rows, merges } = priceTemplateGrid();
  const ws = wb.addWorksheet("Bảng giá", { views: [{ state: "frozen", ySplit: 2 }] });
  rows.forEach((r) => ws.addRow(r));
  const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
  for (const m of merges) {
    ws.mergeCells(m.row + 1, m.from + 1, m.row + 1, m.to + 1);
    for (let c = m.from + 1; c <= m.to + 1; c++) {
      ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A8A" } };
      const h = ws.getCell(2, c);
      h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF3FF" } };
      h.font = { bold: true };
      h.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      for (let r = 1; r <= rows.length; r++) ws.getCell(r, c).border = { top: thin, left: thin, bottom: thin, right: thin };
      for (let r = 3; r <= rows.length; r++) ws.getCell(r, c).numFmt = c === m.from + 1 ? "0.0#" : "#,##0";
    }
    const t = ws.getCell(1, m.from + 1);
    t.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    t.alignment = { horizontal: "center", vertical: "middle" };
  }
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 32;
  ws.columns.forEach((c, i) => (c.width = merges.some((m) => m.from === i) ? 16 : 15));

  const g = wb.addWorksheet("Hướng dẫn");
  g.getColumn(1).width = 120;
  g.addRow(["HƯỚNG DẪN NHẬP BẢNG GIÁ — SKYLANE LOGISTICS"]).font = { bold: true, size: 14, color: { argb: "FF1F3A8A" } };
  g.addRow([]);
  PRICE_TEMPLATE_NOTES.forEach((n, i) => {
    const row = g.addRow([`${i + 1}. ${n}`]);
    row.alignment = { wrapText: true, vertical: "top" };
  });
}

export const PRICE_TEMPLATE_FILENAME = "Mau-import-bang-gia-SkyLane.xlsx";
