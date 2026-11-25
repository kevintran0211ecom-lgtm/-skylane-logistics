import { describe, expect, it } from "vitest";
import { BULK_FIELDS_BY_ROLE, can, homeFor, isScopedToOwnCustomers } from "./permissions";

describe("Phân quyền 4 vai trò", () => {
  it("Admin toàn quyền, gồm mở khóa & sửa đơn đã khóa giá", () => {
    for (const p of ["orders.unlock", "orders.editLocked", "users.manage", "pricing.manage", "receipts.manage"] as const) expect(can("ADMIN", p)).toBe(true);
  });
  it("Kế toán: bảng kê, đối soát, công nợ, sửa/mở khóa đơn khóa giá — không quản lý người dùng", () => {
    expect(["statements.manage", "receipts.manage", "orders.unlock", "orders.editLocked"].every((p) => can("KE_TOAN", p as never))).toBe(true);
    expect(can("KE_TOAN", "users.manage")).toBe(false);
  });
  it("Kho: xem đơn, sửa kiện & trường kho; không thấy tiền, không mở khóa, không bảng kê", () => {
    expect(can("KHO", "orders.view") && can("KHO", "orders.editPackages") && can("KHO", "orders.bulkEdit")).toBe(true);
    for (const p of ["orders.viewMoney", "orders.unlock", "orders.editLocked", "statements.view", "quote.view", "dashboard.view"] as const) expect(can("KHO", p)).toBe(false);
    expect(BULK_FIELDS_BY_ROLE.KHO).toEqual(["assignedRouteCode", "status", "actualWeight", "volumetricWeight", "shippedWeight", "trackingNumber", "note"]);
    expect(homeFor("KHO")).toBe("/don-hang");
  });
  it("Sale: chỉ xem đơn, báo giá, công nợ của khách mình — không sửa gì", () => {
    expect(can("SALE", "orders.view") && can("SALE", "quote.view") && can("SALE", "receipts.view")).toBe(true);
    for (const p of ["orders.create", "orders.bulkEdit", "orders.editPackages", "statements.manage", "receipts.manage", "catalog.view"] as const) expect(can("SALE", p)).toBe(false);
    expect(isScopedToOwnCustomers("SALE")).toBe(true);
    expect(isScopedToOwnCustomers("KE_TOAN")).toBe(false);
  });
  it("chưa đăng nhập / chưa cấp vai trò → không có quyền nào", () => {
    expect(can(null, "orders.view")).toBe(false);
  });
});
