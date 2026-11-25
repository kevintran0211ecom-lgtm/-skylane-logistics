"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { createDraft } from "@/lib/orders/draft-actions";
import { submitWithoutReset } from "@/lib/form-submit";
import type { CustomerOption, RouteOption } from "../don-hang/orders-view";

type Pkg = { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string };
const emptyPkg = (): Pkg => ({ lengthCm: "", widthCm: "", heightCm: "", actualWeight: "" });

export function CreateOrderForm({ routes, customers, onDone }: { routes: RouteOption[]; customers: CustomerOption[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(createDraft, null);
  const [packages, setPackages] = useState<Pkg[]>([emptyPkg()]);
  const [route, setRoute] = useState("");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const err = state && !state.ok ? state.fieldErrors ?? {} : {};
  const setPkg = (i: number, k: keyof Pkg, v: string) => setPackages((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const totalKg = packages.reduce((t, p) => t + (Number(p.actualWeight.replace(",", ".")) || 0), 0);

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="packages" value={JSON.stringify(packages.filter((p) => p.actualWeight || p.lengthCm || p.widthCm || p.heightCm))} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Khách hàng *" htmlFor="customerCode" error={err.customerCode}>
          <NativeSelect id="customerCode" name="customerCode" required defaultValue="">
            <option value="" disabled>
              — Chọn —
            </option>
            {customers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Mã vận đơn *" htmlFor="billCode" error={err.billCode} hint="Trùng Mã KH + Mã vận đơn sẽ bị chặn">
          <Input id="billCode" name="billCode" required />
        </Field>
        <Field label="Tracking" htmlFor="trackingNumber">
          <Input id="trackingNumber" name="trackingNumber" />
        </Field>
        <Field label="Tuyến vận chuyển *" htmlFor="routeCode" error={err.routeCode} hint="Tính cân tính phí & giá bán">
          <NativeSelect id="routeCode" name="routeCode" required value={route} onChange={(e) => setRoute(e.target.value)}>
            <option value="" disabled>
              — Chọn —
            </option>
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.serviceType})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tuyến chỉ định" htmlFor="assignedRouteCode" error={err.assignedRouteCode} hint="Tính cân xuất & giá gốc">
          <NativeSelect id="assignedRouteCode" name="assignedRouteCode" defaultValue="">
            <option value="">{route ? `Như tuyến vận chuyển (${route})` : "Như tuyến vận chuyển"}</option>
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.serviceType})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Điểm đến (ISO2) *" htmlFor="destinationIso2" error={err.destinationIso2}>
          <Input id="destinationIso2" name="destinationIso2" maxLength={2} placeholder="US" required className="uppercase" />
        </Field>
        <Field label="Ngày gửi hàng" htmlFor="shippedAt" hint="Để trống = dùng ngày tạo đơn để tra giá">
          <Input id="shippedAt" name="shippedAt" type="datetime-local" />
        </Field>
      </div>

      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">
          Kiện hàng ({packages.length}) · tổng cân thực {totalKg.toLocaleString("vi-VN", { maximumFractionDigits: 3 })} kg
        </legend>
        <div className="grid gap-2">
          <div className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] gap-2 text-xs text-muted-foreground">
            <span>#</span>
            <span>Dài (cm)</span>
            <span>Rộng (cm)</span>
            <span>Cao (cm)</span>
            <span>Cân thực (kg)</span>
            <span />
          </div>
          {packages.map((p, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_32px] items-center gap-2">
              <span className="text-xs text-muted-foreground">{i + 1}</span>
              {(["lengthCm", "widthCm", "heightCm", "actualWeight"] as const).map((k) => (
                <Input key={k} value={p[k]} onChange={(e) => setPkg(i, k, e.target.value)} inputMode="decimal" aria-label={`Kiện ${i + 1} ${k}`} />
              ))}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setPackages((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [emptyPkg()]))}
                aria-label={`Xóa kiện ${i + 1}`}
              >
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
            Nhân bản kiện cuối
          </Button>
        </div>
        {err.packages && <p className="mt-1 text-xs text-destructive">{err.packages}</p>}
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Người nhận & hải quan</legend>
        <Field label="Người nhận" htmlFor="receiverName">
          <Input id="receiverName" name="receiverName" />
        </Field>
        <Field label="SĐT" htmlFor="receiverPhone">
          <Input id="receiverPhone" name="receiverPhone" />
        </Field>
        <Field label="Email" htmlFor="receiverEmail" error={err.receiverEmail}>
          <Input id="receiverEmail" name="receiverEmail" type="email" />
        </Field>
        <Field label="Địa chỉ" htmlFor="receiverAddress" className="sm:col-span-3">
          <Input id="receiverAddress" name="receiverAddress" />
        </Field>
        <Field label="Thành phố" htmlFor="receiverCity">
          <Input id="receiverCity" name="receiverCity" />
        </Field>
        <Field label="Bang/tỉnh" htmlFor="receiverState">
          <Input id="receiverState" name="receiverState" />
        </Field>
        <Field label="Mã bưu chính" htmlFor="receiverPostalCode">
          <Input id="receiverPostalCode" name="receiverPostalCode" />
        </Field>
        <Field label="Tên hàng" htmlFor="goodsDescription">
          <Input id="goodsDescription" name="goodsDescription" />
        </Field>
        <Field label="Mã HS" htmlFor="hsCode">
          <Input id="hsCode" name="hsCode" />
        </Field>
        <Field label="Giá trị khai báo (USD)" htmlFor="declaredValueUsd" error={err.declaredValueUsd}>
          <Input id="declaredValueUsd" name="declaredValueUsd" inputMode="decimal" />
        </Field>
      </fieldset>

      <Field label="Ghi chú" htmlFor="note">
        <Textarea id="note" name="note" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Thêm vào chờ xác nhận"}
        </Button>
      </div>
    </form>
  );
}
