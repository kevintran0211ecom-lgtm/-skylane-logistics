/** Phiếu thu: mã, đọc số tiền bằng chữ, format nghìn, gợi ý khớp tiền (module thuần — có unit test) */

export const RECEIPT_PREFIX = "SKLTHU";
export const DEFAULT_RECEIVED_ACCOUNT = "MSB - 3812042003 (HOANG THU THAO)";

/** SKLTHU + ddMMyy + 3 số thứ tự trong ngày. VD 25/11/2026 số 1 → SKLTHU251126001 */
export function formatReceiptNo(day: string, seq: number): string {
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) throw new Error(`Ngày không hợp lệ: ${day}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > 999) throw new Error("Số thứ tự phiếu thu trong ngày phải từ 1 đến 999");
  return `${RECEIPT_PREFIX}${d}${m}${y.slice(2)}${String(seq).padStart(3, "0")}`;
}

/** Ô nhập tiền: giữ chữ số, thêm dấu chấm hàng nghìn. "3000000" → "3.000.000" */
export function formatThousands(input: string): string {
  const digits = input.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export const parseThousands = (s: string) => s.replace(/\D/g, "");

// -----------------------------------------------------------------------------
// Đọc số tiền bằng chữ tiếng Việt
// -----------------------------------------------------------------------------
const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const out: string[] = [];
  if (full || h > 0) out.push(`${DIGITS[h]} trăm`);
  if (t === 0) {
    if (u > 0) out.push(full || h > 0 ? `lẻ ${DIGITS[u]}` : DIGITS[u]);
  } else {
    out.push(t === 1 ? "mười" : `${DIGITS[t]} mươi`);
    if (u === 1 && t > 1) out.push("mốt");
    else if (u === 4 && t > 1) out.push("tư");
    else if (u === 5) out.push("lăm");
    else if (u > 0) out.push(DIGITS[u]);
  }
  return out.join(" ");
}

function readNumber(n: number): string {
  if (n === 0) return "không";
  const units = ["", " nghìn", " triệu"];
  if (n >= 1e9) {
    const high = Math.floor(n / 1e9);
    const rest = n % 1e9;
    return `${readNumber(high)} tỷ${rest ? ` ${readBelowBillion(rest, true)}` : ""}`;
  }
  return readBelowBillion(n, false);

  function readBelowBillion(v: number, full: boolean): string {
    const groups = [Math.floor(v / 1e6), Math.floor((v % 1e6) / 1e3), v % 1e3];
    const parts: string[] = [];
    let started = full;
    groups.forEach((g, i) => {
      if (g === 0) return;
      parts.push(readTriple(g, started) + units[2 - i]);
      started = true;
    });
    return parts.join(" ");
  }
}

/** 3000000 → "Ba triệu đồng" */
export function vndToWords(amount: string | number): string {
  const n = Math.round(Number(String(amount).replace(/[^\d.]/g, "")) || 0);
  if (!Number.isSafeInteger(n)) return "";
  const s = `${readNumber(n)} đồng`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// -----------------------------------------------------------------------------
// Gợi ý khớp tiền
// -----------------------------------------------------------------------------
export interface OpenStatement {
  id: number;
  statementNo: string;
  balance: string; // còn nợ
  issuedAt: string;
}
export interface AllocationSuggestion {
  mode: "EXACT" | "COMBO" | "FIFO" | "NONE";
  label: string;
  allocations: { id: number; amount: string }[];
  allocated: string;
  overpaid: string; // thu thừa
}

const MAX_COMBO_ITEMS = 25;
const MAX_STATES = 200_000;

/**
 * Thứ tự ưu tiên:
 *  1. EXACT — số tiền khớp đúng còn nợ của 1 bảng kê (cũ nhất trước)
 *  2. COMBO — khớp đúng tổng còn nợ của nhiều bảng kê (ít bảng kê nhất, ưu tiên cũ)
 *  3. FIFO — trả dần bảng kê cũ nhất trước; dư → thu thừa
 */
export function suggestAllocation(amountInput: string | number, open: OpenStatement[]): AllocationSuggestion {
  const amount = Math.round(Number(amountInput) || 0);
  const list = open
    .map((s) => ({ ...s, bal: Math.round(Number(s.balance)) }))
    .filter((s) => s.bal > 0)
    .sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : a.issuedAt > b.issuedAt ? 1 : a.id - b.id));
  const result = (mode: AllocationSuggestion["mode"], label: string, allocs: { id: number; amount: number }[]): AllocationSuggestion => {
    const allocated = allocs.reduce((t, a) => t + a.amount, 0);
    return {
      mode,
      label,
      allocations: allocs.map((a) => ({ id: a.id, amount: String(a.amount) })),
      allocated: String(allocated),
      overpaid: String(Math.max(0, amount - allocated)),
    };
  };
  if (amount <= 0) return result("NONE", "Nhập số tiền nhận để gợi ý phân bổ.", []);
  if (list.length === 0) return result("NONE", "Khách không còn bảng kê nợ — toàn bộ số tiền ghi nhận Thu thừa.", []);

  const exact = list.find((s) => s.bal === amount);
  if (exact) return result("EXACT", `Khớp chính xác bảng kê ${exact.statementNo}.`, [{ id: exact.id, amount }]);

  // Subset-sum: mỗi tổng giữ tập ít phần tử nhất (duyệt từ cũ → mới nên hòa thì giữ tập cũ hơn)
  const items = list.slice(0, MAX_COMBO_ITEMS);
  const best = new Map<number, number[]>([[0, []]]);
  for (let i = 0; i < items.length && best.size < MAX_STATES; i++) {
    for (const [sum, idx] of [...best.entries()]) {
      const next = sum + items[i].bal;
      if (next > amount) continue;
      const cur = best.get(next);
      if (!cur || cur.length > idx.length + 1) best.set(next, [...idx, i]);
    }
    if (best.has(amount)) break;
  }
  const combo = best.get(amount);
  if (combo && combo.length > 1) {
    const picked = combo.map((i) => items[i]);
    return result(
      "COMBO",
      `Khớp gộp ${picked.length} bảng kê: ${picked.map((s) => s.statementNo).join(", ")}.`,
      picked.map((s) => ({ id: s.id, amount: s.bal })),
    );
  }

  let left = amount;
  const fifo: { id: number; amount: number }[] = [];
  for (const s of list) {
    if (left <= 0) break;
    const a = Math.min(left, s.bal);
    fifo.push({ id: s.id, amount: a });
    left -= a;
  }
  const r = result("FIFO", "Phân bổ FIFO — trả bảng kê cũ nhất trước.", fifo);
  if (Number(r.overpaid) > 0) r.label = `Phân bổ hết ${fifo.length} bảng kê nợ; dư ${r.overpaid} ghi nhận Thu thừa.`;
  else if (fifo.length && Math.round(Number(list[fifo.length - 1].bal)) > fifo[fifo.length - 1].amount)
    r.label += ` Bảng kê ${list[fifo.length - 1].statementNo} thanh toán 1 phần.`;
  return r;
}
