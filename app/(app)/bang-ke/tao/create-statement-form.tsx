"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { createStatementAction } from "@/lib/statements/actions";
import type { UnbilledOrder } from "@/lib/statements/service";
import { submitWithoutReset } from "@/lib/form-submit";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { formatMoney } from "@/lib/utils";

export function CreateStatementForm({
  customer,
  orders,
  from,
  to,
}: {
  customer: { code: string; name: string };
  orders: UnbilledOrder[];
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createStatementAction, null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(orders.filter((o) => Number(o.totalAmount) > 0).map((o) => o.id)));
  useEffect(() => {
    if (state?.ok && state.data) router.push(`/bang-ke/${state.data.id}`);
  }, [state, router]);

  const picked = useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected]);
  const total = picked.reduce((t, o) => t + Number(o.totalAmount), 0);
  const zero = picked.filter((o) => Number(o.totalAmount) === 0).length;
  const allOn = orders.length > 0 && selected.size === orders.length;
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (orders.length === 0) {
    return <Alert tone="info">Không có vận đơn chưa lên bảng kê của {customer.code} trong khoảng thời gian đã chọn.</Alert>;
  }

  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-3">
      <input type="hidden" name="customerCode" value={customer.code} />
      <input type="hidden" name="orderIds" value={[...selected].join(",")} />
      <input type="hidden" name="from" value={from ?? ""} />
      <input type="hidden" name="to" value={to ?? ""} />

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="text-sm">
          Đã chọn <span className="font-semibold">{picked.length}</span>/{orders.length} đơn · Tổng{" "}
          <span className="text-base font-semibold text-primary">{formatMoney(total)} VND</span>
          {zero > 0 && <span className="ml-2 text-amber-700">({zero} đơn chưa có giá)</span>}
        </div>
        <div className="flex items-center gap-2">
          <Input name="note" placeholder="Ghi chú bảng kê (tuỳ chọn)" className="w-64" />
          <Button type="submit" disabled={pending || picked.length === 0}>
            <FileSpreadsheet /> {pending ? "Đang tạo…" : `Tạo bảng kê (${picked.length})`}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tên bảng kê: <span className="font-medium">{customer.name} - {customer.code} - SKLddMMyyXXXX</span>. Sau khi tạo, công nợ các đơn chuyển sang “xuất bảng kê” và giá được khóa cứng.
      </p>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH className="w-9">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                aria-label="Chọn tất cả"
                checked={allOn}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && !allOn;
                }}
                onChange={() => setSelected(allOn ? new Set() : new Set(orders.map((o) => o.id)))}
              />
            </TH>
            <TH>Ngày gửi</TH>
            <TH>Mã vận đơn</TH>
            <TH>Tracking</TH>
            <TH>Đến</TH>
            <TH>Người nhận</TH>
            <TH className="text-right">Kiện</TH>
            <TH className="text-right">Cân tính phí</TH>
            <TH>Tuyến</TH>
            <TH>Trạng thái</TH>
            <TH className="text-right">Chi phí (VND)</TH>
          </TR>
        </THead>
        <TBody>
          {orders.map((o) => (
            <TR key={o.id} className={selected.has(o.id) ? "bg-primary/5" : undefined} onClick={() => toggle(o.id)}>
              <TD>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Chọn ${o.billCode}`}
                />
              </TD>
              <TD className="whitespace-nowrap tabular-nums">{viDate(o.pricingDate)}</TD>
              <TD className="font-medium">
                <span className="flex items-center gap-1">
                  {o.billCode}
                  {o.priceLocked && <Lock className="size-3 text-muted-foreground" />}
                </span>
              </TD>
              <TD className="text-muted-foreground">{o.trackingNumber}</TD>
              <TD>{o.destinationIso2}</TD>
              <TD className="max-w-40 truncate">{o.receiverName}</TD>
              <TD className="text-right tabular-nums">{o.packageCount}</TD>
              <TD className="text-right tabular-nums">{formatKg(o.billedWeight)}</TD>
              <TD>{o.routeCode}</TD>
              <TD>
                <Badge tone="muted">{o.status}</Badge>
              </TD>
              <TD className={Number(o.totalAmount) ? "text-right font-medium tabular-nums" : "text-right text-amber-700"}>
                {Number(o.totalAmount) ? formatMoney(o.totalAmount) : "Chưa có giá"}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </form>
  );
}
