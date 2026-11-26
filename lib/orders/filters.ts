/**
 * Bộ lọc màn Vận đơn đọc từ URL (module thuần, có unit test) — giữ được khi tải lại / chia sẻ link.
 *   ?q=…            1 mã (gần đúng) hoặc nhiều mã mỗi dòng (chính xác)
 *   ?status=…       trạng thái vận đơn
 *   ?df=sent|exported|created  &from=YYYY-MM-DD &to=YYYY-MM-DD   lọc thời gian (giờ VN)
 *   ?sort=billCode&dir=asc     sắp xếp cột (A→Z / Z→A)
 */
import { ORDER_STATUSES, type OrderStatus } from "./status";

export const ORDER_SORT_KEYS = [
  "billCode", "trackingNumber", "customerCode", "customerName", "routeCode", "destinationIso2", "status", "pricingDate", "exportedAt",
  "packageCount", "actualWeight", "volumetricWeight", "billedWeight", "shippedWeight", "sellAmount", "costAmount", "profit", "debtStatus", "createdAt",
] as const;
export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];

export const DATE_FIELDS = {
  sent: "Ngày gửi hàng",
  exported: "Thời gian xuất hàng",
  created: "Ngày tạo đơn",
} as const;
export type DateField = keyof typeof DATE_FIELDS;

export interface OrderListFilter {
  q: string;
  status?: OrderStatus;
  dateField: DateField;
  from?: string;
  to?: string;
  sort?: OrderSortKey;
  dir: "asc" | "desc";
}

const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function parseOrderFilter(sp: Record<string, string | string[] | undefined>): OrderListFilter {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const status = one("status");
  const df = one("df");
  const sort = one("sort");
  let from = isDate(one("from")) ? one("from") : undefined;
  let to = isDate(one("to")) ? one("to") : undefined;
  if (from && to && from > to) [from, to] = [to, from];
  return {
    q: (one("q") ?? "").slice(0, 100_000),
    status: (ORDER_STATUSES as readonly string[]).includes(status ?? "") ? (status as OrderStatus) : undefined,
    dateField: df && df in DATE_FIELDS ? (df as DateField) : "sent",
    from,
    to,
    sort: (ORDER_SORT_KEYS as readonly string[]).includes(sort ?? "") ? (sort as OrderSortKey) : undefined,
    dir: one("dir") === "asc" ? "asc" : "desc",
  };
}

/** Bấm tiêu đề cột: chưa sắp xếp → A→Z → Z→A → bỏ sắp xếp */
export function nextSort(cur: { sort?: string; dir: "asc" | "desc" }, key: string): { sort?: string; dir: "asc" | "desc" } {
  if (cur.sort !== key) return { sort: key, dir: "asc" };
  if (cur.dir === "asc") return { sort: key, dir: "desc" };
  return { sort: undefined, dir: "desc" };
}

/** "YYYY-MM-DD" giờ VN → khoảng ISO [00:00, 24:00) +07:00 */
export function dayRangeIso(from?: string, to?: string): { gte?: string; lt?: string } {
  const next = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10);
  };
  return { gte: from ? `${from}T00:00:00+07:00` : undefined, lt: to ? `${next(to)}T00:00:00+07:00` : undefined };
}
