"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/misc";
import type { VersionRow } from "@/lib/pricing/queries";
import { viDate } from "@/lib/pricing/versioning";
import { PRICE_KIND_LABEL, PRICING_MODE_LABEL, PRICING_STATUS, scopeLabel } from "@/lib/labels";

export function VersionsTable(props: { rows: VersionRow[]; total: number; page: number; pageSize: number }) {
  const columns = useMemo<ColumnDef<VersionRow, unknown>[]>(
    () => [
      {
        header: "#",
        meta: { width: 56 },
        cell: ({ row }) => (
          <Link href={`/bang-gia/${row.original.id}`} className="font-medium text-primary hover:underline">
            {row.original.id}
          </Link>
        ),
      },
      {
        header: "Tuyến",
        cell: ({ row }) => (
          <Link href={`/bang-gia/${row.original.id}`} className="font-medium hover:underline">
            {row.original.routeCode} <span className="text-xs font-normal text-muted-foreground">{row.original.serviceType}</span>
          </Link>
        ),
      },
      {
        header: "Loại",
        cell: ({ row }) => <Badge tone={row.original.priceKind === "COST" ? "warning" : "info"}>{PRICE_KIND_LABEL[row.original.priceKind]}</Badge>,
      },
      { header: "Phạm vi", cell: ({ row }) => scopeLabel(row.original.customerCode, row.original.priceGroupCode) },
      { header: "Chế độ", cell: ({ row }) => PRICING_MODE_LABEL[row.original.pricingMode] },
      {
        header: "Hiệu lực",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            {viDate(row.original.effectiveFrom)} → {viDate(row.original.effectiveTo)}
          </span>
        ),
      },
      {
        header: "Vùng / Nước",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.zoneCount} / {row.original.countryCount}
          </span>
        ),
      },
      { header: "Tiền", accessorKey: "currency" },
      {
        header: "Trạng thái",
        cell: ({ row }) => {
          const s = PRICING_STATUS[row.original.status];
          return <Badge tone={s.tone}>{s.label}</Badge>;
        },
      },
    ],
    [],
  );
  return <DataTable columns={columns} data={props.rows} total={props.total} page={props.page} pageSize={props.pageSize} empty="Chưa có bảng giá. Bấm “Import Excel” để nhập." />;
}
