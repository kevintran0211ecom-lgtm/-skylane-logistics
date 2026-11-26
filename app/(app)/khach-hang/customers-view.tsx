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
import { saveCustomer } from "@/lib/catalog/actions";
import type { CustomerRow } from "@/lib/catalog/queries";
import { SYNC_SOURCES } from "@/lib/labels";

type Option = { code: string; name: string; adjustPct: string };
type User = { id: string; fullName: string };

export function CustomersView(props: {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  groups: Option[];
  users: User[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<CustomerRow | "new" | null>(null);

  const columns = useMemo<ColumnDef<CustomerRow, unknown>[]>(
    () => [
      { header: "Mã KH", accessorKey: "customerCode", cell: ({ row }) => <span className="font-medium">{row.original.customerCode}</span> },
      { header: "Tên khách hàng", accessorKey: "name" },
      { header: "Sale phụ trách", cell: ({ row }) => row.original.saleName ?? <span className="text-muted-foreground">—</span> },
      {
        header: "Nhóm giá",
        cell: ({ row }) => (row.original.priceGroupCode ? <Badge tone="info">{row.original.priceGroupCode}</Badge> : <span className="text-muted-foreground">Chung</span>),
      },
      {
        header: "Điều chỉnh",
        cell: ({ row }) => {
          const n = Number(row.original.priceAdjustPct);
          return n === 0 ? "0%" : <span className={n < 0 ? "text-emerald-700" : "text-amber-700"}>{n > 0 ? "+" : ""}{n.toLocaleString("vi-VN")}%</span>;
        },
      },
      { header: "Tiền tệ", accessorKey: "currency" },
      {
        header: "Đồng bộ",
        cell: ({ row }) =>
          row.original.syncEnabled ? (
            <Badge tone="success">{SYNC_SOURCES.find((s) => s.value === row.original.syncSourceType)?.label}</Badge>
          ) : (
            <span className="text-muted-foreground">Tắt</span>
          ),
      },
      { header: "Trạng thái", cell: ({ row }) => (row.original.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="muted">Ngừng</Badge>) },
      ...(props.canManage
        ? [
            {
              id: "actions",
              header: "",
              meta: { width: 48 },
              cell: ({ row }: { row: { original: CustomerRow } }) => (
                <Button variant="ghost" size="icon" onClick={() => setEditing(row.original)} aria-label={`Sửa ${row.original.customerCode}`}>
                  <Pencil />
                </Button>
              ),
            } satisfies ColumnDef<CustomerRow, unknown>,
          ]
        : []),
    ],
    [props.canManage],
  );

  return (
    <>
      {props.canManage && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setEditing("new")}>
            <Plus /> Thêm khách hàng
          </Button>
        </div>
      )}
      <DataTable columns={columns} data={props.rows} total={props.total} page={props.page} pageSize={props.pageSize} empty="Chưa có khách hàng." />
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Thêm khách hàng" : `Sửa khách hàng ${editing?.customerCode ?? ""}`}
        className="max-w-2xl"
      >
        {editing !== null && (
          <CustomerForm
            key={editing === "new" ? "new" : editing.customerCode}
            row={editing === "new" ? null : editing}
            groups={props.groups}
            users={props.users}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}

function CustomerForm({ row, groups, users, onDone }: { row: CustomerRow | null; groups: Option[]; users: User[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveCustomer, null);
  const [syncSource, setSyncSource] = useState<string>(row?.syncSourceType ?? "NONE");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const err = state && !state.ok ? state.fieldErrors ?? {} : {};

  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <input type="hidden" name="mode" value={row ? "edit" : "create"} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Mã khách hàng *" htmlFor="customerCode" error={err.customerCode} hint={row ? "Không đổi được mã" : "VD: SKL116 (tự viết hoa)"}>
          <Input id="customerCode" name="customerCode" defaultValue={row?.customerCode} readOnly={!!row} required autoFocus={!row} />
        </Field>
        <Field label="Tên khách hàng *" htmlFor="name" error={err.name} className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={row?.name} required />
        </Field>
        <Field label="Điện thoại" htmlFor="phone" error={err.phone}>
          <Input id="phone" name="phone" defaultValue={row?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email" error={err.email}>
          <Input id="email" name="email" type="email" defaultValue={row?.email ?? ""} />
        </Field>
        <Field label="Sale phụ trách" htmlFor="saleUserId" error={err.saleUserId} hint={users.length === 0 ? "Chưa có tài khoản Sale" : undefined}>
          <NativeSelect id="saleUserId" name="saleUserId" defaultValue={row?.saleUserId ?? ""}>
            <option value="">— Chưa gán —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Địa chỉ" htmlFor="address" className="sm:col-span-3">
          <Input id="address" name="address" defaultValue={row?.address ?? ""} />
        </Field>
      </div>

      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Giá bán</legend>
        <Field label="Nhóm giá" htmlFor="priceGroupCode" error={err.priceGroupCode} hint="Quản lý nhóm & % ở mục Nhóm giá">
          <NativeSelect id="priceGroupCode" name="priceGroupCode" defaultValue={row?.priceGroupCode ?? ""}>
            <option value="">Bảng giá chung</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name} ({g.code}){Number(g.adjustPct) ? ` · ${Number(g.adjustPct) > 0 ? "+" : ""}${Number(g.adjustPct)}%` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="% điều chỉnh giá" htmlFor="priceAdjustPct" error={err.priceAdjustPct} hint="% riêng của khách, áp thêm trên giá nhóm / giá chung. VD: -5 = giảm 5%">
          <Input id="priceAdjustPct" name="priceAdjustPct" inputMode="decimal" defaultValue={row ? Number(row.priceAdjustPct).toString() : "0"} />
        </Field>
        <Field label="Tiền tệ" htmlFor="currency">
          <NativeSelect id="currency" name="currency" defaultValue={row?.currency ?? "VND"}>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </NativeSelect>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Đồng bộ nguồn đơn</legend>
        <Field label="Nguồn" htmlFor="syncSourceType" error={err.syncSourceType}>
          <NativeSelect id="syncSourceType" name="syncSourceType" value={syncSource} onChange={(e) => setSyncSource(e.target.value)}>
            {SYNC_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {syncSource === "GOOGLE_SHEET" && (
          <>
            <Field label="Link Google Sheet" htmlFor="syncUrl" error={err.syncUrl}>
              <Input id="syncUrl" name="syncUrl" type="url" defaultValue={row?.syncConfig?.url ?? ""} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </Field>
            <Field label="Tab nhập đơn" htmlFor="syncSheet">
              <Input id="syncSheet" name="syncSheet" defaultValue={row?.syncConfig?.sheet ?? "DON"} />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <Checkbox name="syncEnabled" defaultChecked={row?.syncEnabled ?? false} disabled={syncSource === "NONE"} />
          Bật đồng bộ
        </label>
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
