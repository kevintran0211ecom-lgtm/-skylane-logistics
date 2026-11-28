/**
 * MA TRẬN PHÂN QUYỀN (RBAC) — module thuần, nguồn duy nhất cho mọi kiểm tra quyền
 * (trang, server action, API, menu). Có unit test.
 *
 *  ADMIN   : toàn quyền, gồm mở khóa & sửa đơn đã khóa giá, quản lý người dùng/danh mục/bảng giá.
 *  KE_TOAN : bảng kê, đối soát thu tiền, công nợ; sửa / mở khóa đơn đã khóa giá.
 *  KHO     : xem đơn, nhập/sửa kích thước, cân nặng, trạng thái kho, tuyến chỉ định — KHÔNG thấy tiền.
 *  SALE    : chỉ xem đơn, báo giá, công nợ của khách hàng mình phụ trách.
 */
export type Role = "ADMIN" | "KE_TOAN" | "SALE" | "KHO";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị",
  KE_TOAN: "Kế toán",
  KHO: "Kho",
  SALE: "Sale",
};

const MATRIX = {
  "dashboard.view": ["ADMIN", "KE_TOAN", "SALE"],
  "orders.view": ["ADMIN", "KE_TOAN", "KHO", "SALE"],
  "orders.viewMoney": ["ADMIN", "KE_TOAN", "SALE"], // giá bán, giá gốc, lợi nhuận
  // Đơn hàng dự báo: nhận đơn (nhập tay / Excel / Google Sheet), xác nhận → Vận đơn
  "drafts.view": ["ADMIN", "KE_TOAN", "KHO"],
  "drafts.manage": ["ADMIN", "KE_TOAN"],
  "orders.bulkEdit": ["ADMIN", "KE_TOAN", "KHO"], // KHO bị giới hạn trường — xem BULK_FIELDS_BY_ROLE
  "orders.editPackages": ["ADMIN", "KE_TOAN", "KHO"], // kích thước & cân từng kiện
  "orders.editLocked": ["ADMIN", "KE_TOAN"], // sửa đơn đã khóa giá
  "orders.unlock": ["ADMIN", "KE_TOAN"],
  "statements.view": ["ADMIN", "KE_TOAN", "SALE"],
  "statements.manage": ["ADMIN", "KE_TOAN"],
  "receipts.view": ["ADMIN", "KE_TOAN", "SALE"],
  "receipts.manage": ["ADMIN", "KE_TOAN"],
  "quote.view": ["ADMIN", "KE_TOAN", "SALE"],
  "catalog.view": ["ADMIN", "KE_TOAN"],
  "catalog.manage": ["ADMIN"],
  "pricing.view": ["ADMIN", "KE_TOAN"],
  "pricing.manage": ["ADMIN"],
  "users.manage": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof MATRIX;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && (MATRIX[permission] as readonly Role[]).includes(role);
}

/** SALE chỉ thấy dữ liệu của khách hàng có sale_user_id = mình */
export const isScopedToOwnCustomers = (role: Role) => role === "SALE";

/** Trường được phép trong Modal "Sửa đổi hàng loạt" theo vai trò */
const ALL_BULK = [
  "assignedRouteCode", "routeCode", "destinationIso2", "status", "actualWeight", "volumetricWeight",
  "billedWeight", "shippedWeight", "trackingNumber", "note", "priceLocked",
] as const;
export const BULK_FIELDS_BY_ROLE: Record<Role, readonly (typeof ALL_BULK)[number][]> = {
  ADMIN: ALL_BULK,
  KE_TOAN: ALL_BULK,
  // Kho: cân nặng đo được, trạng thái kho, tuyến chỉ định, tracking, ghi chú — không đụng giá bán / tuyến khách / khóa giá
  KHO: ["assignedRouteCode", "status", "actualWeight", "volumetricWeight", "shippedWeight", "trackingNumber", "note"],
  SALE: [],
};

/** Trang chủ theo vai trò */
export const homeFor = (role: Role) => (role === "KHO" ? "/don-hang" : "/dashboard");

/** Menu: đường dẫn → quyền cần có */
export const ROUTE_PERMISSION: Record<string, Permission> = {
  "/dashboard": "dashboard.view",
  "/don-du-bao": "drafts.view",
  "/don-hang": "orders.view",
  "/khach-hang": "catalog.view",
  "/nhom-gia": "catalog.view",
  "/tuyen": "catalog.view",
  "/bang-gia": "pricing.view",
  "/bang-ke": "statements.view",
  "/doi-soat": "receipts.view",
  "/bao-gia": "quote.view",
  "/gia-ban": "quote.view",
  "/nguoi-dung": "users.manage",
};
