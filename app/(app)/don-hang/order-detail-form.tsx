"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { getOrderDetailAction, updateOrderAction } from "@/lib/orders/actions";
import { ORDER_EDIT_LABEL as L, isoToLocal, type OrderEditField } from "@/lib/orders/edit";
import type { OrderDetail } from "@/lib/orders/queries";
import { ORDER_STATUSES } from "@/lib/orders/schemas";
import { amountFromUnit, unitPrice } from "@/lib/orders/totals";
import { SCOPE_LABEL } from "@/lib/orders/reprice-summary";
import { formatThousands, parseThousands } from "@/lib/receipts/format";
import { formatKg } from "@/lib/labels";
import { submitWithoutReset } from "@/lib/form-submit";
import { cn, formatMoney } from "@/lib/utils";
import type { CustomerOption, RouteOption } from "./orders-view";

type Pkg = { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string };
const emptyPkg = (): Pkg => ({ lengthCm: "", widthCm: "", heightCm: "", actualWeight: "" });
const num = (v: string) => (v === "" ? "" : String(Number(v)).replace(".", ","));
const money = (v: string | null | undefined) => (v ? formatThousands(String(Math.round(Number(v)))) : "");

/**
 * Cửa sổ chi tiết 1 vận đơn: hiện đầy đủ trường, sửa được theo quyền của vai trò.
 * Trường không được sửa hiển thị mờ & KHÔNG gửi lên server (không có name).
 */
export function OrderDetailForm({
  orderId,
  routes,
  customers,
  editable,
  showMoney,
  editLocked,
  onDone,
}: {
  orderId: number;
  routes: RouteOption[];
  customers: CustomerOption[];
  editable: OrderEditField[];
  showMoney: boolean;
  editLocked: boolean;
  onDone: (message?: string) => void;
}) {
  const [o, setO] = useState<OrderDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [sell, setSell] = useState(""); // "" = tự tính
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [state, action, pending] = useActionState(updateOrderAction, null);

  useEffect(() => {
    getOrderDetailAction(orderId).then((r) => {
      if (!r.ok) return setLoadError(r.error);
      const d = r.data;
      setO(d);
      setPkgs(d.packages.length ? d.packages.map((p) => ({ lengthCm: num(p.lengthCm), widthCm: num(p.widthCm), heightCm: num(p.heightCm), actualWeight: num(p.actualWeight) })) : [emptyPkg()]);
      const sellOv = d.manualOverrides.includes("sell_amount");
      setSell(sellOv ? money(d.sellAmount) : "");
      setUnit(sellOv ? money(unitPrice(d.sellAmount, d.billedWeight)) : "");
      setCost(d.manualOverrides.includes("cost_amount") ? money(d.costAmount) : "");
    });
  }, [orderId]);
  useEffect(() => {
    if (state?.ok) onDone(state.message);
  }, [state, onDone]);

  if (loadError) return <Alert tone="danger">{loadError}</Alert>;
  if (!o) return <p className="text-sm text-muted-foreground">Đang tải vận đơn…</p>;

  const lockedOut = o.priceLocked && !editLocked;
  const can = (f: OrderEditField) => !lockedOut && editable.includes(f);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const name = (f: OrderEditField) => (can(f) ? f : undefined);
  const autoUnit = unitPrice(o.sellAmount, o.billedWeight);
  const setPkg = (i: number, k: keyof Pkg, v: string) => setPkgs((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  // Gọi như hàm (không phải component) để ô nhập không bị dựng lại khi gõ ở ô khác
  const T = (f: OrderEditField, value: string | null | undefined, rest: React.ComponentProps<"input"> = {}) => (
    <Field key={f} label={L[f]} htmlFor={`od-${f}`} error={err[f]}>
      <Input id={`od-${f}`} name={name(f)} defaultValue={value ?? ""} disabled={!can(f)} aria-invalid={!!err[f]} {...rest} />
    </Field>
  );

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-5">
      <input type="hidden" name="id" value={o.id} />
      <input type="hidden" name="rowVersion" value={o.rowVersion} />
      {can("packages") && <input type="hidden" name="packages" value={JSON.stringify(pkgs.filter((p) => p.actualWeight || p.lengthCm || p.widthCm || p.heightCm))} />}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="info">{o.status}</Badge>
        <Badge tone={o.debtStatus === "Chưa thanh toán" ? "muted" : "info"}>{o.debtStatus}</Badge>
        {o.priceLocked && (
          <Badge tone="warning">
            <Lock className="mr-1 size-3" /> Đã khóa giá
          </Badge>
        )}
        <span className="text-muted-foreground">
          Tạo lúc {new Date(o.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Saigon" })}
        </span>
      </div>
      {lockedOut && <Alert tone="warning">Đơn đã khóa giá — chỉ Admin hoặc Kế toán được sửa. Bạn đang xem ở chế độ chỉ đọc.</Alert>}
      {!lockedOut && editable.length === 0 && <Alert tone="info">Vai trò của bạn chỉ được xem vận đơn.</Alert>}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Thông tin vận đơn</legend>
        <Field label={L.customerCode} htmlFor="od-customerCode" error={err.customerCode} hint={can("customerCode") && o.debtStatus !== "Chưa thanh toán" ? "Đơn đã lên bảng kê — không đổi khách." : undefined}>
          {can("customerCode") && customers.length ? (
            <NativeSelect id="od-customerCode" name="customerCode" defaultValue={o.customerCode}>
              {!customers.some((c) => c.code === o.customerCode) && <option value={o.customerCode}>{o.customerCode} — {o.customerName}</option>}
              {customers.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <Input id="od-customerCode" value={`${o.customerCode} — ${o.customerName}`} disabled readOnly />
          )}
        </Field>
        {T("billCode", o.billCode, { className: "uppercase" })}
        {T("trackingNumber", o.trackingNumber)}
        <Field label={L.routeCode} htmlFor="od-routeCode" error={err.routeCode} hint="Quyết định cân tính phí & giá bán">
          <NativeSelect id="od-routeCode" name={name("routeCode")} defaultValue={o.routeCode} disabled={!can("routeCode")}>
            {!routes.some((r) => r.code === o.routeCode) && <option value={o.routeCode}>{o.routeCode}</option>}
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.serviceType})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={L.assignedRouteCode} htmlFor="od-assignedRouteCode" error={err.assignedRouteCode} hint="Chỉ đổi cân xuất & giá gốc">
          <NativeSelect id="od-assignedRouteCode" name={name("assignedRouteCode")} defaultValue={o.assignedRouteCode === o.routeCode ? "" : o.assignedRouteCode} disabled={!can("assignedRouteCode")}>
            <option value="">Như tuyến vận chuyển</option>
            {routes.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.serviceType})
              </option>
            ))}
          </NativeSelect>
        </Field>
        {T("destinationIso2", o.destinationIso2, { maxLength: 2, className: "uppercase" })}
        {T("shippedAt", isoToLocal(o.shippedAt ?? o.createdAt), { type: "datetime-local", title: "Ngày dùng để tra bảng giá (mặc định = ngày tạo đơn)" })}
        <Field label={L.status} htmlFor="od-status" error={err.status}>
          <NativeSelect id="od-status" name={name("status")} defaultValue={o.status} disabled={!can("status")}>
            {ORDER_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
        </Field>
        {T("exportedAt", isoToLocal(o.exportedAt), { type: "datetime-local", title: "Tự ghi khi chuyển sang Đã xuất hàng" })}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Người nhận</legend>
        {T("receiverName", o.receiverName)}
        {T("receiverPhone", o.receiverPhone)}
        {T("receiverEmail", o.receiverEmail, { type: "email" })}
        <div className="sm:col-span-3">
          {T("receiverAddress", o.receiverAddress)}
        </div>
        {T("receiverCity", o.receiverCity)}
        {T("receiverState", o.receiverState)}
        {T("receiverPostalCode", o.receiverPostalCode)}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Hải quan</legend>
        {T("hsCode", o.hsCode)}
        {T("goodsDescription", o.goodsDescription)}
        {T("goodsNameEn", o.goodsNameEn)}
        {T("declaredValueUsd", o.declaredValueUsd ? num(o.declaredValueUsd) : "", { inputMode: "decimal" })}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Kiện hàng — kích thước & cân</legend>
        {err.packages && <p className="text-xs text-destructive">{err.packages}</p>}
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
              <Input key={k} value={p[k]} onChange={(e) => setPkg(i, k, e.target.value)} inputMode="decimal" disabled={!can("packages")} aria-label={`Kiện ${i + 1} ${k}`} />
            ))}
            {can("packages") ? (
              <Button type="button" variant="ghost" size="icon" onClick={() => setPkgs((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : [emptyPkg()]))} aria-label={`Xóa kiện ${i + 1}`}>
                <Trash2 />
              </Button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {can("packages") ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPkgs((ps) => [...ps, emptyPkg()])}>
              <Plus /> Thêm kiện
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Cân thực <b className="text-foreground">{formatKg(o.actualWeight)}</b> · Quy đổi <b className="text-foreground">{formatKg(o.volumetricWeight)}</b> · Tính phí{" "}
            <b className="text-foreground">{formatKg(o.billedWeight)}</b> · Xuất hàng <b className="text-foreground">{formatKg(o.shippedWeight)}</b> kg
          </span>
        </div>
      </fieldset>

      {showMoney && (
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className="mb-2 text-sm font-semibold">Giá (VND) — để trống = tự tính theo bảng giá</legend>
          <Field label={L.sellAmount} htmlFor="od-sell" error={err.sellAmount} hint={sell ? <span className="text-amber-700">Ghi đè thủ công</span> : `Tự tính: ${formatMoney(o.sellAmount)}${o.sellScope ? ` · ${SCOPE_LABEL[o.sellScope]}` : ""}`}>
            <Input
              id="od-sell"
              name={name("sellAmount")}
              value={sell}
              placeholder={formatMoney(o.sellAmount)}
              disabled={!can("sellAmount")}
              inputMode="numeric"
              className="text-right tabular-nums"
              onChange={(e) => {
                const v = formatThousands(e.target.value);
                setSell(v);
                setUnit(v ? formatThousands(unitPrice(parseThousands(v), o.billedWeight) ?? "") : "");
              }}
            />
          </Field>
          <Field label="Đơn giá bán (VND/kg)" htmlFor="od-unit" hint={`= giá bán ÷ ${formatKg(o.billedWeight)} kg tính phí`}>
            <Input
              id="od-unit"
              value={unit}
              placeholder={autoUnit ? formatMoney(autoUnit) : "—"}
              disabled={!can("sellAmount") || !(Number(o.billedWeight) > 0)}
              inputMode="numeric"
              className="text-right tabular-nums"
              onChange={(e) => {
                const v = formatThousands(e.target.value);
                setUnit(v);
                setSell(v ? formatThousands(amountFromUnit(parseThousands(v), o.billedWeight)) : "");
              }}
            />
          </Field>
          <Field label={L.costAmount} htmlFor="od-cost" error={err.costAmount} hint={cost ? <span className="text-amber-700">Ghi đè thủ công</span> : `Tự tính: ${formatMoney(o.costAmount)}`}>
            <Input
              id="od-cost"
              name={name("costAmount")}
              value={cost}
              placeholder={formatMoney(o.costAmount)}
              disabled={!can("costAmount")}
              inputMode="numeric"
              className="text-right tabular-nums"
              onChange={(e) => setCost(formatThousands(e.target.value))}
            />
          </Field>
          <div className="grid content-start gap-1.5">
            <span className="text-sm font-medium">Lợi nhuận</span>
            <span className={cn("flex h-9 items-center justify-end rounded-md border px-3 text-sm font-semibold tabular-nums", Number(o.profit) < 0 ? "text-destructive" : "text-emerald-700")}>
              {formatMoney(o.profit)}
            </span>
            {(sell || cost) && can("sellAmount") && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={() => {
                  setSell("");
                  setUnit("");
                  setCost("");
                }}
              >
                <RotateCcw className="size-3" /> Bỏ ghi đè, tự tính lại
              </button>
            )}
          </div>
        </fieldset>
      )}

      <Field label={L.note} htmlFor="od-note" error={err.note}>
        <Textarea id="od-note" name={name("note")} defaultValue={o.note ?? ""} disabled={!can("note")} rows={2} />
      </Field>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-background px-6 py-3">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Đóng
        </Button>
        {!lockedOut && editable.length > 0 && (
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu & tính giá…" : "Lưu thay đổi"}
          </Button>
        )}
      </div>
    </form>
  );
}
