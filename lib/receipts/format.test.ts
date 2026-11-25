import { describe, expect, it } from "vitest";
import { formatReceiptNo, formatThousands, suggestAllocation, vndToWords, type OpenStatement } from "./format";

describe("Mã phiếu thu & số tiền", () => {
  it("SKLTHUddMMyyXXX", () => {
    expect(formatReceiptNo("2026-11-25", 1)).toBe("SKLTHU251126001");
    expect(() => formatReceiptNo("2026-11-25", 1000)).toThrow();
  });
  it("format dấu chấm hàng nghìn khi gõ / dán", () => {
    expect(formatThousands("3000000")).toBe("3.000.000");
    expect(formatThousands("3.000.0001")).toBe("30.000.001");
    expect(formatThousands("abc0012a5")).toBe("125");
    expect(formatThousands("")).toBe("");
  });
  it("đọc số tiền bằng chữ tiếng Việt", () => {
    expect(vndToWords(3000000)).toBe("Ba triệu đồng");
    expect(vndToWords("1015750")).toBe("Một triệu không trăm mười lăm nghìn bảy trăm năm mươi đồng");
    expect(vndToWords(105)).toBe("Một trăm lẻ năm đồng");
    expect(vndToWords(21)).toBe("Hai mươi mốt đồng");
    expect(vndToWords(24)).toBe("Hai mươi tư đồng");
    expect(vndToWords(15)).toBe("Mười lăm đồng");
    expect(vndToWords(1000005)).toBe("Một triệu không trăm lẻ năm đồng");
    expect(vndToWords(2000000000)).toBe("Hai tỷ đồng");
    expect(vndToWords(1200000001)).toBe("Một tỷ hai trăm triệu không trăm lẻ một đồng");
    expect(vndToWords(0)).toBe("Không đồng");
  });
});

const st = (id: number, balance: number, issuedAt: string): OpenStatement => ({ id, statementNo: `SKL${id}`, balance: `${balance}.00`, issuedAt });
const open = [st(1, 500000, "2026-11-01"), st(2, 300000, "2026-11-05"), st(3, 200000, "2026-11-10"), st(4, 300000, "2026-11-12")];

describe("Gợi ý khớp tiền", () => {
  it("khớp chính xác 1 bảng kê (cũ nhất nếu trùng số)", () => {
    expect(suggestAllocation("300000", open)).toMatchObject({ mode: "EXACT", allocations: [{ id: 2, amount: "300000" }], overpaid: "0" });
  });
  it("khớp gộp nhiều bảng kê (ít bảng kê nhất)", () => {
    const s = suggestAllocation(1000000, open);
    expect(s.mode).toBe("COMBO");
    expect(s.allocations.map((a) => a.id)).toEqual([1, 2, 3]);
    expect(suggestAllocation(700000, open)).toMatchObject({ mode: "COMBO", allocations: [{ id: 1 }, { id: 3 }] });
  });
  it("FIFO cũ nhất trước, bảng kê cuối thanh toán 1 phần", () => {
    const s = suggestAllocation(650000, open);
    expect(s).toMatchObject({ mode: "FIFO", allocations: [{ id: 1, amount: "500000" }, { id: 2, amount: "150000" }], overpaid: "0" });
    expect(s.label).toContain("SKL2 thanh toán 1 phần");
  });
  it("chuyển dư → phân bổ hết, phần dư ghi Thu thừa", () => {
    expect(suggestAllocation(1500000, open)).toMatchObject({ mode: "FIFO", allocated: "1300000", overpaid: "200000" });
    expect(suggestAllocation(50000, [])).toMatchObject({ mode: "NONE", overpaid: "50000" });
  });
});
