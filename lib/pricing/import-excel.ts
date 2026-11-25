/**
 * BỘ ĐỌC BẢNG GIÁ EXCEL — MA TRẬN NGANG (module thuần, không I/O)
 * -----------------------------------------------------------------------------
 * Cấu trúc file (1 hoặc nhiều sheet):
 *
 *   Dòng tên tuyến :  VNFZZXR (gộp ô theo cụm)          | UPS HAN S5500
 *   Dòng tiêu đề   :  Khối lượng (KG) | GB – Anh (VND) | DE – Đức (VND) | Khối lượng (KG) | US – Mỹ (VND)
 *   Dữ liệu        :  0,10            | 114.360        | 158.712        | 0,5             | 300.000
 *                     ...
 *                     21-44           |                |                | 21-44           | 246.113   ← đơn giá/kg
 *                     300+            |                |                | 300+            | 240.000
 *
 * - Dòng tiêu đề tự dò: dòng đầu tiên có ô "Khối lượng". Tên tuyến ở dòng có dữ liệu gần nhất phía trên.
 * - Mỗi ô "Khối lượng" mở một khối (cụm tuyến) kéo tới trước ô "Khối lượng" kế tiếp.
 * - Cột quốc gia: mã ISO2 ở đầu tiêu đề ("GB – Anh (VND)"); "(USD)" → tiền USD.
 * - Mốc số (0,10 … 20,00 … 30,00) → Ma trận (FIXED). Nhãn khoảng (21-44, 45-99, 100+, 300+) → Theo kg (PER_KG):
 *     khoảng nối liền nhau: (mốc ma trận lớn nhất, 44], (44, 99], (99, 299], (299, ∞)
 * - Ô trống hoặc "-" = không phục vụ mốc đó.
 * - Các nước có toàn bộ giá giống nhau được gom chung 1 vùng giá.
 *
 * Mọi số được giữ dạng chuỗi thập phân chính xác (không float) để ghi thẳng vào NUMERIC.
 */
import type { Currency, PricingMode } from "./engine";

export type Cell = string | number | null;
export interface SheetGrid {
  name: string;
  rows: Cell[][]; // rows[r][c], đánh số từ 0
}

export interface ImportFixedTier {
  weightMax: string;
  price: string;
}
export interface ImportPerKgTier {
  weightMin: string; // loại trừ (>)
  weightMax: string | null; // bao gồm (<=)
  unitPrice: string;
}
export interface ImportZone {
  zoneCode: string;
  zoneName: string;
  countries: string[];
  matrix: ImportFixedTier[];
  perKg: ImportPerKgTier[];
}
export interface ImportRange {
  label: string;
  weightMin: string;
  weightMax: string | null;
}
export interface ImportBlock {
  sheet: string;
  cellRef: string; // ô "Khối lượng" của khối, VD "E3"
  routeName: string;
  routeCode: string; // TRIM + UPPER
  currency: Currency;
  mode: PricingMode;
  countries: string[];
  zones: ImportZone[];
  fixedWeights: string[];
  ranges: ImportRange[];
  warnings: string[];
}
export interface ImportParseResult {
  blocks: ImportBlock[];
  errors: string[];
}

// =============================================================================
// Tiện ích chuỗi / số
// =============================================================================
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const text = (c: Cell): string => (c === null || c === undefined ? "" : String(c).trim());

const isWeightHeader = (c: Cell) => {
  const f = fold(text(c));
  return f.startsWith("khoi luong") || f.startsWith("trong luong") || f.startsWith("weight");
};

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const ref = (r: number, c: number) => `${colLetter(c)}${r + 1}`;

/** Chuỗi "123.4500" → "123.45" (đã ở dạng ^\d+(\.\d+)?$), làm tròn half-up tới maxDec */
function canonical(s: string, maxDec: number): string {
  const [i, f = ""] = s.split(".");
  let int = BigInt(i || "0");
  let frac = f;
  if (frac.length > maxDec) {
    const scale = 10n ** BigInt(maxDec);
    let v = int * scale + BigInt(frac.slice(0, maxDec) || "0");
    if (Number(frac[maxDec]) >= 5) v += 1n;
    int = v / scale;
    frac = maxDec > 0 ? (v % scale).toString().padStart(maxDec, "0") : "";
  }
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int.toString();
}

type NumKind = "weight" | "price";
const MAX_DEC: Record<NumKind, number> = { weight: 3, price: 2 };

/**
 * Đọc số từ ô Excel. Ô số giữ nguyên; ô chữ hiểu theo kiểu VN ("0,05", "1.015.750,")
 * hoặc kiểu quốc tế ("0.05", "151,896"). Trả về null nếu trống / "-", undefined nếu không hợp lệ.
 */
export function parseNumberCell(c: Cell, kind: NumKind): string | null | undefined {
  if (c === null || c === undefined) return null;
  if (typeof c === "number") {
    if (!Number.isFinite(c) || c < 0) return undefined;
    return canonical(c.toFixed(MAX_DEC[kind] + 2), MAX_DEC[kind]);
  }
  let s = c.replace(/[\s ]/g, "").replace(/(vnd|usd|đ|₫|kg)$/i, "");
  if (s === "" || /^[-–—]+$/.test(s)) return null;
  s = s.replace(/[.,]+$/, ""); // "151.896," → "151.896"
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thousands = dec === "." ? "," : ".";
    s = s.split(thousands).join("").replace(dec, ".");
  } else if (hasComma) {
    s = kind === "price" && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    if (kind === "price" && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return canonical(s, MAX_DEC[kind]);
}

// Phép tính trên chuỗi cân nặng (đơn vị 0.001 kg) — tránh float
const toMilli = (w: string) => {
  const [i, f = ""] = w.split(".");
  return BigInt(i) * 1000n + BigInt((f + "000").slice(0, 3));
};
const fromMilli = (m: bigint) => canonical(`${m / 1000n}.${(m % 1000n).toString().padStart(3, "0")}`, 3);
const cmpW = (a: string, b: string) => {
  const d = toMilli(a) - toMilli(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
};

// =============================================================================
// Phân loại nhãn khối lượng
// =============================================================================
type WeightLabel =
  | { type: "fixed"; weight: string }
  | { type: "range"; start: string; end: string | null; label: string }
  | { type: "empty" }
  | { type: "invalid"; raw: string };

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const RANGE_RE = new RegExp(String.raw`^${NUM}\s*(?:kg)?\s*(?:-|–|—|~|den|to)\s*${NUM}\s*(?:kg)?$`);
const OPEN_RE = new RegExp(String.raw`^(?:>=?|tren|tu|over)?\s*${NUM}\s*(?:kg)?\s*\+$|^(?:>=?|tren|over)\s*${NUM}\s*(?:kg)?$`);

export function classifyWeightLabel(c: Cell): WeightLabel {
  if (c === null || c === undefined || text(c) === "") return { type: "empty" };
  if (typeof c === "number") {
    const w = parseNumberCell(c, "weight");
    return w && w !== "0" ? { type: "fixed", weight: w } : { type: "invalid", raw: String(c) };
  }
  const raw = text(c);
  const f = fold(raw);
  const range = RANGE_RE.exec(f);
  if (range) {
    const a = parseNumberCell(range[1], "weight");
    const b = parseNumberCell(range[2], "weight");
    if (a && b) return { type: "range", start: a, end: b, label: raw };
  }
  const open = OPEN_RE.exec(f);
  if (open) {
    const a = parseNumberCell(open[1] ?? open[2], "weight");
    if (a) return { type: "range", start: a, end: null, label: raw };
  }
  const w = parseNumberCell(raw, "weight");
  if (w && w !== "0") return { type: "fixed", weight: w };
  return { type: "invalid", raw };
}

// =============================================================================
// Đọc 1 sheet
// =============================================================================
interface CountryCol {
  col: number;
  iso2: string;
  label: string;
  currency: Currency;
}

function findHeaderRow(rows: Cell[][]): number {
  const limit = Math.min(rows.length, 30);
  for (let r = 0; r < limit; r++) if ((rows[r] ?? []).some(isWeightHeader)) return r;
  return -1;
}

const MAX_WARNINGS = 15;

function parseSheet(sheet: SheetGrid, errors: string[]): ImportBlock[] {
  const rows = sheet.rows;
  const h = findHeaderRow(rows);
  if (h < 0) return [];
  const header = rows[h] ?? [];
  let routeRow = -1;
  for (let r = h - 1; r >= 0; r--) {
    if ((rows[r] ?? []).some((c) => text(c) !== "")) {
      routeRow = r;
      break;
    }
  }
  const width = Math.max(...rows.map((r) => r.length), header.length);
  const starts: number[] = [];
  for (let c = 0; c < header.length; c++) if (isWeightHeader(header[c])) starts.push(c);

  const blocks: ImportBlock[] = [];
  starts.forEach((start, idx) => {
    const end = (starts[idx + 1] ?? width) - 1;
    const where = `Sheet "${sheet.name}", khối ${ref(h, start)}`;
    const blockWarnings: string[] = [];

    // --- Tên tuyến
    const routeCells = routeRow >= 0 ? rows[routeRow] ?? [] : [];
    let routeName = "";
    for (let c = start; c <= end && !routeName; c++) routeName = text(routeCells[c]);
    if (!routeName) {
      errors.push(`${where}: chưa có tên tuyến ở dòng phía trên tiêu đề "Khối lượng".`);
      return;
    }

    // --- Cột quốc gia
    const countries: CountryCol[] = [];
    for (let c = start + 1; c <= end; c++) {
      const label = text(header[c]);
      if (!label) continue;
      const m = /^([A-Za-z]{2})(?![A-Za-z])/.exec(label);
      if (!m) {
        blockWarnings.push(`Bỏ qua cột ${ref(h, c)} "${label.replace(/\s+/g, " ")}": không có mã nước ISO2 ở đầu.`);
        continue;
      }
      const iso2 = m[1].toUpperCase();
      if (countries.some((x) => x.iso2 === iso2)) {
        errors.push(`${where} (${routeName}): nước ${iso2} bị lặp ở cột ${ref(h, c)}.`);
        return;
      }
      const cur = /\(\s*(usd|vnd)\s*\)/i.exec(label)?.[1]?.toUpperCase() as Currency | undefined;
      countries.push({ col: c, iso2, label, currency: cur ?? "VND" });
    }
    if (countries.length === 0) {
      errors.push(`${where} (${routeName}): không có cột quốc gia nào.`);
      return;
    }
    const currencies = [...new Set(countries.map((x) => x.currency))];
    if (currencies.length > 1) {
      errors.push(`${where} (${routeName}): lẫn nhiều loại tiền (${currencies.join(", ")}) trong cùng khối.`);
      return;
    }

    // --- Dòng dữ liệu
    type Row = { r: number; prices: Map<number, string> };
    const fixedRows: (Row & { weight: string })[] = [];
    const rangeRows: (Row & { start: string; end: string | null; label: string })[] = [];
    let invalidLabels = 0;
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const lab = classifyWeightLabel(row[start] ?? null);
      const prices = new Map<number, string>();
      for (const ct of countries) {
        const v = parseNumberCell(row[ct.col] ?? null, "price");
        if (v === undefined) blockWarnings.push(`Ô ${ref(r, ct.col)} "${text(row[ct.col] ?? null)}" không phải số — bỏ qua.`);
        else if (v !== null) prices.set(ct.col, v);
      }
      if (lab.type === "empty") {
        if (prices.size > 0) blockWarnings.push(`Dòng ${r + 1} có giá nhưng thiếu khối lượng — bỏ qua.`);
        continue;
      }
      if (lab.type === "invalid") {
        if (prices.size > 0) blockWarnings.push(`Ô ${ref(r, start)} "${lab.raw}" không phải mốc cân hợp lệ — bỏ qua dòng.`);
        else invalidLabels++;
        continue;
      }
      if (lab.type === "fixed") {
        if (fixedRows.some((x) => x.weight === lab.weight)) {
          errors.push(`${where} (${routeName}): mốc ${lab.weight}kg bị lặp ở dòng ${r + 1}.`);
          return;
        }
        fixedRows.push({ r, prices, weight: lab.weight });
      } else {
        rangeRows.push({ r, prices, start: lab.start, end: lab.end, label: lab.label });
      }
    }
    if (invalidLabels > 0) blockWarnings.push(`Bỏ qua ${invalidLabels} dòng ghi chú không phải mốc cân.`);
    fixedRows.sort((a, b) => cmpW(a.weight, b.weight));
    rangeRows.sort((a, b) => cmpW(a.start, b.start));

    // --- Tách khoảng Theo kg thành (Từ kg, Đến kg]
    const maxFixed = fixedRows.at(-1)?.weight ?? null;
    const ranges: ImportRange[] = [];
    for (let i = 0; i < rangeRows.length; i++) {
      const cur = rangeRows[i];
      const prevMax = i > 0 ? ranges[i - 1].weightMax : null;
      let min: string;
      if (i === 0) {
        if (maxFixed) min = maxFixed;
        else {
          const s = toMilli(cur.start);
          min = s >= 1000n && s % 1000n === 0n ? fromMilli(s - 1000n) : cur.start;
        }
      } else {
        if (prevMax === null) {
          errors.push(`${where} (${routeName}): khoảng "${rangeRows[i - 1].label}" không có cận trên nhưng vẫn còn khoảng "${cur.label}" phía sau.`);
          return;
        }
        min = prevMax;
        if (toMilli(cur.start) - toMilli(prevMax) > 1000n) {
          blockWarnings.push(`Khoảng "${cur.label}" không liền với khoảng trước (đến ${prevMax}kg) — đã nối liền từ ${prevMax}kg.`);
        }
      }
      let max: string | null;
      if (cur.end) max = cur.end;
      else if (i < rangeRows.length - 1) max = fromMilli(toMilli(rangeRows[i + 1].start) - 1000n);
      else max = null;
      if (max !== null && cmpW(max, min) <= 0) {
        errors.push(`${where} (${routeName}): khoảng "${cur.label}" không hợp lệ (từ ${min} đến ${max}kg).`);
        return;
      }
      ranges.push({ label: cur.label, weightMin: min, weightMax: max });
    }

    // --- Giá theo từng nước, gom vùng giống nhau
    const groups = new Map<string, ImportZone>();
    for (const ct of countries) {
      const matrix: ImportFixedTier[] = [];
      let gap = false;
      let seenMissing = false;
      for (const fr of fixedRows) {
        const p = fr.prices.get(ct.col);
        if (p === undefined) {
          if (matrix.length > 0) seenMissing = true; // trống sau khi đã có giá
        } else {
          if (seenMissing) gap = true;
          matrix.push({ weightMax: fr.weight, price: p });
        }
      }
      if (gap) blockWarnings.push(`Nước ${ct.iso2}: ma trận có mốc trống xen giữa — cân rơi vào mốc trống sẽ lấy giá mốc kế tiếp.`);
      const perKg: ImportPerKgTier[] = [];
      rangeRows.forEach((rr, i) => {
        const p = rr.prices.get(ct.col);
        if (p !== undefined) perKg.push({ weightMin: ranges[i].weightMin, weightMax: ranges[i].weightMax, unitPrice: p });
      });
      if (matrix.length === 0 && perKg.length === 0) {
        blockWarnings.push(`Nước ${ct.iso2}: không có giá nào — bỏ qua.`);
        continue;
      }
      const key = JSON.stringify([matrix, perKg]);
      const g = groups.get(key);
      if (g) g.countries.push(ct.iso2);
      else groups.set(key, { zoneCode: "", zoneName: "", countries: [ct.iso2], matrix, perKg });
    }
    const zones = [...groups.values()].map((z, i) => ({
      ...z,
      zoneCode: `Z${String(i + 1).padStart(2, "0")}`,
      zoneName: z.countries.join(", "),
    }));
    if (zones.length === 0) {
      errors.push(`${where} (${routeName}): không đọc được giá nào.`);
      return;
    }

    const hasFixed = zones.some((z) => z.matrix.length > 0);
    const hasPerKg = zones.some((z) => z.perKg.length > 0);
    const mode: PricingMode = hasFixed && hasPerKg ? "MA_TRAN+THEO_KG" : hasFixed ? "MA_TRAN" : "THEO_KG";
    if (mode === "MA_TRAN+THEO_KG" && maxFixed && maxFixed !== "20") {
      blockWarnings.push(
        cmpW(maxFixed, "20") > 0
          ? `Ma trận có mốc tới ${maxFixed}kg nhưng chế độ Ma trận + Theo kg chỉ dùng ma trận tới 20kg; mốc trên 20kg sẽ tính theo kg.`
          : `Ma trận chỉ tới ${maxFixed}kg: cân trong khoảng (${maxFixed}, 20]kg sẽ không có giá.`,
      );
    }

    blocks.push({
      sheet: sheet.name,
      cellRef: ref(h, start),
      routeName,
      routeCode: routeName.trim().toUpperCase(),
      currency: currencies[0],
      mode,
      countries: zones.flatMap((z) => z.countries),
      zones,
      fixedWeights: fixedRows.map((x) => x.weight),
      ranges,
      warnings:
        blockWarnings.length > MAX_WARNINGS
          ? [...blockWarnings.slice(0, MAX_WARNINGS), `… và ${blockWarnings.length - MAX_WARNINGS} cảnh báo khác.`]
          : blockWarnings,
    });
  });
  return blocks;
}

/** Đọc toàn bộ workbook (đã chuyển sang lưới ô). Sheet không có tiêu đề "Khối lượng" được bỏ qua. */
export function parsePriceWorkbook(sheets: SheetGrid[]): ImportParseResult {
  const errors: string[] = [];
  const blocks = sheets.flatMap((s) => parseSheet(s, errors));
  if (blocks.length === 0 && errors.length === 0) {
    errors.push('Không tìm thấy dòng tiêu đề có cột "Khối lượng (KG)" trong file.');
  }
  const seen = new Map<string, ImportBlock>();
  for (const b of blocks) {
    const prev = seen.get(b.routeCode);
    if (prev) errors.push(`Tuyến ${b.routeCode} xuất hiện 2 lần (${prev.sheet}!${prev.cellRef} và ${b.sheet}!${b.cellRef}).`);
    else seen.set(b.routeCode, b);
  }
  return { blocks, errors };
}
