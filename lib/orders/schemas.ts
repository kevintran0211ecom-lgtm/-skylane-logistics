/** Validate form Tạo đơn & Sửa đổi hàng loạt (thuần, không phụ thuộc DB — có unit test) */
import { z } from "zod";
import { parseNumberCell } from "../pricing/import-excel";

export const ORDER_STATUSES = ["Phát sinh", "Đã nhận kho", "Đã xuất hàng", "Đã giao hàng", "Hoàn"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const code = (s: string) => s.trim().toUpperCase();
const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));
const weight = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((raw, ctx) => {
      const v = parseNumberCell(raw === undefined || raw === "" ? "0" : raw, "weight");
      if (v === undefined || v === null) {
        ctx.addIssue({ code: "custom", message: `${label} không hợp lệ` });
        return z.NEVER;
      }
      return v;
    });

/** "2026-11-25T10:30" (datetime-local, giờ VN) → ISO +07:00 */
const localDateTime = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(v.trim());
    if (!m) {
      ctx.addIssue({ code: "custom", message: "Ngày giờ không hợp lệ" });
      return z.NEVER;
    }
    return `${m[1]}T${m[2]}:00+07:00`;
  });

export const packageSchema = z.object({
  lengthCm: weight("Dài"),
  widthCm: weight("Rộng"),
  heightCm: weight("Cao"),
  actualWeight: weight("Cân thực"),
});

export const createOrderSchema = z.object({
  customerCode: z.string().transform(code).pipe(z.string().min(1, "Chọn khách hàng")),
  billCode: z.string().transform(code).pipe(z.string().min(1, "Nhập mã vận đơn")),
  trackingNumber: optional,
  routeCode: z.string().transform(code).pipe(z.string().min(1, "Chọn tuyến vận chuyển")),
  assignedRouteCode: optional.transform((v) => (v ? code(v) : null)),
  destinationIso2: z
    .string()
    .transform(code)
    .pipe(z.string().regex(/^[A-Z]{2}$/, "Điểm đến là mã quốc gia 2 chữ (VD: US)")),
  shippedAt: localDateTime,
  receiverName: optional,
  receiverPhone: optional,
  receiverEmail: optional.refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Email không hợp lệ"),
  receiverAddress: optional,
  receiverCity: optional,
  receiverState: optional,
  receiverPostalCode: optional,
  goodsDescription: optional,
  hsCode: optional,
  declaredValueUsd: optional.refine((v) => v === null || !!parseNumberCell(v, "price"), "Giá trị khai báo không hợp lệ"),
  note: optional,
  packages: z
    .string()
    .optional()
    .transform((s, ctx) => {
      try {
        const arr = JSON.parse(s || "[]");
        if (!Array.isArray(arr)) throw new Error();
        return arr as unknown[];
      } catch {
        ctx.addIssue({ code: "custom", message: "Danh sách kiện không hợp lệ" });
        return z.NEVER;
      }
    })
    .pipe(z.array(packageSchema).max(500, "Tối đa 500 kiện")),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// =============================================================================
// Sửa đổi hàng loạt — chỉ cập nhật trường được tick
// =============================================================================
export const BULK_FIELDS = [
  "assignedRouteCode",
  "routeCode",
  "destinationIso2",
  "status",
  "actualWeight",
  "volumetricWeight",
  "billedWeight",
  "shippedWeight",
  "trackingNumber",
  "note",
  "priceLocked",
] as const;
export type BulkField = (typeof BULK_FIELDS)[number];

/** Trường cân nhập tay → tên trường ghi đè của engine / cột DB */
export const WEIGHT_OVERRIDES = {
  actualWeight: "actual_weight",
  volumetricWeight: "volumetric_weight",
  billedWeight: "billed_weight",
  shippedWeight: "shipped_weight",
} as const;

export interface BulkEditPlan {
  ids: number[];
  fields: BulkField[];
  routeCode?: string;
  assignedRouteCode?: string | null; // null = theo tuyến vận chuyển
  destinationIso2?: string;
  status?: OrderStatus;
  trackingNumber?: string | null;
  note?: string | null;
  priceLocked?: boolean;
  /** giá trị ghi đè; null = bỏ ghi đè, trả về tự động */
  weights: Partial<Record<(typeof WEIGHT_OVERRIDES)[keyof typeof WEIGHT_OVERRIDES], string | null>>;
  /** có trường ảnh hưởng tới cân/giá → cần tính lại giá các đơn chưa khóa */
  affectsPricing: boolean;
}

export type BulkParse = { ok: true; plan: BulkEditPlan } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function parseBulkEdit(form: Record<string, string>): BulkParse {
  const ids = [...new Set((form.ids ?? "").split(",").map((s) => Number(s.trim())))].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { ok: false, error: "Chưa chọn đơn nào." };
  if (ids.length > 1000) return { ok: false, error: "Mỗi lần sửa tối đa 1.000 đơn." };
  const fields = BULK_FIELDS.filter((f) => form[`enable_${f}`] === "on");
  if (fields.length === 0) return { ok: false, error: "Tick chọn ít nhất một trường cần cập nhật." };

  const plan: BulkEditPlan = { ids, fields, weights: {}, affectsPricing: false };
  const err: Record<string, string> = {};
  const val = (f: BulkField) => (form[f] ?? "").trim();
  for (const f of fields) {
    switch (f) {
      case "routeCode":
        if (!val(f)) err[f] = "Chọn tuyến vận chuyển";
        else plan.routeCode = code(val(f));
        break;
      case "assignedRouteCode":
        plan.assignedRouteCode = val(f) ? code(val(f)) : null;
        break;
      case "destinationIso2":
        if (!/^[A-Za-z]{2}$/.test(val(f))) err[f] = "Mã quốc gia 2 chữ (VD: US)";
        else plan.destinationIso2 = code(val(f));
        break;
      case "status":
        if (!(ORDER_STATUSES as readonly string[]).includes(val(f))) err[f] = "Chọn trạng thái";
        else plan.status = val(f) as OrderStatus;
        break;
      case "trackingNumber":
        plan.trackingNumber = val(f) || null;
        break;
      case "note":
        plan.note = val(f) || null;
        break;
      case "priceLocked":
        if (val(f) !== "true" && val(f) !== "false") err[f] = "Chọn khóa / mở khóa";
        else plan.priceLocked = val(f) === "true";
        break;
      default: {
        const key = WEIGHT_OVERRIDES[f];
        if (!val(f)) plan.weights[key] = null;
        else {
          const v = parseNumberCell(val(f), "weight");
          if (!v) err[f] = "Cân nặng không hợp lệ";
          else plan.weights[key] = v;
        }
      }
    }
  }
  if (Object.keys(err).length) return { ok: false, error: "Vui lòng kiểm tra lại các trường đã tick.", fieldErrors: err };
  plan.affectsPricing = fields.some((f) => f !== "status" && f !== "trackingNumber" && f !== "note" && !(f === "priceLocked" && plan.priceLocked));
  return { ok: true, plan };
}
