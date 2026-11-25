/**
 * SKYLANE PRICING ENGINE
 * -----------------------------------------------------------------------------
 * Nơi DUY NHẤT chứa logic: tính cân kiện (DIM), làm tròn theo dịch vụ, tra bảng giá
 * 3 lớp theo phiên bản, ưu tiên giá KH > nhóm giá > giá chung, và tính độc lập
 *   - route_code          → billed_weight  + sell_amount (giá bán khách)
 *   - assigned_route_code → shipped_weight + cost_amount (giá gốc NCC)
 *
 * Module thuần (không I/O, không phụ thuộc DB/framework). Dữ liệu tuyến & bảng giá
 * được truyền vào qua `PricingCatalog` — tầng service tự nạp từ DB rồi gọi engine.
 *
 * Số học: fixed-point BigInt (9 chữ số thập phân), KHÔNG dùng float.
 * Input nhận string (NUMERIC từ Postgres) hoặc number; output là string để ghi thẳng
 * vào cột NUMERIC: cân nặng 3 chữ số lẻ, VND số nguyên, USD 2 chữ số lẻ.
 */

// =============================================================================
// Kiểu dữ liệu
// =============================================================================
export type Num = string | number;
export type ServiceType = "EPK" | "CPN" | "CT";
export type WeightCalcMode = "ACTUAL_ONLY" | "MAX_ACTUAL_VOL";
export type PriceKind = "COST" | "SELL";
export type PricingMode = "MA_TRAN" | "THEO_KG" | "MA_TRAN+THEO_KG";
export type PricingStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type Currency = "VND" | "USD";
export type PriceScope = "CUSTOMER" | "GROUP" | "DEFAULT";
export type OverrideField =
  | "actual_weight" // tổng cân thực (dùng chung 2 tuyến)
  | "volumetric_weight" // tổng cân quy đổi (dùng chung 2 tuyến)
  | "billed_weight"
  | "shipped_weight"
  | "sell_amount"
  | "cost_amount";

export interface RouteConfig {
  routeCode: string;
  serviceType: ServiceType;
  weightCalcMode: WeightCalcMode;
  dimDivisor: Num;
}

export interface PackageInput {
  lengthCm?: Num | null;
  widthCm?: Num | null;
  heightCm?: Num | null;
  /** Thể tích (m³) — dùng thay cho Dài/Rộng/Cao khi có */
  volumeCbm?: Num | null;
  actualWeight: Num;
}

export interface MatrixTier {
  weightMax: Num; // mốc cân (bao gồm): áp dụng cho cân <= weightMax
  price: Num; // giá trọn mốc
}

export interface PerKgTier {
  weightMin: Num; // loại trừ (>)
  weightMax?: Num | null; // bao gồm (<=); null = trở lên
  unitPrice: Num; // đơn giá / kg
}

export interface PriceZone {
  zoneCode: string;
  countries: string[]; // ISO2
  matrix: MatrixTier[];
  perKg: PerKgTier[];
}

export interface PriceVersion {
  id: number | string;
  routeCode: string;
  kind: PriceKind;
  customerCode?: string | null;
  priceGroupCode?: string | null;
  mode: PricingMode;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null; // YYYY-MM-DD, bao gồm; null = vô thời hạn
  status?: PricingStatus; // mặc định ACTIVE
  currency?: Currency; // mặc định VND
  zones: PriceZone[];
}

export interface PricingCatalog {
  routes: RouteConfig[];
  versions: PriceVersion[];
}

export interface PackageWeight {
  actualWeight: string;
  volumetricWeight: string; // L*W*H/DIM (hiển thị 3 số lẻ)
  chargeableWeight: string; // cân dùng cộng tổng (CPN: đã làm tròn từng kiện)
}

export interface BillWeight {
  packages: PackageWeight[];
  totalActual: string;
  totalWeight: string; // tổng bill đã làm tròn theo dịch vụ
}

export interface OrderPricingInput {
  customerCode: string;
  priceGroupCode?: string | null; // nhóm giá mặc định của KH
  priceAdjustPct?: Num | null; // % điều chỉnh (áp khi fallback nhóm giá / giá chung)
  routeCode: string;
  assignedRouteCode?: string | null; // mặc định = routeCode
  destinationIso2: string;
  shippedAt?: Date | string | null;
  createdAt: Date | string;
  packages: PackageInput[];
  manualOverrides?: OverrideField[];
  current?: Partial<Record<OverrideField, Num | null>>; // giá trị đang lưu cho các trường ghi đè
}

export interface SideResult {
  routeCode: string;
  serviceType: ServiceType;
  packages: PackageWeight[];
  totalActual: string;
  totalVolumetric: string;
  weight: string;
  amount: string;
  currency: Currency;
  versionId: number | string | null;
  scope: PriceScope | null;
  adjustPct: string; // % đã áp vào giá (0 nếu không áp)
  weightOverridden: boolean;
  amountOverridden: boolean;
}

export interface OrderPricingResult {
  pricingDate: string;
  billed: SideResult; // billed_weight, sell_amount
  shipped: SideResult; // shipped_weight, cost_amount
  profit: string | null; // sell - cost (null nếu khác tiền tệ)
}

export type PricingErrorCode =
  | "INVALID_INPUT"
  | "ROUTE_NOT_FOUND"
  | "NO_VERSION"
  | "ZONE_NOT_FOUND"
  | "WEIGHT_OUT_OF_RANGE";

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  constructor(code: PricingErrorCode, message: string) {
    super(message);
    this.name = "PricingError";
    this.code = code;
  }
}

// =============================================================================
// Số thập phân cố định (BigInt, 9 chữ số lẻ)
// =============================================================================
const DIGITS = 9;
const S = 10n ** BigInt(DIGITS);
type Dec = bigint;

function dec(value: Num | null | undefined, field = "Giá trị"): Dec {
  if (value === null || value === undefined || value === "") return 0n;
  let s: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PricingError("INVALID_INPUT", `${field} không hợp lệ: ${value}`);
    s = value.toFixed(DIGITS);
  } else {
    s = value.trim();
  }
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new PricingError("INVALID_INPUT", `${field} không hợp lệ: "${value}"`);
  }
  const v = BigInt((m[2] || "0") + (m[3] ?? "").padEnd(DIGITS, "0").slice(0, DIGITS));
  return m[1] === "-" ? -v : v;
}

function nonNeg(value: Num | null | undefined, field: string): Dec {
  const d = dec(value, field);
  if (d < 0n) throw new PricingError("INVALID_INPUT", `${field} không được âm`);
  return d;
}

const mul = (a: Dec, b: Dec): Dec => (a * b) / S;
/** a / b làm tròn lên ở độ chính xác 1e-9 (a >= 0, b > 0) */
const divCeil = (a: Dec, b: Dec): Dec => (a * S + b - 1n) / b;
/** Làm tròn lên bội số step (a >= 0) */
const ceilTo = (a: Dec, step: Dec): Dec => (a <= 0n ? 0n : ((a + step - 1n) / step) * step);
/** Làm tròn half-up về `digits` chữ số lẻ (a >= 0) */
function roundHalfUp(a: Dec, digits: number): Dec {
  const unit = 10n ** BigInt(DIGITS - digits);
  return ((a + unit / 2n) / unit) * unit;
}
/** Định dạng chuỗi với đúng `digits` chữ số lẻ (làm tròn half-up) */
function fmt(a: Dec, digits: number): string {
  const r = roundHalfUp(a < 0n ? -a : a, digits);
  const unit = 10n ** BigInt(DIGITS - digits);
  const scaled = r / unit;
  const base = 10n ** BigInt(digits);
  const int = scaled / base;
  const frac = digits > 0 ? "." + (scaled % base).toString().padStart(digits, "0") : "";
  return (a < 0n && scaled !== 0n ? "-" : "") + int.toString() + frac;
}

const KG = (s: string) => dec(s);
export const MATRIX_THRESHOLD_KG = "20";
const W20 = KG(MATRIX_THRESHOLD_KG);
const STEP_EPK = KG("0.05");
const STEP_HALF = KG("0.5");
const STEP_ONE = KG("1");
const WEIGHT_DIGITS = 3;
const moneyDigits = (c: Currency) => (c === "VND" ? 0 : 2);

// =============================================================================
// Chuẩn hóa
// =============================================================================
/** TRIM + UPPER cho mã tuyến, mã nước ISO2, mã KH, mã vận đơn, mã nhóm giá */
export function normCode(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
}

// =============================================================================
// 1 + 2. Cân nặng: từng kiện & tổng bill
// =============================================================================
/** CPN: <= 20kg làm tròn lên 0.5kg, > 20kg làm tròn lên 1kg */
const cpnRound = (w: Dec): Dec => (w <= W20 ? ceilTo(w, STEP_HALF) : ceilTo(w, STEP_ONE));

function packageWeight(pkg: PackageInput, route: RouteConfig, index: number) {
  const label = `Kiện ${index + 1}`;
  const actual = nonNeg(pkg.actualWeight, `${label}: cân thực`);
  const l = nonNeg(pkg.lengthCm, `${label}: Dài`);
  const w = nonNeg(pkg.widthCm, `${label}: Rộng`);
  const h = nonNeg(pkg.heightCm, `${label}: Cao`);
  const dim = dec(route.dimDivisor, `Hệ số DIM tuyến ${route.routeCode}`);
  if (dim <= 0n) throw new PricingError("INVALID_INPUT", `Hệ số DIM tuyến ${route.routeCode} phải > 0`);

  const cbm = nonNeg(pkg.volumeCbm, `${label}: Thể tích`);
  const volumeCm3 = cbm > 0n ? cbm * 1_000_000n : l > 0n && w > 0n && h > 0n ? mul(mul(l, w), h) : 0n;
  const volumetric = volumeCm3 > 0n ? divCeil(volumeCm3, dim) : 0n;
  // ACTUAL_ONLY: bỏ qua thể tích. MAX_ACTUAL_VOL: max(cân thực, L*W*H/DIM)
  const basis = route.weightCalcMode === "ACTUAL_ONLY" ? actual : actual > volumetric ? actual : volumetric;
  const chargeable = route.serviceType === "CPN" ? cpnRound(basis) : basis;
  return { actual, volumetric, chargeable };
}

/** Tổng bill làm tròn theo dịch vụ */
function roundBillTotal(sum: Dec, service: ServiceType): Dec {
  switch (service) {
    case "EPK":
      return ceilTo(sum, STEP_EPK);
    case "CPN":
      return cpnRound(sum);
    case "CT":
      return ceilTo(sum, STEP_ONE);
  }
}

function billWeightDec(packages: PackageInput[], route: RouteConfig) {
  const rows = packages.map((p, i) => packageWeight(p, route, i));
  const sum = rows.reduce((t, r) => t + r.chargeable, 0n);
  const totalActual = rows.reduce((t, r) => t + r.actual, 0n);
  const totalVolumetric = rows.reduce((t, r) => t + r.volumetric, 0n);
  return { rows, total: roundBillTotal(sum, route.serviceType), totalActual, totalVolumetric };
}

/**
 * Cân tính phí của 1 bill theo cấu hình tuyến.
 * - EPK: không làm tròn từng kiện; tổng làm tròn lên 0.05kg
 * - CPN: làm tròn từng kiện và tổng (<=20kg lên 0.5kg, >20kg lên 1kg)
 * - CT : không làm tròn từng kiện; tổng làm tròn lên 1kg
 */
export function calcBillWeight(packages: PackageInput[], route: RouteConfig): BillWeight {
  const { rows, total, totalActual } = billWeightDec(packages, route);
  return {
    packages: rows.map((r) => ({
      actualWeight: fmt(r.actual, WEIGHT_DIGITS),
      volumetricWeight: fmt(r.volumetric, WEIGHT_DIGITS),
      chargeableWeight: fmt(r.chargeable, WEIGHT_DIGITS),
    })),
    totalActual: fmt(totalActual, WEIGHT_DIGITS),
    totalWeight: fmt(total, WEIGHT_DIGITS),
  };
}

// =============================================================================
// 3. Ngày gửi hàng & chọn phiên bản bảng giá
// =============================================================================
const saigonDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Saigon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày tra giá (YYYY-MM-DD, Asia/Saigon): shipped_at, fallback created_at */
export function pricingDate(shippedAt: Date | string | null | undefined, createdAt: Date | string): string {
  const raw = shippedAt ?? createdAt;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) throw new PricingError("INVALID_INPUT", `Ngày gửi hàng không hợp lệ: "${raw}"`);
  return saigonDate.format(d);
}

function isEffective(v: PriceVersion, date: string): boolean {
  return (v.status ?? "ACTIVE") === "ACTIVE" && v.effectiveFrom <= date && (!v.effectiveTo || v.effectiveTo >= date);
}

export interface VersionQuery {
  routeCode: string;
  kind: PriceKind;
  date: string;
  customerCode?: string | null;
  priceGroupCode?: string | null;
}

/**
 * Chọn phiên bản hiệu lực tại `date`.
 * SELL: riêng Mã KH → Nhóm giá mặc định → bảng giá chung. COST: bảng giá chung của tuyến.
 */
export function selectVersion(
  versions: PriceVersion[],
  q: VersionQuery,
): { version: PriceVersion; scope: PriceScope } | null {
  const route = normCode(q.routeCode);
  const cust = normCode(q.customerCode);
  const group = normCode(q.priceGroupCode);
  const pool = versions
    .filter((v) => normCode(v.routeCode) === route && v.kind === q.kind && isEffective(v, q.date))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)); // mới nhất trước

  const isDefault = (v: PriceVersion) => !normCode(v.customerCode) && !normCode(v.priceGroupCode);
  if (q.kind === "SELL") {
    const byCustomer = cust ? pool.find((v) => normCode(v.customerCode) === cust) : undefined;
    if (byCustomer) return { version: byCustomer, scope: "CUSTOMER" };
    const byGroup = group ? pool.find((v) => !normCode(v.customerCode) && normCode(v.priceGroupCode) === group) : undefined;
    if (byGroup) return { version: byGroup, scope: "GROUP" };
  }
  const def = pool.find(isDefault);
  return def ? { version: def, scope: "DEFAULT" } : null;
}

// =============================================================================
// 3. Tra giá trong 1 phiên bản: Zone → Ma trận / Theo kg
// =============================================================================
function findZone(version: PriceVersion, iso2: string): PriceZone {
  const code = normCode(iso2);
  const zone = version.zones.find((z) => z.countries.some((c) => normCode(c) === code));
  if (!zone) {
    throw new PricingError(
      "ZONE_NOT_FOUND",
      `Bảng giá "${version.routeCode}" (phiên bản ${version.id}) chưa có vùng giá cho nước ${code}`,
    );
  }
  return zone;
}

type Priced = { amount: Dec; basis: "MA_TRAN" | "THEO_KG"; unitPrice: Dec | null };

function matrixPrice(zone: PriceZone, w: Dec, version: PriceVersion): Priced {
  const tier = zone.matrix
    .map((t) => ({ max: dec(t.weightMax, "Mốc cân ma trận"), price: dec(t.price, "Giá ma trận") }))
    .sort((a, b) => (a.max < b.max ? -1 : a.max > b.max ? 1 : 0))
    .find((t) => t.max >= w);
  if (!tier) {
    throw new PricingError(
      "WEIGHT_OUT_OF_RANGE",
      `Cân ${fmt(w, WEIGHT_DIGITS)}kg vượt mốc ma trận vùng ${zone.zoneCode} (bảng giá ${version.routeCode}, phiên bản ${version.id})`,
    );
  }
  return { amount: tier.price, basis: "MA_TRAN", unitPrice: null };
}

function perKgPrice(zone: PriceZone, w: Dec, version: PriceVersion): Priced {
  const tier = zone.perKg.find((t) => {
    const min = dec(t.weightMin, "Mốc cân theo kg");
    const max = t.weightMax === null || t.weightMax === undefined || t.weightMax === "" ? null : dec(t.weightMax);
    return w > min && (max === null || w <= max);
  });
  if (!tier) {
    throw new PricingError(
      "WEIGHT_OUT_OF_RANGE",
      `Cân ${fmt(w, WEIGHT_DIGITS)}kg không thuộc khoảng giá theo kg nào của vùng ${zone.zoneCode} (bảng giá ${version.routeCode}, phiên bản ${version.id})`,
    );
  }
  const unit = dec(tier.unitPrice, "Đơn giá/kg");
  return { amount: mul(w, unit), basis: "THEO_KG", unitPrice: unit };
}

function pricedDec(version: PriceVersion, iso2: string, w: Dec): Priced {
  if (w <= 0n) return { amount: 0n, basis: "MA_TRAN", unitPrice: null }; // đơn chưa cân
  const zone = findZone(version, iso2);
  switch (version.mode) {
    case "MA_TRAN":
      return matrixPrice(zone, w, version);
    case "THEO_KG":
      return perKgPrice(zone, w, version);
    case "MA_TRAN+THEO_KG":
      return w <= W20 ? matrixPrice(zone, w, version) : perKgPrice(zone, w, version);
  }
}

const priceDec = (version: PriceVersion, iso2: string, w: Dec): Dec => pricedDec(version, iso2, w).amount;

export interface VersionQuote {
  amount: string;
  currency: Currency;
  basis: "MA_TRAN" | "THEO_KG"; // giá trọn mốc hay đơn giá × kg
  unitPrice: string | null; // đơn giá/kg khi THEO_KG
}

/** Báo giá 1 phiên bản cho cân tính phí đã làm tròn (công cụ tra cứu / báo giá) */
export function quoteVersion(version: PriceVersion, destinationIso2: string, weight: Num): VersionQuote {
  const currency = version.currency ?? "VND";
  const p = pricedDec(version, destinationIso2, nonNeg(weight, "Cân tính phí"));
  return {
    amount: fmt(roundHalfUp(p.amount, moneyDigits(currency)), moneyDigits(currency)),
    currency,
    basis: p.basis,
    unitPrice: p.unitPrice === null ? null : fmt(p.unitPrice, moneyDigits(currency)),
  };
}

/** Giá (chưa điều chỉnh %) cho 1 cân tính phí đã làm tròn — dùng cho công cụ báo giá */
export function priceForWeight(version: PriceVersion, destinationIso2: string, weight: Num): string {
  const c = version.currency ?? "VND";
  return fmt(priceDec(version, destinationIso2, nonNeg(weight, "Cân tính phí")), moneyDigits(c));
}

// =============================================================================
// 4 + 5. Tính giá đơn hàng: 2 tuyến độc lập
// =============================================================================
function getRoute(catalog: PricingCatalog, code: string): RouteConfig {
  const c = normCode(code);
  const r = catalog.routes.find((x) => normCode(x.routeCode) === c);
  if (!r) throw new PricingError("ROUTE_NOT_FOUND", `Không tìm thấy tuyến "${c}"`);
  return r;
}

function overrideValue(input: OrderPricingInput, field: OverrideField): Dec | null {
  if (!input.manualOverrides?.includes(field)) return null;
  const v = input.current?.[field];
  if (v === null || v === undefined || v === "") {
    throw new PricingError("INVALID_INPUT", `Trường ${field} đang ghi đè thủ công nhưng chưa có giá trị`);
  }
  return nonNeg(v, field);
}

function calcSide(input: OrderPricingInput, catalog: PricingCatalog, date: string, kind: PriceKind): SideResult {
  const isSell = kind === "SELL";
  const route = getRoute(catalog, isSell ? input.routeCode : input.assignedRouteCode || input.routeCode);
  let bill = billWeightDec(input.packages, route);
  // Ghi đè tổng cân thực / quy đổi: tính như 1 kiện tổng theo cấu hình tuyến
  const actualOv = overrideValue(input, "actual_weight");
  const volOv = overrideValue(input, "volumetric_weight");
  if (actualOv !== null || volOv !== null) {
    const actual = actualOv ?? bill.totalActual;
    const vol = volOv ?? bill.totalVolumetric;
    const basis = route.weightCalcMode === "ACTUAL_ONLY" ? actual : actual > vol ? actual : vol;
    const pkgRounded = route.serviceType === "CPN" ? cpnRound(basis) : basis;
    bill = { ...bill, totalActual: actual, totalVolumetric: vol, total: roundBillTotal(pkgRounded, route.serviceType) };
  }

  const wOverride = overrideValue(input, isSell ? "billed_weight" : "shipped_weight");
  const weight = wOverride ?? bill.total;
  const aOverride = overrideValue(input, isSell ? "sell_amount" : "cost_amount");

  let amount: Dec;
  let currency: Currency = "VND";
  let versionId: number | string | null = null;
  let scope: PriceScope | null = null;
  let adjust = 0n;

  if (aOverride !== null) {
    amount = aOverride;
  } else {
    const picked = selectVersion(catalog.versions, {
      routeCode: route.routeCode,
      kind,
      date,
      customerCode: input.customerCode,
      priceGroupCode: input.priceGroupCode,
    });
    if (!picked) {
      throw new PricingError(
        "NO_VERSION",
        `Không có bảng giá ${isSell ? "bán" : "gốc"} hiệu lực cho tuyến ${route.routeCode} ngày ${date}`,
      );
    }
    currency = picked.version.currency ?? "VND";
    versionId = picked.version.id;
    scope = picked.scope;
    let raw = priceDec(picked.version, input.destinationIso2, weight);
    // Giá riêng KH dùng nguyên giá; fallback nhóm giá / giá chung nhân (1 + Điều chỉnh %)
    if (isSell && scope !== "CUSTOMER") {
      adjust = dec(input.priceAdjustPct, "Điều chỉnh %");
      if (adjust <= -100n * S) throw new PricingError("INVALID_INPUT", "Điều chỉnh % phải lớn hơn -100");
      raw = (raw * (100n * S + adjust)) / (100n * S);
    }
    amount = roundHalfUp(raw, moneyDigits(currency));
  }

  return {
    routeCode: route.routeCode,
    serviceType: route.serviceType,
    packages: bill.rows.map((r) => ({
      actualWeight: fmt(r.actual, WEIGHT_DIGITS),
      volumetricWeight: fmt(r.volumetric, WEIGHT_DIGITS),
      chargeableWeight: fmt(r.chargeable, WEIGHT_DIGITS),
    })),
    totalActual: fmt(bill.totalActual, WEIGHT_DIGITS),
    totalVolumetric: fmt(bill.totalVolumetric, WEIGHT_DIGITS),
    weight: fmt(weight, WEIGHT_DIGITS),
    amount: fmt(amount, moneyDigits(currency)),
    currency,
    versionId,
    scope,
    adjustPct: fmt(adjust, 2),
    weightOverridden: wOverride !== null,
    amountOverridden: aOverride !== null,
  };
}

/**
 * Tính toàn bộ cân & giá của 1 đơn.
 * Bên bán (route_code) và bên gốc (assigned_route_code) tính hoàn toàn độc lập:
 * đổi assigned_route_code không làm thay đổi billed_weight / sell_amount.
 * Trường nằm trong `manualOverrides` giữ nguyên giá trị `current`.
 * Lưu ý: kiểm tra price_locked thuộc về tầng service (đơn khóa giá thì không gọi engine).
 */
export function calcOrderPricing(input: OrderPricingInput, catalog: PricingCatalog): OrderPricingResult {
  const date = pricingDate(input.shippedAt, input.createdAt);
  const billed = calcSide(input, catalog, date, "SELL");
  const shipped = calcSide(input, catalog, date, "COST");
  const profit =
    billed.currency === shipped.currency
      ? fmt(dec(billed.amount) - dec(shipped.amount), moneyDigits(billed.currency))
      : null;
  return { pricingDate: date, billed, shipped, profit };
}
