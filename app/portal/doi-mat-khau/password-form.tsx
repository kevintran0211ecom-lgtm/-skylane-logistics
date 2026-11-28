"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { changePortalPassword } from "@/lib/portal/actions";
import { submitWithoutReset } from "@/lib/form-submit";

export function ChangePasswordForm({ firstTime }: { firstTime: boolean }) {
  const [state, action, pending] = useActionState(changePortalPassword, null);
  const err = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.message}</Alert>}
      <Field label={firstTime ? "Mật khẩu hiện tại (mặc định 123456)" : "Mật khẩu hiện tại"} htmlFor="current" error={err.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
      </Field>
      <Field label="Mật khẩu mới" htmlFor="password" error={err.password} hint="Tối thiểu 8 ký tự, không dùng 123456">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Nhập lại mật khẩu mới" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Lưu mật khẩu mới"}
      </Button>
    </form>
  );
}
