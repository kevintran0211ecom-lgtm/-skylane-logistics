/**
 * CỬA SỔ CHI TIẾT / SỬA 1 VẬN ĐƠN (bấm vào mã vận đơn) — module thuần, có unit test.
 *
 * - Mỗi vai trò chỉ sửa được một số trường (ORDER_EDIT_FIELDS_BY_ROLE); trường khác chỉ xem.
 * - Giá bán / giá gốc: để trống = TỰ TÍNH theo bảng giá; nhập số = GHI ĐÈ thủ công
 *   (manual_overrides sell_amount / cost_amount — engine giữ nguyên khi tính lại).
 *   Đơn giá bán (VND/kg) chỉ là cách nhập khác của giá bán: giá bán = đơn giá × cân tính phí.
 * - Đổi trường ảnh hưởng tới giá (khách, tuyến, điểm đến, ngày gửi, kiện, ghi đè tiền) → tính lại giá
 *   ngay nếu đơn chưa khóa giá.
 */
import type { Role } from "../auth/permissions";
import { parseNumberCell } from "../pricing/import-excel";
import { ORDER_STATUSES, type OrderStatus } from "./status";

export const ORDER_EDIT_FIELDS = [
  "customerCode",
  "billCode",
  "trackingNumber",
  "routeCode",
  "assignedRouteCode",
  "destinationIso2",
  "shippedAt",
  "status",
  "exportedAt",
  "receiverName",
  "receiverAddress",
  "receiverCity",
  "receiverState",
  "receiverPostalCode",
  "receiverPhone",
  "receiverEmail",
  "hsCode",
  "goodsDescription",
  "goodsNameEn",
  "declaredValueUsd",
  "note",
  "packages",
  "sellAmount",
  "costAmount",
] as const;
export type OrderEditField = (typeof ORDER_EDIT_FIELDS)[number];

/** Nhãn hiển thị (dùng chung form web thật & bản chạy thử) */
export const ORDER_EDIT_LABEL: Record<OrderEditField, string> = {
  customerCode: "Khách hàng",
  billCode: "Mã vận đơn",
  trackingNumber: "Tracking",
  routeCode: "Tuyến vận chuyển",
  assignedRouteCode: "Tuyến chỉ định",
  destinationIso2: "Điểm đến (ISO2)",
  shippedAt: "Ngày gửi hàng",
  status: "Trạng thái",
  exportedAt: "Thời gian xuất hàng",
  receiverName: "Người nhận",
  receiverAddress: "Địa chỉ người nhận",
  receiverCity: "Thành phố người nhận",
  receiverState: "Bang/tỉnh người nhận",
  receiverPostalCode: "Mã bưu chính",
  receiverPhone: "SĐT người nhận",
  receiverEmail: "Email người nhận",
  hsCode: "Mã HS (hải quan)",
  goodsDescription: "Tên hàng tiếng Việt",
  goodsNameEn: "Tên hàng tiếng Anh",
  declaredValueUsd: "Giá trị khai báo (USD)",
  note: "Ghi chú",
  packages: "Kiện hàng (kích thước, cân)",
  sellAmount: "Giá bán",
  costAmount: "Giá gốc",
};

const WAREHOUSE: OrderEditField[] = [
  "trackingNumber", "assignedRouteCode", "status", "exportedAt", "receiverName", "receiverAddress", "receiverCity", "receiverState",
  "receiverPostalCode", "receiverPhone", "receiverEmail", "hsCode", "goodsDescription", "goodsNameEn", "declaredValueUsd", "note", "packages",
];
export const ORDER_EDIT_FIELDS_BY_ROLE: Record<Role, readonly OrderEditField[]> = {
  ADMIN: ORDER_EDIT_FIELDS,
  KE_TOAN: ORDER_EDIT_FIELDS,
  // Kho: thông tin vận hành & hải quan, kiện hàng, tuyến chỉ định — không đổi khách, tuyến báo khách, điểm đến, ngày gửi, tiền
  KHO: WAREHOUSE,
  SALE: [],
};

/** Trường làm thay đổi cân / giá → cần tính lại giá (đơn chưa khóa) */
const PRICING_FIELDS: OrderEditField[] = ["customerCode", "routeCode", "assignedRouteCode", "destinationIso2", "shippedAt", "packages", "sellAmount", "costAmount"];

export interface OrderEditPlan {
  id: number;
  rowVersion: number;
  /** cột cần cập nhật (tên thuộc tính Drizzle) → giá trị */
  set: Partial<{
    customerCode: string;
    billCode: string;
    trackingNumber: string | null;
    routeCode: string;
    assignedRouteCode: string | null; // null = như tuyến vận chuyển
    destinationIso2: string;
    shippedAt: string | null;
    status: OrderStatus;
    exportedAt: string | null;
    receiverName: string | null;
    receiverAddress: string | null;
    receiverCity: string | null;
    receiverState: string | null;
    receiverPostalCode: string | null;
    receiverPhone: string | null;
    receiverEmail: string | null;
    hsCode: string | null;
    goodsDescription: string | null;
    goodsNameEn: string | null;
    declaredValueUsd: string | null;
    note: string | null;
  }>;
  packages?: { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string }[];
  /** undefined = không đổi; null = bỏ ghi đè (tự tính); chuỗi = ghi đè */
  sellAmount?: string | null;
  costAmount?: string | null;
  fields: OrderEditField[];
  affectsPricing: boolean;
}

export type OrderEditParse = { ok: true; plan: OrderEditPlan } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const code = (s: string) => s.trim().toUpperCase();
const text = (s: string | undefined) => (s?.trim() ? s.trim() : null);

/** "2026-11-25T10:30" | "2026-11-25" (giờ VN) → ISO +07:00; rỗng → null; sai → undefined */
export function localToIso(v: string | undefined): string | null | undefined {
  const s = v?.trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/.exec(s);
  if (!m) return undefined;
  return `${m[1]}T${m[2] ?? "00:00"}:00+07:00`;
}

/** ISO → "2026-11-25T10:30" giờ VN (giá trị cho ô datetime-local) */
export function isoToLocal(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Saigon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

type Pkg = { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string };
const PKG_LABEL = { lengthCm: "Dài", widthCm: "Rộng", heightCm: "Cao", actualWeight: "Cân thực" } as const;

/** Danh sách kiện (JSON) → kiện chuẩn hóa số thập phân; cùng quy tắc với packageSchema (không dùng zod để bản chạy thử nhẹ) */
export function parsePackages(raw: unknown): { ok: true; packages: Pkg[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Danh sách kiện không hợp lệ" };
  if (raw.length > 500) return { ok: false, error: "Tối đa 500 kiện" };
  const out: Pkg[] = [];
  for (const [i, p] of raw.entries()) {
    if (!p || typeof p !== "object") return { ok: false, error: "Danh sách kiện không hợp lệ" };
    const pkg = {} as Pkg;
    for (const k of Object.keys(PKG_LABEL) as (keyof Pkg)[]) {
      const v = (p as Record<string, unknown>)[k];
      const n = parseNumberCell(v === undefined || v === null || v === "" ? "0" : (v as string | number), "weight");
      if (n === undefined || n === null) return { ok: false, error: `Kiện ${i + 1}: ${PKG_LABEL[k]} không hợp lệ` };
      pkg[k] = n;
    }
    out.push(pkg);
  }
  return { ok: true, packages: out };
}

/**
 * Form sửa đơn → kế hoạch cập nhật. Chỉ xử lý trường vai trò được sửa VÀ có gửi lên trong form
 * (trường bị khóa không render ô nhập nên không gửi lên).
 */
export function parseOrderEdit(form: Record<string, string>, role: Role): OrderEditParse {
  const id = Number(form.id);
  const rowVersion = Number(form.rowVersion);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Mã đơn không hợp lệ." };
  if (!Number.isInteger(rowVersion) || rowVersion <= 0) return { ok: false, error: "Thiếu phiên bản dữ liệu — tải lại trang." };
  const allowed = ORDER_EDIT_FIELDS_BY_ROLE[role];
  const fields = allowed.filter((f) => f in form);
  if (fields.length === 0) return { ok: false, error: "Vai trò của bạn chỉ được xem đơn hàng." };

  const err: Record<string, string> = {};
  const plan: OrderEditPlan = { id, rowVersion, set: {}, fields, affectsPricing: false };
  const v = (f: string) => form[f] ?? "";

  for (const f of fields) {
    switch (f) {
      case "customerCode":
      case "billCode":
      case "routeCode":
        if (!v(f).trim()) err[f] = `Nhập ${ORDER_EDIT_LABEL[f].toLowerCase()}`;
        else plan.set[f] = code(v(f));
        break;
      case "assignedRouteCode":
        plan.set.assignedRouteCode = v(f).trim() ? code(v(f)) : null;
        break;
      case "destinationIso2":
        if (!/^[A-Za-z]{2}$/.test(v(f).trim())) err[f] = "Mã quốc gia 2 chữ (VD: US)";
        else plan.set.destinationIso2 = code(v(f));
        break;
      case "shippedAt":
      case "exportedAt": {
        const iso = localToIso(v(f));
        if (iso === undefined) err[f] = "Ngày giờ không hợp lệ";
        else plan.set[f] = iso;
        break;
      }
      case "status":
        if (!(ORDER_STATUSES as readonly string[]).includes(v(f))) err[f] = "Chọn trạng thái";
        else plan.set.status = v(f) as OrderStatus;
        break;
      case "receiverEmail": {
        const e = text(v(f));
        if (e && !/^\S+@\S+\.\S+$/.test(e)) err[f] = "Email không hợp lệ";
        else plan.set.receiverEmail = e?.toLowerCase() ?? null;
        break;
      }
      case "declaredValueUsd": {
        const t = text(v(f));
        if (t === null) plan.set.declaredValueUsd = null;
        else {
          const n = parseNumberCell(t, "price");
          if (!n) err[f] = "Giá trị khai báo không hợp lệ";
          else plan.set.declaredValueUsd = n;
        }
        break;
      }
      case "sellAmount":
      case "costAmount": {
        const t = text(v(f));
        if (t === null) plan[f] = null;
        else {
          const n = parseNumberCell(t.replace(/\./g, "").replace(/\s/g, ""), "price");
          if (n === undefined || n === null) err[f] = "Số tiền không hợp lệ (VD 250.000)";
          else plan[f] = String(Math.round(Number(n)));
        }
        break;
      }
      case "packages": {
        let raw: unknown;
        try {
          raw = JSON.parse(v(f) || "[]");
        } catch {
          err[f] = "Danh sách kiện không hợp lệ";
          break;
        }
        const p = parsePackages(raw);
        if (!p.ok) err[f] = p.error;
        else plan.packages = p.packages;
        break;
      }
      default:
        plan.set[f] = text(v(f));
    }
  }
  if (Object.keys(err).length) return { ok: false, error: "Vui lòng kiểm tra lại các trường được đánh dấu.", fieldErrors: err };
  plan.affectsPricing = fields.some((f) => PRICING_FIELDS.includes(f));
  return { ok: true, plan };
}

/** Thời gian xuất hàng tự ghi khi đơn chuyển sang "Đã xuất hàng" (giữ nguyên nếu đã có) */
export function exportedAtOnStatus(prevStatus: OrderStatus | null, nextStatus: OrderStatus, current: string | null, now: string): string | null {
  if (nextStatus === "Đã xuất hàng" && prevStatus !== "Đã xuất hàng" && !current) return now;
  return current;
}
