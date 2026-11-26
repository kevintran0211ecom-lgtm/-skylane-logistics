"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { saveCustomerSheetLink } from "@/lib/orders/draft-actions";
import { googleSheetCopyLink, orderTemplateFilename, templateMessage } from "@/lib/orders/template";
import { submitWithoutReset } from "@/lib/form-submit";
import type { CustomerOption } from "../don-hang/orders-view";

/**
 * Mẫu nhập đơn cho khách:
 *  1) Tải file Excel mẫu riêng của khách (tab DON + danh sách tuyến + mã khách ở sheet Hướng dẫn → import tự nhận khách)
 *  2) Link "tạo bản sao" Google Sheet mẫu gốc của SkyLane + tin nhắn gửi khách
 *  3) Lưu link Google Sheet khách gửi lại làm nguồn đồng bộ
 */
export function TemplateLinkForm({ customers, masterSheetUrl, onDone }: { customers: CustomerOption[]; masterSheetUrl: string | null; onDone: () => void }) {
  const [code, setCode] = useState(customers[0]?.code ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveCustomerSheetLink, null);
  const c = customers.find((x) => x.code === code);
  const copyLink = googleSheetCopyLink(masterSheetUrl);
  const msg = c ? templateMessage({ customerCode: c.code, customerName: c.name, copyLink, sheetLink: c.sheetUrl }) : "";
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* trình duyệt chặn clipboard */
    }
  };
  const CopyBtn = ({ text, what }: { text: string; what: string }) => (
    <Button type="button" variant="outline" size="sm" onClick={() => copy(text, what)}>
      {copied === what ? <Check /> : <Copy />} {copied === what ? "Đã sao chép" : "Sao chép"}
    </Button>
  );

  return (
    <div className="grid gap-5">
      <Field label="Khách hàng" htmlFor="tpl-cust">
        <NativeSelect id="tpl-cust" value={code} onChange={(e) => setCode(e.target.value)}>
          {customers.map((x) => (
            <option key={x.code} value={x.code}>
              {x.code} — {x.name}
              {x.sheetUrl ? " (đã có link)" : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <section className="grid gap-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">1. File Excel mẫu cho khách</h3>
        <p className="text-sm text-muted-foreground">
          Đúng cột tab DON, có danh sách tuyến thả xuống; ghi sẵn mã khách nên khi khách gửi lại (hoặc tải từ Google Sheet) bấm Import Excel là hệ thống tự nhận đúng khách.
        </p>
        <div>
          <a href={`/api/don-du-bao/mau-xlsx?customer=${encodeURIComponent(code)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Download className="size-4" /> {orderTemplateFilename(code, c?.name)}
          </a>
        </div>
      </section>

      <section className="grid gap-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">2. Link mẫu Google Sheet</h3>
        {copyLink ? (
          <>
            <p className="text-sm text-muted-foreground">Khách bấm link là tạo ngay bản sao mẫu nhập đơn trong Google Drive của họ, rồi chia sẻ lại link cho SkyLane.</p>
            <div className="flex gap-2">
              <Input value={copyLink} readOnly className="font-mono text-xs" aria-label="Link tạo bản sao" />
              <CopyBtn text={copyLink} what="link" />
              <a href={copyLink} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 text-primary" title="Mở thử">
                <ExternalLink className="size-4" />
              </a>
            </div>
          </>
        ) : (
          <Alert tone="info">
            Chưa có Google Sheet mẫu gốc. Cách tạo một lần: tải file mẫu ở bước 1 (không chọn khách cũng được) → tải lên Google Drive → Mở bằng Google Trang tính → Chia sẻ “Bất kỳ ai có đường liên kết — Người xem” → đặt link vào biến môi trường <code>ORDER_TEMPLATE_SHEET_URL</code> trên Vercel.
          </Alert>
        )}
        <Field label="Tin nhắn gửi khách (Zalo / email)" htmlFor="tpl-msg">
          <Textarea id="tpl-msg" value={msg} readOnly rows={5} className="text-xs" />
        </Field>
        <div>
          <CopyBtn text={msg} what="msg" />
        </div>
      </section>

      <form onSubmit={submitWithoutReset(action)} className="grid gap-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">3. Link Google Sheet của khách (nguồn đồng bộ)</h3>
        <input type="hidden" name="customerCode" value={code} />
        {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
        {state?.ok && <Alert tone="success">{state.message}</Alert>}
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <Field label="Link khách gửi lại" htmlFor="tpl-url" error={state && !state.ok ? state.fieldErrors?.sheetUrl : undefined}>
            <Input key={code} id="tpl-url" name="sheetUrl" type="url" defaultValue={c?.sheetUrl ?? ""} placeholder="https://docs.google.com/spreadsheets/d/…" />
          </Field>
          <Field label="Tab" htmlFor="tpl-tab">
            <Input id="tpl-tab" name="sheetTab" defaultValue="DON" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Đóng
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu…" : "Lưu link cho khách"}
          </Button>
        </div>
      </form>
    </div>
  );
}
