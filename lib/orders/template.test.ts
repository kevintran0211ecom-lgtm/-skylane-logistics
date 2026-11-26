import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { readWorkbook } from "../pricing/read-xlsx";
import { parseOrderSheet } from "./import-parse";
import { detectTemplateCustomer, googleSheetCopyLink, layoutOrderTemplate, orderTemplateFilename, templateMessage } from "./template";

describe("Mẫu nhập đơn riêng cho khách", () => {
  it("file mẫu → khách điền → gửi lại / tải từ Google Sheet → import được, tự nhận đúng khách", async () => {
    const wb = new ExcelJS.Workbook();
    layoutOrderTemplate(wb, { customerCode: "SKL126", customerName: "Chị Amb", routes: ["VNFZZXR", "ups han s5500"] });
    expect(wb.worksheets.map((w) => w.name)).toEqual(["DON", "Danh mục", "Hướng dẫn"]);
    // Khách điền 1 đơn vào tab DON
    wb.getWorksheet("DON")!.addRow(["26/11/2026 10:00:00", 1, "AMB9001", "VNFZZXR", 15, "Áo", "Shirt", "", "Mia Clark", "77 Lake Ave", "Chicago", "IL", "60601", "+13125550177", "", "US", 1, 0.8, 30, 20, 10]);
    const buf = await wb.xlsx.writeBuffer();

    const sheets = await readWorkbook(buf as ArrayBuffer);
    const customer = detectTemplateCustomer(sheets, "bat-ky-ten-nao.xlsx");
    expect(customer).toBe("SKL126");
    const don = sheets.find((s) => s.name === "DON")!;
    const r = parseOrderSheet(don.rows, { defaultCustomerCode: customer });
    expect(r.errors).toEqual([]);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ customerCode: "SKL126", billCode: "AMB9001", routeCode: "VNFZZXR", destinationIso2: "US", goodsNameEn: "Shirt" });
    // Danh mục tuyến cho danh sách thả xuống
    expect(wb.getWorksheet("Danh mục")!.getColumn(1).values.slice(2)).toEqual(["UPS HAN S5500", "VNFZZXR"]);
  });

  it("mẫu trống (chưa điền) không sinh đơn rác; tên file & tin nhắn", async () => {
    const wb = new ExcelJS.Workbook();
    layoutOrderTemplate(wb, {});
    const sheets = await readWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(parseOrderSheet(sheets[0].rows, { defaultCustomerCode: "SKL116" }).drafts).toHaveLength(0);
    expect(detectTemplateCustomer(sheets, "Mau-nhap-don-skl170-Minh-Nhat.xlsx")).toBe("SKL170");
    expect(orderTemplateFilename("SKL126", "Chị Đào Amb")).toBe("Mau-nhap-don-SKL126-Chi-Dao-Amb.xlsx");
    expect(googleSheetCopyLink("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit#gid=0")).toBe("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWx/copy");
    expect(googleSheetCopyLink("https://example.com")).toBeNull();
    expect(templateMessage({ customerCode: "SKL126", customerName: "Chị Amb", copyLink: "L" })).toContain("Bất kỳ ai có đường liên kết");
  });
});
