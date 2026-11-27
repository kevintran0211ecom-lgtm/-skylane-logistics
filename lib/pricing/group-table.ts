/**
 * BẢNG GIÁ RIÊNG CỦA NHÓM từ bảng giá chung (module thuần — web thật & bản chạy thử).
 * Nhân mọi giá (giá trọn mốc & đơn giá/kg) với (1 + %/100): VND làm tròn số nguyên, USD 2 số lẻ.
 * Dùng để: xem trước "bảng giá tương ứng" của nhóm khi đổi %, và tạo bảng riêng cho một tuyến
 * (sau đó có thể sửa bằng cách import bảng giá với phạm vi = nhóm).
 */
import type { Currency, Num } from "./engine";

export interface ScalableZone {
  zoneCode: string;
  zoneName?: string;
  countries: string[];
  matrix: { weightMax: Num; price: Num }[];
  perKg: { weightMin: Num; weightMax?: Num | null; unitPrice: Num }[];
}

export function scalePrice(price: Num, pct: Num, currency: Currency = "VND"): string {
  const v = Number(price) * (1 + Number(pct) / 100);
  return currency === "USD" ? (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, "") : String(Math.round(v));
}

export function scaleZones<Z extends ScalableZone>(zones: Z[], pct: Num, currency: Currency = "VND"): Z[] {
  return zones.map((z) => ({
    ...z,
    countries: [...z.countries],
    matrix: z.matrix.map((t) => ({ ...t, price: scalePrice(t.price, pct, currency) })),
    perKg: z.perKg.map((t) => ({ ...t, unitPrice: scalePrice(t.unitPrice, pct, currency) })),
  }));
}

/** "+10%" / "-5%" / "0%" */
export const pctLabel = (pct: Num) => `${Number(pct) > 0 ? "+" : ""}${Number(pct).toLocaleString("vi-VN")}%`;
