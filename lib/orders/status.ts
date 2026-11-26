/** Trạng thái vận đơn (enum cố định) — module không phụ thuộc thư viện, dùng chung mọi nơi */
export const ORDER_STATUSES = ["Phát sinh", "Đã nhận kho", "Đã xuất hàng", "Đã giao hàng", "Hoàn"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
