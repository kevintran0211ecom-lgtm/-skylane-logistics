"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Download, Eye, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card } from "@/components/ui/misc";
import { commitPriceImport, previewPriceImport } from "@/lib/pricing/actions";
import type { ImportBlockPreview, ImportPreview } from "@/lib/pricing/import-types";
import { viDate } from "@/lib/pricing/versioning";
import { formatKg, PRICING_MODE_LABEL } from "@/lib/labels";
import { submitWithoutReset } from "@/lib/form-submit";

type Option = { code: string; name: string };

const firstOfMonth = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Saigon" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function ImportForm({ groups, customers }: { groups: Option[]; customers: Option[] }) {
  const [preview, previewAction, previewing] = useActionState(previewPriceImport, null);
  const [commit, commitAction, committing] = useActionState(commitPriceImport, null);
  const [kind, setKind] = useState<"COST" | "SELL">("COST");
  const [scopeType, setScopeType] = useState("DEFAULT");
  const [stale, setStale] = useState(true); // form đã đổi sau lần xem trước gần nhất

  useEffect(() => {
    if (preview) setStale(false);
  }, [preview]);

  if (commit?.ok && commit.data) {
    return (
      <Card className="max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="size-5" />
          <p className="font-medium">{commit.message}</p>
        </div>
        <ul className="mb-4 space-y-1 text-sm">
          {commit.data.created.map((c) => (
            <li key={c.id}>
              <Link href={`/bang-gia/${c.id}`} className="font-medium text-primary hover:underline">
                #{c.id} · {c.routeCode}
              </Link>{" "}
              <span className="text-muted-foreground">
                — {c.zones} vùng, {c.tiers.toLocaleString("vi-VN")} mốc giá
              </span>
            </li>
          ))}
        </ul>
        {commit.data.closed.length > 0 && (
          <p className="mb-4 text-sm text-muted-foreground">
            Đã chốt ngày kết thúc cho phiên bản cũ:{" "}
            {commit.data.closed.map((c) => `#${c.id} ${c.routeCode} → ${viDate(c.newEffectiveTo)}`).join("; ")}. Nội dung giá cũ giữ nguyên.
          </p>
        )}
        <div className="flex gap-2">
          <Link href="/bang-gia" className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Về Kho bảng giá
          </Link>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Nhập file khác
          </Button>
        </div>
      </Card>
    );
  }

  const data = preview?.ok ? preview.data : undefined;
  const canCommit = !!data?.canCommit && !stale;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form
        onChange={() => setStale(true)}
        onSubmit={submitWithoutReset((fd, submitter) =>
          submitter?.getAttribute("value") === "commit" ? commitAction(fd) : previewAction(fd),
        )}
        className="grid h-fit gap-4 rounded-lg border bg-card p-5"
      >
        <Field label="File Excel (.xlsx) *" htmlFor="file" hint={<a href="/api/bang-gia/mau-xlsx" className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="size-3" />Tải file Excel mẫu (2 tuyến ví dụ + hướng dẫn)</a>}>
          <Input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </Field>

        <Field label="Loại bảng giá" htmlFor="kind">
          <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "COST" | "SELL")}>
            <option value="COST">Giá gốc (nhà cung cấp)</option>
            <option value="SELL">Giá bán (khách hàng)</option>
          </NativeSelect>
        </Field>

        {kind === "SELL" && (
          <div className="grid gap-3 rounded-md border p-3">
            <Field label="Phạm vi áp dụng" htmlFor="scopeType">
              <NativeSelect id="scopeType" name="scopeType" value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
                <option value="DEFAULT">Bảng giá chung</option>
                <option value="GROUP">Theo nhóm giá</option>
                <option value="CUSTOMER">Riêng một khách hàng</option>
              </NativeSelect>
            </Field>
            {scopeType !== "DEFAULT" && (
              <Field label={scopeType === "GROUP" ? "Nhóm giá *" : "Khách hàng *"} htmlFor="scopeCode">
                <NativeSelect id="scopeCode" name="scopeCode" required defaultValue="">
                  <option value="" disabled>
                    — Chọn —
                  </option>
                  {(scopeType === "GROUP" ? groups : customers).map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} — {o.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
        )}

        <Field
          label="Ngày hiệu lực (effective_from) *"
          htmlFor="effectiveFrom"
          hint="Tạo phiên bản mới từ ngày này. Phiên bản đang áp dụng sẽ tự kết thúc vào ngày hôm trước; giá cũ giữ nguyên."
        >
          <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={firstOfMonth()} required />
        </Field>

        <Field label="Ghi chú" htmlFor="note">
          <Textarea id="note" name="note" placeholder="VD: Giá YUN tháng 11/2026" />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="skipUnknownRoutes" /> Bỏ qua tuyến chưa có trong Danh mục
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="preview" variant="outline" disabled={previewing || committing}>
            <Eye /> {previewing ? "Đang đọc file…" : "Xem trước"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="commit"
            disabled={!canCommit || committing || previewing}
            title={!data ? "Hãy xem trước trước khi nhập" : stale ? "Thông tin đã thay đổi — bấm Xem trước lại" : undefined}
          >
            <FileSpreadsheet /> {committing ? "Đang nhập…" : "Xác nhận nhập"}
          </Button>
        </div>
        {commit && !commit.ok && <Alert tone="danger">{commit.error}</Alert>}
      </form>

      <section aria-live="polite" className="min-w-0">
        {preview && !preview.ok && <Alert tone="danger">{preview.error}</Alert>}
        {!preview && (
          <Card className="p-6 text-sm text-muted-foreground">
            Chọn file và bấm <span className="font-medium text-foreground">Xem trước</span> để kiểm tra các tuyến, vùng giá, mốc Ma trận / Theo kg
            và ảnh hưởng tới phiên bản đang áp dụng trước khi ghi vào hệ thống.
          </Card>
        )}
        {data && <PreviewPanel data={data} stale={stale} />}
      </section>
    </div>
  );
}

function PreviewPanel({ data, stale }: { data: ImportPreview; stale: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{data.fileName}</span>
        <Badge>{data.scopeLabel}</Badge>
        <Badge tone="info">Hiệu lực từ {viDate(data.options.effectiveFrom)}</Badge>
        <span className="text-muted-foreground">{data.blocks.length} khối tuyến</span>
      </div>
      {stale && <Alert tone="warning">Thông tin form đã thay đổi sau lần xem trước — bấm “Xem trước” lại để cập nhật.</Alert>}
      {data.errors.length > 0 && (
        <Alert tone="danger" title="Chưa thể nhập — cần xử lý:">
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.errors.map((e, i) => (
              <li key={i} className="whitespace-pre-line">
                {e}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {data.canCommit && !stale && (
        <Alert tone="success">Dữ liệu hợp lệ. Bấm “Xác nhận nhập” để tạo {data.blocks.filter((b) => b.willImport).length} phiên bản mới.</Alert>
      )}
      {data.blocks.map((b) => (
        <BlockCard key={`${b.sheet}-${b.cellRef}`} b={b} />
      ))}
    </div>
  );
}

function BlockCard({ b }: { b: ImportBlockPreview }) {
  const fixedRange = b.fixedWeights.length ? `${formatKg(b.fixedWeights[0])} → ${formatKg(b.fixedWeights.at(-1))} kg (${b.fixedWeights.length} mốc)` : "—";
  return (
    <Card className={b.willImport ? "p-4" : "p-4 opacity-60"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{b.routeCode}</h3>
        <span className="text-xs text-muted-foreground">
          {b.sheet}!{b.cellRef}
        </span>
        {b.routeExists ? <Badge tone="success">Có trong Danh mục</Badge> : <Badge tone="danger">Chưa có tuyến</Badge>}
        <Badge>{PRICING_MODE_LABEL[b.mode]}</Badge>
        <Badge tone="muted">{b.currency}</Badge>
        {!b.routeExists && (
          <Link href="/tuyen" className="text-xs text-primary hover:underline">
            Tạo tuyến →
          </Link>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Nước / vùng giá</dt>
          <dd>
            {b.countryCount} nước · {b.zones.length} vùng
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ma trận (FIXED)</dt>
          <dd>{fixedRange}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Theo kg (PER_KG)</dt>
          <dd>
            {b.ranges.length
              ? b.ranges.map((r) => `(${formatKg(r.weightMin)}, ${r.weightMax ? formatKg(r.weightMax) : "∞"}]`).join(" ")
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {b.zones.map((z) => (
          <span key={z.zoneCode} className="rounded border px-2 py-0.5 text-xs" title={`${z.matrixCount} mốc ma trận, ${z.perKgCount} khoảng theo kg`}>
            <span className="font-medium">{z.zoneCode}</span> {z.countries.join(", ")}
          </span>
        ))}
      </div>

      {b.plan?.ok && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs">
          {b.plan.close.length === 0 && !b.plan.newEffectiveTo && <p>Phiên bản đầu tiên cho tuyến/phạm vi này.</p>}
          {b.plan.close.map((c) => (
            <p key={String(c.id)}>
              Phiên bản #{String(c.id)} ({viDate(c.effectiveFrom)} → {viDate(c.oldEffectiveTo)}) sẽ kết thúc ngày{" "}
              <span className="font-medium">{viDate(c.newEffectiveTo)}</span> — giá cũ giữ nguyên cho đơn quá khứ.
            </p>
          ))}
          {b.plan.newEffectiveTo && <p>Đã có phiên bản tương lai: phiên bản mới áp dụng đến {viDate(b.plan.newEffectiveTo)}.</p>}
          {b.affectedOrders > 0 && (
            <p className="mt-1 text-amber-700">
              <TriangleAlert className="mr-1 inline size-3" />
              {b.affectedOrders.toLocaleString("vi-VN")} đơn chưa khóa giá có ngày gửi trong khoảng này sẽ dùng giá mới khi được tính lại.
            </p>
          )}
        </div>
      )}

      {b.warnings.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-amber-700">{b.warnings.length} cảnh báo</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {b.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
