"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LineSeries {
  key: string;
  name: string;
  color: string; // CSS var, VD "var(--series-1)"
}

/**
 * Biểu đồ đường 1 trục (cùng đơn vị) — đường 2px, lưới mờ, chú giải + nhãn trực tiếp cuối đường,
 * crosshair + tooltip khi rê chuột, có nút xem dạng bảng (thay thế cho người không xem được màu).
 */
export function LineChart<T extends { bucket: string } & Record<string, number | string>>({
  data,
  series,
  formatValue,
  formatBucket,
  height = 280,
  title,
}: {
  data: T[];
  series: LineSeries[];
  formatValue: (v: number) => string;
  formatBucket: (b: string) => string;
  height?: number;
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const W = 900;
  const H = height;
  const pad = { l: 72, r: 96, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const { min, max, ticks } = useMemo(() => {
    const vals = data.flatMap((d) => series.map((s) => Number(d[s.key])));
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi === lo) hi = lo + 1;
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const t: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(v);
    return { min: lo, max: hi, ticks: t };
  }, [data, series]);

  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - min) / (max - min)) * ih;
  const compact = (v: number) =>
    Math.abs(v) >= 1e9 ? `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr` : v.toLocaleString("vi-VN");
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg || data.length === 0) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = data.length <= 1 ? 0 : Math.round(((px - pad.l) / iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  // Nhãn trực tiếp cuối đường, đẩy tránh chồng nhau
  const endLabels = useMemo(() => {
    if (!data.length) return [];
    const last = data[data.length - 1];
    const ls = series.map((s) => ({ s, y: y(Number(last[s.key])) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 14) ls[i].y = ls[i - 1].y + 14;
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, series, min, max]);

  const hv = hover !== null ? data[hover] : null;

  return (
    <figure className="viz-root">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
          <button type="button" className="text-primary hover:underline" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Xem biểu đồ" : "Xem bảng"}
          </button>
        </span>
      </figcaption>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">Thời gian</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-1.5 text-right text-xs font-medium text-muted-foreground">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.bucket} className="border-t">
                  <td className="px-3 py-1">{formatBucket(d.bucket)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1 text-right tabular-nums">
                      {formatValue(Number(d[s.key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full touch-none select-none"
            role="img"
            aria-label={`${title}: ${series.map((s) => s.name).join(", ")}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={t === 0 ? 1.5 : 1} />
                <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              i % labelEvery === 0 || i === data.length - 1 ? (
                <text key={d.bucket} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {formatBucket(d.bucket)}
                </text>
              ) : null,
            )}
            {series.map((s) => (
              <polyline
                key={s.key}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={data.map((d, i) => `${x(i)},${y(Number(d[s.key]))}`).join(" ")}
              />
            ))}
            {endLabels.map(({ s, y: ly }) => (
              <text key={s.key} x={W - pad.r + 8} y={ly} dy="0.32em" className="fill-foreground text-[11px] font-medium">
                {s.name}
              </text>
            ))}
            {hv && hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
                {series.map((s) => (
                  <circle key={s.key} cx={x(hover)} cy={y(Number(hv[s.key]))} r={4.5} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
          {hv && hover !== null && (
            <div
              className={cn("pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border bg-popover px-3 py-2 text-xs shadow-md")}
              style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
            >
              <p className="mb-1 font-medium">{formatBucket(hv.bucket)}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-medium tabular-nums">{formatValue(Number(hv[s.key]))}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
