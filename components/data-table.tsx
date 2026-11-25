"use client";

import { useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";

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
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  empty?: string;
  /** Tick chọn dòng (giữ qua các trang theo id) */
  selection?: { getRowId: (row: T) => string; selected: RowSelectionState; onChange: (s: RowSelectionState) => void };
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

  const go = (p: number) => {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete("page");
    else q.set("page", String(p));
    router.push(`${pathname}${q.size ? `?${q}` : ""}`);
  };

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <TR key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => (
                <TH key={h.id} style={{ width: (h.column.columnDef.meta as { width?: number } | undefined)?.width }}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TH>
              ))}
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
              <TR key={row.id} data-state={row.getIsSelected() ? "selected" : undefined} className="data-[state=selected]:bg-primary/5">
                {row.getVisibleCells().map((cell) => (
                  <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
                ))}
              </TR>
            ))
          )}
        </TBody>
      </Table>
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
