"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { CheckCheck, FilePlus2, Link2, RefreshCw, RotateCcw, Search, Upload, X, XCircle } from "lucide-react";
import { TemplateLinkForm } from "./template-link-form";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { confirmDraftsAction, rejectDraftsAction, restoreDraftsAction } from "@/lib/orders/draft-actions";
import type { DraftRow, DraftStatus } from "@/lib/orders/drafts-service";
import { submitWithoutReset } from "@/lib/form-submit";
import { formatKg } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { CustomerOption, RouteOption } from "../don-hang/orders-view";
import { CreateOrderForm } from "./create-order-form";
import { ImportOrdersForm } from "./import-orders-form";

const TABS: { key: DraftStatus; label: string }[] = [
  { key: "CHO_XAC_NHAN", label: "Chờ xác nhận" },
  { key: "DA_XAC_NHAN", label: "Đã xác nhận" },
  { key: "DA_LOAI", label: "Đã loại" },
];
const SOURCE_TONE = { MANUAL: "muted", IMPORT: "info", SYNC: "success" } as const;
const SOURCE_TEXT = { MANUAL: "Nhập tay", IMPORT: "Excel", SYNC: "Google Sheet" } as const;
const dt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Saigon", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "–";

export function DraftsView(props: {
  rows: DraftRow[];
  total: number;
  counts: Partial<Record<DraftStatus, number>>;
  status: DraftStatus;
  q: string;
  customerCode: string;
  page: number;
  pageSize: number;
  routes: RouteOption[];
  customers: CustomerOption[];
  masterSheetUrl?: string | null;
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<RowSelectionState>({});
  const [dialog, setDialog] = useState<"create" | "file" | "sheet" | "reject" | "template" | null>(null);
  const [confirmState, confirmAction, confirming] = useActionState(confirmDraftsAction, null);
  const [restoreState, restoreAction, restoring] = useActionState(restoreDraftsAction, null);
  const [rejectState, rejectAction, rejecting] = useActionState(rejectDraftsAction, null);
  const ids = Object.keys(selected).filter((k) => selected[k]);
  const pending = props.status === "CHO_XAC_NHAN";
  const canSelect = props.canManage && props.status !== "DA_XAC_NHAN";

  useEffect(() => setSelected({}), [props.status, props.q, props.customerCode]);
  useEffect(() => {
    if (confirmState?.ok || restoreState?.ok) setSelected({});
  }, [confirmState, restoreState]);
  useEffect(() => {
    if (rejectState?.ok) {
      setSelected({});
      setDialog(null);
    }
  }, [rejectState]);

  const href = (s: DraftStatus) => {
    const q = new URLSearchParams();
    if (s !== "CHO_XAC_NHAN") q.set("status", s);
    if (props.q) q.set("q", props.q);
    if (props.customerCode) q.set("kh", props.customerCode);
    return `/don-du-bao${q.size ? `?${q}` : ""}`;
  };

  const columns = useMemo<ColumnDef<DraftRow, unknown>[]>(
    () => [
      {
        header: "Mã vận đơn",
        meta: { width: 140 },
        cell: ({ row: { original: d } }) => (
          <div className="min-w-28">
            <span className="font-medium">{d.billCode}</span>
            {d.data.trackingNumber && <span className="block text-xs text-muted-foreground">{d.data.trackingNumber}</span>}
          </div>
        ),
      },
      {
        header: "Khách hàng",
        cell: ({ row: { original: d } }) => (
          <div>
            <span className="font-medium">{d.customerCode}</span>
            <span className="block max-w-36 truncate text-xs text-muted-foreground">{d.customerName}</span>
          </div>
        ),
      },
      {
        header: "Tuyến",
        cell: ({ row: { original: d } }) => (
          <span className="whitespace-nowrap">
            {d.data.routeCode}
            {d.data.assignedRouteCode && d.data.assignedRouteCode !== d.data.routeCode && (
              <span className="block text-xs text-amber-700">→ {d.data.assignedRouteCode}</span>
            )}
          </span>
        ),
      },
      { header: "Đến", cell: ({ row: { original: d } }) => d.data.destinationIso2 },
      {
        header: "Người nhận",
        cell: ({ row: { original: d } }) => (
          <div className="max-w-48">
            <span className="block truncate">{d.data.receiverName ?? "–"}</span>
            {d.data.goodsDescription && <span className="block truncate text-xs text-muted-foreground">{d.data.goodsDescription}</span>}
          </div>
        ),
      },
      { header: "Kiện", cell: ({ row: { original: d } }) => <span className="tabular-nums">{d.data.packages.length}</span> },
      {
        header: "Cân thực",
        cell: ({ row: { original: d } }) => {
          const kg = d.data.packages.reduce((t, p) => t + Number(p.actualWeight), 0);
          return <span className="tabular-nums">{kg ? formatKg(kg.toFixed(3)) : "–"}</span>;
        },
      },
      {
        header: "Nguồn",
        cell: ({ row: { original: d } }) => (
          <span title={d.sourceLabel ?? undefined}>
            <Badge tone={SOURCE_TONE[d.source]}>{SOURCE_TEXT[d.source]}</Badge>
          </span>
        ),
      },
      {
        header: "Phát sinh",
        cell: ({ row: { original: d } }) => <span className="whitespace-nowrap tabular-nums">{dt(d.data.createdAt ?? d.createdAt)}</span>,
      },
      ...(props.status === "CHO_XAC_NHAN"
        ? []
        : ([
            {
              header: props.status === "DA_LOAI" ? "Đã loại lúc" : "Xác nhận lúc",
              cell: ({ row: { original: d } }) => (
                <div className="whitespace-nowrap tabular-nums">
                  {dt(d.decidedAt)}
                  {d.rejectReason && <span className="block max-w-48 truncate text-xs text-muted-foreground">{d.rejectReason}</span>}
                </div>
              ),
            },
          ] satisfies ColumnDef<DraftRow, unknown>[])),
    ],
    [props.status],
  );

  const flash = [confirmState, restoreState, rejectState].find((s) => s);

  return (
    <>
      <nav className="mb-3 flex flex-wrap gap-1 border-b" aria-label="Lọc theo trạng thái">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              props.status === t.key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} <span className="text-xs tabular-nums">({(props.counts[t.key] ?? 0).toLocaleString("vi-VN")})</span>
          </Link>
        ))}
      </nav>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <form className="flex w-full max-w-xl gap-2" role="search">
          {props.status !== "CHO_XAC_NHAN" && <input type="hidden" name="status" value={props.status} />}
          <NativeSelect name="kh" defaultValue={props.customerCode} aria-label="Khách hàng" className="max-w-48">
            <option value="">Tất cả khách hàng</option>
            {props.customers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </NativeSelect>
          <Input name="q" defaultValue={props.q} placeholder="Mã vận đơn, mã/tên khách hàng" aria-label="Tìm kiếm" />
          <Button type="submit" variant="outline">
            <Search /> Tìm
          </Button>
        </form>
        {props.canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog("template")}>
              <Link2 /> Mẫu nhập đơn cho khách
            </Button>
            <Button variant="outline" onClick={() => setDialog("sheet")}>
              <RefreshCw /> Đồng bộ Google Sheet
            </Button>
            <Button variant="outline" onClick={() => setDialog("file")}>
              <Upload /> Import Excel
            </Button>
            <Button onClick={() => setDialog("create")}>
              <FilePlus2 /> Nhập tay
            </Button>
          </div>
        )}
      </div>

      {canSelect && ids.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
          <span className="flex items-center gap-1 text-sm">
            Đã chọn <b className="tabular-nums">{ids.length}</b> đơn
            <Button variant="ghost" size="icon" onClick={() => setSelected({})} aria-label="Bỏ chọn">
              <X />
            </Button>
          </span>
          <div className="flex gap-2">
            {pending ? (
              <>
                <Button variant="outline" onClick={() => setDialog("reject")} disabled={confirming}>
                  <XCircle /> Loại
                </Button>
                <form onSubmit={submitWithoutReset(confirmAction)}>
                  <input type="hidden" name="ids" value={ids.join(",")} />
                  <Button type="submit" disabled={confirming}>
                    <CheckCheck /> {confirming ? "Đang chuyển & tính giá…" : `Xác nhận ${ids.length} đơn → Vận đơn`}
                  </Button>
                </form>
              </>
            ) : (
              <form onSubmit={submitWithoutReset(restoreAction)}>
                <input type="hidden" name="ids" value={ids.join(",")} />
                <Button type="submit" variant="outline" disabled={restoring}>
                  <RotateCcw /> Đưa về chờ xác nhận
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
      {flash && <Alert tone={flash.ok ? "success" : "danger"} className="mb-3">{flash.ok ? flash.message : flash.error}</Alert>}
      {confirmState?.ok && confirmState.data && confirmState.data.reprice.failed.length > 0 && (
        <Alert tone="warning" className="mb-3" title="Đã chuyển sang Vận đơn nhưng chưa tra được giá (kiểm tra bảng giá):">
          <ul className="mt-1 list-disc pl-5 text-xs">
            {confirmState.data.reprice.failed.slice(0, 20).map((f) => (
              <li key={f.billCode}>
                {f.billCode}: {f.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={props.rows}
        total={props.total}
        page={props.page}
        pageSize={props.pageSize}
        empty={pending ? "Không có đơn chờ xác nhận." : "Không có đơn."}
        freeze={1}
        selection={canSelect ? { getRowId: (r) => String(r.id), selected, onChange: setSelected } : undefined}
      />

      <Dialog open={dialog === "create"} onOpenChange={(o) => !o && setDialog(null)} title="Nhập tay đơn nội bộ" className="max-w-3xl">
        <CreateOrderForm routes={props.routes} customers={props.customers} onDone={() => setDialog(null)} />
      </Dialog>
      <Dialog
        open={dialog === "template"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mẫu nhập đơn cho khách"
        description="File Excel mẫu riêng của khách, link mẫu Google Sheet và lưu link khách gửi lại để đồng bộ."
        className="max-w-2xl"
      >
        {dialog === "template" && <TemplateLinkForm customers={props.customers} masterSheetUrl={props.masterSheetUrl ?? null} onDone={() => setDialog(null)} />}
      </Dialog>
      <Dialog
        open={dialog === "file" || dialog === "sheet"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === "sheet" ? "Đồng bộ đơn từ Google Sheet của khách" : "Import đơn từ file Excel"}
        description="Đơn hợp lệ vào mục Chờ xác nhận; đơn trùng order_key (Mã KH|Mã vận đơn) tự động bị chặn."
        className="max-w-4xl"
      >
        {dialog && dialog !== "create" && dialog !== "reject" && (
          <ImportOrdersForm key={dialog} initialSource={dialog === "sheet" ? "SHEET" : "FILE"} customers={props.customers} onDone={() => setDialog(null)} />
        )}
      </Dialog>
      <Dialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)} title={`Loại ${ids.length} đơn`} className="max-w-lg">
        <form onSubmit={submitWithoutReset(rejectAction)} className="grid gap-3">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <p className="text-sm text-muted-foreground">Đơn bị loại không chuyển sang Vận đơn và không bị đồng bộ lại. Có thể đưa về chờ xác nhận ở tab “Đã loại”.</p>
          <Field label="Lý do" htmlFor="reason">
            <Textarea id="reason" name="reason" rows={3} placeholder="VD: khách hủy, nhập trùng…" />
          </Field>
          {rejectState && !rejectState.ok && <Alert tone="danger">{rejectState.error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Không
            </Button>
            <Button type="submit" variant="destructive" disabled={rejecting}>
              Loại đơn
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
