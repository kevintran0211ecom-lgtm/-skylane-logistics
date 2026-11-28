"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Eye, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { importPortalOrders, previewPortalImport } from "@/lib/portal/actions";
import { submitWithoutReset } from "@/lib/form-submit";
import { formatKg } from "@/lib/labels";

export function PortalImportForm({ readOnly }: { readOnly: boolean }) {
  const [preview, previewAction, previewing] = useActionState(previewPortalImport, null);
  const [commit, commitAction, committing] = useActionState(importPortalOrders, null);
  const [stale, setStale] = useState(true);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (preview) setStale(false);
  }, [preview]);

  if (commit?.ok) {
    return (
      <div className="grid gap-4">
        <Alert tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4" /> {commit.message}
          </span>
        </Alert>
        <div className="flex gap-2">
          <Link href="/portal/van-don?tab=CHO_XAC_NHAN" className="text-sm text-primary hover:underline">
            Xem đơn chờ xác nhận →
          </Link>
          <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setRound((r) => r + 1)}>
            Nhập file khác
          </button>
        </div>
      </div>
    );
  }
  const data = preview?.ok ? preview.data : undefined;

  return (
    <form
      key={round}
      onChange={() => setStale(true)}
      onSubmit={submitWithoutReset((fd, submitter) => (submitter?.getAttribute("value") === "commit" ? commitAction(fd) : previewAction(fd)))}
      className="grid gap-4"
    >
      <Field label="File Excel (.xlsx) hoặc CSV *" htmlFor="file" className="max-w-md">
        <Input id="file" name="file" type="file" accept=".xlsx,.csv" required />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={previewing || committing}>
          <Eye /> {previewing ? "Đang đọc…" : "Kiểm tra dữ liệu"}
        </Button>
        <Button type="submit" name="intent" value="commit" disabled={readOnly || !data?.canCommit || stale || committing || previewing}>
          <Upload /> {committing ? "Đang gửi…" : data ? `Gửi ${data.newCount} đơn cho SkyLane` : "Gửi đơn cho SkyLane"}
        </Button>
      </div>
      {readOnly && <Alert tone="warning">Bạn đang xem cổng với tư cách khách hàng — chỉ kiểm tra được, không gửi đơn được.</Alert>}
      {preview && !preview.ok && <Alert tone="danger">{preview.error}</Alert>}
      {commit && !commit.ok && <Alert tone="danger">{commit.error}</Alert>}
      {data && stale && <Alert tone="warning">Bạn đã đổi file — bấm “Kiểm tra dữ liệu” lại.</Alert>}

      {data && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{data.sourceLabel}</span>
            <Badge tone="success">
              {data.newCount} đơn hợp lệ · {data.packageCount} kiện
            </Badge>
            {data.duplicatesDb.length > 0 && <Badge tone="warning">{data.duplicatesDb.length} mã đã có trong hệ thống</Badge>}
            {data.duplicatesFile.length > 0 && <Badge tone="warning">{data.duplicatesFile.length} trùng trong file</Badge>}
            {data.errors.length > 0 && <Badge tone="danger">{data.errors.length} dòng lỗi</Badge>}
          </div>
          {data.errors.length > 0 && (
            <details open className="text-sm">
              <summary className="cursor-pointer font-medium text-destructive">Dòng lỗi (sẽ không được gửi — sửa file rồi kiểm tra lại)</summary>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs">
                {data.errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0 && `Dòng ${e.row}`}
                    {e.billCode && ` · ${e.billCode}`}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(data.duplicatesDb.length > 0 || data.duplicatesFile.length > 0) && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-amber-700">Mã vận đơn trùng (sẽ bị bỏ qua)</summary>
              <p className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                {data.duplicatesDb.map((k) => k.split("|")[1]).join(", ")}
                {data.duplicatesFile.length > 0 && ` · Trong file: ${data.duplicatesFile.map((d) => `dòng ${d.row} (${d.orderKey.split("|")[1]})`).join(", ")}`}
              </p>
            </details>
          )}
          {data.sample.length > 0 && (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Mã vận đơn</TH>
                  <TH>Tuyến</TH>
                  <TH>Điểm đến</TH>
                  <TH className="text-right">Số kiện</TH>
                  <TH className="text-right">Cân nặng (kg)</TH>
                </TR>
              </THead>
              <TBody>
                {data.sample.map((s) => (
                  <TR key={s.orderKey}>
                    <TD className="font-medium">{s.orderKey.split("|")[1]}</TD>
                    <TD>{s.routeCode}</TD>
                    <TD>{s.destinationIso2}</TD>
                    <TD className="text-right tabular-nums">{s.packages}</TD>
                    <TD className="text-right tabular-nums">{formatKg(s.actualWeight)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {data.newCount > data.sample.length && <p className="text-xs text-muted-foreground">Hiển thị {data.sample.length} / {data.newCount} đơn.</p>}
        </div>
      )}
    </form>
  );
}
