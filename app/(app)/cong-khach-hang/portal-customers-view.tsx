"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Eye, KeyRound, Lock, LockOpen, Search, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert, Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/misc";
import { createCustomerAccount, listCustomerAccountsAction, updateCustomerAccount, type CustomerAccountRow } from "@/lib/portal/account-actions";
import { startViewAs } from "@/lib/portal/actions";
import type { PortalCustomerRow } from "@/lib/portal/queries";
import { submitWithoutReset } from "@/lib/form-submit";

const dtVi = (s: string | null) =>
  s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Saigon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "Chưa đăng nhập";

export function PortalCustomersView({ rows, canManage, portalUrl }: { rows: PortalCustomerRow[]; canManage: boolean; portalUrl: string | null }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PortalCustomerRow | null>(null);
  const [pending, startTransition] = useTransition();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => r.code.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)) : rows;
  }, [rows, q]);
  const [origin, setOrigin] = useState(portalUrl ?? "");
  useEffect(() => {
    if (!portalUrl) setOrigin(window.location.origin);
  }, [portalUrl]);
  const loginUrl = `${origin}/portal/dang-nhap`;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã hoặc tên khách" className="pl-8" aria-label="Tìm khách hàng" />
        </div>
        <p className="text-sm text-muted-foreground">
          Link đăng nhập cho khách: <span className="select-all font-medium text-foreground">{loginUrl}</span>
        </p>
      </div>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Mã KH</TH>
            <TH>Tên khách hàng</TH>
            <TH className="text-right">Tài khoản</TH>
            <TH>Đăng nhập gần nhất</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {list.map((r) => (
            <TR key={r.code}>
              <TD className="font-medium">
                {r.code} {!r.isActive && <Badge tone="muted">Ngừng</Badge>}
              </TD>
              <TD>{r.name}</TD>
              <TD className="text-right tabular-nums">
                {r.accounts === 0 ? <span className="text-muted-foreground">Chưa có</span> : `${r.activeAccounts}/${r.accounts}`}
              </TD>
              <TD className="text-sm tabular-nums text-muted-foreground">{r.accounts ? dtVi(r.lastLoginAt) : "–"}</TD>
              <TD>
                <div className="flex justify-end gap-1">
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={() => setOpen(r)}>
                      <Users /> Tài khoản
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={pending || !r.isActive} onClick={() => startTransition(() => startViewAs(r.code))} title="Mở cổng khách hàng đúng như khách thấy (chỉ xem)">
                    <Eye /> Xem như khách
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
          {list.length === 0 && (
            <TR>
              <TD colSpan={5} className="py-8 text-center text-muted-foreground">
                Không có khách hàng.
              </TD>
            </TR>
          )}
        </TBody>
      </Table>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)} title={open ? `Tài khoản cổng khách — ${open.code} · ${open.name}` : ""} className="max-w-2xl">
        {open && <AccountsPanel key={open.code} customerCode={open.code} loginUrl={loginUrl} />}
      </Dialog>
    </>
  );
}

function AccountsPanel({ customerCode, loginUrl }: { customerCode: string; loginUrl: string }) {
  const [accounts, setAccounts] = useState<CustomerAccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, createAction, creating] = useActionState(createCustomerAccount, null);
  const [updated, updateAction, updating] = useActionState(updateCustomerAccount, null);
  const [formKey, setFormKey] = useState(0);
  const load = () =>
    listCustomerAccountsAction(customerCode).then((r) => {
      if (r.ok) setAccounts(r.rows);
      else setError(r.error);
    });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerCode]);
  useEffect(() => {
    if (created?.ok) setFormKey((k) => k + 1);
    if (created?.ok || updated?.ok) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [created, updated]);
  const [last, setLast] = useState<"created" | "updated" | null>(null);
  useEffect(() => setLast("created"), [created]);
  useEffect(() => setLast("updated"), [updated]);
  const msg = last === "created" ? created : last === "updated" ? updated : null;

  return (
    <div className="grid gap-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {msg && (msg.ok ? <Alert tone="success">{msg.message}</Alert> : <Alert tone="danger">{msg.error}</Alert>)}

      <form key={formKey} onSubmit={submitWithoutReset(createAction)} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="customerCode" value={customerCode} />
        <Field label="Email khách cung cấp (= tên đăng nhập)" htmlFor="acc-email" className="min-w-72 flex-1" error={created && !created.ok ? created.fieldErrors?.email : undefined}>
          <Input id="acc-email" name="email" type="email" required placeholder="khachhang@congty.com" />
        </Field>
        <Button type="submit" disabled={creating}>
          <UserPlus /> {creating ? "Đang tạo…" : "Tạo tài khoản"}
        </Button>
      </form>
      <p className="-mt-2 text-xs text-muted-foreground">
        Mật khẩu mặc định <b>123456</b>. Gửi cho khách: link {loginUrl}, email và mật khẩu mặc định — khách sẽ được yêu cầu đổi mật khẩu ngay lần đầu.
      </p>

      {accounts === null ? (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      ) : accounts.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Khách chưa có tài khoản nào.</p>
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Email</TH>
              <TH>Trạng thái</TH>
              <TH>Đăng nhập gần nhất</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium">{a.email}</TD>
                <TD>
                  {!a.isActive ? <Badge tone="muted">Đã khóa</Badge> : a.mustChangePassword ? <Badge tone="warning">Chờ đổi mật khẩu</Badge> : <Badge tone="success">Hoạt động</Badge>}
                </TD>
                <TD className="text-sm tabular-nums text-muted-foreground">{dtVi(a.lastLoginAt)}</TD>
                <TD>
                  <form onSubmit={submitWithoutReset(updateAction)} className="flex justify-end gap-1">
                    <input type="hidden" name="id" value={a.id} />
                    <Button
                      type="submit"
                      name="op"
                      value="reset"
                      variant="ghost"
                      size="sm"
                      disabled={updating}
                      title="Đặt lại mật khẩu về 123456 (khách phải đổi lại)"
                      onClick={(e) => {
                        if (!confirm(`Đặt lại mật khẩu ${a.email} về 123456?`)) e.preventDefault();
                      }}
                    >
                      <KeyRound /> Đặt lại MK
                    </Button>
                    <Button type="submit" name="op" value={a.isActive ? "lock" : "unlock"} variant="ghost" size="sm" disabled={updating}>
                      {a.isActive ? (
                        <>
                          <Lock /> Khóa
                        </>
                      ) : (
                        <>
                          <LockOpen /> Mở khóa
                        </>
                      )}
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
