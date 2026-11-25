"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, ImagePlus, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { saveReceiptAction } from "@/lib/receipts/actions";
import type { CustomerDebt } from "@/lib/receipts/service";
import { DEFAULT_RECEIVED_ACCOUNT, formatThousands, parseThousands, suggestAllocation, vndToWords } from "@/lib/receipts/format";
import { cn, formatMoney } from "@/lib/utils";

const nowLocal = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Saigon" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dt = (s: string) => new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", dateStyle: "short", timeStyle: "short" });
const MODE_LABEL = { EXACT: "Khớp chính xác", COMBO: "Khớp gộp", FIFO: "FIFO cũ nhất trước", NONE: "" } as const;

type Proof = { file: File; url: string };

export function ReconcileView({
  customer,
  debt,
  nextReceiptNo,
  canManage,
}: {
  customer: { code: string; name: string };
  debt: CustomerDebt;
  nextReceiptNo: string;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveReceiptAction, null);
  const [amount, setAmount] = useState("");
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [manual, setManual] = useState(false); // người dùng đã sửa tay phân bổ
  const [proofs, setProofs] = useState<Proof[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const amountNum = Number(parseThousands(amount) || 0);
  const suggestion = useMemo(
    () => suggestAllocation(amountNum, debt.open.map((s) => ({ id: s.id, statementNo: s.statementNo, balance: s.balance!, issuedAt: s.issuedAt }))),
    [amountNum, debt.open],
  );
  const applySuggestion = () => {
    setAlloc(Object.fromEntries(suggestion.allocations.map((a) => [a.id, formatThousands(a.amount)])));
    setManual(false);
  };
  // Tự áp gợi ý khi đổi số tiền (cho tới khi người dùng sửa tay)
  useEffect(() => {
    if (!manual) setAlloc(Object.fromEntries(suggestion.allocations.map((a) => [a.id, formatThousands(a.amount)])));
  }, [suggestion, manual]);

  const allocated = Object.values(alloc).reduce((t, v) => t + Number(parseThousands(v) || 0), 0);
  const over = amountNum - allocated;
  const overAlloc = debt.open.find((s) => Number(parseThousands(alloc[s.id] ?? "") || 0) > Number(s.balance));

  // Dán ảnh chuyển khoản (Ctrl+V) ở bất kỳ đâu trên màn hình
  const addFiles = (files: File[]) =>
    setProofs((ps) => [...ps, ...files.filter((f) => f.type.startsWith("image/")).map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 5));
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addFiles(files.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `chuyen-khoan-${Date.now()}-${i}.png`, { type: f.type })));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const proofsRef = useRef<Proof[]>([]);
  proofsRef.current = proofs;
  useEffect(() => () => proofsRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []); // chỉ khi rời màn hình

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("proofs");
    proofs.forEach((p) => fd.append("proofs", p.file));
    fd.set(
      "allocations",
      JSON.stringify(Object.entries(alloc).filter(([, v]) => Number(parseThousands(v)) > 0).map(([id, v]) => ({ statementId: Number(id), amount: parseThousands(v) }))),
    );
    startTransition(() => action(fd));
  };

  if (state?.ok && state.data) {
    return (
      <Card className="max-w-2xl p-6">
        <Alert tone="success" title={state.message} className="mb-3">
          <ul className="mt-1 list-disc pl-5 text-xs">
            {state.data.statements.map((s) => (
              <li key={s.statementNo}>
                {s.statementNo} → {s.status}
              </li>
            ))}
            {Number(state.data.overpaid) > 0 && <li>Thu thừa (số dư có của khách): {formatMoney(state.data.overpaid)} đ</li>}
          </ul>
        </Alert>
        <Button onClick={() => window.location.reload()}>Lập phiếu thu khác</Button>
      </Card>
    );
  }

  return (
    <div className={cn("grid gap-4", canManage && "xl:grid-cols-[420px_1fr]")}>
      {/* ---------------- Cột trái: thông tin phiếu thu (chỉ Kế toán/Admin) ---------------- */}
      {canManage && (
      <form id="receipt-form" onSubmit={submit} className="grid h-fit gap-4 rounded-lg border bg-card p-5">
        <input type="hidden" name="customerCode" value={customer.code} />
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thông tin phiếu thu</h2>
          <Badge tone="info" title="Số chính thức được cấp khi lưu">
            {nextReceiptNo}
          </Badge>
        </div>
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

        <Field label="Khách hàng">
          <Input value={`${customer.code} — ${customer.name}`} readOnly className="bg-muted" />
        </Field>
        <Field label="Tài khoản nhận" htmlFor="receivedAccount">
          <Input id="receivedAccount" name="receivedAccount" defaultValue={DEFAULT_RECEIVED_ACCOUNT} />
        </Field>
        <Field label="Số tiền nhận (VND) *" htmlFor="amount" error={state && !state.ok ? state.fieldErrors?.amount : undefined}>
          <Input
            id="amount"
            name="amount"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(formatThousands(e.target.value))}
            placeholder="3.000.000"
            className="h-11 text-right text-lg font-semibold tabular-nums"
            required
            autoFocus
          />
          {amountNum > 0 && <p className="text-xs italic text-muted-foreground">Bằng chữ: {vndToWords(amountNum)}</p>}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Thời gian nhận" htmlFor="receivedAt">
            <Input id="receivedAt" name="receivedAt" type="datetime-local" defaultValue={nowLocal()} />
          </Field>
          <Field label="Hình thức" htmlFor="method">
            <NativeSelect id="method" name="method" defaultValue="CHUYEN_KHOAN">
              <option value="CHUYEN_KHOAN">Chuyển khoản</option>
              <option value="TIEN_MAT">Tiền mặt</option>
              <option value="KHAC">Khác</option>
            </NativeSelect>
          </Field>
          <Field label="Mã giao dịch / nội dung CK" htmlFor="bankRef">
            <Input id="bankRef" name="bankRef" placeholder="FT2633…" />
          </Field>
          <Field label="Người chuyển" htmlFor="payerName">
            <Input id="payerName" name="payerName" />
          </Field>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Ảnh minh chứng</span>
          <div
            className="flex min-h-24 flex-wrap items-center gap-2 rounded-md border border-dashed p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles([...e.dataTransfer.files]);
            }}
          >
            {proofs.map((p, i) => (
              <div key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Minh chứng ${i + 1}`} className="size-20 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setProofs((ps) => ps.filter((_, j) => j !== i));
                  }}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 shadow"
                  aria-label="Bỏ ảnh"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {proofs.length < 5 && (
              <button type="button" onClick={() => fileRef.current?.click()} className="flex size-20 flex-col items-center justify-center gap-1 rounded border text-xs text-muted-foreground hover:bg-accent">
                <ImagePlus className="size-5" /> Tải ảnh
              </button>
            )}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClipboardPaste className="size-3" /> Ctrl+V để dán ảnh chuyển khoản
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        <Field label="Ghi chú" htmlFor="note">
          <Textarea id="note" name="note" />
        </Field>

        <div className="rounded-md bg-muted p-3 text-sm">
          <Row label="Số tiền nhận" value={formatMoney(amountNum)} />
          <Row label="Phân bổ vào bảng kê" value={formatMoney(allocated)} />
          <Row
            label={over >= 0 ? "Thu thừa (ghi có cho khách)" : "Phân bổ vượt số tiền"}
            value={formatMoney(Math.abs(over))}
            className={over > 0 ? "text-emerald-700" : over < 0 ? "text-destructive" : undefined}
          />
        </div>
        {overAlloc && <Alert tone="danger">Phân bổ cho {overAlloc.statementNo} vượt số còn nợ.</Alert>}
        <Button type="submit" className="h-10" disabled={pending || amountNum <= 0 || over < 0 || !!overAlloc}>
          {pending ? "Đang lưu…" : "Lưu phiếu thu"}
        </Button>
      </form>
      )}

      {/* ---------------- Cột phải: công nợ & phân bổ ---------------- */}
      <section className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Tổng bảng kê" value={debt.total} />
          <Stat label="Đã thanh toán" value={debt.paid} tone="text-emerald-700" />
          <Stat label="Còn nợ" value={debt.balance} tone="text-destructive" strong />
          <Stat label="Thu thừa (số dư có)" value={debt.credit} tone="text-blue-700" />
        </div>

        {amountNum > 0 && suggestion.mode !== "NONE" && (
          <Alert tone="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Sparkles className="size-4" />
                <Badge tone="info">{MODE_LABEL[suggestion.mode]}</Badge>
                {suggestion.label}
              </span>
              {manual && (
                <Button size="sm" variant="outline" onClick={applySuggestion}>
                  <Wand2 /> Áp dụng gợi ý
                </Button>
              )}
            </div>
          </Alert>
        )}
        {amountNum > 0 && suggestion.mode === "NONE" && <Alert tone="warning">{suggestion.label}</Alert>}

        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Bảng kê</TH>
              <TH>Ngày tạo</TH>
              <TH className="text-right">Tổng tiền</TH>
              <TH className="text-right">Đã thu</TH>
              <TH className="text-right">Còn nợ</TH>
              <TH className="w-44 text-right">Phân bổ lần này</TH>
              <TH className="text-right">Còn thiếu sau thu</TH>
            </TR>
          </THead>
          <TBody>
            {debt.open.length === 0 && (
              <TR>
                <TD colSpan={7} className="h-20 text-center text-muted-foreground">
                  Không còn bảng kê nợ.
                </TD>
              </TR>
            )}
            {debt.open.map((s) => {
              const a = Number(parseThousands(alloc[s.id] ?? "") || 0);
              const after = Number(s.balance) - a;
              return (
                <TR key={s.id} className={a > 0 ? "bg-primary/5" : undefined}>
                  <TD>
                    <Link href={`/bang-ke/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.statementNo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {s.orderCount} đơn · {s.debtStatus}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums">{dt(s.issuedAt)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(s.totalAmount)}</TD>
                  <TD className="text-right tabular-nums text-muted-foreground">{formatMoney(s.paidAmount)}</TD>
                  <TD className="text-right font-medium tabular-nums">{formatMoney(s.balance)}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Input
                        disabled={!canManage}
                        value={alloc[s.id] ?? ""}
                        onChange={(e) => {
                          setManual(true);
                          setAlloc((m) => ({ ...m, [s.id]: formatThousands(e.target.value) }));
                        }}
                        inputMode="numeric"
                        className={cn("h-8 text-right tabular-nums", a > Number(s.balance) && "border-destructive")}
                        aria-label={`Phân bổ cho ${s.statementNo}`}
                        form="receipt-form"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!canManage}
                        title="Trả đủ bảng kê này"
                        onClick={() => {
                          setManual(true);
                          setAlloc((m) => ({ ...m, [s.id]: formatThousands(String(Math.round(Number(s.balance)))) }));
                        }}
                      >
                        Đủ
                      </Button>
                    </div>
                  </TD>
                  <TD className={cn("text-right tabular-nums", after <= 0 && a > 0 ? "text-emerald-700" : undefined)}>
                    {a > 0 ? (after <= 0 ? "Đã đủ" : formatMoney(after)) : "—"}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Phiếu thu gần đây</h3>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Mã phiếu</TH>
                <TH>Thời gian</TH>
                <TH className="text-right">Số tiền</TH>
                <TH>Phân bổ</TH>
                <TH className="text-right">Thu thừa</TH>
                <TH>Minh chứng</TH>
              </TR>
            </THead>
            <TBody>
              {debt.history.length === 0 && (
                <TR>
                  <TD colSpan={6} className="h-16 text-center text-muted-foreground">
                    Chưa có phiếu thu.
                  </TD>
                </TR>
              )}
              {debt.history.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.receiptNo}</TD>
                  <TD className="whitespace-nowrap tabular-nums">{dt(r.receivedAt)}</TD>
                  <TD className="text-right tabular-nums">{formatMoney(r.amount)}</TD>
                  <TD className="max-w-72 text-xs text-muted-foreground">{r.allocations || "—"}</TD>
                  <TD className="text-right tabular-nums text-blue-700">{Number(r.overpaidAmount) ? formatMoney(r.overpaidAmount) : "—"}</TD>
                  <TD className="space-x-1">
                    {r.proofImages.map((p, i) => (
                      <a key={p} href={`/api/receipts/proof?path=${encodeURIComponent(p)}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                        Ảnh {i + 1}
                      </a>
                    ))}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between py-0.5", className)}>
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value} đ</span>
    </div>
  );
}

function Stat({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold tabular-nums", strong ? "text-xl" : "text-lg", tone)}>{formatMoney(value)}</p>
    </Card>
  );
}
