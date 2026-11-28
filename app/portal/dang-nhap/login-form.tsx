"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { portalSignIn } from "@/lib/portal/actions";
import { submitWithoutReset } from "@/lib/form-submit";

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(portalSignIn, null);
  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Mật khẩu" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
