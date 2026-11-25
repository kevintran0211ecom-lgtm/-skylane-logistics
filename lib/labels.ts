import type { PricingMode, ServiceType, WeightCalcMode } from "@/lib/pricing/engine";

export const SERVICE_TYPES: { value: ServiceType; label: string; rounding: string }[] = [
  { value: "EPK", label: "EPK", rounding: "Không làm tròn từng kiện; tổng bill làm tròn lên 0,05 kg" },
  { value: "CPN", label: "CPN", rounding: "Từng kiện & tổng bill làm tròn lên 0,5 kg (≤20 kg) / 1 kg (>20 kg)" },
  { value: "CT", label: "CT", rounding: "Không làm tròn từng kiện; tổng bill làm tròn lên 1 kg" },
];

export const WEIGHT_CALC_MODES: { value: WeightCalcMode; label: string; hint: string }[] = [
  { value: "MAX_ACTUAL_VOL", label: "Lấy max (cân thực, thể tích)", hint: "So sánh cân thực với Dài × Rộng × Cao / DIM" },
  { value: "ACTUAL_ONLY", label: "Chỉ cân thực", hint: "Bỏ qua thể tích, không dùng hệ số DIM" },
];

export const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  MA_TRAN: "Ma trận",
  THEO_KG: "Theo kg",
  "MA_TRAN+THEO_KG": "Ma trận + Theo kg",
};

export const PRICE_KIND_LABEL = { COST: "Giá gốc", SELL: "Giá bán" } as const;

export const PRICING_STATUS: Record<"DRAFT" | "ACTIVE" | "ARCHIVED", { label: string; tone: "muted" | "success" | "warning" }> = {
  DRAFT: { label: "Nháp", tone: "muted" },
  ACTIVE: { label: "Đang áp dụng", tone: "success" },
  ARCHIVED: { label: "Lưu trữ", tone: "warning" },
};

export const SYNC_SOURCES = [
  { value: "NONE", label: "Không đồng bộ" },
  { value: "GOOGLE_SHEET", label: "Google Sheet" },
  { value: "API", label: "API" },
] as const;

/** Phạm vi áp dụng của 1 phiên bản giá */
export function scopeLabel(customerCode: string | null, priceGroupCode: string | null): string {
  if (customerCode) return `KH ${customerCode}`;
  if (priceGroupCode) return `Nhóm ${priceGroupCode}`;
  return "Chung";
}

/** 0.05 → "0,05"; giữ tối đa 3 số lẻ */
export function formatKg(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}
