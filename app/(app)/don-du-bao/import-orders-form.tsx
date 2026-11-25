"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Download, Eye, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form";
import { Alert, Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { importOrders, previewOrders } from "@/lib/orders/draft-actions";
import { submitWithoutReset } from "@/lib/form-submit";
import { formatKg } from "@/lib/labels";
import type { CustomerOption } from "../don-hang/orders-view";

export function ImportOrdersForm({
  customers,
  initialSource = "FILE",
  onDone,
}: {
  customers: CustomerOption[];
  initialSource?: "FILE" | "SHEET";
  onDone: () => void;
}) {
  const [preview, previewAction, previewing] = useActionState(previewOrders, null);
  const [commit, commitAction, committing] = useActionState(importOrders, null);
  const [source, setSource] = useState<"FILE" | "SHEET">(initialSource);
  const [customer, setCustomer] = useState(initialSource === "SHEET" ? (customers.find((c) => c.hasSync)?.code ?? "") : "");
  const [stale, setStale] = useState(true);
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
        <div className="flex justify-end">
          <Button onClick={onDone}>Đóng</Button>
        </div>
      </div>
    );
  }

  const data = preview?.ok ? preview.data : undefined;
  const selected = customers.find((c) => c.code === customer);

  return (
    <form
      onChange={() => setStale(true)}
      onSubmit={submitWithoutReset((fd, submitter) => (submitter?.getAttribute("value") === "commit" ? commitAction(fd) : previewAction(fd)))}
      className="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nguồn dữ liệu" htmlFor="source">
          <NativeSelect id="source" name="source" value={source} onChange={(e) => setSource(e.target.value as "FILE" | "SHEET")}>
            <option value="FILE">File Excel (mẫu SKL116) / CSV</option>
            <option value="SHEET">Google Sheet của khách</option>
          </NativeSelect>
        </Field>
        <Field label="Khách hàng mặc định" htmlFor="customerCode" hint="Dùng khi file không có cột Mã khách hàng">
          <NativeSelect id="customerCode" name="customerCode" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">— Lấy theo cột trong file —</option>
            {customers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
                {c.hasSync ? " (có nguồn đồng bộ)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {source === "FILE" ? (
          <Field label="File (.xlsx / .csv) *" htmlFor="file">
            <Input id="file" name="file" type="file" accept=".xlsx,.csv" required />
          </Field>
        ) : (
          <Field label="Tab" htmlFor="sheetTab" hint={selected?.hasSync ? "Để trống = tab đã cấu hình cho KH" : undefined}>
            <Input id="sheetTab" name="sheetTab" placeholder="DON" />
          </Field>
        )}
        {source === "SHEET" && (
          <Field
            label="Link Google Sheet"
            htmlFor="sheetUrl"
            className="sm:col-span-3"
            hint={
              selected?.hasSync
                ? `Để trống = dùng link nguồn đồng bộ đã cấu hình của ${selected.code}.`
                : 'Sheet cần bật chia sẻ "Bất kỳ ai có đường liên kết — Người xem".'
            }
          >
            <Input id="sheetUrl" name="sheetUrl" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        <p className="max-w-3xl">
          Dùng đúng mẫu cột tab <b>DON</b> (file SKL116): Thời gian phát sinh đơn, Mã vận đơn, Tuyến vận chuyển, Giá trị khai báo, Tên hàng, Mã HS, Người nhận, Địa chỉ,
          Thành phố, Bang/tỉnh, Mã bưu chính, SĐT, Mail, Điểm đến, Số kiện, Trọng lượng thực tế, Dài, Rộng, Cao. Cột nhận theo tên tiêu đề, không phân biệt thứ tự. Đơn
          hợp lệ vào <b>Đơn hàng dự báo</b> chờ xác nhận.
        </p>
        <a href="/api/don-du-bao/mau-xlsx" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Download className="size-3.5" /> Tải file mẫu
        </a>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant="outline" disabled={previewing || committing}>
          <Eye /> {previewing ? "Đang đọc…" : "Kiểm tra dữ liệu"}
        </Button>
        <Button type="submit" name="intent" value="commit" disabled={!data?.canCommit || stale || committing || previewing}>
          <Upload /> {committing ? "Đang đưa vào…" : data ? `Đưa ${data.newCount} đơn vào chờ xác nhận` : "Đưa vào chờ xác nhận"}
        </Button>
      </div>
      {preview && !preview.ok && <Alert tone="danger">{preview.error}</Alert>}
      {commit && !commit.ok && <Alert tone="danger">{commit.error}</Alert>}
      {data && stale && <Alert tone="warning">Thông tin đã thay đổi — bấm “Kiểm tra dữ liệu” lại.</Alert>}

      {data && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{data.sourceLabel}</span>
            <Badge tone="success">{data.newCount} đơn mới · {data.packageCount} kiện</Badge>
            {data.duplicatesDb.length > 0 && <Badge tone="warning">{data.duplicatesDb.length} đã có (Vận đơn / Đơn dự báo)</Badge>}
            {data.duplicatesFile.length > 0 && <Badge tone="warning">{data.duplicatesFile.length} trùng trong file</Badge>}
            {data.errors.length > 0 && <Badge tone="danger">{data.errors.length} dòng lỗi</Badge>}
          </div>
          {data.ignoredColumns.length > 0 && <p className="text-xs text-muted-foreground">Cột không dùng: {data.ignoredColumns.join(", ")}</p>}

          {data.errors.length > 0 && (
            <details open className="text-sm">
              <summary className="cursor-pointer font-medium text-destructive">Dòng lỗi (bị bỏ qua)</summary>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">
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
              <summary className="cursor-pointer font-medium text-amber-700">Đơn trùng order_key (bị chặn)</summary>
              <p className="mt-1 max-h-32 overflow-auto text-xs text-muted-foreground">
                {data.duplicatesDb.join(", ")}
                {data.duplicatesFile.length > 0 && ` · Trong file: ${data.duplicatesFile.map((d) => `dòng ${d.row} (${d.orderKey})`).join(", ")}`}
              </p>
            </details>
          )}
          {data.warnings.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{data.warnings.length} lưu ý</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {data.sample.length > 0 && (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>order_key</TH>
                  <TH>Tuyến</TH>
                  <TH>Đến</TH>
                  <TH className="text-right">Kiện</TH>
                  <TH className="text-right">Cân thực</TH>
                </TR>
              </THead>
              <TBody>
                {data.sample.map((s) => (
                  <TR key={s.orderKey}>
                    <TD className="font-medium">{s.orderKey}</TD>
                    <TD>{s.routeCode}</TD>
                    <TD>{s.destinationIso2}</TD>
                    <TD className="text-right tabular-nums">{s.packages}</TD>
                    <TD className="text-right tabular-nums">{formatKg(s.actualWeight)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </form>
  );
}
