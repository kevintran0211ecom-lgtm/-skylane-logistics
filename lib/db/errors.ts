/** Chuyển lỗi PostgreSQL (qua Drizzle/postgres.js) thành thông báo tiếng Việt */
const BY_CONSTRAINT: Record<string, string> = {
  customers_pkey: "Mã khách hàng đã tồn tại.",
  routes_pkey: "Mã tuyến đã tồn tại.",
  suppliers_pkey: "Mã nhà cung cấp đã tồn tại.",
  price_groups_pkey: "Mã nhóm giá đã tồn tại.",
  ck_customers_code: "Mã khách hàng phải viết hoa, không khoảng trắng thừa và không chứa ký tự |.",
  ck_customers_adjust: "% điều chỉnh giá phải lớn hơn -100 và không quá 1000.",
  ck_routes_code: "Mã tuyến phải viết hoa, không khoảng trắng thừa.",
  ck_routes_dim: "Hệ số DIM phải lớn hơn 0.",
  ex_pv_sell_no_overlap: "Khoảng hiệu lực trùng với một phiên bản giá bán khác đang áp dụng (cùng tuyến & phạm vi).",
  ex_pv_cost_no_overlap: "Khoảng hiệu lực trùng với một phiên bản giá gốc khác đang áp dụng của tuyến này.",
  ex_perkg_no_overlap: "Các khoảng giá theo kg bị chồng lấn.",
  ck_pv_dates: "Ngày hết hiệu lực phải sau ngày bắt đầu.",
  uq_orders_order_key: "Mã vận đơn đã tồn tại với khách hàng này (trùng order_key).",
  orders_customer_code_fkey: "Khách hàng không tồn tại.",
  orders_route_code_fkey: "Tuyến vận chuyển không tồn tại.",
  orders_assigned_route_code_fkey: "Tuyến chỉ định không tồn tại.",
  ck_orders_bill_code: "Mã vận đơn không hợp lệ.",
  ck_orders_iso2: "Điểm đến phải là mã quốc gia ISO2.",
  ck_orders_overrides: "Trường ghi đè thủ công không hợp lệ.",
};

const BY_CODE: Record<string, string> = {
  "23505": "Dữ liệu bị trùng.",
  "23503": "Dữ liệu liên kết không tồn tại hoặc đang được sử dụng.",
  "23514": "Dữ liệu không hợp lệ.",
  "23P01": "Dữ liệu chồng lấn với bản ghi khác.",
};

export function dbErrorMessage(e: unknown, fallback = "Đã xảy ra lỗi, vui lòng thử lại."): string {
  const err = (e && typeof e === "object" && "cause" in e && e.cause ? e.cause : e) as {
    code?: string;
    constraint_name?: string;
    message?: string;
  };
  if (err?.constraint_name && BY_CONSTRAINT[err.constraint_name]) return BY_CONSTRAINT[err.constraint_name];
  if (err?.code && BY_CODE[err.code]) return BY_CODE[err.code];
  if (process.env.NODE_ENV !== "production" && err?.message) return `${fallback} (${err.message})`;
  return fallback;
}
