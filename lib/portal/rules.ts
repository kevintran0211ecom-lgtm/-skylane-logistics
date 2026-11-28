/**
 * CỔNG KHÁCH HÀNG — quy tắc thuần (dùng chung server Next.js và bản chạy thử, có unit test).
 *
 *  - Tài khoản: SkyLane tạo bằng email khách cung cấp, mật khẩu mặc định 123456,
 *    khách bắt buộc đổi mật khẩu ở lần đăng nhập đầu.
 *  - Đặt đơn: giống form nhập tay nội bộ nhưng KHÔNG có khách hàng (lấy theo tài khoản),
 *    tuyến chỉ định, giá gốc, ngày gửi hàng. Đơn vào Đơn hàng dự báo chờ SkyLane xác nhận.
 *  - Khách sửa được đơn khi còn "Chờ xác nhận" (Đơn hàng dự báo) hoặc vận đơn "Phát sinh" chưa khóa giá.
 *  - Khách chỉ thấy thành tiền từng đơn — không thấy giá gốc, lợi nhuận, tuyến chỉ định, nhà cung cấp.
 */
import { parseNumberCell } from "../pricing/import-excel";
import { parsePackages } from "../orders/edit";
import type { DraftData } from "../orders/import-parse";

export const DEFAULT_PASSWORD = "123456";
export const MIN_PASSWORD = 8;

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Mật khẩu mới tối thiểu ${MIN_PASSWORD} ký tự.`;
  if (password === DEFAULT_PASSWORD || /^(\d)\1+$/.test(password) || password === "12345678") return "Mật khẩu quá dễ đoán — hãy chọn mật khẩu khác.";
  if (password !== confirm) return "Nhập lại mật khẩu không khớp.";
  return null;
}

export const normEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Vận đơn khách còn sửa được */
export const canCustomerEditOrder = (o: { status: string; priceLocked: boolean }) => o.status === "Phát sinh" && !o.priceLocked;

// -----------------------------------------------------------------------------
// Form đặt đơn / sửa đơn của khách
// -----------------------------------------------------------------------------
export const PORTAL_ORDER_FIELDS = [
  "billCode", "trackingNumber", "routeCode", "destinationIso2",
  "receiverName", "receiverPhone", "receiverEmail", "receiverAddress", "receiverCity", "receiverState", "receiverPostalCode",
  "goodsDescription", "goodsNameEn", "hsCode", "declaredValueUsd", "note", "packages",
] as const;
export type PortalOrderField = (typeof PORTAL_ORDER_FIELDS)[number];

/** Trường bắt buộc (theo yêu cầu SkyLane 28/11/2026) */
export const PORTAL_REQUIRED: PortalOrderField[] = [
  "billCode", "routeCode", "destinationIso2", "receiverName", "receiverPhone", "receiverAddress",
  "receiverCity", "receiverPostalCode", "goodsDescription", "declaredValueUsd", "packages",
];

export const PORTAL_FIELD_LABEL: Record<PortalOrderField, string> = {
  billCode: "Mã vận đơn",
  trackingNumber: "Tracking",
  routeCode: "Tuyến vận chuyển",
  destinationIso2: "Điểm đến (ISO2)",
  receiverName: "Tên người nhận",
  receiverPhone: "Số điện thoại",
  receiverEmail: "Email người nhận",
  receiverAddress: "Địa chỉ",
  receiverCity: "Thành phố",
  receiverState: "Bang / tỉnh",
  receiverPostalCode: "Mã bưu chính",
  goodsDescription: "Tên hàng tiếng Việt",
  goodsNameEn: "Tên hàng tiếng Anh",
  hsCode: "Mã HS",
  declaredValueUsd: "Giá trị khai báo (USD)",
  note: "Ghi chú",
  packages: "Kích thước & cân nặng",
};

export type PortalOrderData = Omit<DraftData, "customerCode" | "orderKey" | "assignedRouteCode" | "createdAt" | "shippedAt">;
export type PortalOrderParse = { ok: true; data: PortalOrderData } | { ok: false; error: string; fieldErrors: Record<string, string> };

const code = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
const text = (s: string | undefined) => (s?.trim() ? s.trim() : null);

/** Form (chuỗi) → dữ liệu đơn đã kiểm tra. Kiện: mỗi kiện phải có Dài, Rộng, Cao và Cân > 0. */
export function parsePortalOrder(form: Record<string, string | undefined>): PortalOrderParse {
  const err: Record<string, string> = {};
  const v = (k: PortalOrderField) => form[k] ?? "";
  for (const f of PORTAL_REQUIRED) if (f !== "packages" && !v(f).trim()) err[f] = `Nhập ${PORTAL_FIELD_LABEL[f].toLowerCase()}`;

  const billCode = code(v("billCode"));
  if (billCode && !/^[A-Z0-9][A-Z0-9._\-/ ]{0,49}$/.test(billCode)) err.billCode = "Mã vận đơn chỉ gồm chữ, số và - _ . / (tối đa 50 ký tự)";
  const iso2 = code(v("destinationIso2"));
  if (iso2 && !/^[A-Z]{2}$/.test(iso2)) err.destinationIso2 = "Mã quốc gia 2 chữ (VD: US)";
  const email = text(v("receiverEmail"));
  if (email && !isEmail(email)) err.receiverEmail = "Email không hợp lệ";
  let declared: string | null = null;
  if (v("declaredValueUsd").trim()) {
    const d = parseNumberCell(v("declaredValueUsd").trim(), "price");
    if (!d || Number(d) <= 0) err.declaredValueUsd = "Giá trị khai báo phải là số lớn hơn 0";
    else declared = d;
  }

  let packages: PortalOrderData["packages"] = [];
  let raw: unknown = [];
  try {
    raw = JSON.parse(v("packages") || "[]");
  } catch {
    raw = null;
  }
  const pk = parsePackages(raw);
  if (!pk.ok) err.packages = pk.error;
  else {
    packages = pk.packages.filter((p) => Number(p.actualWeight) || Number(p.lengthCm) || Number(p.widthCm) || Number(p.heightCm));
    const bad = packages.findIndex((p) => !(Number(p.lengthCm) > 0 && Number(p.widthCm) > 0 && Number(p.heightCm) > 0 && Number(p.actualWeight) > 0));
    if (packages.length === 0) err.packages = "Nhập ít nhất 1 kiện (Dài, Rộng, Cao, Cân nặng)";
    else if (bad >= 0) err.packages = `Kiện ${bad + 1}: nhập đủ Dài, Rộng, Cao (cm) và Cân nặng (kg) lớn hơn 0`;
  }

  if (Object.keys(err).length) return { ok: false, error: "Vui lòng kiểm tra lại các ô được đánh dấu.", fieldErrors: err };
  return {
    ok: true,
    data: {
      billCode,
      trackingNumber: text(v("trackingNumber")),
      routeCode: code(v("routeCode")),
      destinationIso2: iso2,
      receiverName: text(v("receiverName")),
      receiverPhone: text(v("receiverPhone")),
      receiverEmail: email?.toLowerCase() ?? null,
      receiverAddress: text(v("receiverAddress")),
      receiverCity: text(v("receiverCity")),
      receiverState: text(v("receiverState")),
      receiverPostalCode: text(v("receiverPostalCode")),
      goodsDescription: text(v("goodsDescription")),
      goodsNameEn: text(v("goodsNameEn")),
      hsCode: text(v("hsCode")),
      declaredValueUsd: declared,
      note: text(v("note")),
      packages,
    },
  };
}

/** Dữ liệu khách nhập → bản ghi Đơn hàng dự báo (khách lấy theo tài khoản, tuyến chỉ định = tuyến vận chuyển) */
export const toDraftData = (customerCode: string, d: PortalOrderData): DraftData => ({
  ...d,
  customerCode,
  orderKey: `${customerCode}|${d.billCode}`,
  assignedRouteCode: null,
  createdAt: null,
  shippedAt: null,
});

/** Đơn nhập bằng Excel trên cổng: các trường bắt buộc còn thiếu (cùng quy tắc với form đặt đơn) */
export function portalMissingFields(d: Pick<DraftData, "receiverName" | "receiverPhone" | "receiverAddress" | "receiverCity" | "receiverPostalCode" | "goodsDescription" | "declaredValueUsd" | "packages">): string[] {
  const miss: string[] = [];
  for (const f of ["receiverName", "receiverPhone", "receiverAddress", "receiverCity", "receiverPostalCode", "goodsDescription", "declaredValueUsd"] as const) {
    const v = d[f];
    if (v === null || v === undefined || String(v).trim() === "" || (f === "declaredValueUsd" && !(Number(v) > 0))) miss.push(PORTAL_FIELD_LABEL[f].toLowerCase());
  }
  const badPkg = d.packages.findIndex((p) => !(Number(p.lengthCm) > 0 && Number(p.widthCm) > 0 && Number(p.heightCm) > 0 && Number(p.actualWeight) > 0));
  if (d.packages.length === 0) miss.push("kiện hàng");
  else if (badPkg >= 0) miss.push(`kích thước / cân nặng kiện ${badPkg + 1}`);
  return miss;
}

/** Giá trị form khi mở sửa (từ đơn dự báo hoặc vận đơn) */
export function portalFormValues(d: Partial<PortalOrderData> & { packages?: { lengthCm: unknown; widthCm: unknown; heightCm: unknown; actualWeight: unknown }[] }) {
  const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const n = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(Number(x)).replace(".", ","));
  const out: Record<string, string> = {};
  for (const f of PORTAL_ORDER_FIELDS) if (f !== "packages") out[f] = s((d as Record<string, unknown>)[f]);
  if (out.declaredValueUsd) out.declaredValueUsd = n(out.declaredValueUsd);
  return {
    values: out,
    packages: (d.packages ?? []).map((p) => ({ lengthCm: n(p.lengthCm), widthCm: n(p.widthCm), heightCm: n(p.heightCm), actualWeight: n(p.actualWeight) })),
  };
}

// -----------------------------------------------------------------------------
// Tải Excel vận đơn phía khách: chỉ các cột an toàn (không giá gốc / lợi nhuận / tuyến chỉ định / NCC)
// -----------------------------------------------------------------------------
export const PORTAL_EXPORT_COLUMNS = [
  "billCode", "trackingNumber", "pricingDate", "createdAt", "receivedAt", "exportedAt", "deliveredAt", "routeCode", "destinationIso2", "status",
  "packageCount", "dimensions", "actualWeight", "volumetricWeight", "billedWeight", "totalAmount", "debtStatus",
  "receiverName", "receiverPhone", "receiverEmail", "receiverAddress", "receiverCity", "receiverState", "receiverPostalCode",
  "goodsDescription", "goodsNameEn", "hsCode", "declaredValueUsd", "note",
];

/** Trạng thái hiển thị cho khách: đơn dự báo chờ xác nhận / đã loại + trạng thái vận đơn */
export const PORTAL_TABS = ["CHO_XAC_NHAN", "Phát sinh", "Đã nhận kho", "Đã xuất hàng", "Đã giao hàng", "Hoàn", "DA_LOAI"] as const;
export type PortalTab = (typeof PORTAL_TABS)[number];
export const PORTAL_TAB_LABEL: Record<PortalTab, string> = {
  CHO_XAC_NHAN: "Chờ xác nhận",
  "Phát sinh": "Phát sinh",
  "Đã nhận kho": "Đã nhận kho",
  "Đã xuất hàng": "Đã xuất hàng",
  "Đã giao hàng": "Đã giao hàng",
  Hoàn: "Hoàn",
  DA_LOAI: "Đã hủy / từ chối",
};
