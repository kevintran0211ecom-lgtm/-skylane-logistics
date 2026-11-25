/** Mã / tên bảng kê & mã QR chuyển khoản VietQR (module thuần — có unit test) */

export const STATEMENT_PREFIX = "SKL";

/** Tài khoản nhận tiền in trên bảng kê */
export const BANK = {
  bankName: "MSB",
  bankBin: "970426", // Ngân hàng TMCP Hàng Hải Việt Nam (MSB) — mã BIN Napas
  accountNo: "3812042003",
  accountName: "HOANG THU THAO",
} as const;

/** SKL + ddMMyy + số thứ tự 4 chữ số trong ngày. VD 23/11/2026, số 2 → SKL2311260002 */
export function formatStatementNo(day: string, seq: number): string {
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) throw new Error(`Ngày không hợp lệ: ${day}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new Error("Số thứ tự bảng kê trong ngày phải từ 1 đến 9999");
  return `${STATEMENT_PREFIX}${d}${m}${y.slice(2)}${String(seq).padStart(4, "0")}`;
}

/** "{Tên Khách Hàng} - {Mã KH} - {Mã bảng kê}" */
export const statementName = (customerName: string, customerCode: string, statementNo: string) =>
  `${customerName.trim()} - ${customerCode} - ${statementNo}`;

// -----------------------------------------------------------------------------
// VietQR (chuẩn EMVCo / Napas 247): quét bằng mọi app ngân hàng, tự điền số tiền & nội dung
// -----------------------------------------------------------------------------
const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Nội dung CK chỉ giữ chữ không dấu, số, khoảng trắng (an toàn với mọi ngân hàng), tối đa 25 ký tự */
export const transferNote = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 25);

export function vietQrPayload(opts: { amount?: string | number | null; note?: string | null } = {}): string {
  const amount = opts.amount ? String(Math.round(Number(opts.amount))) : "";
  const merchant = tlv("00", "A000000727") + tlv("01", tlv("00", BANK.bankBin) + tlv("01", BANK.accountNo)) + tlv("02", "QRIBFTTA");
  let body =
    tlv("00", "01") +
    tlv("01", amount && amount !== "0" ? "12" : "11") +
    tlv("38", merchant) +
    tlv("53", "704") +
    (amount && amount !== "0" ? tlv("54", amount) : "") +
    tlv("58", "VN");
  const note = opts.note ? transferNote(opts.note) : "";
  if (note) body += tlv("62", tlv("08", note));
  body += "6304";
  return body + crc16(body);
}
