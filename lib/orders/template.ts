/**
 * Mẫu file Excel nhập vận đơn — đúng thứ tự cột tab "DON" trong file SKL116 - Chị Thanh.
 * Module thuần (dùng cho file mẫu tải về và kiểm thử nhận diện cột).
 */
export const ORDER_TEMPLATE_HEADERS = [
  "Thời gian phát sinh đơn",
  "STT",
  "Mã vận đơn",
  "Tuyến vận chuyển",
  "Giá trị khai báo",
  "Tên hàng tiếng Việt",
  "Tên hàng tiếng anh",
  "Mã HS (hải quan)",
  "Người nhận",
  "Địa chỉ người nhận",
  "Thành phố người nhận",
  "Bang/tỉnh người nhận",
  "Mã bưu chính người nhận",
  "SĐT người nhận",
  "Mail người nhận",
  "Điểm đến",
  "Số kiện",
  "Trọng lượng thực tế(kg)",
  "Dài",
  "Rộng",
  "Cao",
] as const;

/** Độ rộng cột (ký tự) cho file mẫu */
export const ORDER_TEMPLATE_WIDTHS = [20, 6, 14, 16, 12, 20, 20, 12, 20, 40, 16, 14, 12, 16, 22, 9, 8, 12, 7, 7, 7];

export const ORDER_TEMPLATE_SAMPLE: (string | number)[] = [
  "18/11/2026 15:19:43", 1, "#AP1376", "VNFZZXR", 20, "Quần áo", "Clothes", "", "David Lee",
  "308 N Fillmore St, Bruning, Nebraska, 68322, US", "Bruning", "NE", "68322", "+12698047967", "abc@gmail.com",
  "US", 1, 0.786, 34, 23, 11,
];

export const ORDER_TEMPLATE_NOTES = [
  "Bắt buộc: Mã vận đơn, Tuyến vận chuyển, Điểm đến (mã nước 2 chữ, VD US, GB).",
  "Thời gian phát sinh đơn: dd/mm/yyyy hh:mm:ss. Cân nặng (kg) & kích thước (cm) dùng dấu phẩy hoặc dấu chấm thập phân.",
  "Số kiện > 1 với một bộ kích thước → tạo nhiều kiện giống nhau, cân thực chia đều.",
  "Mã vận đơn đã có (cùng khách hàng) sẽ tự động bị chặn trùng.",
];
