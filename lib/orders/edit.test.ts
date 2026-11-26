import { describe, expect, it } from "vitest";
import { exportedAtOnStatus, isoToLocal, localToIso, parseOrderEdit } from "./edit";

const base = { id: "7", rowVersion: "3" };

describe("Sửa 1 vận đơn (cửa sổ chi tiết)", () => {
  it("Admin: chuẩn hóa mã, ngày giờ VN, email, tiền ghi đè / tự tính", () => {
    const r = parseOrderEdit(
      {
        ...base,
        customerCode: " skl116 ",
        billCode: "#ap1 ",
        routeCode: "vnfzzxr",
        assignedRouteCode: "",
        destinationIso2: "us",
        shippedAt: "2026-11-20T09:30",
        receiverEmail: "ABC@Gmail.com",
        goodsDescription: " Quần áo ",
        goodsNameEn: "Clothes",
        declaredValueUsd: "20,5",
        sellAmount: "250.000",
        costAmount: "",
        packages: JSON.stringify([{ lengthCm: "30", widthCm: "20", heightCm: "10", actualWeight: "0,8" }]),
      },
      "ADMIN",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.set).toMatchObject({
      customerCode: "SKL116",
      billCode: "#AP1",
      routeCode: "VNFZZXR",
      assignedRouteCode: null,
      destinationIso2: "US",
      shippedAt: "2026-11-20T09:30:00+07:00",
      receiverEmail: "abc@gmail.com",
      goodsDescription: "Quần áo",
      goodsNameEn: "Clothes",
      declaredValueUsd: "20.5",
    });
    expect(r.plan.sellAmount).toBe("250000");
    expect(r.plan.costAmount).toBeNull(); // để trống = tự tính
    expect(r.plan.packages?.[0].actualWeight).toBe("0.8");
    expect(r.plan.affectsPricing).toBe(true);
  });

  it("Kho: trường ngoài quyền bị bỏ qua (không đổi khách, tuyến, tiền)", () => {
    const r = parseOrderEdit({ ...base, customerCode: "X", sellAmount: "1", trackingNumber: " 1Z99 ", status: "Đã xuất hàng" }, "KHO");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.fields).toEqual(["trackingNumber", "status"]);
    expect(r.plan.set).toEqual({ trackingNumber: "1Z99", status: "Đã xuất hàng" });
    expect(r.plan.sellAmount).toBeUndefined();
    expect(r.plan.affectsPricing).toBe(false);
  });

  it("Sale chỉ xem; dữ liệu sai báo lỗi đúng trường", () => {
    expect(parseOrderEdit({ ...base, trackingNumber: "A" }, "SALE")).toMatchObject({ ok: false });
    const r = parseOrderEdit({ ...base, destinationIso2: "USA", receiverEmail: "abc", sellAmount: "abc", billCode: " " }, "KE_TOAN");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(["billCode", "destinationIso2", "receiverEmail", "sellAmount"]);
    expect(parseOrderEdit({ id: "7", rowVersion: "" }, "ADMIN")).toMatchObject({ ok: false });
  });

  it("ngày giờ: giờ VN ↔ ISO; thời gian xuất hàng tự ghi khi chuyển Đã xuất hàng", () => {
    expect(localToIso("2026-11-26")).toBe("2026-11-26T00:00:00+07:00");
    expect(localToIso("26/11/2026")).toBeUndefined();
    expect(isoToLocal("2026-11-26T04:31:00Z")).toBe("2026-11-26T11:31");
    expect(exportedAtOnStatus("Đã nhận kho", "Đã xuất hàng", null, "T1")).toBe("T1");
    expect(exportedAtOnStatus("Đã nhận kho", "Đã xuất hàng", "T0", "T1")).toBe("T0");
    expect(exportedAtOnStatus("Phát sinh", "Đã nhận kho", null, "T1")).toBeNull();
  });
});

describe("Kiện hàng (không dùng zod) — cùng quy tắc với form kiện", () => {
  it("chuẩn hóa số, báo đúng kiện lỗi, giới hạn 500", async () => {
    const { parsePackages } = await import("./edit");
    expect(parsePackages([{ lengthCm: "30", widthCm: 20, heightCm: "", actualWeight: "0,786" }])).toEqual({
      ok: true,
      packages: [{ lengthCm: "30", widthCm: "20", heightCm: "0", actualWeight: "0.786" }],
    });
    expect(parsePackages([{ lengthCm: "1" }, { actualWeight: "abc" }])).toEqual({ ok: false, error: "Kiện 2: Cân thực không hợp lệ" });
    expect(parsePackages("x")).toMatchObject({ ok: false });
    expect(parsePackages(Array(501).fill({}))).toEqual({ ok: false, error: "Tối đa 500 kiện" });
  });
});
