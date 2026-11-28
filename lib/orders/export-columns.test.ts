import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  addKeys,
  cellValue,
  EXPORT_COLUMNS,
  exportColumnsFor,
  fillOrdersSheet,
  moveKeys,
  parsePresets,
  removeKeys,
  resolveColumns,
  upsertPreset,
  VISIBLE_COLUMNS,
  type ExportOrder,
} from "./export-columns";

const o = (x: Partial<ExportOrder> = {}): ExportOrder => ({
  billCode: "AP1", trackingNumber: null, customerCode: "SKL116", customerName: "Chị Thanh", routeCode: "VNFZZXR", assignedRouteCode: "VNFZZXR",
  supplierCode: "YUN", serviceType: "EPK", destinationIso2: "US", status: "Đã xuất hàng", debtStatus: "Chưa thanh toán", pricingDate: "2026-11-20",
  createdAt: "2026-11-20T03:00:00Z", receivedAt: null, exportedAt: null, deliveredAt: null, packageCount: 2, dimensions: "40x30x20; 30x20x10",
  actualWeight: "3.500", volumetricWeight: "2.000", billedWeight: "3.500", shippedWeight: "3.500", sellAmount: "500000.00", surchargeAmount: "0",
  totalAmount: "500000.00", costAmount: "300000.00", profit: "200000.00", priceLocked: true, senderName: null, receiverName: "John", receiverPhone: null,
  receiverEmail: null, receiverAddress: null, receiverCity: null, receiverState: null, receiverPostalCode: null, goodsDescription: null, goodsNameEn: null,
  hsCode: null, declaredValueUsd: null, note: null, internalNote: null, ...x,
});

describe("cột xuất", () => {
  it("cột hiển thị đều có trong danh sách", () => {
    expect(resolveColumns(VISIBLE_COLUMNS, true).length).toBe(VISIBLE_COLUMNS.length);
  });
  it("Kho không thấy cột tiền; bỏ key lạ & trùng", () => {
    expect(exportColumnsFor(false).some((c) => c.money)).toBe(false);
    expect(resolveColumns(["billCode", "sellAmount", "xyz", "billCode"], false).map((c) => c.key)).toEqual(["billCode"]);
  });
  it("giá trị ô", () => {
    const by = (k: string) => EXPORT_COLUMNS.find((c) => c.key === k)!;
    expect(cellValue(by("pricingDate"), o())).toBe("20/11/2026");
    expect(cellValue(by("createdAt"), o())).toBe("10:00 20/11/2026");
    expect(cellValue(by("sellAmount"), o())).toBe(500000);
    expect(cellValue(by("priceLocked"), o())).toBe("Có");
    expect(cellValue(by("trackingNumber"), o())).toBeNull();
  });
});

describe("2 danh sách", () => {
  const all = ["a", "b", "c", "d"];
  it("chọn / bỏ", () => {
    expect(addKeys(["c"], ["d", "a", "c"], all)).toEqual(["c", "a", "d"]);
    expect(removeKeys(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
  it("lên / xuống, giữ nhóm liền nhau", () => {
    expect(moveKeys(["a", "b", "c", "d"], ["c"], -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveKeys(["a", "b", "c", "d"], ["a", "b"], -1)).toEqual(["a", "b", "c", "d"]);
    expect(moveKeys(["a", "b", "c", "d"], ["b", "c"], 1)).toEqual(["a", "d", "b", "c"]);
  });
});

describe("định dạng đã lưu", () => {
  it("đọc an toàn & lưu đè theo tên", () => {
    expect(parsePresets("hỏng")).toEqual([]);
    expect(parsePresets(JSON.stringify([{ name: "KT", keys: ["billCode", "xyz"] }, { name: "", keys: ["billCode"] }]))).toEqual([{ name: "KT", keys: ["billCode"] }]);
    const l = upsertPreset([{ name: "KT", keys: ["billCode"] }], "kt", ["status"]);
    expect(l).toEqual([{ name: "kt", keys: ["status"] }]);
  });
});

describe("file Excel", () => {
  it("tiêu đề, số dạng number, dòng tổng", async () => {
    const wb = new ExcelJS.Workbook();
    const cols = resolveColumns(["billCode", "packageCount", "sellAmount"], true);
    const ws = fillOrdersSheet(wb, [o(), o({ billCode: "AP2", packageCount: 1, sellAmount: "250000" })], cols);
    expect(ws.getRow(1).values).toEqual([undefined, "Mã vận đơn", "Số kiện", "Giá bán"]);
    expect(ws.getCell("C3").value).toBe(250000);
    expect(ws.getCell("A4").value).toBe("Tổng (2 đơn)");
    expect(ws.getCell("C4").value).toMatchObject({ formula: "SUBTOTAL(9,C2:C3)", result: 750000 });
    const buf = await wb.xlsx.writeBuffer();
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});
