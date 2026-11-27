/**
 * Tóm tắt kết quả TÍNH LẠI GIÁ (module thuần — dùng ở server và bản chạy thử).
 * Giúp người dùng hiểu vì sao giá bán thay đổi hay không: đơn dùng giá riêng của khách không áp %,
 * đơn đã khóa giá giữ nguyên, đơn chưa tra được giá giữ tiền cũ.
 */
import type { PriceScope } from "../pricing/engine";

export interface RepriceReport {
  repriced: number; // đã tính lại cân & giá
  locked: number; // bỏ qua vì đã khóa giá
  failed: { billCode: string; message: string }[]; // tính được cân nhưng không tra được giá (giữ tiền cũ)
  /** Tổng giá bán các đơn đã tính lại — trước / sau */
  sellBefore?: string;
  sellAfter?: string;
  /** Số đơn theo nguồn giá bán sau khi tính lại */
  byScope?: Partial<Record<PriceScope, number>>;
}

export const emptyReport = (): RepriceReport => ({ repriced: 0, locked: 0, failed: [], sellBefore: "0", sellAfter: "0", byScope: {} });

/** Cộng 1 đơn vừa tính lại vào báo cáo (tiền VND số nguyên, cộng bằng BigInt để không sai số) */
export function addRepriced(r: RepriceReport, before: string | number, after: string | number, scope: PriceScope | null): void {
  const toInt = (v: string | number) => BigInt(Math.round(Number(v) || 0));
  r.sellBefore = String(BigInt(r.sellBefore ?? "0") + toInt(before));
  r.sellAfter = String(BigInt(r.sellAfter ?? "0") + toInt(after));
  if (scope) (r.byScope ??= {})[scope] = ((r.byScope ??= {})[scope] ?? 0) + 1;
}

const vnd = (s: string) => Number(s).toLocaleString("vi-VN");

/** Thông báo ngắn gọn cho người dùng */
export function repriceMessage(r: RepriceReport): string {
  const parts: string[] = [];
  if (r.repriced) {
    let p = `tính lại giá ${r.repriced} đơn chưa khóa`;
    if (r.sellBefore !== undefined && r.sellAfter !== undefined)
      p += r.sellBefore === r.sellAfter ? ` (tổng giá bán không đổi: ${vnd(r.sellAfter)})` : ` (tổng giá bán ${vnd(r.sellBefore)} → ${vnd(r.sellAfter)})`;
    parts.push(p);
  }
  const own = r.byScope?.CUSTOMER ?? 0;
  if (own) parts.push(`${own} đơn dùng giá riêng của khách nên không áp % điều chỉnh`);
  if (r.locked) parts.push(`${r.locked} đơn đã khóa giá giữ nguyên`);
  if (r.failed.length) parts.push(`${r.failed.length} đơn chưa tra được giá`);
  return parts.join(", ");
}

/** Nhãn nguồn giá bán của 1 đơn */
export const SCOPE_LABEL: Record<PriceScope, string> = {
  CUSTOMER: "Giá riêng của khách (không áp %)",
  GROUP: "Bảng giá riêng của nhóm × (1 + % khách)",
  DEFAULT: "Bảng giá chung × (1 + % nhóm) × (1 + % khách)",
};
