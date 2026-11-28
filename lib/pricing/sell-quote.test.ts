import { describe, expect, it } from "vitest";
import type { PriceVersion, PricingCatalog } from "./engine";
import { quoteSellRoutes } from "./sell-quote";

const zone = (iso: string[], matrix: [number, number][]) => [{ zoneCode: "Z1", countries: iso, matrix: matrix.map(([weightMax, price]) => ({ weightMax, price })), perKg: [] }];
const v = (x: Partial<PriceVersion> & Pick<PriceVersion, "id" | "routeCode" | "kind">): PriceVersion => ({ mode: "MA_TRAN", effectiveFrom: "2026-10-01", zones: [], ...x });

const catalog: PricingCatalog = {
  routes: [
    { routeCode: "A", serviceType: "EPK", weightCalcMode: "ACTUAL_ONLY", dimDivisor: "6000" },
    { routeCode: "B", serviceType: "CPN", weightCalcMode: "MAX_ACTUAL_VOL", dimDivisor: "5000" },
    { routeCode: "C", serviceType: "CT", weightCalcMode: "ACTUAL_ONLY", dimDivisor: "5000" },
    { routeCode: "D", serviceType: "EPK", weightCalcMode: "ACTUAL_ONLY", dimDivisor: "6000" },
  ],
  versions: [
    v({ id: 1, routeCode: "A", kind: "SELL", zones: zone(["US"], [[1, 200000], [5, 500000]]) }),
    v({ id: 2, routeCode: "A", kind: "SELL", priceGroupCode: "VIP", zones: zone(["US"], [[1, 180000], [5, 450000]]) }),
    v({ id: 3, routeCode: "A", kind: "COST", zones: zone(["US"], [[1, 120000], [5, 300000]]) }),
    v({ id: 4, routeCode: "B", kind: "SELL", zones: zone(["US"], [[2, 300000]]) }),
    v({ id: 5, routeCode: "B", kind: "SELL", customerCode: "SKL1", zones: zone(["US"], [[2, 250000]]) }),
    // C: chỉ có giá bán tới GB → không bay US, bỏ qua
    v({ id: 6, routeCode: "C", kind: "SELL", zones: zone(["GB"], [[5, 1]]) }),
    // D: chưa có giá bán
    v({ id: 7, routeCode: "D", kind: "COST", zones: zone(["US"], [[5, 1]]) }),
  ],
};
const routes = ["A", "B", "C", "D"].map((routeCode) => ({ routeCode, supplierCode: "YUN" }));
const q = { iso2: "US", date: "2026-11-28", packages: [{ actualWeight: "0.8" }] };

describe("quoteSellRoutes", () => {
  it("khách dùng giá chung: áp % nhóm × % khách, kèm giá gốc & lợi nhuận", () => {
    const r = quoteSellRoutes(catalog, { customerCode: "SKL9", priceGroupCode: "THUONG", groupAdjustPct: "10", priceAdjustPct: "5" }, routes, q);
    const a = r.rows.find((x) => x.routeCode === "A")!;
    expect(a).toMatchObject({ scope: "DEFAULT", sellAmount: "231000", adjustPct: "15.50", costAmount: "120000", profit: "111000" });
    expect(a.marginPct).toBe("48.1");
    expect(r.noSellPrice).toEqual(["D"]);
    expect(r.rows.map((x) => x.routeCode)).not.toContain("C");
  });

  it("bảng riêng của nhóm chỉ áp % khách; giá riêng KH giữ nguyên", () => {
    const r = quoteSellRoutes(catalog, { customerCode: "SKL1", priceGroupCode: "VIP", groupAdjustPct: "10", priceAdjustPct: "-10" }, routes, q);
    expect(r.rows.find((x) => x.routeCode === "A")).toMatchObject({ scope: "GROUP", sellAmount: "162000" });
    const b = r.rows.find((x) => x.routeCode === "B")!;
    expect(b).toMatchObject({ scope: "CUSTOMER", sellAmount: "250000", costAmount: null, profit: null, chargeableWeight: "1.000" });
    expect(r.rows[0].routeCode).toBe("A"); // sắp xếp giá tăng dần
  });

  it("vượt mốc cân → tuyến không phục vụ", () => {
    const r = quoteSellRoutes(catalog, { customerCode: "SKL9", priceGroupCode: null, groupAdjustPct: null, priceAdjustPct: "0" }, routes, { ...q, packages: [{ actualWeight: "3" }] });
    expect(r.unavailable.map((x) => x.routeCode)).toEqual(["B"]);
  });
});
