{
// =============================================================================
// Module thật của dự án (biên dịch từ lib/*.ts)
// =============================================================================
const E = __M.engine, IX = __M.importExcel, V = __M.versioning, IP = __M.importParse, SF = __M.statementFmt, RF = __M.receiptFmt, P = __M.permissions;
const SL = __M.search, TT = __M.totals, ED = __M.edit, XL = __M.excelLayout, PT = __M.priceTemplate, OT = __M.orderTemplate, GT = __M.groupTable, RS = __M.repriceSummary, QI = __M.quoteInput;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (v) => Math.round(Number(v) || 0).toLocaleString("vi-VN");
const kg = (v) => (Number(v) ? Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 3 }) : "–");
const today = () => E.pricingDate(null, new Date());
const STATUSES = ["Phát sinh", "Đã nhận kho", "Đã xuất hàng", "Đã giao hàng", "Hoàn"];
const STATUS_TONE = { "Phát sinh": "muted", "Đã nhận kho": "info", "Đã xuất hàng": "warn", "Đã giao hàng": "ok", Hoàn: "bad" };
const DEBT_TONE = { "Chưa thanh toán": "muted", "xuất bảng kê": "info", "Thanh toán 1 phần": "warn", "Đã thanh toán": "ok" };
const badge = (t, tone = "muted") => `<span class="b b-${tone}">${esc(t)}</span>`;
const SVC_ROUND = { EPK: "Tổng bill ↑0,05 kg", CPN: "Từng kiện & tổng ↑0,5 kg (≤20) / 1 kg (>20)", CT: "Tổng bill ↑1 kg" };

// =============================================================================
// Dữ liệu mẫu (danh mục thật từ Google Sheet; giá & đơn là số liệu mẫu)
// =============================================================================
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const steps = (a, b, s) => { const o = []; for (let w = a; w <= b + 1e-9; w = Math.round((w + s) * 100) / 100) o.push(w); return o; };
const EPK_W = [...steps(0.1, 2, 0.1), ...steps(2.5, 10, 0.5), ...steps(11, 20, 1)];
const CPN_W = steps(0.5, 20, 0.5);
const r1000 = (x) => String(Math.round(x / 1000) * 1000);

const PRICE_DEFS = {
  VNFZZXR: { mode: "MA_TRAN", w: EPK_W, zones: [["US", 90000, 260000], ["GB", 70000, 240000], ["DE,FR,IT,ES,NL", 95000, 250000], ["AU,CA", 100000, 270000]] },
  "VN-YTYCPREC": { mode: "MA_TRAN", w: EPK_W, zones: [["US", 85000, 255000]] },
  VNTHZXR: { mode: "MA_TRAN", w: [...EPK_W, ...steps(21, 30, 1)], zones: [["US", 80000, 240000]] },
  VNBKZXR: { mode: "MA_TRAN", w: EPK_W, zones: [["US", 88000, 250000]] },
  "UPS HAN S5500": { mode: "MA_TRAN+THEO_KG", w: CPN_W, zones: [["US", 220000, 180000], ["CA", 240000, 190000], ["GB", 230000, 185000]], kgs: [[20, 44, 175000], [44, 99, 170000], [99, 299, 165000], [299, null, 160000]] },
  "UPS SAVER SS": { mode: "MA_TRAN+THEO_KG", w: CPN_W, zones: [["US", 205000, 170000], ["CA", 225000, 180000], ["GB", 215000, 175000]], kgs: [[20, 44, 165000], [44, 99, 160000], [99, 299, 155000], [299, null, 150000]] },
  "CT UK-NK": { mode: "THEO_KG", w: [], zones: [["GB", 0, 0]], kgs: [[0, 44, 120000], [44, 99, 110000], [99, null, 100000]] },
  "CT EU-A": { mode: "THEO_KG", w: [], zones: [["DE,FR,IT,ES,NL", 0, 0]], kgs: [[0, 44, 135000], [44, 99, 125000], [99, null, 115000]] },
};

function buildVersion(id, route, kind, factor, from, to = null, extra = {}) {
  const d = PRICE_DEFS[route];
  return {
    id, routeCode: route, kind, customerCode: extra.customerCode ?? null, priceGroupCode: extra.priceGroupCode ?? null,
    mode: d.mode, effectiveFrom: from, effectiveTo: to, status: "ACTIVE", currency: "VND",
    name: `${route} · ${kind === "COST" ? "Giá gốc" : "Giá bán"} · ${extra.customerCode ? "KH " + extra.customerCode : extra.priceGroupCode ? "Nhóm " + extra.priceGroupCode : "Chung"}`,
    note: extra.note ?? "Dữ liệu mẫu",
    zones: d.zones.map(([countries, base, perKg], i) => ({
      zoneCode: `Z${String(i + 1).padStart(2, "0")}`,
      countries: countries.split(","),
      matrix: d.w.map((w) => ({ weightMax: String(w), price: r1000((base + perKg * w) * factor) })),
      perKg: (d.kgs ?? []).map(([a, b, u]) => ({ weightMin: String(a), weightMax: b === null ? null : String(b), unitPrice: r1000((u + i * 5000) * factor) })),
    })),
  };
}

function seed() {
  const S = {
    me: "u-admin", seq: 1, counters: {},
    users: [
      { id: "u-admin", name: "Quản trị Demo", role: "ADMIN" },
      { id: "u-kt", name: "Kế toán Lan", role: "KE_TOAN" },
      { id: "u-kho", name: "Kho Minh", role: "KHO" },
      { id: "u-huy", name: "Huy", role: "SALE" },
      { id: "u-khanh", name: "Khánh", role: "SALE" },
    ],
    groups: [
      { code: "NHOM_BUSINESS", name: "Business", adjust: "8", active: true, note: "Có bảng giá riêng VNFZZXR, UPS HAN S5500" },
      { code: "CA_NHAN", name: "Cá nhân", adjust: "15", active: true, note: "" },
    ],
    customers: [
      { code: "SKL116", name: "Chị Thanh", group: "NHOM_BUSINESS", adjust: "0", saleId: "u-huy", currency: "VND", sheet: "https://docs.google.com/spreadsheets/d/1eO6Zd1WSjJP2NFUaAPWDoBtTAAcWOMXRNmHR_ILH1vw" },
      { code: "SKL170", name: "Minh Nhật", group: "NHOM_BUSINESS", adjust: "-3", saleId: "u-khanh", currency: "VND", sheet: "" },
      { code: "SKL126", name: "Chị Amb", group: "CA_NHAN", adjust: "0", saleId: "u-khanh", currency: "VND", sheet: "" },
    ],
    drafts: [], sheetSeen: { SKL116: 2 },
    routes: [
      ["VNFZZXR", "YUN", "EPK", 15000], ["VN-YTYCPREC", "YUN", "EPK", 5000], ["VNTHZXR", "YUN", "EPK", 6000], ["VNBKZXR", "YUN", "EPK", 5000],
      ["UPS HAN S5500", "HYE", "CPN", 5500], ["UPS HAN D", "HYE", "CPN", 6000], ["UPS SAVER SS", "LY TUONG", "CPN", 5500],
      ["CT UK-NK", "KANGO", "CT", 150000], ["CT EU-A", "ALPHA", "CT", 6000], ["CT UK-CK", "KANGO", "CT", 150000],
    ].map(([code, supplier, service, dim]) => ({ code, name: code, supplier, service, mode: code.startsWith("CT UK") ? "ACTUAL_ONLY" : "MAX_ACTUAL_VOL", dim: String(dim) })),
    versions: [], orders: [], statements: [], receipts: [],
  };
  let vid = 1;
  S.versions.push(buildVersion(vid++, "VNFZZXR", "COST", 0.97, "2026-10-01", "2026-10-31", { note: "Bảng giá YUN tháng 10 (đã kết thúc)" }));
  for (const r of Object.keys(PRICE_DEFS)) {
    S.versions.push(buildVersion(vid++, r, "COST", 1, r === "VNFZZXR" ? "2026-11-01" : "2026-10-01"));
    S.versions.push(buildVersion(vid++, r, "SELL", 1.3, "2026-10-01"));
  }
  S.versions.push(buildVersion(vid++, "VNFZZXR", "SELL", 1.22, "2026-10-01", null, { priceGroupCode: "NHOM_BUSINESS" }));
  S.versions.push(buildVersion(vid++, "UPS HAN S5500", "SELL", 1.22, "2026-10-01", null, { priceGroupCode: "NHOM_BUSINESS" }));
  S.versions.push(buildVersion(vid++, "VNFZZXR", "SELL", 1.15, "2026-10-01", null, { customerCode: "SKL116", note: "Giá riêng SKL116" }));

  const rnd = rng(116);
  const plan = [["VNFZZXR", ["US", "GB", "DE", "AU"]], ["VN-YTYCPREC", ["US"]], ["VNTHZXR", ["US"]], ["UPS HAN S5500", ["US", "CA", "GB"]], ["CT UK-NK", ["GB"]], ["UPS HAN D", ["US"]]];
  const names = ["David Lee", "Brandon Rogers", "Victor Hugo", "Emma Stone", "Liam Smith", "Olivia Brown", "Noah Wilson", "Ava Taylor"];
  const ADDR = [
    { rAddress: "308 N Fillmore St", rCity: "Bruning", rState: "NE", rPostal: "68322", rPhone: "+12698047967", rEmail: "david@example.com" },
    { rAddress: "12 Main St", rCity: "Austin", rState: "TX", rPostal: "73301", rPhone: "+15125550101", rEmail: "" },
    { rAddress: "5 Oxford St", rCity: "London", rState: "", rPostal: "W1D 1AN", rPhone: "+447700900123", rEmail: "" },
    { rAddress: "40 Queen St", rCity: "Toronto", rState: "ON", rPostal: "M5H 2N2", rPhone: "+14165550199", rEmail: "liam@example.com" },
  ];
  const GOODS = [["Quần áo", "Clothes", "6109.10"], ["Giày", "Shoes", "6403.99"], ["Túi xách", "Handbag", "4202.21"], ["Mỹ phẩm", "Cosmetics", "3304.99"]];
  for (let i = 0; i < 38; i++) {
    const day = 1 + Math.floor((i * 24) / 38);
    const cust = ["SKL116", "SKL170", "SKL126"][i % 3];
    const [route, dests] = plan[i % 13 === 12 ? 5 : i % 5];
    const svc = S.routes.find((r) => r.code === route).service;
    const n = svc === "EPK" ? 1 + (rnd() < 0.2) : 1 + Math.floor(rnd() * 3);
    const pk = () => {
      const w = svc === "EPK" ? 0.15 + rnd() * 2.5 : svc === "CPN" ? 1 + rnd() * 14 : 15 + rnd() * 30;
      return { l: String(Math.round(15 + rnd() * 35)), w: String(Math.round(10 + rnd() * 30)), h: String(Math.round(5 + rnd() * 25)), kg: w.toFixed(3) };
    };
    const status = day <= 10 ? "Đã giao hàng" : day <= 18 ? "Đã xuất hàng" : day <= 22 ? "Đã nhận kho" : "Phát sinh";
    const o = newOrder(S, {
      customer: cust,
      bill: cust === "SKL116" ? `#AP${1376 + i}` : cust === "SKL170" ? `MN${2600 + i}` : `AMB${800 + i}`,
      tracking: status === "Phát sinh" ? "" : `1Z${String(Math.floor(rnd() * 1e9)).padStart(9, "0")}`,
      route, assigned: route === "UPS HAN S5500" && i % 2 ? "UPS SAVER SS" : route,
      iso2: dests[Math.floor(rnd() * dests.length)],
      status: i === 7 ? "Hoàn" : status,
      createdAt: `2026-11-${String(day).padStart(2, "0")}T${String(9 + (i % 8)).padStart(2, "0")}:15:00+07:00`,
      packages: status === "Phát sinh" && i % 2 ? [] : Array.from({ length: n }, pk),
      receiver: names[i % names.length],
      exportedAt: status === "Đã xuất hàng" || status === "Đã giao hàng" ? `2026-11-${String(Math.min(day + 1, 26)).padStart(2, "0")}T${String(14 + (i % 5)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00+07:00` : null,
      ...ADDR[i % ADDR.length],
      goodsVi: GOODS[i % GOODS.length][0], goodsEn: GOODS[i % GOODS.length][1], hs: GOODS[i % GOODS.length][2], declared: String(10 + (i % 6) * 5),
    });
    S.orders.push(o);
  }
  const cat = catalogOf(S);
  S.orders.forEach((o) => reprice(S, o, cat));
  // Bảng kê + thanh toán mẫu
  const pick = (c, upto) => S.orders.filter((o) => o.customer === c && pd(o) <= upto && Number(o.sell) > 0).map((o) => o.id);
  createStatement(S, "SKL116", pick("SKL116", "2026-11-10"), "2026-11-01", "2026-11-10", "2026-11-12");
  const b = createStatement(S, "SKL170", pick("SKL170", "2026-11-15"), "2026-11-01", "2026-11-15", "2026-11-16");
  saveReceipt(S, { customer: "SKL170", amount: String(Math.round((b.total * 0.6) / 1000) * 1000), allocs: [{ sid: b.id, amount: String(Math.round((b.total * 0.6) / 1000) * 1000) }], bankRef: "FT26320AB1", day: "2026-11-20" });
  return S;
}

// =============================================================================
// Nghiệp vụ (dùng engine thật)
// =============================================================================
const catalogOf = (S) => ({
  routes: S.routes.map((r) => ({ routeCode: r.code, serviceType: r.service, weightCalcMode: r.mode, dimDivisor: r.dim })),
  versions: S.versions,
});
const pd = (o) => E.pricingDate(o.shippedAt, o.createdAt);
const custOf = (S, c) => S.customers.find((x) => x.code === c);

function newOrder(S, d) {
  return {
    id: S.seq++, customer: d.customer, bill: d.bill.trim().toUpperCase(), tracking: d.tracking || "", route: d.route, assigned: d.assigned || d.route,
    iso2: d.iso2.toUpperCase(), status: d.status || "Phát sinh", debt: "Chưa thanh toán", createdAt: d.createdAt || new Date().toISOString(),
    shippedAt: d.shippedAt || null, exportedAt: d.exportedAt || (d.status === "Đã xuất hàng" ? new Date().toISOString() : null),
    packages: d.packages || [], overrides: [], actual: "0", vol: "0", billed: "0", shipped: "0", sell: "0", cost: "0",
    locked: false, receiver: d.receiver || "", note: d.note || "", source: d.source || "MANUAL", warn: null, sellV: null, costV: null,
    // Người nhận & hải quan (cửa sổ chi tiết vận đơn)
    rAddress: d.rAddress || "", rCity: d.rCity || "", rState: d.rState || "", rPostal: d.rPostal || "", rPhone: d.rPhone || "", rEmail: d.rEmail || "",
    hs: d.hs || "", goodsVi: d.goodsVi || "", goodsEn: d.goodsEn || "", declared: d.declared || "", rowVersion: 1,
  };
}

/** Tính lại giá các đơn thỏa điều kiện → báo cáo (tổng giá bán trước/sau, nguồn giá, đơn khóa) — dùng chung thông báo với web thật */
function repriceWhere(S, pred) {
  const r = RS.emptyReport(), cat = catalogOf(S);
  for (const o of S.orders.filter(pred)) {
    if (o.locked) { r.locked++; continue; }
    const before = o.sell;
    if (reprice(S, o, cat)) {
      if (o.warn) r.failed.push({ billCode: o.bill, message: o.warn });
      else { r.repriced++; RS.addRepriced(r, before, o.sell, o.overrides.includes("sell_amount") ? null : o.sellScope || null); }
    }
  }
  return r;
}
const scopeOfVersion = (v) => (v.customerCode ? "CUSTOMER" : v.priceGroupCode ? "GROUP" : "DEFAULT");
/** Thêm phiên bản bảng giá (chốt ngày kết thúc phiên bản cũ CÙNG tuyến + loại + phạm vi) — dùng cho import & bảng riêng của nhóm */
function addPriceVersion(S, { routeCode, kind, scope, from, mode, currency, zones, name, note }) {
  const same = (v) => v.routeCode === routeCode && v.kind === kind && (v.status || "ACTIVE") === "ACTIVE" && (v.customerCode || null) === (scope.type === "CUSTOMER" ? scope.code : null) && (v.priceGroupCode || null) === (scope.type === "GROUP" ? scope.code : null);
  const plan = V.planNewVersion(S.versions.filter(same).map((v) => ({ id: v.id, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo })), from);
  if (!plan.ok) throw new Error(`${routeCode}: ${plan.error}`);
  plan.close.forEach((c) => (S.versions.find((v) => v.id === c.id).effectiveTo = c.newEffectiveTo));
  const v = { id: Math.max(0, ...S.versions.map((x) => x.id)) + 1, routeCode, kind, customerCode: scope.type === "CUSTOMER" ? scope.code : null, priceGroupCode: scope.type === "GROUP" ? scope.code : null, mode, effectiveFrom: from, effectiveTo: plan.newEffectiveTo, status: "ACTIVE", currency, name, note, zones };
  S.versions.push(v);
  return { v, closed: plan.close.length };
}

/** Tự động tính lại giá: đơn chưa khóa → engine tính lại cân, giá bán, giá gốc */
function reprice(S, o, cat = catalogOf(S)) {
  if (o.locked) return false;
  const c = custOf(S, o.customer);
  const input = {
    customerCode: o.customer, priceGroupCode: c?.group, groupAdjustPct: S.groups.find((g) => g.code === c?.group)?.adjust, priceAdjustPct: c?.adjust, routeCode: o.route, assignedRouteCode: o.assigned,
    destinationIso2: o.iso2, shippedAt: o.shippedAt, createdAt: o.createdAt,
    packages: o.packages.map((p) => ({ lengthCm: p.l, widthCm: p.w, heightCm: p.h, actualWeight: p.kg })),
    manualOverrides: o.overrides,
    current: { actual_weight: o.actual, volumetric_weight: o.vol, billed_weight: o.billed, shipped_weight: o.shipped, sell_amount: o.sell, cost_amount: o.cost },
  };
  let r, keep = false;
  o.warn = null;
  try {
    r = E.calcOrderPricing(input, cat);
  } catch (e) {
    if (!(e instanceof E.PricingError)) throw e;
    o.warn = e.message;
    try {
      r = E.calcOrderPricing({ ...input, manualOverrides: [...o.overrides, "sell_amount", "cost_amount"] }, cat);
      keep = true;
    } catch {
      return false;
    }
  }
  Object.assign(o, { actual: r.billed.totalActual, vol: r.billed.totalVolumetric, billed: r.billed.weight, shipped: r.shipped.weight, sell: r.billed.amount, cost: r.shipped.amount });
  if (!keep) {
    if (!r.billed.amountOverridden) { o.sellV = r.billed.versionId; o.sellScope = r.billed.scope; }
    if (!r.shipped.amountOverridden) o.costV = r.shipped.versionId;
  }
  return true;
}

function nextNo(S, prefix, day, fmt) {
  const k = `${prefix}|${day}`;
  S.counters[k] = (S.counters[k] || 0) + 1;
  return fmt(day, S.counters[k]);
}

function createStatement(S, customer, ids, from, to, day = today()) {
  const c = custOf(S, customer);
  const os = S.orders.filter((o) => ids.includes(o.id)).sort((a, b) => (pd(a) < pd(b) ? -1 : 1));
  const bad = os.find((o) => o.debt !== "Chưa thanh toán" || o.customer !== customer);
  if (bad) throw new Error(`Đơn ${bad.bill} đã lên bảng kê hoặc không thuộc ${customer}.`);
  const no = nextNo(S, SF.STATEMENT_PREFIX, day, SF.formatStatementNo);
  const st = {
    id: S.seq++, no, name: SF.statementName(c.name, c.code, no), customer, issuedAt: `${day}T10:00:00+07:00`, from, to, status: "ACTIVE", debt: "xuất bảng kê", paid: 0,
    items: os.map((o, i) => ({ line: i + 1, orderId: o.id, date: pd(o), bill: o.bill, tracking: o.tracking, iso2: o.iso2, receiver: o.receiver, pkgs: o.packages.length, billed: o.billed, route: o.route, amount: Number(o.sell), note: o.note })),
  };
  st.total = st.items.reduce((t, i) => t + i.amount, 0);
  os.forEach((o) => { o.debt = "xuất bảng kê"; o.locked = true; });
  S.statements.push(st);
  return st;
}

const debtOf = (total, paid) => (paid <= 0 ? "xuất bảng kê" : paid >= total ? "Đã thanh toán" : "Thanh toán 1 phần");

function saveReceipt(S, { customer, amount, allocs, bankRef = "", payer = "", note = "", account = RF.DEFAULT_RECEIVED_ACCOUNT, proofs = [], day = today() }) {
  const amt = Number(amount);
  const total = allocs.reduce((t, a) => t + Number(a.amount), 0);
  if (!(amt > 0)) throw new Error("Số tiền nhận phải lớn hơn 0.");
  if (total > amt) throw new Error("Tổng phân bổ vượt quá số tiền nhận.");
  for (const a of allocs) {
    const st = S.statements.find((s) => s.id === a.sid);
    if (!st || st.status !== "ACTIVE" || st.customer !== customer) throw new Error("Bảng kê không hợp lệ.");
    if (Number(a.amount) > st.total - st.paid) throw new Error(`Phân bổ cho ${st.no} vượt số còn nợ.`);
  }
  const no = nextNo(S, RF.RECEIPT_PREFIX, day, RF.formatReceiptNo);
  const r = { id: S.seq++, no, customer, amount: amt, allocs: allocs.map((a) => ({ sid: a.sid, amount: Number(a.amount) })), bankRef, payer, note, account, proofs, status: "ACTIVE", receivedAt: `${day}T${new Date().toTimeString().slice(0, 5)}:00+07:00` };
  S.receipts.push(r);
  recalcPaid(S);
  return r;
}
/** Số đã thu của bảng kê = tổng phân bổ từ phiếu thu còn hiệu lực (như trigger DB) → trạng thái công nợ bảng kê & đơn */
function recalcPaid(S) {
  const paid = new Map();
  for (const r of S.receipts) {
    if (r.status === "CANCELLED") { r.allocs = []; }
    r.allocated = r.allocs.reduce((t, a) => t + Number(a.amount), 0);
    r.overpaid = r.status === "CANCELLED" ? 0 : r.amount - r.allocated;
    for (const a of r.allocs) paid.set(a.sid, (paid.get(a.sid) || 0) + Number(a.amount));
  }
  for (const st of S.statements) {
    if (st.status !== "ACTIVE") continue;
    st.paid = paid.get(st.id) || 0;
    st.debt = debtOf(st.total, st.paid);
    st.items.forEach((it) => { const o = S.orders.find((x) => x.id === it.orderId); if (o) o.debt = st.debt; });
  }
}
const statusList = (ids) => [...new Set(ids)].map((id) => S.statements.find((s) => s.id === id)).filter(Boolean).map((s) => `${s.no} → ${s.debt}`).join("; ");


// ---- Đơn hàng dự báo (vùng chờ trước Vận đơn) ----
const usedKeys = () => new Set([...S.orders.map((o) => `${o.customer}|${o.bill}`), ...S.drafts.map((d) => d.d.orderKey)]);
const pendingDrafts = () => S.drafts.filter((d) => d.status === "CHO_XAC_NHAN" && inScope(d.d.customerCode)).length;
function stageDrafts(list, source, label) {
  const keys = usedKeys();
  let added = 0;
  for (const d of list) {
    if (keys.has(d.orderKey)) continue;
    const { rows, ...data } = d;
    S.drafts.push({ id: S.seq++, d: data, source, label, status: "CHO_XAC_NHAN", at: new Date().toISOString(), decidedAt: null, reason: null });
    keys.add(d.orderKey);
    added++;
  }
  return added;
}
function confirmDrafts(ids) {
  const cat = catalogOf(S);
  let n = 0, warn = 0;
  for (const dr of S.drafts.filter((x) => ids.includes(x.id) && x.status === "CHO_XAC_NHAN")) {
    const d = dr.d;
    const o = newOrder(S, {
      customer: d.customerCode, bill: d.billCode, tracking: d.trackingNumber, route: d.routeCode, assigned: d.assignedRouteCode, iso2: d.destinationIso2, createdAt: d.createdAt || dr.at, shippedAt: d.shippedAt,
      receiver: d.receiverName, note: d.note, source: dr.source, packages: d.packages.map((p) => ({ l: p.lengthCm, w: p.widthCm, h: p.heightCm, kg: p.actualWeight })),
      rAddress: d.receiverAddress, rCity: d.receiverCity, rState: d.receiverState, rPostal: d.receiverPostalCode, rPhone: d.receiverPhone, rEmail: d.receiverEmail,
      hs: d.hsCode, goodsVi: d.goodsDescription, goodsEn: d.goodsNameEn, declared: d.declaredValueUsd,
    });
    reprice(S, o, cat);
    S.orders.push(o);
    Object.assign(dr, { status: "DA_XAC_NHAN", decidedAt: new Date().toISOString(), orderId: o.id });
    n++; if (o.warn) warn++;
  }
  return { n, warn };
}
// Google Sheet của khách (mô phỏng): SKL116 nhập đơn trên link SkyLane cấp, đúng cột tab DON
const SHEET_HEAD = ["Thời gian phát sinh đơn", "STT", "Mã vận đơn", "Tuyến vận chuyển", "Giá trị khai báo", "Tên hàng tiếng Việt", "Tên hàng tiếng anh", "Mã HS (hải quan)", "Người nhận", "Địa chỉ người nhận", "Thành phố người nhận", "Bang/tỉnh người nhận", "Mã bưu chính người nhận", "SĐT người nhận", "Mail người nhận", "Điểm đến", "Số kiện", "Trọng lượng thực tế(kg)", "Dài", "Rộng", "Cao"];
const SHEET_ROWS = [
  ["24/11/2026 15:19:43", 1, "#AP3001", "VNFZZXR", 20, "Quần áo", "", "", "Olivia Brown", "12 Main St, Austin, TX", "Austin", "TX", "73301", "+15125550101", "", "US", 1, "0,62", 30, 22, 8],
  ["24/11/2026 16:02:10", 2, "#AP3002", "VN-YTYCPREC", 15, "Áo thun", "", "", "Noah Wilson", "88 Pine Rd, Denver, CO", "Denver", "CO", "80202", "+13035550188", "", "US", 1, "0,95", 28, 20, 12],
  ["25/11/2026 08:45:00", 3, "#AP3003", "VNFZZXR", 25, "Túi xách", "", "", "Emma Stone", "5 Oxford St, London", "London", "", "W1D 1AN", "+447700900123", "", "GB", 1, "1,4", 35, 25, 15],
  ["25/11/2026 09:30:00", 4, "#AP3004", "UPS HAN S5500", 60, "Giày", "", "", "Liam Smith", "40 Queen St, Toronto, ON", "Toronto", "ON", "M5H 2N2", "+14165550199", "", "CA", 2, "6,8", 40, 30, 25],
  ["25/11/2026 10:10:00", 5, "#AP3005", "VNFZZXR", 20, "Mũ", "", "", "Ava Taylor", "9 Elm St, Boston, MA", "Boston", "MA", "02108", "+16175550111", "", "USA", 1, "0,3", 20, 15, 10],
  ["25/11/2026 14:20:00", 6, "#AP3006", "VNTHZXR", 18, "Váy", "", "", "Mia Clark", "77 Lake Ave, Chicago, IL", "Chicago", "IL", "60601", "+13125550177", "", "US", 1, "0,8", 30, 20, 10],
  ["25/11/2026 15:05:00", 7, "#AP3007", "VNFZZXR", 22, "Quần jean", "", "", "James Lee", "3 Bay St, Miami, FL", "Miami", "FL", "33101", "+13055550166", "", "US", 1, "1,1", 32, 24, 10],
  ["25/11/2026 16:40:00", 8, "#AP3008", "CT UK-NK", 120, "Hàng gia dụng", "", "", "Sophie Turner", "21 King St, Manchester", "Manchester", "", "M2 4WU", "+447700900456", "", "GB", 2, "28", 60, 40, 40],
];
// Mỗi khách có Google Sheet RIÊNG (mô phỏng): cùng mẫu dòng nhưng mã vận đơn theo tiền tố của khách đó
const SHEET_PREFIX = { SKL116: "#AP30", SKL170: "MN30", SKL126: "AMB30" };
const sheetRowsFor = (code) => SHEET_ROWS.map((r) => { const x = r.slice(); x[2] = (SHEET_PREFIX[code] || `${code}-`) + String(x[1]).padStart(2, "0"); return x; });
function syncSheet(code) {
  const c = custOf(S, code);
  if (!c?.sheet) return { error: `${code} chưa có link Google Sheet.` };
  S.sheetSeen = S.sheetSeen || {};
  S.sheetSeen[code] = Math.min(SHEET_ROWS.length, (S.sheetSeen[code] || 0) + 3); // mô phỏng: khách vừa nhập thêm đơn trên sheet của mình
  const res = IP.parseOrderSheet([SHEET_HEAD, ...sheetRowsFor(code).slice(0, S.sheetSeen[code])], { defaultCustomerCode: code });
  const keys = usedKeys();
  const fresh = res.drafts.filter((d) => !keys.has(d.orderKey));
  const added = stageDrafts(fresh, "SYNC", "Google Sheet · tab DON");
  return { added, total: res.drafts.length, skipped: res.drafts.length - added, errors: res.errors };
}

// =============================================================================
// Trạng thái, lưu trữ, quyền
// =============================================================================
const KEY = "skylane-demo-v3"; // v3: thêm thời gian xuất hàng, thông tin người nhận & hải quan
let S = null;
try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { S = null; }
const freshData = () => { S = seed(); syncSheet("SKL116"); }; // khách đã nhập sẵn vài đơn trên Google Sheet
if (!S || !S.orders || !S.drafts) freshData();
// Sửa lỗi đồng bộ cũ: trước đây mọi khách dùng chung sheet mô phỏng của SKL116 → đơn #AP30xx bị nhập nhầm cho khách khác
let fixedSync = 0;
if (typeof S.sheetVisible === "number") { S.sheetSeen = { SKL116: S.sheetVisible }; delete S.sheetVisible; }
S.drafts = S.drafts.filter((d) => {
  const bad = d.source === "SYNC" && d.status === "CHO_XAC_NHAN" && d.d.customerCode !== "SKL116" && /^#AP30\d\d$/.test(d.d.billCode);
  if (bad) fixedSync++;
  return !bad;
});
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, receipts: S.receipts.map((r) => ({ ...r, proofs: [] })) })); } catch {} };
save();

const me = () => S.users.find((u) => u.id === S.me);
const can = (p) => P.can(me().role, p);
const cust = (c) => custOf(S, c);
const inScope = (code) => me().role !== "SALE" || cust(code)?.saleId === me().id;
const scopedCustomers = () => S.customers.filter((c) => inScope(c.code));

const VIEWS = {
  dashboard: { label: "Tổng quan", perm: "dashboard.view", group: "Vận hành" },
  "don-du-bao": { label: "Đơn hàng dự báo", perm: "drafts.view", group: "Vận hành" },
  "don-hang": { label: "Vận đơn", perm: "orders.view", group: "Vận hành" },
  "bao-gia": { label: "Tra cứu giá gốc", perm: "quote.view", group: "Vận hành" },
  "bang-ke": { label: "Bảng kê", perm: "statements.view", group: "Tài chính" },
  "tao-bang-ke": { label: "Tạo bảng kê", perm: "statements.manage", group: "Tài chính" },
  "doi-soat": { label: "Đối soát thu tiền", perm: "receipts.view", group: "Tài chính" },
  "khach-hang": { label: "Khách hàng", perm: "catalog.view", group: "Danh mục" },
  "nhom-gia": { label: "Nhóm giá", perm: "catalog.view", group: "Danh mục" },
  tuyen: { label: "Tuyến vận chuyển", perm: "catalog.view", group: "Danh mục" },
  "bang-gia": { label: "Kho bảng giá", perm: "pricing.view", group: "Danh mục" },
};
const home = () => P.homeFor(me().role).slice(1);
const TAB_KEY = "skylane-tabs";
const ui = {
  tabs: (() => { try { const t = JSON.parse(localStorage.getItem(TAB_KEY) || "[]"); return Array.isArray(t) ? t.filter((k) => VIEWS[k]) : []; } catch { return []; } })(),
  scroll: {}, lastView: null,
  dash: { from: "2026-11-01", to: today() < "2026-11-01" ? "2026-11-30" : today(), cust: "", sale: "", table: false },
  orders: { q: "", status: "", cust: "", asg: "", iso2: "", page: 1, sel: new Set(), df: "sent", from: "", to: "", sort: "", dir: "asc" },
  drafts: { status: "CHO_XAC_NHAN", q: "", cust: "", sel: new Set() },
  quote: { to: "US", kg: "1,5", cbm: "", ncc: "", dv: "", date: today(), rows: [{ qty: "2", kg: "1,5", l: "30", w: "20", h: "15" }], ran: true },
  ver: null, verKind: "", verRoute: "", st: null, stNew: null, rc: null, stq: { q: "", sort: "", dir: "asc" },
};

function toast(msg, tone = "ok") {
  const el = $("#toast");
  el.innerHTML = `<div class="card fade p-3 shadow-lg" role="status" style="border-left:4px solid ${tone === "bad" ? "#dc2626" : tone === "warn" ? "#d97706" : "#059669"}">${esc(msg)}</div>`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.innerHTML = ""), 5000);
}
const dlg = $("#dlg");
function openDialog(title, body, wide = false) {
  dlg.style.width = wide ? "min(1100px,calc(100% - 24px))" : "min(720px,calc(100% - 24px))";
  dlg.innerHTML = `<div class="flex items-start justify-between gap-4 border-b line px-5 py-3"><h2 class="text-base font-semibold">${esc(title)}</h2><button class="btn g sm" data-a="close" aria-label="Đóng">✕</button></div><div class="overflow-auto p-5" style="max-height:calc(90vh - 60px)">${body}</div>`;
  if (!dlg.open) dlg.showModal();
}
const closeDialog = () => dlg.open && dlg.close();
// Đóng cửa sổ Kích thước thông tin (Xong / ✕ / Esc) → vẽ lại tổng cân & số kiện trên form
dlg.addEventListener("close", () => { if (ui.qpOpen) { ui.qpOpen = false; render(); } });

// =============================================================================
// Khung trang
// =============================================================================
function shell(content) {
  const u = me();
  const view = current();
  const groups = {};
  for (const [k, v] of Object.entries(VIEWS)) if (can(v.perm)) (groups[v.group] ||= []).push([k, v]);
  const nav = Object.entries(groups)
    .map(([g, items]) => `<p class="mt-4 mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider muted">${g}</p>${items.map(([k, v]) => `<a href="#${k}" class="${k === view ? "on" : ""}">${v.label}</a>`).join("")}`)
    .join("");
  const roleSel = `<select class="inp" data-c="role" aria-label="Đăng nhập với vai trò">${S.users.map((x) => `<option value="${x.id}" ${x.id === u.id ? "selected" : ""}>${esc(x.name)} — ${P.ROLE_LABEL[x.role]}</option>`).join("")}</select>`;
  return `<div class="flex min-h-screen">
  <aside class="side sticky top-0 h-screen w-60 shrink-0 overflow-y-auto border-r line p-3" style="background:var(--card)">
    <a href="#${home()}" class="mb-2 flex items-center gap-2 px-1"><img src="${LOGO}" alt="SkyLane Logistics" width="38" height="36"><span class="leading-tight"><b class="block text-sm tracking-wide" style="color:var(--brand)">SKYLANE</b><span class="text-[11px] tracking-[.2em] muted">LOGISTICS</span></span></a>
    <nav class="nav">${nav}</nav>
    <div class="mt-6 border-t line pt-3"><p class="mb-1 text-xs muted">Đăng nhập thử với vai trò</p>${roleSel}<p class="mt-2 text-xs muted">${esc(roleHint(u.role))}</p></div>
  </aside>
  <main class="flex-1 p-4 md:p-6" style="max-width:1440px">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style="background:var(--soft)">
      <span><b>Bản chạy thử</b> — logic thật của dự án (engine giá, import, phiên bản, bảng kê, đối soát, phân quyền) trên dữ liệu mẫu, chỉ lưu trong trình duyệt của bạn.</span>
      <span class="flex items-center gap-2"><span class="md:hidden">${roleSel}</span><select class="inp md:hidden" style="width:auto" data-c="nav">${Object.entries(VIEWS).filter(([, v]) => can(v.perm)).map(([k, v]) => `<option value="${k}" ${k === view ? "selected" : ""}>${v.label}</option>`).join("")}</select><button class="btn o sm" data-a="reset">Đặt lại dữ liệu mẫu</button></span>
    </div>
    ${tabBar(view)}
    <div class="fade">${content}</div>
  </main></div>`;
}
const MAX_TABS = 10;
const saveTabs = () => { try { localStorage.setItem(TAB_KEY, JSON.stringify(ui.tabs)); } catch {} };
function syncTabs(view) {
  ui.tabs = ui.tabs.filter((k) => VIEWS[k] && can(VIEWS[k].perm));
  if (!ui.tabs.includes(view)) ui.tabs.push(view);
  while (ui.tabs.length > MAX_TABS) ui.tabs.splice(ui.tabs.findIndex((k) => k !== view), 1);
  saveTabs();
}
function tabBar(view) {
  const many = ui.tabs.length > 1;
  return `<div class="tabs" role="tablist" aria-label="Các mục đang mở">${ui.tabs.map((k) => `<div class="tab ${k === view ? "on" : ""}" role="tab" aria-selected="${k === view}" data-tab="${k}"><a href="#${k}" title="${esc(VIEWS[k].label)}">${esc(VIEWS[k].label)}</a>${many ? `<button class="x" data-a="tab-close" data-id="${k}" title="Đóng tab" aria-label="Đóng tab ${esc(VIEWS[k].label)}">×</button>` : '<span style="width:10px"></span>'}</div>`).join("")}
  ${many ? `<button class="btn g sm ml-auto shrink-0 text-xs muted" data-a="tab-others" title="Chỉ giữ tab đang xem">Đóng tab khác</button>` : ""}</div>`;
}
function closeTab(k) {
  const view = current(), i = ui.tabs.indexOf(k);
  if (i < 0 || ui.tabs.length < 2) return;
  ui.tabs.splice(i, 1); delete ui.scroll[k]; saveTabs();
  if (k === view) location.hash = ui.tabs[Math.min(i, ui.tabs.length - 1)];
  else render();
}
const roleHint = (r) =>
  ({ ADMIN: "Toàn quyền, gồm mở khóa & sửa đơn đã khóa giá.", KE_TOAN: "Bảng kê, đối soát, công nợ; sửa/mở khóa đơn khóa giá.", KHO: "Sửa kích thước, cân, trạng thái, tuyến chỉ định. Không thấy giá.", SALE: "Chỉ xem đơn, báo giá, công nợ khách mình phụ trách." })[r];
const head = (title, desc, actions = "") =>
  `<div class="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h1 class="text-xl font-semibold">${esc(title)}</h1>${desc ? `<p class="text-sm muted">${esc(desc)}</p>` : ""}</div><div class="flex flex-wrap gap-2">${actions}</div></div>`;

function current() {
  const h = location.hash.slice(1);
  return VIEWS[h] && can(VIEWS[h].perm) ? h : home();
}

let chartRO = null;
function render() {
  const v = current();
  syncTabs(v);
  if (chartRO) { chartRO.disconnect(); chartRO = null; }
  const fn = { dashboard: vDashboard, "don-du-bao": vDrafts, "nhom-gia": vGroups, "don-hang": vOrders, "bao-gia": vQuote, "bang-ke": vStatements, "tao-bang-ke": vStatementNew, "doi-soat": vReconcile, "khach-hang": vCustomers, tuyen: vRoutes, "bang-gia": vPricing }[v];
  $("#app").innerHTML = shell(fn());
  if (v === "dashboard") drawChart();
  if (ui.lastView !== v) { window.scrollTo(0, ui.scroll[v] || 0); ui.lastView = v; }
  $(".tab.on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// =============================================================================
// TỔNG QUAN
// =============================================================================
function dashData() {
  const f = ui.dash, u = me();
  const sale = u.role === "SALE" ? u.id : f.sale;
  const party = (code) => (!f.cust || code === f.cust) && (!sale || cust(code)?.saleId === sale);
  const os = S.orders.filter((o) => party(o.customer) && pd(o) >= f.from && pd(o) <= f.to);
  const sum = (arr, k) => arr.reduce((t, o) => t + Number(o[k]), 0);
  const billed = S.statements.filter((s) => s.status === "ACTIVE" && party(s.customer)).reduce((t, s) => t + (s.total - s.paid), 0);
  const unbilled = S.orders.filter((o) => o.debt === "Chưa thanh toán" && party(o.customer)).reduce((t, o) => t + Number(o.sell), 0);
  const points = [];
  for (let d = new Date(f.from + "T00:00:00Z"); d <= new Date(f.to + "T00:00:00Z") && points.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    const x = os.filter((o) => pd(o) === k);
    points.push({ k, revenue: sum(x, "sell"), cost: sum(x, "cost"), profit: sum(x, "sell") - sum(x, "cost") });
  }
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const o of os) { const k = keyFn(o); const r = m.get(k) || { label: labelFn(o), n: 0, revenue: 0, cost: 0 }; r.n++; r.revenue += Number(o.sell); r.cost += Number(o.cost); m.set(k, r); }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  };
  return {
    os, rev: sum(os, "sell"), cost: sum(os, "cost"), weight: sum(os, "billed"), billed, unbilled, points,
    byCust: group((o) => o.customer, (o) => `${o.customer} — ${cust(o.customer)?.name}`),
    bySale: group((o) => cust(o.customer)?.saleId || "-", (o) => S.users.find((x) => x.id === cust(o.customer)?.saleId)?.name || "Chưa gán"),
  };
}
function vDashboard() {
  const f = ui.dash, u = me(), d = dashData();
  const profit = d.rev - d.cost;
  const kpi = (label, v, sub, color, strong) => `<div class="card p-4" ${strong ? 'style="border-color:var(--accent)"' : ""}><p class="flex items-center gap-1.5 text-xs muted">${color ? `<span class="inline-block size-2 rounded-full" style="background:${color}"></span>` : ""}${label}</p><p class="mt-1 text-2xl font-semibold num" style="text-align:left${strong ? ";color:var(--brand)" : ""}">${money(v)} <span class="text-sm font-normal muted">đ</span></p>${sub ? `<p class="mt-1 text-xs muted">${sub}</p>` : ""}</div>`;
  const tbl = (title, rows) => `<div><h3 class="mb-2 text-sm font-semibold">${title}</h3><div class="card scroll"><table class="t"><thead><tr><th>Tên</th><th class="num">Đơn</th><th class="num">Doanh thu</th><th class="num">Giá vốn</th><th class="num">Lợi nhuận</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.n}</td><td class="num">${money(r.revenue)}</td><td class="num muted">${money(r.cost)}</td><td class="num font-medium">${money(r.revenue - r.cost)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Không có dữ liệu.</td></tr>`}</tbody></table></div></div>`;
  return head("Tổng quan", u.role === "SALE" ? "Số liệu các khách hàng bạn phụ trách." : "Doanh thu, giá vốn, lợi nhuận theo Ngày gửi hàng; công nợ phải thu hiện tại.") + `
  <div class="card mb-4 flex flex-wrap items-end gap-3 p-3">
    <label class="f"><span>Từ ngày</span><input class="inp" type="date" value="${f.from}" data-c="dash.from"></label>
    <label class="f"><span>Đến ngày</span><input class="inp" type="date" value="${f.to}" data-c="dash.to"></label>
    <label class="f"><span>Khách hàng</span><select class="inp" data-c="dash.cust"><option value="">Tất cả</option>${scopedCustomers().map((c) => `<option value="${c.code}" ${c.code === f.cust ? "selected" : ""}>${c.code} — ${esc(c.name)}</option>`).join("")}</select></label>
    ${u.role === "SALE" ? "" : `<label class="f"><span>Nhân viên Sale</span><select class="inp" data-c="dash.sale"><option value="">Tất cả</option>${S.users.filter((x) => x.role === "SALE").map((x) => `<option value="${x.id}" ${x.id === f.sale ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`}
  </div>
  <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    ${kpi("Doanh thu", d.rev, `${d.os.length} đơn · ${kg(d.weight)} kg tính phí`, "var(--s1)")}
    ${kpi("Giá vốn", d.cost, "", "var(--s2)")}
    ${kpi("Lợi nhuận", profit, `Biên ${(d.rev ? (profit / d.rev) * 100 : 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`, "var(--s3)")}
    ${kpi("Tổng công nợ phải thu", d.billed + d.unbilled, `Đã lên bảng kê ${money(d.billed)} · Chưa lên bảng kê ${money(d.unbilled)}`, "", true)}
  </div>
  <div class="card mb-4 p-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2"><span class="text-sm font-medium">Doanh thu, giá vốn & lợi nhuận theo ngày (VND)</span>
      <span class="flex items-center gap-3 text-xs muted">${[["Doanh thu", "--s1"], ["Giá vốn", "--s2"], ["Lợi nhuận", "--s3"]].map(([n, c]) => `<span class="flex items-center gap-1.5"><span class="inline-block h-0.5 w-4" style="background:var(${c})"></span>${n}</span>`).join("")}<button class="btn g sm" data-a="dash-table">${f.table ? "Xem biểu đồ" : "Xem bảng"}</button></span></div>
    ${f.table
      ? `<div class="scroll" style="max-height:300px"><table class="t"><thead><tr><th>Ngày</th><th class="num">Doanh thu</th><th class="num">Giá vốn</th><th class="num">Lợi nhuận</th></tr></thead><tbody>${d.points.map((p) => `<tr><td>${V.viDate(p.k)}</td><td class="num">${money(p.revenue)}</td><td class="num">${money(p.cost)}</td><td class="num">${money(p.profit)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="fig" id="chart"><svg></svg><div id="tip" class="card pointer-events-none absolute hidden p-2 text-xs shadow-md" style="min-width:170px"></div></div>`}
  </div>
  <div class="grid gap-4 xl:grid-cols-2">${tbl("Theo khách hàng", d.byCust)}${u.role === "SALE" ? "" : tbl("Theo nhân viên Sale", d.bySale)}</div>`;
}
function drawChart() {
  const box = $("#chart");
  if (!box) return;
  const pts = dashData().points;
  const svg = $("svg", box), tip = $("#tip", box);
  const series = [["revenue", "Doanh thu", "var(--s1)"], ["cost", "Giá vốn", "var(--s2)"], ["profit", "Lợi nhuận", "var(--s3)"]];
  const draw = () => {
    const W = box.clientWidth, H = box.clientHeight, pl = W < 520 ? 44 : 64, pr = W < 520 ? 12 : 80, pt = 10, pb = 26;
    const vals = pts.flatMap((p) => series.map(([k]) => p[k]));
    let lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
    const raw = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(raw || 1)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (i) => pl + (pts.length < 2 ? (W - pl - pr) / 2 : (i / (pts.length - 1)) * (W - pl - pr));
    const y = (v) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
    const c = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr" : v.toLocaleString("vi-VN"));
    let g = "";
    for (let v = lo; v <= hi + step / 2; v += step) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v)}" dy=".32em" text-anchor="end" font-size="11" fill="var(--muted)">${c(v)}</text>`;
    const every = Math.max(1, Math.ceil(pts.length / (W < 520 ? 5 : 10)));
    pts.forEach((p, i) => { if (i % every === 0 || i === pts.length - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${p.k.slice(8, 10)}/${p.k.slice(5, 7)}</text>`; });
    for (const [k, , col] of series) g += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" points="${pts.map((p, i) => `${x(i)},${y(p[k])}`).join(" ")}"/>`;
    if (W >= 520 && pts.length) {
      const last = pts.length - 1, ls = series.map(([k, n]) => ({ n, y: y(pts[last][k]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 14) ls[i].y = ls[i - 1].y + 14;
      ls.forEach((l) => (g += `<text x="${W - pr + 8}" y="${l.y}" dy=".32em" font-size="11" font-weight="600" fill="var(--ink)">${l.n}</text>`));
    }
    g += `<g id="hov"></g>`;
    svg.innerHTML = g;
    box.onmousemove = (e) => {
      const r = box.getBoundingClientRect();
      const i = Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left - pl) / (W - pl - pr)) * (pts.length - 1))));
      const p = pts[i];
      $("#hov", svg).innerHTML = `<line x1="${x(i)}" x2="${x(i)}" y1="${pt}" y2="${H - pb}" stroke="var(--muted)" stroke-dasharray="3 3"/>` + series.map(([k, , col]) => `<circle cx="${x(i)}" cy="${y(p[k])}" r="4.5" fill="${col}" stroke="var(--card)" stroke-width="2"/>`).join("");
      tip.classList.remove("hidden");
      tip.innerHTML = `<b>${V.viDate(p.k)}</b>` + series.map(([k, n, col]) => `<div class="flex justify-between gap-4"><span><span class="inline-block size-2 rounded-full" style="background:${col}"></span> ${n}</span><b class="num">${money(p[k])}</b></div>`).join("");
      tip.style.left = (x(i) > W / 2 ? x(i) - tip.offsetWidth - 12 : x(i) + 12) + "px";
      tip.style.top = "8px";
    };
    box.onmouseleave = () => { tip.classList.add("hidden"); const h = $("#hov", svg); if (h) h.innerHTML = ""; };
  };
  chartRO = new ResizeObserver(draw);
  chartRO.observe(box);
}

// =============================================================================
// VẬN ĐƠN
// =============================================================================
const PAGE = 20;
const dtVi = (iso) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const dayVi = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date(iso)) : "");
const DATE_FIELDS = { sent: "Ngày gửi hàng", exported: "Thời gian xuất hàng", created: "Ngày tạo đơn" };
// Sắp xếp cột: khóa → giá trị so sánh
const O_SORT = {
  bill: (o) => o.bill, tracking: (o) => o.tracking, customer: (o) => o.customer, cname: (o) => cust(o.customer)?.name || "", route: (o) => o.route, iso2: (o) => o.iso2,
  status: (o) => STATUSES.indexOf(o.status), sent: (o) => pd(o), exported: (o) => o.exportedAt || "", pkgs: (o) => o.packages.length, actual: (o) => Number(o.actual),
  vol: (o) => Number(o.vol), billed: (o) => Number(o.billed), shipped: (o) => Number(o.shipped), sell: (o) => Number(o.sell), cost: (o) => Number(o.cost),
  profit: (o) => o.sell - o.cost, debt: (o) => o.debt,
};
/** Đơn theo bộ lọc (trừ tab trạng thái): tìm 1 mã gần đúng / nhiều mã chính xác + tra cứu thời gian + sắp xếp */
function visibleOrders() {
  const f = ui.orders, m = SL.searchMode(f.q);
  const codes = m.kind === "codes" ? new Set(m.codes) : null, term = m.kind === "like" ? m.term.toLowerCase() : "";
  const dateOf = (o) => (f.df === "exported" ? dayVi(o.exportedAt) : f.df === "created" ? dayVi(o.createdAt) : pd(o));
  const list = S.orders
    .filter((o) => inScope(o.customer))
    .filter((o) => (!f.cust || o.customer === f.cust) && (!f.asg || (o.assigned || o.route) === f.asg) && (!f.iso2 || o.iso2 === f.iso2))
    .filter((o) => (codes ? codes.has(o.bill) || codes.has(String(o.tracking || "").toUpperCase()) : !term || [o.bill, o.tracking, o.customer, cust(o.customer)?.name].some((x) => String(x || "").toLowerCase().includes(term))))
    .filter((o) => { if (!f.from && !f.to) return true; const d = dateOf(o); return !!d && (!f.from || d >= f.from) && (!f.to || d <= f.to); });
  const key = O_SORT[f.sort];
  return key
    ? list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : b.id - a.id) * (f.dir === "asc" ? 1 : -1); })
    : list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
const totalsOf = (list) => TT.sumOrders(list.map((o) => ({ packageCount: o.packages.length, actualWeight: o.actual, billedWeight: o.billed, shippedWeight: o.shipped, costAmount: o.cost, sellAmount: o.sell })));
function totalsLine(label, t, strong) {
  const m = can("orders.viewMoney"), it = (k, v, col) => `<span class="whitespace-nowrap">${k}: <b class="num" style="color:${col || "var(--ink)"}">${v}</b></span>`;
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-1 ${strong ? "font-medium" : ""}"><b>${label}:</b>${it("Số đơn", t.orders.toLocaleString("vi-VN"))}${it("Số kiện", t.packages.toLocaleString("vi-VN"))}${it("Cân thực", kg(t.actualWeight))}${it("Tính phí", kg(t.billedWeight))}${it("Xuất hàng", kg(t.shippedWeight))}${m ? it("Giá gốc", money(t.costAmount)) + it("Giá bán", money(t.sellAmount)) + it("Lợi nhuận", money(t.profit), Number(t.profit) < 0 ? "#dc2626" : "#047857") : ""}</div>`;
}
function vOrders() {
  const f = ui.orders, all = visibleOrders();
  const rows = all.filter((o) => !f.status || o.status === f.status);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  f.page = Math.min(f.page, pages);
  const page = rows.slice((f.page - 1) * PAGE, f.page * PAGE);
  const money_ = can("orders.viewMoney"), bulk = P.BULK_FIELDS_BY_ROLE[me().role].length > 0, editPk = can("orders.editPackages"), editLocked = can("orders.editLocked");
  const ov = (o, k, v) => `<span class="num ${o.overrides.includes(k) ? "font-semibold" : ""}" ${o.overrides.includes(k) ? 'style="color:#b45309" title="Ghi đè thủ công"' : ""}>${k.endsWith("amount") ? money(v) : kg(v)}${o.overrides.includes(k) ? "*" : ""}</span>`;
  const tabs = ["", ...STATUSES].map((s) => `<button class="px-3 py-2 text-sm ${f.status === s ? "font-semibold" : "muted"}" style="border-bottom:2px solid ${f.status === s ? "var(--brand)" : "transparent"}" data-a="o-tab" data-v="${s}">${s || "Tất cả"} <span class="text-xs">(${(s ? all.filter((o) => o.status === s) : all).length})</span></button>`).join("");
  const allOnPage = page.length && page.every((o) => f.sel.has(o.id));
  const th = (label, k, num, cls = "") => `<th class="${num ? "num" : ""} ${cls}"><button class="inline-flex items-center gap-1" data-a="o-sort" data-k="${k}" title="Bấm để sắp xếp A→Z / Z→A" style="${f.sort === k ? "color:var(--ink)" : ""}">${label}<span style="opacity:${f.sort === k ? 1 : 0.35}">${f.sort === k ? (f.dir === "asc" ? "↑" : "↓") : "↕"}</span></button></th>`;
  const m = SL.searchMode(f.q);
  const missing = m.kind === "codes" ? SL.missingCodes(m.codes, S.orders.filter((o) => inScope(o.customer)).flatMap((o) => [o.bill, o.tracking])) : [];
  const picked = S.orders.filter((o) => f.sel.has(o.id));
  const filtered = !!(f.q || f.from || f.to || f.status || f.cust || f.asg || f.iso2);
  const scoped = S.orders.filter((o) => inScope(o.customer));
  const qsel = (k, label, opts, w) => `<label class="f"><span>${label}</span><select class="inp" data-c="o-quick" data-k="${k}" style="width:${w}px;${f[k] ? "border-color:var(--accent);background:var(--soft)" : ""}"><option value="">Tất cả</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${f[k] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const custOpts = S.customers.filter((c) => inScope(c.code)).map((c) => [c.code, `${c.code} — ${c.name}`]);
  const asgOpts = [...new Set([...S.routes.map((r) => r.code), ...scoped.map((o) => o.assigned || o.route)])].sort().map((r) => [r, r]);
  const isoOpts = [...new Set(scoped.map((o) => o.iso2).filter(Boolean))].sort().map((c) => [c, c]);
  return head("Quản lý vận đơn", "Bấm vào mã vận đơn để xem & sửa đầy đủ. Đơn chưa khóa giá tự tính lại giá gốc, giá bán, lợi nhuận khi đổi kích thước, cân hoặc tuyến.",
    `<button class="btn o" data-a="copy-menu">Sao chép ▾</button>${bulk ? `<button class="btn o" data-a="bulk-open" ${f.sel.size ? "" : "disabled"}>Sửa đổi hàng loạt${f.sel.size ? ` (${f.sel.size})` : ""}</button>` : ""}${can("drafts.view") ? `<a class="btn o" href="#don-du-bao">Nhận đơn mới${pendingDrafts() ? ` <span class="b b-info">${pendingDrafts()}</span>` : ""}</a>` : ""}`) + `
  <div class="mb-3 flex flex-wrap border-b line">${tabs}</div>
  <div class="mb-2 flex flex-wrap items-end gap-2" id="o-quick"><span class="pb-2 text-xs font-medium muted">Lọc nhanh:</span>
    ${qsel("cust", "Mã KH — Tên khách hàng", custOpts, 230)}${qsel("asg", "Tuyến chỉ định", asgOpts, 180)}${qsel("iso2", "Điểm đến", isoOpts, 110)}${qsel("status", "Trạng thái", STATUSES.map((x) => [x, x]), 160)}
  </div>
  <div class="mb-3 flex flex-wrap items-end gap-2" id="o-filter">
    <label class="f"><span>Mã vận đơn / tracking / khách hàng — dán nhiều mã, mỗi dòng 1 mã</span><textarea class="inp" id="o-q" rows="${Math.min(6, Math.max(1, f.q.split("\n").length))}" style="width:320px;min-height:36px;font-family:ui-monospace,monospace;font-size:12px;resize:vertical" placeholder="#AP3004&#10;#AP3003&#10;MN2637">${esc(f.q)}</textarea></label>
    <label class="f"><span>Tra cứu thời gian</span><span class="flex items-center gap-1"><select class="inp" id="o-df" style="width:170px">${Object.entries(DATE_FIELDS).map(([k, v]) => `<option value="${k}" ${f.df === k ? "selected" : ""}>${v}</option>`).join("")}</select><input class="inp" type="date" id="o-from" value="${f.from}" style="width:150px" aria-label="Từ ngày"><span class="muted">–</span><input class="inp" type="date" id="o-to" value="${f.to}" style="width:150px" aria-label="Đến ngày"></span></label>
    <button class="btn o" data-a="o-search">🔍 Tìm</button>${filtered ? `<button class="btn g" data-a="o-clear">✕ Xóa lọc</button>` : ""}
  </div>
  ${missing.length ? `<div class="card mb-3 p-3 text-sm" style="border-color:#d97706;color:#b45309">Không tìm thấy ${missing.length} mã: <span style="font-family:ui-monospace,monospace">${esc(missing.join(", "))}</span></div>` : ""}
  <div class="mb-2 flex items-center gap-2 text-sm muted">${f.sel.size ? `Đã chọn <b style="color:var(--ink)">${f.sel.size}</b> <button class="btn g sm" data-a="sel-clear">Bỏ chọn</button>` : "Chuột phải vào một dòng để sao chép nhanh."}</div>
  <div class="card scroll"><table class="t"><thead><tr>
    <th class="fz fzc"><input type="checkbox" data-c="sel-page" ${allOnPage ? "checked" : ""} aria-label="Chọn cả trang"></th>
    ${th("Mã vận đơn", "bill", 0, "fz fzl fz2")}${th("Tracking", "tracking")}${th("Mã KH", "customer")}${th("Tên khách hàng", "cname")}${th("Tuyến → Chỉ định", "route")}${th("Đến", "iso2")}${th("Trạng thái", "status")}${th("Ngày gửi", "sent")}${th("Thời gian xuất hàng", "exported")}${th("Kiện", "pkgs", 1)}${th("Cân thực", "actual", 1)}${th("Quy đổi", "vol", 1)}${th("Tính phí", "billed", 1)}${th("Xuất hàng", "shipped", 1)}
    ${money_ ? th("Giá bán", "sell", 1) + th("Giá gốc", "cost", 1) + th("Lợi nhuận", "profit", 1) : ""}${th("Công nợ", "debt")}${editPk ? "<th></th>" : ""}
  </tr></thead><tbody>${page.map((o) => `<tr data-oid="${o.id}" class="${f.sel.has(o.id) ? "sel" : ""}" style="${f.sel.has(o.id) ? "background:var(--soft)" : ""}">
    <td class="fz fzc"><input type="checkbox" data-c="sel" value="${o.id}" ${f.sel.has(o.id) ? "checked" : ""} aria-label="Chọn ${esc(o.bill)}"></td>
    <td class="fz fzl fz2 whitespace-nowrap" style="min-width:130px"><button class="font-semibold" style="color:var(--accent)" data-a="od-open" data-id="${o.id}" title="Xem & sửa chi tiết">${esc(o.bill)}</button> ${o.locked ? '<span title="Đã khóa giá">🔒</span>' : ""} ${o.warn ? `<span title="${esc(o.warn)}" style="color:#d97706">⚠</span>` : ""}</td>
    <td class="whitespace-nowrap">${esc(o.tracking)}</td><td><b>${o.customer}</b></td><td style="max-width:160px" class="truncate" title="${esc(cust(o.customer)?.name)}">${esc(cust(o.customer)?.name)}</td>
    <td class="whitespace-nowrap">${esc(o.route)}<div class="text-xs" style="color:${o.assigned !== o.route ? "#b45309" : "var(--muted)"}">→ ${esc(o.assigned)}</div></td>
    <td>${o.iso2}</td><td>${badge(o.status, STATUS_TONE[o.status])}</td><td class="num">${V.viDate(pd(o))}</td><td class="num">${dtVi(o.exportedAt) || "–"}</td><td class="num">${o.packages.length}</td>
    <td>${ov(o, "actual_weight", o.actual)}</td><td>${ov(o, "volumetric_weight", o.vol)}</td><td class="font-semibold">${ov(o, "billed_weight", o.billed)}</td><td>${ov(o, "shipped_weight", o.shipped)}</td>
    ${money_ ? `<td>${ov(o, "sell_amount", o.sell)}</td><td class="muted">${ov(o, "cost_amount", o.cost)}</td><td class="num font-semibold" style="color:${o.sell - o.cost < 0 ? "#dc2626" : "#047857"}">${money(o.sell - o.cost)}</td>` : ""}
    <td>${badge(o.debt, DEBT_TONE[o.debt])}</td>
    ${editPk ? `<td><button class="btn g sm" data-a="pk-open" data-id="${o.id}" ${o.locked && !editLocked ? 'disabled title="Đơn đã khóa giá — cần Admin/Kế toán"' : 'title="Sửa nhanh kiện / kích thước / cân"'}>Kiện</button></td>` : ""}
  </tr>`).join("") || `<tr><td colspan="22" class="py-8 text-center muted">Không có vận đơn phù hợp.</td></tr>`}</tbody></table></div>
  <div class="card mt-2 grid gap-1 p-3 text-xs muted" style="background:var(--soft)">${picked.length ? totalsLine("Đã chọn", totalsOf(picked)) : ""}${totalsLine(filtered ? "Tổng theo bộ lọc" : "Tổng tất cả", totalsOf(rows), true)}</div>
  <div class="mt-3 flex items-center justify-between text-sm muted"><span>${rows.length} đơn · ⚠ = chưa tra được giá · * = ghi đè thủ công</span><span class="flex items-center gap-2"><button class="btn o sm" data-a="o-page" data-v="${f.page - 1}" ${f.page <= 1 ? "disabled" : ""}>‹</button>Trang ${f.page}/${pages}<button class="btn o sm" data-a="o-page" data-v="${f.page + 1}" ${f.page >= pages ? "disabled" : ""}>›</button></span></div>`;
}

// ---- Sao chép (menu chuột phải trên dòng / nút Sao chép)
const rowsTsv = (list) => TT.toTsv(
  ["Mã vận đơn", "Tracking", "Mã KH", "Tên khách hàng", "Tuyến", "Tuyến chỉ định", "Điểm đến", "Trạng thái", "Ngày gửi", "Thời gian xuất hàng", "Số kiện", "Cân thực", "Quy đổi", "Tính phí", "Xuất hàng", ...(can("orders.viewMoney") ? ["Giá bán", "Giá gốc", "Lợi nhuận"] : []), "Công nợ"],
  list.map((o) => [o.bill, o.tracking, o.customer, cust(o.customer)?.name, o.route, o.assigned, o.iso2, o.status, V.viDate(pd(o)), dtVi(o.exportedAt), o.packages.length, kg(o.actual), kg(o.vol), kg(o.billed), kg(o.shipped), ...(can("orders.viewMoney") ? [Math.round(o.sell), Math.round(o.cost), Math.round(o.sell - o.cost)] : []), o.debt]),
);
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`Đã sao chép ${what}.`); }
  catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); const ok = document.execCommand("copy"); t.remove(); toast(ok ? `Đã sao chép ${what}.` : "Trình duyệt chặn sao chép.", ok ? "ok" : "warn"); }
}
function openCopyMenu(x, y, rowId) {
  closeCopyMenu();
  const f = ui.orders, sel = S.orders.filter((o) => f.sel.has(o.id)), rows = visibleOrders().filter((o) => !f.status || o.status === f.status);
  const o = rowId ? S.orders.find((z) => z.id === rowId) : null;
  const item = (a, label, dis) => `<button class="block w-full rounded px-3 py-1.5 text-left text-sm ${dis ? "muted" : ""}" style="${dis ? "opacity:.45;pointer-events:none" : ""}" data-a="${a}" ${o ? `data-id="${o.id}"` : ""} onmouseover="this.style.background='var(--soft)'" onmouseout="this.style.background=''">${label}</button>`;
  const el = document.createElement("div");
  el.id = "ctx"; el.className = "card fade p-1 shadow-xl"; el.setAttribute("role", "menu");
  el.style.cssText = `position:fixed;z-index:70;width:300px;left:${Math.min(x, innerWidth - 310)}px;top:${Math.min(y, innerHeight - 260)}px`;
  el.innerHTML = (o ? item("cp-row-code", `Sao chép mã dòng này (${esc(o.bill)})`) + item("cp-row-full", "Sao chép dòng này (đầy đủ cột)") + item("od-open", "Xem / sửa chi tiết") + '<hr class="my-1 line">' : "") +
    item("cp-sel-code", `Sao chép mã các dòng đã chọn (${sel.length})`, !sel.length) + item("cp-sel-full", "Sao chép các dòng đã chọn (đầy đủ cột — dán Excel)", !sel.length) +
    item("cp-all-code", `Sao chép mã tất cả dòng (${rows.length})`, !rows.length) + (sel.length ? '<hr class="my-1 line">' + item("sel-clear", "Bỏ chọn tất cả") : "");
  document.body.append(el);
  openCopyMenu.at = Date.now();
}
const closeCopyMenu = () => $("#ctx")?.remove();
const routeOpts = (sel = "", blank = "") => (blank ? `<option value="">${blank}</option>` : "") + S.routes.map((r) => `<option value="${esc(r.code)}" ${r.code === sel ? "selected" : ""}>${esc(r.code)} (${r.service})</option>`).join("");
const pkRow = (p = {}) => `<div class="pk grid grid-cols-[1fr_1fr_1fr_1fr_40px] gap-2">${["l", "w", "h", "kg"].map((k) => `<input class="inp" inputmode="decimal" data-k="${k}" value="${esc(p[k] ? String(Number(p[k])).replace(".", ",") : "")}" placeholder="${k === "kg" ? "kg" : "cm"}" aria-label="${k}">`).join("")}<button class="btn g sm" data-a="pk-del" aria-label="Xóa kiện">✕</button></div>`;
const pkHead = `<div class="grid grid-cols-[1fr_1fr_1fr_1fr_40px] gap-2 text-xs muted"><span>Dài (cm)</span><span>Rộng (cm)</span><span>Cao (cm)</span><span>Cân thực (kg)</span><span></span></div>`;
function readPkgs(root) {
  const out = [];
  for (const r of $$(".pk", root)) {
    const v = Object.fromEntries($$("input", r).map((i) => [i.dataset.k, i.value.trim()]));
    if (!v.l && !v.w && !v.h && !v.kg) continue;
    const p = {};
    for (const k of ["l", "w", "h", "kg"]) {
      const n = IX.parseNumberCell(v[k] || "0", "weight");
      if (n === undefined || n === null) throw new Error(`Giá trị "${v[k]}" không hợp lệ.`);
      p[k] = n;
    }
    out.push(p);
  }
  return out;
}
// ---- Cửa sổ chi tiết / sửa 1 vận đơn (bấm vào mã vận đơn) — dùng parseOrderEdit + phân quyền theo trường của dự án
const OD_MAP = {
  customerCode: "customer", billCode: "bill", trackingNumber: "tracking", routeCode: "route", assignedRouteCode: "assigned", destinationIso2: "iso2", shippedAt: "shippedAt", status: "status", exportedAt: "exportedAt",
  receiverName: "receiver", receiverAddress: "rAddress", receiverCity: "rCity", receiverState: "rState", receiverPostalCode: "rPostal", receiverPhone: "rPhone", receiverEmail: "rEmail",
  hsCode: "hs", goodsDescription: "goodsVi", goodsNameEn: "goodsEn", declaredValueUsd: "declared", note: "note",
};
const fmtK = (v) => (v ? RF.formatThousands(String(Math.round(Number(v)))) : "");
function odDialog(o) {
  const role = me().role, lockedOut = o.locked && !can("orders.editLocked");
  const ok = (f) => !lockedOut && ED.ORDER_EDIT_FIELDS_BY_ROLE[role].includes(f);
  const L = ED.ORDER_EDIT_LABEL, nm = (f) => (ok(f) ? `name="${f}"` : "disabled");
  const T = (f, val, extra = "") => `<label class="f"><span>${L[f]}</span><input class="inp" ${nm(f)} value="${esc(val ?? "")}" ${extra}></label>`;
  const sel = (f, opts) => `<label class="f"><span>${L[f]}</span><select class="inp" ${nm(f)}>${opts}</select></label>`;
  const sellOv = o.overrides.includes("sell_amount"), costOv = o.overrides.includes("cost_amount");
  const unitAuto = TT.unitPrice(o.sell, o.billed);
  const sec = (title, body, cols = 3) => `<fieldset class="grid gap-3 sm:grid-cols-${cols}"><legend class="mb-2 text-sm font-semibold">${title}</legend>${body}</fieldset>`;
  openDialog(`Vận đơn ${o.bill} — ${o.customer} · ${cust(o.customer)?.name}`, `<form id="f-od" class="grid gap-5" data-id="${o.id}" onsubmit="return false">
    <div class="flex flex-wrap items-center gap-2 text-sm">${badge(o.status, STATUS_TONE[o.status])}${badge(o.debt, DEBT_TONE[o.debt])}${o.locked ? badge("🔒 Đã khóa giá", "warn") : ""}<span class="muted">Tạo lúc ${dtVi(o.createdAt)}</span></div>
    ${lockedOut ? `<div class="card p-3 text-sm" style="border-color:#d97706;color:#b45309">Đơn đã khóa giá — chỉ Admin hoặc Kế toán được sửa. Bạn đang xem ở chế độ chỉ đọc.</div>` : !ED.ORDER_EDIT_FIELDS_BY_ROLE[role].length ? `<div class="card p-3 text-sm muted">Vai trò của bạn chỉ được xem vận đơn.</div>` : ""}
    ${sec("Thông tin vận đơn",
      sel("customerCode", S.customers.map((c) => `<option value="${c.code}" ${c.code === o.customer ? "selected" : ""}>${c.code} — ${esc(c.name)}</option>`).join("")) +
      T("billCode", o.bill, 'style="text-transform:uppercase"') + T("trackingNumber", o.tracking) +
      sel("routeCode", routeOpts(o.route)) + sel("assignedRouteCode", routeOpts(o.assigned === o.route ? "" : o.assigned, "Như tuyến vận chuyển")) +
      T("destinationIso2", o.iso2, 'maxlength="2" style="text-transform:uppercase"') +
      T("shippedAt", ED.isoToLocal(o.shippedAt || o.createdAt), 'type="datetime-local" title="Ngày dùng để tra bảng giá (mặc định = ngày tạo đơn)"') +
      sel("status", STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")) +
      T("exportedAt", ED.isoToLocal(o.exportedAt), 'type="datetime-local" title="Tự ghi khi chuyển sang Đã xuất hàng"'))}
    ${sec("Người nhận", T("receiverName", o.receiver) + T("receiverPhone", o.rPhone) + T("receiverEmail", o.rEmail, 'type="email"') + `<div class="sm:col-span-3">${T("receiverAddress", o.rAddress)}</div>` + T("receiverCity", o.rCity) + T("receiverState", o.rState) + T("receiverPostalCode", o.rPostal))}
    ${sec("Hải quan", T("hsCode", o.hs) + T("goodsDescription", o.goodsVi) + T("goodsNameEn", o.goodsEn) + T("declaredValueUsd", o.declared ? String(Number(o.declared)).replace(".", ",") : "", 'inputmode="decimal"'), 4)}
    <fieldset class="grid gap-2"><legend class="mb-2 text-sm font-semibold">Kiện hàng — kích thước & cân</legend>${pkHead}<div id="pks" class="grid gap-2">${(o.packages.length ? o.packages : [{}]).map(pkRow).join("")}</div>
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm">${ok("packages") ? `<button type="button" class="btn o sm" data-a="pk-add">+ Thêm kiện</button>` : "<span></span>"}<span class="muted">Cân thực <b style="color:var(--ink)">${kg(o.actual)}</b> · Quy đổi <b style="color:var(--ink)">${kg(o.vol)}</b> · Tính phí <b style="color:var(--ink)">${kg(o.billed)}</b> · Xuất hàng <b style="color:var(--ink)">${kg(o.shipped)}</b> kg</span></div></fieldset>
    ${can("orders.viewMoney") ? sec("Giá (VND) — để trống = tự tính theo bảng giá",
      `<label class="f"><span>${L.sellAmount}</span><input class="inp num" ${nm("sellAmount")} data-c="od-sell" inputmode="numeric" value="${sellOv ? fmtK(o.sell) : ""}" placeholder="${money(o.sell)}"><span class="text-xs" style="color:${sellOv ? "#b45309" : "var(--muted)"}">${sellOv ? "Ghi đè thủ công" : `Tự tính: ${money(o.sell)}${o.sellScope ? ` · ${RS.SCOPE_LABEL[o.sellScope]}` : ""}`}</span></label>
       <label class="f"><span>Đơn giá bán (VND/kg)</span><input class="inp num" data-c="od-unit" inputmode="numeric" ${ok("sellAmount") && Number(o.billed) > 0 ? "" : "disabled"} value="${sellOv && unitAuto ? fmtK(unitAuto) : ""}" placeholder="${unitAuto ? money(unitAuto) : "—"}"><span class="text-xs muted">= giá bán ÷ ${kg(o.billed)} kg tính phí</span></label>
       <label class="f"><span>${L.costAmount}</span><input class="inp num" ${nm("costAmount")} data-c="fmt" inputmode="numeric" value="${costOv ? fmtK(o.cost) : ""}" placeholder="${money(o.cost)}"><span class="text-xs" style="color:${costOv ? "#b45309" : "var(--muted)"}">${costOv ? "Ghi đè thủ công" : `Tự tính: ${money(o.cost)}`}</span></label>
       <div class="f"><span class="text-xs font-medium muted">Lợi nhuận</span><div class="inp num flex items-center justify-end font-semibold" style="color:${o.sell - o.cost < 0 ? "#dc2626" : "#047857"}">${money(o.sell - o.cost)}</div>${(sellOv || costOv) && ok("sellAmount") ? `<button type="button" class="text-left text-xs" style="color:var(--accent)" data-a="od-auto">↺ Bỏ ghi đè, tự tính lại</button>` : ""}</div>`, 4) : ""}
    <label class="f"><span>${L.note}</span><textarea class="inp" rows="2" ${nm("note")}>${esc(o.note)}</textarea></label>
    <div class="flex justify-end gap-2 border-t line pt-3"><button type="button" class="btn o" data-a="close">Đóng</button>${!lockedOut && ED.ORDER_EDIT_FIELDS_BY_ROLE[role].length ? `<button type="button" class="btn" data-a="od-save">Lưu thay đổi</button>` : ""}</div>
  </form>`, true);
  if (!ok("packages")) $$("#pks input, #pks button").forEach((i) => (i.disabled = true));
  $("#f-od").dataset.rv = o.rowVersion || 1;
}
function odSave() {
  const box = $("#f-od"), o = S.orders.find((x) => x.id === Number(box.dataset.id)), role = me().role;
  const form = { id: String(o.id), rowVersion: box.dataset.rv };
  for (const el of $$("[name]", box)) form[el.name] = el.value;
  if (ED.ORDER_EDIT_FIELDS_BY_ROLE[role].includes("packages") && !(o.locked && !can("orders.editLocked"))) {
    let pk; try { pk = readPkgs(box); } catch (e) { return toast(e.message, "bad"); }
    form.packages = JSON.stringify(pk.map((p) => ({ lengthCm: p.l, widthCm: p.w, heightCm: p.h, actualWeight: p.kg })));
  }
  const r = ED.parseOrderEdit(form, role);
  if (!r.ok) return toast(r.fieldErrors ? `${r.error} ${Object.entries(r.fieldErrors).map(([k, v]) => `${ED.ORDER_EDIT_LABEL[k] || k}: ${v}`).join("; ")}` : r.error, "bad");
  const p = r.plan;
  if (Number(p.rowVersion) !== (o.rowVersion || 1)) return toast("Đơn vừa được cập nhật ở nơi khác — đóng cửa sổ và mở lại.", "bad");
  if (o.locked && !can("orders.editLocked")) return toast("Đơn đã khóa giá — chỉ Admin hoặc Kế toán được sửa.", "bad");
  const nc = p.set.customerCode ?? o.customer, nb = p.set.billCode ?? o.bill;
  if (nc !== o.customer && o.debt !== "Chưa thanh toán") return toast("Đơn đã lên bảng kê — không đổi được khách hàng. Hủy bảng kê trước nếu cần.", "bad");
  if ((nc !== o.customer || nb !== o.bill) && S.orders.some((x) => x !== o && x.customer === nc && x.bill === nb)) return toast(`Trùng order_key ${nc}|${nb} — mã vận đơn đã tồn tại với khách hàng này.`, "bad");
  const prevStatus = o.status;
  for (const [f, v] of Object.entries(p.set)) o[OD_MAP[f]] = v ?? "";
  if ("assignedRouteCode" in p.set && !p.set.assignedRouteCode) o.assigned = o.route;
  if ("shippedAt" in p.set) o.shippedAt = p.set.shippedAt;
  if ("exportedAt" in p.set) o.exportedAt = p.set.exportedAt;
  o.exportedAt = ED.exportedAtOnStatus(prevStatus, o.status, o.exportedAt || null, new Date().toISOString());
  if (p.packages) o.packages = p.packages.map((k) => ({ l: k.lengthCm, w: k.widthCm, h: k.heightCm, kg: k.actualWeight }));
  for (const [f, key, col] of [["sellAmount", "sell_amount", "sell"], ["costAmount", "cost_amount", "cost"]]) {
    if (p[f] === undefined) continue;
    if (p[f] === null) o.overrides = o.overrides.filter((x) => x !== key);
    else { o[col] = p[f]; if (!o.overrides.includes(key)) o.overrides.push(key); }
  }
  o.rowVersion = (o.rowVersion || 1) + 1;
  const before = { sell: o.sell, billed: o.billed };
  if (p.affectsPricing) reprice(S, o);
  save(); closeDialog(); render();
  toast(`Đã lưu vận đơn ${o.bill}${p.affectsPricing && !o.locked ? `; tính phí ${kg(before.billed)} → ${kg(o.billed)} kg${can("orders.viewMoney") ? `, giá bán ${money(before.sell)} → ${money(o.sell)}` : ""}` : ""}${o.warn ? " — ⚠ " + o.warn : ""}.`, o.warn ? "warn" : "ok");
}

function createDialog() {
  openDialog("Nhập tay đơn nội bộ → Đơn hàng dự báo", `<form id="f-create" class="grid gap-4">
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="f"><span>Khách hàng *</span><select class="inp" name="customer">${S.customers.map((c) => `<option value="${c.code}">${c.code} — ${esc(c.name)}</option>`).join("")}</select></label>
      <label class="f"><span>Mã vận đơn *</span><input class="inp" name="bill" required></label>
      <label class="f"><span>Tracking</span><input class="inp" name="tracking"></label>
      <label class="f"><span>Tuyến vận chuyển * (giá bán)</span><select class="inp" name="route">${routeOpts("VNFZZXR")}</select></label>
      <label class="f"><span>Tuyến chỉ định (giá gốc)</span><select class="inp" name="assigned">${routeOpts("", "Như tuyến vận chuyển")}</select></label>
      <label class="f"><span>Điểm đến (ISO2) *</span><input class="inp uppercase" name="iso2" maxlength="2" value="US"></label>
      <label class="f"><span>Ngày gửi hàng</span><input class="inp" type="date" name="shipped" value="${today()}"></label>
    </div>
    <fieldset class="grid gap-3 sm:grid-cols-3"><legend class="mb-1 text-sm font-semibold">Người nhận</legend>
      <label class="f"><span>Tên người nhận</span><input class="inp" name="receiver"></label>
      <label class="f"><span>Số điện thoại</span><input class="inp" name="rPhone" inputmode="tel"></label>
      <label class="f"><span>Email</span><input class="inp" name="rEmail" type="email"></label>
      <label class="f sm:col-span-3"><span>Địa chỉ</span><input class="inp" name="rAddress"></label>
      <label class="f"><span>Thành phố</span><input class="inp" name="rCity"></label>
      <label class="f"><span>Bang / tỉnh</span><input class="inp" name="rState"></label>
      <label class="f"><span>Mã bưu chính</span><input class="inp" name="rPostal"></label>
    </fieldset>
    <fieldset class="grid gap-3 sm:grid-cols-4"><legend class="mb-1 text-sm font-semibold">Hàng hóa (khai báo hải quan)</legend>
      <label class="f"><span>Tên hàng tiếng Việt</span><input class="inp" name="goodsVi"></label>
      <label class="f"><span>Tên hàng tiếng Anh</span><input class="inp" name="goodsEn"></label>
      <label class="f"><span>Mã HS</span><input class="inp" name="hs"></label>
      <label class="f"><span>Giá trị khai báo (USD)</span><input class="inp" name="declared" inputmode="decimal"></label>
    </fieldset>
    <fieldset class="card grid gap-2 p-3"><legend class="px-1 text-sm font-medium">Kiện hàng</legend>${pkHead}<div id="pks" class="grid gap-2">${pkRow({ l: "30", w: "20", h: "15", kg: "0.8" })}</div><div><button type="button" class="btn o sm" data-a="pk-add">+ Thêm kiện</button></div></fieldset>
    <label class="f"><span>Ghi chú</span><textarea class="inp" name="note" rows="2"></textarea></label>
    <div class="flex justify-end gap-2"><button type="button" class="btn o" data-a="close">Hủy</button><button class="btn" data-a="create-save" type="button">Thêm vào chờ xác nhận</button></div></form>`, true);
}
function bulkDialog() {
  const allowed = P.BULK_FIELDS_BY_ROLE[me().role];
  const F = {
    assignedRouteCode: ["Tuyến chỉ định", `<select class="inp" name="assignedRouteCode">${routeOpts("", "Như tuyến vận chuyển")}</select>`, "Chỉ đổi cân xuất & giá gốc"],
    routeCode: ["Tuyến vận chuyển", `<select class="inp" name="routeCode">${routeOpts()}</select>`, "Đổi cân tính phí & giá bán"],
    destinationIso2: ["Điểm đến (ISO2)", `<input class="inp uppercase" name="destinationIso2" maxlength="2" placeholder="US">`, ""],
    status: ["Trạng thái", `<select class="inp" name="status">${STATUSES.map((s) => `<option>${s}</option>`).join("")}</select>`, ""],
    actualWeight: ["Trọng lượng thực", `<input class="inp" name="actualWeight" placeholder="kg">`, "Để trống = bỏ ghi đè"],
    volumetricWeight: ["Trọng lượng quy đổi", `<input class="inp" name="volumetricWeight" placeholder="kg">`, "Để trống = bỏ ghi đè"],
    billedWeight: ["Trọng lượng tính phí", `<input class="inp" name="billedWeight" placeholder="kg">`, "Giá bán tính theo cân này"],
    shippedWeight: ["Trọng lượng xuất hàng", `<input class="inp" name="shippedWeight" placeholder="kg">`, "Giá gốc tính theo cân này"],
    trackingNumber: ["Tracking", `<input class="inp" name="trackingNumber">`, ""],
    note: ["Ghi chú", `<input class="inp" name="note">`, ""],
    priceLocked: ["Khóa giá", `<select class="inp" name="priceLocked"><option value="true">Khóa giá</option><option value="false">Mở khóa (tính lại ngay)</option></select>`, ""],
  };
  openDialog(`Sửa đổi hàng loạt — ${ui.orders.sel.size} đơn`, `<form id="f-bulk" class="grid gap-3">
    <p class="text-sm muted">Chỉ trường được tick mới được cập nhật. Gõ vào ô sẽ tự tick.${can("orders.editLocked") ? "" : " Đơn đã khóa giá sẽ bị bỏ qua."}</p>
    <div class="card divide-y" style="--tw-divide-opacity:1">${allowed.map((k) => `<div class="grid grid-cols-[22px_170px_1fr] items-start gap-3 p-2" data-c="bulk-row"><input type="checkbox" name="enable_${k}" class="mt-2 size-4" id="en_${k}"><label for="en_${k}" class="mt-2 text-sm font-medium">${F[k][0]}</label><div>${F[k][1]}${F[k][2] ? `<p class="mt-1 text-xs muted">${F[k][2]}</p>` : ""}</div></div>`).join("")}</div>
    <div class="flex justify-end gap-2"><button type="button" class="btn o" data-a="close">Hủy</button><button type="button" class="btn" data-a="bulk-save">Cập nhật</button></div></form>`);
}
function applyBulk() {
  const fd = new FormData($("#f-bulk"));
  const fields = P.BULK_FIELDS_BY_ROLE[me().role].filter((k) => fd.get("enable_" + k) === "on");
  if (!fields.length) return toast("Tick chọn ít nhất một trường.", "warn");
  const W = { actualWeight: ["actual_weight", "actual"], volumetricWeight: ["volumetric_weight", "vol"], billedWeight: ["billed_weight", "billed"], shippedWeight: ["shipped_weight", "shipped"] };
  const val = (k) => String(fd.get(k) ?? "").trim();
  if (fields.includes("destinationIso2") && !/^[A-Za-z]{2}$/.test(val("destinationIso2"))) return toast("Điểm đến phải là mã ISO2.", "bad");
  for (const k of Object.keys(W)) if (fields.includes(k) && val(k) && !IX.parseNumberCell(val(k), "weight")) return toast(`${k}: cân nặng không hợp lệ.`, "bad");
  const affects = fields.some((f) => !["status", "trackingNumber", "note"].includes(f) && !(f === "priceLocked" && val(f) === "true"));
  let done = 0, skipped = 0, failed = 0;
  const cat = catalogOf(S);
  for (const id of ui.orders.sel) {
    const o = S.orders.find((x) => x.id === id);
    if (!o) continue;
    if (o.locked && !can("orders.editLocked")) { skipped++; continue; }
    for (const f of fields) {
      if (f === "routeCode") o.route = val(f);
      else if (f === "assignedRouteCode") o.assigned = val(f) || (fields.includes("routeCode") ? val("routeCode") : o.route);
      else if (f === "destinationIso2") o.iso2 = val(f).toUpperCase();
      else if (f === "status") { const prev = o.status; o.status = val(f); o.exportedAt = ED.exportedAtOnStatus(prev, o.status, o.exportedAt || null, new Date().toISOString()); }
      else if (f === "trackingNumber") o.tracking = val(f);
      else if (f === "note") o.note = val(f);
      else if (f === "priceLocked") o.locked = val(f) === "true";
      else {
        const [key, col] = W[f];
        if (!val(f)) o.overrides = o.overrides.filter((x) => x !== key);
        else { o[col] = IX.parseNumberCell(val(f), "weight"); if (!o.overrides.includes(key)) o.overrides.push(key); }
      }
    }
    if (affects) reprice(S, o, cat);
    if (o.warn) failed++;
    done++;
  }
  ui.orders.sel.clear();
  save(); closeDialog(); render();
  toast(`Đã cập nhật ${done} đơn${affects ? " và tính lại giá các đơn chưa khóa" : ""}${skipped ? `; bỏ qua ${skipped} đơn đã khóa giá` : ""}${failed ? `; ${failed} đơn chưa tra được giá (⚠)` : ""}.`, skipped || failed ? "warn" : "ok");
}

// ---- Import đơn: dán từ Excel / Google Sheet
function parseTsv(t) {
  const rows = []; let row = [], cur = "", q = false;
  t = t.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"' && cur === "") q = true;
    else if (ch === "\t") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((v) => (v.trim() === "" ? null : v)));
}
const ORDER_SAMPLE = [
  ["Thời gian phát sinh đơn", "STT", "Mã vận đơn", "Tuyến vận chuyển", "Giá trị khai báo", "Tên hàng tiếng Việt", "Người nhận", "Điểm đến", "Số kiện", "Trọng lượng thực tế(kg)", "Dài ", "Rộng", "Cao"],
  ["25/11/2026 09:12:00", "1", "#AP2001", "VNFZZXR", "20", "Quần áo", "David Lee", "us", "1", "0,786", "34", "23", "11"],
  ["25/11/2026 09:30:41", "2", "#AP2002", "VN-YTYCPREC", "15", "Áo", "Emma Stone", "US", "1", "1,25", "30", "20", "10"],
  ["25/11/2026 10:02:10", "3", "#AP2003", "UPS HAN S5500", "40", "Giày", "Liam Smith", "CA", "2", "7,5", "40", "30", "25"],
  ["25/11/2026 10:15:00", "4", "#AP1376", "VNFZZXR", "20", "Quần áo", "David Lee", "US", "1", "0,5", "20", "15", "10"],
  ["25/11/2026 10:20:00", "5", "#AP2004", "VNFZZXR", "20", "Mũ", "Ava Taylor", "USA", "1", "0,3", "20", "15", "10"],
  ["25/11/2026 10:21:00", "6", "#AP2001", "VNFZZXR", "20", "Quần áo", "David Lee", "US", "1", "0,786", "34", "23", "11"],
].map((r) => r.join("\t")).join("\n");
// ---- Mẫu nhập đơn cho khách: file Excel riêng, link mẫu Google Sheet, lưu link khách gửi lại
function templateDialog(code) {
  const list = scopedCustomers(), c = list.find((x) => x.code === code) || list[0];
  S.settings = S.settings || {};
  const copyLink = OT.googleSheetCopyLink(S.settings.masterSheet);
  const msg = OT.templateMessage({ customerCode: c.code, customerName: c.name, copyLink, sheetLink: c.sheet || null });
  openDialog("Mẫu nhập đơn cho khách", `<div class="grid gap-4" id="f-tpl">
    <label class="f"><span>Khách hàng</span><select class="inp" data-c="tpl-cust">${list.map((x) => `<option value="${x.code}" ${x.code === c.code ? "selected" : ""}>${x.code} — ${esc(x.name)}${x.sheet ? " (đã có link)" : ""}</option>`).join("")}</select></label>
    <section class="card grid gap-2 p-4"><b class="text-sm">1. File Excel mẫu cho khách</b><p class="text-sm muted">Đúng cột tab DON, có danh sách tuyến thả xuống; ghi sẵn mã khách nên khi khách gửi lại (hoặc tải từ Google Sheet: Tệp → Tải xuống → Excel) bấm Import Excel là hệ thống tự nhận đúng khách.</p>
      <div><button class="btn o sm" data-a="tpl-xlsx" data-id="${c.code}">⬇ ${esc(OT.orderTemplateFilename(c.code, c.name))}</button></div></section>
    <section class="card grid gap-2 p-4"><b class="text-sm">2. Link mẫu Google Sheet</b>
      <label class="f"><span>Google Sheet mẫu gốc của SkyLane (thiết lập 1 lần)</span><span class="flex gap-2"><input class="inp" id="tpl-master" value="${esc(S.settings.masterSheet || "")}" placeholder="https://docs.google.com/spreadsheets/d/…"><button class="btn o sm" data-a="tpl-master">Lưu</button></span>
      <span class="text-xs muted">Tạo một lần: tải file mẫu ở bước 1 → tải lên Google Drive → Mở bằng Google Trang tính → Chia sẻ “Bất kỳ ai có đường liên kết — Người xem” → dán link vào đây.</span></label>
      ${copyLink ? `<label class="f"><span>Link gửi khách — khách bấm là tạo ngay bản sao mẫu nhập đơn của mình</span><span class="flex gap-2"><input class="inp" readonly value="${esc(copyLink)}" style="font-family:ui-monospace,monospace;font-size:12px"><button class="btn o sm" data-a="tpl-copy" data-v="${esc(copyLink)}">Sao chép</button></span></label>` : ""}
      <label class="f"><span>Tin nhắn gửi khách (Zalo / email)</span><textarea class="inp" rows="5" readonly style="font-size:12px">${esc(msg)}</textarea></label>
      <div><button class="btn o sm" data-a="tpl-copy" data-v="${esc(msg)}">Sao chép tin nhắn</button></div></section>
    <section class="card grid gap-2 p-4"><b class="text-sm">3. Link Google Sheet của khách (nguồn đồng bộ)</b>
      <div class="grid gap-2 sm:grid-cols-[1fr_110px]"><label class="f"><span>Link khách gửi lại</span><input class="inp" id="tpl-url" value="${esc(c.sheet || "")}" placeholder="https://docs.google.com/spreadsheets/d/…"></label><label class="f"><span>Tab</span><input class="inp" id="tpl-tab" value="DON"></label></div>
      <div class="flex justify-end gap-2"><button class="btn o" data-a="close">Đóng</button><button class="btn" data-a="tpl-save" data-id="${c.code}">Lưu link cho khách</button></div></section>
  </div>`, true);
}
async function downloadOrderTemplate(code) {
  if (!window.ExcelJS) return toast("Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.", "bad");
  const c = cust(code), wb = new ExcelJS.Workbook();
  OT.layoutOrderTemplate(wb, { customerCode: c.code, customerName: c.name, routes: S.routes.filter((r) => r.active !== false).map((r) => r.code) });
  const name = OT.orderTemplateFilename(c.code, c.name);
  if (await saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name)) toast(`Đã tải ${name} — gửi cho khách điền rồi Import Excel.`);
}
function importDialog() {
  openDialog("Import đơn từ file Excel (mẫu SKL116)", `<div class="grid gap-3">
    <p class="text-sm muted">Chọn file <b>.xlsx</b> theo mẫu cột tab DON của file SKL116 (Thời gian phát sinh đơn, Mã vận đơn, Tuyến vận chuyển, … Dài, Rộng, Cao) — hoặc copy vùng dữ liệu rồi dán vào ô dưới. Cột nhận theo tên tiêu đề. Đơn hợp lệ vào <b>Đơn hàng dự báo</b> chờ xác nhận; đơn trùng order_key bị chặn.</p>
    <label class="f"><span>File Excel (.xlsx)</span><input type="file" class="inp" accept=".xlsx,.xls,.csv" data-c="imp-file" style="padding-top:6px"></label>
    <div class="grid gap-3 sm:grid-cols-[1fr_auto]"><label class="f"><span>Khách hàng mặc định (khi không có cột Mã khách hàng)</span><select class="inp" id="imp-cust">${S.customers.map((c) => `<option value="${c.code}">${c.code} — ${esc(c.name)}</option>`).join("")}</select></label><div class="flex items-end"><button class="btn o" data-a="imp-sample">Dán dữ liệu mẫu (tab DON)</button></div></div>
    <textarea class="inp" id="imp-text" data-c="imp-text" rows="8" placeholder="Dán dữ liệu ở đây…" style="font-family:ui-monospace,monospace;font-size:12px"></textarea>
    <div class="flex gap-2"><button class="btn o" data-a="imp-check">Kiểm tra dữ liệu</button><button class="btn" data-a="imp-commit" id="imp-commit" disabled>Đưa vào chờ xác nhận</button></div>
    <div id="imp-out"></div></div>`, true);
}
function readImportFile(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") return toast("Không tải được thư viện đọc Excel — hãy dán dữ liệu thay thế.", "bad");
  const r = new FileReader();
  r.onload = () => {
    try {
      const wb = XLSX.read(r.result, { type: "array" });
      // File mẫu SkyLane cấp cho khách (kể cả tải từ Google Sheet): mã khách ghi ở sheet "Hướng dẫn" → tự chọn khách
      const tplCust = OT.detectTemplateCustomer(wb.SheetNames.map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }).slice(0, 12) })), file.name);
      if (tplCust && S.customers.some((c) => c.code === tplCust)) { $("#imp-cust").value = tplCust; toast(`File mẫu nhập đơn của khách ${tplCust} — đã tự chọn khách hàng.`); }
      else if (tplCust) toast(`File mẫu của khách ${tplCust} nhưng chưa có khách này trong Danh mục.`, "warn");
      const ws = wb.Sheets[wb.SheetNames.find((n) => n.trim().toUpperCase() === "DON") || wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      $("#imp-text").value = rows.map((row) => row.map((v) => (v === null ? "" : String(v).replace(/\t|\n/g, " "))).join("\t")).join("\n");
      ui.impRows = rows; // giữ nguyên kiểu số / ngày Excel để đọc chính xác
      ui.impLabel = `${file.name} · ${wb.SheetNames.includes("DON") ? "DON" : wb.SheetNames[0]}`;
      A["imp-check"]();
    } catch { toast("Không đọc được file Excel.", "bad"); }
  };
  r.readAsArrayBuffer(file);
}
function analyzeImport() {
  const rows = ui.impRows || parseTsv($("#imp-text").value);
  const res = IP.parseOrderSheet(rows, { defaultCustomerCode: $("#imp-cust").value });
  const keys = usedKeys();
  const valid = [], dupDb = [], errors = [...res.errors];
  for (const d of res.drafts) {
    const bad = [];
    if (!cust(d.customerCode)) bad.push(`khách hàng ${d.customerCode} chưa có`);
    if (!S.routes.some((r) => r.code === d.routeCode)) bad.push(`tuyến ${d.routeCode} chưa có`);
    if (bad.length) errors.push({ row: d.rows[0], billCode: d.billCode, message: bad.join("; ") });
    else if (keys.has(d.orderKey)) dupDb.push(d.orderKey);
    else valid.push(d);
  }
  return { res, valid, dupDb, errors };
}


// =============================================================================
// ĐƠN HÀNG DỰ BÁO
// =============================================================================
const DRAFT_TABS = [["CHO_XAC_NHAN", "Chờ xác nhận"], ["DA_XAC_NHAN", "Đã xác nhận"], ["DA_LOAI", "Đã loại"]];
const SRC = { SYNC: ["Google Sheet", "ok"], IMPORT: ["Excel", "info"], MANUAL: ["Nhập tay", "muted"] };
function vDrafts() {
  const f = ui.drafts, manage = can("drafts.manage"), q = f.q.trim().toLowerCase();
  const scoped = S.drafts.filter((x) => inScope(x.d.customerCode) && (!f.cust || x.d.customerCode === f.cust) && (!q || [x.d.billCode, x.d.customerCode, cust(x.d.customerCode)?.name].some((v) => String(v || "").toLowerCase().includes(q))));
  const rows = scoped.filter((x) => x.status === f.status).sort((a, b) => ((a.d.createdAt || a.at) < (b.d.createdAt || b.at) ? 1 : -1));
  const selectable = manage && f.status !== "DA_XAC_NHAN";
  for (const id of [...f.sel]) if (!rows.some((r) => r.id === id)) f.sel.delete(id);
  const all = rows.length && rows.every((r) => f.sel.has(r.id));
  const tabs = DRAFT_TABS.map(([k, l]) => `<button class="px-3 py-2 text-sm ${f.status === k ? "font-semibold" : "muted"}" style="border-bottom:2px solid ${f.status === k ? "var(--brand)" : "transparent"}" data-a="dr-tab" data-v="${k}">${l} <span class="text-xs">(${scoped.filter((x) => x.status === k).length})</span></button>`).join("");
  const bar = selectable && f.sel.size ? `<div class="card mb-3 flex flex-wrap items-center justify-between gap-2 p-3" style="position:sticky;top:0;z-index:5"><span>Đã chọn <b>${f.sel.size}</b> đơn <button class="btn g sm" data-a="dr-clear">Bỏ chọn</button></span><span class="flex gap-2">${f.status === "CHO_XAC_NHAN" ? `<button class="btn o" data-a="dr-reject">Loại</button><button class="btn" data-a="dr-confirm">Xác nhận ${f.sel.size} đơn → Vận đơn</button>` : `<button class="btn o" data-a="dr-restore">Đưa về chờ xác nhận</button>`}</span></div>` : "";
  return head("Đơn hàng dự báo", "Đơn khách nhập trên Google Sheet, file Excel hoặc nhập tay nội bộ vào đây trước. Kiểm tra, chọn đơn rồi bấm Xác nhận để chuyển sang Vận đơn.",
    manage ? `<button class="btn o" data-a="tpl-open">🔗 Mẫu nhập đơn cho khách</button><button class="btn o" data-a="sync-open">⟳ Đồng bộ Google Sheet</button><button class="btn o" data-a="imp-open">Import Excel</button><button class="btn" data-a="create-open">+ Nhập tay</button>` : "") + `
  <div class="mb-3 flex flex-wrap border-b line">${tabs}</div>
  <div class="mb-3 flex flex-wrap items-center gap-2"><select class="inp" style="width:220px" data-c="dr-cust"><option value="">Tất cả khách hàng</option>${scopedCustomers().map((c) => `<option value="${c.code}" ${c.code === f.cust ? "selected" : ""}>${c.code} — ${esc(c.name)}</option>`).join("")}</select><input class="inp" style="max-width:320px" placeholder="Tìm mã vận đơn, mã/tên khách hàng" value="${esc(f.q)}" data-c="dr-q"></div>
  ${bar}
  <div class="card scroll"><table class="t"><thead><tr>${selectable ? `<th class="fz fzc"><input type="checkbox" data-c="dr-all" ${all ? "checked" : ""} aria-label="Chọn tất cả"></th>` : ""}<th class="fz fzl ${selectable ? "fz2" : ""}">Mã vận đơn</th><th>Khách hàng</th><th>Tuyến</th><th>Đến</th><th>Người nhận</th><th class="num">Kiện</th><th class="num">Cân thực</th><th>Nguồn</th><th>Phát sinh</th>${f.status === "CHO_XAC_NHAN" ? "" : `<th>${f.status === "DA_LOAI" ? "Đã loại lúc" : "Xác nhận lúc"}</th>`}</tr></thead><tbody>
  ${rows.map((x) => { const d = x.d; const w = d.packages.reduce((t, p) => t + Number(p.actualWeight), 0); return `<tr class="${f.sel.has(x.id) ? "sel" : ""}" style="${f.sel.has(x.id) ? "background:var(--soft)" : ""}">${selectable ? `<td class="fz fzc"><input type="checkbox" data-c="dr-sel" value="${x.id}" ${f.sel.has(x.id) ? "checked" : ""} aria-label="Chọn ${esc(d.billCode)}"></td>` : ""}
    <td class="fz fzl ${selectable ? "fz2" : ""}" style="min-width:120px"><b>${esc(d.billCode)}</b>${d.trackingNumber ? `<div class="text-xs muted">${esc(d.trackingNumber)}</div>` : ""}</td><td><b>${d.customerCode}</b><div class="text-xs muted">${esc(cust(d.customerCode)?.name)}</div></td>
    <td class="whitespace-nowrap">${esc(d.routeCode)}${d.assignedRouteCode && d.assignedRouteCode !== d.routeCode ? `<div class="text-xs" style="color:#b45309">→ ${esc(d.assignedRouteCode)}</div>` : ""}</td><td>${d.destinationIso2}</td>
    <td>${esc(d.receiverName || "–")}${d.goodsDescription ? `<div class="text-xs muted">${esc(d.goodsDescription)}</div>` : ""}</td><td class="num">${d.packages.length}</td><td class="num">${kg(w)}</td>
    <td><span title="${esc(x.label)}">${badge(...SRC[x.source])}</span></td><td class="num">${dtVi(d.createdAt || x.at)}</td>
    ${f.status === "CHO_XAC_NHAN" ? "" : `<td class="num">${dtVi(x.decidedAt)}${x.reason ? `<div class="text-xs muted">${esc(x.reason)}</div>` : ""}</td>`}</tr>`; }).join("") || `<tr><td colspan="12" class="py-8 text-center muted">${f.status === "CHO_XAC_NHAN" ? "Không có đơn chờ xác nhận. Bấm “Đồng bộ Google Sheet” để lấy đơn khách vừa nhập." : "Không có đơn."}</td></tr>`}
  </tbody></table></div>
  <p class="mt-2 text-xs muted">Đơn đã xác nhận hoặc đã loại không bị đồng bộ lại. Bản chạy thử mô phỏng mỗi khách có Google Sheet riêng: mỗi lần bấm đồng bộ, khách đó được coi là vừa nhập thêm vài đơn (có 1 dòng sai mã nước “USA” để minh họa kiểm tra lỗi).</p>`;
}

// =============================================================================
// TRA CỨU GIÁ GỐC
// =============================================================================
const qpFilled = (r) => !!(r.kg.trim() || r.l.trim() || r.w.trim() || r.h.trim());
function runQuote() {
  const q = ui.quote;
  const { input, error } = QI.parseQuoteInput({ to: q.to, kg: q.kg, cbm: q.cbm, ncc: q.ncc, dv: q.dv, date: q.date, p: q.rows.filter(qpFilled).map(QI.encodePackageRow) }, today());
  if (error || !input) return { error: error || "Nhập điểm đến và trọng lượng." };
  const rows = [], na = [];
  for (const r of S.routes) {
    if (input.supplierCode && (r.supplier || "").toUpperCase() !== input.supplierCode) continue;
    if (input.serviceType && r.service !== input.serviceType) continue;
    const sel = E.selectVersion(S.versions, { routeCode: r.code, kind: "COST", date: input.date });
    if (!sel || !sel.version.zones.some((z) => z.countries.includes(input.iso2))) continue;
    const route = { routeCode: r.code, serviceType: r.service, weightCalcMode: r.mode, dimDivisor: r.dim };
    try {
      const bill = E.calcBillWeight(input.packages, route);
      const qv = E.quoteVersion(sel.version, input.iso2, bill.totalWeight);
      rows.push({ r, bill, qv, v: sel.version, vol: QI.sumDecimal(bill.packages.map((p) => p.volumetricWeight)) });
    } catch (e) { na.push([r.code, e.message]); }
  }
  rows.sort((a, b) => Number(a.qv.amount) - Number(b.qv.amount));
  return { rows, na, input };
}
// Tổng tạm tính trong cửa sổ Kích thước thông tin
function qpTotals() {
  let pieces = 0, kgSum = 0, cbm = 0;
  for (const r of ui.quote.rows.filter(qpFilled)) {
    const n = r.qty.trim() === "" ? 1 : Number(r.qty);
    if (!Number.isInteger(n) || n < 1) continue;
    pieces += n;
    kgSum += Number(IX.parseNumberCell(r.kg, "weight") || 0) * n;
    const d = [r.l, r.w, r.h].map((x) => Number(IX.parseNumberCell(x, "weight") || 0));
    if (d.every((x) => x > 0)) cbm += (d[0] * d[1] * d[2] * n) / 1e6;
  }
  const f = (v, dec) => (v ? Number(v.toFixed(dec)).toLocaleString("vi-VN", { maximumFractionDigits: dec }) : "");
  return { pieces, kg: f(kgSum, 3), cbm: f(cbm, 4) };
}
const QP_COLS = [["qty", "Số kiện"], ["kg", "Cân/kiện (kg)"], ["l", "Dài (cm)"], ["w", "Rộng (cm)"], ["h", "Cao (cm)"]];
function qpDialog() {
  const rows = ui.quote.rows.length ? ui.quote.rows : (ui.quote.rows = [QI.emptyPackageRow()]);
  const t = qpTotals();
  ui.qpOpen = true;
  openDialog("Kích thước thông tin", `<p class="mb-3 text-xs muted">Mỗi dòng là một nhóm kiện giống nhau. Có thể dán nhiều dòng từ Excel (Số kiện · Cân · Dài · Rộng · Cao). Enter ở dòng cuối để thêm dòng.</p>
  <div class="scroll"><table class="t"><thead><tr><th style="width:44px">STT</th><th style="width:44px;text-align:center"><button class="btn sm" style="padding:0 7px;background:#059669" data-a="qp-add" aria-label="Thêm dòng">+</button></th>${QP_COLS.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>
  ${rows.map((r, i) => `<tr><td class="muted">${i + 1}</td><td style="text-align:center"><button class="btn sm" style="padding:0 8px;background:#ef4444" data-a="qp-del" data-i="${i}" aria-label="Xóa dòng ${i + 1}">−</button></td>${QP_COLS.map(([k, l]) => `<td><input class="inp" style="min-width:70px" data-qp="${i}:${k}" value="${esc(r[k])}" inputmode="decimal" aria-label="Dòng ${i + 1} ${l}"></td>`).join("")}</tr>`).join("")}
  </tbody></table></div>
  <div class="mt-4 flex flex-wrap items-center justify-between gap-3"><p class="text-sm" id="qp-total"><b>${t.pieces} kiện</b> <span class="muted">· tổng cân thực ${t.kg || 0} kg${t.cbm ? ` · ${t.cbm} m³` : ""}</span></p>
  <span class="flex gap-2"><button class="btn o" data-a="qp-clear">Xóa hết</button><button class="btn" data-a="qp-done">Xong</button></span></div>`);
}
function qpRefreshTotal() {
  const t = qpTotals(), el = $("#qp-total");
  if (el) el.innerHTML = `<b>${t.pieces} kiện</b> <span class="muted">· tổng cân thực ${t.kg || 0} kg${t.cbm ? ` · ${t.cbm} m³` : ""}</span>`;
}
const qpReopen = (focus) => { qpDialog(); if (focus) $(`[data-qp="${focus}"]`)?.focus(); };
function vQuote() {
  const q = ui.quote, res = q.ran ? runQuote() : null;
  const multi = q.rows.some(qpFilled), t = qpTotals();
  const sups = [...new Set(S.routes.map((r) => r.supplier).filter(Boolean))].sort();
  const inp = (k, label, ph, extra = "") => `<label class="f"><span>${label}</span><input class="inp" data-q="${k}" value="${esc(q[k])}" placeholder="${ph}" ${extra}></label>`;
  const ro = (label, v, title) => `<label class="f"><span>${label}</span><input class="inp" value="${esc(v)}" readonly style="background:var(--soft)" title="${title}"></label>`;
  const sel = (k, label, opts) => `<label class="f"><span>${label}</span><select class="inp" data-q="${k}"><option value="">Tất cả</option>${opts.map((o) => `<option ${o === q[k] ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  const inpt = res && !res.error ? res.input : null;
  const ft = inpt ? [inpt.supplierCode && `NCC ${inpt.supplierCode}`, inpt.serviceType && `dịch vụ ${inpt.serviceType}`].filter(Boolean).join(", ") : "";
  return head("Tra cứu báo giá tuyến gốc", "So sánh giá gốc NCC của mọi tuyến; mỗi tuyến tự áp DIM, cách tính cân và quy tắc làm tròn riêng.") + `
  <div class="card mb-4 grid items-end gap-3 p-4 sm:grid-cols-3 lg:grid-cols-[100px_130px_130px_auto_150px_110px_150px_auto]">
    ${inp("to", "Điểm đến (ISO2)", "US", 'maxlength="2"')}
    ${multi ? ro("Trọng lượng (kg)", t.kg, "Tổng cân thực các kiện") : inp("kg", "Trọng lượng (kg)", "1,5")}
    ${multi ? ro("Thể tích (CBM)", t.cbm, "Tổng thể tích các kiện có kích thước") : inp("cbm", "Thể tích (CBM)", "m³")}
    <button class="btn o" data-a="qp-open" ${multi ? 'style="border-color:var(--accent);color:var(--accent)"' : ""}>📦 Kích thước thông tin${multi ? ` (${t.pieces} kiện)` : ""}</button>
    ${sel("ncc", "Nhà cung cấp", sups)}${sel("dv", "Dịch vụ", QI.QUOTE_SERVICE_TYPES)}
    <label class="f"><span>Ngày áp giá</span><input class="inp" type="date" data-q="date" value="${q.date}"></label>
    <button class="btn" data-a="quote-run">Tra cứu</button>
  </div>
  ${!res ? "" : res.error ? `<div class="card p-3" style="color:#dc2626">${esc(res.error)}</div>` : `
  <p class="mb-2 text-sm"><b>${res.rows.length} tuyến phù hợp</b> <span class="muted">→ ${inpt.iso2} · ${inpt.pieces} kiện · ${kg(inpt.totalActual)} kg${inpt.totalCbm ? ` · ${Number(inpt.totalCbm).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³` : ""} · áp giá ngày ${V.viDate(inpt.date)}${ft ? ` · lọc ${ft}` : ""}</span></p>
  <div class="card scroll"><table class="t"><thead><tr><th>#</th><th>Tuyến</th><th>Dịch vụ</th><th class="num">Cân tính phí</th><th class="num">Đơn giá/kg</th><th class="num" style="background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--brand)">Tổng tiền (VND)</th><th class="num">DIM</th><th>Hiệu lực bảng giá</th></tr></thead><tbody>
  ${res.rows.map((x, i) => `<tr ${i === 0 ? 'style="background:color-mix(in srgb,#10b981 10%,transparent)"' : ""}><td class="muted">${i + 1}</td><td><b>${esc(x.r.code)}</b><div class="text-xs muted">NCC: ${esc(x.r.supplier)}</div></td><td>${badge(x.r.service, "info")}</td>
    <td class="num"><b>${kg(x.bill.totalWeight)} kg</b>${x.r.mode === "MAX_ACTUAL_VOL" && Number(x.vol) ? `<div class="text-xs muted">quy đổi ${kg(x.vol)}</div>` : ""}</td>
    <td class="num">${x.qv.unitPrice ? money(x.qv.unitPrice) : '<span class="text-xs muted">Trọn mốc</span>'}</td>
    <td class="num text-base font-semibold" style="background:color-mix(in srgb,var(--accent) 7%,transparent);color:var(--brand)">${money(x.qv.amount)} ${i === 0 ? badge("Rẻ nhất", "ok") : ""}</td>
    <td class="num">${x.r.mode === "ACTUAL_ONLY" ? badge("Cân thực", "warn") : Number(x.r.dim).toLocaleString("vi-VN")}</td>
    <td class="num">${V.viDate(x.v.effectiveFrom)} → ${V.viDate(x.v.effectiveTo)}</td></tr>`).join("") || `<tr><td colspan="8" class="py-6 text-center muted">Không có tuyến nào${ft ? ` (${ft})` : ""} có bảng giá gốc tới ${inpt.iso2}.</td></tr>`}
  </tbody></table></div>
  ${res.na.length ? `<details class="mt-2 text-sm"><summary class="cursor-pointer muted">${res.na.length} tuyến không phục vụ mức cân này</summary><ul class="mt-1 list-disc pl-5 text-xs muted">${res.na.map(([c, m]) => `<li><b>${esc(c)}</b>: ${esc(m)}</li>`).join("")}</ul></details>` : ""}`}
  <p class="mt-3 text-xs muted">Thử: bấm “Kích thước thông tin” để thêm/bớt kiện; lọc theo NCC hoặc dịch vụ; đổi ngày áp giá về 15/10/2026 để thấy VNFZZXR dùng bảng giá tháng 10.</p>`;
}

// =============================================================================
// KHO BẢNG GIÁ
// =============================================================================
const scopeLabel = (v) => (v.customerCode ? `KH ${v.customerCode}` : v.priceGroupCode ? `Nhóm ${v.priceGroupCode}` : "Chung");
const MODE_LABEL = { MA_TRAN: "Ma trận", THEO_KG: "Theo kg", "MA_TRAN+THEO_KG": "Ma trận + Theo kg" };
const VSTATUS = { ACTIVE: ["Đang áp dụng", "ok"], DRAFT: ["Nháp", "muted"], ARCHIVED: ["Lưu trữ", "warn"] };
function vPricing() {
  if (ui.ver) return vVersion(S.versions.find((v) => v.id === ui.ver));
  const list = S.versions.filter((v) => (!ui.verKind || v.kind === ui.verKind) && (!ui.verRoute || v.routeCode === ui.verRoute)).sort((a, b) => a.routeCode.localeCompare(b.routeCode) || a.kind.localeCompare(b.kind) || (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return head("Kho bảng giá", "Mỗi lần nhập tạo phiên bản theo ngày hiệu lực; phiên bản cũ giữ nguyên để tính đúng đơn quá khứ.", `<button class="btn o" data-a="pimp-template">⬇ File Excel mẫu</button>${can("pricing.manage") ? `<button class="btn" data-a="pimp-open">Import bảng giá (Excel)</button>` : ""}`) + `
  <div class="mb-3 flex flex-wrap gap-2"><select class="inp" style="width:220px" data-c="ver-route"><option value="">Tất cả tuyến</option>${S.routes.map((r) => `<option ${r.code === ui.verRoute ? "selected" : ""}>${esc(r.code)}</option>`).join("")}</select><select class="inp" style="width:160px" data-c="ver-kind"><option value="">Giá gốc & bán</option><option value="COST" ${ui.verKind === "COST" ? "selected" : ""}>Giá gốc</option><option value="SELL" ${ui.verKind === "SELL" ? "selected" : ""}>Giá bán</option></select></div>
  <div class="card scroll"><table class="t"><thead><tr><th>#</th><th>Tuyến</th><th>Loại</th><th>Phạm vi</th><th>Chế độ</th><th>Hiệu lực</th><th class="num">Vùng / Nước</th><th>Trạng thái</th></tr></thead><tbody>
  ${list.map((v) => `<tr class="cursor-pointer" data-a="ver-open" data-id="${v.id}"><td style="color:var(--accent)">${v.id}</td><td><b>${esc(v.routeCode)}</b></td><td>${badge(v.kind === "COST" ? "Giá gốc" : "Giá bán", v.kind === "COST" ? "warn" : "info")}</td><td>${scopeLabel(v)}</td><td>${MODE_LABEL[v.mode]}</td><td class="num">${V.viDate(v.effectiveFrom)} → ${V.viDate(v.effectiveTo)}</td><td class="num">${v.zones.length} / ${v.zones.reduce((t, z) => t + z.countries.length, 0)}</td><td>${badge(...VSTATUS[v.status || "ACTIVE"])}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function vVersion(v) {
  const weights = [...new Set(v.zones.flatMap((z) => z.matrix.map((t) => Number(t.weightMax))))].sort((a, b) => a - b);
  const ranges = [...new Map(v.zones.flatMap((z) => z.perKg).map((t) => [`${t.weightMin}|${t.weightMax}`, t])).values()].sort((a, b) => a.weightMin - b.weightMin);
  const hist = S.versions.filter((x) => x.routeCode === v.routeCode && x.kind === v.kind && x.customerCode === v.customerCode && x.priceGroupCode === v.priceGroupCode).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  const st = v.status || "ACTIVE";
  return `<button class="btn g sm mb-2" data-a="ver-back">‹ Kho bảng giá</button>` + head(`#${v.id} · ${v.routeCode}`, v.name, can("pricing.manage") ? `<button class="btn o" data-a="ver-toggle" data-id="${v.id}">${st === "ACTIVE" ? "Lưu trữ" : "Kích hoạt"}</button>` : "") + `
  <div class="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]"><div class="card grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
    <div><p class="text-xs muted">Loại</p>${v.kind === "COST" ? "Giá gốc" : "Giá bán"}</div><div><p class="text-xs muted">Phạm vi</p>${scopeLabel(v)}</div><div><p class="text-xs muted">Chế độ</p>${MODE_LABEL[v.mode]}</div><div><p class="text-xs muted">Trạng thái</p>${badge(...VSTATUS[st])}</div>
    <div><p class="text-xs muted">Hiệu lực từ</p>${V.viDate(v.effectiveFrom)}</div><div><p class="text-xs muted">Đến</p>${v.effectiveTo ? V.viDate(v.effectiveTo) : "Không thời hạn"}</div><div class="col-span-2"><p class="text-xs muted">Ghi chú</p>${esc(v.note)}</div></div>
    <div class="card p-4 text-sm"><p class="mb-2 font-medium">Lịch sử phiên bản</p>${hist.map((h) => `<div class="flex justify-between gap-2 py-0.5"><a href="#bang-gia" data-a="ver-open" data-id="${h.id}" style="color:${h.id === v.id ? "var(--ink)" : "var(--accent)"};font-weight:${h.id === v.id ? 600 : 400}">#${h.id} · ${V.viDate(h.effectiveFrom)} → ${V.viDate(h.effectiveTo)}</a>${badge(...VSTATUS[h.status || "ACTIVE"])}</div>`).join("")}</div></div>
  <div class="mb-3 flex flex-wrap gap-2">${v.zones.map((z) => `<span class="card px-3 py-1.5 text-sm"><b>${z.zoneCode}</b> <span class="muted">${z.countries.join(", ")}</span></span>`).join("")}</div>
  ${weights.length ? `<h3 class="mb-2 font-semibold">Ma trận — giá trọn mốc (VND)</h3><div class="card scroll mb-4" style="max-height:420px"><table class="t"><thead><tr><th>Mốc ≤ kg</th>${v.zones.map((z) => `<th class="num">${z.zoneCode}<div class="font-normal">${z.countries.slice(0, 3).join(", ")}${z.countries.length > 3 ? "…" : ""}</div></th>`).join("")}</tr></thead><tbody>${weights.map((w) => `<tr><td class="num" style="text-align:left"><b>${kg(w)}</b></td>${v.zones.map((z) => { const t = z.matrix.find((m) => Number(m.weightMax) === w); return `<td class="num">${t ? money(t.price) : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
  ${ranges.length ? `<h3 class="mb-2 font-semibold">Theo kg — đơn giá/kg (VND)</h3><div class="card scroll"><table class="t"><thead><tr><th>Khoảng cân</th>${v.zones.map((z) => `<th class="num">${z.zoneCode}</th>`).join("")}</tr></thead><tbody>${ranges.map((r) => `<tr><td>&gt; ${kg(r.weightMin) === "–" ? "0" : kg(r.weightMin)} ${r.weightMax ? "– " + kg(r.weightMax) : "trở lên"} kg</td>${v.zones.map((z) => { const t = z.perKg.find((p) => p.weightMin === r.weightMin && p.weightMax === r.weightMax); return `<td class="num">${t ? money(t.unitPrice) : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>` : ""}`;
}
function priceSample() {
  const fz = S.versions.find((v) => v.routeCode === "VNFZZXR" && v.kind === "COST" && !v.effectiveTo);
  const ups = S.versions.find((v) => v.routeCode === "UPS HAN S5500" && v.kind === "COST");
  const up = (p) => String(Math.round((Number(p) * 1.05) / 1000) * 1000).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const ws = ["0,10", "0,20", "0,50", "1,00", "2,00", "5,00", "10,00", "20,00"];
  const fzPrice = (zi, w) => up(fz.zones[zi].matrix.find((m) => Number(m.weightMax) === Number(w.replace(",", "."))).price);
  const upsPrice = (zi, w) => { const t = ups.zones[zi].matrix.find((m) => Number(m.weightMax) === Number(w.replace(",", "."))); return t ? up(t.price) : "-"; };
  const rows = [
    ["VNFZZXR", "", "", "", "UPS HAN S5500", "", ""],
    ["Khối lượng (KG)", "US – Mỹ (VND)", "GB – Anh (VND)", "DE – Đức (VND)", "Khối lượng (KG)", "US – Mỹ (VND)", "CA – Canada (VND)"],
    ...ws.map((w) => [w, fzPrice(0, w), fzPrice(1, w), fzPrice(2, w), w === "0,10" || w === "0,20" ? "" : w, w === "0,10" || w === "0,20" ? "" : upsPrice(0, w), w === "0,10" || w === "0,20" ? "" : upsPrice(1, w)]),
    ["", "", "", "", "21-44", up(ups.zones[0].perKg[0].unitPrice), up(ups.zones[1].perKg[0].unitPrice)],
    ["", "", "", "", "45-99", up(ups.zones[0].perKg[1].unitPrice), up(ups.zones[1].perKg[1].unitPrice)],
    ["", "", "", "", "100+", up(ups.zones[0].perKg[2].unitPrice), up(ups.zones[1].perKg[2].unitPrice)],
    ["", "", "", "", "300+", up(ups.zones[0].perKg[3].unitPrice), up(ups.zones[1].perKg[3].unitPrice)],
  ];
  return rows.map((r) => r.join("\t")).join("\n");
}
const scopeOptions = (type, sel) => (type === "CUSTOMER" ? S.customers.map((c) => [c.code, `${c.code} — ${c.name}`]) : S.groups.map((g) => [g.code, `${g.code} — ${g.name} (${GT.pctLabel(g.adjust)})`]))
  .map(([v, l]) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
const piScope = () => {
  const kind = $("#pi-kind").value, type = kind === "SELL" ? $("#pi-scope").value : "DEFAULT";
  return type === "DEFAULT" ? { type } : { type, code: $("#pi-scode").value };
};
const scopeText = (sc) => (sc.type === "GROUP" ? `Nhóm ${sc.code}` : sc.type === "CUSTOMER" ? `Khách ${sc.code}` : "Chung");
function priceImportDialog(preset) {
  ui.piSheets = null;
  openDialog("Import bảng giá từ file Excel", `<div class="grid gap-3">
    <div class="card grid gap-2 p-3 text-sm" style="background:var(--soft)"><b>Định dạng file (ma trận ngang)</b>
      <span>• Dòng 1: tên tuyến, gộp ô theo cụm cột của tuyến (trùng mã tuyến trong Danh mục). • Dòng 2: “Khối lượng (KG)” rồi các cột nước, mã ISO2 đứng đầu: “US – Mỹ (VND)”.</span>
      <span>• Mốc số (0,1 … 20) = giá trọn mốc (Ma trận). Nhãn 21-44, 45-99, 100+, 300+ = đơn giá/kg (Theo kg). Ô trống hoặc “-” = không phục vụ.</span>
      <span><button class="btn o sm" data-a="pimp-template">⬇ Tải file Excel mẫu (2 tuyến ví dụ + hướng dẫn)</button></span></div>
    <div class="grid gap-3 sm:grid-cols-3"><label class="f"><span>Loại bảng giá</span><select class="inp" id="pi-kind" data-c="pi-kind"><option value="COST" ${preset ? "" : "selected"}>Giá gốc (nhà cung cấp)</option><option value="SELL" ${preset ? "selected" : ""}>Giá bán (khách hàng)</option></select></label>
    <label class="f"><span>Ngày hiệu lực *</span><input class="inp" type="date" id="pi-date" value="${today() > "2026-12-01" ? today() : "2026-12-01"}"></label>
    <label class="f"><span>File Excel (.xlsx) *</span><input class="inp" type="file" accept=".xlsx,.xls,.csv" data-c="pi-file" style="padding-top:6px"></label></div>
    <div id="pi-scope-box" class="card grid gap-3 p-3 sm:grid-cols-2" style="${preset ? "" : "display:none"}">
      <label class="f"><span>Phạm vi áp dụng</span><select class="inp" id="pi-scope" data-c="pi-scope"><option value="DEFAULT">Bảng giá chung</option><option value="GROUP" ${preset?.type === "GROUP" ? "selected" : ""}>Theo nhóm giá</option><option value="CUSTOMER" ${preset?.type === "CUSTOMER" ? "selected" : ""}>Riêng một khách hàng</option></select></label>
      <label class="f" id="pi-scode-box" style="${preset ? "" : "display:none"}"><span id="pi-scode-label">${preset?.type === "CUSTOMER" ? "Khách hàng *" : "Nhóm giá *"}</span><select class="inp" id="pi-scode">${scopeOptions(preset?.type || "GROUP", preset?.code)}</select></label>
      <p class="text-xs muted sm:col-span-2">Giá bán theo nhóm: thay giá chung × % cho các tuyến có trong file (nhóm không cộng % trên bảng riêng). Riêng khách: ưu tiên cao nhất, không áp % nào.</p>
    </div>
    <details class="text-sm"><summary class="cursor-pointer muted">Hoặc dán dữ liệu copy từ Excel</summary><div class="mt-2 grid gap-2"><div><button class="btn o sm" data-a="pimp-sample">Dán bảng giá mẫu (+5%)</button></div><textarea class="inp" id="pi-text" rows="7" style="font-family:ui-monospace,monospace;font-size:12px" placeholder="Dán bảng giá ở đây…"></textarea></div></details>
    <p class="text-xs muted" id="pi-src"></p>
    <div class="flex gap-2"><button class="btn o" data-a="pimp-check">Xem trước</button><button class="btn" id="pi-commit" data-a="pimp-commit" disabled>Xác nhận nhập</button></div><div id="pi-out"></div></div>`, true);
}
/** Đọc file Excel bảng giá (mọi sheet) → lưới ô cho bộ đọc import-excel của dự án */
function readPriceFile(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") return toast("Không tải được thư viện đọc Excel — hãy dán dữ liệu thay thế.", "bad");
  const r = new FileReader();
  r.onload = () => {
    try {
      const wb = XLSX.read(r.result, { type: "array" });
      ui.piSheets = wb.SheetNames.filter((n) => !/hướng dẫn|huong dan|guide/i.test(n)).map((n) => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
      $("#pi-src").textContent = `Đã đọc ${file.name}: ${ui.piSheets.map((x) => `sheet “${x.name}” (${x.rows.length} dòng)`).join(", ")}.`;
      A["pimp-check"]();
    } catch { toast("Không đọc được file Excel.", "bad"); }
  };
  r.readAsArrayBuffer(file);
}
/** Tải file Excel mẫu — tạo từ lib/pricing/template.ts (cùng file mẫu với web thật) */
async function downloadPriceTemplate() {
  if (!window.ExcelJS) return toast("Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.", "bad");
  const wb = new ExcelJS.Workbook();
  PT.layoutPriceTemplate(wb);
  if (await saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), PT.PRICE_TEMPLATE_FILENAME)) toast(`Đã tải ${PT.PRICE_TEMPLATE_FILENAME} — điền giá rồi bấm Import bảng giá.`);
}
function analyzePrice() {
  const kind = $("#pi-kind").value, from = $("#pi-date").value, scope = piScope();
  const parsed = IX.parsePriceWorkbook(ui.piSheets || [{ name: "Dữ liệu dán", rows: parseTsv($("#pi-text").value) }]);
  const blocks = parsed.blocks.map((b) => {
    const exists = S.routes.some((r) => r.code === b.routeCode);
    const active = S.versions.filter((v) => v.routeCode === b.routeCode && v.kind === kind && (v.status || "ACTIVE") === "ACTIVE" && (v.customerCode || null) === (scope.type === "CUSTOMER" ? scope.code : null) && (v.priceGroupCode || null) === (scope.type === "GROUP" ? scope.code : null));
    return { b, exists, plan: exists ? V.planNewVersion(active.map((v) => ({ id: v.id, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo })), from) : null };
  });
  const errors = [...parsed.errors, ...blocks.filter((x) => !x.exists).map((x) => `Tuyến ${x.b.routeCode} chưa có trong Danh mục.`), ...blocks.filter((x) => x.plan && !x.plan.ok).map((x) => `${x.b.routeCode}: ${x.plan.error}`)];
  if (scope.type !== "DEFAULT" && !scope.code) errors.push("Chọn nhóm giá / khách hàng cho phạm vi áp dụng.");
  return { kind, from, scope, blocks, errors };
}

// =============================================================================
// BẢNG KÊ
// =============================================================================
const ST_SORT = { no: (s) => s.no, name: (s) => s.name, customer: (s) => s.customer, issued: (s) => s.issuedAt, n: (s) => s.items.length, total: (s) => s.total, paid: (s) => s.paid, bal: (s) => s.total - s.paid, debt: (s) => s.debt, status: (s) => s.status };
function vStatements() {
  if (ui.st) return vStatement(S.statements.find((s) => s.id === ui.st));
  const f = ui.stq, m = SL.searchMode(f.q);
  const codes = m.kind === "codes" ? new Set(m.codes) : null, term = m.kind === "like" ? m.term.toLowerCase() : "";
  let list = S.statements.filter((s) => inScope(s.customer)).filter((s) =>
    codes ? codes.has(s.no) || s.items.some((i) => codes.has(i.bill)) : !term || [s.no, s.name].some((x) => x.toLowerCase().includes(term)) || s.items.some((i) => i.bill.toLowerCase().includes(term)));
  const key = ST_SORT[f.sort];
  list = key ? list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * (f.dir === "asc" ? 1 : -1); }) : list.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  const missing = codes ? SL.missingCodes(m.codes, S.statements.filter((s) => inScope(s.customer)).flatMap((s) => [s.no, ...s.items.map((i) => i.bill)])) : [];
  const th = (label, k, num) => `<th class="${num ? "num" : ""}"><button class="inline-flex items-center gap-1" data-a="st-sort" data-k="${k}" title="Bấm để sắp xếp A→Z / Z→A" style="${f.sort === k ? "color:var(--ink)" : ""}">${label}<span style="opacity:${f.sort === k ? 1 : 0.35}">${f.sort === k ? (f.dir === "asc" ? "↑" : "↓") : "↕"}</span></button></th>`;
  return head("Bảng kê thanh toán", "Tạo từ đơn chưa lên bảng kê; đơn được khóa cứng giá. Mã SKLddMMyyXXXX. Tải Excel (.xlsx) đúng mẫu SkyLane.", can("statements.manage") ? `<a class="btn" href="#tao-bang-ke">+ Tạo bảng kê</a>` : "") + `
  <div class="mb-3 flex flex-wrap items-end gap-2"><label class="f"><span>Mã bảng kê / mã vận đơn — dán nhiều mã, mỗi dòng 1 mã</span><textarea class="inp" id="st-q" rows="${Math.min(6, Math.max(1, f.q.split("\n").length))}" style="width:320px;min-height:36px;font-family:ui-monospace,monospace;font-size:12px;resize:vertical" placeholder="SKL2611120001&#10;#AP1376">${esc(f.q)}</textarea></label><button class="btn o" data-a="st-search">🔍 Tìm</button>${f.q ? `<button class="btn g" data-a="st-qclear">✕ Xóa lọc</button>` : ""}</div>
  ${missing.length ? `<div class="card mb-3 p-3 text-sm" style="border-color:#d97706;color:#b45309">Không tìm thấy ${missing.length} mã: <span style="font-family:ui-monospace,monospace">${esc(missing.join(", "))}</span></div>` : ""}
  <div class="card scroll"><table class="t"><thead><tr>${th("Mã bảng kê", "no")}${th("Tên bảng kê", "name")}${th("Khách hàng", "customer")}${th("Ngày tạo", "issued")}${th("Số đơn", "n", 1)}${th("Tổng tiền", "total", 1)}${th("Đã thu", "paid", 1)}${th("Còn nợ", "bal", 1)}${th("Công nợ", "debt")}${th("Trạng thái", "status")}<th>Excel</th></tr></thead><tbody>
  ${list.map((s) => `<tr class="cursor-pointer" data-a="st-open" data-id="${s.id}"><td style="color:var(--accent)"><b>${s.no}</b></td><td>${esc(s.name)}</td><td>${s.customer}</td><td class="num">${V.viDate(s.issuedAt.slice(0, 10))}</td><td class="num">${s.items.length}</td><td class="num font-semibold">${money(s.total)}</td><td class="num muted">${money(s.paid)}</td><td class="num">${money(s.total - s.paid)}</td><td>${badge(s.debt, DEBT_TONE[s.debt])}</td><td>${s.status === "ACTIVE" ? badge("Đang hiệu lực", "ok") : badge("Đã hủy", "bad")}</td><td><button class="btn g sm" data-a="st-xlsx" data-id="${s.id}" title="Tải Excel (.xlsx)">⬇ .xlsx</button></td></tr>`).join("") || `<tr><td colspan="11" class="py-6 text-center muted">${f.q ? "Không có bảng kê phù hợp." : "Chưa có bảng kê."}</td></tr>`}
  </tbody></table></div>`;
}
const b64bytes = (dataUrl) => Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
/** Tải file: trong artifact claude.ai dùng capability "downloads" (người xem xác nhận); mở file HTML riêng thì tải trực tiếp */
async function saveBlob(blob, name) {
  const dl = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); return true; }
    catch (e) { toast(e?.code === "declined" ? "Đã hủy tải file." : `Không tải được file (${e?.message || e?.code || "lỗi"}).`, e?.code === "declined" ? "warn" : "bad"); return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
/** Tải bảng kê .xlsx — cùng bố cục với web thật (lib/statements/excel-layout.ts): logo + QR MSB */
async function downloadStatementXlsx(s) {
  if (!window.ExcelJS) return toast("Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.", "bad");
  const c = cust(s.customer);
  const images = { logo: { buffer: b64bytes(LOGO), extension: "png" } };
  if (s.status === "ACTIVE") {
    try { const q = qrcode(0, "M"); q.addData(SF.BANK_QR_PAYLOAD); q.make(); images.qr = { buffer: b64bytes(q.createDataURL(8, 4)), extension: "gif" }; } catch {}
  }
  const wb = new ExcelJS.Workbook();
  XL.layoutStatementSheet(wb, {
    statementNo: s.no, name: s.name, customerName: c.name, currency: "VND", totalAmount: s.total, status: s.status, cancelReason: s.cancelReason,
    items: s.items.map((i) => ({ lineNo: i.line, shippedDate: i.date, billCode: i.bill, trackingNumber: i.tracking || null, destinationIso2: i.iso2, receiverName: i.receiver || null, packageCount: i.pkgs, billedWeight: i.billed, routeCode: i.route, totalAmount: i.amount, note: i.note || null })),
  }, images);
  const buf = await wb.xlsx.writeBuffer();
  if (await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${s.name}.xlsx`)) toast(`Đã tải ${s.name}.xlsx`);
}
const stnBase = (o, n) => o.customer === n.cust && o.debt === "Chưa thanh toán";
/** Tra cứu nhiều mã cho Tạo bảng kê: phân loại từng mã */
function stnLookup(n) {
  const m = SL.searchMode(n.q || "");
  if (m.kind === "none") return null;
  const codes = m.kind === "codes" ? m.codes : [m.term.toUpperCase()];
  const pool = S.orders.filter((o) => inScope(o.customer));
  const res = { ok: [], other: [], billed: [], missing: [] };
  for (const c of codes) {
    const o = pool.find((x) => x.bill === c || String(x.tracking || "").toUpperCase() === c);
    if (!o) { res.missing.push(c); continue; }
    if (o.debt !== "Chưa thanh toán") { const st = S.statements.find((x) => x.status === "ACTIVE" && x.items.some((i) => i.orderId === o.id)); res.billed.push({ c, o, st }); continue; }
    if (o.customer !== n.cust) { res.other.push({ c, o }); continue; }
    res.ok.push(o);
  }
  return res;
}
function vStatementNew() {
  if (!ui.stNew || !inScope(ui.stNew.cust)) ui.stNew = { cust: scopedCustomers()[0]?.code, from: "", to: "", q: "", sel: new Set() };
  const n = ui.stNew, lk = stnLookup(n);
  const okIds = lk ? new Set(lk.ok.map((o) => o.id)) : null;
  const os = S.orders.filter((o) => stnBase(o, n) && (okIds ? okIds.has(o.id) : (!n.from || pd(o) >= n.from) && (!n.to || pd(o) <= n.to))).sort((a, b) => (pd(a) < pd(b) ? -1 : 1));
  const picked = S.orders.filter((o) => n.sel.has(o.id) && stnBase(o, n));
  const c = cust(n.cust);
  const others = lk ? [...new Set(lk.other.map((x) => x.o.customer))] : [];
  const mono = 'style="font-family:ui-monospace,monospace"';
  const report = !lk ? "" : `<div class="card mb-3 grid gap-1 p-3 text-sm">
    <div>Tra cứu <b>${lk.ok.length + lk.other.length + lk.billed.length + lk.missing.length}</b> mã: <b style="color:#047857">${lk.ok.length}</b> mã đủ điều kiện của ${esc(n.cust)} (đang hiện bên dưới, bỏ qua khoảng ngày gửi).</div>
    ${lk.other.length ? `<div style="color:#b45309">${lk.other.length} mã thuộc khách khác: <span ${mono}>${esc(lk.other.map((x) => `${x.c} (${x.o.customer})`).join(", "))}</span>${others.length === 1 ? ` <button class="btn o sm" data-a="stn-switch" data-id="${esc(others[0])}">Chuyển sang ${esc(others[0])}</button>` : ""}</div>` : ""}
    ${lk.billed.length ? `<div style="color:#b45309">${lk.billed.length} mã đã lên bảng kê: <span ${mono}>${esc(lk.billed.map((x) => `${x.c}${x.st ? ` → ${x.st.no}` : ` (${x.o.debt})`}`).join(", "))}</span></div>` : ""}
    ${lk.missing.length ? `<div style="color:#dc2626">${lk.missing.length} mã không tìm thấy: <span ${mono}>${esc(lk.missing.join(", "))}</span></div>` : ""}
  </div>`;
  return head("Tạo bảng kê", "Chọn khách hàng, lọc theo Ngày gửi hàng hoặc dán danh sách mã vận đơn, tick chọn rồi bấm Tạo. Đơn lên bảng kê được khóa cứng giá.", `<a class="btn o" href="#bang-ke">Danh sách bảng kê</a>`) + `
  <div class="card mb-3 flex flex-wrap items-end gap-3 p-3"><label class="f"><span>Khách hàng</span><select class="inp" data-c="stn-cust">${scopedCustomers().map((x) => `<option value="${x.code}" ${x.code === n.cust ? "selected" : ""}>${x.code} — ${esc(x.name)}</option>`).join("")}</select></label>
  <label class="f"><span>Từ ngày gửi</span><input class="inp" type="date" data-c="stn-from" value="${n.from}" ${lk ? "disabled" : ""}></label><label class="f"><span>Đến ngày gửi</span><input class="inp" type="date" data-c="stn-to" value="${n.to}" ${lk ? "disabled" : ""}></label>
  <label class="f"><span>Tra cứu nhiều mã vận đơn / tracking — mỗi dòng 1 mã</span><textarea class="inp" id="stn-q" rows="${Math.min(6, Math.max(2, (n.q || "").split("\n").length))}" style="width:300px;font-family:ui-monospace,monospace;font-size:12px;resize:vertical" placeholder="#AP3004&#10;#AP3003&#10;MN2637">${esc(n.q || "")}</textarea></label>
  <span class="flex gap-2"><button class="btn o" data-a="stn-search" title="Ctrl+Enter">🔍 Tra cứu & chọn</button>${n.q ? `<button class="btn g" data-a="stn-qclear">✕ Bỏ tra cứu</button>` : ""}</span></div>
  ${report}
  <div class="card mb-3 flex flex-wrap items-center justify-between gap-2 p-3" style="position:sticky;top:44px;z-index:5"><span>Đã chọn <b>${picked.length}</b>/${os.length} đơn${picked.length > os.filter((o) => n.sel.has(o.id)).length ? ` <span class="muted">(gồm ${picked.length - os.filter((o) => n.sel.has(o.id)).length} đơn ngoài bộ lọc)</span>` : ""} · Tổng <b style="color:var(--brand);font-size:16px">${money(picked.reduce((t, o) => t + Number(o.sell), 0))} VND</b> · Tên: <i>${esc(c?.name || "")} - ${esc(n.cust || "")} - SKLddMMyyXXXX</i></span><span class="flex gap-2">${picked.length ? `<button class="btn g sm" data-a="stn-unsel">Bỏ chọn</button>` : ""}<button class="btn" data-a="st-create" ${picked.length ? "" : "disabled"}>Tạo bảng kê (${picked.length})</button></span></div>
  <div class="card scroll"><table class="t"><thead><tr><th><input type="checkbox" data-c="stn-all" ${os.length && os.every((o) => n.sel.has(o.id)) ? "checked" : ""}></th><th>Ngày gửi</th><th>Mã vận đơn</th><th>Tracking</th><th>Đến</th><th>Người nhận</th><th class="num">Kiện</th><th class="num">Cân tính phí</th><th>Tuyến</th><th>Trạng thái</th><th class="num">Chi phí</th></tr></thead><tbody>
  ${os.map((o) => `<tr><td><input type="checkbox" data-c="stn-sel" value="${o.id}" ${n.sel.has(o.id) ? "checked" : ""}></td><td class="num">${V.viDate(pd(o))}</td><td><b>${esc(o.bill)}</b> ${o.locked ? "🔒" : ""}</td><td class="muted">${esc(o.tracking)}</td><td>${o.iso2}</td><td>${esc(o.receiver)}</td><td class="num">${o.packages.length}</td><td class="num">${kg(o.billed)}</td><td>${esc(o.route)}</td><td>${badge(o.status, STATUS_TONE[o.status])}</td><td class="num ${Number(o.sell) ? "font-medium" : ""}" style="${Number(o.sell) ? "" : "color:#d97706"}">${Number(o.sell) ? money(o.sell) : "Chưa có giá"}</td></tr>`).join("") || `<tr><td colspan="11" class="py-6 text-center muted">${lk ? "Không có mã nào đủ điều kiện cho khách này." : "Không có đơn chưa lên bảng kê."}</td></tr>`}
  </tbody></table></div>`;
}
function vStatement(s) {
  const c = cust(s.customer);
  const payload = SF.BANK_QR_PAYLOAD; // QR mặc định của ngân hàng (cố định)
  let qr = `<p class="text-xs" style="word-break:break-all">${esc(payload)}</p>`;
  try { const q = qrcode(0, "M"); q.addData(payload); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch {}
  const NOTES = ["Để bảo vệ quyền lợi của quý khách hàng và tránh ảnh hưởng thời gian giao hàng, quý khách hàng vui lòng đối chiếu và thanh toán số tiền trên trong đúng thời gian quy định.", "Trong trường hợp quý khách hàng không thanh toán kịp thời dẫn đến việc giao hàng bị chậm trễ hoặc các vấn đề phát sinh khác, công ty chúng tôi không chịu bất kỳ trách nhiệm nào."];
  const H = ["STT", "Thời gian", "Mã vận đơn", "Tracking", "Điểm Đến", "Người nhận", "Số kiện", "Trọng lượng tính phí", "Tuyến vận chuyển", "Chi phí", "Ghi chú"];
  return `<button class="btn g sm mb-2" data-a="st-back">‹ Bảng kê</button>` + head(s.no, s.name, `<button class="btn" data-a="st-xlsx" data-id="${s.id}">⬇ Tải Excel (.xlsx)</button>${s.status === "ACTIVE" && can("statements.manage") ? `<button class="btn o" data-a="st-cancel" data-id="${s.id}" ${s.paid > 0 ? 'disabled title="Đã có thanh toán"' : ""}>Hủy bảng kê</button>` : ""}`) + `
  ${s.status === "CANCELLED" ? `<div class="card mb-3 p-3" style="border-color:#dc2626;color:#dc2626">Đã hủy — ${esc(s.cancelReason || "không ghi lý do")}. Các đơn không thuộc bảng kê hiệu lực khác đã về “Chưa thanh toán”.</div>` : ""}
  <div class="card mb-3 grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4"><div><p class="text-xs muted">Tổng tiền</p><b style="color:var(--brand)">${money(s.total)} VND</b></div><div><p class="text-xs muted">Đã thu</p>${money(s.paid)}</div><div><p class="text-xs muted">Còn lại</p>${money(s.total - s.paid)}</div><div><p class="text-xs muted">Công nợ</p>${badge(s.debt, DEBT_TONE[s.debt])}</div></div>
  <p class="mb-2 text-xs muted">Xem trước bảng kê (bố cục mẫu SkyLane). Bấm “Tải Excel (.xlsx)” để tải file Excel có logo và mã QR chuyển khoản MSB (QR mặc định của ngân hàng — khách nhập số tiền và nội dung là mã bảng kê).</p>
  <div class="scroll rounded-lg border line"><div class="inv relative p-6" style="min-width:980px">
    <img src="${LOGO}" alt="" width="64" height="60" style="position:absolute;left:18px;top:14px">
    <p style="text-align:center;font-size:24px;font-weight:700;margin:6px 0 2px">CÔNG TY TNHH SKYLANE LOGISTICS</p>
    <p style="text-align:center;font-size:26px;font-weight:700;margin:0 0 8px">BẢNG KÊ CHI TIẾT CƯỚC VẬN CHUYỂN</p>
    <p style="font-size:15px;font-weight:700;margin:0 0 6px"><span style="display:inline-block;width:150px;text-align:center">Tên khách hàng:</span>${esc(c.name)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>${H.map((h) => `<th style="font-weight:700">${h}</th>`).join("")}</tr></thead><tbody>
    ${s.items.map((i) => `<tr><td style="text-align:center">${i.line}</td><td style="text-align:center">${i.date}</td><td>${esc(i.bill)}</td><td>${esc(i.tracking)}</td><td>${i.iso2}</td><td>${esc(i.receiver)}</td><td style="text-align:right">${i.pkgs}</td><td style="text-align:right">${Number(i.billed).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${esc(i.route)}</td><td style="text-align:right">${money(i.amount)}</td><td>${esc(i.note)}</td></tr>`).join("")}
    <tr><td colspan="8" style="border:0"></td><td style="text-align:center;font-weight:700">TỔNG</td><td style="text-align:right;font-weight:700">${money(s.total)}</td><td style="text-align:center;font-weight:700">VND</td></tr></tbody></table>
    <p style="font-weight:700;margin:22px 0 4px">&nbsp;&nbsp;LƯU Ý:</p>${NOTES.map((n) => `<p style="margin:0 0 4px">${n}</p>`).join("")}
    <div style="display:flex;gap:32px;align-items:flex-start;margin-top:20px"><div style="line-height:1.7"><p style="margin:0">Quý công ty vui lòng thanh toán theo tài khoản dưới đây:</p><p style="margin:0;font-weight:700">TÀI KHOẢN NHẬN TIỀN:</p><p style="margin:0">Tên người nhận: ${SF.BANK.accountName}</p><p style="margin:0">Ngân hàng: ${SF.BANK.bankName}</p><p style="margin:0">Số tài khoản: ${SF.BANK.accountNo}</p><p style="margin:0">Nội dung chuyển khoản: ${s.no}</p></div>
    ${s.status === "ACTIVE" ? `<div style="width:150px;text-align:center"><div style="width:150px;height:150px">${qr}</div><i style="font-size:12px">Quét mã để chuyển khoản</i></div>` : `<b style="color:#c00000;font-size:18px">BẢNG KÊ ĐÃ HỦY</b>`}</div>
  </div></div>`;
}

// =============================================================================
// ĐỐI SOÁT THU TIỀN
// =============================================================================
function rcState() {
  const list = scopedCustomers();
  if (!ui.rc || !inScope(ui.rc.cust)) ui.rc = { cust: list[0]?.code, amount: "", alloc: {}, manual: false, proofs: [], done: null, tab: "form", lf: { q: "", from: "", to: "", status: "ACTIVE" } };
  return ui.rc;
}
const openSts = (code) => S.statements.filter((s) => s.customer === code && s.status === "ACTIVE" && s.total - s.paid > 0).sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
function rcSuggest() {
  const rc = ui.rc;
  return RF.suggestAllocation(RF.parseThousands(rc.amount) || 0, openSts(rc.cust).map((s) => ({ id: s.id, statementNo: s.no, balance: String(s.total - s.paid), issuedAt: s.issuedAt })));
}
function vReconcile() {
  const rc = rcState();
  if (!rc.cust) return head("Đối soát thu tiền") + `<div class="card p-4 muted">Bạn chưa phụ trách khách hàng nào.</div>`;
  const manage = can("receipts.manage");
  const sts = S.statements.filter((s) => s.customer === rc.cust && s.status === "ACTIVE");
  const total = sts.reduce((t, s) => t + s.total, 0), paid = sts.reduce((t, s) => t + s.paid, 0);
  const credit = S.receipts.filter((r) => r.customer === rc.cust).reduce((t, r) => t + r.overpaid, 0);
  const preview = RF.formatReceiptNo(today(), (S.counters[`${RF.RECEIPT_PREFIX}|${today()}`] || 0) + 1);
  const stat = (l, v, col, big) => `<div class="card p-3"><p class="text-xs muted">${l}</p><p class="mt-1 font-semibold num" style="text-align:left;font-size:${big ? 20 : 17}px;color:${col || "var(--ink)"}">${money(v)}</p></div>`;
  const left = !manage ? "" : `<form id="f-rc" class="card grid h-fit gap-3 p-4" onsubmit="return false">
    <div class="flex items-center justify-between"><h2 class="font-semibold">Thông tin phiếu thu</h2>${badge(preview, "info")}</div>
    <label class="f"><span>Tài khoản nhận</span><input class="inp" name="account" value="${esc(RF.DEFAULT_RECEIVED_ACCOUNT)}"></label>
    <label class="f"><span>Số tiền nhận (VND) *</span><input class="inp" id="rc-amount" inputmode="numeric" autocomplete="off" style="height:44px;text-align:right;font-size:18px;font-weight:600" value="${esc(rc.amount)}" placeholder="3.000.000" data-c="rc-amount"></label>
    <p class="-mt-1 text-xs italic muted" id="rc-words">${rc.amount ? "Bằng chữ: " + esc(RF.vndToWords(RF.parseThousands(rc.amount))) : ""}</p>
    <div class="grid grid-cols-2 gap-2"><label class="f"><span>Mã giao dịch / nội dung CK</span><input class="inp" name="bankRef" placeholder="FT2633…"></label><label class="f"><span>Người chuyển</span><input class="inp" name="payer"></label></div>
    <div><p class="mb-1 text-xs font-medium muted">Ảnh minh chứng — <b>Ctrl+V</b> để dán ảnh chuyển khoản, hoặc chọn file</p><div class="flex min-h-[84px] flex-wrap items-center gap-2 rounded-lg border border-dashed line p-2" id="rc-proofs">${proofsHtml()}</div><input type="file" accept="image/*" multiple class="mt-1 text-xs" data-c="rc-file"></div>
    <div class="rounded-lg p-3 text-sm" style="background:var(--soft)" id="rc-sum">${rcSumHtml()}</div>
    <button class="btn" style="height:42px" data-a="rc-save" id="rc-save">Lưu phiếu thu</button></form>`;
  const stats = `<div class="mb-4 grid gap-3 sm:grid-cols-4">${stat("Tổng bảng kê", total)}${stat("Đã thanh toán", paid, "#047857")}${stat("Còn nợ", total - paid, "#dc2626", true)}${stat("Thu thừa (số dư có)", credit, "var(--accent)").replace(/<\/div>$/, manage && credit > 0 && openSts(rc.cust).length ? `<button class="btn o sm mt-2 w-full" data-a="credit-open">Dùng cho bảng kê</button></div>` : "</div>")}</div>`;
  const mine = S.receipts.filter((r) => r.customer === rc.cust);
  const tabs = `<div class="mb-4 flex border-b line" role="tablist">${[["form", manage ? "Lập phiếu thu" : "Công nợ bảng kê"], ["list", `Danh sách phiếu thu (${mine.filter((r) => r.status !== "CANCELLED").length})`]].map(([k, l]) => `<button role="tab" class="px-4 py-2 text-sm ${rc.tab === k ? "font-semibold" : "muted"}" style="border-bottom:2px solid ${rc.tab === k ? "var(--brand)" : "transparent"}" data-a="rc-tab" data-v="${k}">${l}</button>`).join("")}</div>`;
  const debtTable = `<div id="rc-sug">${rcSugHtml()}</div>
  <div class="card scroll"><table class="t"><thead><tr><th>Bảng kê</th><th>Ngày tạo</th><th class="num">Tổng tiền</th><th class="num">Đã thu</th><th class="num">Còn nợ</th><th class="num" style="width:190px">Phân bổ lần này</th><th class="num">Còn thiếu sau thu</th></tr></thead><tbody>
  ${openSts(rc.cust).map((s) => { const a = Number(RF.parseThousands(rc.alloc[s.id] || "")) || 0; return `<tr><td><b>${s.no}</b><div class="text-xs muted">${s.items.length} đơn · ${s.debt}</div></td><td class="num">${V.viDate(s.issuedAt.slice(0, 10))}</td><td class="num">${money(s.total)}</td><td class="num muted">${money(s.paid)}</td><td class="num font-semibold">${money(s.total - s.paid)}</td>
    <td><div class="flex gap-1"><input class="inp" style="height:32px;text-align:right" inputmode="numeric" data-c="rc-alloc" data-id="${s.id}" value="${esc(rc.alloc[s.id] || "")}" ${manage ? "" : "disabled"}><button class="btn g sm" data-a="rc-full" data-id="${s.id}" ${manage ? "" : "disabled"}>Đủ</button></div></td>
    <td class="num" id="rc-after-${s.id}">${afterHtml(s, a)}</td></tr>`; }).join("") || `<tr><td colspan="7" class="py-6 text-center muted">Không còn bảng kê nợ.</td></tr>`}
  </tbody></table></div>`;
  return head("Đối soát thu tiền", "Ghi nhận phiếu thu, phân bổ vào bảng kê, cập nhật công nợ; dư → Thu thừa.") + `
  <div class="card mb-4 flex flex-wrap items-center gap-2 p-3"><span class="text-sm font-medium">Khách hàng</span><select class="inp" style="width:280px" data-c="rc-cust">${scopedCustomers().map((c) => `<option value="${c.code}" ${c.code === rc.cust ? "selected" : ""}>${c.code} — ${esc(c.name)}</option>`).join("")}</select>${manage ? "" : `<span class="text-xs muted">(chỉ xem — vai trò của bạn không lập phiếu thu)</span>`}</div>
  ${rc.done ? `<div class="card mb-4 p-3" style="border-color:#059669">${esc(rc.done)}</div>` : ""}
  ${stats}${tabs}
  ${rc.tab === "list" ? receiptListHtml(mine, manage) : `<div class="grid gap-4 ${manage ? "xl:grid-cols-[400px_1fr]" : ""}">${left}<section class="grid content-start gap-4">${debtTable}</section></div>`}`;
}
/** Danh sách phiếu thu đã nhập — tách khỏi form nhập; tìm, lọc ngày, trạng thái */
function receiptListHtml(mine, manage) {
  const f = ui.rc.lf, t = f.q.trim().toLowerCase();
  const rows = mine.slice().reverse().filter((r) => (!f.status || (f.status === "CANCELLED" ? r.status === "CANCELLED" : r.status !== "CANCELLED")) && (!f.from || r.receivedAt.slice(0, 10) >= f.from) && (!f.to || r.receivedAt.slice(0, 10) <= f.to)
    && (!t || [r.no, r.bankRef, r.payer, r.note, ...r.allocs.map((a) => S.statements.find((s) => s.id === a.sid)?.no)].some((x) => String(x || "").toLowerCase().includes(t))));
  const sum = rows.reduce((x, r) => x + r.amount, 0), over = rows.reduce((x, r) => x + (r.overpaid || 0), 0);
  return `<div class="mb-3 flex flex-wrap items-end gap-2"><input class="inp" style="width:320px" placeholder="Mã phiếu, mã giao dịch, người chuyển, mã bảng kê" value="${esc(f.q)}" data-c="rl-q"><input class="inp" type="date" style="width:150px" value="${f.from}" data-c="rl-from" aria-label="Từ ngày"><span class="muted pb-2">–</span><input class="inp" type="date" style="width:150px" value="${f.to}" data-c="rl-to" aria-label="Đến ngày"><select class="inp" style="width:160px" data-c="rl-status"><option value="ACTIVE" ${f.status === "ACTIVE" ? "selected" : ""}>Đang hiệu lực</option><option value="CANCELLED" ${f.status === "CANCELLED" ? "selected" : ""}>Đã hủy</option><option value="" ${!f.status ? "selected" : ""}>Tất cả</option></select></div>
  <div class="card scroll"><table class="t"><thead><tr><th>Mã phiếu</th><th>Thời gian</th><th class="num">Số tiền</th><th>Phân bổ vào bảng kê</th><th class="num">Thu thừa</th><th>Mã GD / Người chuyển</th><th>Minh chứng</th>${manage ? "<th></th>" : ""}</tr></thead><tbody>
  ${rows.map((r) => `<tr style="${r.status === "CANCELLED" ? "opacity:.55" : ""}"><td><b>${r.no}</b>${r.status === "CANCELLED" ? `<div>${badge("Đã hủy", "bad")}</div><div class="text-xs muted">${esc(r.cancelReason || "")}</div>` : ""}</td><td class="num">${V.viDate(r.receivedAt.slice(0, 10))} ${r.receivedAt.slice(11, 16)}</td><td class="num font-semibold">${money(r.amount)}</td><td class="text-xs muted">${r.allocs.map((a) => `${S.statements.find((s) => s.id === a.sid)?.no}: ${money(a.amount)}`).join(", ") || "—"}</td><td class="num" style="color:var(--accent)">${r.overpaid ? money(r.overpaid) : "—"}</td><td class="text-xs">${esc(r.bankRef)}${r.payer ? `<div class="muted">${esc(r.payer)}</div>` : ""}</td><td>${r.proofs.length ? r.proofs.map((p) => `<img src="${p}" alt="" class="inline-block h-8 w-8 rounded object-cover">`).join(" ") : '<span class="text-xs muted">—</span>'}</td>${manage ? `<td class="whitespace-nowrap">${r.status === "CANCELLED" ? "" : `<button class="btn g sm" data-a="rc-edit" data-id="${r.id}">Sửa</button><button class="btn g sm" data-a="rc-cancel" data-id="${r.id}">Hủy</button>`}</td>` : ""}</tr>`).join("") || `<tr><td colspan="8" class="py-4 text-center muted">Không có phiếu thu phù hợp.</td></tr>`}
  </tbody></table></div><p class="mt-2 text-sm muted">${rows.length} phiếu · Tổng thu <b style="color:var(--ink)">${money(sum)} đ</b>${over ? ` · Thu thừa <b style="color:var(--accent)">${money(over)} đ</b>` : ""}</p>`;
}

const allocTable = (lines) => lines.length ? `<div class="card scroll"><table class="t"><thead><tr><th>Bảng kê</th><th class="num">Tối đa</th><th class="num" style="width:220px">Phân bổ</th></tr></thead><tbody>${lines.map((l) => `<tr class="al" data-sid="${l.sid}" data-max="${l.max}" data-no="${l.no}"><td><b>${l.no}</b></td><td class="num muted">${money(l.max)}</td><td><div class="flex gap-1"><input class="inp" data-c="fmt" style="height:32px;text-align:right" inputmode="numeric" value="${l.v ? RF.formatThousands(String(l.v)) : ""}"><button class="btn g sm" data-a="al-full">Đủ</button></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="text-sm muted">Không có bảng kê còn nợ.</p>`;
const readAllocTable = (box) => $$(".al", box).map((tr) => ({ sid: Number(tr.dataset.sid), no: tr.dataset.no, max: Number(tr.dataset.max), amount: Number(RF.parseThousands($("input", tr).value) || 0) })).filter((a) => a.amount > 0);
const afterHtml = (s, a) => (a > 0 ? (s.total - s.paid - a <= 0 ? '<span style="color:#047857">Đã đủ</span>' : money(s.total - s.paid - a)) : "—");
const proofsHtml = () => ui.rc.proofs.map((p, i) => `<span class="relative"><img src="${p}" alt="Minh chứng ${i + 1}" class="h-16 w-16 rounded object-cover"><button class="btn g sm absolute -right-2 -top-2" style="height:20px;padding:0 5px;background:var(--card)" data-a="rc-proof-del" data-i="${i}">✕</button></span>`).join("") || '<span class="text-xs muted">Chưa có ảnh</span>';
function rcSumHtml() {
  const amt = Number(RF.parseThousands(ui.rc.amount)) || 0;
  const al = Object.values(ui.rc.alloc).reduce((t, v) => t + (Number(RF.parseThousands(v)) || 0), 0);
  const over = amt - al;
  return `<div class="flex justify-between"><span>Số tiền nhận</span><b class="num">${money(amt)} đ</b></div><div class="flex justify-between"><span>Phân bổ vào bảng kê</span><b class="num">${money(al)} đ</b></div><div class="flex justify-between" style="color:${over > 0 ? "#047857" : over < 0 ? "#dc2626" : "inherit"}"><span>${over >= 0 ? "Thu thừa (ghi có cho khách)" : "Phân bổ vượt số tiền"}</span><b class="num">${money(Math.abs(over))} đ</b></div>`;
}
function rcSugHtml() {
  const amt = Number(RF.parseThousands(ui.rc.amount)) || 0;
  if (!amt) return "";
  const s = rcSuggest();
  const lbl = { EXACT: "Khớp chính xác", COMBO: "Khớp gộp", FIFO: "FIFO cũ nhất trước", NONE: "" }[s.mode];
  return `<div class="card flex flex-wrap items-center justify-between gap-2 p-3" style="background:var(--soft)"><span>✨ ${lbl ? badge(lbl, "info") : ""} ${esc(s.label)}</span>${ui.rc.manual ? `<button class="btn o sm" data-a="rc-apply">Áp dụng gợi ý</button>` : ""}</div>`;
}
function rcApplySuggestion() {
  const s = rcSuggest();
  ui.rc.alloc = Object.fromEntries(s.allocations.map((a) => [a.id, RF.formatThousands(a.amount)]));
  ui.rc.manual = false;
}
function rcRefresh(full) {
  if (full) return render();
  const w = $("#rc-words"); if (w) w.textContent = ui.rc.amount ? "Bằng chữ: " + RF.vndToWords(RF.parseThousands(ui.rc.amount)) : "";
  const s = $("#rc-sum"); if (s) s.innerHTML = rcSumHtml();
  const g = $("#rc-sug"); if (g) g.innerHTML = rcSugHtml();
  for (const st of openSts(ui.rc.cust)) {
    const a = Number(RF.parseThousands(ui.rc.alloc[st.id] || "")) || 0;
    const cell = $(`#rc-after-${st.id}`); if (cell) cell.innerHTML = afterHtml(st, a);
    const inp = $(`[data-c="rc-alloc"][data-id="${st.id}"]`); if (inp && document.activeElement !== inp) inp.value = ui.rc.alloc[st.id] || "";
  }
}
function addProofs(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/") || ui.rc.proofs.length >= 5) continue;
    const r = new FileReader();
    r.onload = () => { ui.rc.proofs.push(r.result); const p = $("#rc-proofs"); if (p) p.innerHTML = proofsHtml(); };
    r.readAsDataURL(f);
  }
}

// =============================================================================
// DANH MỤC
// =============================================================================
function vCustomers() {
  const m = can("catalog.manage");
  return head("Khách hàng", "Sale phụ trách, nhóm giá mặc định và % điều chỉnh quyết định giá bán.", m ? `<button class="btn" data-a="cu-edit" data-id="">+ Thêm khách hàng</button>` : "") + `<div class="card scroll"><table class="t"><thead><tr><th>Mã KH</th><th>Tên</th><th>Liên hệ</th><th>Sale phụ trách</th><th>Nhóm giá</th><th class="num">Điều chỉnh</th><th class="num">Số đơn</th>${m ? "<th></th>" : ""}</tr></thead><tbody>
  ${S.customers.map((c) => `<tr><td><b>${c.code}</b></td><td>${esc(c.name)}</td><td class="text-xs">${esc(c.phone || "")}${c.email ? `<div class="muted">${esc(c.email)}</div>` : ""}${!c.phone && !c.email ? '<span class="muted">—</span>' : ""}</td><td>${esc(S.users.find((u) => u.id === c.saleId)?.name || "—")}</td><td>${c.group ? badge(c.group, "info") : '<span class="muted">Chung</span>'}</td><td class="num">${Number(c.adjust) > 0 ? "+" : ""}${Number(c.adjust)}%</td><td class="num">${S.orders.filter((o) => o.customer === c.code).length}</td>${m ? `<td><button class="btn g sm" data-a="cu-edit" data-id="${c.code}">Sửa</button></td>` : ""}</tr>`).join("")}</tbody></table></div>
  <p class="mt-2 text-xs muted">Ưu tiên giá bán: giá riêng Mã KH (SKL116 có giá riêng tuyến VNFZZXR) → bảng giá riêng của nhóm × (1 + % khách) → bảng giá chung × (1 + % nhóm) × (1 + % khách). Sửa sẽ tính lại ngay đơn chưa khóa giá.</p>`;
}
function vGroups() {
  const m = can("catalog.manage");
  const own = (g) => [...new Set(S.versions.filter((v) => v.priceGroupCode === g.code && v.kind === "SELL" && (v.status || "ACTIVE") === "ACTIVE" && (!v.effectiveTo || v.effectiveTo >= today())).map((v) => v.routeCode))];
  return head("Nhóm giá", "Mỗi nhóm khai báo % so với bảng giá chung. Tuyến nào nhóm có bảng giá bán riêng thì dùng bảng riêng, không cộng %.", m ? `<button class="btn" data-a="gr-edit" data-id="">+ Thêm nhóm giá</button>` : "") + `<div class="card scroll"><table class="t"><thead><tr><th>Mã nhóm</th><th>Tên</th><th class="num">% so với giá chung</th><th>Bảng giá riêng</th><th class="num">Số khách</th><th>Trạng thái</th>${m ? "<th></th>" : ""}</tr></thead><tbody>
  ${S.groups.map((g) => { const n = Number(g.adjust); const r = own(g); return `<tr><td><b>${esc(g.code)}</b></td><td>${esc(g.name)}</td><td class="num font-semibold" style="color:${n < 0 ? "#047857" : n > 0 ? "#b45309" : "inherit"}">${n > 0 ? "+" : ""}${n.toLocaleString("vi-VN")}%</td><td>${r.length ? r.map((x) => badge(x, "info")).join(" ") : '<span class="muted">Không — dùng giá chung</span>'}</td><td class="num">${S.customers.filter((c) => c.group === g.code).length}</td><td>${g.active ? badge("Hoạt động", "ok") : badge("Ngừng")}</td>${m ? `<td><button class="btn g sm" data-a="gr-edit" data-id="${esc(g.code)}">Sửa</button></td>` : ""}</tr>`; }).join("") || `<tr><td colspan="7" class="py-6 text-center muted">Chưa có nhóm giá.</td></tr>`}</tbody></table></div>
  <p class="mt-2 text-xs muted">Thử: đổi % của nhóm CA_NHAN rồi xem giá bán các đơn của SKL126 trong Vận đơn thay đổi ngay (đơn chưa khóa giá). NHOM_BUSINESS có bảng giá riêng tuyến VNFZZXR & UPS HAN S5500 nên đơn các tuyến đó không bị cộng %.</p>`;
}
/** Cửa sổ nhóm giá: % so với giá chung, bảng giá bán theo tuyến (bảng riêng / giá chung × %), thêm tuyến bảng riêng, khách trong nhóm */
function groupDialog(code) {
  const g = code ? S.groups.find((x) => x.code === code) : null, m = can("catalog.manage"), pm = can("pricing.manage");
  const t = today(), live = (v) => (v.status || "ACTIVE") === "ACTIVE" && (!v.effectiveTo || v.effectiveTo >= t);
  const general = (rc) => S.versions.filter((v) => v.routeCode === rc && v.kind === "SELL" && !v.customerCode && !v.priceGroupCode && live(v) && v.effectiveFrom <= t).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const own = (rc) => S.versions.filter((v) => v.routeCode === rc && v.kind === "SELL" && v.priceGroupCode === code && live(v)).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const rows = g ? S.routes.map((r) => ({ rc: r.code, gen: general(r.code), own: own(r.code) })).filter((x) => x.gen || x.own.length) : [];
  const members = g ? S.customers.filter((c) => c.group === code) : [];
  const others = g ? S.customers.filter((c) => c.group !== code) : [];
  const pv = (id, label) => `<button class="btn g sm" data-a="gr-view" data-id="${id}" data-back="${esc(code)}">${label}</button>`;
  openDialog(g ? `Sửa nhóm giá ${g.code}` : "Thêm nhóm giá", `<div class="grid gap-5" id="f-gr" data-id="${esc(g?.code || "")}">
    <div class="grid gap-3 sm:grid-cols-2"><label class="f"><span>Mã nhóm *</span><input class="inp uppercase" name="code" value="${esc(g?.code || "")}" ${g ? "readonly" : ""} placeholder="VD: CA_NHAN"></label>
    <label class="f"><span>Tên nhóm *</span><input class="inp" name="name" value="${esc(g?.name || "")}"></label>
    <label class="f"><span>% so với giá chung</span><input class="inp" name="adjust" value="${esc(g?.adjust ?? "0")}"><span class="text-xs muted">10 = cao hơn giá chung 10%; -5 = thấp hơn 5%</span></label>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" ${g?.active ?? true ? "checked" : ""}> Đang hoạt động</label></div>
    <div class="flex justify-end gap-2"><button class="btn o" data-a="close">Đóng</button>${m ? `<button class="btn" data-a="gr-save">${g ? "Lưu & tính lại giá" : "Thêm nhóm"}</button>` : ""}</div>
    ${g ? `<section class="grid gap-2"><b class="text-sm">Bảng giá bán của nhóm theo tuyến</b>
      <div class="card scroll"><table class="t"><thead><tr><th>Tuyến</th><th>Nhóm đang dùng</th><th>Xem bảng giá</th></tr></thead><tbody>
      ${rows.map((x) => `<tr><td><b>${esc(x.rc)}</b></td><td>${x.own.length ? badge(`Bảng riêng từ ${V.viDate(x.own[0].effectiveFrom)}${x.own[0].effectiveTo ? ` đến ${V.viDate(x.own[0].effectiveTo)}` : ""}`, "info") : `Giá chung × (1 ${Number(g.adjust) < 0 ? "−" : "+"} ${Math.abs(Number(g.adjust))}%)`}</td><td>${x.own.length ? pv(x.own[0].id, "Bảng riêng") : x.gen ? pv(`${x.gen.id}:${code}`, `Giá nhóm (${GT.pctLabel(g.adjust)})`) : ""}</td></tr>`).join("") || `<tr><td colspan="3" class="py-4 text-center muted">Chưa có bảng giá bán.</td></tr>`}
      </tbody></table></div>
      <p class="text-xs muted">Tuyến dùng giá chung tự cập nhật theo % nhóm (bấm “Giá nhóm” để xem bảng đã nhân %). Tuyến có bảng riêng không cộng % nhóm.</p>
      ${pm ? `<div class="card grid gap-2 p-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
        <label class="f"><span>Thêm tuyến bảng giá riêng</span><select class="inp" id="gr-own-route"><option value="">— Chọn tuyến —</option>${rows.filter((x) => x.gen && !x.own.length).map((x) => `<option>${esc(x.rc)}</option>`).join("")}</select></label>
        <label class="f"><span>Áp dụng từ ngày</span><input class="inp" type="date" id="gr-own-from" value="${t}"></label>
        <button class="btn o" data-a="gr-own">+ Tạo bảng riêng</button>
        <p class="text-xs muted sm:col-span-3">Sao chép bảng giá bán chung × (1 + % nhóm hiện tại) thành phiên bản riêng của nhóm. Đơn có ngày gửi trước ngày áp dụng vẫn dùng giá cũ — chọn ngày sớm hơn nếu muốn áp cho cả đơn đã có (đơn đã khóa giá không đổi). Có file giá riêng? <button class="text-left" style="color:var(--accent)" data-a="pimp-open-scope" data-t="GROUP" data-id="${esc(code)}">Import bảng giá riêng cho nhóm ${esc(code)}</button>.</p></div>` : ""}
    </section>
    <section class="grid gap-2"><b class="text-sm">Khách hàng trong nhóm (${members.length})</b>
      <div class="flex flex-wrap gap-2">${members.map((c) => `<span class="card inline-flex items-center gap-2 px-2 py-1 text-sm"><b>${c.code}</b> ${esc(c.name)} <span class="text-xs muted">(${GT.pctLabel(c.adjust)} riêng)</span>${m ? `<button class="text-xs" style="color:#dc2626" data-a="gr-member" data-id="${c.code}" data-rm="1" title="Bỏ khỏi nhóm (dùng giá chung)">✕</button>` : ""}</span>`).join("") || '<span class="text-sm muted">Chưa có khách nào.</span>'}</div>
      ${m ? `<div class="flex flex-wrap items-end gap-2"><label class="f"><span>Thêm khách vào nhóm</span><select class="inp" id="gr-add-member" style="width:300px"><option value="">— Chọn khách hàng —</option>${others.map((c) => `<option value="${c.code}">${c.code} — ${esc(c.name)}${c.group ? ` (đang ở ${c.group})` : ""}</option>`).join("")}</select></label><button class="btn o" data-a="gr-member">Thêm & tính lại giá</button></div>` : ""}
    </section>` : ""}
  </div>`, true);
}
/** Xem bảng giá: phiên bản (id) hoặc "id:NHÓM" = bảng chung đã nhân % nhóm */
function priceVersionPreview(key, back) {
  const [id, grp] = String(key).split(":"), v = S.versions.find((x) => x.id === Number(id)), g = grp ? S.groups.find((x) => x.code === grp) : null;
  const zones = g ? GT.scaleZones(v.zones, g.adjust, v.currency || "VND") : v.zones;
  const weights = [...new Set(zones.flatMap((z) => z.matrix.map((t) => Number(t.weightMax))))].sort((a, b) => a - b);
  const kgTiers = [...new Set(zones.flatMap((z) => z.perKg.map((t) => `${t.weightMin}|${t.weightMax ?? ""}`)))];
  openDialog(`${v.routeCode} — ${g ? `Giá bán nhóm ${g.code} = giá chung × (1 ${Number(g.adjust) < 0 ? "−" : "+"} ${Math.abs(Number(g.adjust))}%)` : v.name || "Bảng giá"}`, `<div class="grid gap-3">
    <p class="text-sm muted">${g ? `Tính từ bảng giá bán chung hiệu lực từ ${V.viDate(v.effectiveFrom)}. Đổi % nhóm thì bảng này đổi theo.` : `Hiệu lực ${V.viDate(v.effectiveFrom)}${v.effectiveTo ? ` → ${V.viDate(v.effectiveTo)}` : " → không thời hạn"}. ${esc(v.note || "")}`}</p>
    <div class="card scroll"><table class="t"><thead><tr><th>Khối lượng (kg)</th>${zones.map((z) => `<th class="num">${esc(z.zoneCode)}<div class="font-normal">${esc(z.countries.join(", "))}</div></th>`).join("")}</tr></thead><tbody>
    ${weights.map((w) => `<tr><td class="num">≤ ${kg(w)}</td>${zones.map((z) => { const tr = z.matrix.find((t) => Number(t.weightMax) === w); return `<td class="num">${tr ? money(tr.price) : "–"}</td>`; }).join("")}</tr>`).join("")}
    ${kgTiers.map((k) => { const [lo, hi] = k.split("|"); return `<tr><td class="num">${kg(lo)}–${hi ? kg(hi) : "∞"} /kg</td>${zones.map((z) => { const tr = z.perKg.find((t) => `${t.weightMin}|${t.weightMax ?? ""}` === k); return `<td class="num">${tr ? money(tr.unitPrice) : "–"}</td>`; }).join("")}</tr>`; }).join("")}
    </tbody></table></div><div class="flex justify-end">${back ? `<button class="btn o" data-a="gr-edit" data-id="${esc(back)}">‹ Quay lại nhóm ${esc(back)}</button>` : `<button class="btn o" data-a="close">Đóng</button>`}</div></div>`, true);
}
function vRoutes() {
  const m = can("catalog.manage");
  return head("Tuyến vận chuyển", "Loại hình dịch vụ quyết định làm tròn; cách tính cân & DIM quyết định cân quy đổi.", m ? `<button class="btn" data-a="ro-edit" data-id="">+ Thêm tuyến vận chuyển</button>` : "") + `<div class="card scroll"><table class="t"><thead><tr><th>Mã tuyến</th><th>NCC</th><th>Dịch vụ</th><th>Làm tròn</th><th>Cách tính cân</th><th class="num">DIM</th>${m ? "<th></th>" : ""}</tr></thead><tbody>
  ${S.routes.map((r) => `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.supplier)}</td><td>${badge(r.service, "info")}</td><td class="text-xs muted">${SVC_ROUND[r.service]}</td><td>${r.mode === "ACTUAL_ONLY" ? badge("Chỉ cân thực", "warn") : badge("Max(thực, thể tích)")}</td><td class="num" style="${r.mode === "ACTUAL_ONLY" ? "text-decoration:line-through;color:var(--muted)" : ""}">${Number(r.dim).toLocaleString("vi-VN")}</td>${m ? `<td><button class="btn g sm" data-a="ro-edit" data-id="${esc(r.code)}">Sửa</button></td>` : ""}</tr>`).join("")}</tbody></table></div>
  <p class="mt-2 text-xs muted">Đổi DIM hoặc cách tính cân sẽ tính lại ngay các đơn chưa khóa giá dùng tuyến này (cả tuyến vận chuyển lẫn tuyến chỉ định).</p>`;
}

// =============================================================================
// Sự kiện
// =============================================================================
const A = {
  close: closeDialog,
  "tab-close": (el, e) => { e?.preventDefault(); closeTab(el.dataset.id); },
  "tab-others": () => { const v = current(); ui.tabs = [v]; ui.scroll = { [v]: ui.scroll[v] }; saveTabs(); render(); },
  reset: () => { freshData(); ui.orders.sel.clear(); ui.rc = null; ui.st = ui.stNew = ui.ver = null; save(); render(); toast("Đã đặt lại dữ liệu mẫu."); },
  "dash-table": () => { ui.dash.table = !ui.dash.table; render(); },
  "o-tab": (el) => { ui.orders.status = el.dataset.v; ui.orders.page = 1; render(); },
  "o-search": () => {
    const f = ui.orders, from = $("#o-from").value, to = $("#o-to").value;
    Object.assign(f, { q: $("#o-q").value.trim(), df: $("#o-df").value, from: from && to && from > to ? to : from, to: from && to && from > to ? from : to, page: 1 });
    render();
  },
  "o-clear": () => { Object.assign(ui.orders, { q: "", from: "", to: "", df: "sent", status: "", cust: "", asg: "", iso2: "", page: 1 }); render(); },
  "o-sort": (el) => {
    const f = ui.orders, k = el.dataset.k;
    if (f.sort !== k) Object.assign(f, { sort: k, dir: "asc" }); else if (f.dir === "asc") f.dir = "desc"; else f.sort = "";
    f.page = 1; render();
  },
  "copy-menu": (el, e) => { e.stopPropagation(); const r = el.getBoundingClientRect(); openCopyMenu(r.left, r.bottom + 4, null); },
  "cp-row-code": (el) => { const o = S.orders.find((x) => x.id === Number(el.dataset.id)); copyText(o.bill, `mã ${o.bill}`); },
  "cp-row-full": (el) => copyText(rowsTsv([S.orders.find((x) => x.id === Number(el.dataset.id))]), "dòng này (đầy đủ cột)"),
  "cp-sel-code": () => { const l = S.orders.filter((o) => ui.orders.sel.has(o.id)); copyText(l.map((o) => o.bill).join("\n"), `${l.length} mã vận đơn đã chọn`); },
  "cp-sel-full": () => { const l = S.orders.filter((o) => ui.orders.sel.has(o.id)); copyText(rowsTsv(l), `${l.length} dòng đã chọn — dán vào Excel`); },
  "cp-all-code": () => { const l = visibleOrders().filter((o) => !ui.orders.status || o.status === ui.orders.status); copyText(l.map((o) => o.bill).join("\n"), `${l.length} mã vận đơn (tất cả dòng theo bộ lọc)`); },
  "od-open": (el) => odDialog(S.orders.find((x) => x.id === Number(el.dataset.id))),
  "od-save": odSave,
  "od-auto": () => { $$('[data-c="od-sell"],[data-c="od-unit"],[name="costAmount"]', $("#f-od")).forEach((i) => (i.value = "")); toast("Đã bỏ ghi đè — bấm Lưu để tự tính lại giá theo bảng giá."); },
  "o-page": (el) => { ui.orders.page = Number(el.dataset.v); render(); },
  "sel-clear": () => { ui.orders.sel.clear(); render(); },
  "dr-tab": (el) => { ui.drafts.status = el.dataset.v; ui.drafts.sel.clear(); render(); },
  "dr-clear": () => { ui.drafts.sel.clear(); render(); },
  "dr-confirm": () => {
    const r = confirmDrafts([...ui.drafts.sel]); ui.drafts.sel.clear(); save(); render();
    toast(`Đã chuyển ${r.n} đơn sang Vận đơn và tính giá${r.warn ? `; ${r.warn} đơn chưa tra được giá (⚠)` : ""}.`, r.warn ? "warn" : "ok");
  },
  "dr-reject": () => openDialog(`Loại ${ui.drafts.sel.size} đơn`, `<div class="grid gap-3"><p class="text-sm muted">Đơn bị loại không chuyển sang Vận đơn và không bị đồng bộ lại. Có thể đưa về chờ xác nhận ở tab “Đã loại”.</p><label class="f"><span>Lý do</span><textarea class="inp" id="dr-reason" rows="3" placeholder="VD: khách hủy, nhập trùng…"></textarea></label><div class="flex justify-end gap-2"><button class="btn o" data-a="close">Không</button><button class="btn d" data-a="dr-reject-ok">Loại đơn</button></div></div>`),
  "dr-reject-ok": () => {
    const reason = $("#dr-reason").value.trim() || null; let n = 0;
    S.drafts.forEach((x) => { if (ui.drafts.sel.has(x.id) && x.status === "CHO_XAC_NHAN") { Object.assign(x, { status: "DA_LOAI", reason, decidedAt: new Date().toISOString() }); n++; } });
    ui.drafts.sel.clear(); save(); closeDialog(); render(); toast(`Đã loại ${n} đơn.`, "warn");
  },
  "dr-restore": () => {
    let n = 0; S.drafts.forEach((x) => { if (ui.drafts.sel.has(x.id) && x.status === "DA_LOAI") { Object.assign(x, { status: "CHO_XAC_NHAN", reason: null, decidedAt: null }); n++; } });
    ui.drafts.sel.clear(); save(); render(); toast(`Đã đưa ${n} đơn về chờ xác nhận.`);
  },
  "sync-open": () => {
    const list = scopedCustomers();
    openDialog("Đồng bộ đơn từ Google Sheet của khách", `<div class="grid gap-3"><p class="text-sm muted">Mỗi khách nhập đơn trên link Google Sheet do SkyLane cấp (đúng cột tab DON). Bấm đồng bộ để lấy đơn mới về mục Chờ xác nhận; đơn đã có bị bỏ qua.</p>
      <div class="card scroll"><table class="t"><thead><tr><th>Khách hàng</th><th>Link Google Sheet</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td><b>${c.code}</b> — ${esc(c.name)}</td><td class="text-xs" style="max-width:360px;word-break:break-all">${c.sheet ? esc(c.sheet) : '<span class="muted">Chưa cấp link (sửa ở Khách hàng)</span>'}</td><td>${c.sheet ? `<button class="btn sm" data-a="sync-run" data-id="${c.code}">Đồng bộ ngay</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="text-xs muted">Bản chạy thử không đọc được Google Sheet thật (trình duyệt chặn mạng) — dữ liệu khách nhập được mô phỏng. Bản thật đọc trực tiếp sheet qua link chia sẻ.</p></div>`, true);
  },
  "sync-run": (el) => {
    const r = syncSheet(el.dataset.id);
    if (r.error) return toast(r.error, "bad");
    save(); closeDialog(); ui.drafts.status = "CHO_XAC_NHAN"; render();
    const errs = r.errors.map((e) => `dòng ${e.row}${e.billCode ? ` · ${e.billCode}` : ""}: ${e.message}`).join("; ");
    toast(`Đồng bộ ${el.dataset.id}: ${r.added ? `${r.added} đơn mới vào Chờ xác nhận` : "không có đơn mới kể từ lần đồng bộ trước"}${r.skipped ? `, bỏ qua ${r.skipped} đơn đã có` : ""}.${r.errors.length ? ` ${r.errors.length} dòng lỗi chưa nhận — ${errs}. Sửa trên Google Sheet của khách rồi đồng bộ lại.` : ""}`, r.errors.length ? "warn" : "ok");
  },
  "create-open": createDialog,
  "pk-add": () => $("#pks").insertAdjacentHTML("beforeend", pkRow()),
  "pk-del": (el) => { const rows = $$(".pk", el.closest("#pks")); if (rows.length > 1) el.closest(".pk").remove(); else $$("input", el.closest(".pk")).forEach((i) => (i.value = "")); },
  "create-save": () => {
    const fd = new FormData($("#f-create"));
    const bill = String(fd.get("bill")).trim().toUpperCase(), c = fd.get("customer"), iso2 = String(fd.get("iso2")).trim().toUpperCase();
    if (!bill) return toast("Nhập mã vận đơn.", "bad");
    if (!/^[A-Z]{2}$/.test(iso2)) return toast("Điểm đến phải là mã ISO2.", "bad");
    if (usedKeys().has(`${c}|${bill}`)) return toast(`Trùng order_key ${c}|${bill} — đơn đã có trong Vận đơn hoặc Đơn hàng dự báo.`, "bad");
    const t = (k) => String(fd.get(k) || "").trim() || null;
    const email = t("rEmail"), declared = t("declared");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast("Email người nhận không hợp lệ.", "bad");
    if (declared && !IX.parseNumberCell(declared, "price")) return toast("Giá trị khai báo không hợp lệ (VD 25 hoặc 25,5).", "bad");
    let packages; try { packages = readPkgs($("#f-create")); } catch (e) { return toast(e.message, "bad"); }
    stageDrafts([{
      customerCode: c, billCode: bill, orderKey: `${c}|${bill}`, trackingNumber: t("tracking"), routeCode: fd.get("route"), assignedRouteCode: fd.get("assigned") || null, destinationIso2: iso2,
      createdAt: null, shippedAt: fd.get("shipped") ? fd.get("shipped") + "T10:00:00+07:00" : null,
      receiverName: t("receiver"), receiverPhone: t("rPhone"), receiverEmail: email?.toLowerCase() ?? null, receiverAddress: t("rAddress"), receiverCity: t("rCity"), receiverState: t("rState"), receiverPostalCode: t("rPostal"),
      goodsDescription: t("goodsVi"), goodsNameEn: t("goodsEn"), hsCode: t("hs"), declaredValueUsd: declared ? IX.parseNumberCell(declared, "price") : null, note: t("note"),
      packages: packages.map((p) => ({ lengthCm: p.l, widthCm: p.w, heightCm: p.h, actualWeight: p.kg })),
    }], "MANUAL", "Nhập tay");
    save(); closeDialog(); ui.drafts.status = "CHO_XAC_NHAN"; location.hash = "don-du-bao"; render();
    toast(`Đã thêm ${bill} vào Đơn hàng dự báo — chọn đơn và bấm Xác nhận để chuyển sang Vận đơn.`);
  },
  "bulk-open": bulkDialog,
  "bulk-save": applyBulk,
  "pk-open": (el) => {
    const o = S.orders.find((x) => x.id === Number(el.dataset.id));
    openDialog(`Kiện hàng — ${o.bill}`, `<div class="grid gap-3" id="f-pk" data-id="${o.id}"><p class="text-sm muted">Tuyến ${esc(o.route)} (${S.routes.find((r) => r.code === o.route)?.service}) → chỉ định ${esc(o.assigned)}. ${o.locked ? "Đơn đã khóa giá — lưu kiện nhưng không tính lại giá." : "Lưu sẽ tính lại cân & giá ngay."}</p>${pkHead}<div id="pks" class="grid gap-2">${(o.packages.length ? o.packages : [{}]).map(pkRow).join("")}</div><div class="flex justify-between"><button class="btn o sm" data-a="pk-add">+ Thêm kiện</button><span class="flex gap-2"><button class="btn o" data-a="close">Hủy</button><button class="btn" data-a="pk-save">Lưu kiện</button></span></div></div>`);
  },
  "pk-save": () => {
    const box = $("#f-pk"), o = S.orders.find((x) => x.id === Number(box.dataset.id));
    let packages; try { packages = readPkgs(box); } catch (e) { return toast(e.message, "bad"); }
    const before = { billed: o.billed, sell: o.sell, cost: o.cost };
    o.packages = packages; reprice(S, o); save(); closeDialog(); render();
    toast(o.locked ? "Đã lưu kiện — đơn đã khóa giá nên giữ nguyên cân & tiền." : `Đã lưu ${packages.length} kiện. Tính phí ${kg(before.billed)} → ${kg(o.billed)} kg${can("orders.viewMoney") ? `; giá bán ${money(before.sell)} → ${money(o.sell)}` : ""}.`);
  },
  "imp-open": () => { ui.impRows = null; ui.impLabel = null; importDialog(); },
  "tpl-open": () => templateDialog(),
  "tpl-xlsx": (el) => downloadOrderTemplate(el.dataset.id).catch((err) => toast("Không tạo được file mẫu: " + err.message, "bad")),
  "tpl-copy": (el) => copyText(el.dataset.v, el.dataset.v.startsWith("http") ? "link mẫu" : "tin nhắn gửi khách"),
  "tpl-master": () => {
    const v = $("#tpl-master").value.trim();
    if (v && !IP.parseSheetUrl(v)) return toast("Link Google Sheet không hợp lệ (dạng https://docs.google.com/spreadsheets/d/…).", "bad");
    S.settings = S.settings || {}; S.settings.masterSheet = v; save();
    templateDialog($('[data-c="tpl-cust"]').value); toast(v ? "Đã lưu Google Sheet mẫu gốc — link tạo bản sao đã sẵn sàng." : "Đã gỡ Google Sheet mẫu gốc.");
  },
  "tpl-save": (el) => {
    const v = $("#tpl-url").value.trim(), c = custOf(S, el.dataset.id);
    if (v && !IP.parseSheetUrl(v)) return toast("Link Google Sheet không hợp lệ (dạng https://docs.google.com/spreadsheets/d/…).", "bad");
    c.sheet = v; c.sheetTab = $("#tpl-tab").value.trim() || "DON"; save(); closeDialog(); render();
    toast(v ? `Đã lưu link Google Sheet cho ${c.code} — bấm “Đồng bộ Google Sheet” để lấy đơn.` : `Đã gỡ link Google Sheet của ${c.code}.`);
  },
  "imp-sample": () => { ui.impRows = null; ui.impLabel = "Dữ liệu mẫu (tab DON)"; $("#imp-text").value = ORDER_SAMPLE; $("#imp-cust").value = "SKL116"; },
  "imp-check": () => {
    const a = analyzeImport();
    $("#imp-commit").disabled = !a.valid.length;
    $("#imp-commit").textContent = `Đưa ${a.valid.length} đơn vào chờ xác nhận`;
    $("#imp-out").innerHTML = `<div class="flex flex-wrap gap-2 text-sm">${badge(`${a.valid.length} đơn mới · ${a.valid.reduce((t, d) => t + d.packages.length, 0)} kiện`, "ok")}${a.dupDb.length ? badge(`${a.dupDb.length} đã có (Vận đơn / Đơn dự báo)`, "warn") : ""}${a.res.duplicatesInFile.length ? badge(`${a.res.duplicatesInFile.length} trùng trong file`, "warn") : ""}${a.errors.length ? badge(`${a.errors.length} dòng lỗi`, "bad") : ""}</div>
      ${a.res.ignoredColumns.length ? `<p class="mt-1 text-xs muted">Cột không dùng: ${esc(a.res.ignoredColumns.join(", "))}</p>` : ""}
      ${a.errors.length ? `<ul class="mt-2 list-disc pl-5 text-xs" style="color:#dc2626">${a.errors.map((e) => `<li>${e.row ? "Dòng " + e.row : ""}${e.billCode ? " · " + esc(e.billCode) : ""}: ${esc(e.message)}</li>`).join("")}</ul>` : ""}
      ${a.dupDb.length || a.res.duplicatesInFile.length ? `<p class="mt-2 text-xs" style="color:#b45309">Bị chặn trùng order_key: ${esc([...a.dupDb, ...a.res.duplicatesInFile.map((d) => `dòng ${d.row} (${d.orderKey})`)].join(", "))}</p>` : ""}
      ${a.res.warnings.length ? `<ul class="mt-2 list-disc pl-5 text-xs muted">${a.res.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      ${a.valid.length ? `<div class="card scroll mt-2"><table class="t"><thead><tr><th>order_key</th><th>Tuyến</th><th>Đến</th><th class="num">Kiện</th><th>Ngày phát sinh</th></tr></thead><tbody>${a.valid.map((d) => `<tr><td><b>${esc(d.orderKey)}</b></td><td>${esc(d.routeCode)}</td><td>${d.destinationIso2}</td><td class="num">${d.packages.length}</td><td class="num">${esc((d.createdAt || "").slice(0, 16).replace("T", " "))}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  },
  "imp-commit": () => {
    const a = analyzeImport();
    stageDrafts(a.valid, "IMPORT", ui.impLabel || "Dán từ Excel");
    save(); closeDialog(); ui.drafts.status = "CHO_XAC_NHAN"; render();
    toast(`Đã đưa ${a.valid.length} đơn vào Đơn hàng dự báo, chặn ${a.dupDb.length + a.res.duplicatesInFile.length} đơn trùng, bỏ qua ${a.errors.length} dòng lỗi.`);
  },
  "quote-run": () => { $$("[data-q]").forEach((i) => (ui.quote[i.dataset.q] = i.value)); ui.quote.ran = true; render(); },
  "qp-open": () => { $$("[data-q]").forEach((i) => (ui.quote[i.dataset.q] = i.value)); qpDialog(); },
  "qp-add": () => { ui.quote.rows.push(QI.emptyPackageRow()); qpReopen(`${ui.quote.rows.length - 1}:qty`); },
  "qp-del": (el) => { const i = Number(el.dataset.i); ui.quote.rows.splice(i, 1); if (!ui.quote.rows.length) ui.quote.rows.push(QI.emptyPackageRow()); qpDialog(); },
  "qp-clear": () => { ui.quote.rows = [QI.emptyPackageRow()]; qpDialog(); },
  "qp-done": () => closeDialog(),
  "ver-open": (el, e) => { e.preventDefault(); ui.ver = Number(el.dataset.id); render(); },
  "ver-back": () => { ui.ver = null; render(); },
  "ver-toggle": (el) => {
    const v = S.versions.find((x) => x.id === Number(el.dataset.id));
    if ((v.status || "ACTIVE") === "ACTIVE") v.status = "ARCHIVED";
    else {
      const clash = S.versions.find((x) => x !== v && (x.status || "ACTIVE") === "ACTIVE" && x.routeCode === v.routeCode && x.kind === v.kind && x.customerCode === v.customerCode && x.priceGroupCode === v.priceGroupCode && x.effectiveFrom <= (v.effectiveTo || "9999") && (x.effectiveTo || "9999") >= v.effectiveFrom);
      if (clash) return toast(`Khoảng hiệu lực trùng với phiên bản #${clash.id} đang áp dụng.`, "bad");
      v.status = "ACTIVE";
    }
    const cat = catalogOf(S); let n = 0; S.orders.forEach((o) => (o.route === v.routeCode || o.assigned === v.routeCode) && reprice(S, o, cat) && n++);
    save(); render(); toast(`Đã ${v.status === "ACTIVE" ? "kích hoạt" : "lưu trữ"} phiên bản #${v.id}; tính lại ${n} đơn chưa khóa.`, v.status === "ACTIVE" ? "ok" : "warn");
  },
  "pimp-open": () => priceImportDialog(),
  "pimp-open-scope": (el) => priceImportDialog({ type: el.dataset.t, code: el.dataset.id }),
  "pimp-sample": () => { ui.piSheets = null; $("#pi-src").textContent = "Nguồn: dữ liệu dán."; $("#pi-text").value = priceSample(); },
  "pimp-template": () => downloadPriceTemplate().catch((err) => toast("Không tạo được file mẫu: " + err.message, "bad")),
  "pimp-check": () => {
    if (!$("#pi-date").value) return toast("Bắt buộc chọn Ngày hiệu lực.", "bad");
    const a = analyzePrice();
    $("#pi-commit").disabled = !!a.errors.length || !a.blocks.length;
    $("#pi-out").innerHTML = (a.errors.length ? `<div class="card mb-2 p-3 text-sm" style="border-color:#dc2626;color:#dc2626"><b>Chưa thể nhập:</b><ul class="list-disc pl-5">${a.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : `<div class="card mb-2 p-3 text-sm" style="border-color:#059669">Hợp lệ — sẽ tạo ${a.blocks.length} phiên bản mới hiệu lực từ ${V.viDate(a.from)}.</div>`) +
      a.blocks.map(({ b, plan }) => `<div class="card mb-2 p-3 text-sm"><div class="mb-1 flex flex-wrap items-center gap-2"><b>${esc(b.routeCode)}</b><span class="text-xs muted">${b.cellRef}</span>${badge(MODE_LABEL[b.mode])}${badge(b.currency, "muted")}</div>
        <p>${b.countries.length} nước · ${b.zones.length} vùng: ${b.zones.map((z) => `<b>${z.zoneCode}</b> ${z.countries.join(", ")}`).join(" · ")}</p>
        <p class="muted">Ma trận: ${b.fixedWeights.length ? `${kg(b.fixedWeights[0])} → ${kg(b.fixedWeights.at(-1))} kg (${b.fixedWeights.length} mốc)` : "—"} · Theo kg: ${b.ranges.map((r) => `(${kg(r.weightMin) === "–" ? "0" : kg(r.weightMin)}, ${r.weightMax ? kg(r.weightMax) : "∞"}]`).join(" ") || "—"}</p>
        ${plan?.ok ? `<p class="mt-1 rounded p-2 text-xs" style="background:var(--soft)">${plan.close.map((c) => `Phiên bản #${c.id} (${V.viDate(c.effectiveFrom)} → ${V.viDate(c.oldEffectiveTo)}) sẽ kết thúc ${V.viDate(c.newEffectiveTo)} — giá cũ giữ nguyên cho đơn quá khứ.`).join(" ") || "Phiên bản đầu tiên."}</p>` : ""}
        ${b.warnings.length ? `<details class="mt-1 text-xs"><summary style="color:#b45309">${b.warnings.length} cảnh báo</summary><ul class="list-disc pl-5 muted">${b.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}</div>`).join("");
  },
  "pimp-commit": () => {
    const a = analyzePrice();
    if (a.errors.length) return toast(a.errors[0], "bad");
    try {
      for (const { b } of a.blocks)
        addPriceVersion(S, { routeCode: b.routeCode, kind: a.kind, scope: a.scope, from: a.from, mode: b.mode, currency: b.currency, name: `${b.routeCode} · ${a.kind === "COST" ? "Giá gốc" : "Giá bán"} · ${scopeText(a.scope)}`, note: `Import ${ui.piSheets ? "file Excel" : "dán từ Excel"} (${b.sheet} · ${b.cellRef})`, zones: b.zones.map((z) => ({ zoneCode: z.zoneCode, countries: z.countries, matrix: z.matrix, perKg: z.perKg })) });
    } catch (e) { return toast(e.message, "bad"); }
    const rr = repriceWhere(S, () => true);
    save(); closeDialog(); render(); toast(`Đã tạo ${a.blocks.length} phiên bản (${a.kind === "COST" ? "giá gốc" : "giá bán"} · ${scopeText(a.scope)}) hiệu lực từ ${V.viDate(a.from)}; ${RS.repriceMessage(rr) || "không có đơn chưa khóa bị ảnh hưởng"}. Đơn có ngày gửi trước ngày này vẫn dùng giá cũ.`);
  },
  "st-new": () => { location.hash = "tao-bang-ke"; },
  "st-back": () => { ui.st = null; if (location.hash !== "#bang-ke") location.hash = "bang-ke"; else render(); },
  "stn-search": () => {
    const n = ui.stNew; n.q = $("#stn-q").value.trim();
    let lk = stnLookup(n);
    const others = lk ? [...new Set(lk.other.map((x) => x.o.customer))] : [];
    if (lk && !lk.ok.length && others.length === 1) { n.cust = others[0]; n.sel = new Set(); lk = stnLookup(n); toast(`Các mã thuộc khách ${n.cust} — đã chuyển sang khách này.`, "warn"); }
    if (lk) lk.ok.forEach((o) => n.sel.add(o.id));
    render();
  },
  "stn-qclear": () => { ui.stNew.q = ""; render(); },
  "stn-unsel": () => { ui.stNew.sel = new Set(); render(); },
  "stn-switch": (el) => { const n = ui.stNew; n.cust = el.dataset.id; n.sel = new Set(); stnLookup(n)?.ok.forEach((o) => n.sel.add(o.id)); render(); },
  "st-open": (el) => { ui.st = Number(el.dataset.id); render(); },
  "st-create": () => {
    const n = ui.stNew;
    const ids = S.orders.filter((o) => n.sel.has(o.id) && stnBase(o, n)), ds = ids.map(pd).sort(), byCode = !!stnLookup(n);
    try { const st = createStatement(S, n.cust, ids.map((o) => o.id), byCode ? ds[0] : n.from || null, byCode ? ds.at(-1) : n.to || null); save(); ui.stNew = { cust: n.cust, from: "", to: "", q: "", sel: new Set() }; ui.stOpen = st.id; location.hash = "bang-ke"; toast(`Đã tạo ${st.name} (${st.items.length} đơn), chuyển “xuất bảng kê” và khóa giá các đơn.`); }
    catch (e) { toast(e.message, "bad"); }
  },
  "st-xlsx": (el, e) => { e.stopPropagation(); downloadStatementXlsx(S.statements.find((x) => x.id === Number(el.dataset.id))).catch((err) => toast("Không tạo được file Excel: " + err.message, "bad")); },
  "st-search": () => { ui.stq.q = $("#st-q").value.trim(); render(); },
  "st-qclear": () => { ui.stq.q = ""; render(); },
  "st-sort": (el, e) => { e.stopPropagation(); const f = ui.stq, k = el.dataset.k; if (f.sort !== k) Object.assign(f, { sort: k, dir: "asc" }); else if (f.dir === "asc") f.dir = "desc"; else f.sort = ""; render(); },
  "st-cancel": (el) => openDialog("Hủy bảng kê", `<div class="grid gap-3" data-id="${el.dataset.id}" id="f-cancel"><p class="text-sm muted">Bảng kê được đánh dấu “Đã hủy” (vẫn lưu lịch sử). Đơn không thuộc bảng kê hiệu lực khác về “Chưa thanh toán”, được mở khóa giá và tính lại giá ngay. Bảng kê đã có thu tiền: hủy hoặc sửa phiếu thu ở Đối soát trước.</p><label class="f"><span>Lý do hủy</span><textarea class="inp" id="cancel-reason" rows="3"></textarea></label><div class="flex justify-end gap-2"><button class="btn o" data-a="close">Không hủy</button><button class="btn d" data-a="st-cancel-ok">Xác nhận hủy</button></div></div>`),
  "st-cancel-ok": () => {
    const s = S.statements.find((x) => x.id === Number($("#f-cancel").dataset.id));
    s.status = "CANCELLED"; s.cancelReason = $("#cancel-reason").value.trim();
    let n = 0; const cat = catalogOf(S);
    s.items.forEach((it) => { const o = S.orders.find((x) => x.id === it.orderId); const other = S.statements.some((x) => x !== s && x.status === "ACTIVE" && x.items.some((i) => i.orderId === it.orderId)); if (o && !other) { o.debt = "Chưa thanh toán"; o.locked = false; reprice(S, o, cat); n++; } });
    save(); closeDialog(); render(); toast(`Đã hủy ${s.no}; ${n}/${s.items.length} đơn về “Chưa thanh toán”, đã mở khóa giá và tính lại giá.`, "warn");
  },
  "rc-cancel": (el) => {
    const r = S.receipts.find((x) => x.id === Number(el.dataset.id));
    openDialog(`Hủy phiếu thu ${r.no}`, `<div class="grid gap-3" id="f-rcx" data-id="${r.id}"><p class="text-sm muted">Phiếu thu ${money(r.amount)} đ được đánh dấu “Đã hủy” và giữ lịch sử. Toàn bộ phân bổ bị gỡ: bảng kê & đơn hàng trở về trạng thái công nợ như trước khi nhận tiền${r.overpaid ? "; số Thu thừa của phiếu này cũng mất" : ""}.</p>${r.allocs.length ? `<p class="rounded p-2 text-xs" style="background:var(--soft)">Đang phân bổ: ${r.allocs.map((a) => `${S.statements.find((s) => s.id === a.sid)?.no}: ${money(a.amount)}`).join(", ")}</p>` : ""}<label class="f"><span>Lý do hủy</span><textarea class="inp" id="rcx-reason" rows="2" placeholder="VD: nhập nhầm khách, khách hoàn tiền…"></textarea></label><div class="flex justify-end gap-2"><button class="btn o" data-a="close">Không hủy</button><button class="btn d" data-a="rc-cancel-ok">Xác nhận hủy</button></div></div>`);
  },
  "rc-cancel-ok": () => {
    const r = S.receipts.find((x) => x.id === Number($("#f-rcx").dataset.id));
    const ids = r.allocs.map((a) => a.sid);
    Object.assign(r, { status: "CANCELLED", cancelReason: $("#rcx-reason").value.trim(), allocs: [] });
    recalcPaid(S); save(); closeDialog(); ui.rc.done = `Đã hủy phiếu thu ${r.no}; công nợ trả về như trước khi nhận${ids.length ? ` (${statusList(ids)})` : ""}.`; render();
  },
  "rc-edit": (el) => {
    const r = S.receipts.find((x) => x.id === Number(el.dataset.id));
    const lines = [...r.allocs.map((a) => { const st = S.statements.find((s) => s.id === a.sid); return { sid: st.id, no: st.no, max: st.total - st.paid + Number(a.amount), v: a.amount }; }),
      ...openSts(r.customer).filter((st) => !r.allocs.some((a) => a.sid === st.id)).map((st) => ({ sid: st.id, no: st.no, max: st.total - st.paid, v: 0 }))];
    openDialog(`Sửa phiếu thu ${r.no}`, `<div class="grid gap-3" id="f-rce" data-id="${r.id}">
      <div class="grid gap-3 sm:grid-cols-3"><label class="f"><span>Số tiền nhận (VND)</span><input class="inp" name="amount" data-c="fmt" value="${RF.formatThousands(String(r.amount))}" style="text-align:right;font-weight:600"></label><label class="f"><span>Mã giao dịch</span><input class="inp" name="bankRef" value="${esc(r.bankRef)}"></label><label class="f"><span>Người chuyển</span><input class="inp" name="payer" value="${esc(r.payer)}"></label></div>
      ${allocTable(lines)}<div class="flex justify-end gap-2"><button class="btn o" data-a="close">Hủy bỏ</button><button class="btn" data-a="rc-edit-save">Lưu thay đổi</button></div></div>`, true);
  },
  "rc-edit-save": () => {
    const box = $("#f-rce"), r = S.receipts.find((x) => x.id === Number(box.dataset.id));
    const amount = Number(RF.parseThousands($("[name=amount]", box).value) || 0), allocs = readAllocTable(box);
    if (!(amount > 0)) return toast("Nhập số tiền nhận.", "bad");
    const bad = allocs.find((a) => a.amount > a.max); if (bad) return toast(`Phân bổ cho ${bad.no} vượt tối đa.`, "bad");
    if (allocs.reduce((t, a) => t + a.amount, 0) > amount) return toast("Tổng phân bổ vượt quá số tiền nhận.", "bad");
    const ids = [...r.allocs.map((a) => a.sid), ...allocs.map((a) => a.sid)];
    Object.assign(r, { amount, bankRef: $("[name=bankRef]", box).value.trim(), payer: $("[name=payer]", box).value.trim(), allocs: allocs.map(({ sid, amount }) => ({ sid, amount })) });
    recalcPaid(S); save(); closeDialog(); ui.rc.done = `Đã sửa phiếu thu ${r.no}${r.overpaid ? `; Thu thừa ${money(r.overpaid)} đ` : ""}${ids.length ? ` (${statusList(ids)})` : ""}.`; render();
  },
  "credit-open": () => {
    const code = ui.rc.cust, credit = S.receipts.filter((r) => r.customer === code).reduce((t, r) => t + r.overpaid, 0);
    const sts = openSts(code), sug = RF.suggestAllocation(credit, sts.map((st) => ({ id: st.id, statementNo: st.no, balance: String(st.total - st.paid), issuedAt: st.issuedAt })));
    const lines = sts.map((st) => ({ sid: st.id, no: st.no, max: st.total - st.paid, v: Number(sug.allocations.find((a) => a.id === st.id)?.amount || 0) }));
    openDialog("Dùng tiền Thu thừa cho bảng kê", `<div class="grid gap-3" id="f-cr" data-credit="${credit}"><p class="text-sm">Số dư Thu thừa hiện có: <b style="color:var(--accent)">${money(credit)} đ</b>. Tiền lấy từ phiếu thu cũ nhất trước và ghi thành phân bổ của các phiếu đó. Đã điền sẵn gợi ý (${esc(sug.label)}).</p>${allocTable(lines)}<div class="flex justify-end gap-2"><button class="btn o" data-a="close">Hủy bỏ</button><button class="btn" data-a="credit-save">Phân bổ Thu thừa</button></div></div>`, true);
  },
  "credit-save": () => {
    const box = $("#f-cr"), credit = Number(box.dataset.credit), allocs = readAllocTable(box), need = allocs.reduce((t, a) => t + a.amount, 0);
    if (!need) return toast("Nhập số tiền dùng cho ít nhất một bảng kê.", "bad");
    const bad = allocs.find((a) => a.amount > a.max); if (bad) return toast(`Phân bổ cho ${bad.no} vượt số còn nợ.`, "bad");
    if (need > credit) return toast(`Số dư Thu thừa chỉ còn ${money(credit)} đ.`, "bad");
    const pool = S.receipts.filter((r) => r.customer === ui.rc.cust && r.status !== "CANCELLED" && r.overpaid > 0).sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
    const used = new Set();
    for (const a of allocs) {
      let rest = a.amount;
      for (const r of pool) {
        if (rest <= 0) break;
        const left = r.amount - r.allocs.reduce((t, x) => t + Number(x.amount), 0);
        if (left <= 0) continue;
        const take = Math.min(rest, left);
        const ex = r.allocs.find((x) => x.sid === a.sid);
        ex ? (ex.amount = Number(ex.amount) + take) : r.allocs.push({ sid: a.sid, amount: take });
        rest -= take; used.add(r.no);
      }
    }
    recalcPaid(S); save(); closeDialog();
    ui.rc.done = `Đã dùng ${money(need)} đ tiền Thu thừa (từ ${[...used].join(", ")}) — ${statusList(allocs.map((a) => a.sid))}. Còn lại ${money(credit - need)} đ.`; render();
  },
  "al-full": (el) => { const tr = el.closest(".al"); $("input", tr).value = RF.formatThousands(tr.dataset.max); },
  "rc-full": (el) => { const s = S.statements.find((x) => x.id === Number(el.dataset.id)); ui.rc.manual = true; ui.rc.alloc[s.id] = RF.formatThousands(String(s.total - s.paid)); rcRefresh(); },
  "rc-apply": () => { rcApplySuggestion(); rcRefresh(); },
  "rc-tab": (el) => { ui.rc.tab = el.dataset.v; ui.rc.done = null; render(); },
  "rc-proof-del": (el) => { ui.rc.proofs.splice(Number(el.dataset.i), 1); $("#rc-proofs").innerHTML = proofsHtml(); },
  "rc-save": () => {
    const rc = ui.rc, fd = new FormData($("#f-rc"));
    const allocs = Object.entries(rc.alloc).map(([sid, v]) => ({ sid: Number(sid), amount: RF.parseThousands(v) })).filter((a) => Number(a.amount) > 0);
    try {
      const r = saveReceipt(S, { customer: rc.cust, amount: RF.parseThousands(rc.amount), allocs, bankRef: fd.get("bankRef"), payer: fd.get("payer"), account: fd.get("account"), proofs: rc.proofs });
      const sts = allocs.map((a) => S.statements.find((s) => s.id === a.sid)).map((s) => `${s.no} → ${s.debt}`).join("; ");
      ui.rc = { cust: rc.cust, amount: "", alloc: {}, manual: false, proofs: [], tab: rc.tab, lf: rc.lf, done: `Đã lưu phiếu thu ${r.no} (${money(r.amount)} đ). ${sts}${r.overpaid ? `. Ghi nhận Thu thừa ${money(r.overpaid)} đ.` : "."}` };
      save(); render();
    } catch (e) { toast(e.message, "bad"); }
  },
  "cu-edit": (el) => {
    const c = el.dataset.id ? cust(el.dataset.id) : null, isNew = !c, x = c || { code: "", name: "", phone: "", email: "", address: "", saleId: null, group: null, adjust: "0", sheet: "", currency: "VND", note: "" };
    openDialog(isNew ? "Thêm khách hàng mới" : `Sửa khách hàng ${x.code}`, `<div class="grid gap-3" id="f-cu" data-id="${esc(c?.code || "")}">
    <div class="grid gap-3 sm:grid-cols-2">
    <label class="f"><span>Mã khách hàng *</span><input class="inp uppercase" name="code" value="${esc(x.code)}" ${isNew ? "" : "readonly"} placeholder="VD: SKL200"></label>
    <label class="f"><span>Tên khách hàng *</span><input class="inp" name="name" value="${esc(x.name)}"></label>
    <label class="f"><span>Số điện thoại</span><input class="inp" name="phone" value="${esc(x.phone || "")}"></label>
    <label class="f"><span>Email</span><input class="inp" name="email" value="${esc(x.email || "")}"></label>
    <label class="f sm:col-span-2"><span>Địa chỉ</span><input class="inp" name="address" value="${esc(x.address || "")}"></label>
    <label class="f"><span>Sale phụ trách</span><select class="inp" name="saleId"><option value="">— Chưa gán —</option>${S.users.filter((u) => u.role === "SALE").map((u) => `<option value="${u.id}" ${u.id === x.saleId ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label>
    <label class="f"><span>Tiền tệ</span><select class="inp" name="currency">${["VND", "USD"].map((k) => `<option ${k === (x.currency || "VND") ? "selected" : ""}>${k}</option>`).join("")}</select></label>
    <label class="f"><span>Nhóm giá</span><select class="inp" name="group"><option value="">Bảng giá chung</option>${S.groups.filter((g) => g.active).map((g) => `<option value="${g.code}" ${x.group === g.code ? "selected" : ""}>${esc(g.name)} (${g.code}) · ${Number(g.adjust) > 0 ? "+" : ""}${Number(g.adjust)}%</option>`).join("")}</select></label>
    <label class="f"><span>% riêng của khách (áp thêm trên giá nhóm / giá chung)</span><input class="inp" name="adjust" value="${esc(x.adjust)}"></label>
    <label class="f sm:col-span-2"><span>Link Google Sheet nhập đơn (SkyLane cấp cho khách)</span><input class="inp" name="sheet" value="${esc(x.sheet || "")}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
    <label class="f sm:col-span-2"><span>Ghi chú</span><textarea class="inp" name="note" rows="2">${esc(x.note || "")}</textarea></label></div>
    <div class="flex justify-end gap-2"><button class="btn o" data-a="close">Hủy</button><button class="btn" data-a="cu-save">${isNew ? "Thêm khách hàng" : "Lưu & tính lại giá"}</button></div></div>`, true);
  },
  "cu-save": () => {
    const box = $("#f-cu"), v = (n) => $(`[name=${n}]`, box).value.trim();
    const code = (box.dataset.id || v("code")).toUpperCase(), adj = v("adjust").replace(",", ".") || "0";
    if (!code) return toast("Nhập mã khách hàng.", "bad");
    if (code.includes("|")) return toast("Mã khách hàng không được chứa ký tự |.", "bad");
    if (!v("name")) return toast("Nhập tên khách hàng.", "bad");
    if (v("email") && !/^\S+@\S+\.\S+$/.test(v("email"))) return toast("Email không hợp lệ.", "bad");
    if (!/^-?\d+(\.\d+)?$/.test(adj) || Number(adj) <= -100) return toast("% điều chỉnh không hợp lệ.", "bad");
    let c = cust(code);
    if (!box.dataset.id && c) return toast(`Mã khách hàng ${code} đã tồn tại.`, "bad");
    if (!c) S.customers.push((c = { code }));
    Object.assign(c, { name: v("name"), phone: v("phone"), email: v("email").toLowerCase(), address: v("address"), saleId: v("saleId") || null, currency: v("currency"), group: v("group") || null, adjust: adj, sheet: v("sheet"), note: v("note") });
    const rr = repriceWhere(S, (o) => o.customer === c.code);
    save(); closeDialog(); render(); toast(box.dataset.id ? `Đã lưu ${c.code}; ${RS.repriceMessage(rr) || "khách chưa có đơn để tính lại"}.` : `Đã thêm khách hàng ${c.code} — ${c.name}.`);
  },
  "gr-edit": (el) => groupDialog(el.dataset.id),
  "gr-save": () => {
    const box = $("#f-gr"), v = (n) => $(`[name=${n}]`, box).value.trim();
    const code = (box.dataset.id || v("code")).toUpperCase(), adj = v("adjust").replace(",", ".");
    if (!code || !v("name")) return toast("Nhập mã và tên nhóm.", "bad");
    if (!/^-?\d+(\.\d+)?$/.test(adj) || Number(adj) <= -100) return toast("% không hợp lệ (phải > -100).", "bad");
    let g = S.groups.find((x) => x.code === code);
    if (!box.dataset.id && g) return toast(`Nhóm ${code} đã có.`, "bad");
    if (!g) S.groups.push((g = { code, note: "" }));
    Object.assign(g, { name: v("name"), adjust: adj, active: $("[name=active]", box).checked });
    const r = repriceWhere(S, (o) => cust(o.customer)?.group === code);
    save(); render(); groupDialog(code);
    toast(`Đã lưu nhóm ${code} (${GT.pctLabel(adj)}); ${RS.repriceMessage(r) || "nhóm chưa có đơn nào để tính lại"}.`);
  },
  "gr-view": (el) => priceVersionPreview(el.dataset.id, el.dataset.back),
  "gr-own": () => {
    const code = $("#f-gr").dataset.id, route = $("#gr-own-route").value, from = $("#gr-own-from").value;
    if (!route) return toast("Chọn tuyến.", "bad");
    if (!from) return toast("Chọn ngày hiệu lực.", "bad");
    const g = S.groups.find((x) => x.code === code);
    const base = S.versions.filter((v) => v.routeCode === route && v.kind === "SELL" && !v.customerCode && !v.priceGroupCode && (v.status || "ACTIVE") === "ACTIVE" && v.effectiveFrom <= from && (!v.effectiveTo || v.effectiveTo >= from)).sort((x, y) => (x.effectiveFrom < y.effectiveFrom ? 1 : -1))[0];
    if (!base) return toast(`Tuyến ${route} chưa có bảng giá bán chung hiệu lực ngày ${V.viDate(from)} để sao chép — hãy import bảng giá riêng cho nhóm.`, "bad");
    let res;
    try {
      res = addPriceVersion(S, { routeCode: route, kind: "SELL", scope: { type: "GROUP", code }, from, mode: base.mode, currency: base.currency || "VND", name: `${route} · Giá bán · Nhóm ${code}`, note: `Sao chép bảng giá bán chung (từ ${V.viDate(base.effectiveFrom)}) × (1 ${Number(g.adjust) < 0 ? "−" : "+"} ${Math.abs(Number(g.adjust))}%)`, zones: GT.scaleZones(base.zones, g.adjust, base.currency || "VND") });
    } catch (e) { return toast(e.message, "bad"); }
    const r = repriceWhere(S, (o) => cust(o.customer)?.group === code);
    save(); render(); groupDialog(code);
    toast(`Đã tạo bảng giá bán riêng tuyến ${route} cho nhóm ${code} từ ${V.viDate(from)}${res.closed ? ` (chốt ${res.closed} phiên bản riêng cũ)` : ""}; ${RS.repriceMessage(r) || "chưa có đơn nào để tính lại"}.`);
  },
  "gr-member": (el) => {
    const code = $("#f-gr").dataset.id, c = cust(el.dataset.id || $("#gr-add-member").value);
    if (!c) return toast("Chọn khách hàng.", "bad");
    const to = el.dataset.rm ? null : code;
    c.group = to;
    const r = repriceWhere(S, (o) => o.customer === c.code);
    save(); render(); groupDialog(code);
    toast(`${to ? `Đã chuyển ${c.code} vào nhóm ${code}` : `Đã bỏ ${c.code} khỏi nhóm (dùng giá chung)`}; ${RS.repriceMessage(r) || "khách chưa có đơn để tính lại"}.`);
  },
  "ro-edit": (el) => {
    const r0 = S.routes.find((x) => x.code === el.dataset.id), isNew = !r0, r = r0 || { code: "", supplier: "", service: "EPK", mode: "MAX_ACTUAL_VOL", dim: "5000" };
    const sups = [...new Set(S.routes.map((x) => x.supplier).filter(Boolean))].sort();
    openDialog(isNew ? "Thêm tuyến vận chuyển mới" : `Sửa tuyến ${r.code}`, `<div class="grid gap-3" id="f-ro" data-id="${esc(r0?.code || "")}">
    <div class="grid gap-3 sm:grid-cols-2">
    <label class="f"><span>Mã tuyến *</span><input class="inp uppercase" name="code" value="${esc(r.code)}" ${isNew ? "" : "readonly"} placeholder="VD: UPS HAN S6000"><span class="text-xs muted">Phải trùng tên tuyến trong file bảng giá & cột Tuyến vận chuyển của đơn.</span></label>
    <label class="f"><span>Nhà cung cấp (NCC) *</span><input class="inp uppercase" name="supplier" value="${esc(r.supplier || "")}" list="ro-sups" placeholder="VD: YUN"><datalist id="ro-sups">${sups.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></label></div>
    <label class="f"><span>Loại hình dịch vụ</span><select class="inp" name="service">${["EPK", "CPN", "CT"].map((s) => `<option value="${s}" ${s === r.service ? "selected" : ""}>${s} — ${SVC_ROUND[s]}</option>`).join("")}</select></label>
    <fieldset class="card grid gap-2 p-3"><legend class="px-1 text-sm font-medium">Cách tính cân (weight_calc_mode)</legend>
    <label class="flex items-start gap-2 text-sm"><input type="radio" name="mode" value="MAX_ACTUAL_VOL" ${r.mode === "MAX_ACTUAL_VOL" ? "checked" : ""}><span><b>Lấy max (cân thực, thể tích)</b><br><span class="text-xs muted">So sánh cân thực với D×R×C / DIM</span></span></label>
    <label class="flex items-start gap-2 text-sm"><input type="radio" name="mode" value="ACTUAL_ONLY" ${r.mode === "ACTUAL_ONLY" ? "checked" : ""}><span><b>Chỉ cân thực</b><br><span class="text-xs muted">Bỏ qua thể tích, không dùng DIM</span></span></label>
    <label class="f"><span>Hệ số DIM</span><input class="inp" name="dim" value="${esc(r.dim)}"></label></fieldset>
    <div class="flex justify-end gap-2"><button class="btn o" data-a="close">Hủy</button><button class="btn" data-a="ro-save">${isNew ? "Thêm tuyến" : "Lưu & tính lại giá"}</button></div>${isNew ? `<p class="text-xs muted">Sau khi thêm, vào Bảng giá để tải giá gốc / giá bán cho tuyến này; đơn của tuyến chưa có bảng giá sẽ báo thiếu giá.</p>` : ""}</div>`);
  },
  "ro-save": () => {
    const box = $("#f-ro"), code = (box.dataset.id || $("[name=code]", box).value).trim().replace(/\s+/g, " ").toUpperCase(), supplier = $("[name=supplier]", box).value.trim().toUpperCase();
    if (!code) return toast("Nhập mã tuyến.", "bad");
    if (!supplier) return toast("Nhập nhà cung cấp.", "bad");
    let r = S.routes.find((x) => x.code.toUpperCase() === code);
    if (!box.dataset.id && r) return toast(`Tuyến ${code} đã tồn tại.`, "bad");
    const dim = IX.parseNumberCell($("[name=dim]", box).value.trim(), "price");
    if (!dim || dim === "0") return toast("Hệ số DIM phải lớn hơn 0.", "bad");
    if (!r) S.routes.push((r = { code, name: code }));
    Object.assign(r, { supplier, service: $("[name=service]", box).value, mode: $("[name=mode]:checked", box).value, dim });
    const rr = repriceWhere(S, (o) => o.route === r.code || o.assigned === r.code);
    save(); closeDialog(); render(); toast(box.dataset.id ? `Đã lưu ${r.code}; ${RS.repriceMessage(rr) || "không có đơn nào dùng tuyến này"}.` : `Đã thêm tuyến ${r.code} (${r.supplier} · ${r.service}).${rr.repriced ? ` ${RS.repriceMessage(rr)}.` : ""}`);
  },
};

document.addEventListener("click", (e) => {
  if (!e.target.closest('[data-a="copy-menu"]')) closeCopyMenu();
  const el = e.target.closest("[data-a]");
  if (!el || el.disabled) return;
  const fn = A[el.dataset.a];
  if (fn) fn(el, e);
});
document.addEventListener("change", (e) => {
  const el = e.target, c = el.dataset.c;
  if (!c) return;
  if (c === "role") { S.me = el.value; ui.orders.sel.clear(); ui.rc = null; ui.st = ui.stNew = ui.ver = null; save(); if (location.hash.slice(1) !== current()) location.hash = current(); render(); toast(`Đang dùng vai trò ${P.ROLE_LABEL[me().role]} — ${me().name}.`); }
  else if (c === "nav") location.hash = el.value;
  else if (c === "o-quick") { ui.orders[el.dataset.k] = el.value; ui.orders.page = 1; render(); }
  else if (c.startsWith("dash.")) { ui.dash[c.slice(5)] = el.value; render(); }
  else if (c === "sel") { const id = Number(el.value); el.checked ? ui.orders.sel.add(id) : ui.orders.sel.delete(id); render(); }
  else if (c === "sel-page") { $$('[data-c="sel"]').forEach((x) => (el.checked ? ui.orders.sel.add(Number(x.value)) : ui.orders.sel.delete(Number(x.value)))); render(); }
  else if (c === "ver-route") { ui.verRoute = el.value; render(); }
  else if (c === "dr-cust") { ui.drafts.cust = el.value; render(); }
  else if (c === "dr-sel") { const id = Number(el.value); el.checked ? ui.drafts.sel.add(id) : ui.drafts.sel.delete(id); render(); }
  else if (c === "dr-all") { $$('[data-c="dr-sel"]').forEach((x) => (el.checked ? ui.drafts.sel.add(Number(x.value)) : ui.drafts.sel.delete(Number(x.value)))); render(); }
  else if (c === "imp-file") readImportFile(el.files[0]);
  else if (c === "tpl-cust") templateDialog(el.value);
  else if (c === "pi-file") readPriceFile(el.files[0]);
  else if (c === "pi-kind") { $("#pi-scope-box").style.display = el.value === "SELL" ? "" : "none"; $("#pi-commit").disabled = true; }
  else if (c === "pi-scope") { $("#pi-scode-box").style.display = el.value === "DEFAULT" ? "none" : ""; $("#pi-scode-label").textContent = el.value === "CUSTOMER" ? "Khách hàng *" : "Nhóm giá *"; $("#pi-scode").innerHTML = scopeOptions(el.value); $("#pi-commit").disabled = true; }
  else if (c === "ver-kind") { ui.verKind = el.value; render(); }
  else if (c === "stn-cust") { ui.stNew = { ...ui.stNew, cust: el.value, sel: new Set() }; if (ui.stNew.q) stnLookup(ui.stNew)?.ok.forEach((o) => ui.stNew.sel.add(o.id)); render(); }
  else if (c === "stn-from" || c === "stn-to") { ui.stNew[c.slice(4)] = el.value; render(); }
  else if (c === "stn-sel") { const id = Number(el.value); el.checked ? ui.stNew.sel.add(id) : ui.stNew.sel.delete(id); render(); }
  else if (c === "stn-all") { const n = ui.stNew, lk = stnLookup(n), ok = lk ? new Set(lk.ok.map((o) => o.id)) : null; const ids = S.orders.filter((o) => stnBase(o, n) && (ok ? ok.has(o.id) : (!n.from || pd(o) >= n.from) && (!n.to || pd(o) <= n.to))).map((o) => o.id); ids.forEach((id) => (el.checked ? n.sel.add(id) : n.sel.delete(id))); render(); }
  else if (c === "rc-cust") { ui.rc = { cust: el.value, amount: "", alloc: {}, manual: false, proofs: [], done: null, tab: ui.rc?.tab || "form", lf: ui.rc?.lf || { q: "", from: "", to: "", status: "ACTIVE" } }; render(); }
  else if (c === "rl-from" || c === "rl-to" || c === "rl-status") { ui.rc.lf[c.slice(3)] = el.value; render(); }
  else if (c === "rc-file") { addProofs([...el.files]); el.value = ""; }
});
document.addEventListener("input", (e) => {
  const el = e.target, c = el.dataset.c;
  const row = el.closest('[data-c="bulk-row"]');
  if (row && el.type !== "checkbox") $("input[type=checkbox]", row).checked = true;
  if (el.dataset.qp) { const [i, k] = el.dataset.qp.split(":"); ui.quote.rows[Number(i)][k] = el.value; qpRefreshTotal(); }
  if (c === "imp-text") ui.impRows = null;
  if (e.target.id === "pi-text") { ui.piSheets = null; const s = $("#pi-src"); if (s) s.textContent = "Nguồn: dữ liệu dán."; }
  if (c === "fmt") el.value = RF.formatThousands(el.value);
  if (c === "od-sell" || c === "od-unit") {
    // Giá bán ⇄ đơn giá/kg (theo cân tính phí hiện tại)
    const o = S.orders.find((x) => x.id === Number($("#f-od").dataset.id)), v = RF.formatThousands(el.value);
    el.value = v;
    const other = $(`[data-c="${c === "od-sell" ? "od-unit" : "od-sell"}"]`);
    if (other) other.value = !v ? "" : c === "od-sell" ? RF.formatThousands(TT.unitPrice(RF.parseThousands(v), o.billed) || "") : RF.formatThousands(TT.amountFromUnit(RF.parseThousands(v), o.billed));
  }
  if (c === "dr-q") { ui.drafts.q = el.value; const pos = el.selectionStart; render(); const n = $('[data-c="dr-q"]'); n.focus(); n.setSelectionRange(pos, pos); }
  if (c === "rl-q") { ui.rc.lf.q = el.value; const pos = el.selectionStart; render(); const n = $('[data-c="rl-q"]'); n.focus(); n.setSelectionRange(pos, pos); }
  if (c === "o-q") { ui.orders.q = el.value; ui.orders.page = 1; const pos = el.selectionStart; render(); const n = $('[data-c="o-q"]'); n.focus(); n.setSelectionRange(pos, pos); }
  if (c === "rc-amount") {
    const f = RF.formatThousands(el.value); el.value = f; ui.rc.amount = f; ui.rc.done = null;
    if (!ui.rc.manual) rcApplySuggestion();
    rcRefresh();
  }
  if (c === "rc-alloc") { const f = RF.formatThousands(el.value); el.value = f; ui.rc.alloc[el.dataset.id] = f; ui.rc.manual = true; rcRefresh(); }
});
// Kích thước thông tin: dán nhiều dòng từ Excel; Enter ở dòng cuối thêm dòng
document.addEventListener("paste", (e) => {
  const el = e.target.closest?.("[data-qp]");
  if (!el) return;
  const text = e.clipboardData.getData("text");
  if (!/[\t\n]/.test(text.trim())) return;
  e.preventDefault();
  const i = Number(el.dataset.qp.split(":")[0]), rows = ui.quote.rows;
  rows.splice(i, 1, ...QI.parsePastedRows(text));
  qpDialog();
});
document.addEventListener("keydown", (e) => {
  const el = e.target.closest?.("[data-qp]");
  if (!el || e.key !== "Enter") return;
  e.preventDefault();
  const i = Number(el.dataset.qp.split(":")[0]);
  if (i === ui.quote.rows.length - 1) { ui.quote.rows.push(QI.emptyPackageRow()); qpReopen(`${i + 1}:qty`); }
  else $(`[data-qp="${i + 1}:${el.dataset.qp.split(":")[1]}"]`)?.focus();
});
// Chuột phải trên 1 dòng vận đơn → menu Sao chép
document.addEventListener("contextmenu", (e) => {
  const tr = e.target.closest("tr[data-oid]");
  if (!tr || current() !== "don-hang") return;
  e.preventDefault();
  openCopyMenu(e.clientX, e.clientY, Number(tr.dataset.oid));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCopyMenu();
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id === "o-q") A["o-search"]();
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id === "stn-q") A["stn-search"]();
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id === "st-q") A["st-search"]();
});
addEventListener("scroll", () => Date.now() - (openCopyMenu.at || 0) > 250 && closeCopyMenu(), true); // bỏ qua cuộn quán tính ngay lúc mở menu
document.addEventListener("paste", (e) => {
  if (current() !== "doi-soat" || !ui.rc || !can("receipts.manage")) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { e.preventDefault(); addProofs(files); toast("Đã dán ảnh minh chứng."); }
});
addEventListener("scroll", () => { if (ui.lastView) ui.scroll[ui.lastView] = window.scrollY; }, { passive: true });
document.addEventListener("auxclick", (e) => { const t = e.button === 1 && e.target.closest("[data-tab]"); if (t) { e.preventDefault(); closeTab(t.dataset.tab); } });
addEventListener("hashchange", () => { ui.ver = null; ui.st = ui.stOpen ?? null; ui.stOpen = null; render(); });
render();
if (fixedSync) { save(); toast(`Đã gỡ ${fixedSync} đơn bị đồng bộ nhầm (lỗi sheet mô phỏng dùng chung). Đồng bộ lại để lấy đơn đúng của từng khách.`, "warn"); }
}
