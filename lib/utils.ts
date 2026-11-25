import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Chuẩn hóa mã tuyến / mã nước ISO2 / mã vận đơn / mã KH: TRIM + UPPER. */
export function normCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** order_key = customer_code|bill_code (khớp cột generated trong DB). */
export function orderKey(customerCode: string, billCode: string): string {
  return `${normCode(customerCode)}|${normCode(billCode)}`;
}

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Format tiền: VND làm tròn số nguyên, dấu chấm hàng nghìn. NUMERIC từ DB về dạng string. */
export function formatMoney(value: string | number | null | undefined, currency: "VND" | "USD" = "VND"): string {
  const n = Number(value ?? 0);
  return currency === "VND" ? vnd.format(Math.round(n)) : usd.format(n);
}
