/**
 * TẢI XUỐNG VẬN ĐƠN THEO CỘT (module thuần — dùng chung server Next.js và bản chạy thử).
 *
 *  - EXPORT_COLUMNS: mọi cột có thể xuất (key ổn định, lưu trong định dạng đã lưu).
 *  - VISIBLE_COLUMNS: các cột đang hiển thị trên bảng Vận đơn ("Xuất cột đang hiển thị").
 *  - Thao tác 2 danh sách (chọn / bỏ / lên / xuống) và đọc định dạng đã lưu.
 *  - fillOrdersSheet: ghi sheet Excel (tiêu đề, định dạng số, dòng tổng, cố định dòng đầu, lọc).
 */
import type ExcelJS from "exceljs";

export interface ExportOrder {
  billCode: string;
  trackingNumber: string | null;
  customerCode: string;
  customerName: string;
  routeCode: string;
  assignedRouteCode: string;
  supplierCode: string | null; // NCC của tuyến chỉ định
  serviceType: string | null;
  destinationIso2: string;
  status: string;
  debtStatus: string;
  pricingDate: string | null; // YYYY-MM-DD
  createdAt: string | null; // ISO
  receivedAt: string | null;
  exportedAt: string | null;
  deliveredAt: string | null;
  packageCount: number;
  dimensions: string; // "40x30x20; 50x40x30"
  actualWeight: string;
  volumetricWeight: string;
  billedWeight: string;
  shippedWeight: string;
  sellAmount: string;
  surchargeAmount: string;
  totalAmount: string;
  costAmount: string;
  profit: string;
  priceLocked: boolean;
  senderName: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverEmail: string | null;
  receiverAddress: string | null;
  receiverCity: string | null;
  receiverState: string | null;
  receiverPostalCode: string | null;
  goodsDescription: string | null;
  goodsNameEn: string | null;
  hsCode: string | null;
  declaredValueUsd: string | null;
  note: string | null;
  internalNote: string | null;
}

export type ColumnType = "text" | "int" | "kg" | "money" | "usd" | "date" | "datetime" | "bool";

export interface ExportColumn {
  key: string;
  label: string;
  type: ColumnType;
  money?: boolean; // chỉ vai trò được xem tiền
  width?: number;
  get: (o: ExportOrder) => string | number | boolean | null;
}

const col = (key: keyof ExportOrder, label: string, type: ColumnType = "text", extra: Partial<ExportColumn> = {}): ExportColumn => ({
  key,
  label,
  type,
  get: (o) => o[key] as string | number | boolean | null,
  ...extra,
});

export const EXPORT_COLUMNS: ExportColumn[] = [
  col("pricingDate", "Ngày gửi hàng", "date"),
  col("createdAt", "Ngày tạo đơn", "datetime"),
  col("receivedAt", "Thời gian nhận kho", "datetime"),
  col("exportedAt", "Thời gian xuất hàng", "datetime"),
  col("deliveredAt", "Thời gian giao hàng", "datetime"),
  col("customerCode", "Mã khách hàng", "text", { width: 12 }),
  col("customerName", "Tên khách hàng", "text", { width: 22 }),
  col("billCode", "Mã vận đơn", "text", { width: 16 }),
  col("trackingNumber", "Mã tracking", "text", { width: 20 }),
  col("routeCode", "Tuyến vận chuyển", "text", { width: 16 }),
  col("assignedRouteCode", "Tuyến chỉ định", "text", { width: 16 }),
  col("supplierCode", "Nhà cung cấp", "text"),
  col("serviceType", "Dịch vụ", "text", { width: 9 }),
  col("destinationIso2", "Điểm đến", "text", { width: 9 }),
  col("status", "Trạng thái", "text", { width: 14 }),
  col("packageCount", "Số kiện", "int", { width: 8 }),
  col("dimensions", "Kích thước kiện (cm)", "text", { width: 24 }),
  col("actualWeight", "Cân thực (kg)", "kg"),
  col("volumetricWeight", "Cân quy đổi (kg)", "kg"),
  col("billedWeight", "Cân tính phí (kg)", "kg"),
  col("shippedWeight", "Cân xuất hàng (kg)", "kg"),
  col("sellAmount", "Giá bán", "money", { money: true }),
  col("surchargeAmount", "Phụ phí", "money", { money: true }),
  col("totalAmount", "Thành tiền", "money", { money: true }),
  col("costAmount", "Giá gốc", "money", { money: true }),
  col("profit", "Lợi nhuận", "money", { money: true }),
  col("debtStatus", "Công nợ", "text", { width: 16 }),
  col("priceLocked", "Đã khóa giá", "bool", { width: 10 }),
  col("senderName", "Người gửi", "text", { width: 18 }),
  col("receiverName", "Người nhận", "text", { width: 20 }),
  col("receiverPhone", "SĐT người nhận", "text", { width: 15 }),
  col("receiverEmail", "Email người nhận", "text", { width: 22 }),
  col("receiverAddress", "Địa chỉ người nhận", "text", { width: 32 }),
  col("receiverCity", "Thành phố", "text"),
  col("receiverState", "Bang / Tỉnh", "text"),
  col("receiverPostalCode", "Mã bưu chính", "text"),
  col("goodsDescription", "Tên hàng (VI)", "text", { width: 24 }),
  col("goodsNameEn", "Tên hàng (EN)", "text", { width: 24 }),
  col("hsCode", "Mã HS", "text"),
  col("declaredValueUsd", "Giá trị khai báo (USD)", "usd"),
  col("note", "Ghi chú", "text", { width: 24 }),
  col("internalNote", "Ghi chú nội bộ", "text", { width: 24 }),
];

const BY_KEY = new Map(EXPORT_COLUMNS.map((c) => [c.key, c]));

/** Cột đang hiển thị trên bảng Vận đơn (cùng thứ tự). */
export const VISIBLE_COLUMNS = [
  "billCode", "trackingNumber", "customerCode", "customerName", "routeCode", "assignedRouteCode", "destinationIso2", "status",
  "pricingDate", "exportedAt", "packageCount", "actualWeight", "volumetricWeight", "billedWeight", "shippedWeight",
  "sellAmount", "costAmount", "profit", "debtStatus",
];

export const exportColumnsFor = (showMoney: boolean) => EXPORT_COLUMNS.filter((c) => showMoney || !c.money);

/** Giữ các key hợp lệ (đúng quyền), bỏ trùng, giữ thứ tự. */
export function resolveColumns(keys: string[], showMoney: boolean): ExportColumn[] {
  const seen = new Set<string>();
  const out: ExportColumn[] = [];
  for (const k of keys) {
    const c = BY_KEY.get(k);
    if (!c || seen.has(k) || (c.money && !showMoney)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// ---- Thao tác 2 danh sách (cửa sổ chọn cột)
/** Thêm các key được đánh dấu vào cuối danh sách xuất (theo thứ tự gốc). */
export const addKeys = (chosen: string[], marked: string[], allKeys: string[]) => [
  ...chosen,
  ...allKeys.filter((k) => marked.includes(k) && !chosen.includes(k)),
];
export const removeKeys = (chosen: string[], marked: string[]) => chosen.filter((k) => !marked.includes(k));
/** Dịch các key được đánh dấu lên (-1) / xuống (+1) 1 bậc, giữ thứ tự tương đối. */
export function moveKeys(chosen: string[], marked: string[], dir: -1 | 1): string[] {
  const a = [...chosen];
  const idx = a.map((k, i) => (marked.includes(k) ? i : -1)).filter((i) => i >= 0);
  const order = dir === -1 ? idx : [...idx].reverse();
  for (const i of order) {
    const j = i + dir;
    if (j < 0 || j >= a.length || marked.includes(a[j])) continue;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Định dạng đã lưu (lưu trong trình duyệt)
export interface ExportPreset {
  name: string;
  keys: string[];
}
export const PRESET_STORAGE_KEY = "skylane-order-export-presets";

export function parsePresets(raw: string | null | undefined): ExportPreset[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return v
      .filter((p) => p && typeof p.name === "string" && Array.isArray(p.keys))
      .map((p) => ({ name: String(p.name).trim().slice(0, 60), keys: p.keys.filter((k: unknown) => typeof k === "string" && BY_KEY.has(k)) }))
      .filter((p) => p.name && p.keys.length);
  } catch {
    return [];
  }
}
export function upsertPreset(list: ExportPreset[], name: string, keys: string[]): ExportPreset[] {
  const n = name.trim().slice(0, 60);
  const i = list.findIndex((p) => p.name.toLowerCase() === n.toLowerCase());
  const next = { name: n, keys: [...keys] };
  return i >= 0 ? list.map((p, j) => (j === i ? next : p)) : [...list, next].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

// ---- Ghi sheet Excel
const dateVi = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
const dateTimeVi = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Giá trị đưa vào ô Excel: số là number (để cộng/lọc được), ngày dạng dd/mm/yyyy. */
export function cellValue(c: ExportColumn, o: ExportOrder): string | number | null {
  const v = c.get(o);
  if (v === null || v === undefined || v === "") return null;
  switch (c.type) {
    case "int":
    case "kg":
    case "money":
    case "usd":
      return Number(v);
    case "date":
      return dateVi(String(v));
    case "datetime":
      return dateTimeVi(String(v));
    case "bool":
      return v ? "Có" : "Không";
    default:
      return String(v);
  }
}

const NUM_FMT: Partial<Record<ColumnType, string>> = { int: "#,##0", kg: "#,##0.00#", money: "#,##0", usd: "#,##0.00" };
const SUMMABLE: ColumnType[] = ["int", "kg", "money", "usd"];

export const exportFileName = (now = new Date()) => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(now).replace(/-/g, "");
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Saigon", hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace(":", "");
  return `Van-don-SkyLane-${d}-${t}.xlsx`;
};

export function fillOrdersSheet(wb: ExcelJS.Workbook, rows: ExportOrder[], cols: ExportColumn[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet("Vận đơn", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: c.width ?? Math.max(12, c.label.length + 2) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  for (const o of rows) ws.addRow(cols.map((c) => cellValue(c, o)));
  cols.forEach((c, i) => {
    const fmt = NUM_FMT[c.type];
    if (fmt) ws.getColumn(i + 1).numFmt = fmt;
  });
  if (rows.length && cols.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: cols.length } };
    if (cols.some((c) => SUMMABLE.includes(c.type))) {
      const total = ws.addRow(
        cols.map((c, i) => {
          if (i === 0 && !SUMMABLE.includes(c.type)) return `Tổng (${rows.length.toLocaleString("vi-VN")} đơn)`;
          if (!SUMMABLE.includes(c.type)) return null;
          const letter = ws.getColumn(i + 1).letter;
          const sum = rows.reduce((t, o) => t + (Number(c.get(o)) || 0), 0);
          return { formula: `SUBTOTAL(9,${letter}2:${letter}${rows.length + 1})`, result: Math.round(sum * 1000) / 1000 };
        }),
      );
      total.font = { bold: true };
      total.border = { top: { style: "thin" } };
    }
  }
  return ws;
}
