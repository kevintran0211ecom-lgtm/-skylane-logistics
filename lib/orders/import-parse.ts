/**
 * ĐỌC FILE ĐƠN HÀNG (Excel / CSV / Google Sheet) — module thuần, không I/O
 * -----------------------------------------------------------------------------
 * - Nhận diện cột theo TÊN TIÊU ĐỀ đã chuẩn hóa (bỏ dấu, bỏ ký tự đặc biệt, bỏ đơn vị kg/cm),
 *   không phụ thuộc thứ tự cột. VD "Trọng lượng thực tế(kg)" ≡ "trong luong thuc te".
 * - Dòng tiêu đề tự dò: dòng đầu có cột "Mã vận đơn".
 * - Có cột "Số kiện": mỗi dòng = 1 vận đơn; Số kiện N > 1 với 1 bộ kích thước → N kiện giống nhau,
 *   cân thực chia đều. Mã trùng lần 2 trong file = đơn trùng (bị chặn).
 *   Không có cột "Số kiện": các dòng cùng mã vận đơn = các kiện của 1 đơn.
 * - Mã KH / tuyến / mã nước / mã vận đơn: TRIM + UPPER.
 */
import type { Cell } from "../pricing/import-excel";
import { parseNumberCell } from "../pricing/import-excel";

export type OrderField =
  | "customerCode" | "billCode" | "trackingNumber" | "routeCode" | "assignedRouteCode" | "destinationIso2"
  | "createdAt" | "shippedAt" | "receiverName" | "receiverAddress" | "receiverCity" | "receiverState"
  | "receiverPostalCode" | "receiverPhone" | "receiverEmail" | "goodsVi" | "goodsEn" | "hsCode"
  | "declaredValueUsd" | "packageCount" | "actualWeight" | "lengthCm" | "widthCm" | "heightCm" | "note";

const ALIASES: Record<OrderField, string[]> = {
  customerCode: ["ma khach hang", "ma kh", "khach hang", "customer code", "customer"],
  billCode: ["ma van don", "ma bill", "so bill", "bill code", "bill", "ma don hang", "ma don", "order code"],
  trackingNumber: ["tracking", "ma tracking", "tracking number", "so tracking"],
  routeCode: ["tuyen van chuyen", "tuyen", "route", "dich vu van chuyen"],
  assignedRouteCode: ["tuyen chi dinh", "assigned route"],
  destinationIso2: ["diem den", "nuoc den", "quoc gia", "ma nuoc", "ma quoc gia", "country", "destination"],
  createdAt: ["thoi gian phat sinh don", "thoi gian phat sinh", "ngay tao", "ngay tao don", "created at"],
  shippedAt: ["ngay gui hang", "ngay gui", "shipped at", "ship date"],
  receiverName: ["nguoi nhan", "ten nguoi nhan", "receiver", "receiver name", "consignee"],
  receiverAddress: ["dia chi nguoi nhan", "dia chi", "address"],
  receiverCity: ["thanh pho nguoi nhan", "thanh pho", "city"],
  receiverState: ["bang tinh nguoi nhan", "bang tinh", "bang", "tinh", "state", "province"],
  receiverPostalCode: ["ma buu chinh nguoi nhan", "ma buu chinh", "zip", "zipcode", "zip code", "postal code", "postcode"],
  receiverPhone: ["sdt nguoi nhan", "so dien thoai nguoi nhan", "so dien thoai", "sdt", "phone"],
  receiverEmail: ["mail nguoi nhan", "email nguoi nhan", "email", "mail"],
  goodsVi: ["ten hang tieng viet", "ten hang", "mo ta hang hoa", "hang hoa", "goods"],
  goodsEn: ["ten hang tieng anh", "goods english", "description"],
  hsCode: ["ma hs hai quan", "ma hs", "hs code", "hs"],
  declaredValueUsd: ["gia tri khai bao", "declared value", "gia tri khai bao usd"],
  packageCount: ["so kien", "so luong kien", "packages", "pcs"],
  actualWeight: ["trong luong thuc te", "trong luong thuc te khi nhan", "can thuc", "can nang", "trong luong", "weight", "actual weight"],
  lengthCm: ["dai", "chieu dai", "length"],
  widthCm: ["rong", "chieu rong", "width"],
  heightCm: ["cao", "chieu cao", "height"],
  note: ["ghi chu", "note", "notes"],
};

/** Chuẩn hóa tiêu đề: bỏ dấu, chữ thường, bỏ ký tự đặc biệt & đơn vị cuối */
export function normalizeHeader(h: Cell): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+(kg|cm|usd|vnd|m3|cbm)$/, "")
    .trim();
}

const ALIAS_INDEX = new Map<string, OrderField>();
for (const [field, list] of Object.entries(ALIASES) as [OrderField, string[]][]) {
  for (const a of list) if (!ALIAS_INDEX.has(normalizeHeader(a))) ALIAS_INDEX.set(normalizeHeader(a), field);
}

export function mapHeaders(header: Cell[]): { columns: Map<OrderField, number>; ignored: string[] } {
  const columns = new Map<OrderField, number>();
  const ignored: string[] = [];
  header.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (!key) return;
    const f = ALIAS_INDEX.get(key);
    if (f && !columns.has(f)) columns.set(f, i);
    else ignored.push(String(h).trim());
  });
  return { columns, ignored };
}

// -----------------------------------------------------------------------------
// Ngày giờ: "18/11/2026 15:19:43", "18/11/2026", "2026-11-18 15:19", số serial Excel → ISO +07:00
// -----------------------------------------------------------------------------
const pad = (n: number | string) => String(n).padStart(2, "0");

export function parseViDateTime(c: Cell): string | null | undefined {
  if (c === null || c === undefined || String(c).trim() === "") return null;
  if (typeof c === "number") {
    if (c < 1 || c > 2958465) return undefined;
    const ms = Math.round((c - 25569) * 86400 * 1000); // serial Excel = giờ địa phương
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`;
  }
  const s = c.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  let y: number, mo: number, d: number, hh = 0, mi = 0, ss = 0;
  if (m) {
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [hh, mi, ss] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  } else {
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (!m) return undefined;
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [hh, mi, ss] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  }
  const check = new Date(Date.UTC(y, mo - 1, d, hh, mi, ss));
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || hh > 23 || mi > 59 || ss > 59) return undefined;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}+07:00`;
}

// -----------------------------------------------------------------------------
// CSV (Google Sheet xuất CSV)
// -----------------------------------------------------------------------------
export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => (v === "" ? null : v)));
}

/** Lấy ID & gid từ link Google Sheet */
export function parseSheetUrl(url: string): { id: string } | null {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(url);
  return m ? { id: m[1] } : null;
}

// -----------------------------------------------------------------------------
// Dòng → đơn nháp
// -----------------------------------------------------------------------------
export interface PackageDraft {
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  actualWeight: string;
}

export interface OrderDraft {
  rows: number[]; // số dòng trong file (đếm từ 1)
  customerCode: string;
  billCode: string;
  orderKey: string;
  trackingNumber: string | null;
  routeCode: string;
  assignedRouteCode: string | null;
  destinationIso2: string;
  createdAt: string | null;
  shippedAt: string | null;
  receiverName: string | null;
  receiverAddress: string | null;
  receiverCity: string | null;
  receiverState: string | null;
  receiverPostalCode: string | null;
  receiverPhone: string | null;
  receiverEmail: string | null;
  goodsDescription: string | null;
  hsCode: string | null;
  declaredValueUsd: string | null;
  note: string | null;
  packages: PackageDraft[];
}

export interface OrderParseResult {
  drafts: OrderDraft[];
  errors: { row: number; billCode?: string; message: string }[];
  duplicatesInFile: { row: number; orderKey: string }[];
  warnings: string[];
  ignoredColumns: string[];
}

const txt = (c: Cell | undefined) => {
  const s = c === null || c === undefined ? "" : String(c).trim();
  return s === "" ? null : s;
};
const code = (c: Cell | undefined) => txt(c)?.toUpperCase() ?? null;

/** Chia cân thực đều cho n kiện (đơn vị 0,001 kg), phần dư dồn kiện cuối */
function splitWeight(total: string, n: number): string[] {
  const [i, f = ""] = total.split(".");
  const milli = BigInt(i) * 1000n + BigInt((f + "000").slice(0, 3));
  const each = milli / BigInt(n);
  const toKg = (m: bigint) => `${m / 1000n}.${(m % 1000n).toString().padStart(3, "0")}`.replace(/\.?0+$/, "") || "0";
  return Array.from({ length: n }, (_, k) => toKg(k === n - 1 ? milli - each * BigInt(n - 1) : each));
}

export function parseOrderSheet(rows: Cell[][], opts: { defaultCustomerCode?: string | null } = {}): OrderParseResult {
  const res: OrderParseResult = { drafts: [], errors: [], duplicatesInFile: [], warnings: [], ignoredColumns: [] };
  let h = -1;
  let columns = new Map<OrderField, number>();
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const m = mapHeaders(rows[r] ?? []);
    if (m.columns.has("billCode")) {
      h = r;
      columns = m.columns;
      res.ignoredColumns = m.ignored;
      break;
    }
  }
  if (h < 0) {
    res.errors.push({ row: 0, message: 'Không tìm thấy dòng tiêu đề có cột "Mã vận đơn".' });
    return res;
  }
  const missing: string[] = [];
  if (!columns.has("customerCode") && !opts.defaultCustomerCode) missing.push('"Mã khách hàng" (hoặc chọn khách hàng khi import)');
  if (!columns.has("routeCode")) missing.push('"Tuyến vận chuyển"');
  if (!columns.has("destinationIso2")) missing.push('"Điểm đến"');
  if (missing.length) {
    res.errors.push({ row: h + 1, message: `Thiếu cột bắt buộc: ${missing.join(", ")}.` });
    return res;
  }

  const hasCount = columns.has("packageCount");
  const get = (row: Cell[], f: OrderField) => (columns.has(f) ? row[columns.get(f)!] : undefined);
  const byKey = new Map<string, OrderDraft>();

  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const line = r + 1;
    if (row.every((c) => txt(c) === null)) continue;
    const billCode = code(get(row, "billCode"));
    if (!billCode) {
      res.errors.push({ row: line, message: "Thiếu mã vận đơn." });
      continue;
    }
    const customerCode = code(get(row, "customerCode")) ?? opts.defaultCustomerCode?.trim().toUpperCase() ?? null;
    const routeCode = code(get(row, "routeCode"));
    const iso2 = code(get(row, "destinationIso2"));
    const problems: string[] = [];
    if (!customerCode) problems.push("thiếu mã khách hàng");
    if (customerCode?.includes("|")) problems.push("mã KH chứa ký tự |");
    if (!routeCode) problems.push("thiếu tuyến vận chuyển");
    if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) problems.push(`điểm đến "${txt(get(row, "destinationIso2")) ?? ""}" không phải mã ISO2`);

    const num = (f: OrderField, kind: "weight" | "price") => {
      const raw = get(row, f);
      const v = parseNumberCell(raw ?? null, kind);
      if (v === undefined) problems.push(`${f === "actualWeight" ? "cân thực" : f === "declaredValueUsd" ? "giá trị khai báo" : f.replace("Cm", "")} "${txt(raw)}" không hợp lệ`);
      return v ?? null;
    };
    const weight = num("actualWeight", "weight") ?? "0";
    const [l, w, hgt] = [num("lengthCm", "weight") ?? "0", num("widthCm", "weight") ?? "0", num("heightCm", "weight") ?? "0"];
    const declared = num("declaredValueUsd", "price");
    const dateOf = (f: OrderField) => {
      const v = parseViDateTime(get(row, f) ?? null);
      if (v === undefined) problems.push(`ngày "${txt(get(row, f))}" không hợp lệ (dd/mm/yyyy hh:mm)`);
      return v ?? null;
    };
    const createdAt = dateOf("createdAt");
    const shippedAt = dateOf("shippedAt");
    let count = 1;
    if (hasCount) {
      const c = txt(get(row, "packageCount"));
      if (c !== null) {
        count = Number(c.replace(",", "."));
        if (!Number.isInteger(count) || count < 1 || count > 999) problems.push(`số kiện "${c}" không hợp lệ`);
      }
    }
    if (problems.length) {
      res.errors.push({ row: line, billCode, message: problems.join("; ") });
      continue;
    }

    const orderKey = `${customerCode}|${billCode}`;
    const pkg = { lengthCm: l, widthCm: w, heightCm: hgt, actualWeight: weight };
    const existing = byKey.get(orderKey);
    if (existing) {
      if (hasCount) res.duplicatesInFile.push({ row: line, orderKey });
      else {
        existing.rows.push(line);
        existing.packages.push(pkg);
      }
      continue;
    }

    let packages: PackageDraft[] = [pkg];
    if (count > 1) {
      packages = splitWeight(weight, count).map((wt) => ({ ...pkg, actualWeight: wt }));
      res.warnings.push(`Dòng ${line} (${billCode}): ${count} kiện với 1 bộ kích thước → tạo ${count} kiện giống nhau, cân thực chia đều.`);
    }
    const goodsVi = txt(get(row, "goodsVi"));
    const goodsEn = txt(get(row, "goodsEn"));
    const draft: OrderDraft = {
      rows: [line],
      customerCode: customerCode!,
      billCode,
      orderKey,
      trackingNumber: txt(get(row, "trackingNumber")),
      routeCode: routeCode!,
      assignedRouteCode: code(get(row, "assignedRouteCode")),
      destinationIso2: iso2!,
      createdAt,
      shippedAt,
      receiverName: txt(get(row, "receiverName")),
      receiverAddress: txt(get(row, "receiverAddress")),
      receiverCity: txt(get(row, "receiverCity")),
      receiverState: txt(get(row, "receiverState")),
      receiverPostalCode: txt(get(row, "receiverPostalCode")),
      receiverPhone: txt(get(row, "receiverPhone")),
      receiverEmail: txt(get(row, "receiverEmail"))?.toLowerCase() ?? null,
      goodsDescription: [goodsVi, goodsEn].filter(Boolean).join(" / ") || null,
      hsCode: txt(get(row, "hsCode")),
      declaredValueUsd: declared,
      note: txt(get(row, "note")),
      packages,
    };
    byKey.set(orderKey, draft);
    res.drafts.push(draft);
  }
  if (res.warnings.length > 20) res.warnings = [...res.warnings.slice(0, 20), `… và ${res.warnings.length - 20} cảnh báo khác.`];
  return res;
}
