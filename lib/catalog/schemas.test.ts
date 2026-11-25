import { describe, expect, it } from "vitest";
import { customerSchema, priceGroupSchema, routeSchema } from "./schemas";

const baseCustomer = { mode: "create", customerCode: " skl116 ", name: "Chị Thanh", currency: "VND", syncSourceType: "NONE", isActive: "on" };
const baseRoute = { mode: "create", routeCode: "ups han s5500 ", name: "UPS HAN S5500", serviceType: "CPN", weightCalcMode: "ACTUAL_ONLY", dimDivisor: "5.500" };

describe("Form Khách hàng", () => {
  it("chuẩn hóa mã KH, ô trống → null, checkbox, % mặc định", () => {
    const r = customerSchema.safeParse({ ...baseCustomer, priceAdjustPct: "-5", priceGroupCode: " vip ", phone: "  " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({ customerCode: "SKL116", priceGroupCode: "VIP", priceAdjustPct: "-5", phone: null, isActive: true, syncEnabled: false });
  });

  it("báo lỗi tiếng Việt theo từng trường", () => {
    const r = customerSchema.safeParse({ ...baseCustomer, customerCode: "A|B", name: "", email: "abc", priceAdjustPct: "-100" });
    expect(r.success).toBe(false);
    if (r.success) return;
    const byField = Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    expect(byField).toMatchObject({
      customerCode: "Mã KH không được chứa ký tự |",
      name: "Nhập tên khách hàng",
      email: "Email không hợp lệ",
      priceAdjustPct: "% điều chỉnh phải trong khoảng (-100, 1000]",
    });
  });
});

describe("Form Tuyến", () => {
  it("DIM nhập kiểu VN '5.500' → 5500; ACTUAL_ONLY hợp lệ; mã tuyến viết hoa", () => {
    const r = routeSchema.safeParse(baseRoute);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ routeCode: "UPS HAN S5500", dimDivisor: "5500", weightCalcMode: "ACTUAL_ONLY", isActive: false });
  });

  it("DIM âm/0/chữ và chế độ tính cân sai bị từ chối", () => {
    for (const dim of ["-1", "0", "abc"]) expect(routeSchema.safeParse({ ...baseRoute, dimDivisor: dim }).success).toBe(false);
    const r = routeSchema.safeParse({ ...baseRoute, weightCalcMode: "VOLUME" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Chọn cách tính cân");
  });
});

describe("Nhóm giá", () => {
  it("chuẩn hóa mã, nhận % âm/dương, chặn % ≤ -100", () => {
    const ok = priceGroupSchema.safeParse({ mode: "create", code: " ca nhan ", name: "Cá nhân", adjustPct: "12,5", isActive: "on" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toMatchObject({ code: "CA NHAN", adjustPct: "12.5", isActive: true, note: null });
    const bad = priceGroupSchema.safeParse({ mode: "create", code: "X", name: "X", adjustPct: "-100" });
    expect(bad.success).toBe(false);
  });
});
