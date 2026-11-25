"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { getOrderPackages, updateOrderPackages } from "@/lib/orders/actions";
import { submitWithoutReset } from "@/lib/form-submit";

type Pkg = { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string };
const empty = (): Pkg => ({ lengthCm: "", widthCm: "", heightCm: "", actualWeight: "" });
const clean = (v: string) => String(Number(v)) // "34.00" → "34"
  .replace(".", ",");

export function PackagesForm({ orderId, onDone }: { orderId: number; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateOrderPackages.bind(null, orderId), null);
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  useEffect(() => {
    getOrderPackages(orderId).then((rows) =>
      setPkgs(rows.length ? rows.map((r) => ({ lengthCm: clean(r.lengthCm), widthCm: clean(r.widthCm), heightCm: clean(r.heightCm), actualWeight: clean(r.actualWeight) })) : [empty()]),
    );
  }, [orderId]);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  if (!pkgs) return <p className="text-sm text-muted-foreground">Đang tải kiện hàng…</p>;
  const set = (i: number, k: keyof Pkg, v: string) => setPkgs((ps) => ps!.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-3">
      <input type="hidden" name="packages" value={JSON.stringify(pkgs.filter((p) => p.actualWeight || p.lengthCm || p.widthCm || p.heightCm))} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <div className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] gap-2 text-xs text-muted-foreground">
        <span>#</span>
        <span>Dài (cm)</span>
        <span>Rộng (cm)</span>
        <span>Cao (cm)</span>
        <span>Cân thực (kg)</span>
        <span />
      </div>
      {pkgs.map((p, i) => (
        <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] items-center gap-2">
          <span className="text-xs text-muted-foreground">{i + 1}</span>
          {(["lengthCm", "widthCm", "heightCm", "actualWeight"] as const).map((k) => (
            <Input key={k} value={p[k]} onChange={(e) => set(i, k, e.target.value)} inputMode="decimal" aria-label={`Kiện ${i + 1} ${k}`} />
          ))}
          <Button type="button" variant="ghost" size="icon" onClick={() => setPkgs((ps) => (ps!.length > 1 ? ps!.filter((_, j) => j !== i) : [empty()]))} aria-label={`Xóa kiện ${i + 1}`}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => setPkgs((ps) => [...ps!, empty()])}>
          <Plus /> Thêm kiện
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu & tính giá…" : "Lưu kiện"}
          </Button>
        </div>
      </div>
    </form>
  );
}
