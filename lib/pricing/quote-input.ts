/**
 * Đọc & kiểm tra điều kiện tra cứu giá gốc (thuần — dùng chung cho trang Next.js và bản chạy thử).
 *
 * Nhiều kiện: mỗi dòng "Kích thước thông tin" = Số kiện × (Cân/kiện, Dài, Rộng, Cao), truyền qua URL
 * dạng tham số `p` lặp lại: `p=2_5,5_40_30_20` (số kiện_cân_dài_rộng_cao). Có dòng kiện thì bỏ qua ô
 * Trọng lượng / CBM tổng; không có thì tính 1 kiện theo Trọng lượng (+ CBM nếu nhập).
 */
import type { PackageInput, ServiceType } from "./engine";
import { parseNumberCell } from "./import-excel";
import { isIsoDate } from "./versioning";

export const QUOTE_SERVICE_TYPES: ServiceType[] = ["EPK", "CPN", "CT"];
export const MAX_QUOTE_PIECES = 500;

export interface QuotePackageRow {
  qty: string;
  kg: string;
  l: string;
  w: string;
  h: string;
}

export interface QuoteSearchParams {
  to?: string;
  kg?: string;
  cbm?: string;
  p?: string | string[];
  ncc?: string;
  dv?: string;
  date?: string;
}

export interface ParsedQuote {
  iso2: string;
  date: string; // YYYY-MM-DD
  packages: PackageInput[]; // đã nhân theo số kiện
  pieces: number;
  totalActual: string; // kg
  totalCbm: string | null; // m³ (khi có kích thước / CBM)
  hasDims: boolean;
  supplierCode: string | null;
  serviceType: ServiceType | null;
}

export const emptyPackageRow = (): QuotePackageRow => ({ qty: "1", kg: "", l: "", w: "", h: "" });

const isBlankRow = (r: QuotePackageRow) => !r.kg.trim() && !r.l.trim() && !r.w.trim() && !r.h.trim();

export function encodePackageRow(r: QuotePackageRow): string {
  return [r.qty, r.kg, r.l, r.w, r.h].map((v) => v.trim().replace(/_/g, "")).join("_");
}

export function decodePackageRow(s: string): QuotePackageRow {
  const [qty = "", kg = "", l = "", w = "", h = ""] = s.split("_");
  return { qty, kg, l, w, h };
}

/** Các dòng kiện còn nội dung, đọc từ tham số URL `p`. */
export function packageRowsFromParams(p: string | string[] | undefined): QuotePackageRow[] {
  const list = p === undefined ? [] : Array.isArray(p) ? p : [p];
  return list.map(decodePackageRow).filter((r) => !isBlankRow(r));
}

/** Dán từ Excel: mỗi dòng "Số kiện  Cân  Dài  Rộng  Cao" (tab hoặc ;). Dòng 1 cột = chỉ cân. */
export function parsePastedRows(text: string): QuotePackageRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/\t|;/).map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean))
    .map((c) => (c.length === 1 ? { qty: "1", kg: c[0], l: "", w: "", h: "" } : { qty: c[0] || "1", kg: c[1] ?? "", l: c[2] ?? "", w: c[3] ?? "", h: c[4] ?? "" }));
}

// Cộng chuỗi số thập phân chính xác (tối đa 6 chữ số lẻ) — tránh float.
const SCALE = 1_000_000n;
const toMicro = (v: string) => {
  const [i, f = ""] = v.split(".");
  return BigInt(i) * SCALE + BigInt((f + "000000").slice(0, 6));
};
const fromMicro = (n: bigint, dec: number) => {
  const s = (Number(n) / Number(SCALE)).toFixed(dec);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};
const pos = (v: string | null | undefined): v is string => !!v && Number(v) > 0;

export function sumDecimal(values: string[], dec = 3): string {
  return fromMicro(values.reduce((t, v) => t + toMicro(v), 0n), dec);
}

export function parseQuoteInput(sp: QuoteSearchParams, today: string): { input?: ParsedQuote; error?: string } {
  const rows = packageRowsFromParams(sp.p);
  if (!sp.to?.trim() && !sp.kg?.trim() && rows.length === 0) return {};

  const iso2 = (sp.to ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) return { error: "Điểm đến phải là mã quốc gia ISO2 (VD: US, GB, AU)." };
  const date = sp.date?.trim() || today;
  if (!isIsoDate(date)) return { error: "Ngày áp giá không hợp lệ." };

  const dv = (sp.dv ?? "").trim().toUpperCase();
  const serviceType = (QUOTE_SERVICE_TYPES as string[]).includes(dv) ? (dv as ServiceType) : null;
  const supplierCode = (sp.ncc ?? "").trim().toUpperCase() || null;

  const packages: PackageInput[] = [];
  const cbmParts: string[] = [];
  let hasDims = false;

  if (rows.length > 0) {
    for (const [i, r] of rows.entries()) {
      const at = `Kích thước dòng ${i + 1}`;
      const qty = r.qty.trim() === "" ? 1 : Number(r.qty.trim());
      if (!Number.isInteger(qty) || qty < 1) return { error: `${at}: Số kiện phải là số nguyên ≥ 1.` };
      const kg = parseNumberCell(r.kg, "weight");
      if (!pos(kg)) return { error: `${at}: nhập cân nặng mỗi kiện lớn hơn 0 kg.` };
      const dims = [r.l, r.w, r.h];
      const filled = dims.filter((d) => d.trim()).length;
      let lwh: [string, string, string] | null = null;
      if (filled > 0) {
        const parsed = dims.map((d) => parseNumberCell(d, "weight"));
        if (filled < 3 || !parsed.every(pos)) return { error: `${at}: nhập đủ Dài, Rộng, Cao (cm) lớn hơn 0, hoặc để trống cả 3.` };
        lwh = parsed as [string, string, string];
        hasDims = true;
      }
      if (packages.length + qty > MAX_QUOTE_PIECES) return { error: `Tối đa ${MAX_QUOTE_PIECES} kiện mỗi lần tra cứu.` };
      for (let k = 0; k < qty; k++) {
        packages.push(lwh ? { actualWeight: kg, lengthCm: lwh[0], widthCm: lwh[1], heightCm: lwh[2] } : { actualWeight: kg });
        if (lwh) cbmParts.push(fromMicro(toMicro(lwh[0]) * toMicro(lwh[1]) * toMicro(lwh[2]) / SCALE / SCALE / 1_000_000n, 6));
      }
    }
  } else {
    const kg = parseNumberCell(sp.kg ?? "", "weight");
    if (!pos(kg)) return { error: "Nhập trọng lượng lớn hơn 0 kg, hoặc bấm “Kích thước thông tin” để nhập từng kiện." };
    const cbmRaw = sp.cbm?.trim();
    if (cbmRaw) {
      const cbm = parseNumberCell(cbmRaw, "weight");
      if (!pos(cbm)) return { error: "Thể tích (CBM) không hợp lệ." };
      packages.push({ actualWeight: kg, volumeCbm: cbm });
      cbmParts.push(cbm);
      hasDims = true;
    } else {
      packages.push({ actualWeight: kg });
    }
  }

  return {
    input: {
      iso2,
      date,
      packages,
      pieces: packages.length,
      totalActual: sumDecimal(packages.map((p) => String(p.actualWeight))),
      totalCbm: cbmParts.length ? sumDecimal(cbmParts, 4) : null,
      hasDims,
      supplierCode,
      serviceType,
    },
  };
}
