/**
 * Lập kế hoạch chèn phiên bản bảng giá mới theo ngày hiệu lực (module thuần).
 * Không bao giờ sửa/xóa nội dung phiên bản cũ — chỉ chốt `effective_to` để lịch sử
 * giá của các đơn quá khứ giữ nguyên.
 *
 *   Cũ:  [01/10 ─────────────── ∞)
 *   Mới:              [01/11 ── ∞)
 *   →    [01/10 ── 31/10] [01/11 ── ∞)
 *
 * Nếu đã có phiên bản tương lai (VD từ 01/12), phiên bản mới tự kết thúc 30/11.
 */

export interface ActiveVersionRef {
  id: number | string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
}

export interface VersionClose {
  id: number | string;
  effectiveFrom: string;
  oldEffectiveTo: string | null;
  newEffectiveTo: string;
}

export type VersionPlan =
  | { ok: true; close: VersionClose[]; newEffectiveTo: string | null }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** dd/mm/yyyy để hiển thị */
export const viDate = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "∞");

/**
 * @param existing  các phiên bản ACTIVE cùng tuyến + loại (COST/SELL) + phạm vi
 * @param newFrom   ngày hiệu lực của phiên bản mới
 */
export function planNewVersion(existing: ActiveVersionRef[], newFrom: string): VersionPlan {
  if (!isIsoDate(newFrom)) return { ok: false, error: `Ngày hiệu lực không hợp lệ: "${newFrom}"` };

  const same = existing.find((v) => v.effectiveFrom === newFrom);
  if (same) {
    return {
      ok: false,
      error: `Đã có phiên bản #${same.id} hiệu lực từ ${viDate(newFrom)}. Hãy lưu trữ phiên bản đó trước hoặc chọn ngày khác.`,
    };
  }

  const close: VersionClose[] = existing
    .filter((v) => v.effectiveFrom < newFrom && (v.effectiveTo === null || v.effectiveTo >= newFrom))
    .map((v) => ({
      id: v.id,
      effectiveFrom: v.effectiveFrom,
      oldEffectiveTo: v.effectiveTo,
      newEffectiveTo: addDays(newFrom, -1),
    }));

  const next = existing
    .filter((v) => v.effectiveFrom > newFrom)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0];

  return { ok: true, close, newEffectiveTo: next ? addDays(next.effectiveFrom, -1) : null };
}
