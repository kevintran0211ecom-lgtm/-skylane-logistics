import { describe, expect, it } from "vitest";
import { classifyWeightLabel, parseNumberCell, parsePriceWorkbook, type Cell, type SheetGrid } from "./import-excel";
import { addDays, planNewVersion } from "./versioning";

// -----------------------------------------------------------------------------
// Fixture: mô phỏng đúng sheet thật — dòng 1 trống, dòng 2 tên tuyến (gộp ô),
// dòng 3 tiêu đề, số kiểu VN dạng chữ lẫn ô số, "-" = không phục vụ.
// -----------------------------------------------------------------------------
const H = (iso: string, name: string, cur = "VND") => `${iso} – ${name}\n(${cur})`;

function grid(): SheetGrid {
  const rows: Cell[][] = [
    [],
    // Khối A-D: VNFZZXR (gộp ô → exceljs trả tên ở mọi cột), khối E-F: UPS HAN S5500 (chỉ ô đầu)
    ["VNFZZXR ", "VNFZZXR ", "VNFZZXR ", "VNFZZXR ", "UPS HAN S5500", null],
    ["Khối lượng (KG)", H("GB", "Anh"), H("DE", "Đức"), H("FR", "Pháp"), "Khối lượng (KG)", H("US", "Mỹ")],
    ["0,10", "114.360,", "158.712,", "158.712,", 0.5, 300000],
    ["0,20", "141.144,", "184.504,", "184.504,", "1,00", "450.000"],
    [0.3, 167680, 210048, 210048, "20,00", "2.000.000,"],
    ["0,40", "-", "235.840,", "235.840,", "21-44", "246.113"],
    [null, null, null, null, "45-99", 240000],
    [null, null, null, null, "100+", "235.500,5"],
    [null, null, null, null, "300+", 230000],
    ["Ghi chú: giá chưa gồm VAT", null, null, null, null, null],
  ];
  return { name: "Gia goc", rows };
}

describe("Đọc số & nhãn khối lượng", () => {
  it("số kiểu VN / quốc tế / ô số, '-' và trống", () => {
    expect(parseNumberCell("0,05", "weight")).toBe("0.05");
    expect(parseNumberCell("20,00", "weight")).toBe("20");
    expect(parseNumberCell("1.015.750,", "price")).toBe("1015750");
    expect(parseNumberCell("151,896", "price")).toBe("151896");
    expect(parseNumberCell("1.234,5", "price")).toBe("1234.5");
    expect(parseNumberCell("0.05", "weight")).toBe("0.05");
    expect(parseNumberCell(0.1 + 0.2, "weight")).toBe("0.3");
    expect(parseNumberCell(" - ", "price")).toBeNull();
    expect(parseNumberCell(null, "price")).toBeNull();
    expect(parseNumberCell("liên hệ", "price")).toBe(undefined);
  });

  it("mốc cố định vs khoảng (21-44, 45-99, 100+, 300+, >300)", () => {
    expect(classifyWeightLabel("0,10")).toEqual({ type: "fixed", weight: "0.1" });
    expect(classifyWeightLabel(21)).toEqual({ type: "fixed", weight: "21" });
    expect(classifyWeightLabel("21-44")).toMatchObject({ type: "range", start: "21", end: "44" });
    expect(classifyWeightLabel("45 – 99 kg")).toMatchObject({ type: "range", start: "45", end: "99" });
    expect(classifyWeightLabel("100+")).toMatchObject({ type: "range", start: "100", end: null });
    expect(classifyWeightLabel(">300")).toMatchObject({ type: "range", start: "300", end: null });
    expect(classifyWeightLabel("Ghi chú")).toMatchObject({ type: "invalid" });
    expect(classifyWeightLabel(null)).toEqual({ type: "empty" });
  });
});

describe("Đọc bảng giá ma trận ngang", () => {
  const res = parsePriceWorkbook([grid()]);
  const [fz, ups] = res.blocks;

  it("tự dò dòng tiêu đề (dòng 3) và tách 2 khối tuyến, chuẩn hóa mã tuyến", () => {
    expect(res.errors).toEqual([]);
    expect(res.blocks.map((b) => [b.routeCode, b.cellRef])).toEqual([
      ["VNFZZXR", "A3"],
      ["UPS HAN S5500", "E3"],
    ]);
  });

  it("khối chỉ có mốc cố định → MA_TRAN; nước có giá giống hệt nhau gom chung 1 vùng", () => {
    expect(fz.mode).toBe("MA_TRAN");
    expect(fz.zones.map((z) => [z.zoneCode, z.countries])).toEqual([
      ["Z01", ["GB"]],
      ["Z02", ["DE", "FR"]],
    ]);
    expect(fz.zones[1].matrix).toEqual([
      { weightMax: "0.1", price: "158712" },
      { weightMax: "0.2", price: "184504" },
      { weightMax: "0.3", price: "210048" },
      { weightMax: "0.4", price: "235840" },
    ]);
    // GB có "-" ở mốc 0,40 → không phục vụ mốc đó
    expect(fz.zones[0].matrix.map((t) => t.weightMax)).toEqual(["0.1", "0.2", "0.3"]);
  });

  it("mốc FIXED vào ma trận, mốc khoảng tách (Từ kg, Đến kg] nối liền vào Theo kg", () => {
    expect(ups.mode).toBe("MA_TRAN+THEO_KG");
    expect(ups.fixedWeights).toEqual(["0.5", "1", "20"]);
    expect(ups.zones[0].matrix.at(-1)).toEqual({ weightMax: "20", price: "2000000" });
    expect(ups.zones[0].perKg).toEqual([
      { weightMin: "20", weightMax: "44", unitPrice: "246113" },
      { weightMin: "44", weightMax: "99", unitPrice: "240000" },
      { weightMin: "99", weightMax: "299", unitPrice: "235500.5" },
      { weightMin: "299", weightMax: null, unitPrice: "230000" },
    ]);
  });

  it("dòng ghi chú cuối bảng được bỏ qua kèm cảnh báo, không làm hỏng dữ liệu", () => {
    expect(fz.warnings.some((w) => w.includes("ghi chú"))).toBe(true);
  });

  it("khối chỉ có khoảng → THEO_KG, khoảng đầu bắt đầu từ (start - 1)", () => {
    const r = parsePriceWorkbook([
      { name: "S", rows: [["CT UK-NK"], ["Khối lượng (KG)", H("GB", "Anh")], ["21-44", 50000], ["45+", 45000]] },
    ]);
    expect(r.blocks[0].mode).toBe("THEO_KG");
    expect(r.blocks[0].zones[0].perKg).toEqual([
      { weightMin: "20", weightMax: "44", unitPrice: "50000" },
      { weightMin: "44", weightMax: null, unitPrice: "45000" },
    ]);
  });

  it("mốc cố định trên 20kg (21,00…) vẫn là ma trận; tiền USD nhận từ tiêu đề", () => {
    const r = parsePriceWorkbook([
      { name: "S", rows: [["VNTHZXR"], ["Khối lượng (KG)", H("US", "Mỹ", "USD")], ["20,00", "12,5"], ["21,00", 13], ["30,00", 15]] },
    ]);
    expect(r.blocks[0]).toMatchObject({ mode: "MA_TRAN", currency: "USD", fixedWeights: ["20", "21", "30"] });
    expect(r.blocks[0].zones[0].matrix[0]).toEqual({ weightMax: "20", price: "12.5" });
  });
});

describe("Lỗi file", () => {
  it("khối thiếu tên tuyến (như khối cột Q của sheet SKL116) → báo lỗi có vị trí", () => {
    const r = parsePriceWorkbook([
      { name: "S", rows: [[], ["VNTHZXR", null, null], ["Khối lượng (KG)", H("US", "Mỹ"), "Khối lượng (KG)", H("GB", "Anh")], [1, 100, 1, 200]] },
    ]);
    expect(r.blocks.map((b) => b.routeCode)).toEqual(["VNTHZXR"]);
    expect(r.errors).toEqual(['Sheet "S", khối C3: chưa có tên tuyến ở dòng phía trên tiêu đề "Khối lượng".']);
  });

  it("không có tiêu đề / tuyến trùng / nước trùng / mốc trùng", () => {
    expect(parsePriceWorkbook([{ name: "S", rows: [["abc"]] }]).errors[0]).toContain("Không tìm thấy dòng tiêu đề");
    const dupRoute = parsePriceWorkbook([grid(), { ...grid(), name: "Sheet2" }]);
    expect(dupRoute.errors.some((e) => e.includes("VNFZZXR xuất hiện 2 lần"))).toBe(true);
    const dupCountry = parsePriceWorkbook([
      { name: "S", rows: [["R1"], ["Khối lượng", H("US", "Mỹ"), H("US", "Mỹ 2")], [1, 1, 2]] },
    ]);
    expect(dupCountry.errors[0]).toContain("nước US bị lặp");
    const dupWeight = parsePriceWorkbook([{ name: "S", rows: [["R1"], ["Khối lượng", H("US", "Mỹ")], ["1,0", 1], [1, 2]] }]);
    expect(dupWeight.errors[0]).toContain("mốc 1kg bị lặp");
  });

  it("cột không có mã ISO2 và ô giá không phải số → cảnh báo, bỏ qua", () => {
    const r = parsePriceWorkbook([
      { name: "S", rows: [["R1"], ["Khối lượng", "Mỹ (VND)", H("US", "Mỹ")], [1, 5, "liên hệ"], [2, 6, 7]] },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.blocks[0].zones[0].matrix).toEqual([{ weightMax: "2", price: "7" }]);
    expect(r.blocks[0].warnings.join("\n")).toMatch(/không có mã nước ISO2[\s\S]*không phải số/);
  });
});

describe("Phiên bản theo ngày hiệu lực", () => {
  it("chốt effective_to của phiên bản đang mở = ngày hiệu lực mới - 1, không sửa bản cũ khác", () => {
    const plan = planNewVersion(
      [
        { id: 1, effectiveFrom: "2026-09-01", effectiveTo: "2026-09-30" },
        { id: 2, effectiveFrom: "2026-10-01", effectiveTo: null },
      ],
      "2026-11-01",
    );
    expect(plan).toEqual({
      ok: true,
      close: [{ id: 2, effectiveFrom: "2026-10-01", oldEffectiveTo: null, newEffectiveTo: "2026-10-31" }],
      newEffectiveTo: null,
    });
  });

  it("chèn vào giữa: phiên bản mới tự kết thúc trước phiên bản tương lai", () => {
    const plan = planNewVersion(
      [
        { id: 2, effectiveFrom: "2026-10-01", effectiveTo: "2026-11-30" },
        { id: 3, effectiveFrom: "2026-12-01", effectiveTo: null },
      ],
      "2026-11-15",
    );
    expect(plan).toMatchObject({ ok: true, newEffectiveTo: "2026-11-30", close: [{ id: 2, newEffectiveTo: "2026-11-14" }] });
  });

  it("trùng ngày hiệu lực / ngày sai → từ chối; cộng ngày qua tháng & năm nhuận", () => {
    expect(planNewVersion([{ id: 9, effectiveFrom: "2026-11-01", effectiveTo: null }], "2026-11-01").ok).toBe(false);
    expect(planNewVersion([], "2026-02-30").ok).toBe(false);
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
