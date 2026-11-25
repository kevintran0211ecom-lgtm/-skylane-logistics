"use client";
/** Hủy / Sửa phiếu thu & Dùng tiền Thu thừa — Admin, Kế toán */
import { useActionState, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { applyCreditAction, cancelReceiptAction, updateReceiptAction } from "@/lib/receipts/actions";
import type { CustomerDebt } from "@/lib/receipts/service";
import { formatThousands, parseThousands, suggestAllocation, vndToWords } from "@/lib/receipts/format";
import { submitWithoutReset } from "@/lib/form-submit";
import { cn, formatMoney } from "@/lib/utils";

type Receipt = CustomerDebt["history"][number];
type Line = { statementId: number; statementNo: string; max: number };
const num = (v: string | undefined) => Number(parseThousands(v ?? "") || 0);
const toLocal = (iso: string) => {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Saigon" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Done = (message?: string) => void;
function useCloseOnSuccess(state: { ok: true; message?: string } | { ok: false } | null, onDone: Done) {
  useEffect(() => {
    if (state?.ok) onDone(state.message);
  }, [state, onDone]);
}

/** Bảng nhập phân bổ: mỗi bảng kê 1 ô, nút "Đủ" điền tối đa */
function AllocationInputs({ lines, alloc, setAlloc }: { lines: Line[]; alloc: Record<number, string>; setAlloc: (f: (m: Record<number, string>) => Record<number, string>) => void }) {
  if (!lines.length) return <p className="text-sm text-muted-foreground">Không có bảng kê còn nợ.</p>;
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH>Bảng kê</TH>
          <TH className="text-right">Tối đa</TH>
          <TH className="w-48 text-right">Phân bổ</TH>
        </TR>
      </THead>
      <TBody>
        {lines.map((l) => (
          <TR key={l.statementId}>
            <TD className="font-medium">{l.statementNo}</TD>
            <TD className="text-right tabular-nums text-muted-foreground">{formatMoney(l.max)}</TD>
            <TD>
              <div className="flex gap-1">
                <Input
                  value={alloc[l.statementId] ?? ""}
                  onChange={(e) => setAlloc((m) => ({ ...m, [l.statementId]: formatThousands(e.target.value) }))}
                  inputMode="numeric"
                  className={cn("h-8 text-right tabular-nums", num(alloc[l.statementId]) > l.max && "border-destructive")}
                  aria-label={`Phân bổ cho ${l.statementNo}`}
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setAlloc((m) => ({ ...m, [l.statementId]: formatThousands(String(l.max)) }))}>
                  Đủ
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
const allocJson = (alloc: Record<number, string>) =>
  JSON.stringify(Object.entries(alloc).filter(([, v]) => num(v) > 0).map(([id, v]) => ({ statementId: Number(id), amount: parseThousands(v) })));

// -----------------------------------------------------------------------------
export function CancelReceiptForm({ receipt, onDone }: { receipt: Receipt; onDone: Done }) {
  const [state, action, pending] = useActionState(cancelReceiptAction.bind(null, receipt.id), null);
  useCloseOnSuccess(state, onDone);
  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Phiếu thu <b>{receipt.receiptNo}</b> ({formatMoney(receipt.amount)} đ) được đánh dấu “Đã hủy” và giữ lịch sử. Toàn bộ phân bổ bị gỡ: bảng kê và đơn hàng trở về trạng thái
        công nợ như trước khi nhận tiền{Number(receipt.overpaidAmount) > 0 ? "; số Thu thừa của phiếu này cũng mất" : ""}.
      </p>
      {receipt.allocations && <p className="rounded-md bg-muted px-3 py-2 text-xs">Đang phân bổ: {receipt.allocations}</p>}
      <Field label="Lý do hủy" htmlFor="reason">
        <Textarea id="reason" name="reason" rows={2} placeholder="VD: nhập nhầm khách, khách hoàn tiền…" />
      </Field>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Không hủy
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Đang hủy…" : "Xác nhận hủy"}
        </Button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function EditReceiptForm({ receipt, open, onDone }: { receipt: Receipt; open: CustomerDebt["open"]; onDone: Done }) {
  const [state, action, pending] = useActionState(updateReceiptAction.bind(null, receipt.id), null);
  useCloseOnSuccess(state, onDone);
  const [amount, setAmount] = useState(formatThousands(String(Math.round(Number(receipt.amount)))));
  const [alloc, setAlloc] = useState<Record<number, string>>(() => Object.fromEntries(receipt.allocs.map((a) => [a.statementId, formatThousands(a.amount)])));
  // Bảng kê đang phân bổ (tối đa = còn nợ + phần phiếu này đang trả) ∪ bảng kê còn nợ khác
  const lines = useMemo<Line[]>(() => {
    const mine = receipt.allocs.map((a) => ({ statementId: a.statementId, statementNo: a.statementNo, max: Number(a.balance) + Number(a.amount) }));
    const others = open.filter((s) => !mine.some((m) => m.statementId === s.id)).map((s) => ({ statementId: s.id, statementNo: s.statementNo, max: Number(s.balance) }));
    return [...mine, ...others];
  }, [receipt.allocs, open]);
  const total = num(amount);
  const allocated = Object.values(alloc).reduce((t, v) => t + num(v), 0);
  const bad = lines.find((l) => num(alloc[l.statementId]) > l.max);

  return (
    <form
      onSubmit={submitWithoutReset((fd) => {
        fd.set("allocations", allocJson(alloc));
        action(fd);
      })}
      className="grid gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Số tiền nhận (VND) *" htmlFor="e-amount">
          <Input id="e-amount" name="amount" value={amount} onChange={(e) => setAmount(formatThousands(e.target.value))} inputMode="numeric" className="text-right font-semibold tabular-nums" />
          {total > 0 && <p className="text-xs italic text-muted-foreground">Bằng chữ: {vndToWords(total)}</p>}
        </Field>
        <Field label="Thời gian nhận" htmlFor="e-receivedAt">
          <Input id="e-receivedAt" name="receivedAt" type="datetime-local" defaultValue={toLocal(receipt.receivedAt)} />
        </Field>
        <Field label="Hình thức" htmlFor="e-method">
          <NativeSelect id="e-method" name="method" defaultValue={receipt.method}>
            <option value="CHUYEN_KHOAN">Chuyển khoản</option>
            <option value="TIEN_MAT">Tiền mặt</option>
            <option value="KHAC">Khác</option>
          </NativeSelect>
        </Field>
        <Field label="Tài khoản nhận" htmlFor="e-account">
          <Input id="e-account" name="receivedAccount" defaultValue={receipt.receivedAccount} />
        </Field>
        <Field label="Mã giao dịch / nội dung CK" htmlFor="e-bankRef">
          <Input id="e-bankRef" name="bankRef" defaultValue={receipt.bankRef ?? ""} />
        </Field>
        <Field label="Người chuyển" htmlFor="e-payer">
          <Input id="e-payer" name="payerName" defaultValue={receipt.payerName ?? ""} />
        </Field>
        <Field label="Ghi chú" htmlFor="e-note" className="sm:col-span-2">
          <Textarea id="e-note" name="note" rows={2} defaultValue={receipt.note ?? ""} />
        </Field>
      </div>
      <AllocationInputs lines={lines} alloc={alloc} setAlloc={setAlloc} />
      <p className={cn("text-sm", total - allocated < 0 ? "text-destructive" : "text-muted-foreground")}>
        Phân bổ {formatMoney(allocated)} đ · {total - allocated >= 0 ? `Thu thừa ${formatMoney(total - allocated)} đ` : `vượt ${formatMoney(allocated - total)} đ`}
      </p>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Hủy bỏ
        </Button>
        <Button type="submit" disabled={pending || total <= 0 || allocated > total || !!bad}>
          {pending ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function ApplyCreditForm({ customerCode, credit, open, onDone }: { customerCode: string; credit: number; open: CustomerDebt["open"]; onDone: Done }) {
  const [state, action, pending] = useActionState(applyCreditAction.bind(null, customerCode), null);
  useCloseOnSuccess(state, onDone);
  const lines = open.map((s) => ({ statementId: s.id, statementNo: s.statementNo, max: Number(s.balance) }));
  // Gợi ý: dùng toàn bộ số dư, ưu tiên khớp chính xác → gộp → FIFO
  const [alloc, setAlloc] = useState<Record<number, string>>(() => {
    const s = suggestAllocation(credit, open.map((o) => ({ id: o.id, statementNo: o.statementNo, balance: o.balance!, issuedAt: o.issuedAt })));
    return Object.fromEntries(s.allocations.map((a) => [a.id, formatThousands(a.amount)]));
  });
  const used = Object.values(alloc).reduce((t, v) => t + num(v), 0);
  const bad = lines.find((l) => num(alloc[l.statementId]) > l.max);
  return (
    <form
      onSubmit={submitWithoutReset((fd) => {
        fd.set("allocations", allocJson(alloc));
        action(fd);
      })}
      className="grid gap-3"
    >
      <p className="text-sm">
        Số dư Thu thừa hiện có: <b className="tabular-nums text-blue-700">{formatMoney(credit)} đ</b>. Tiền được lấy từ phiếu thu cũ nhất trước và ghi thành phân bổ của
        các phiếu thu đó.
      </p>
      <AllocationInputs lines={lines} alloc={alloc} setAlloc={setAlloc} />
      <p className={cn("text-sm", used > credit ? "text-destructive" : "text-muted-foreground")}>
        Dùng {formatMoney(used)} đ · còn lại {formatMoney(Math.max(0, credit - used))} đ
      </p>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Hủy bỏ
        </Button>
        <Button type="submit" disabled={pending || used <= 0 || used > credit || !!bad}>
          {pending ? "Đang phân bổ…" : "Phân bổ Thu thừa"}
        </Button>
      </div>
    </form>
  );
}
