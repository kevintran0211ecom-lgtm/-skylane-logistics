"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { submitWithoutReset } from "@/lib/form-submit";
import { savePriceGroup } from "@/lib/catalog/actions";
import type { PriceGroupRow } from "@/lib/catalog/queries";

const pct = (v: string) => {
  const n = Number(v);
  return n === 0 ? "0%" : `${n > 0 ? "+" : ""}${n.toLocaleString("vi-VN")}%`;
};

export function PriceGroupsView({ rows, canManage }: { rows: PriceGroupRow[]; canManage: boolean }) {
  const [editing, setEditing] = useState<PriceGroupRow | "new" | null>(null);
  const columns = useMemo<ColumnDef<PriceGroupRow, unknown>[]>(
    () => [
      { header: "Mã nhóm", cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
      { header: "Tên nhóm", accessorKey: "name" },
      {
        header: "% so với giá chung",
        cell: ({ row }) => {
          const n = Number(row.original.adjustPct);
          return <span className={n < 0 ? "font-medium text-emerald-700" : n > 0 ? "font-medium text-amber-700" : ""}>{pct(row.original.adjustPct)}</span>;
        },
      },
      {
        header: "Bảng giá riêng",
        cell: ({ row }) =>
          row.original.ownRoutes.length ? (
            <span className="flex flex-wrap gap-1">
              {row.original.ownRoutes.map((r) => (
                <Badge key={r} tone="info">
                  {r}
                </Badge>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">Không — dùng giá chung</span>
          ),
      },
      { header: "Số khách", cell: ({ row }) => <span className="tabular-nums">{row.original.customerCount}</span> },
      { header: "Trạng thái", cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="muted">Ngừng</Badge>) },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              meta: { width: 48 },
              cell: ({ row }: { row: { original: PriceGroupRow } }) => (
                <Button variant="ghost" size="icon" onClick={() => setEditing(row.original)} aria-label={`Sửa ${row.original.code}`}>
                  <Pencil />
                </Button>
              ),
            } satisfies ColumnDef<PriceGroupRow, unknown>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus /> Thêm nhóm giá
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} empty="Chưa có nhóm giá." />
      <p className="mt-2 text-xs text-muted-foreground">
        Thứ tự giá bán: bảng giá riêng của khách → bảng giá riêng của nhóm × (1 + % khách) → bảng giá chung × (1 + % nhóm) × (1 + % khách). Đổi % sẽ tính lại ngay các
        đơn chưa khóa giá của khách trong nhóm.
      </p>
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Thêm nhóm giá" : `Sửa nhóm giá ${editing?.code ?? ""}`}
        className="max-w-lg"
      >
        {editing !== null && <GroupForm key={editing === "new" ? "new" : editing.code} row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function GroupForm({ row, onDone }: { row: PriceGroupRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(savePriceGroup, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="mode" value={row ? "edit" : "create"} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã nhóm *" htmlFor="code" error={err.code} hint="VD: BUSINESS, CA_NHAN">
          <Input id="code" name="code" defaultValue={row?.code ?? ""} readOnly={!!row} required />
        </Field>
        <Field label="Tên nhóm *" htmlFor="name" error={err.name}>
          <Input id="name" name="name" defaultValue={row?.name ?? ""} required />
        </Field>
        <Field label="% so với giá chung" htmlFor="adjustPct" error={err.adjustPct} hint="VD: 10 = cao hơn giá chung 10%; -5 = thấp hơn 5%">
          <Input id="adjustPct" name="adjustPct" inputMode="decimal" defaultValue={row ? Number(row.adjustPct).toString() : "0"} />
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isActive" defaultChecked={row?.isActive ?? true} /> Đang hoạt động
          </label>
        </div>
        <Field label="Ghi chú" htmlFor="note" className="sm:col-span-2">
          <Textarea id="note" name="note" rows={2} defaultValue={row?.note ?? ""} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
