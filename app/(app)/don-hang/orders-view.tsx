"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Boxes, Inbox, Lock, PencilLine, Search, X } from "lucide-react";
import { DataTable } from "@/components/data-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import type { OrderRow } from "@/lib/orders/queries";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/schemas";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";
import { BulkEditForm } from "./bulk-edit-form";
import { PackagesForm } from "./packages-form";
import type { BulkField } from "@/lib/orders/schemas";

export type RouteOption = { code: string; name: string; serviceType: string };
export type CustomerOption = { code: string; name: string; hasSync: boolean };

export const STATUS_TONE: Record<OrderStatus, "muted" | "info" | "warning" | "success" | "danger"> = {
  "Phát sinh": "muted",
  "Đã nhận kho": "info",
  "Đã xuất hàng": "warning",
  "Đã giao hàng": "success",
  Hoàn: "danger",
};

function Weight({ value, overridden }: { value: string; overridden?: boolean }) {
  return (
    <span className={cn("tabular-nums", overridden && "font-medium text-amber-700")} title={overridden ? "Đang ghi đè thủ công" : undefined}>
      {Number(value) ? formatKg(value) : "–"}
      {overridden && "*"}
    </span>
  );
}

export function OrdersView(props: {
  rows: OrderRow[];
  total: number;
  counts: Partial<Record<OrderStatus, number>>;
  page: number;
  pageSize: number;
  q: string;
  status?: OrderStatus;
  routes: RouteOption[];
  perms: { showMoney: boolean; drafts: boolean; bulkFields: BulkField[]; editPackages: boolean; editLocked: boolean };
  pendingDrafts: number;
}) {
  const { perms } = props;
  const [selected, setSelected] = useState<RowSelectionState>({});
  const [dialog, setDialog] = useState<"bulk" | null>(null);
  const [packagesOf, setPackagesOf] = useState<OrderRow | null>(null);
  const canBulk = perms.bulkFields.length > 0;
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const all = Object.values(props.counts).reduce((t, n) => t + (n ?? 0), 0);
  const tabHref = (s?: OrderStatus) => {
    const q = new URLSearchParams();
    if (props.q) q.set("q", props.q);
    if (s) q.set("status", s);
    return `/don-hang${q.size ? `?${q}` : ""}`;
  };

  const columns = useMemo<ColumnDef<OrderRow, unknown>[]>(
    () => [
      {
        header: "Mã vận đơn",
        cell: ({ row: { original: o } }) => (
          <div className="min-w-32">
            <span className="flex items-center gap-1 font-medium">
              {o.billCode}
              {o.priceLocked && <Lock className="size-3 text-muted-foreground" aria-label="Đã khóa giá" />}
            </span>
            {o.trackingNumber && <span className="block text-xs text-muted-foreground">{o.trackingNumber}</span>}
          </div>
        ),
      },
      {
        header: "Khách hàng",
        cell: ({ row: { original: o } }) => (
          <div>
            <span className="font-medium">{o.customerCode}</span>
            <span className="block max-w-36 truncate text-xs text-muted-foreground">{o.customerName}</span>
          </div>
        ),
      },
      {
        header: "Tuyến / Chỉ định",
        cell: ({ row: { original: o } }) => (
          <div className="whitespace-nowrap">
            {o.routeCode}
            <span className={cn("block text-xs", o.assignedRouteCode !== o.routeCode ? "text-amber-700" : "text-muted-foreground")}>
              → {o.assignedRouteCode}
            </span>
          </div>
        ),
      },
      { header: "Đến", accessorKey: "destinationIso2" },
      { header: "Trạng thái", cell: ({ row: { original: o } }) => <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge> },
      { header: "Ngày gửi", cell: ({ row: { original: o } }) => <span className="whitespace-nowrap tabular-nums">{viDate(o.pricingDate)}</span> },
      { header: "Kiện", cell: ({ row: { original: o } }) => <span className="tabular-nums">{o.packageCount}</span> },
      { header: "Cân thực", cell: ({ row: { original: o } }) => <Weight value={o.actualWeight} overridden={o.manualOverrides.includes("actual_weight")} /> },
      { header: "Quy đổi", cell: ({ row: { original: o } }) => <Weight value={o.volumetricWeight} overridden={o.manualOverrides.includes("volumetric_weight")} /> },
      {
        header: "Tính phí",
        cell: ({ row: { original: o } }) => (
          <span className="font-medium">
            <Weight value={o.billedWeight} overridden={o.manualOverrides.includes("billed_weight")} />
          </span>
        ),
      },
      { header: "Xuất hàng", cell: ({ row: { original: o } }) => <Weight value={o.shippedWeight} overridden={o.manualOverrides.includes("shipped_weight")} /> },
      ...(perms.showMoney
        ? ([
            { header: "Giá bán", cell: ({ row: { original: o } }) => <span className="tabular-nums">{formatMoney(o.sellAmount)}</span> },
            { header: "Giá gốc", cell: ({ row: { original: o } }) => <span className="tabular-nums text-muted-foreground">{formatMoney(o.costAmount)}</span> },
            {
              header: "Lợi nhuận",
              cell: ({ row: { original: o } }) => (
                <span className={cn("font-medium tabular-nums", Number(o.profit) < 0 ? "text-destructive" : "text-emerald-700")}>{formatMoney(o.profit)}</span>
              ),
            },
          ] satisfies ColumnDef<OrderRow, unknown>[])
        : []),
      {
        header: "Công nợ",
        cell: ({ row: { original: o } }) => (
          <Badge tone={o.debtStatus === "Đã thanh toán" ? "success" : o.debtStatus === "Chưa thanh toán" ? "muted" : "info"}>{o.debtStatus}</Badge>
        ),
      },
      ...(perms.editPackages
        ? ([
            {
              id: "packages",
              header: "",
              meta: { width: 44 },
              cell: ({ row: { original: o } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPackagesOf(o)}
                  disabled={o.priceLocked && !perms.editLocked}
                  title={o.priceLocked && !perms.editLocked ? "Đơn đã khóa giá — cần Admin/Kế toán" : "Sửa kiện / kích thước / cân"}
                  aria-label={`Sửa kiện ${o.billCode}`}
                >
                  <Boxes />
                </Button>
              ),
            },
          ] satisfies ColumnDef<OrderRow, unknown>[])
        : []),
    ],
    [perms],
  );

  return (
    <>
      <nav className="mb-3 flex flex-wrap gap-1 border-b" aria-label="Lọc theo trạng thái">
        {[undefined, ...ORDER_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={tabHref(s)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              props.status === s ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s ?? "Tất cả"} <span className="text-xs tabular-nums">({((s ? props.counts[s] : all) ?? 0).toLocaleString("vi-VN")})</span>
          </Link>
        ))}
      </nav>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <form className="flex w-full max-w-md gap-2" role="search">
          {props.status && <input type="hidden" name="status" value={props.status} />}
          <Input name="q" defaultValue={props.q} placeholder="Mã vận đơn, tracking, mã/tên khách hàng" aria-label="Tìm kiếm" />
          <Button type="submit" variant="outline">
            <Search /> Tìm
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              Đã chọn <span className="font-medium text-foreground">{selectedIds.length}</span>
              <Button variant="ghost" size="icon" onClick={() => setSelected({})} aria-label="Bỏ chọn">
                <X />
              </Button>
            </span>
          )}
          {canBulk && (
            <Button variant="secondary" disabled={selectedIds.length === 0} onClick={() => setDialog("bulk")}>
              <PencilLine /> Sửa đổi hàng loạt
            </Button>
          )}
          {perms.drafts && (
            <Link href="/don-du-bao" className={buttonVariants({ variant: "outline" })}>
              <Inbox /> Nhận đơn mới
              {props.pendingDrafts > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{props.pendingDrafts.toLocaleString("vi-VN")}</span>
              )}
            </Link>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={props.rows}
        total={props.total}
        page={props.page}
        pageSize={props.pageSize}
        empty={props.q || props.status ? "Không có vận đơn phù hợp." : "Chưa có vận đơn. Đơn mới được nhận & xác nhận ở mục Đơn hàng dự báo."}
        selection={canBulk ? { getRowId: (r) => String(r.id), selected, onChange: setSelected } : undefined}
      />
      <p className="mt-2 text-xs text-muted-foreground">* Giá trị đang ghi đè thủ công (không tự tính lại). Biểu tượng khóa = đơn đã khóa giá.</p>

      <Dialog
        open={dialog === "bulk"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Sửa đổi hàng loạt — ${selectedIds.length} đơn`}
        description="Chỉ những trường được tick mới được cập nhật."
        className="max-w-2xl"
      >
        <BulkEditForm
          ids={selectedIds}
          routes={props.routes}
          allowedFields={perms.bulkFields}
          lockedNote={!perms.editLocked}
          onDone={() => {
            setDialog(null);
            setSelected({});
          }}
        />
      </Dialog>
      <Dialog
        open={packagesOf !== null}
        onOpenChange={(o) => !o && setPackagesOf(null)}
        title={`Kiện hàng — ${packagesOf?.billCode ?? ""}`}
        description="Sửa Dài/Rộng/Cao/Cân thực từng kiện. Đơn chưa khóa giá được tính lại cân & giá ngay khi lưu."
        className="max-w-2xl"
      >
        {packagesOf && <PackagesForm key={packagesOf.id} orderId={packagesOf.id} onDone={() => setPackagesOf(null)} />}
      </Dialog>
    </>
  );
}
