"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Boxes, ChevronDown, Copy, Inbox, Lock, PencilLine, Search, X } from "lucide-react";
import { DataTable, type ColumnMeta } from "@/components/data-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import type { OrderRow } from "@/lib/orders/queries";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/schemas";
import { DATE_FIELDS, type OrderListFilter } from "@/lib/orders/filters";
import type { OrderEditField } from "@/lib/orders/edit";
import { sumOrders, toTsv, type OrderTotals } from "@/lib/orders/totals";
import { listOrderCodesAction } from "@/lib/orders/actions";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg } from "@/lib/labels";
import { cn, formatMoney } from "@/lib/utils";
import { BulkEditForm } from "./bulk-edit-form";
import { PackagesForm } from "./packages-form";
import { OrderDetailForm } from "./order-detail-form";
import type { BulkField } from "@/lib/orders/schemas";

export type RouteOption = { code: string; name: string; serviceType: string };
export type CustomerOption = { code: string; name: string; hasSync: boolean; sheetUrl?: string | null };

export const STATUS_TONE: Record<OrderStatus, "muted" | "info" | "warning" | "success" | "danger"> = {
  "Phát sinh": "muted",
  "Đã nhận kho": "info",
  "Đã xuất hàng": "warning",
  "Đã giao hàng": "success",
  Hoàn: "danger",
};

const dtVi = (s: string | null) => (s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

function Weight({ value, overridden }: { value: string; overridden?: boolean }) {
  return (
    <span className={cn("tabular-nums", overridden && "font-medium text-amber-700")} title={overridden ? "Đang ghi đè thủ công" : undefined}>
      {Number(value) ? formatKg(value) : "–"}
      {overridden && "*"}
    </span>
  );
}

type Menu = { x: number; y: number; row: OrderRow | null };

export function OrdersView(props: {
  rows: OrderRow[];
  total: number;
  totals: OrderTotals;
  counts: Partial<Record<OrderStatus, number>>;
  page: number;
  pageSize: number;
  filter: OrderListFilter;
  notFound: string[];
  routes: RouteOption[];
  customers: CustomerOption[];
  perms: { showMoney: boolean; drafts: boolean; bulkFields: BulkField[]; editPackages: boolean; editLocked: boolean; editFields: OrderEditField[] };
  pendingDrafts: number;
}) {
  const { perms, filter } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<RowSelectionState>({});
  // Lưu dữ liệu các dòng đã chọn (kể cả ở trang khác) để tính tổng & sao chép
  const [picked, setPicked] = useState<Record<string, OrderRow>>({});
  const [dialog, setDialog] = useState<"bulk" | null>(null);
  const [packagesOf, setPackagesOf] = useState<OrderRow | null>(null);
  const [detailOf, setDetailOf] = useState<OrderRow | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const canBulk = perms.bulkFields.length > 0;
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const pickedRows = selectedIds.map((id) => picked[id]).filter(Boolean);
  const all = Object.values(props.counts).reduce((t, n) => t + (n ?? 0), 0);

  const onSelect = (s: RowSelectionState) => {
    setSelected(s);
    setPicked((prev) => {
      const next: Record<string, OrderRow> = {};
      for (const [id, on] of Object.entries(s)) if (on) next[id] = prev[id] ?? props.rows.find((r) => String(r.id) === id)!;
      return next;
    });
  };
  const clearSelection = () => onSelect({});

  const href = (patch: Partial<Record<string, string | undefined>>) => {
    const q = new URLSearchParams();
    const cur: Record<string, string | undefined> = { q: filter.q || undefined, status: filter.status, df: filter.dateField !== "sent" ? filter.dateField : undefined, from: filter.from, to: filter.to, sort: filter.sort, dir: filter.sort ? filter.dir : undefined };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) q.set(k, v);
    return `${pathname}${q.size ? `?${q}` : ""}`;
  };

  // ---- Sao chép
  const flash = (tone: "success" | "warning" | "danger", text: string) => {
    setToast({ tone, text });
    setTimeout(() => setToast(null), 4000);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash("success", `Đã sao chép ${what}.`);
    } catch {
      flash("danger", "Trình duyệt chặn sao chép — hãy cho phép quyền clipboard.");
    }
  };
  const rowsTsv = (rows: OrderRow[]) =>
    toTsv(
      ["Mã vận đơn", "Tracking", "Mã KH", "Tên khách hàng", "Tuyến", "Tuyến chỉ định", "Điểm đến", "Trạng thái", "Ngày gửi", "Thời gian xuất hàng", "Số kiện", "Cân thực", "Quy đổi", "Tính phí", "Xuất hàng", ...(perms.showMoney ? ["Giá bán", "Giá gốc", "Lợi nhuận"] : []), "Công nợ"],
      rows.map((o) => [
        o.billCode, o.trackingNumber, o.customerCode, o.customerName, o.routeCode, o.assignedRouteCode, o.destinationIso2, o.status, viDate(o.pricingDate), dtVi(o.exportedAt),
        o.packageCount, formatKg(o.actualWeight), formatKg(o.volumetricWeight), formatKg(o.billedWeight), formatKg(o.shippedWeight),
        ...(perms.showMoney ? [Math.round(Number(o.sellAmount)), Math.round(Number(o.costAmount)), Math.round(Number(o.profit))] : []), o.debtStatus,
      ]),
    );
  const copyAllCodes = async () => {
    const r = await listOrderCodesAction({ q: filter.q, status: filter.status, dateField: filter.dateField, from: filter.from, to: filter.to, sort: filter.sort, dir: filter.dir });
    if (!r.ok) return flash("danger", r.error);
    await copy(r.codes.join("\n"), `${r.codes.length.toLocaleString("vi-VN")} mã vận đơn (tất cả dòng theo bộ lọc)${r.truncated ? " — giới hạn 20.000 mã" : ""}`);
  };
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!menu) return;
    const openedAt = Date.now();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    const onScroll = () => Date.now() - openedAt > 250 && closeMenu(); // bỏ qua cuộn quán tính ngay lúc mở menu
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  const columns = useMemo<ColumnDef<OrderRow, unknown>[]>(() => {
    const m = (meta: ColumnMeta) => meta;
    const right = (sortKey: string) => m({ sortKey, align: "right" });
    return [
      {
        header: "Mã vận đơn",
        meta: m({ sortKey: "billCode", width: 150 }),
        cell: ({ row: { original: o } }) => (
          <span className="flex min-w-28 items-center gap-1">
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setDetailOf(o)} title="Xem & sửa chi tiết vận đơn">
              {o.billCode}
            </button>
            {o.priceLocked && <Lock className="size-3 text-muted-foreground" aria-label="Đã khóa giá" />}
          </span>
        ),
      },
      { header: "Tracking", meta: m({ sortKey: "trackingNumber" }), cell: ({ row: { original: o } }) => <span className="whitespace-nowrap">{o.trackingNumber}</span> },
      { header: "Mã KH", meta: m({ sortKey: "customerCode" }), cell: ({ row: { original: o } }) => <span className="font-medium">{o.customerCode}</span> },
      { header: "Tên khách hàng", meta: m({ sortKey: "customerName" }), cell: ({ row: { original: o } }) => <span className="block max-w-40 truncate" title={o.customerName}>{o.customerName}</span> },
      {
        header: "Tuyến / Chỉ định",
        meta: m({ sortKey: "routeCode" }),
        cell: ({ row: { original: o } }) => (
          <div className="whitespace-nowrap">
            {o.routeCode}
            <span className={cn("block text-xs", o.assignedRouteCode !== o.routeCode ? "text-amber-700" : "text-muted-foreground")}>→ {o.assignedRouteCode}</span>
          </div>
        ),
      },
      { header: "Đến", meta: m({ sortKey: "destinationIso2" }), accessorKey: "destinationIso2" },
      { header: "Trạng thái", meta: m({ sortKey: "status" }), cell: ({ row: { original: o } }) => <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge> },
      { header: "Ngày gửi", meta: m({ sortKey: "pricingDate" }), cell: ({ row: { original: o } }) => <span className="whitespace-nowrap tabular-nums">{viDate(o.pricingDate)}</span> },
      { header: "Thời gian xuất hàng", meta: m({ sortKey: "exportedAt" }), cell: ({ row: { original: o } }) => <span className="whitespace-nowrap tabular-nums">{dtVi(o.exportedAt) || "–"}</span> },
      { header: "Kiện", meta: right("packageCount"), cell: ({ row: { original: o } }) => <span className="tabular-nums">{o.packageCount}</span> },
      { header: "Cân thực", meta: right("actualWeight"), cell: ({ row: { original: o } }) => <Weight value={o.actualWeight} overridden={o.manualOverrides.includes("actual_weight")} /> },
      { header: "Quy đổi", meta: right("volumetricWeight"), cell: ({ row: { original: o } }) => <Weight value={o.volumetricWeight} overridden={o.manualOverrides.includes("volumetric_weight")} /> },
      {
        header: "Tính phí",
        meta: right("billedWeight"),
        cell: ({ row: { original: o } }) => (
          <span className="font-medium">
            <Weight value={o.billedWeight} overridden={o.manualOverrides.includes("billed_weight")} />
          </span>
        ),
      },
      { header: "Xuất hàng", meta: right("shippedWeight"), cell: ({ row: { original: o } }) => <Weight value={o.shippedWeight} overridden={o.manualOverrides.includes("shipped_weight")} /> },
      ...(perms.showMoney
        ? ([
            {
              header: "Giá bán",
              meta: right("sellAmount"),
              cell: ({ row: { original: o } }) => (
                <span className={cn("tabular-nums", o.manualOverrides.includes("sell_amount") && "font-medium text-amber-700")}>
                  {formatMoney(o.sellAmount)}
                  {o.manualOverrides.includes("sell_amount") && "*"}
                </span>
              ),
            },
            {
              header: "Giá gốc",
              meta: right("costAmount"),
              cell: ({ row: { original: o } }) => (
                <span className={cn("tabular-nums text-muted-foreground", o.manualOverrides.includes("cost_amount") && "font-medium text-amber-700")}>
                  {formatMoney(o.costAmount)}
                  {o.manualOverrides.includes("cost_amount") && "*"}
                </span>
              ),
            },
            {
              header: "Lợi nhuận",
              meta: right("profit"),
              cell: ({ row: { original: o } }) => <span className={cn("font-medium tabular-nums", Number(o.profit) < 0 ? "text-destructive" : "text-emerald-700")}>{formatMoney(o.profit)}</span>,
            },
          ] satisfies ColumnDef<OrderRow, unknown>[])
        : []),
      {
        header: "Công nợ",
        meta: m({ sortKey: "debtStatus" }),
        cell: ({ row: { original: o } }) => <Badge tone={o.debtStatus === "Đã thanh toán" ? "success" : o.debtStatus === "Chưa thanh toán" ? "muted" : "info"}>{o.debtStatus}</Badge>,
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
                  title={o.priceLocked && !perms.editLocked ? "Đơn đã khóa giá — cần Admin/Kế toán" : "Sửa nhanh kiện / kích thước / cân"}
                  aria-label={`Sửa kiện ${o.billCode}`}
                >
                  <Boxes />
                </Button>
              ),
            },
          ] satisfies ColumnDef<OrderRow, unknown>[])
        : []),
    ];
  }, [perms]);

  const selTotals = sumOrders(pickedRows);
  const filtered = !!(filter.q || filter.from || filter.to || filter.status);

  return (
    <>
      <nav className="mb-3 flex flex-wrap gap-1 border-b" aria-label="Lọc theo trạng thái">
        {[undefined, ...ORDER_STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={href({ status: s })}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm transition-colors", filter.status === s ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {s ?? "Tất cả"} <span className="text-xs tabular-nums">({((s ? props.counts[s] : all) ?? 0).toLocaleString("vi-VN")})</span>
          </Link>
        ))}
      </nav>

      {/* ---- Tìm nhiều mã + tra cứu thời gian ---- */}
      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const get = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
          router.push(href({ q: get("q"), df: get("df") === "sent" ? undefined : get("df"), from: get("from"), to: get("to") }));
        }}
      >
        <div className="grid gap-1">
          <label htmlFor="q" className="text-xs text-muted-foreground">
            Mã vận đơn / tracking / khách hàng — dán nhiều mã, mỗi dòng 1 mã
          </label>
          <Textarea
            id="q"
            name="q"
            defaultValue={filter.q}
            rows={filter.q.includes("\n") ? Math.min(6, filter.q.split("\n").length) : 1}
            placeholder={"#AP3004\n#AP3003\nMN2637"}
            className="min-h-9 w-80 resize-y py-1.5 font-mono text-xs focus:min-h-28"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
            }}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Tra cứu thời gian</span>
          <div className="flex items-center gap-1">
            <NativeSelect name="df" defaultValue={filter.dateField} className="w-44" aria-label="Loại thời gian">
              {Object.entries(DATE_FIELDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
            <Input type="date" name="from" defaultValue={filter.from} className="w-36" aria-label="Từ ngày" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" name="to" defaultValue={filter.to} className="w-36" aria-label="Đến ngày" />
          </div>
        </div>
        <Button type="submit" variant="outline">
          <Search /> Tìm
        </Button>
        {filtered && (
          <Link href={href({ q: undefined, from: undefined, to: undefined, df: undefined, status: undefined })} className={buttonVariants({ variant: "ghost" })}>
            <X /> Xóa lọc
          </Link>
        )}
      </form>
      {props.notFound.length > 0 && (
        <Alert tone="warning" className="mb-3">
          Không tìm thấy {props.notFound.length} mã: <span className="font-mono text-xs">{props.notFound.slice(0, 50).join(", ")}{props.notFound.length > 50 ? "…" : ""}</span>
        </Alert>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {selectedIds.length > 0 ? (
            <>
              Đã chọn <span className="font-medium text-foreground">{selectedIds.length}</span>
              <Button variant="ghost" size="icon" onClick={clearSelection} aria-label="Bỏ chọn">
                <X />
              </Button>
            </>
          ) : (
            <span>Chuột phải vào một dòng để sao chép nhanh.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 4, row: null });
            }}
          >
            <Copy /> Sao chép <ChevronDown />
          </Button>
          {canBulk && (
            <Button variant="secondary" disabled={selectedIds.length === 0} onClick={() => setDialog("bulk")}>
              <PencilLine /> Sửa đổi hàng loạt
            </Button>
          )}
          {perms.drafts && (
            <Link href="/don-du-bao" className={buttonVariants({ variant: "outline" })}>
              <Inbox /> Nhận đơn mới
              {props.pendingDrafts > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{props.pendingDrafts.toLocaleString("vi-VN")}</span>}
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
        empty={filtered ? "Không có vận đơn phù hợp." : "Chưa có vận đơn. Đơn mới được nhận & xác nhận ở mục Đơn hàng dự báo."}
        selection={{ getRowId: (r) => String(r.id), selected, onChange: onSelect }}
        freeze={1}
        onRowContextMenu={(row, e) => {
          e.preventDefault();
          setMenu({ x: Math.min(e.clientX, window.innerWidth - 300), y: Math.min(e.clientY, window.innerHeight - 260), row });
        }}
        footer={
          <div className="space-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
            {pickedRows.length > 0 && <TotalsLine label="Đã chọn" t={selTotals} money={perms.showMoney} />}
            <TotalsLine label={filtered ? "Tổng theo bộ lọc" : "Tổng tất cả"} t={props.totals} money={perms.showMoney} strong />
          </div>
        }
      />
      <p className="mt-2 text-xs text-muted-foreground">* Giá trị đang ghi đè thủ công (không tự tính lại). Biểu tượng khóa = đơn đã khóa giá.</p>

      {menu && (
        <div
          role="menu"
          className="fixed z-50 w-72 rounded-lg border bg-background p-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.row && (
            <>
              <MenuItem onClick={() => (closeMenu(), copy(menu.row!.billCode, `mã ${menu.row!.billCode}`))}>Sao chép mã dòng này</MenuItem>
              <MenuItem onClick={() => (closeMenu(), copy(rowsTsv([menu.row!]), "dòng này (đầy đủ cột)"))}>Sao chép dòng này (đầy đủ cột)</MenuItem>
              <MenuItem onClick={() => (closeMenu(), setDetailOf(menu.row))}>Xem / sửa chi tiết</MenuItem>
              <hr className="my-1" />
            </>
          )}
          <MenuItem disabled={!pickedRows.length} onClick={() => (closeMenu(), copy(pickedRows.map((r) => r.billCode).join("\n"), `${pickedRows.length} mã vận đơn đã chọn`))}>
            Sao chép mã các dòng đã chọn ({pickedRows.length})
          </MenuItem>
          <MenuItem disabled={!pickedRows.length} onClick={() => (closeMenu(), copy(rowsTsv(pickedRows), `${pickedRows.length} dòng đã chọn — dán vào Excel`))}>
            Sao chép các dòng đã chọn (đầy đủ cột)
          </MenuItem>
          <MenuItem disabled={!props.total} onClick={() => (closeMenu(), copyAllCodes())}>
            Sao chép mã tất cả dòng ({props.total.toLocaleString("vi-VN")})
          </MenuItem>
          {selectedIds.length > 0 && (
            <>
              <hr className="my-1" />
              <MenuItem onClick={() => (closeMenu(), clearSelection())}>Bỏ chọn tất cả</MenuItem>
            </>
          )}
        </div>
      )}
      {toast && (
        <div className="fixed right-4 bottom-4 z-50 max-w-md">
          <Alert tone={toast.tone}>{toast.text}</Alert>
        </div>
      )}

      <Dialog
        open={detailOf !== null}
        onOpenChange={(o) => !o && setDetailOf(null)}
        title={`Vận đơn ${detailOf?.billCode ?? ""}`}
        description={detailOf ? `${detailOf.customerCode} — ${detailOf.customerName}` : undefined}
        className="max-w-5xl"
      >
        {detailOf && (
          <OrderDetailForm
            key={detailOf.id}
            orderId={detailOf.id}
            routes={props.routes}
            customers={props.customers}
            editable={perms.editFields}
            showMoney={perms.showMoney}
            editLocked={perms.editLocked}
            onDone={(msg) => {
              setDetailOf(null);
              if (msg) flash("success", msg);
            }}
          />
        )}
      </Dialog>
      <Dialog open={dialog === "bulk"} onOpenChange={(o) => !o && setDialog(null)} title={`Sửa đổi hàng loạt — ${selectedIds.length} đơn`} description="Chỉ những trường được tick mới được cập nhật." className="max-w-2xl">
        <BulkEditForm
          ids={selectedIds}
          routes={props.routes}
          allowedFields={perms.bulkFields}
          lockedNote={!perms.editLocked}
          onDone={() => {
            setDialog(null);
            clearSelection();
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

function MenuItem({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-40">
      {children}
    </button>
  );
}

function TotalsLine({ label, t, money, strong }: { label: string; t: OrderTotals; money: boolean; strong?: boolean }) {
  const item = (k: string, v: string, tone?: string) => (
    <span className="whitespace-nowrap">
      {k}: <b className={cn("tabular-nums", tone ?? "text-foreground")}>{v}</b>
    </span>
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground", strong && "font-medium")}>
      <span className="font-semibold text-foreground">{label}:</span>
      {item("Số đơn", t.orders.toLocaleString("vi-VN"))}
      {item("Số kiện", t.packages.toLocaleString("vi-VN"))}
      {item("Cân thực", formatKg(t.actualWeight) || "0")}
      {item("Tính phí", formatKg(t.billedWeight) || "0")}
      {item("Xuất hàng", formatKg(t.shippedWeight) || "0")}
      {money && item("Giá gốc", formatMoney(t.costAmount))}
      {money && item("Giá bán", formatMoney(t.sellAmount))}
      {money && item("Lợi nhuận", formatMoney(t.profit), Number(t.profit) < 0 ? "text-destructive" : "text-emerald-700")}
    </div>
  );
}
