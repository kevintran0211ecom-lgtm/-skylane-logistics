"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import type { OrderListFilter } from "@/lib/orders/filters";
import {
  addKeys,
  exportColumnsFor,
  moveKeys,
  parsePresets,
  PRESET_STORAGE_KEY,
  removeKeys,
  upsertPreset,
  VISIBLE_COLUMNS,
  type ExportPreset,
} from "@/lib/orders/export-columns";

const LAST_KEY = "skylane-order-export-last";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filter: OrderListFilter;
  total: number;
  selectedIds: string[];
  showMoney: boolean;
};

function ColumnList({
  title,
  keys,
  labels,
  marked,
  setMarked,
  onDouble,
  empty,
}: {
  title: string;
  keys: string[];
  labels: Map<string, string>;
  marked: string[];
  setMarked: (v: string[]) => void;
  onDouble: (k: string) => void;
  empty: string;
}) {
  const allOn = keys.length > 0 && keys.every((k) => marked.includes(k));
  const toggle = (k: string) => setMarked(marked.includes(k) ? marked.filter((x) => x !== k) : [...marked, k]);
  return (
    <div className="flex min-h-0 flex-col">
      <p className="mb-1 border-l-2 border-primary pl-2 text-sm font-medium">
        {title} <span className="text-xs font-normal text-muted-foreground">({keys.length})</span>
      </p>
      <div className="h-80 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr className="text-xs text-muted-foreground">
              <th className="w-10 px-2 py-1.5 text-left font-medium">STT</th>
              <th className="w-8 py-1.5">
                <input type="checkbox" checked={allOn} onChange={() => setMarked(allOn ? [] : [...keys])} aria-label={`Chọn tất cả — ${title}`} className="size-4 accent-primary" />
              </th>
              <th className="px-2 py-1.5 text-left font-medium">Tên cột</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => (
              <tr
                key={k}
                onClick={() => toggle(k)}
                onDoubleClick={() => onDouble(k)}
                className={`cursor-pointer select-none border-t ${marked.includes(k) ? "bg-primary/10" : "hover:bg-muted/50"}`}
                title="Bấm để chọn, bấm đúp để chuyển sang bên kia"
              >
                <td className="px-2 py-1 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="py-1 text-center">
                  <input type="checkbox" checked={marked.includes(k)} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} aria-label={labels.get(k)} className="size-4 accent-primary" />
                </td>
                <td className="px-2 py-1">{labels.get(k)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>}
      </div>
    </div>
  );
}

export function ExportDialog({ open, onOpenChange, filter, total, selectedIds, showMoney }: Props) {
  const cols = useMemo(() => exportColumnsFor(showMoney), [showMoney]);
  const allKeys = useMemo(() => cols.map((c) => c.key), [cols]);
  const labels = useMemo(() => new Map(cols.map((c) => [c.key, c.label])), [cols]);
  const visible = useMemo(() => VISIBLE_COLUMNS.filter((k) => labels.has(k)), [labels]);
  const valid = (keys: string[]) => keys.filter((k) => labels.has(k));

  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [preset, setPreset] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [markL, setMarkL] = useState<string[]>([]);
  const [markR, setMarkR] = useState<string[]>([]);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [scope, setScope] = useState<"filter" | "selected">("filter");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPresets(parsePresets(store.get(PRESET_STORAGE_KEY)));
    let last: string[] = [];
    try {
      const v = JSON.parse(store.get(LAST_KEY) || "[]");
      if (Array.isArray(v)) last = valid(v.filter((k): k is string => typeof k === "string"));
    } catch {}
    setChosen(last.length ? last : visible);
    setScope(selectedIds.length ? "selected" : "filter");
    setMarkL([]);
    setMarkR([]);
    setMsg(null);
    setSaveAs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pending = allKeys.filter((k) => !chosen.includes(k));
  const savePresets = (list: ExportPreset[]) => {
    setPresets(list);
    store.set(PRESET_STORAGE_KEY, JSON.stringify(list));
  };
  const pick = (name: string) => {
    setPreset(name);
    const p = presets.find((x) => x.name === name);
    if (p) {
      setChosen(valid(p.keys));
      setMarkR([]);
    }
  };

  const download = async (keys: string[]) => {
    if (keys.length === 0) return setMsg({ tone: "danger", text: "Chọn ít nhất 1 cột để xuất." });
    setBusy(true);
    setMsg(null);
    store.set(LAST_KEY, JSON.stringify(keys));
    const fd = new FormData();
    fd.set("cols", keys.join(","));
    if (scope === "selected" && selectedIds.length) fd.set("ids", selectedIds.join(","));
    const f: Record<string, string | undefined> = { q: filter.q || undefined, status: filter.status, df: filter.dateField, from: filter.from, to: filter.to, sort: filter.sort, dir: filter.dir };
    for (const [k, v] of Object.entries(f)) if (v) fd.set(k, v);
    try {
      const res = await fetch("/api/don-hang/xuat-excel", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.text()) || `Lỗi ${res.status}`);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Van-don.xlsx";
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const n = Number(res.headers.get("X-Row-Count") ?? 0);
      setMsg({ tone: "success", text: `Đã tải ${name} — ${n.toLocaleString("vi-VN")} đơn, ${keys.length} cột.${n >= 20_000 ? " (Giới hạn 20.000 đơn mỗi lần — thu hẹp bộ lọc nếu cần thêm.)" : ""}` });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof Error ? e.message : "Không tải được file." });
    } finally {
      setBusy(false);
    }
  };

  const mid = "h-8 w-10 p-0";
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Tải xuống Excel — chọn cột" className="max-w-4xl">
      <div className="grid gap-4">
        {/* Định dạng đã lưu */}
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">Định dạng đã lưu (lưu trên trình duyệt này)</span>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={preset} onChange={(e) => pick(e.target.value)} className="w-64" aria-label="Định dạng đã lưu">
              <option value="">— Chọn định dạng —</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.keys.length} cột)
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              disabled={!preset}
              onClick={() => {
                savePresets(upsertPreset(presets, preset, chosen));
                setMsg({ tone: "success", text: `Đã lưu định dạng “${preset}”.` });
              }}
            >
              Lưu
            </Button>
            {saveAs === null ? (
              <Button type="button" variant="outline" onClick={() => setSaveAs("")}>
                Lưu thành…
              </Button>
            ) : (
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = saveAs.trim();
                  if (!name || chosen.length === 0) return;
                  savePresets(upsertPreset(presets, name, chosen));
                  setPreset(name.slice(0, 60));
                  setSaveAs(null);
                  setMsg({ tone: "success", text: `Đã lưu định dạng “${name}”.` });
                }}
              >
                <Input autoFocus value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder="Tên định dạng, VD: Gửi kế toán" className="w-56" maxLength={60} />
                <Button type="submit" disabled={!saveAs.trim()}>
                  OK
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSaveAs(null)}>
                  Hủy
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="destructive"
              disabled={!preset}
              onClick={() => {
                savePresets(presets.filter((p) => p.name !== preset));
                setMsg({ tone: "success", text: `Đã xóa định dạng “${preset}”.` });
                setPreset("");
              }}
            >
              Xóa
            </Button>
          </div>
        </div>

        {/* 2 danh sách */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <ColumnList
            title="Cột chờ xuất"
            keys={pending}
            labels={labels}
            marked={markL}
            setMarked={setMarkL}
            onDouble={(k) => setChosen((c) => [...c, k])}
            empty="Đã chọn hết các cột."
          />
          <div className="flex flex-col gap-2">
            <Button type="button" className={mid} disabled={!markR.length} onClick={() => setChosen((c) => moveKeys(c, markR, -1))} title="Đưa cột đã đánh dấu lên" aria-label="Lên">
              <ArrowUp />
            </Button>
            <Button type="button" className={mid} disabled={!markR.length} onClick={() => setChosen((c) => moveKeys(c, markR, 1))} title="Đưa cột đã đánh dấu xuống" aria-label="Xuống">
              <ArrowDown />
            </Button>
            <div className="h-3" />
            <Button type="button" className={mid} disabled={!markL.length} onClick={() => (setChosen((c) => addKeys(c, markL, allKeys)), setMarkL([]))} title="Thêm cột đã đánh dấu" aria-label="Thêm">
              <ChevronRight />
            </Button>
            <Button type="button" className={mid} disabled={!pending.length} onClick={() => (setChosen((c) => addKeys(c, allKeys, allKeys)), setMarkL([]))} title="Thêm tất cả" aria-label="Thêm tất cả">
              <ChevronsRight />
            </Button>
            <Button type="button" className={mid} disabled={!chosen.length} onClick={() => (setChosen([]), setMarkR([]))} title="Bỏ tất cả" aria-label="Bỏ tất cả">
              <ChevronsLeft />
            </Button>
            <Button type="button" className={mid} disabled={!markR.length} onClick={() => (setChosen((c) => removeKeys(c, markR)), setMarkR([]))} title="Bỏ cột đã đánh dấu" aria-label="Bỏ">
              <ChevronLeft />
            </Button>
          </div>
          <ColumnList
            title="Cột xuất (theo thứ tự)"
            keys={chosen}
            labels={labels}
            marked={markR}
            setMarked={setMarkR}
            onDouble={(k) => (setChosen((c) => c.filter((x) => x !== k)), setMarkR((m) => m.filter((x) => x !== k)))}
            empty="Chưa có cột nào — chọn bên trái rồi bấm >."
          />
        </div>

        {/* Phạm vi */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" checked={scope === "filter"} onChange={() => setScope("filter")} className="accent-primary" />
            Tất cả đơn theo bộ lọc hiện tại ({total.toLocaleString("vi-VN")} đơn)
          </label>
          <label className={`flex items-center gap-2 ${selectedIds.length ? "" : "text-muted-foreground"}`}>
            <input type="radio" name="scope" disabled={!selectedIds.length} checked={scope === "selected"} onChange={() => setScope("selected")} className="accent-primary" />
            Chỉ các đơn đã chọn ({selectedIds.length.toLocaleString("vi-VN")})
          </label>
        </div>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => download(visible)}>
              Xuất cột đang hiển thị
            </Button>
            <span className="text-xs text-muted-foreground">Xuất ngay đúng các cột đang thấy trên bảng Vận đơn.</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={busy || chosen.length === 0} onClick={() => download(chosen)}>
              <Download /> {busy ? "Đang tạo file…" : `Xuất (${chosen.length} cột)`}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
