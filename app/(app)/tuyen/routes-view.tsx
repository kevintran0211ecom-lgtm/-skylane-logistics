"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { submitWithoutReset } from "@/lib/form-submit";
import { saveRoute } from "@/lib/catalog/actions";
import type { RouteRow } from "@/lib/catalog/queries";
import { SERVICE_TYPES, WEIGHT_CALC_MODES } from "@/lib/labels";

type Option = { code: string; name: string };

export function RoutesView({ rows, suppliers, canManage }: { rows: RouteRow[]; suppliers: Option[]; canManage: boolean }) {
  const [editing, setEditing] = useState<RouteRow | "new" | null>(null);

  const columns = useMemo<ColumnDef<RouteRow, unknown>[]>(
    () => [
      { header: "Mã tuyến", cell: ({ row }) => <span className="font-medium">{row.original.routeCode}</span> },
      { header: "Tên tuyến", accessorKey: "name" },
      { header: "Nhà cung cấp", cell: ({ row }) => row.original.supplierCode ?? <span className="text-muted-foreground">—</span> },
      {
        header: "Dịch vụ",
        cell: ({ row }) => (
          <Badge tone="info" title={SERVICE_TYPES.find((s) => s.value === row.original.serviceType)?.rounding}>
            {row.original.serviceType}
          </Badge>
        ),
      },
      {
        header: "Cách tính cân",
        cell: ({ row }) =>
          row.original.weightCalcMode === "ACTUAL_ONLY" ? <Badge tone="warning">Chỉ cân thực</Badge> : <Badge>Max(thực, thể tích)</Badge>,
      },
      {
        header: "DIM",
        cell: ({ row }) =>
          row.original.weightCalcMode === "ACTUAL_ONLY" ? (
            <span className="text-muted-foreground line-through">{Number(row.original.dimDivisor).toLocaleString("vi-VN")}</span>
          ) : (
            Number(row.original.dimDivisor).toLocaleString("vi-VN")
          ),
      },
      { header: "Trạng thái", cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="muted">Ngừng</Badge>) },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              meta: { width: 48 },
              cell: ({ row }: { row: { original: RouteRow } }) => (
                <Button variant="ghost" size="icon" onClick={() => setEditing(row.original)} aria-label={`Sửa ${row.original.routeCode}`}>
                  <Pencil />
                </Button>
              ),
            } satisfies ColumnDef<RouteRow, unknown>,
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
            <Plus /> Thêm tuyến
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} empty="Chưa có tuyến." />
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Thêm tuyến vận chuyển" : `Sửa tuyến ${editing && editing !== "new" ? editing.routeCode : ""}`}
        className="max-w-xl"
      >
        {editing !== null && (
          <RouteForm
            key={editing === "new" ? "new" : editing.routeCode}
            row={editing === "new" ? null : editing}
            suppliers={suppliers}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}

function RouteForm({ row, suppliers, onDone }: { row: RouteRow | null; suppliers: Option[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveRoute, null);
  const [service, setService] = useState(row?.serviceType ?? "EPK");
  const [mode, setMode] = useState(row?.weightCalcMode ?? "MAX_ACTUAL_VOL");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const err = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <input type="hidden" name="mode" value={row ? "edit" : "create"} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã tuyến *" htmlFor="routeCode" error={err.routeCode} hint={row ? "Không đổi được mã" : "Trùng tên cụm tuyến trong file bảng giá, VD: VNFZZXR"}>
          <Input id="routeCode" name="routeCode" defaultValue={row?.routeCode} readOnly={!!row} required autoFocus={!row} />
        </Field>
        <Field label="Tên tuyến *" htmlFor="name" error={err.name}>
          <Input id="name" name="name" defaultValue={row?.name} required />
        </Field>
        <Field label="Nhà cung cấp" htmlFor="supplierCode" error={err.supplierCode} hint="Chọn hoặc gõ mã NCC mới">
          <Input id="supplierCode" name="supplierCode" list="suppliers" defaultValue={row?.supplierCode ?? ""} />
          <datalist id="suppliers">
            {suppliers.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Loại hình dịch vụ *" htmlFor="serviceType" error={err.serviceType}>
          <NativeSelect id="serviceType" name="serviceType" value={service} onChange={(e) => setService(e.target.value as typeof service)}>
            {SERVICE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <p className="-mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        Làm tròn {service}: {SERVICE_TYPES.find((s) => s.value === service)?.rounding}
      </p>

      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Cách tính cân nặng (weight_calc_mode)</legend>
        {WEIGHT_CALC_MODES.map((m) => (
          <label key={m.value} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="weightCalcMode"
              value={m.value}
              checked={mode === m.value}
              onChange={() => setMode(m.value)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="font-medium">{m.label}</span> <span className="text-xs text-muted-foreground">({m.value})</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}
        <Field
          label="Hệ số DIM *"
          htmlFor="dimDivisor"
          error={err.dimDivisor}
          hint={mode === "ACTUAL_ONLY" ? "Không dùng khi chỉ tính cân thực (vẫn lưu để đổi chế độ sau)." : "Cân quy đổi = Dài × Rộng × Cao (cm) / DIM"}
        >
          <Input
            id="dimDivisor"
            name="dimDivisor"
            inputMode="decimal"
            defaultValue={row ? Number(row.dimDivisor).toString() : "5000"}
            className={mode === "ACTUAL_ONLY" ? "opacity-60" : undefined}
            required
          />
        </Field>
      </fieldset>

      <Field label="Ghi chú" htmlFor="note">
        <Textarea id="note" name="note" defaultValue={row?.note ?? ""} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="isActive" defaultChecked={row?.isActive ?? true} /> Đang hoạt động
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </div>
    </form>
  );
}
