import { describe, expect, it } from "vitest";
import { createOrderSchema, parseBulkEdit } from "./schemas";

describe("Form tạo đơn nội bộ", () => {
  it("chuẩn hóa mã, nhiều kiện kiểu VN, giờ VN +07:00", () => {
    const r = createOrderSchema.safeParse({
      customerCode: "skl116",
      billCode: " #ap1 ",
      routeCode: "vnfzzxr",
      assignedRouteCode: "",
      destinationIso2: "us",
      shippedAt: "2026-11-25T10:30",
      packages: JSON.stringify([
        { lengthCm: "34", widthCm: "23", heightCm: "11", actualWeight: "0,786" },
        { lengthCm: "", widthCm: "", heightCm: "", actualWeight: 2 },
      ]),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      customerCode: "SKL116",
      billCode: "#AP1",
      assignedRouteCode: null,
      destinationIso2: "US",
      shippedAt: "2026-11-25T10:30:00+07:00",
      packages: [
        { lengthCm: "34", actualWeight: "0.786" },
        { lengthCm: "0", actualWeight: "2" },
      ],
    });
  });

  it("lỗi tiếng Việt cho điểm đến, cân kiện sai", () => {
    const r = createOrderSchema.safeParse({
      customerCode: "A", billCode: "B", routeCode: "R", destinationIso2: "USA",
      packages: JSON.stringify([{ actualWeight: "abc" }]),
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.message)).toEqual(["Điểm đến là mã quốc gia 2 chữ (VD: US)", "Cân thực không hợp lệ"]);
  });
});

describe("Sửa đổi hàng loạt", () => {
  it("chỉ lấy trường được tick; ô cân để trống = bỏ ghi đè", () => {
    const r = parseBulkEdit({
      ids: "3,1,3",
      enable_assignedRouteCode: "on", assignedRouteCode: "ups han s5500",
      enable_billedWeight: "on", billedWeight: "1,5",
      enable_shippedWeight: "on", shippedWeight: "",
      routeCode: "KHONG_TICK", status: "Hoàn",
    });
    expect(r).toEqual({
      ok: true,
      plan: {
        ids: [3, 1],
        fields: ["assignedRouteCode", "billedWeight", "shippedWeight"],
        assignedRouteCode: "UPS HAN S5500",
        weights: { billed_weight: "1.5", shipped_weight: null },
        affectsPricing: true,
      },
    });
  });

  it("chỉ đổi trạng thái/ghi chú → không cần tính lại giá; mở khóa giá → tính lại", () => {
    const a = parseBulkEdit({ ids: "1", enable_status: "on", status: "Đã nhận kho", enable_note: "on", note: " " });
    expect(a.ok && a.plan).toMatchObject({ status: "Đã nhận kho", note: null, affectsPricing: false });
    const b = parseBulkEdit({ ids: "1", enable_priceLocked: "on", priceLocked: "false" });
    expect(b.ok && b.plan.affectsPricing).toBe(true);
  });

  it("chưa chọn đơn / chưa tick trường / giá trị sai", () => {
    expect(parseBulkEdit({ ids: "" })).toMatchObject({ ok: false, error: "Chưa chọn đơn nào." });
    expect(parseBulkEdit({ ids: "1" })).toMatchObject({ ok: false, error: "Tick chọn ít nhất một trường cần cập nhật." });
    expect(parseBulkEdit({ ids: "1", enable_destinationIso2: "on", destinationIso2: "USA", enable_status: "on", status: "Mới" })).toMatchObject({
      ok: false,
      fieldErrors: { destinationIso2: "Mã quốc gia 2 chữ (VD: US)", status: "Chọn trạng thái" },
    });
  });
});
