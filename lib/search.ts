/**
 * Tìm kiếm nhiều mã một lúc (module thuần — dùng cho Vận đơn, Bảng kê và bản chạy thử).
 *
 * Người dùng dán danh sách mã (mỗi dòng một mã, hoặc cách nhau bởi dấu phẩy / chấm phẩy / tab / khoảng trắng):
 *   #AP3004
 *   #AP3003
 *   MN2637
 * → ["#AP3004", "#AP3003", "MN2637"] (TRIM + chữ hoa, bỏ trùng, giữ thứ tự).
 *
 * - 1 mã  → tìm gần đúng (chứa chuỗi) như trước.
 * - ≥2 mã → tìm chính xác từng mã (mã vận đơn / tracking / mã bảng kê).
 */
export const MAX_SEARCH_CODES = 5000;

export function parseCodeList(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of (text ?? "").split(/[\s,;]+/)) {
    const c = raw.trim().toUpperCase();
    if (c) seen.add(c);
    if (seen.size >= MAX_SEARCH_CODES) break;
  }
  return [...seen];
}

export type SearchMode = { kind: "none" } | { kind: "like"; term: string } | { kind: "codes"; codes: string[] };

/** Ô tìm kiếm → cách tìm. Một từ khóa có khoảng trắng (VD tên khách) vẫn là tìm gần đúng nếu chỉ có 1 dòng. */
export function searchMode(text: string | null | undefined): SearchMode {
  const t = (text ?? "").trim();
  if (!t) return { kind: "none" };
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1 && !/[,;\t]/.test(t)) {
    // 1 dòng: nếu là nhiều mã cách nhau khoảng trắng mà mỗi phần đều "giống mã" (không dấu, có số) → tìm nhiều mã
    const parts = t.split(/\s+/);
    if (parts.length > 1 && parts.every((p) => /\d/.test(p) && /^[\w#\-./]+$/.test(p))) return { kind: "codes", codes: parseCodeList(t) };
    return { kind: "like", term: t };
  }
  const codes = parseCodeList(t);
  return codes.length === 1 ? { kind: "like", term: codes[0] } : { kind: "codes", codes };
}

/** Đối chiếu kết quả: mã nào trong danh sách không tìm thấy */
export function missingCodes(codes: string[], found: Iterable<string | null | undefined>): string[] {
  const have = new Set<string>();
  for (const f of found) if (f) have.add(f.trim().toUpperCase());
  return codes.filter((c) => !have.has(c));
}
