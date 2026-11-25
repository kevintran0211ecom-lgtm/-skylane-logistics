/** Schema validate form Danh mục (thuần, không phụ thuộc DB — có unit test) */
import { z } from "zod";
import { parseNumberCell } from "../pricing/import-excel";
import { normCode } from "../pricing/engine";

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : null));
const optionalCode = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? normCode(v) : null));
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Số nhập tay: chấp nhận "5000", "5.000", "1,5", "-5" → chuỗi NUMERIC */
const decimal = (label: string, opts: { allowNegative?: boolean } = {}) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      const s = (raw ?? "").trim();
      const neg = s.startsWith("-");
      if (neg && !opts.allowNegative) {
        ctx.addIssue({ code: "custom", message: `${label} không được âm` });
        return z.NEVER;
      }
      const v = parseNumberCell(neg ? s.slice(1) : s, "price");
      if (v === undefined || v === null) {
        ctx.addIssue({ code: "custom", message: `${label} không hợp lệ` });
        return z.NEVER;
      }
      return neg && v !== "0" ? `-${v}` : v;
    });

export const customerSchema = z.object({
  mode: z.enum(["create", "edit"]),
  customerCode: z
    .string()
    .transform(normCode)
    .pipe(z.string().min(1, "Nhập mã khách hàng").refine((s) => !s.includes("|"), "Mã KH không được chứa ký tự |")),
  name: z.string().trim().min(1, "Nhập tên khách hàng"),
  phone: optional,
  email: optional.refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Email không hợp lệ"),
  address: optional,
  saleUserId: optional,
  priceGroupCode: optionalCode,
  priceAdjustPct: decimal("% điều chỉnh giá", { allowNegative: true }).refine(
    (v) => Number(v) > -100 && Number(v) <= 1000,
    "% điều chỉnh phải trong khoảng (-100, 1000]",
  ),
  currency: z.enum(["VND", "USD"]),
  syncSourceType: z.enum(["NONE", "GOOGLE_SHEET", "API"]),
  syncEnabled: checkbox,
  syncUrl: optional,
  syncSheet: optional,
  isActive: checkbox,
  note: optional,
});

export const routeSchema = z.object({
  mode: z.enum(["create", "edit"]),
  routeCode: z.string().transform(normCode).pipe(z.string().min(1, "Nhập mã tuyến")),
  name: z.string().trim().min(1, "Nhập tên tuyến"),
  supplierCode: optionalCode,
  serviceType: z.enum(["EPK", "CPN", "CT"], { error: "Chọn loại hình dịch vụ" }),
  weightCalcMode: z.enum(["ACTUAL_ONLY", "MAX_ACTUAL_VOL"], { error: "Chọn cách tính cân" }),
  dimDivisor: decimal("Hệ số DIM").refine((v) => Number(v) > 0, "Hệ số DIM phải lớn hơn 0"),
  isActive: checkbox,
  note: optional,
});
