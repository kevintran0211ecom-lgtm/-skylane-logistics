"use client";

import { LineChart } from "@/components/charts/line-chart";
import { formatMoney } from "@/lib/utils";

const SERIES = [
  { key: "revenue", name: "Doanh thu", color: "var(--series-1)" },
  { key: "cost", name: "Giá vốn", color: "var(--series-2)" },
  { key: "profit", name: "Lợi nhuận", color: "var(--series-3)" },
];

export function RevenueChart({ points, granularity }: { points: { bucket: string; revenue: number; cost: number; profit: number }[]; granularity: "day" | "month" }) {
  return (
    <LineChart
      title={`Doanh thu, giá vốn & lợi nhuận theo ${granularity === "month" ? "tháng" : "ngày"} (VND)`}
      data={points}
      series={SERIES}
      formatValue={(v) => `${formatMoney(v)} đ`}
      formatBucket={(b) => (granularity === "month" ? `${b.slice(5, 7)}/${b.slice(0, 4)}` : `${b.slice(8, 10)}/${b.slice(5, 7)}`)}
    />
  );
}
