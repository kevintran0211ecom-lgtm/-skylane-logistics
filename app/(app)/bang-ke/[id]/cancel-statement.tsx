"use client";

import { useActionState, useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { cancelStatementAction } from "@/lib/statements/actions";
import { submitWithoutReset } from "@/lib/form-submit";

export function CancelStatement({ id, disabled }: { id: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelStatementAction.bind(null, id), null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Bảng kê đã có thanh toán — gỡ phân bổ trước" : undefined}>
        <Ban /> Hủy bảng kê
      </Button>
      <Dialog open={open && !state?.ok} onOpenChange={setOpen} title="Hủy bảng kê" description="Bảng kê được đánh dấu “Đã hủy” (vẫn lưu lịch sử). Đơn không thuộc bảng kê hiệu lực nào khác sẽ về “Chưa thanh toán”; giá đơn vẫn khóa.">
        <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
          {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
          <Field label="Lý do hủy" htmlFor="reason">
            <Textarea id="reason" name="reason" placeholder="VD: Khách yêu cầu tách bảng kê" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Không hủy
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Đang hủy…" : "Xác nhận hủy"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
