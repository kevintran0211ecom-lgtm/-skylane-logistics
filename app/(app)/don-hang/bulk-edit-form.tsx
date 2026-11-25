"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { bulkEditOrders } from "@/lib/orders/actions";
import { ORDER_STATUSES, type BulkField } from "@/lib/orders/schemas";
import { submitWithoutReset } from "@/lib/form-submit";
import { cn } from "@/lib/utils";
import type { RouteOption } from "./orders-view";

const WEIGHT_HINT = "Để trống = bỏ ghi đè, hệ thống tự tính";

/** Một dòng: checkbox bật trường + ô nhập; sửa ô nhập sẽ tự tick (khai báo ngoài để không bị dựng lại khi gõ) */
function Row({
  field,
  label,
  hint,
  enabled,
  error,
  setEnabled,
  children,
}: {
  field: BulkField;
  label: string;
  hint?: string;
  enabled: boolean;
  error?: string;
  setEnabled: (f: BulkField, v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-[20px_150px_1fr] items-start gap-3 px-2 py-2", enabled && "bg-primary/5")}>
      <input
        type="checkbox"
        name={`enable_${field}`}
        id={`enable_${field}`}
        className="mt-2 size-4 accent-primary"
        checked={enabled}
        onChange={(e) => setEnabled(field, e.target.checked)}
      />
      <label htmlFor={`enable_${field}`} className="mt-2 text-sm font-medium">
        {label}
      </label>
      <div onInput={() => !enabled && setEnabled(field, true)} onChange={() => !enabled && setEnabled(field, true)}>
        {children}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

export function BulkEditForm({
  ids,
  routes,
  onDone,
  allowedFields,
  lockedNote,
}: {
  ids: string[];
  routes: RouteOption[];
  onDone: () => void;
  allowedFields: BulkField[];
  lockedNote: boolean;
}) {
  const allow = (f: BulkField) => allowedFields.includes(f);
  const [state, action, pending] = useActionState(bulkEditOrders, null);
  const [enabled, setEnabled] = useState<Partial<Record<BulkField, boolean>>>({});
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (state?.ok) setDone(state.message ?? "Đã cập nhật.");
  }, [state]);
  const err = state && !state.ok ? state.fieldErrors ?? {} : {};
  const toggle = (f: BulkField, v: boolean) => setEnabled((e) => ({ ...e, [f]: v }));
  const count = Object.values(enabled).filter(Boolean).length;

  if (done) {
    const failed = state?.ok ? state.data?.failed ?? [] : [];
    return (
      <div className="grid gap-4">
        <Alert tone="success">{done}</Alert>
        {failed.length > 0 && (
          <Alert tone="warning" title="Chưa tra được giá (cân đã cập nhật, giữ tiền cũ):">
            <ul className="mt-1 list-disc pl-5 text-xs">
              {failed.slice(0, 20).map((f) => (
                <li key={f.billCode}>
                  {f.billCode}: {f.message}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button onClick={onDone}>Đóng</Button>
        </div>
      </div>
    );
  }

  const routeOptions = routes.map((r) => (
    <option key={r.code} value={r.code}>
      {r.code} ({r.serviceType})
    </option>
  ));

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-3">
      <input type="hidden" name="ids" value={ids.join(",")} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {lockedNote && <Alert tone="info">Đơn đã khóa giá sẽ được bỏ qua — chỉ Admin/Kế toán sửa được đơn đã khóa.</Alert>}

      <div className="divide-y rounded-lg border">
        {allow("assignedRouteCode") && (
        <Row field="assignedRouteCode" enabled={!!enabled.assignedRouteCode} error={err.assignedRouteCode} setEnabled={toggle} label="Tuyến chỉ định" hint="Chỉ đổi cân xuất & giá gốc — không ảnh hưởng giá bán khách">
          <NativeSelect name="assignedRouteCode" defaultValue="">
            <option value="">Như tuyến vận chuyển</option>
            {routeOptions}
          </NativeSelect>
        </Row>
        )}
        {allow("routeCode") && (
        <Row field="routeCode" enabled={!!enabled.routeCode} error={err.routeCode} setEnabled={toggle} label="Tuyến vận chuyển" hint="Đổi cân tính phí & giá bán; tuyến chỉ định giữ nguyên">
          <NativeSelect name="routeCode" defaultValue="">
            <option value="" disabled>
              — Chọn —
            </option>
            {routeOptions}
          </NativeSelect>
        </Row>
        )}
        {allow("destinationIso2") && (
        <Row field="destinationIso2" enabled={!!enabled.destinationIso2} error={err.destinationIso2} setEnabled={toggle} label="Điểm đến (ISO2)">
          <Input name="destinationIso2" maxLength={2} placeholder="US" className="uppercase" />
        </Row>
        )}
        {allow("status") && (
        <Row field="status" enabled={!!enabled.status} error={err.status} setEnabled={toggle} label="Trạng thái vận đơn">
          <NativeSelect name="status" defaultValue="">
            <option value="" disabled>
              — Chọn —
            </option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Row>
        )}
        {allow("actualWeight") && (
        <Row field="actualWeight" enabled={!!enabled.actualWeight} error={err.actualWeight} setEnabled={toggle} label="Trọng lượng thực" hint={WEIGHT_HINT}>
          <Input name="actualWeight" inputMode="decimal" placeholder="kg" />
        </Row>
        )}
        {allow("volumetricWeight") && (
        <Row field="volumetricWeight" enabled={!!enabled.volumetricWeight} error={err.volumetricWeight} setEnabled={toggle} label="Trọng lượng quy đổi" hint={WEIGHT_HINT}>
          <Input name="volumetricWeight" inputMode="decimal" placeholder="kg" />
        </Row>
        )}
        {allow("billedWeight") && (
        <Row field="billedWeight" enabled={!!enabled.billedWeight} error={err.billedWeight} setEnabled={toggle} label="Trọng lượng tính phí" hint={`${WEIGHT_HINT}. Giá bán tính theo cân này.`}>
          <Input name="billedWeight" inputMode="decimal" placeholder="kg" />
        </Row>
        )}
        {allow("shippedWeight") && (
        <Row field="shippedWeight" enabled={!!enabled.shippedWeight} error={err.shippedWeight} setEnabled={toggle} label="Trọng lượng xuất hàng" hint={`${WEIGHT_HINT}. Giá gốc tính theo cân này.`}>
          <Input name="shippedWeight" inputMode="decimal" placeholder="kg" />
        </Row>
        )}
        {allow("trackingNumber") && (
        <Row field="trackingNumber" enabled={!!enabled.trackingNumber} error={err.trackingNumber} setEnabled={toggle} label="Tracking" hint="Để trống = xóa tracking">
          <Input name="trackingNumber" />
        </Row>
        )}
        {allow("note") && (
        <Row field="note" enabled={!!enabled.note} error={err.note} setEnabled={toggle} label="Ghi chú" hint="Thay thế ghi chú hiện có">
          <Input name="note" />
        </Row>
        )}
        {allow("priceLocked") && (
        <Row field="priceLocked" enabled={!!enabled.priceLocked} error={err.priceLocked} setEnabled={toggle} label="Khóa giá" hint="Đơn đã khóa giá không tự tính lại khi sửa cân/tuyến">
          <NativeSelect name="priceLocked" defaultValue="">
            <option value="" disabled>
              — Chọn —
            </option>
            <option value="true">Khóa giá</option>
            <option value="false">Mở khóa giá (tính lại ngay)</option>
          </NativeSelect>
        </Row>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {count} trường sẽ cập nhật cho {ids.length} đơn
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending || count === 0}>
            {pending ? "Đang cập nhật & tính giá…" : "Cập nhật"}
          </Button>
        </div>
      </div>
    </form>
  );
}
