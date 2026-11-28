import { describe, expect, it } from "vitest";
import { calcBillWeight } from "./engine";
import { decodePackageRow, encodePackageRow, parsePastedRows, parseQuoteInput, sumDecimal } from "./quote-input";

const TODAY = "2026-11-28";

describe("parseQuoteInput", () => {
  it("không có điều kiện → chưa tra", () => {
    expect(parseQuoteInput({}, TODAY)).toEqual({});
  });

  it("1 kiện theo trọng lượng, chuẩn hóa mã nước + lọc", () => {
    const { input } = parseQuoteInput({ to: " us ", kg: "1,5", ncc: " yun ", dv: "cpn" }, TODAY);
    expect(input).toMatchObject({ iso2: "US", date: TODAY, pieces: 1, totalActual: "1.5", supplierCode: "YUN", serviceType: "CPN", totalCbm: null });
  });

  it("dịch vụ lạ → không lọc", () => {
    expect(parseQuoteInput({ to: "US", kg: "1", dv: "XYZ" }, TODAY).input?.serviceType).toBeNull();
  });

  it("nhiều dòng kiện: nhân theo số kiện, bỏ qua ô Trọng lượng tổng", () => {
    const { input } = parseQuoteInput({ to: "GB", kg: "99", p: ["2_5,5_40_30_20", "1_3__ _"] }, TODAY);
    expect(input?.pieces).toBe(3);
    expect(input?.totalActual).toBe("14");
    expect(input?.totalCbm).toBe("0.048"); // 2 × 0,024 m³
    expect(input?.packages[0]).toEqual({ actualWeight: "5.5", lengthCm: "40", widthCm: "30", heightCm: "20" });
    expect(input?.packages[2]).toEqual({ actualWeight: "3" });
  });

  it("dòng trống bị bỏ qua; số kiện trống = 1", () => {
    const { input } = parseQuoteInput({ to: "US", p: ["1____", "_2_10_10_10"] }, TODAY);
    expect(input?.pieces).toBe(1);
  });

  it("báo lỗi theo dòng", () => {
    expect(parseQuoteInput({ to: "US", p: ["1_2_10_10_", "x_1___"] }, TODAY).error).toMatch(/dòng 1.*Dài, Rộng, Cao/);
    expect(parseQuoteInput({ to: "US", p: ["1_2___", "0_1___"] }, TODAY).error).toMatch(/dòng 2.*Số kiện/);
    expect(parseQuoteInput({ to: "US", p: ["1__10_10_10"] }, TODAY).error).toMatch(/cân nặng/);
    expect(parseQuoteInput({ to: "US", p: ["501_1___"] }, TODAY).error).toMatch(/Tối đa/);
  });

  it("CBM tổng khi không nhập từng kiện", () => {
    const { input } = parseQuoteInput({ to: "US", kg: "2", cbm: "0,125" }, TODAY);
    expect(input?.packages).toEqual([{ actualWeight: "2", volumeCbm: "0.125" }]);
    expect(input?.totalCbm).toBe("0.125");
  });

  it("lỗi điểm đến / trọng lượng", () => {
    expect(parseQuoteInput({ to: "USA", kg: "1" }, TODAY).error).toMatch(/ISO2/);
    expect(parseQuoteInput({ to: "US", kg: "0" }, TODAY).error).toMatch(/trọng lượng/);
  });

  it("CPN nhiều kiện: engine làm tròn từng kiện rồi cộng", () => {
    const { input } = parseQuoteInput({ to: "US", p: ["3_1,2___"] }, TODAY);
    const bill = calcBillWeight(input!.packages, { routeCode: "X", serviceType: "CPN", weightCalcMode: "ACTUAL_ONLY", dimDivisor: "5000" });
    expect(Number(bill.totalWeight)).toBe(4.5); // 3 × 1,5
  });
});

describe("tiện ích", () => {
  it("mã hóa / giải mã dòng kiện", () => {
    const r = { qty: "2", kg: "5,5", l: "40", w: "30", h: "20" };
    expect(decodePackageRow(encodePackageRow(r))).toEqual(r);
  });
  it("dán từ Excel", () => {
    expect(parsePastedRows("2\t5,5\t40\t30\t20\n\n1\t3\n7")).toEqual([
      { qty: "2", kg: "5,5", l: "40", w: "30", h: "20" },
      { qty: "1", kg: "3", l: "", w: "", h: "" },
      { qty: "1", kg: "7", l: "", w: "", h: "" },
    ]);
  });
  it("cộng số thập phân chính xác", () => {
    expect(sumDecimal(["0.1", "0.2"])).toBe("0.3");
  });
});
