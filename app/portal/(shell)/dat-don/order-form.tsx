"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { savePortalOrder } from "@/lib/portal/actions";
import { PORTAL_FIELD_LABEL as L, PORTAL_REQUIRED, type PortalOrderField } from "@/lib/portal/rules";
import { submitWithoutReset } from "@/lib/form-submit";

type Pkg = { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string };
const emptyPkg = (): Pkg => ({ lengthCm: "", widthCm: "", heightCm: "", actualWeight: "" });
const num = (s: string) => Number(s.replace(",", ".")) || 0;
export type PortalRouteOption = { code: string; name: string; serviceType: string };

export function PortalOrderForm({
  routes,
  mode = "create",
  id,
  initial,
  readOnly = false,
  onDone,
}: {
  routes: PortalRouteOption[];
  mode?: "create" | "draft" | "order";
  id?: number;
  initial?: { values: Record<string, string>; packages: Pkg[] };
  /** Chỉ xem: đơn không còn sửa được, hoặc nhân viên đang xem như khách. Chuỗi = lý do hiển thị. */
  readOnly?: boolean | string;
  onDone?: (message?: string) => void;
}) {
  const [state, action, pending] = useActionState(savePortalOrder, null);
  const [packages, setPackages] = useState<Pkg[]>(initial?.packages.length ? initial.packages : [emptyPkg()]);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!state?.ok) return;
    if (onDone) onDone(state.message);
    else {
      // Đặt đơn mới: xóa form để nhập đơn tiếp theo
      setDone(state.message ?? null);
      setPackages([emptyPkg()]);
      setFormKey((k) => k + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state, onDone]);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const v = initial?.values ?? {};
  const req = (f: PortalOrderField) => (PORTAL_REQUIRED.includes(f) ? `${L[f]} *` : L[f]);
  const setPkg = (i: number, k: keyof Pkg, val: string) => setPackages((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: val } : p)));
  const totalKg = packages.reduce((t, p) => t + num(p.actualWeight), 0);
  const totalVol = packages.reduce((t, p) => t + (num(p.lengthCm) * num(p.widthCm) * num(p.heightCm)) / 1e6, 0);
  const text = (f: PortalOrderField, extra: React.ComponentProps<typeof Input> = {}) => (
    <Field label={req(f)} htmlFor={`${f}-${formKey}`} error={err[f]}>
      <Input id={`${f}-${formKey}`} name={f} defaultValue={v[f] ?? ""} required={PORTAL_REQUIRED.includes(f)} disabled={!!readOnly} {...extra} />
    </Field>
  );

  return (
    <form key={formKey} onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <input type="hidden" name="mode" value={mode} />
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="packages" value={JSON.stringify(packages.filter((p) => p.actualWeight || p.lengthCm || p.widthCm || p.heightCm))} />
      {done && <Alert tone="success">{done}</Alert>}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {readOnly && (
        <Alert tone="warning">{typeof readOnly === "string" ? readOnly : "Đơn này không sửa được nữa (SkyLane đã nhận kho hoặc chốt giá). Liên hệ SkyLane nếu cần điều chỉnh."}</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {text("billCode", { readOnly: mode === "order", className: mode === "order" ? "bg-muted/60" : undefined, placeholder: "Mã vận đơn của bạn" })}
        {text("trackingNumber")}
        <Field label={req("routeCode")} htmlFor={`routeCode-${formKey}`} error={err.routeCode} hint="Thành tiền tính theo tuyến này">
          <NativeSelect id={`routeCode-${formKey}`} name="routeCode" required defaultValue={v.routeCode ?? ""} disabled={!!readOnly}>
            <option value="" disabled>
              — Chọn tuyến —
            </option>
            {v.routeCode && !routes.some((r) => r.code === v.routeCode) && <option value={v.routeCode}>{v.routeCode}</option>}
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.serviceType})
              </option>
            ))}
          </NativeSelect>
        </Field>
        {text("destinationIso2", { maxLength: 2, placeholder: "US", className: "uppercase" })}
      </div>

      <fieldset className="rounded-lg border p-4" disabled={!!readOnly}>
        <legend className="px-1 text-sm font-medium">
          {L.packages} * — {packages.length} kiện · {totalKg.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg ·{" "}
          {totalVol.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³
        </legend>
        <div className="grid gap-2">
          <div className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] gap-2 text-xs text-muted-foreground">
            <span>#</span>
            <span>Dài (cm)</span>
            <span>Rộng (cm)</span>
            <span>Cao (cm)</span>
            <span>Cân nặng (kg)</span>
            <span />
          </div>
          {packages.map((p, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] items-center gap-2">
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              {(["lengthCm", "widthCm", "heightCm", "actualWeight"] as const).map((k) => (
                <Input key={k} value={p[k]} onChange={(e) => setPkg(i, k, e.target.value)} inputMode="decimal" aria-label={`Kiện ${i + 1} ${k}`} />
              ))}
              <Button type="button" variant="ghost" size="icon" onClick={() => setPackages((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [emptyPkg()]))} aria-label={`Xóa kiện ${i + 1}`}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPackages((ps) => [...ps, emptyPkg()])}>
            <Plus /> Thêm kiện
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPackages((ps) => [...ps, { ...ps[ps.length - 1] }])}>
            <Copy /> Nhân bản kiện cuối
          </Button>
        </div>
        {err.packages && <p className="mt-1 text-xs text-destructive">{err.packages}</p>}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3" disabled={!!readOnly}>
        <legend className="px-1 text-sm font-medium">Người nhận</legend>
        {text("receiverName")}
        {text("receiverPhone")}
        {text("receiverEmail", { type: "email" })}
        <div className="sm:col-span-3">{text("receiverAddress")}</div>
        {text("receiverCity")}
        {text("receiverState")}
        {text("receiverPostalCode")}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4" disabled={!!readOnly}>
        <legend className="px-1 text-sm font-medium">Hàng hóa & khai báo</legend>
        {text("goodsDescription")}
        {text("goodsNameEn")}
        {text("hsCode")}
        {text("declaredValueUsd", { inputMode: "decimal", placeholder: "VD: 25" })}
      </fieldset>

      <Field label={L.note} htmlFor={`note-${formKey}`}>
        <Textarea id={`note-${formKey}`} name="note" defaultValue={v.note ?? ""} disabled={!!readOnly} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">* bắt buộc. Thành tiền chính thức theo cân tại kho SkyLane sau khi xác nhận.</p>
        <div className="flex gap-2">
          {onDone && (
            <Button type="button" variant="outline" onClick={() => onDone()}>
              {readOnly ? "Đóng" : "Hủy"}
            </Button>
          )}
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending ? "Đang gửi…" : mode === "create" ? "Gửi đơn cho SkyLane" : "Lưu thay đổi"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
