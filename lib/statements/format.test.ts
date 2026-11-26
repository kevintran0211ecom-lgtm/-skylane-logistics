import { describe, expect, it } from "vitest";
import { BANK, BANK_QR_PAYLOAD, crc16, formatStatementNo, statementName, transferNote } from "./format";

describe("Mã & tên bảng kê", () => {
  it("SKLddMMyyXXXX khớp mẫu hiện tại (SKL2311260002)", () => {
    expect(formatStatementNo("2026-11-23", 2)).toBe("SKL2311260002");
    expect(formatStatementNo("2027-01-05", 1234)).toBe("SKL0501271234");
    expect(() => formatStatementNo("2026-11-23", 10000)).toThrow();
  });
  it("tên = {Tên KH} - {Mã KH} - {Mã bảng kê}", () => {
    expect(statementName(" Chị Thanh ", "SKL116", "SKL2311260002")).toBe("Chị Thanh - SKL116 - SKL2311260002");
  });
});

describe("VietQR MSB", () => {
  it("CRC-16/CCITT-FALSE chuẩn ('123456789' → 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("QR mặc định của ngân hàng (nguyên văn từ ảnh MSB cấp): BIN MSB + đúng số TK, số tiền & nội dung để trống, CRC đúng", () => {
    const p = BANK_QR_PAYLOAD;
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("0006" + BANK.bankBin + "0110" + BANK.accountNo);
    expect(p).toContain("5303704" + "5400" + "5802VN"); // VND, thẻ số tiền rỗng → khách tự nhập số tiền
    expect(p).toContain("0800"); // mục đích/nội dung rỗng → khách tự nhập mã bảng kê
    expect(p.slice(-4).toUpperCase()).toBe(crc16(p.slice(0, -4)));
  });
  it("nội dung chuyển khoản bỏ dấu & ký tự đặc biệt", () => {
    expect(transferNote("Đơn #AP1 – tháng 11!")).toBe("Don AP1 thang 11");
  });
});
