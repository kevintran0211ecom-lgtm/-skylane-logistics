import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { layoutStatementSheet } from "./excel-layout";

const item = (n: number, amount: number) => ({
  lineNo: n,
  shippedDate: "2026-11-20",
  billCode: `#AP${n}`,
  trackingNumber: `1Z${n}`,
  destinationIso2: "US",
  receiverName: "David Lee",
  packageCount: 1,
  billedWeight: "0.85",
  routeCode: "VNFZZXR",
  totalAmount: String(amount),
  note: null,
});

describe("File Excel bảng kê (mẫu SkyLane)", () => {
  it("tiêu đề, 11 cột, dòng TỔNG có công thức SUM, thông tin MSB; ghi & đọc lại được .xlsx", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = layoutStatementSheet(wb, {
      statementNo: "SKL2611260001",
      name: "Chị Thanh - SKL116 - SKL2611260001",
      customerName: "Chị Thanh",
      currency: "VND",
      totalAmount: "450000",
      status: "ACTIVE",
      items: [item(1, 200000), item(2, 250000)],
    });
    expect(ws.getCell("A1").value).toBe("CÔNG TY TNHH SKYLANE LOGISTICS");
    expect(ws.getCell("C3").value).toBe("Chị Thanh");
    expect(ws.getRow(4).values).toContain("Trọng lượng tính phí");
    expect(ws.getCell("C5").value).toBe("#AP1");
    expect(ws.getCell("I7").value).toBe("TỔNG");
    expect(ws.getCell("J7").value).toEqual({ formula: "SUM(J5:J6)", result: 450000 });
    const texts: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => typeof c.value === "string" && texts.push(c.value)));
    expect(texts).toContain("Nội dung chuyển khoản: SKL2611260001");
    expect(texts.some((t) => t.includes("3812042003"))).toBe(true);

    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf as ArrayBuffer);
    expect(back.getWorksheet("SKL2611260001")?.getCell("D6").value).toBe("1Z2");
  });
});
