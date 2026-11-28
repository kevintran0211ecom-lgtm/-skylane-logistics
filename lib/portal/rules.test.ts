import { describe, expect, it } from "vitest";
import { EXPORT_COLUMNS } from "../orders/export-columns";
import { canCustomerEditOrder, portalMissingFields, parsePortalOrder, portalFormValues, PORTAL_EXPORT_COLUMNS, toDraftData, validateNewPassword } from "./rules";

const good = {
  billCode: " skl-001 ",
  routeCode: "vnfzzxr",
  destinationIso2: "us",
  receiverName: "John",
  receiverPhone: "+1 555",
  receiverAddress: "1 Main St",
  receiverCity: "NY",
  receiverPostalCode: "10001",
  goodsDescription: "Áo",
  declaredValueUsd: "12,5",
  packages: JSON.stringify([{ lengthCm: "30", widthCm: "20", heightCm: "10", actualWeight: "1,2" }]),
};

describe("mật khẩu", () => {
  it("không cho giữ mật khẩu mặc định, quá ngắn, không khớp", () => {
    expect(validateNewPassword("123456", "123456")).toMatch(/tối thiểu/);
    expect(validateNewPassword("11111111", "11111111")).toMatch(/dễ đoán/);
    expect(validateNewPassword("Skylane@2026", "Skylane@2025")).toMatch(/không khớp/);
    expect(validateNewPassword("Skylane@2026", "Skylane@2026")).toBeNull();
  });
});

describe("parsePortalOrder", () => {
  it("chuẩn hóa mã, số, kiện", () => {
    const r = parsePortalOrder(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ billCode: "SKL-001", routeCode: "VNFZZXR", destinationIso2: "US", declaredValueUsd: "12.5", trackingNumber: null });
    expect(r.data.packages).toEqual([{ lengthCm: "30", widthCm: "20", heightCm: "10", actualWeight: "1.2" }]);
    expect(toDraftData("SKL116", r.data)).toMatchObject({ customerCode: "SKL116", orderKey: "SKL116|SKL-001", assignedRouteCode: null, shippedAt: null });
  });

  it("báo thiếu trường bắt buộc", () => {
    const r = parsePortalOrder({ ...good, receiverPhone: " ", receiverPostalCode: "", goodsDescription: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["goodsDescription", "receiverPhone", "receiverPostalCode"]);
  });

  it("kiện phải đủ kích thước & cân", () => {
    const r = parsePortalOrder({ ...good, packages: JSON.stringify([{ lengthCm: "30", widthCm: "", heightCm: "10", actualWeight: "1" }]) });
    expect(!r.ok && r.fieldErrors.packages).toMatch(/Kiện 1/);
    const e = parsePortalOrder({ ...good, packages: "[]" });
    expect(!e.ok && e.fieldErrors.packages).toMatch(/ít nhất 1 kiện/);
  });

  it("giá trị khai báo / điểm đến / email sai", () => {
    const r = parsePortalOrder({ ...good, declaredValueUsd: "abc", destinationIso2: "USA", receiverEmail: "x@" });
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["declaredValueUsd", "destinationIso2", "receiverEmail"]);
  });
});

describe("khác", () => {
  it("chỉ sửa được vận đơn Phát sinh chưa khóa giá", () => {
    expect(canCustomerEditOrder({ status: "Phát sinh", priceLocked: false })).toBe(true);
    expect(canCustomerEditOrder({ status: "Phát sinh", priceLocked: true })).toBe(false);
    expect(canCustomerEditOrder({ status: "Đã nhận kho", priceLocked: false })).toBe(false);
  });
  it("cột tải Excel của khách không lộ giá gốc / NCC / tuyến chỉ định", () => {
    const keys = new Set(EXPORT_COLUMNS.map((c) => c.key));
    expect(PORTAL_EXPORT_COLUMNS.every((k) => keys.has(k))).toBe(true);
    for (const k of ["costAmount", "profit", "assignedRouteCode", "supplierCode", "serviceType", "internalNote", "sellAmount", "surchargeAmount"]) expect(PORTAL_EXPORT_COLUMNS).not.toContain(k);
  });
  it("đơn Excel trên cổng: báo trường bắt buộc còn thiếu", () => {
    const base = { receiverName: "A", receiverPhone: "1", receiverAddress: "x", receiverCity: "y", receiverPostalCode: "z", goodsDescription: "g", declaredValueUsd: "5", packages: [{ lengthCm: "1", widthCm: "1", heightCm: "1", actualWeight: "1" }] };
    expect(portalMissingFields(base)).toEqual([]);
    expect(portalMissingFields({ ...base, receiverPhone: null, declaredValueUsd: "0", packages: [{ lengthCm: "0", widthCm: "1", heightCm: "1", actualWeight: "1" }] })).toEqual([
      "số điện thoại",
      "giá trị khai báo (usd)",
      "kích thước / cân nặng kiện 1",
    ]);
  });
  it("giá trị form khi sửa", () => {
    const f = portalFormValues({ billCode: "A1", declaredValueUsd: "12.50", packages: [{ lengthCm: "30.00", widthCm: "20", heightCm: "10", actualWeight: "1.250" }] });
    expect(f.values.declaredValueUsd).toBe("12,5");
    expect(f.packages[0]).toEqual({ lengthCm: "30", widthCm: "20", heightCm: "10", actualWeight: "1,25" });
  });
});
