"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { ExternalLink, Pencil, Plus, UserMinus } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { submitWithoutReset } from "@/lib/form-submit";
import { addGroupOwnTableAction, getPriceGroupDetailAction, savePriceGroup, setCustomerGroupAction } from "@/lib/catalog/actions";
import type { PriceGroupDetail } from "@/lib/pricing/group-service";
import { viDate } from "@/lib/pricing/versioning";
import type { PriceGroupRow } from "@/lib/catalog/queries";

const pct = (v: string) => {
  const n = Number(v);
  return n === 0 ? "0%" : `${n > 0 ? "+" : ""}${n.toLocaleString("vi-VN")}%`;
};

export function PriceGroupsView({ rows, canManage, canPricing }: { rows: PriceGroupRow[]; canManage: boolean; canPricing: boolean }) {
  const [editing, setEditing] = useState<PriceGroupRow | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      {notice && (
        <Alert tone="success" className="mb-3">
          {notice}
        </Alert>
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
        className="max-w-3xl"
      >
        {editing !== null && (
          <div className="grid gap-6">
            <GroupForm
              key={editing === "new" ? "new" : editing.code}
              row={editing === "new" ? null : editing}
              onDone={(msg) => {
                setEditing(null);
                if (msg) setNotice(msg);
              }}
            />
            {editing !== "new" && <GroupTables code={editing.code} canManage={canManage} canPricing={canPricing} onNotice={setNotice} />}
          </div>
        )}
      </Dialog>
    </>
  );
}

function GroupForm({ row, onDone }: { row: PriceGroupRow | null; onDone: (message?: string) => void }) {
  const [state, action, pending] = useActionState(savePriceGroup, null);
  useEffect(() => {
    if (state?.ok) onDone(state.message);
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
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Hủy
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu & tính lại giá…" : row ? "Lưu & tính lại giá" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Bảng giá bán của nhóm theo từng tuyến + thêm tuyến bảng giá riêng + khách trong nhóm.
 */
function GroupTables({ code, canManage, canPricing, onNotice }: { code: string; canManage: boolean; canPricing: boolean; onNotice: (m: string) => void }) {
  const [d, setD] = useState<PriceGroupDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tState, tAction, tPending] = useActionState(addGroupOwnTableAction, null);
  const [mState, mAction, mPending] = useActionState(setCustomerGroupAction, null);
  useEffect(() => {
    getPriceGroupDetailAction(code).then((r) => (r.ok ? setD(r.data) : setErr(r.error)));
  }, [code, tick]);
  useEffect(() => {
    if (tState?.ok) {
      onNotice(tState.message ?? "Đã tạo bảng giá riêng.");
      setTick((t) => t + 1);
    }
  }, [tState, onNotice]);
  useEffect(() => {
    if (mState?.ok) {
      onNotice(mState.message ?? "Đã cập nhật nhóm của khách.");
      setTick((t) => t + 1);
    }
  }, [mState, onNotice]);
  if (err) return <Alert tone="danger">{err}</Alert>;
  if (!d) return <p className="text-sm text-muted-foreground">Đang tải bảng giá của nhóm…</p>;
  const free = d.routes.filter((r) => r.generalVersionId && r.own.length === 0);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Saigon" }).format(new Date());
  return (
    <>
      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Bảng giá bán của nhóm theo tuyến</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tuyến</th>
                <th className="px-3 py-2">Nhóm đang dùng</th>
                <th className="px-3 py-2">Xem bảng giá</th>
              </tr>
            </thead>
            <tbody>
              {d.routes.map((r) => (
                <tr key={r.routeCode} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.routeCode}</td>
                  <td className="px-3 py-2">
                    {r.own.length ? (
                      <Badge tone="info">Bảng riêng từ {viDate(r.own[0].effectiveFrom)}{r.own[0].effectiveTo ? ` đến ${viDate(r.own[0].effectiveTo)}` : ""}</Badge>
                    ) : (
                      <span>
                        Giá chung × (1 {Number(d.adjustPct) < 0 ? "−" : "+"} {Math.abs(Number(d.adjustPct))}%)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(r.own.length ? r.own : r.generalVersionId ? [{ id: r.generalVersionId }] : []).map((v) => (
                      <Link key={v.id} href={`/bang-gia/${v.id}`} className="mr-2 inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="size-3" /> {r.own.length ? "Bảng riêng" : "Giá chung"}
                      </Link>
                    ))}
                  </td>
                </tr>
              ))}
              {d.routes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                    Chưa có bảng giá bán nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Tuyến dùng giá chung tự cập nhật theo % của nhóm (giá = giá chung × (1 + %) lúc tính đơn). Tuyến có bảng riêng không cộng % nhóm.
        </p>
        {canPricing && (
          <form onSubmit={submitWithoutReset(tAction)} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
            <input type="hidden" name="groupCode" value={code} />
            <Field label="Thêm tuyến bảng giá riêng" htmlFor="own-route" error={tState && !tState.ok ? tState.fieldErrors?.routeCode : undefined}>
              <NativeSelect id="own-route" name="routeCode" defaultValue="">
                <option value="">— Chọn tuyến —</option>
                {free.map((r) => (
                  <option key={r.routeCode} value={r.routeCode}>
                    {r.routeCode}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Áp dụng từ ngày" htmlFor="own-from">
              <Input id="own-from" name="effectiveFrom" type="date" defaultValue={today} />
            </Field>
            <Button type="submit" variant="outline" disabled={tPending}>
              <Plus /> {tPending ? "Đang tạo…" : "Tạo bảng riêng"}
            </Button>
            {tState && !tState.ok && (
              <Alert tone="danger" className="sm:col-span-3">
                {tState.error}
              </Alert>
            )}
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Sao chép bảng giá bán chung × (1 + % nhóm hiện tại) thành phiên bản riêng của nhóm. Đơn có ngày gửi trước ngày áp dụng vẫn dùng giá cũ — chọn ngày
              sớm hơn nếu muốn áp cho cả đơn đã có (đơn đã khóa giá không đổi). Có file giá riêng cho nhóm?{" "}
              <Link href={`/bang-gia/import?scope=GROUP&code=${encodeURIComponent(code)}`} className="text-primary hover:underline">
                Import bảng giá riêng cho nhóm {code}
              </Link>
              .
            </p>
          </form>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Khách hàng trong nhóm ({d.members.length})</h3>
        {mState && !mState.ok && <Alert tone="danger">{mState.error}</Alert>}
        <div className="flex flex-wrap gap-2">
          {d.members.map((m) => (
            <span key={m.code} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
              <b>{m.code}</b> {m.name}
              <span className="text-xs text-muted-foreground">({Number(m.adjustPct) > 0 ? "+" : ""}{Number(m.adjustPct)}% riêng)</span>
              {canManage && (
                <form onSubmit={submitWithoutReset(mAction)}>
                  <input type="hidden" name="customerCode" value={m.code} />
                  <input type="hidden" name="groupCode" value="" />
                  <button type="submit" disabled={mPending} className="text-muted-foreground hover:text-destructive" title="Bỏ khỏi nhóm (dùng giá chung)" aria-label={`Bỏ ${m.code} khỏi nhóm`}>
                    <UserMinus className="size-3.5" />
                  </button>
                </form>
              )}
            </span>
          ))}
          {d.members.length === 0 && <span className="text-sm text-muted-foreground">Chưa có khách nào.</span>}
        </div>
        {canManage && (
          <form onSubmit={submitWithoutReset(mAction)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="groupCode" value={code} />
            <Field label="Thêm khách vào nhóm" htmlFor="add-member">
              <NativeSelect id="add-member" name="customerCode" defaultValue="" className="w-72">
                <option value="">— Chọn khách hàng —</option>
                {d.others.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                    {c.group ? ` (đang ở ${c.group})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" variant="outline" disabled={mPending}>
              {mPending ? "Đang chuyển…" : "Thêm & tính lại giá"}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
