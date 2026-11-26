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

/**
 * QR chuyển khoản MẶC ĐỊNH của ngân hàng (VietQR/NAPAS tĩnh — MSB 3812042003 HOANG THU THAO),
 * giải mã nguyên văn từ ảnh QR do ngân hàng cấp. Không kèm số tiền / nội dung: khách quét rồi
 * tự nhập số tiền và nội dung chuyển khoản (mã bảng kê) như ghi trên hóa đơn.
 */
export const BANK_QR_PAYLOAD = "00020101021238540010A00000072701240006970426011038120420030208QRIBFTTA530370454005802VN62150107NPS686908006304e593";
