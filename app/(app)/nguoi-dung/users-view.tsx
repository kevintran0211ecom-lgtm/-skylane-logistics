"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, NativeSelect } from "@/components/ui/form";
import { Alert, Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { saveUser } from "@/lib/auth/actions";
import { ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { submitWithoutReset } from "@/lib/form-submit";

type UserRow = { id: string; email: string; fullName: string; role: Role; isActive: boolean; customerCount: number };
const ROLE_TONE: Record<Role, "danger" | "info" | "warning" | "success"> = { ADMIN: "danger", KE_TOAN: "info", KHO: "warning", SALE: "success" };

export function UsersView({ rows, meId }: { rows: UserRow[]; meId: string }) {
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <UserPlus /> Thêm người dùng
        </Button>
      </div>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Họ tên</TH>
            <TH>Email</TH>
            <TH>Vai trò</TH>
            <TH className="text-right">KH phụ trách</TH>
            <TH>Trạng thái</TH>
            <TH className="w-12" />
          </TR>
        </THead>
        <TBody>
          {rows.map((u) => (
            <TR key={u.id}>
              <TD className="font-medium">
                {u.fullName} {u.id === meId && <span className="text-xs text-muted-foreground">(bạn)</span>}
              </TD>
              <TD>{u.email}</TD>
              <TD>
                <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
              </TD>
              <TD className="text-right tabular-nums">{u.role === "SALE" ? u.customerCount : "—"}</TD>
              <TD>{u.isActive ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="muted">Đã khóa</Badge>}</TD>
              <TD>
                <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={`Sửa ${u.email}`}>
                  <Pencil />
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="mt-2 text-xs text-muted-foreground">Gán khách hàng cho Sale tại trang Khách hàng (ô “Sale phụ trách”).</p>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Thêm người dùng" : "Sửa người dùng"}>
        {editing !== null && <UserForm key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function UserForm({ row, onDone }: { row: UserRow | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveUser, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form onSubmit={submitWithoutReset(action)} className="grid gap-4">
      <input type="hidden" name="mode" value={row ? "edit" : "create"} />
      {row && <input type="hidden" name="id" value={row.id} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Email đăng nhập *" htmlFor="email">
        <Input id="email" name="email" type="email" defaultValue={row?.email} readOnly={!!row} required />
      </Field>
      <Field label="Họ tên *" htmlFor="fullName">
        <Input id="fullName" name="fullName" defaultValue={row?.fullName} required />
      </Field>
      <Field label="Vai trò *" htmlFor="role">
        <NativeSelect id="role" name="role" defaultValue={row?.role ?? "SALE"}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label={row ? "Đặt lại mật khẩu" : "Mật khẩu tạm *"} htmlFor="password" hint={row ? "Để trống nếu không đổi" : "Tối thiểu 8 ký tự; người dùng nên đổi sau khi đăng nhập"}>
        <Input id="password" name="password" type="text" autoComplete="new-password" required={!row} minLength={8} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isActive" defaultChecked={row?.isActive ?? true} /> Cho phép đăng nhập
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
