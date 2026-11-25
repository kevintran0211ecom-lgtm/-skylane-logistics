import { describe, expect, it } from "vitest";
import { mapHeaders, normalizeHeader, parseCsv, parseOrderSheet, parseSheetUrl, parseViDateTime } from "./import-parse";

// Tiêu đề đúng như tab DON của sheet khách SKL116
const DON_HEADER = [
  "Thời gian phát sinh đơn", "STT", "Mã vận đơn", "Tuyến vận chuyển", "Giá trị khai báo", "Tên hàng tiếng Việt", "Tên hàng tiếng anh",
  "Mã HS (hải quan)", "Người nhận", "Địa chỉ người nhận", "Thành phố người nhận", "Bang/tỉnh người nhận", "Mã bưu chính người nhận",
  "SĐT người nhận", "Mail người nhận", "Điểm đến", "Số kiện", "Trọng lượng thực tế(kg)", "Dài ", "Rộng", "Cao",
];
const row = (bill: string, route: string, dest: string, count: string, kg: string, extra: Partial<Record<number, string>> = {}) => {
  const r: (string | null)[] = ["18/11/2026 15:19:43", "", bill, route, "20", " Quần áo", "", "", "David Lee", "308 N Fillmore St", "Bruning", "NY", "68322", "+12698047967", "ABC@gmail.com", dest, count, kg, "34", "23", "11"];
  for (const [i, v] of Object.entries(extra)) r[Number(i)] = v ?? null;
  return r;
};

describe("Chuẩn hóa tiêu đề", () => {
  it("bỏ dấu, ký tự đặc biệt, đơn vị cuối; không phụ thuộc thứ tự cột", () => {
    expect(normalizeHeader("Trọng lượng thực tế(kg)")).toBe("trong luong thuc te");
    expect(normalizeHeader("Dài (cm)")).toBe("dai");
    expect(normalizeHeader("Bang/tỉnh người nhận")).toBe("bang tinh nguoi nhan");
    const { columns, ignored } = mapHeaders(DON_HEADER);
    expect(columns.get("billCode")).toBe(2);
    expect(columns.get("actualWeight")).toBe(17);
    expect(columns.get("lengthCm")).toBe(18);
    expect(ignored).toEqual(["STT"]);
  });

  it("ngày giờ VN, ISO, serial Excel → ISO +07:00; ngày sai bị từ chối", () => {
    expect(parseViDateTime("18/11/2026 15:19:43")).toBe("2026-11-18T15:19:43+07:00");
    expect(parseViDateTime("1/2/2026")).toBe("2026-02-01T00:00:00+07:00");
    expect(parseViDateTime("2026-11-18 08:05")).toBe("2026-11-18T08:05:00+07:00");
    expect(parseViDateTime(46344.5)).toBe("2026-11-18T12:00:00+07:00");
    expect(parseViDateTime("31/02/2026")).toBe(undefined);
    expect(parseViDateTime("")).toBeNull();
  });

  it("CSV có ngoặc kép, dấu phẩy, xuống dòng trong ô; link Google Sheet", () => {
    expect(parseCsv('a,"b, c","d ""x"""\r\n1,,"2\n3"\n')).toEqual([["a", "b, c", 'd "x"'], ["1", null, "2\n3"]]);
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/1eO6Zd1WSjJP2NFUaAPWDoBtTAAcWOMXRNmHR_ILH1vw/edit#gid=0")).toEqual({
      id: "1eO6Zd1WSjJP2NFUaAPWDoBtTAAcWOMXRNmHR_ILH1vw",
    });
  });
});

describe("Đọc đơn từ sheet nguồn khách", () => {
  it("đọc đúng định dạng thật: mã #AP1376, điểm đến viết thường, cân 0,786, KH mặc định", () => {
    const r = parseOrderSheet([DON_HEADER, row("#ap1376", "vnfzzxr", "us", "1", "0,786")], { defaultCustomerCode: "skl116" });
    expect(r.errors).toEqual([]);
    expect(r.drafts[0]).toMatchObject({
      orderKey: "SKL116|#AP1376",
      routeCode: "VNFZZXR",
      destinationIso2: "US",
      createdAt: "2026-11-18T15:19:43+07:00",
      receiverEmail: "abc@gmail.com",
      goodsDescription: "Quần áo",
      declaredValueUsd: "20",
      packages: [{ lengthCm: "34", widthCm: "23", heightCm: "11", actualWeight: "0.786" }],
    });
  });

  it("Số kiện 3 với 1 bộ kích thước → 3 kiện, cân chia đều (dư dồn kiện cuối)", () => {
    const r = parseOrderSheet([DON_HEADER, row("SKL12", "VNTHZXR", "US", "3", "1,000")], { defaultCustomerCode: "SKL116" });
    expect(r.drafts[0].packages.map((p) => p.actualWeight)).toEqual(["0.333", "0.333", "0.334"]);
    expect(r.warnings[0]).toContain("3 kiện");
  });

  it("có cột Số kiện: mã trùng trong file bị chặn; dòng lỗi báo đúng số dòng", () => {
    const r = parseOrderSheet(
      [DON_HEADER, row("A1", "VNFZZXR", "US", "1", "1"), row("A1", "VNFZZXR", "US", "1", "1"), row("A2", "VNFZZXR", "USA", "1", "abc")],
      { defaultCustomerCode: "SKL116" },
    );
    expect(r.drafts.map((d) => d.billCode)).toEqual(["A1"]);
    expect(r.duplicatesInFile).toEqual([{ row: 3, orderKey: "SKL116|A1" }]);
    expect(r.errors).toEqual([{ row: 4, billCode: "A2", message: 'điểm đến "USA" không phải mã ISO2; cân thực "abc" không hợp lệ' }]);
  });

  it("không có cột Số kiện: nhiều dòng cùng mã = nhiều kiện của 1 đơn; cột Mã KH trong file", () => {
    const r = parseOrderSheet([
      ["Mã khách hàng", "Mã vận đơn", "Tuyến", "Điểm đến", "Cân thực", "Dài", "Rộng", "Cao"],
      ["skl170", "B1", "UPS HAN S5500", "GB", 2, 40, 30, 20],
      ["SKL170", "b1", "UPS HAN S5500", "GB", 3.5, 50, 40, 30],
    ]);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ orderKey: "SKL170|B1", rows: [2, 3] });
    expect(r.drafts[0].packages.map((p) => p.actualWeight)).toEqual(["2", "3.5"]);
  });

  it("thiếu cột bắt buộc / không có tiêu đề → lỗi rõ ràng", () => {
    expect(parseOrderSheet([["abc"]]).errors[0].message).toContain("Mã vận đơn");
    expect(parseOrderSheet([["Mã vận đơn", "Điểm đến"], ["X", "US"]]).errors[0].message).toContain('"Tuyến vận chuyển"');
  });
});

describe("Mẫu file Excel nhập đơn (tab DON — SKL116)", () => {
  it("nhận đủ cột của mẫu, chỉ bỏ qua STT", async () => {
    const { ORDER_TEMPLATE_HEADERS, ORDER_TEMPLATE_SAMPLE } = await import("./template");
    const r = parseOrderSheet([[...ORDER_TEMPLATE_HEADERS], ORDER_TEMPLATE_SAMPLE], { defaultCustomerCode: "skl116" });
    expect(r.errors).toEqual([]);
    expect(r.ignoredColumns).toEqual(["STT"]);
    expect(r.drafts[0]).toMatchObject({
      orderKey: "SKL116|#AP1376",
      routeCode: "VNFZZXR",
      destinationIso2: "US",
      receiverName: "David Lee",
      receiverPostalCode: "68322",
      hsCode: null,
      createdAt: "2026-11-18T15:19:43+07:00",
      packages: [{ lengthCm: "34", widthCm: "23", heightCm: "11", actualWeight: "0.786" }],
    });
  });
});
