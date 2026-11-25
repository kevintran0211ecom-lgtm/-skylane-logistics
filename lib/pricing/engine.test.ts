import { describe, expect, it } from "vitest";
import {
  PricingError,
  calcBillWeight,
  calcOrderPricing,
  pricingDate,
  priceForWeight,
  quoteVersion,
  selectVersion,
  type OrderPricingInput,
  type PackageInput,
  type PriceVersion,
  type PricingCatalog,
  type RouteConfig,
} from "./engine";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------
const route = (
  routeCode: string,
  serviceType: RouteConfig["serviceType"],
  weightCalcMode: RouteConfig["weightCalcMode"],
  dimDivisor: number | string,
): RouteConfig => ({ routeCode, serviceType, weightCalcMode, dimDivisor });

const R = {
  EPK: route("US-EPK", "EPK", "MAX_ACTUAL_VOL", 6000),
  EPK_ACT: route("US-EPK-ACT", "EPK", "ACTUAL_ONLY", 6000),
  CPN: route("US-CPN", "CPN", "MAX_ACTUAL_VOL", 5000),
  CPN_ACT: route("US-CPN-ACT", "CPN", "ACTUAL_ONLY", 5000),
  CT: route("US-CT", "CT", "MAX_ACTUAL_VOL", "5000.00"),
};

const pkg = (actualWeight: number | string, l = 0, w = 0, h = 0): PackageInput => ({
  actualWeight,
  lengthCm: l,
  widthCm: w,
  heightCm: h,
});

const matrix = (...pairs: [number, number][]) => pairs.map(([weightMax, price]) => ({ weightMax, price }));

const version = (v: Partial<PriceVersion> & Pick<PriceVersion, "id" | "routeCode" | "kind" | "mode" | "effectiveFrom">): PriceVersion => ({
  zones: [],
  ...v,
});

const zoneUS = (m: ReturnType<typeof matrix>, perKg: PriceVersion["zones"][number]["perKg"] = []) => [
  { zoneCode: "Z1", countries: ["US", "ca"], matrix: m, perKg },
];

const versions: PriceVersion[] = [
  // Giá bán chung US-EPK tháng 10 & từ tháng 11 (ma trận ≤20kg + theo kg >20kg)
  version({
    id: "SELL-OCT", routeCode: "US-EPK", kind: "SELL", mode: "MA_TRAN+THEO_KG",
    effectiveFrom: "2026-10-01", effectiveTo: "2026-10-31",
    zones: zoneUS(matrix([0.5, 100000], [1, 150000], [5, 400000], [10, 700000], [20, 1200000]), [
      { weightMin: 20, weightMax: null, unitPrice: 60000 },
    ]),
  }),
  version({
    id: "SELL-NOV", routeCode: "US-EPK", kind: "SELL", mode: "MA_TRAN+THEO_KG", effectiveFrom: "2026-11-01",
    zones: zoneUS(matrix([0.5, 110000], [1, 160000], [5, 420000], [10, 750000], [20, 1300000]), [
      { weightMin: "20", weightMax: "45", unitPrice: "65000" },
      { weightMin: "45", weightMax: null, unitPrice: "60000" },
    ]),
  }),
  // Bản nháp trùng ngày — không được chọn
  version({
    id: "SELL-DRAFT", routeCode: "US-EPK", kind: "SELL", mode: "MA_TRAN", effectiveFrom: "2026-11-01",
    status: "DRAFT", zones: zoneUS(matrix([20, 1])),
  }),
  // Giá nhóm VIP & giá riêng KH SKL116
  version({
    id: "SELL-VIP", routeCode: "US-EPK", kind: "SELL", mode: "MA_TRAN+THEO_KG", priceGroupCode: "VIP",
    effectiveFrom: "2026-11-01", zones: zoneUS(matrix([0.5, 99999], [1, 140000], [20, 1000000])),
  }),
  version({
    id: "SELL-SKL116", routeCode: "US-EPK", kind: "SELL", mode: "MA_TRAN+THEO_KG", customerCode: "skl116 ",
    effectiveFrom: "2026-11-01", zones: zoneUS(matrix([1, 120000], [20, 900000])),
  }),
  // Giá gốc US-EPK: theo kg toàn dải
  version({
    id: "COST-EPK", routeCode: "US-EPK", kind: "COST", mode: "THEO_KG", effectiveFrom: "2026-10-01",
    zones: zoneUS([], [{ weightMin: 0, weightMax: null, unitPrice: 40000 }]),
  }),
  // US-CPN: bán chỉ ma trận (mốc tới 30kg), gốc ma trận + theo kg
  version({
    id: "SELL-CPN", routeCode: "US-CPN", kind: "SELL", mode: "MA_TRAN", effectiveFrom: "2026-10-01",
    zones: zoneUS(matrix([0.5, 90000], [1, 130000], [2, 200000], [30, 2000000])),
  }),
  version({
    id: "COST-CPN", routeCode: "US-CPN", kind: "COST", mode: "MA_TRAN+THEO_KG", effectiveFrom: "2026-10-01",
    zones: zoneUS(matrix([0.5, 50000], [1, 80000], [5, 200000], [20, 600000]), [
      { weightMin: 20, weightMax: null, unitPrice: 30000 },
    ]),
  }),
];

const catalog: PricingCatalog = { routes: Object.values(R), versions };

const order = (o: Partial<OrderPricingInput>): OrderPricingInput => ({
  customerCode: "SKL200",
  routeCode: "US-EPK",
  destinationIso2: "US",
  createdAt: "2026-11-20T03:00:00Z",
  packages: [pkg(0.8)],
  ...o,
});

const errorCode = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PricingError) return e.code;
    throw e;
  }
  return undefined;
};

// -----------------------------------------------------------------------------
// 1. Cân từng kiện: ACTUAL_ONLY vs MAX_ACTUAL_VOL
// -----------------------------------------------------------------------------
describe("Cân từng kiện", () => {
  it("MAX_ACTUAL_VOL lấy thể tích khi lớn hơn cân thực (50×40×30/6000 = 10 > 3)", () => {
    const r = calcBillWeight([pkg(3, 50, 40, 30)], R.EPK);
    expect(r.packages[0]).toEqual({ actualWeight: "3.000", volumetricWeight: "10.000", chargeableWeight: "10.000" });
    expect(r.totalWeight).toBe("10.000");
  });

  it("MAX_ACTUAL_VOL lấy cân thực khi lớn hơn thể tích", () => {
    expect(calcBillWeight([pkg(12.34, 50, 40, 30)], R.EPK).totalWeight).toBe("12.350");
  });

  it("ACTUAL_ONLY (EPK) bỏ qua thể tích, chỉ lấy cân thực", () => {
    const r = calcBillWeight([pkg(3, 50, 40, 30)], R.EPK_ACT);
    expect(r.packages[0].chargeableWeight).toBe("3.000");
    expect(r.totalWeight).toBe("3.000");
  });

  it("ACTUAL_ONLY (CPN) bỏ qua thể tích 12kg, cân thực 3.2 làm tròn lên 3.5", () => {
    const r = calcBillWeight([pkg(3.2, 50, 40, 30)], R.CPN_ACT);
    expect(r.packages[0].volumetricWeight).toBe("12.000");
    expect(r.totalWeight).toBe("3.500");
  });

  it("Thiếu kích thước → thể tích 0, dùng cân thực", () => {
    expect(calcBillWeight([pkg(1.2, 30, 0, 20)], R.CT).packages[0].volumetricWeight).toBe("0.000");
  });
});

// -----------------------------------------------------------------------------
// 2. Làm tròn theo dịch vụ
// -----------------------------------------------------------------------------
describe("EPK", () => {
  it("không làm tròn từng kiện, tổng 1.01 + 1.02 = 2.03 → 2.05", () => {
    const r = calcBillWeight([pkg(1.01), pkg(1.02)], R.EPK);
    expect(r.packages.map((p) => p.chargeableWeight)).toEqual(["1.010", "1.020"]);
    expect(r.totalWeight).toBe("2.050");
  });

  it("thể tích lẻ 33×22×11/6000 = 1.331 → 1.35; bội số 0.05 giữ nguyên", () => {
    expect(calcBillWeight([pkg(1, 33, 22, 11)], R.EPK).totalWeight).toBe("1.350");
    expect(calcBillWeight([pkg("2.05")], R.EPK).totalWeight).toBe("2.050");
  });

  it("số thập phân chính xác, không sai số float: 0.1 + 0.2 = 0.30", () => {
    expect(calcBillWeight([pkg(0.1), pkg(0.2)], R.EPK).totalWeight).toBe("0.300");
  });
});

describe("CPN", () => {
  it("làm tròn từng kiện ≤20kg lên 0.5: 1.1 → 1.5, 2.6 → 3.0; tổng 4.5", () => {
    const r = calcBillWeight([pkg(1.1), pkg(2.6)], R.CPN);
    expect(r.packages.map((p) => p.chargeableWeight)).toEqual(["1.500", "3.000"]);
    expect(r.totalWeight).toBe("4.500");
  });

  it("ngưỡng 20kg của kiện: 20 giữ 20, 19.8 → 20, 20.2 → 21 (bước 1kg)", () => {
    expect(calcBillWeight([pkg(20)], R.CPN).totalWeight).toBe("20.000");
    expect(calcBillWeight([pkg(19.8)], R.CPN).totalWeight).toBe("20.000");
    expect(calcBillWeight([pkg(20.2)], R.CPN).totalWeight).toBe("21.000");
  });

  it("tổng bill vượt 20kg làm tròn tiếp lên 1kg: 10.2→10.5 + 9.8→10 = 20.5 → 21", () => {
    const r = calcBillWeight([pkg(10.2), pkg(9.8)], R.CPN);
    expect(r.packages.map((p) => p.chargeableWeight)).toEqual(["10.500", "10.000"]);
    expect(r.totalWeight).toBe("21.000");
  });

  it("kiện theo thể tích: 40×30×20/5000 = 4.8 > 2 → 5.0", () => {
    expect(calcBillWeight([pkg(2, 40, 30, 20)], R.CPN).totalWeight).toBe("5.000");
  });
});

describe("CT", () => {
  it("không làm tròn từng kiện, tổng 1.2 + 2.3 = 3.5 → 4", () => {
    const r = calcBillWeight([pkg(1.2), pkg(2.3)], R.CT);
    expect(r.packages.map((p) => p.chargeableWeight)).toEqual(["1.200", "2.300"]);
    expect(r.totalWeight).toBe("4.000");
  });

  it("số nguyên giữ nguyên, quanh ngưỡng 20kg: 20 → 20, 20.01 → 21", () => {
    expect(calcBillWeight([pkg(3)], R.CT).totalWeight).toBe("3.000");
    expect(calcBillWeight([pkg(20)], R.CT).totalWeight).toBe("20.000");
    expect(calcBillWeight([pkg(20.01)], R.CT).totalWeight).toBe("21.000");
  });
});

// -----------------------------------------------------------------------------
// 3. Phiên bản theo Ngày gửi hàng & 3 chế độ bảng giá
// -----------------------------------------------------------------------------
describe("Ngày gửi hàng & phiên bản", () => {
  it("chưa có shipped_at → lấy created_at theo giờ Asia/Saigon", () => {
    // 2026-10-31 18:00 UTC = 2026-11-01 01:00 (+07) → bảng giá tháng 11
    expect(pricingDate(null, "2026-10-31T18:00:00Z")).toBe("2026-11-01");
    const r = calcOrderPricing(order({ createdAt: "2026-10-31T18:00:00Z" }), catalog);
    expect(r.billed).toMatchObject({ versionId: "SELL-NOV", amount: "160000" });
  });

  it("shipped_at được ưu tiên hơn created_at; effective_to tính trọn ngày", () => {
    const r = calcOrderPricing(
      order({ shippedAt: "2026-10-31T16:59:59Z", createdAt: "2026-11-05T03:00:00Z" }), // 23:59:59 ngày 31/10 (+07)
      catalog,
    );
    expect(r.pricingDate).toBe("2026-10-31");
    expect(r.billed).toMatchObject({ versionId: "SELL-OCT", amount: "150000" });
  });

  it("bỏ qua phiên bản DRAFT; không có phiên bản hiệu lực → NO_VERSION", () => {
    const picked = selectVersion(versions, { routeCode: "us-epk", kind: "SELL", date: "2026-11-20" });
    expect(picked?.version.id).toBe("SELL-NOV");
    expect(errorCode(() => calcOrderPricing(order({ createdAt: "2026-09-15T03:00:00Z" }), catalog))).toBe("NO_VERSION");
  });
});

describe("Chế độ bảng giá", () => {
  it("MA_TRAN: 0.75kg (CPN → 1.0) lấy mốc 1kg; vượt mốc cuối → WEIGHT_OUT_OF_RANGE", () => {
    const sell = versions.find((v) => v.id === "SELL-CPN")!;
    expect(priceForWeight(sell, "US", "1.0")).toBe("130000");
    expect(priceForWeight(sell, "US", "25")).toBe("2000000"); // MA_TRAN không giới hạn 20kg
    expect(errorCode(() => priceForWeight(sell, "US", "31"))).toBe("WEIGHT_OUT_OF_RANGE");
  });

  it("THEO_KG: 2.05kg × 40.000 = 82.000", () => {
    const cost = versions.find((v) => v.id === "COST-EPK")!;
    expect(priceForWeight(cost, "US", "2.05")).toBe("82000");
  });

  it("MA_TRAN+THEO_KG: đúng 20kg dùng ma trận, trên 20kg tính theo kg", () => {
    const nov = versions.find((v) => v.id === "SELL-NOV")!;
    expect(priceForWeight(nov, "US", "20")).toBe("1300000");
    // EPK 20.01 → 20.05kg × 65.000 = 1.303.250
    const r = calcOrderPricing(order({ packages: [pkg(20.01)] }), catalog);
    expect(r.billed).toMatchObject({ weight: "20.050", amount: "1303250" });
    // > 45kg sang khoảng 60.000/kg
    expect(priceForWeight(nov, "US", "50")).toBe("3000000");
  });

  it("nước không có vùng giá → ZONE_NOT_FOUND; mã nước được TRIM + UPPER", () => {
    expect(errorCode(() => calcOrderPricing(order({ destinationIso2: "JP" }), catalog))).toBe("ZONE_NOT_FOUND");
    expect(calcOrderPricing(order({ destinationIso2: " ca ", routeCode: " us-epk" }), catalog).billed.amount).toBe("160000");
  });
});

// -----------------------------------------------------------------------------
// 4. Ưu tiên giá bán: Mã KH → Nhóm giá → Giá chung × (1 + %)
// -----------------------------------------------------------------------------
describe("Giá bán theo khách hàng", () => {
  it("có giá riêng Mã KH → dùng giá riêng, không nhân điều chỉnh %", () => {
    const r = calcOrderPricing(order({ customerCode: "SKL116", priceGroupCode: "VIP", priceAdjustPct: 10 }), catalog);
    expect(r.billed).toMatchObject({ scope: "CUSTOMER", versionId: "SELL-SKL116", amount: "120000", adjustPct: "0.00" });
  });

  it("không có giá riêng → nhóm giá mặc định × (1 + %), VND làm tròn số nguyên", () => {
    const base = order({ customerCode: "SKL300", priceGroupCode: "vip", packages: [pkg(0.5)] });
    expect(calcOrderPricing({ ...base, priceAdjustPct: -5 }, catalog).billed).toMatchObject({
      scope: "GROUP", amount: "94999", adjustPct: "-5.00", // 99.999 × 0,95 = 94.999,05
    });
    expect(calcOrderPricing({ ...base, priceAdjustPct: "1.5" }, catalog).billed.amount).toBe("101499"); // 101.498,985
  });

  it("không có giá riêng & nhóm giá → bảng giá chung × (1 + %)", () => {
    const r = calcOrderPricing(order({ priceAdjustPct: 10 }), catalog);
    expect(r.billed).toMatchObject({ scope: "DEFAULT", versionId: "SELL-NOV", amount: "176000" });
  });
});

// -----------------------------------------------------------------------------
// 5. Hai tuyến độc lập & ghi đè thủ công
// -----------------------------------------------------------------------------
describe("Tuyến vận chuyển vs Tuyến chỉ định", () => {
  const packages = [pkg(1.5, 30, 20, 20)]; // thể tích 12000 cm³

  it("tính độc lập cân & giá cho mỗi tuyến; đổi assigned_route_code không đổi phía khách", () => {
    const a = calcOrderPricing(order({ packages, assignedRouteCode: "US-CPN" }), catalog);
    // Khách: US-EPK, DIM 6000 → 2.0kg → mốc 5kg = 420.000
    expect(a.billed).toMatchObject({ routeCode: "US-EPK", weight: "2.000", amount: "420000" });
    // NCC: US-CPN, DIM 5000 → 2.4 → 2.5kg → mốc 5kg = 200.000
    expect(a.shipped).toMatchObject({ routeCode: "US-CPN", weight: "2.500", amount: "200000", versionId: "COST-CPN" });
    expect(a.profit).toBe("220000");

    const b = calcOrderPricing(order({ packages, assignedRouteCode: "US-EPK" }), catalog);
    expect(b.billed).toEqual(a.billed);
    expect(b.shipped).toMatchObject({ weight: "2.000", amount: "80000", versionId: "COST-EPK" });
  });

  it("assigned_route_code để trống → mặc định bằng route_code", () => {
    const r = calcOrderPricing(order({ packages, assignedRouteCode: null }), catalog);
    expect(r.shipped.routeCode).toBe("US-EPK");
  });

  it("ghi đè billed_weight → giá bán tính lại theo cân ghi đè; phía NCC không đổi", () => {
    const r = calcOrderPricing(
      order({ packages, assignedRouteCode: "US-CPN", manualOverrides: ["billed_weight"], current: { billed_weight: "6" } }),
      catalog,
    );
    expect(r.billed).toMatchObject({ weight: "6.000", amount: "750000", weightOverridden: true });
    expect(r.shipped).toMatchObject({ weight: "2.500", amount: "200000" });
  });

  it("ghi đè sell_amount giữ nguyên số tiền; thiếu giá trị ghi đè → INVALID_INPUT", () => {
    const r = calcOrderPricing(order({ manualOverrides: ["sell_amount"], current: { sell_amount: "500000" } }), catalog);
    expect(r.billed).toMatchObject({ amount: "500000", amountOverridden: true, versionId: null });
    expect(errorCode(() => calcOrderPricing(order({ manualOverrides: ["cost_amount"] }), catalog))).toBe("INVALID_INPUT");
  });

  it("đơn chưa cân → cân 0, tiền 0; tuyến không tồn tại → ROUTE_NOT_FOUND", () => {
    const r = calcOrderPricing(order({ packages: [] }), catalog);
    expect([r.billed.weight, r.billed.amount, r.shipped.amount]).toEqual(["0.000", "0", "0"]);
    expect(errorCode(() => calcOrderPricing(order({ routeCode: "XX" }), catalog))).toBe("ROUTE_NOT_FOUND");
    expect(errorCode(() => calcBillWeight([pkg(-1)], R.EPK))).toBe("INVALID_INPUT");
  });
});

describe("Báo giá tra cứu", () => {
  it("nhập thể tích CBM thay cho kích thước: 0,06 m³ / 6000 = 10 kg", () => {
    expect(calcBillWeight([{ actualWeight: 3, volumeCbm: "0.06" }], R.EPK).totalWeight).toBe("10.000");
    expect(calcBillWeight([{ actualWeight: 3, volumeCbm: "0.06" }], R.EPK_ACT).totalWeight).toBe("3.000");
  });

  it("quoteVersion trả cách tính và đơn giá/kg khi theo kg", () => {
    const nov = versions.find((v) => v.id === "SELL-NOV")!;
    expect(quoteVersion(nov, "US", "1")).toEqual({ amount: "160000", currency: "VND", basis: "MA_TRAN", unitPrice: null });
    expect(quoteVersion(nov, "US", "21")).toEqual({ amount: "1365000", currency: "VND", basis: "THEO_KG", unitPrice: "65000" });
  });
});

describe("Ghi đè tổng cân thực / quy đổi", () => {
  it("ghi đè cân thực áp cho cả 2 tuyến, vẫn làm tròn theo dịch vụ từng tuyến", () => {
    const r = calcOrderPricing(
      order({ packages: [pkg(1)], assignedRouteCode: "US-CPN", manualOverrides: ["actual_weight"], current: { actual_weight: "2.01" } }),
      catalog,
    );
    expect(r.billed).toMatchObject({ totalActual: "2.010", weight: "2.050" }); // EPK ↑0,05
    expect(r.shipped).toMatchObject({ totalActual: "2.010", weight: "2.500" }); // CPN ↑0,5
  });

  it("ghi đè cân quy đổi lớn hơn cân thực → dùng quy đổi (MAX), ACTUAL_ONLY bỏ qua", () => {
    const base = order({ packages: [pkg(1)], manualOverrides: ["volumetric_weight"], current: { volumetric_weight: "3.3" } });
    expect(calcOrderPricing(base, catalog).billed).toMatchObject({ totalVolumetric: "3.300", weight: "3.300" });
    expect(calcOrderPricing({ ...base, routeCode: "US-EPK-ACT", assignedRouteCode: "US-EPK" }, { ...catalog, versions: [...versions, { ...versions[1], id: "ACT", routeCode: "US-EPK-ACT" }] }).billed.weight).toBe("1.000");
  });
});
