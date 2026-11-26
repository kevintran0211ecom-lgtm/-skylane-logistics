import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parsePriceWorkbook, type Cell } from "./import-excel";
import { layoutPriceTemplate, priceTemplateGrid } from "./template";

describe("File Excel mẫu import bảng giá", () => {
  it("lưới mẫu đọc được ngay: 2 tuyến, ma trận + theo kg, không lỗi", () => {
    const r = parsePriceWorkbook([{ name: "Bảng giá", rows: priceTemplateGrid().rows }]);
    expect(r.errors).toEqual([]);
    expect(r.blocks.map((b) => [b.routeCode, b.mode, b.countries.length])).toEqual([
      ["VNFZZXR", "MA_TRAN", 4],
      ["UPS HAN S5500", "MA_TRAN+THEO_KG", 2],
    ]);
    expect(r.blocks[1].ranges.map((x) => x.label)).toEqual(["21-44", "45-99", "100+", "300+"]);
  });

  it("file .xlsx tạo ra mở lại được và vẫn đọc đúng (như người dùng tải mẫu → điền → tải lên)", async () => {
    const wb = new ExcelJS.Workbook();
    layoutPriceTemplate(wb);
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    const ws = back.getWorksheet("Bảng giá")!;
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, i) => {
      rows[i - 1] = (row.values as unknown[]).slice(1).map((v) => (v === undefined ? null : (v as Cell)));
    });
    const r = parsePriceWorkbook([{ name: ws.name, rows }]);
    expect(r.errors).toEqual([]);
    expect(r.blocks).toHaveLength(2);
    expect(back.getWorksheet("Hướng dẫn")?.getCell("A1").value).toContain("HƯỚNG DẪN");
  });
});
