/**
 * Dòng tổng cuối bảng Vận đơn + sao chép dữ liệu (module thuần, có unit test).
 * Cộng NUMERIC dạng chuỗi bằng số nguyên lớn (BigInt) theo số lẻ cố định → không sai số float.
 */

/** "12.345" (scale 3) → 12345n; chấp nhận số âm, rỗng = 0 */
function toScaled(v: string | number | null | undefined, scale: number): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  const s = typeof v === "number" ? v.toFixed(scale) : String(v).trim();
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return 0n;
  const frac = (m[3] ?? "").padEnd(scale, "0").slice(0, scale);
  const n = BigInt((m[2] || "0") + frac);
  return m[1] ? -n : n;
}
function fromScaled(n: bigint, scale: number): string {
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().padStart(scale + 1, "0");
  const int = s.slice(0, s.length - scale);
  const frac = scale ? s.slice(-scale).replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

export interface OrderTotalsInput {
  packageCount: number | string;
  actualWeight: string;
  billedWeight: string;
  shippedWeight: string;
  costAmount: string;
  sellAmount: string;
}

export interface OrderTotals {
  orders: number;
  packages: number;
  actualWeight: string; // Cân thực
  billedWeight: string; // Tính phí
  shippedWeight: string; // Xuất hàng
  costAmount: string; // Giá gốc
  sellAmount: string; // Giá bán
  profit: string; // Lợi nhuận = giá bán - giá gốc
}

export const EMPTY_TOTALS: OrderTotals = {
  orders: 0,
  packages: 0,
  actualWeight: "0",
  billedWeight: "0",
  shippedWeight: "0",
  costAmount: "0",
  sellAmount: "0",
  profit: "0",
};

/** Tổng: số đơn, số kiện, cân thực, tính phí, xuất hàng, giá gốc, giá bán, lợi nhuận */
export function sumOrders(rows: OrderTotalsInput[]): OrderTotals {
  let packages = 0;
  let aw = 0n, bw = 0n, sw = 0n, cost = 0n, sell = 0n;
  for (const r of rows) {
    packages += Number(r.packageCount) || 0;
    aw += toScaled(r.actualWeight, 3);
    bw += toScaled(r.billedWeight, 3);
    sw += toScaled(r.shippedWeight, 3);
    cost += toScaled(r.costAmount, 2);
    sell += toScaled(r.sellAmount, 2);
  }
  return {
    orders: rows.length,
    packages,
    actualWeight: fromScaled(aw, 3),
    billedWeight: fromScaled(bw, 3),
    shippedWeight: fromScaled(sw, 3),
    costAmount: fromScaled(cost, 2),
    sellAmount: fromScaled(sell, 2),
    profit: fromScaled(sell - cost, 2),
  };
}

/** Đơn giá bán / kg = giá bán ÷ cân tính phí (làm tròn số nguyên VND); 0 kg → null */
export function unitPrice(amount: string | number, weight: string | number): string | null {
  const w = Number(weight);
  if (!(w > 0)) return null;
  return String(Math.round(Number(amount) / w));
}

/** Giá bán từ đơn giá × cân tính phí (làm tròn số nguyên VND) */
export function amountFromUnit(unit: string | number, weight: string | number): string {
  return String(Math.round(Number(unit) * Number(weight)));
}

/** Bảng → văn bản TSV để dán vào Excel / Google Sheet (bỏ tab & xuống dòng trong ô) */
export function toTsv(header: string[] | null, rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => String(v ?? "").replace(/[\t\r\n]+/g, " ");
  return [...(header ? [header] : []), ...rows].map((r) => r.map(cell).join("\t")).join("\n");
}
