"use client";

import { useMemo, useState } from "react";
import { Boxes, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/form";
import { parseNumberCell } from "@/lib/pricing/import-excel";
import {
  emptyPackageRow,
  encodePackageRow,
  parsePastedRows,
  QUOTE_SERVICE_TYPES,
  sumDecimal,
  type QuotePackageRow,
} from "@/lib/pricing/quote-input";

type Props = {
  defaults: { to: string; kg: string; cbm: string; ncc: string; dv: string; date: string };
  rows: QuotePackageRow[];
  suppliers: { code: string; name: string }[];
  autoFocus: boolean;
};

const COLS = ["qty", "kg", "l", "w", "h"] as const;
const COL_LABEL: Record<(typeof COLS)[number], string> = { qty: "Số kiện", kg: "Cân/kiện (kg)", l: "Dài (cm)", w: "Rộng (cm)", h: "Cao (cm)" };
const filled = (r: QuotePackageRow) => !!(r.kg.trim() || r.l.trim() || r.w.trim() || r.h.trim());
const n = (v: string) => parseNumberCell(v, "weight");
const fmt = (v: string) => Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 4 });

/** Tổng hiển thị (tạm tính phía trình duyệt; máy chủ kiểm tra lại khi tra cứu). */
function totals(rows: QuotePackageRow[]) {
  let pieces = 0;
  const kgs: string[] = [];
  const cbms: string[] = [];
  for (const r of rows.filter(filled)) {
    const q = r.qty.trim() === "" ? 1 : Number(r.qty);
    if (!Number.isInteger(q) || q < 1) continue;
    pieces += q;
    const kg = n(r.kg);
    if (kg) kgs.push(String(Number(kg) * q));
    const [l, w, h] = [n(r.l), n(r.w), n(r.h)];
    if (l && w && h) cbms.push(String((Number(l) * Number(w) * Number(h) * q) / 1_000_000));
  }
  return { pieces, kg: kgs.length ? sumDecimal(kgs) : "", cbm: cbms.length ? sumDecimal(cbms.map((c) => Number(c).toFixed(6)), 4) : "" };
}

export function QuoteForm({ defaults, rows: initialRows, suppliers, autoFocus }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QuotePackageRow[]>(initialRows.length ? initialRows : [emptyPackageRow()]);
  const active = rows.filter(filled);
  const t = useMemo(() => totals(rows), [rows]);
  const multi = active.length > 0;

  const set = (i: number, k: keyof QuotePackageRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const remove = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyPackageRow()]));
  const onPaste = (i: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return; // dán 1 ô bình thường
    e.preventDefault();
    const pasted = parsePastedRows(text);
    setRows((rs) => [...rs.slice(0, i), ...pasted, ...rs.slice(i + 1)].filter((r, j, all) => filled(r) || j === all.length - 1));
  };

  return (
    <>
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[100px_130px_130px_auto_160px_120px_150px_auto]">
        <Field label="Điểm đến (ISO2)" htmlFor="to">
          <Input id="to" name="to" defaultValue={defaults.to} placeholder="US" maxLength={2} required className="uppercase" autoFocus={autoFocus} />
        </Field>
        <Field label="Trọng lượng (kg)" htmlFor="kg">
          {multi ? (
            <Input id="kg" value={t.kg ? fmt(t.kg) : ""} readOnly className="bg-muted/60" title="Tổng cân thực các kiện" />
          ) : (
            <Input id="kg" name="kg" defaultValue={defaults.kg} inputMode="decimal" placeholder="1,5" />
          )}
        </Field>
        <Field label="Thể tích (CBM)" htmlFor="cbm">
          {multi ? (
            <Input id="cbm" value={t.cbm ? fmt(t.cbm) : ""} readOnly className="bg-muted/60" title="Tổng thể tích các kiện có kích thước" />
          ) : (
            <Input id="cbm" name="cbm" defaultValue={defaults.cbm} inputMode="decimal" placeholder="m³" />
          )}
        </Field>
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className={multi ? "border-primary text-primary" : undefined}>
          <Boxes /> Kích thước thông tin{multi && ` (${t.pieces} kiện)`}
        </Button>
        <Field label="Nhà cung cấp" htmlFor="ncc">
          <NativeSelect id="ncc" name="ncc" defaultValue={defaults.ncc}>
            <option value="">Tất cả</option>
            {suppliers.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
                {s.name && s.name !== s.code ? ` — ${s.name}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dịch vụ" htmlFor="dv">
          <NativeSelect id="dv" name="dv" defaultValue={defaults.dv}>
            <option value="">Tất cả</option>
            {QUOTE_SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ngày áp giá" htmlFor="date">
          <Input id="date" name="date" type="date" defaultValue={defaults.date} />
        </Field>
        <Button type="submit">
          <Search /> Tra cứu
        </Button>
        {active.map((r, i) => (
          <input key={i} type="hidden" name="p" value={encodePackageRow(r)} />
        ))}
      </form>

      <Dialog open={open} onOpenChange={setOpen} title="Kích thước thông tin" description="Mỗi dòng là một nhóm kiện giống nhau. Có thể dán nhiều dòng từ Excel (Số kiện · Cân · Dài · Rộng · Cao)." className="max-w-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-10 py-2 text-left font-medium">STT</th>
                <th className="w-10 py-2">
                  <button type="button" onClick={() => setRows((rs) => [...rs, emptyPackageRow()])} className="rounded bg-emerald-600 p-0.5 text-white hover:bg-emerald-700" aria-label="Thêm dòng">
                    <Plus className="size-3.5" />
                  </button>
                </th>
                {COLS.map((c) => (
                  <th key={c} className="px-1 py-2 text-left font-medium">
                    {COL_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="py-1.5 text-center">
                    <button type="button" onClick={() => remove(i)} className="rounded bg-red-500/90 p-0.5 text-white hover:bg-red-600" aria-label={`Xóa dòng ${i + 1}`}>
                      <Minus className="size-3.5" />
                    </button>
                  </td>
                  {COLS.map((c) => (
                    <td key={c} className="px-1 py-1.5">
                      <Input
                        value={r[c]}
                        onChange={(e) => set(i, c, e.target.value)}
                        onPaste={onPaste(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (i === rows.length - 1) setRows((rs) => [...rs, emptyPackageRow()]);
                          }
                        }}
                        inputMode={c === "qty" ? "numeric" : "decimal"}
                        className="h-8 min-w-16"
                        aria-label={`Dòng ${i + 1} ${COL_LABEL[c]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium">{t.pieces} kiện</span>
            <span className="text-muted-foreground">
              {" "}· tổng cân thực {t.kg ? fmt(t.kg) : 0} kg{t.cbm && ` · ${fmt(t.cbm)} m³`}
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setRows([emptyPackageRow()])}>
              Xóa hết
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Xong
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
