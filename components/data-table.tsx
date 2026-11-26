"use client";

import { useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** meta của cột: width (px), sortKey (bấm tiêu đề để sắp xếp A→Z / Z→A qua URL ?sort=&dir=), align */
export type ColumnMeta = { width?: number; sortKey?: string; align?: "right" };

/**
 * Bảng dữ liệu phân trang phía server: trang hiện tại nằm trên URL (?page=),
 * server chỉ trả về đúng 1 trang. Dùng chung cho danh mục, bảng giá và vận đơn.
 */
export function DataTable<T>({
  columns,
  data,
  total,
  page,
  pageSize,
  empty = "Chưa có dữ liệu.",
  selection,
  footer,
  onRowContextMenu,
  freeze = 0,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  empty?: string;
  /** Tick chọn dòng (giữ qua các trang theo id) */
  selection?: { getRowId: (row: T) => string; selected: RowSelectionState; onChange: (s: RowSelectionState) => void };
  /** Dòng tổng cuối bảng (VD tổng số đơn, cân, tiền) */
  footer?: React.ReactNode;
  /** Chuột phải trên 1 dòng (VD menu Sao chép) */
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  /** Số cột dữ liệu đầu tiên giữ cố định khi cuộn ngang (cột chọn tự giữ theo). Độ rộng lấy từ meta.width. */
  freeze?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasSelection = !!selection;
  const allColumns = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      hasSelection
        ? [
            {
              id: "_select",
              meta: { width: 36 },
              header: ({ table }) => (
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả trong trang"
                  className="size-4 accent-primary"
                  checked={table.getIsAllPageRowsSelected()}
                  ref={(el) => {
                    if (el) el.indeterminate = table.getIsSomePageRowsSelected();
                  }}
                  onChange={table.getToggleAllPageRowsSelectedHandler()}
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  aria-label="Chọn dòng"
                  className="size-4 accent-primary"
                  checked={row.getIsSelected()}
                  onChange={row.getToggleSelectedHandler()}
                />
              ),
            },
            ...columns,
          ]
        : columns,
    [columns, hasSelection],
  );
  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    ...(selection && {
      getRowId: selection.getRowId,
      enableRowSelection: true,
      state: { rowSelection: selection.selected },
      onRowSelectionChange: (u) => selection.onChange(typeof u === "function" ? u(selection.selected) : u),
    }),
  });

  // Cột cố định: vị trí left cộng dồn theo meta.width (mặc định 150px)
  const frozen = new Map<string, { left: number; last: boolean; width: number }>();
  if (freeze > 0) {
    const cols = table.getAllLeafColumns().slice(0, freeze + (hasSelection ? 1 : 0));
    let left = 0;
    cols.forEach((c, i) => {
      const width = (c.columnDef.meta as ColumnMeta | undefined)?.width ?? 150;
      frozen.set(c.id, { left, last: i === cols.length - 1, width });
      left += width;
    });
  }
  const stick = (id: string, header = false): { style?: React.CSSProperties; className?: string } => {
    const f = frozen.get(id);
    if (!f) return {};
    return {
      style: { position: "sticky", left: f.left, zIndex: header ? 3 : 2, width: f.width, minWidth: f.width },
      className: cn(header ? "bg-muted" : "bg-card group-data-[state=selected]:bg-primary/5", f.last && "shadow-[inset_-1px_0_0_var(--border),8px_0_8px_-8px_rgb(0_0_0/0.25)]"),
    };
  };

  const go = (p: number) => {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete("page");
    else q.set("page", String(p));
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };
  // Sắp xếp phía server: chưa sắp → A→Z → Z→A → bỏ; về trang 1
  const curSort = params.get("sort");
  const curDir = params.get("dir") === "asc" ? "asc" : "desc";
  const sortBy = (key: string) => {
    const q = new URLSearchParams(params.toString());
    q.delete("page");
    if (curSort !== key) {
      q.set("sort", key);
      q.set("dir", "asc");
    } else if (curDir === "asc") q.set("dir", "desc");
    else {
      q.delete("sort");
      q.delete("dir");
    }
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta as ColumnMeta | undefined;
                const label = h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext());
                const active = !!meta?.sortKey && curSort === meta.sortKey;
                return (
                  <TH
                    key={h.id}
                    style={{ width: meta?.width, ...stick(h.column.id, true).style }}
                    className={cn(meta?.align === "right" && "text-right", stick(h.column.id, true).className)}
                    aria-sort={active ? (curDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {meta?.sortKey ? (
                      <button
                        type="button"
                        onClick={() => sortBy(meta.sortKey!)}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                        title="Bấm để sắp xếp A→Z / Z→A"
                      >
                        {label}
                        {active ? curDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      label
                    )}
                  </TH>
                );
              })}
            </TR>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.length === 0 ? (
            <TR>
              <TD colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                {empty}
              </TD>
            </TR>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TR
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className="group data-[state=selected]:bg-primary/5"
                onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row.original, e) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TD
                    key={cell.id}
                    style={stick(cell.column.id).style}
                    className={cn((cell.column.columnDef.meta as ColumnMeta | undefined)?.align === "right" && "text-right", stick(cell.column.id).className)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TD>
                ))}
              </TR>
            ))
          )}
        </TBody>
      </Table>
      {footer}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Tổng {total.toLocaleString("vi-VN")} dòng</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Trang trước">
            <ChevronLeft />
          </Button>
          <span>
            Trang {page}/{pageCount}
          </span>
          <Button variant="outline" size="icon" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Trang sau">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
