import { describe, expect, it } from "vitest";
import { missingCodes, parseCodeList, searchMode } from "./search";
import { amountFromUnit, sumOrders, toTsv, unitPrice } from "./orders/totals";

describe("Tìm nhiều mã một lúc", () => {
  it("tách theo dòng / dấu phẩy / tab, TRIM + chữ hoa, bỏ trùng, giữ thứ tự", () => {
    expect(parseCodeList(" #ap3004\n#AP3003\r\nmn2637 , MN2637;\tX1 ")).toEqual(["#AP3004", "#AP3003", "MN2637", "X1"]);
    expect(parseCodeList("")).toEqual([]);
  });

  it("1 dòng = tìm gần đúng; nhiều dòng = tìm chính xác từng mã", () => {
    expect(searchMode("")).toEqual({ kind: "none" });
    expect(searchMode("Chị Thanh")).toEqual({ kind: "like", term: "Chị Thanh" });
    expect(searchMode("AP30")).toEqual({ kind: "like", term: "AP30" });
    expect(searchMode("#AP3004\n#AP3003\nMN2637")).toEqual({ kind: "codes", codes: ["#AP3004", "#AP3003", "MN2637"] });
    expect(searchMode("#AP3004 MN2637")).toEqual({ kind: "codes", codes: ["#AP3004", "MN2637"] });
    expect(searchMode("#ap3004\n\n")).toEqual({ kind: "like", term: "#ap3004" });
  });

  it("báo mã không tìm thấy", () => {
    expect(missingCodes(["A1", "B2", "C3"], ["a1", null, "C3"])).toEqual(["B2"]);
  });
});

describe("Dòng tổng vận đơn", () => {
  it("cộng chính xác số lẻ (không sai số float), lợi nhuận = bán - gốc", () => {
    const t = sumOrders([
      { packageCount: 1, actualWeight: "0.1", billedWeight: "0.2", shippedWeight: "0.1", costAmount: "100000.10", sellAmount: "150000" },
      { packageCount: "2", actualWeight: "0.2", billedWeight: "0.15", shippedWeight: "0.25", costAmount: "200000.20", sellAmount: "180000" },
    ]);
    expect(t).toEqual({
      orders: 2,
      packages: 3,
      actualWeight: "0.3",
      billedWeight: "0.35",
      shippedWeight: "0.35",
      costAmount: "300000.3",
      sellAmount: "330000",
      profit: "29999.7",
    });
    expect(sumOrders([]).profit).toBe("0");
  });

  it("đơn giá bán / kg và ngược lại", () => {
    expect(unitPrice("330000", "1.5")).toBe("220000");
    expect(unitPrice("330000", "0")).toBeNull();
    expect(amountFromUnit("220000", "1.55")).toBe("341000");
  });

  it("TSV dán Excel: bỏ tab/xuống dòng trong ô", () => {
    expect(toTsv(["Mã", "Ghi chú"], [["#AP1", "a\tb\nc"], ["#AP2", null]])).toBe("Mã\tGhi chú\n#AP1\ta b c\n#AP2\t");
  });
});
