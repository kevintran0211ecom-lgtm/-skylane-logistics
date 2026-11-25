"use client";

import { useActionState } from "react";
import { Archive, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setVersionStatus } from "@/lib/pricing/actions";

export function VersionActions({ id, status }: { id: number; status: "DRAFT" | "ACTIVE" | "ARCHIVED" }) {
  const next = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  const [state, action, pending] = useActionState(setVersionStatus.bind(null, id, next), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const msg =
          next === "ARCHIVED"
            ? "Lưu trữ phiên bản này? Đơn chưa khóa giá trong khoảng hiệu lực sẽ không còn bảng giá để tính lại."
            : "Kích hoạt lại phiên bản này?";
        if (!window.confirm(msg)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <Button type="submit" variant={next === "ARCHIVED" ? "outline" : "default"} disabled={pending}>
        {next === "ARCHIVED" ? <Archive /> : <CheckCircle2 />}
        {next === "ARCHIVED" ? "Lưu trữ" : "Kích hoạt"}
      </Button>
      {state && !state.ok && <p className="max-w-xs text-right text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
