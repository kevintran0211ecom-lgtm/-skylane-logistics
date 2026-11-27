import { describe, expect, it } from "vitest";
import { pctLabel, scalePrice, scaleZones } from "./group-table";
import { addRepriced, emptyReport, repriceMessage } from "../orders/reprice-summary";

describe("Bảng giá riêng của nhóm từ giá chung", () => {
  it("nhân % và làm tròn: VND số nguyên, USD 2 số lẻ; giữ nguyên mốc cân & nước", () => {
    expect(scalePrice("151000", 15)).toBe("173650");
    expect(scalePrice("86500", -3)).toBe("83905");
    expect(scalePrice("12.5", 10, "USD")).toBe("13.75");
    const z = [{ zoneCode: "Z01", countries: ["US"], matrix: [{ weightMax: "0.5", price: "200000" }], perKg: [{ weightMin: "20", weightMax: null, unitPrice: "246000" }] }];
    const s = scaleZones(z, 8);
    expect(s[0]).toEqual({ zoneCode: "Z01", countries: ["US"], matrix: [{ weightMax: "0.5", price: "216000" }], perKg: [{ weightMin: "20", weightMax: null, unitPrice: "265680" }] });
    expect(z[0].matrix[0].price).toBe("200000"); // không sửa bảng gốc
    expect(pctLabel(8)).toBe("+8%");
    expect(pctLabel(-3)).toBe("-3%");
  });
});

describe("Thông báo tính lại giá", () => {
  it("nêu tổng giá bán trước → sau, đơn giá riêng khách, đơn khóa giá", () => {
    const r = emptyReport();
    r.repriced = 3;
    r.locked = 2;
    addRepriced(r, "100000", "110000", "DEFAULT");
    addRepriced(r, "200000", "220000", "GROUP");
    addRepriced(r, "50000", "50000", "CUSTOMER");
    expect(repriceMessage(r)).toBe(
      "tính lại giá 3 đơn chưa khóa (tổng giá bán 350.000 → 380.000), 1 đơn dùng giá riêng của khách nên không áp % điều chỉnh, 2 đơn đã khóa giá giữ nguyên",
    );
    expect(repriceMessage({ repriced: 1, locked: 0, failed: [] })).toBe("tính lại giá 1 đơn chưa khóa");
    const same = emptyReport();
    same.repriced = 1;
    addRepriced(same, "5", "5", "CUSTOMER");
    expect(repriceMessage(same)).toContain("không đổi");
  });
});
