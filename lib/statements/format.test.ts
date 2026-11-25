import { describe, expect, it } from "vitest";
import { crc16, formatStatementNo, statementName, transferNote, vietQrPayload } from "./format";

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
  it("payload có BIN MSB, số TK, số tiền, nội dung không dấu và CRC đúng", () => {
    const p = vietQrPayload({ amount: "165865", note: "SKL2311260002 Chị Thanh" });
    expect(p).toContain("0006970426" + "01103812042003");
    expect(p).toContain("5406165865");
    expect(p).toContain("5802VN");
    expect(p).toContain("62" + "27" + "0823SKL2311260002 Chi Than");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    expect(p.startsWith("000201010212")).toBe(true);
  });
  it("không có số tiền → QR tĩnh (01=11); nội dung bỏ ký tự đặc biệt", () => {
    expect(vietQrPayload().startsWith("000201010211")).toBe(true);
    expect(transferNote("Đơn #AP1 – tháng 11!")).toBe("Don AP1 thang 11");
  });
});
