import { describe, expect, it } from "vitest";
import { dayRangeIso, nextSort, parseOrderFilter } from "./filters";

describe("Bộ lọc Vận đơn từ URL", () => {
  it("giá trị hợp lệ được giữ, sai bị bỏ; từ > đến tự đảo", () => {
    expect(parseOrderFilter({ q: "#AP1\n#AP2", status: "Đã xuất hàng", df: "exported", from: "2026-11-26", to: "2026-11-19", sort: "billCode", dir: "asc" })).toEqual({
      q: "#AP1\n#AP2",
      status: "Đã xuất hàng",
      dateField: "exported",
      from: "2026-11-19",
      to: "2026-11-26",
      sort: "billCode",
      dir: "asc",
    });
    expect(parseOrderFilter({ status: "X", df: "zzz", from: "19/11/2026", sort: "drop table", dir: "x" })).toEqual({
      q: "",
      status: undefined,
      dateField: "sent",
      from: undefined,
      to: undefined,
      sort: undefined,
      dir: "desc",
    });
  });

  it("bấm tiêu đề: A→Z → Z→A → bỏ", () => {
    expect(nextSort({ dir: "desc" }, "billCode")).toEqual({ sort: "billCode", dir: "asc" });
    expect(nextSort({ sort: "billCode", dir: "asc" }, "billCode")).toEqual({ sort: "billCode", dir: "desc" });
    expect(nextSort({ sort: "billCode", dir: "desc" }, "billCode")).toEqual({ sort: undefined, dir: "desc" });
  });

  it("khoảng ngày giờ VN (đến hết ngày cuối)", () => {
    expect(dayRangeIso("2026-11-19", "2026-11-30")).toEqual({ gte: "2026-11-19T00:00:00+07:00", lt: "2026-12-01T00:00:00+07:00" });
    expect(dayRangeIso(undefined, undefined)).toEqual({ gte: undefined, lt: undefined });
  });
});
