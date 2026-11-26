"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { DataTable, type ColumnMeta } from "@/components/data-table";
import { Badge } from "@/components/ui/misc";
import type { StatementRow } from "@/lib/statements/service";
import { formatMoney } from "@/lib/utils";

const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", dateStyle: "short", timeStyle: "short" });

export function StatementsTable(props: { rows: StatementRow[]; total: number; page: number; pageSize: number }) {
  const columns = useMemo<ColumnDef<StatementRow, unknown>[]>(
    () => [
      {
        header: "Mã bảng kê",
        meta: { sortKey: "statementNo" } satisfies ColumnMeta,
        cell: ({ row: { original: s } }) => (
          <Link href={`/bang-ke/${s.id}`} className="font-medium text-primary hover:underline">
            {s.statementNo}
          </Link>
        ),
      },
      { header: "Tên bảng kê", meta: { sortKey: "name" } satisfies ColumnMeta, cell: ({ row: { original: s } }) => <span className="max-w-80 truncate">{s.name}</span> },
      { header: "Khách hàng", meta: { sortKey: "customerCode" } satisfies ColumnMeta, accessorKey: "customerCode" },
      { header: "Ngày tạo", meta: { sortKey: "issuedAt" } satisfies ColumnMeta, cell: ({ row: { original: s } }) => <span className="whitespace-nowrap tabular-nums">{dt(s.issuedAt)}</span> },
      { header: "Số đơn", meta: { sortKey: "orderCount", align: "right" } satisfies ColumnMeta, cell: ({ row: { original: s } }) => <span className="tabular-nums">{s.orderCount}</span> },
      {
        header: "Tổng tiền",
        meta: { sortKey: "totalAmount", align: "right" } satisfies ColumnMeta,
        cell: ({ row: { original: s } }) => <span className="font-semibold tabular-nums">{formatMoney(s.totalAmount, s.currency === "USD" ? "USD" : "VND")}</span>,
      },
      { header: "Đã thu", meta: { sortKey: "paidAmount", align: "right" } satisfies ColumnMeta, cell: ({ row: { original: s } }) => <span className="tabular-nums text-muted-foreground">{formatMoney(s.paidAmount)}</span> },
      {
        header: "Còn nợ",
        meta: { sortKey: "balanceAmount", align: "right" } satisfies ColumnMeta,
        cell: ({ row: { original: s } }) => <span className="tabular-nums">{formatMoney(s.balanceAmount)}</span>,
      },
      {
        header: "Công nợ",
        meta: { sortKey: "debtStatus" } satisfies ColumnMeta,
        cell: ({ row: { original: s } }) => (
          <Badge tone={s.debtStatus === "Đã thanh toán" ? "success" : s.debtStatus === "Thanh toán 1 phần" ? "warning" : "info"}>{s.debtStatus}</Badge>
        ),
      },
      {
        header: "Trạng thái",
        meta: { sortKey: "status" } satisfies ColumnMeta,
        cell: ({ row: { original: s } }) => (s.status === "ACTIVE" ? <Badge tone="success">Đang hiệu lực</Badge> : <Badge tone="danger">Đã hủy</Badge>),
      },
      {
        id: "xlsx",
        header: "Excel",
        meta: { width: 56 },
        cell: ({ row: { original: s } }) => (
          <a href={`/api/bang-ke/${s.id}/xlsx`} className="inline-flex rounded-md p-1.5 hover:bg-accent" aria-label={`Tải Excel ${s.statementNo}`} title="Tải Excel (.xlsx)">
            <Download className="size-4" />
          </a>
        ),
      },
    ],
    [],
  );
  return <DataTable columns={columns} data={props.rows} total={props.total} page={props.page} pageSize={props.pageSize} empty="Chưa có bảng kê." />;
}
