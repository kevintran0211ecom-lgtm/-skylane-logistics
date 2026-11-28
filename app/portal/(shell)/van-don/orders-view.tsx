"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Pencil, Search, X } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { cancelPortalDraft, getPortalOrderAction } from "@/lib/portal/actions";
import type { PortalOrderRow } from "@/lib/portal/queries";
import { PORTAL_TAB_LABEL, PORTAL_TABS, type PortalTab } from "@/lib/portal/rules";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";
import { PortalOrderForm, type PortalRouteOption } from "../dat-don/order-form";
import { PORTAL_STATUS_TONE } from "../status-tone";

type Filter = { tab?: PortalTab; q: string; from?: string; to?: string };
type Opened = { row: PortalOrderRow; editable: boolean; values: Record<string, string>; packages: { lengthCm: string; widthCm: string; heightCm: string; actualWeight: string }[] };

const dtVi = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "–";

export function PortalOrdersView(props: {
  rows: PortalOrderRow[];
  total: number;
  counts: Record<string, number>;
  totals: { orders: number; pieces: number; billed: number; amount: number } | null;
  filter: Filter;
  page: number;
  pageSize: number;
  routes: PortalRouteOption[];
  viewAs: boolean;
}) {
  const router = useRouter();
  const { filter } = props;
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelPortalDraft, null);
  useEffect(() => {
    if (!cancelState) return;
    setNotice(cancelState.ok ? { tone: "success", text: cancelState.message ?? "Đã hủy đơn." } : { tone: "danger", text: cancelState.error });
    if (cancelState.ok) {
      setOpened(null);
      router.refresh();
    }
  }, [cancelState, router]);

  const qs = (patch: Partial<Filter>) => {
    const f = { ...filter, ...patch };
    const p = new URLSearchParams();
    if (f.tab) p.set("tab", f.tab);
    if (f.q) p.set("q", f.q);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const isDraftTab = filter.tab === "CHO_XAC_NHAN" || filter.tab === "DA_LOAI";

  const open = useCallback(async (row: PortalOrderRow) => {
    setLoading(`${row.kind}-${row.id}`);
    const r = await getPortalOrderAction(row.kind, row.id);
    setLoading(null);
    if (!r.ok) return setNotice({ tone: "danger", text: r.error });
    setOpened({ row, editable: r.editable, values: r.values, packages: r.packages });
  }, []);

  const columns = useMemo<ColumnDef<PortalOrderRow, unknown>[]>(
    () => [
      {
        header: "Mã vận đơn",
        meta: { width: 150 },
        cell: ({ row: { original: o } }) => (
          <button type="button" onClick={() => open(o)} className="text-left font-medium text-primary hover:underline" disabled={loading !== null}>
            {o.billCode}
            {o.trackingNumber && <span className="block text-xs font-normal text-muted-foreground">{o.trackingNumber}</span>}
          </button>
        ),
      },
      { header: "Tuyến", accessorKey: "routeCode" },
      { header: "Điểm đến", accessorKey: "destinationIso2" },
      { header: "Trạng thái", cell: ({ row: { original: o } }) => <Badge tone={PORTAL_STATUS_TONE[o.status] ?? "muted"}>{o.status}</Badge> },
      {
        header: isDraftTab ? "Ngày gửi đơn" : "Ngày gửi hàng",
        cell: ({ row: { original: o } }) => <span className="whitespace-nowrap tabular-nums">{o.kind === "draft" ? dtVi(o.date) : viDate(o.date)}</span>,
      },
      { header: "Người nhận", cell: ({ row: { original: o } }) => <span className="block max-w-40 truncate">{o.receiverName ?? "–"}</span> },
      { header: "Số kiện", meta: { align: "right" }, cell: ({ row: { original: o } }) => <span className="tabular-nums">{o.packageCount}</span> },
      { header: "Cân thực", meta: { align: "right" }, cell: ({ row: { original: o } }) => <span className="tabular-nums">{formatKg(o.actualWeight)}</span> },
      ...(isDraftTab
        ? [
            {
              header: filter.tab === "DA_LOAI" ? "Lý do" : "",
              id: "note",
              cell: ({ row: { original: o } }: { row: { original: PortalOrderRow } }) =>
                o.note ? <span className="text-xs text-muted-foreground">{o.note}</span> : o.editable ? <span className="text-xs text-muted-foreground">Sửa được</span> : null,
            } satisfies ColumnDef<PortalOrderRow, unknown>,
          ]
        : ([
            { header: "Quy đổi", meta: { align: "right" }, cell: ({ row: { original: o } }) => <span className="tabular-nums">{formatKg(o.volumetricWeight)}</span> },
            { header: "Tính phí", meta: { align: "right" }, cell: ({ row: { original: o } }) => <span className="font-medium tabular-nums">{formatKg(o.billedWeight)}</span> },
            { header: "Thành tiền", meta: { align: "right" }, cell: ({ row: { original: o } }) => <span className="font-semibold tabular-nums">{formatMoney(o.totalAmount)}</span> },
            { header: "Công nợ", cell: ({ row: { original: o } }) => <span className="whitespace-nowrap text-xs">{o.debtStatus}</span> },
          ] satisfies ColumnDef<PortalOrderRow, unknown>[])),
      {
        id: "edit",
        meta: { width: 44 },
        cell: ({ row: { original: o } }) =>
          o.editable && !props.viewAs ? (
            <Button variant="ghost" size="icon" onClick={() => open(o)} aria-label={`Sửa ${o.billCode}`} title="Sửa đơn">
              <Pencil />
            </Button>
          ) : null,
      },
    ],
    [isDraftTab, filter.tab, open, loading, props.viewAs],
  );

  const tabs: (PortalTab | undefined)[] = [undefined, ...PORTAL_TABS];
  const exportHref = `/api/portal/van-don${qs({})}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {tabs.map((t) => {
          const n = t ? (props.counts[t] ?? 0) : props.counts.ALL;
          const on = filter.tab === t;
          return (
            <Link
              key={t ?? "all"}
              href={`/portal/van-don${qs({ tab: t })}`}
              className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", on ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {t ? PORTAL_TAB_LABEL[t] : "Tất cả vận đơn"} <span className="text-xs tabular-nums">({(n ?? 0).toLocaleString("vi-VN")})</span>
            </Link>
          );
        })}
      </div>

      <form className="mb-3 flex flex-wrap items-end gap-2" role="search">
        {filter.tab && <input type="hidden" name="tab" value={filter.tab} />}
        <label className="grid gap-1 text-xs text-muted-foreground">
          Tìm mã vận đơn / tracking (nhiều mã: mỗi dòng 1 mã)
          <Textarea name="q" defaultValue={filter.q} rows={1} className="min-h-9 w-72 resize-y py-1.5 text-sm" placeholder="VD: SKL001" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          {isDraftTab ? "Gửi đơn từ" : "Ngày gửi từ"}
          <Input type="date" name="from" defaultValue={filter.from} className="w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          đến
          <Input type="date" name="to" defaultValue={filter.to} className="w-40" />
        </label>
        <Button type="submit" variant="outline">
          <Search /> Lọc
        </Button>
        {(filter.q || filter.from || filter.to) && (
          <Link href={`/portal/van-don${qs({ q: "", from: undefined, to: undefined })}`} className="inline-flex h-9 items-center gap-1 px-2 text-sm text-muted-foreground hover:underline">
            <X className="size-4" /> Bỏ lọc
          </Link>
        )}
        <div className="flex-1" />
        {!isDraftTab && (
          <a href={exportHref} className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent" title="Tải các vận đơn theo bộ lọc đang xem">
            <Download className="size-4" /> Tải Excel
          </a>
        )}
      </form>

      {notice && (
        <Alert tone={notice.tone} className="mb-3">
          {notice.text}
        </Alert>
      )}

      <DataTable
        columns={columns}
        data={props.rows}
        total={props.total}
        page={props.page}
        pageSize={props.pageSize}
        empty={isDraftTab ? "Không có đơn." : "Chưa có vận đơn phù hợp."}
        freeze={1}
        footer={
          props.totals && props.totals.orders > 0 ? (
            <span className="text-sm">
              Tổng {props.totals.orders.toLocaleString("vi-VN")} đơn · {props.totals.pieces.toLocaleString("vi-VN")} kiện · {formatKg(props.totals.billed)} kg tính phí ·{" "}
              <b>{formatMoney(props.totals.amount)} đ</b>
            </span>
          ) : undefined
        }
      />

      <Dialog
        open={opened !== null}
        onOpenChange={(o) => !o && setOpened(null)}
        title={opened ? `${opened.editable ? "Sửa" : "Chi tiết"} ${opened.row.kind === "draft" ? "đơn" : "vận đơn"} ${opened.row.billCode}` : ""}
        description={opened ? `Trạng thái: ${opened.row.status}` : undefined}
        className="max-w-4xl"
      >
        {opened && (
          <div className="grid gap-3">
            <PortalOrderForm
              key={`${opened.row.kind}-${opened.row.id}`}
              routes={props.routes}
              mode={opened.row.kind}
              id={opened.row.id}
              initial={{ values: opened.values, packages: opened.packages }}
              readOnly={opened.editable ? false : props.viewAs ? "Bạn đang xem cổng với tư cách khách hàng — chỉ xem." : true}
              onDone={(msg) => {
                setOpened(null);
                if (msg) {
                  setNotice({ tone: "success", text: msg });
                  router.refresh();
                }
              }}
            />
            {opened.row.kind === "draft" && opened.editable && (
              <form
                action={cancelAction}
                onSubmit={(e) => {
                  if (!confirm(`Hủy đơn ${opened.row.billCode}? Đơn sẽ không được gửi cho SkyLane nữa.`)) e.preventDefault();
                }}
                className="border-t pt-3"
              >
                <input type="hidden" name="id" value={opened.row.id} />
                <Button type="submit" variant="destructive" size="sm" disabled={cancelling}>
                  {cancelling ? "Đang hủy…" : "Hủy đơn này"}
                </Button>
              </form>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
