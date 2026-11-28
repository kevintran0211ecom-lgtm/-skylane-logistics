// =============================================================================
// CỔNG KHÁCH HÀNG (bản chạy thử) — cùng quy tắc với web thật: lib/portal/rules.ts (QR),
// engine giá, import mẫu SKL116, giá bán theo khách (SQ), cột Excel khách được thấy.
// Ghép vào app.js khi build (node demo/build.cjs).
// =============================================================================
const seedAccounts = () => [
  { id: "acc-1", email: "thanh@skl116.vn", customer: "SKL116", pw: QR.DEFAULT_PASSWORD, active: true, mustChange: true, lastLogin: null },
  { id: "acc-2", email: "nhat@minhnhat.vn", customer: "SKL170", pw: "Minhnhat@2026", active: true, mustChange: false, lastLogin: null },
];
const accs = () => (S.accounts ||= seedAccounts());
const portalAcc = () => (typeof S.me === "string" && S.me.startsWith("acc:") ? accs().find((a) => `acc:${a.id}` === S.me) || null : null);
const isPortal = () => S.me === "portal-login" || !!portalAcc() || !!ui.viewAs;
/** Phiên cổng: tài khoản khách, hoặc nhân viên đang "Xem như khách" (chỉ xem) */
function pS() {
  const a = portalAcc();
  if (a) return { code: a.customer, name: cust(a.customer)?.name || a.customer, email: a.email, acc: a, viewAs: null };
  if (ui.viewAs) return { code: ui.viewAs, name: cust(ui.viewAs)?.name || ui.viewAs, email: me().name, acc: null, viewAs: me().name };
  return null;
}
const P_VIEWS = {
  kh: ["Tổng quan", () => vPHome()],
  "kh-dat-don": ["Đặt đơn", () => vPOrder()],
  "kh-nhap-excel": ["Nhập đơn bằng Excel", () => vPImport()],
  "kh-van-don": ["Vận đơn", () => vPOrders()],
  "kh-tra-gia": ["Tra cứu giá", () => vPQuote()],
  "kh-cong-no": ["Công nợ & bảng kê", () => vPDebt()],
};
const P_TONE = { "Chờ xác nhận": "warn", "Đã hủy / từ chối": "bad", "Phát sinh": "muted", "Đã nhận kho": "info", "Đã xuất hàng": "warn", "Đã giao hàng": "ok", Hoàn: "bad" };

/** Chọn vai trò / tài khoản ở ô "Đăng nhập thử" (nội bộ & cổng khách) */
function roleOptions() {
  const staff = S.users.map((x) => `<option value="${x.id}" ${x.id === S.me && !ui.viewAs ? "selected" : ""}>${esc(x.name)} — ${P.ROLE_LABEL[x.role]}</option>`).join("");
  const kh = accs().map((a) => `<option value="acc:${a.id}" ${S.me === `acc:${a.id}` ? "selected" : ""}>${esc(a.email)} (${a.customer})</option>`).join("");
  return `<optgroup label="Nhân viên SkyLane">${staff}</optgroup><optgroup label="Cổng khách hàng"><option value="portal-login" ${S.me === "portal-login" ? "selected" : ""}>Màn đăng nhập cổng khách</option>${kh}</optgroup>`;
}
function switchRole(v) {
  S.me = v; ui.viewAs = null; ui.orders.sel.clear(); ui.rc = null; ui.st = ui.stNew = ui.ver = null; save();
  if (isPortal()) {
    if (!location.hash.startsWith("#kh")) location.hash = "kh";
    render();
    const a = portalAcc();
    toast(a ? `Đang đăng nhập cổng khách bằng ${a.email} (${a.customer}).` : "Màn đăng nhập cổng khách hàng — thử thanh@skl116.vn / 123456.");
  } else {
    if (location.hash.slice(1) !== current()) location.hash = current();
    render();
    toast(`Đang dùng vai trò ${P.ROLE_LABEL[me().role]} — ${me().name}.`);
  }
}

// ---- Khung trang cổng khách ----
function renderPortal() {
  const h = location.hash.slice(1);
  if (S.me === "portal-login" && !ui.viewAs) return ($("#app").innerHTML = pLoginScreen());
  const s = pS();
  if (s.acc && (s.acc.mustChange || h === "kh-doi-mat-khau")) return ($("#app").innerHTML = pPasswordScreen(s));
  const v = P_VIEWS[h] ? h : "kh";
  $("#app").innerHTML = pShell(v, P_VIEWS[v][1]());
  if (ui.lastView !== v) { window.scrollTo(0, 0); ui.lastView = v; }
}
const demoBar = () => `<div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style="background:var(--soft)"><span><b>Bản chạy thử</b> — cổng khách hàng (oms.skylane.vn) dùng chung dữ liệu với hệ thống nội bộ. Đổi tài khoản / vai trò:</span><span class="flex items-center gap-2"><select class="inp" style="width:auto" data-c="role" aria-label="Đăng nhập thử">${roleOptions()}</select><button class="btn o sm" data-a="reset">Đặt lại dữ liệu mẫu</button></span></div>`;
function pShell(view, content) {
  const s = pS();
  const nav = Object.entries(P_VIEWS).map(([k, [label]]) => `<a href="#${k}" class="${k === view ? "on" : ""}">${label}</a>`).join("");
  return `<div class="flex min-h-screen">
  <aside class="side sticky top-0 h-screen w-60 shrink-0 overflow-y-auto border-r line p-3" style="background:var(--card)">
    <a href="#kh" class="mb-2 flex items-center gap-2 px-1"><img src="${LOGO}" alt="SkyLane Logistics" width="38" height="36"><span class="leading-tight"><b class="block text-sm tracking-wide" style="color:var(--brand)">SKYLANE</b><span class="text-[11px] tracking-[.15em] muted">CỔNG KHÁCH HÀNG</span></span></a>
    <nav class="nav">${nav}</nav>
    <div class="mt-6 border-t line pt-3 text-sm"><b class="block truncate">${esc(s.code)} — ${esc(s.name)}</b><span class="block truncate text-xs muted">${esc(s.email)}</span>
      ${s.acc ? `<a href="#kh-doi-mat-khau" class="mt-2 block text-xs" style="color:var(--accent)">Đổi mật khẩu</a>` : ""}
      <button class="btn o sm mt-2 w-full" data-a="p-logout">${s.viewAs ? "Thoát chế độ xem" : "Đăng xuất"}</button></div>
  </aside>
  <main class="flex-1 p-4 md:p-6" style="max-width:1440px">${demoBar()}
    ${s.viewAs ? `<div class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" style="background:#fef3c7;color:#78350f;border:1px solid #fcd34d"><span>👁 ${esc(s.viewAs)} đang xem cổng với tư cách khách <b>${esc(s.code)}</b> — chỉ xem, không đặt / sửa đơn được.</span><button class="btn o sm" data-a="p-logout">Thoát chế độ xem</button></div>` : ""}
    <div class="md:hidden mb-3"><select class="inp" data-pc="p-nav">${Object.entries(P_VIEWS).map(([k, [l]]) => `<option value="${k}" ${k === view ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="fade">${content}</div></main></div>`;
}
const pCard = (inner) => `<div class="flex min-h-screen items-center justify-center p-4" style="background:var(--soft)"><div class="w-full max-w-sm"><div class="card p-8">${inner}</div><div class="mt-3">${demoBar()}</div></div></div>`;
function pLoginScreen() {
  return pCard(`<div class="mb-6 flex flex-col items-center gap-2 text-center"><img src="${LOGO}" alt="SkyLane Logistics" width="72" height="68"><h1 class="text-lg font-semibold">Cổng khách hàng SkyLane</h1><p class="text-sm muted">Đặt đơn, theo dõi vận đơn và công nợ</p></div>
    <form id="f-plogin" class="grid gap-3" onsubmit="return false"><div id="p-login-err"></div>
      <label class="f"><span>Email</span><input class="inp" name="email" type="email" autocomplete="username" value="thanh@skl116.vn"></label>
      <label class="f"><span>Mật khẩu</span><input class="inp" name="pw" type="password" autocomplete="current-password" placeholder="123456"></label>
      <button class="btn" data-a="p-login">Đăng nhập</button></form>
    <p class="mt-4 text-center text-xs muted">Chưa có tài khoản hoặc quên mật khẩu? Liên hệ nhân viên SkyLane phụ trách để được cấp lại.</p>
    <p class="mt-2 text-center text-xs muted">Thử: <b>thanh@skl116.vn</b> / <b>123456</b> (lần đầu — phải đổi mật khẩu) hoặc <b>nhat@minhnhat.vn</b> / <b>Minhnhat@2026</b>.</p>`);
}
function pPasswordScreen(s) {
  const first = s.acc.mustChange;
  return pCard(`<div class="mb-6 flex flex-col items-center gap-2 text-center"><img src="${LOGO}" alt="" width="56" height="53"><h1 class="text-lg font-semibold">${first ? "Đặt mật khẩu mới" : "Đổi mật khẩu"}</h1><p class="text-sm muted">${first ? "Đây là lần đăng nhập đầu tiên — vui lòng đổi mật khẩu mặc định để bảo vệ tài khoản." : `${esc(s.code)} · ${esc(s.email)}`}</p></div>
    <form id="f-ppw" class="grid gap-3" onsubmit="return false"><div id="p-pw-err"></div>
      <label class="f"><span>${first ? "Mật khẩu hiện tại (mặc định 123456)" : "Mật khẩu hiện tại"}</span><input class="inp" name="current" type="password" autocomplete="current-password"></label>
      <label class="f"><span>Mật khẩu mới</span><input class="inp" name="pw" type="password" autocomplete="new-password"><span class="text-xs muted">Tối thiểu 8 ký tự, không dùng 123456</span></label>
      <label class="f"><span>Nhập lại mật khẩu mới</span><input class="inp" name="confirm" type="password" autocomplete="new-password"></label>
      <button class="btn" data-a="p-pw">Lưu mật khẩu mới</button>${first ? "" : `<a href="#kh" class="text-center text-sm muted">← Quay lại</a>`}</form>`);
}

// ---- Dữ liệu theo khách ----
const pOrders = (code) => S.orders.filter((o) => o.customer === code);
const pDraftsOf = (code) => S.drafts.filter((d) => d.d.customerCode === code);
function pDebt(code) {
  const sts = S.statements.filter((s) => s.customer === code && s.status === "ACTIVE");
  const billed = sts.reduce((t, s) => t + Math.max(0, s.total - s.paid), 0);
  const un = pOrders(code).filter((o) => o.debt === "Chưa thanh toán");
  const unbilled = un.reduce((t, o) => t + Number(o.sell || 0), 0);
  return { billed, billedSts: sts.filter((s) => s.total - s.paid > 0).length, unbilled, unbilledN: un.length, total: billed + unbilled, sts, un };
}
/** Tuyến khách đặt được: có bảng giá bán hiệu lực hôm nay cho khách (riêng KH / nhóm / chung) */
const pRoutes = (code) => {
  const c = cust(code);
  return S.routes.filter((r) => r.active !== false && E.selectVersion(S.versions, { routeCode: r.code, kind: "SELL", date: today(), customerCode: code, priceGroupCode: c?.group }));
};

// ---- Tổng quan ----
function vPHome() {
  const s = pS(), os = pOrders(s.code), d = pDebt(s.code), m0 = `${today().slice(0, 7)}-01`;
  const month = os.filter((o) => pd(o) >= m0), pending = pDraftsOf(s.code).filter((x) => x.status === "CHO_XAC_NHAN").length;
  const stat = (label, value, sub, href) => `<a href="${href || "#kh"}" class="card block p-4"><p class="text-sm muted">${label}</p><p class="mt-1 text-2xl font-semibold">${value}</p><p class="mt-1 text-xs muted">${sub}</p></a>`;
  const recent = os.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8);
  return head(`Xin chào, ${s.name}`, `Mã khách hàng ${s.code}`, `<a class="btn o" href="#kh-nhap-excel">Nhập Excel</a><a class="btn" href="#kh-dat-don">+ Đặt đơn</a>`) + `
  <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    ${stat("Công nợ còn lại", `${money(d.total)} đ`, `Bảng kê còn nợ ${money(d.billed)} · chưa lên bảng kê ${money(d.unbilled)}`, "#kh-cong-no")}
    ${stat("Đơn chờ SkyLane xác nhận", pending, "Đơn bạn đã gửi, chưa được xác nhận", "#kh-van-don")}
    ${stat("Đơn tháng này", month.length, `${kg(month.reduce((t, o) => t + Number(o.billed), 0))} kg tính phí · ${money(month.reduce((t, o) => t + Number(o.sell), 0))} đ`)}
    ${stat("Tổng vận đơn", os.length, "Tất cả vận đơn đã xác nhận", "#kh-van-don")}</div>
  <div class="grid gap-4 lg:grid-cols-[260px_1fr]"><div class="card p-4"><p class="mb-2 font-medium">Vận đơn theo trạng thái</p>${STATUSES.map((st) => `<div class="flex items-center justify-between py-1">${badge(st, P_TONE[st])}<b>${os.filter((o) => o.status === st).length}</b></div>`).join("")}</div>
  <div><p class="mb-2 font-medium">Vận đơn gần đây</p><div class="card scroll"><table class="t"><thead><tr><th>Mã vận đơn</th><th>Tuyến</th><th>Điểm đến</th><th>Trạng thái</th><th>Ngày gửi</th><th class="num">Cân tính phí</th><th class="num">Thành tiền</th></tr></thead><tbody>
  ${recent.map((o) => `<tr><td><b>${esc(o.bill)}</b></td><td>${esc(o.route)}</td><td>${o.iso2}</td><td>${badge(o.status, P_TONE[o.status])}</td><td class="num">${V.viDate(pd(o))}</td><td class="num">${kg(o.billed)}</td><td class="num font-semibold">${money(o.sell)}</td></tr>`).join("") || `<tr><td colspan="7" class="py-6 text-center muted">Chưa có vận đơn — bấm “Đặt đơn”.</td></tr>`}
  </tbody></table></div></div></div>`;
}

// ---- Form đặt / sửa đơn (dùng chung trang Đặt đơn & cửa sổ sửa) ----
const PF = QR.PORTAL_FIELD_LABEL;
const preq = (f) => (QR.PORTAL_REQUIRED.includes(f) ? `${PF[f]} *` : PF[f]);
function pOrderFormHtml({ values = {}, packages = [], mode = "create", id = "", readOnly = false, routes }) {
  const dis = readOnly ? "disabled" : "";
  const inp = (f, extra = "") => `<label class="f"><span>${preq(f)}</span><input class="inp" name="${f}" value="${esc(values[f] || "")}" ${dis} ${extra}><span class="text-xs" style="color:#dc2626" data-err="${f}"></span></label>`;
  const opts = routes.map((r) => `<option value="${esc(r.code)}" ${r.code === values.routeCode ? "selected" : ""}>${esc(r.code)} (${r.service})</option>`).join("");
  return `<form id="f-por" class="grid gap-4" data-mode="${mode}" data-id="${id}" onsubmit="return false"><div id="p-por-err"></div>
    ${readOnly ? `<div class="card p-3 text-sm" style="background:#fef3c7;color:#78350f">${typeof readOnly === "string" ? esc(readOnly) : "Đơn này không sửa được nữa (SkyLane đã nhận kho hoặc chốt giá). Liên hệ SkyLane nếu cần điều chỉnh."}</div>` : ""}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">${inp("billCode", mode === "order" ? 'readonly style="background:var(--soft)"' : 'placeholder="Mã vận đơn của bạn"')}${inp("trackingNumber")}
      <label class="f"><span>${preq("routeCode")}</span><select class="inp" name="routeCode" ${dis}><option value="">— Chọn tuyến —</option>${values.routeCode && !routes.some((r) => r.code === values.routeCode) ? `<option selected>${esc(values.routeCode)}</option>` : ""}${opts}</select><span class="text-xs" style="color:#dc2626" data-err="routeCode"></span></label>
      ${inp("destinationIso2", 'maxlength="2" placeholder="US" class="inp uppercase"')}</div>
    <fieldset class="card grid gap-2 p-3" ${dis}><legend class="px-1 text-sm font-medium">${PF.packages} *</legend>${pkHead}<div id="pks" class="grid gap-2">${(packages.length ? packages : [{}]).map(pkRow).join("")}</div>${readOnly ? "" : `<div><button type="button" class="btn o sm" data-a="pk-add">+ Thêm kiện</button></div>`}<span class="text-xs" style="color:#dc2626" data-err="packages"></span></fieldset>
    <fieldset class="grid gap-3 sm:grid-cols-3"><legend class="mb-1 text-sm font-semibold">Người nhận</legend>${inp("receiverName")}${inp("receiverPhone", 'inputmode="tel"')}${inp("receiverEmail", 'type="email"')}<div class="sm:col-span-3">${inp("receiverAddress")}</div>${inp("receiverCity")}${inp("receiverState")}${inp("receiverPostalCode")}</fieldset>
    <fieldset class="grid gap-3 sm:grid-cols-4"><legend class="mb-1 text-sm font-semibold">Hàng hóa & khai báo</legend>${inp("goodsDescription")}${inp("goodsNameEn")}${inp("hsCode")}${inp("declaredValueUsd", 'inputmode="decimal" placeholder="VD: 25"')}</fieldset>
    <label class="f"><span>${PF.note}</span><textarea class="inp" name="note" rows="2" ${dis}>${esc(values.note || "")}</textarea></label>
    <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-xs muted">* bắt buộc. Thành tiền chính thức theo cân tại kho SkyLane sau khi xác nhận.</p>
    <span class="flex gap-2">${mode !== "create" ? `<button type="button" class="btn o" data-a="close">${readOnly ? "Đóng" : "Hủy"}</button>` : ""}${readOnly ? "" : `<button type="button" class="btn" data-a="p-save">${mode === "create" ? "Gửi đơn cho SkyLane" : "Lưu thay đổi"}</button>`}</span></div></form>`;
}
function vPOrder() {
  const s = pS(), routes = pRoutes(s.code);
  return head("Đặt đơn", "Đơn gửi đi ở trạng thái “Chờ xác nhận” cho tới khi SkyLane kiểm tra và xác nhận. Bạn sửa được đơn khi còn chờ xác nhận hoặc ở trạng thái Phát sinh.") +
    (ui.pDone ? `<div class="card mb-3 p-3 text-sm" style="background:#ecfdf5;color:#065f46">${esc(ui.pDone)}</div>` : "") +
    `<div class="card p-4 md:p-6">${pOrderFormHtml({ routes, readOnly: s.viewAs ? "Bạn đang xem cổng với tư cách khách hàng — không gửi đơn được." : false, values: { destinationIso2: "US" } })}</div>
    <p class="mt-3 text-sm muted">Nhiều đơn cùng lúc? <a href="#kh-nhap-excel" style="color:var(--accent)">Nhập bằng file Excel</a>.</p>`;
}
function pReadForm() {
  const f = $("#f-por"), form = Object.fromEntries([...new FormData(f).entries()]);
  let pk;
  try { pk = readPkgs(f); } catch (e) { return { error: e.message }; }
  form.packages = JSON.stringify(pk.map((p) => ({ lengthCm: p.l, widthCm: p.w, heightCm: p.h, actualWeight: p.kg })));
  return { form, mode: f.dataset.mode, id: Number(f.dataset.id) };
}
function pShowErrors(r) {
  $$("#f-por [data-err]").forEach((x) => (x.textContent = ""));
  $$("#f-por .inp").forEach((x) => (x.style.borderColor = ""));
  for (const [k, m] of Object.entries(r.fieldErrors || {})) {
    const e = $(`#f-por [data-err="${k}"]`); if (e) e.textContent = m;
    const i = $(`#f-por [name="${k}"]`); if (i) i.style.borderColor = "#dc2626";
  }
  $("#p-por-err").innerHTML = `<div class="card p-3 text-sm" style="color:#dc2626">${esc(r.error)}</div>`;
}
function pSave() {
  const s = pS();
  if (s.viewAs) return toast("Đang xem với tư cách khách — chỉ xem.", "warn");
  const read = pReadForm();
  if (read.error) return pShowErrors({ error: read.error, fieldErrors: { packages: read.error } });
  const r = QR.parsePortalOrder(read.form);
  if (!r.ok) return pShowErrors(r);
  const d = r.data;
  if (!S.routes.some((x) => x.code === d.routeCode)) return pShowErrors({ error: "Tuyến không còn hoạt động.", fieldErrors: { routeCode: "Chọn tuyến khác" } });
  const key = `${s.code}|${d.billCode}`;
  if (read.mode === "create") {
    if (!stageDrafts([QR.toDraftData(s.code, d)], "PORTAL", `Cổng KH · ${s.email}`)) return pShowErrors({ error: `Mã vận đơn ${d.billCode} đã có trong hệ thống — vui lòng dùng mã khác.`, fieldErrors: { billCode: "Mã vận đơn đã tồn tại" } });
    ui.pDone = `Đã gửi đơn ${d.billCode} — SkyLane sẽ xác nhận và báo giá chính thức sau khi cân tại kho.`;
    save(); render(); window.scrollTo({ top: 0, behavior: "smooth" }); toast(ui.pDone);
    return;
  }
  if (read.mode === "draft") {
    const dr = S.drafts.find((x) => x.id === read.id && x.d.customerCode === s.code);
    if (!dr || dr.status !== "CHO_XAC_NHAN") return pShowErrors({ error: "Đơn đã được SkyLane xử lý — không sửa được nữa." });
    if (key !== dr.d.orderKey && usedKeys().has(key)) return pShowErrors({ error: `Mã vận đơn ${d.billCode} đã có trong hệ thống.`, fieldErrors: { billCode: "Mã vận đơn đã tồn tại" } });
    dr.d = QR.toDraftData(s.code, d);
  } else {
    const o = S.orders.find((x) => x.id === read.id && x.customer === s.code);
    if (!o || !QR.canCustomerEditOrder({ status: o.status, priceLocked: !!o.locked })) return pShowErrors({ error: "Vận đơn đã được SkyLane nhận kho / chốt giá — liên hệ SkyLane nếu cần sửa." });
    Object.assign(o, {
      tracking: d.trackingNumber || "", route: d.routeCode, iso2: d.destinationIso2, receiver: d.receiverName || "", rPhone: d.receiverPhone || "", rEmail: d.receiverEmail || "", rAddress: d.receiverAddress || "",
      rCity: d.receiverCity || "", rState: d.receiverState || "", rPostal: d.receiverPostalCode || "", goodsVi: d.goodsDescription || "", goodsEn: d.goodsNameEn || "", hs: d.hsCode || "", declared: d.declaredValueUsd || "", note: d.note || "",
      packages: d.packages.map((p) => ({ l: p.lengthCm, w: p.widthCm, h: p.heightCm, kg: p.actualWeight })),
    });
    o.rowVersion = (o.rowVersion || 1) + 1;
    reprice(S, o);
  }
  save(); closeDialog(); render(); toast(read.mode === "order" ? `Đã lưu vận đơn ${d.billCode} và tính lại thành tiền.` : `Đã lưu đơn ${d.billCode}.`);
}

// ---- Nhập Excel ----
function vPImport() {
  const s = pS(), a = ui.pImpRes;
  return head("Nhập nhiều đơn bằng Excel", "Tải file mẫu, điền mỗi dòng 1 kiện (đơn nhiều kiện: lặp lại mã vận đơn), rồi tải lên để kiểm tra và gửi.") + `
  <div class="card mb-4 flex flex-wrap items-start justify-between gap-3 p-4 text-sm"><div class="muted" style="max-width:760px"><p class="mb-1 font-medium" style="color:var(--ink)">Cách dùng</p><ol class="list-decimal pl-5"><li>Tải file mẫu (ghi sẵn mã khách ${esc(s.code)} và danh sách tuyến bạn được báo giá).</li><li>Điền tab <b>DON</b>: Mã vận đơn, Tuyến, Điểm đến, Người nhận, SĐT, Địa chỉ, Thành phố, Mã bưu chính, Tên hàng, Giá trị khai báo, Số kiện, Trọng lượng, Dài, Rộng, Cao.</li><li>Bấm “Kiểm tra dữ liệu”, rồi “Gửi đơn cho SkyLane”. Đơn vào trạng thái Chờ xác nhận.</li></ol></div><button class="btn o" data-a="p-tpl">⬇ Tải file mẫu</button></div>
  <div class="card grid gap-3 p-4 md:p-6">
    <label class="f" style="max-width:420px"><span>File Excel (.xlsx) hoặc CSV</span><input type="file" class="inp" accept=".xlsx,.xls,.csv" data-pc="p-imp-file" style="padding-top:6px"></label>
    <div class="flex flex-wrap items-center gap-2 text-sm"><span class="muted">hoặc dán dữ liệu từ Excel vào ô dưới —</span><button class="btn o sm" data-a="p-imp-sample">Dán dữ liệu mẫu</button></div>
    <textarea class="inp" id="p-imp-text" rows="6" placeholder="Dán vùng dữ liệu tab DON (kèm dòng tiêu đề)…" style="font-family:ui-monospace,monospace;font-size:12px">${esc(ui.pImpText || "")}</textarea>
    <div class="flex gap-2"><button class="btn o" data-a="p-imp-check">Kiểm tra dữ liệu</button><button class="btn" data-a="p-imp-commit" ${a && a.valid.length && !s.viewAs ? "" : "disabled"}>${a ? `Gửi ${a.valid.length} đơn cho SkyLane` : "Gửi đơn cho SkyLane"}</button></div>
    ${s.viewAs ? `<p class="text-sm" style="color:#92400e">Đang xem với tư cách khách — chỉ kiểm tra được, không gửi đơn được.</p>` : ""}
    ${!a ? "" : `<div class="grid gap-2 text-sm"><p>${badge(`${a.valid.length} đơn hợp lệ · ${a.valid.reduce((t, d) => t + d.packages.length, 0)} kiện`, "ok")} ${a.dup.length ? badge(`${a.dup.length} mã đã có`, "warn") : ""} ${a.errors.length ? badge(`${a.errors.length} dòng lỗi`, "bad") : ""}</p>
      ${a.errors.length ? `<details open><summary class="cursor-pointer font-medium" style="color:#dc2626">Dòng lỗi (sẽ không được gửi — sửa file rồi kiểm tra lại)</summary><ul class="mt-1 list-disc pl-5 text-xs">${a.errors.map((e) => `<li>${e.row > 0 ? `Dòng ${e.row}` : ""}${e.billCode ? ` · ${esc(e.billCode)}` : ""}: ${esc(e.message)}</li>`).join("")}</ul></details>` : ""}
      ${a.dup.length ? `<p class="text-xs muted">Mã trùng (bỏ qua): ${a.dup.map((k) => esc(k.split("|")[1])).join(", ")}</p>` : ""}
      ${a.valid.length ? `<div class="card scroll"><table class="t"><thead><tr><th>Mã vận đơn</th><th>Tuyến</th><th>Điểm đến</th><th class="num">Số kiện</th><th class="num">Cân nặng (kg)</th></tr></thead><tbody>${a.valid.map((d) => `<tr><td><b>${esc(d.billCode)}</b></td><td>${esc(d.routeCode)}</td><td>${d.destinationIso2}</td><td class="num">${d.packages.length}</td><td class="num">${kg(d.packages.reduce((t, p) => t + Number(p.actualWeight), 0))}</td></tr>`).join("")}</tbody></table></div>` : ""}</div>`}
  </div>`;
}
function pAnalyze() {
  const s = pS(), rows = ui.pImpRows || parseTsv($("#p-imp-text").value);
  const res = IP.parseOrderSheet(rows, { defaultCustomerCode: s.code });
  const keys = usedKeys(), errors = [...res.errors], valid = [], dup = [];
  for (const d0 of res.drafts) {
    if (d0.customerCode !== s.code) { errors.push({ row: d0.rows[0], billCode: d0.billCode, message: `mã khách ${d0.customerCode} khác tài khoản đang đăng nhập (${s.code})` }); continue; }
    const d = { ...d0, assignedRouteCode: null }, bad = [];
    if (!S.routes.some((r) => r.code === d.routeCode)) bad.push(`tuyến ${d.routeCode} chưa có`);
    const miss = QR.portalMissingFields(d);
    if (miss.length) bad.push(`thiếu ${miss.join(", ")}`);
    if (bad.length) errors.push({ row: d.rows[0], billCode: d.billCode, message: bad.join("; ") });
    else if (keys.has(d.orderKey)) dup.push(d.orderKey);
    else valid.push(d);
  }
  return { valid, dup, errors };
}
function pReadImportFile(file) {
  if (!file) return;
  if (typeof XLSX === "undefined") return toast("Không tải được thư viện đọc Excel — hãy dán dữ liệu thay thế.", "bad");
  const r = new FileReader();
  r.onload = () => {
    try {
      const wb = XLSX.read(r.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames.find((n) => n.trim().toUpperCase() === "DON") || wb.SheetNames[0]];
      ui.pImpRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      ui.pImpText = ui.pImpRows.map((row) => row.map((v) => (v === null ? "" : String(v).replace(/\t|\n/g, " "))).join("\t")).join("\n");
      ui.pImpRowsText = ui.pImpText;
      ui.pImpRes = pAnalyze(); render();
    } catch { toast("Không đọc được file Excel.", "bad"); }
  };
  r.readAsArrayBuffer(file);
}
async function pTemplate() {
  if (!window.ExcelJS) return toast("Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.", "bad");
  const s = pS(), wb = new ExcelJS.Workbook();
  OT.layoutOrderTemplate(wb, { customerCode: s.code, customerName: s.name, routes: pRoutes(s.code).map((r) => r.code) });
  const name = OT.orderTemplateFilename(s.code, s.name);
  if (await saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name)) toast(`Đã tải ${name}.`);
}

// ---- Vận đơn ----
const P_TABS = [["", "Tất cả vận đơn"], ...QR.PORTAL_TABS.map((t) => [t, QR.PORTAL_TAB_LABEL[t]])];
function pRows() {
  const s = pS(), f = (ui.pq ||= { tab: "", q: "", from: "", to: "", page: 1 }), m = SL.searchMode(f.q);
  const hit = (bill, tracking) => m.kind === "none" || (m.kind === "codes" ? m.codes.includes(bill) || m.codes.includes((tracking || "").toUpperCase()) : `${bill} ${tracking || ""}`.toLowerCase().includes(m.term.toLowerCase()));
  const inDate = (d) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
  const orders = pOrders(s.code).filter((o) => hit(o.bill, o.tracking) && inDate(pd(o)));
  const drafts = pDraftsOf(s.code).filter((d) => d.status !== "DA_XAC_NHAN" && hit(d.d.billCode, d.d.trackingNumber) && inDate(dayVi(d.at)));
  const counts = { "": orders.length };
  for (const o of orders) counts[o.status] = (counts[o.status] || 0) + 1;
  for (const d of drafts) counts[d.status] = (counts[d.status] || 0) + 1;
  const isDraft = f.tab === "CHO_XAC_NHAN" || f.tab === "DA_LOAI";
  const list = isDraft
    ? drafts.filter((d) => d.status === f.tab).sort((a, b) => (a.at < b.at ? 1 : -1))
    : orders.filter((o) => !f.tab || o.status === f.tab).sort((a, b) => (pd(a) < pd(b) ? 1 : pd(a) > pd(b) ? -1 : b.id - a.id));
  return { f, counts, isDraft, list };
}
function vPOrders() {
  const s = pS(), { f, counts, isDraft, list } = pRows(), PAGE = 50, pages = Math.max(1, Math.ceil(list.length / PAGE));
  f.page = Math.min(f.page, pages);
  const page = list.slice((f.page - 1) * PAGE, f.page * PAGE);
  const sum = isDraft ? null : { n: list.length, pcs: list.reduce((t, o) => t + o.packages.length, 0), billed: list.reduce((t, o) => t + Number(o.billed), 0), amt: list.reduce((t, o) => t + Number(o.sell), 0) };
  const editable = (o) => !s.viewAs && QR.canCustomerEditOrder({ status: o.status, priceLocked: !!o.locked });
  const rowsHtml = isDraft
    ? page.map((x) => { const d = x.d, w = d.packages.reduce((t, p) => t + Number(p.actualWeight || 0), 0), st = x.status === "CHO_XAC_NHAN" ? "Chờ xác nhận" : "Đã hủy / từ chối"; return `<tr><td><a href="#kh-van-don" data-a="p-open" data-k="draft" data-id="${x.id}" style="color:var(--accent);font-weight:600">${esc(d.billCode)}</a>${d.trackingNumber ? `<div class="text-xs muted">${esc(d.trackingNumber)}</div>` : ""}</td><td>${esc(d.routeCode)}</td><td>${d.destinationIso2}</td><td>${badge(st, P_TONE[st])}</td><td class="num">${dtVi(x.at)}</td><td class="truncate" style="max-width:160px">${esc(d.receiverName || "–")}</td><td class="num">${d.packages.length}</td><td class="num">${kg(w)}</td><td class="text-xs muted">${esc(x.reason || (x.status === "CHO_XAC_NHAN" && !s.viewAs ? "Sửa được" : ""))}</td></tr>`; }).join("")
    : page.map((o) => `<tr><td><a href="#kh-van-don" data-a="p-open" data-k="order" data-id="${o.id}" style="color:var(--accent);font-weight:600">${esc(o.bill)}</a>${o.tracking ? `<div class="text-xs muted">${esc(o.tracking)}</div>` : ""}</td><td>${esc(o.route)}</td><td>${o.iso2}</td><td>${badge(o.status, P_TONE[o.status])}</td><td class="num">${V.viDate(pd(o))}</td><td class="truncate" style="max-width:160px">${esc(o.receiver || "–")}</td><td class="num">${o.packages.length}</td><td class="num">${kg(o.actual)}</td><td class="num">${kg(o.vol)}</td><td class="num font-semibold">${kg(o.billed)}</td><td class="num font-semibold">${money(o.sell)}</td><td class="text-xs">${esc(o.debt)}</td><td>${editable(o) ? `<button class="btn g sm" data-a="p-open" data-k="order" data-id="${o.id}" title="Sửa đơn">✎</button>` : ""}</td></tr>`).join("");
  return head("Vận đơn", "Theo dõi đơn đã gửi: chờ xác nhận, trạng thái vận chuyển, cân nặng và thành tiền. Sửa được đơn khi còn Chờ xác nhận hoặc Phát sinh.") + `
  <div class="mb-3 flex flex-wrap gap-1 border-b line">${P_TABS.map(([t, l]) => `<button class="tab-btn px-3 py-1.5 text-sm" style="border-bottom:2px solid ${f.tab === t ? "var(--accent)" : "transparent"};color:${f.tab === t ? "var(--accent)" : "var(--muted)"};font-weight:${f.tab === t ? 600 : 400}" data-a="p-tab" data-v="${t}">${l} <span class="text-xs">(${counts[t] || 0})</span></button>`).join("")}</div>
  <div class="mb-3 flex flex-wrap items-end gap-2"><label class="f"><span>Tìm mã vận đơn / tracking (nhiều mã: mỗi dòng 1 mã)</span><textarea class="inp" id="p-q" rows="1" style="width:280px;min-height:36px">${esc(f.q)}</textarea></label>
    <label class="f"><span>${isDraft ? "Gửi đơn từ" : "Ngày gửi từ"}</span><input class="inp" type="date" id="p-from" value="${f.from}" style="width:160px"></label><label class="f"><span>đến</span><input class="inp" type="date" id="p-to" value="${f.to}" style="width:160px"></label>
    <button class="btn o" data-a="p-filter">Lọc</button>${f.q || f.from || f.to ? `<button class="btn g" data-a="p-unfilter">✕ Bỏ lọc</button>` : ""}<span class="flex-1"></span>${isDraft ? "" : `<button class="btn o" data-a="p-export">⬇ Tải Excel</button>`}</div>
  <div class="card scroll"><table class="t"><thead><tr><th>Mã vận đơn</th><th>Tuyến</th><th>Điểm đến</th><th>Trạng thái</th><th>${isDraft ? "Ngày gửi đơn" : "Ngày gửi hàng"}</th><th>Người nhận</th><th class="num">Số kiện</th><th class="num">Cân thực</th>${isDraft ? `<th>${f.tab === "DA_LOAI" ? "Lý do" : ""}</th>` : `<th class="num">Quy đổi</th><th class="num">Tính phí</th><th class="num">Thành tiền</th><th>Công nợ</th><th></th>`}</tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="13" class="py-8 text-center muted">${isDraft ? "Không có đơn." : "Chưa có vận đơn phù hợp."}</td></tr>`}</tbody></table></div>
  ${sum && sum.n ? `<div class="card mt-2 p-3 text-sm" style="background:var(--soft)">Tổng ${sum.n} đơn · ${sum.pcs} kiện · ${kg(sum.billed)} kg tính phí · <b>${money(sum.amt)} đ</b></div>` : ""}
  <div class="mt-3 flex items-center justify-end gap-2 text-sm muted"><button class="btn o sm" data-a="p-page" data-v="${f.page - 1}" ${f.page <= 1 ? "disabled" : ""}>‹</button>Trang ${f.page}/${pages}<button class="btn o sm" data-a="p-page" data-v="${f.page + 1}" ${f.page >= pages ? "disabled" : ""}>›</button></div>`;
}
function pOpen(kind, id) {
  const s = pS(), routes = pRoutes(s.code);
  if (kind === "draft") {
    const x = S.drafts.find((d) => d.id === id && d.d.customerCode === s.code); if (!x) return;
    const ok = x.status === "CHO_XAC_NHAN" && !s.viewAs, d = x.d;
    const values = QR.portalFormValues({ ...d, packages: [] }).values;
    openDialog(`${ok ? "Sửa" : "Chi tiết"} đơn ${d.billCode} — ${x.status === "CHO_XAC_NHAN" ? "Chờ xác nhận" : "Đã hủy / từ chối"}`,
      pOrderFormHtml({ values, packages: d.packages.map((p) => ({ l: p.lengthCm, w: p.widthCm, h: p.heightCm, kg: p.actualWeight })), mode: "draft", id, readOnly: ok ? false : s.viewAs ? "Bạn đang xem cổng với tư cách khách hàng — chỉ xem." : "Đơn đã được SkyLane xử lý — không sửa được nữa.", routes }) +
      (ok ? `<div class="mt-3 border-t line pt-3"><button class="btn sm" style="background:#dc2626" data-a="p-cancel" data-id="${id}">Hủy đơn này</button></div>` : ""), true);
  } else {
    const o = S.orders.find((x) => x.id === id && x.customer === s.code); if (!o) return;
    const ok = !s.viewAs && QR.canCustomerEditOrder({ status: o.status, priceLocked: !!o.locked });
    const values = QR.portalFormValues({ billCode: o.bill, trackingNumber: o.tracking, routeCode: o.route, destinationIso2: o.iso2, receiverName: o.receiver, receiverPhone: o.rPhone, receiverEmail: o.rEmail, receiverAddress: o.rAddress, receiverCity: o.rCity, receiverState: o.rState, receiverPostalCode: o.rPostal, goodsDescription: o.goodsVi, goodsNameEn: o.goodsEn, hsCode: o.hs, declaredValueUsd: o.declared, note: o.note, packages: [] }).values;
    openDialog(`${ok ? "Sửa" : "Chi tiết"} vận đơn ${o.bill} — ${o.status}`, `<p class="mb-3 text-sm muted">Cân tính phí <b style="color:var(--ink)">${kg(o.billed)} kg</b> · Thành tiền <b style="color:var(--ink)">${money(o.sell)} đ</b>${ok ? " · lưu sẽ tính lại thành tiền theo kích thước / tuyến mới" : ""}</p>` +
      pOrderFormHtml({ values, packages: o.packages, mode: "order", id, readOnly: ok ? false : s.viewAs ? "Bạn đang xem cổng với tư cách khách hàng — chỉ xem." : true, routes }), true);
  }
}
async function pExport() {
  if (!window.ExcelJS) return toast("Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.", "bad");
  const s = pS(), { list } = pRows(), wb = new ExcelJS.Workbook();
  OX.fillOrdersSheet(wb, list.map(toExportOrder), OX.resolveColumns(QR.PORTAL_EXPORT_COLUMNS, true));
  const name = OX.exportFileName().replace("Van-don-SkyLane", `Van-don-${s.code}`);
  if (await saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name)) toast(`Đã tải ${name} — ${list.length} đơn.`);
}

// ---- Tra cứu giá (giá bán của chính khách, chỉ cân tính phí & thành tiền) ----
function vPQuote() {
  const s = pS(), q = ui.quote, c = cust(s.code);
  let res = null;
  if (q.ran) {
    const { input, error } = QI.parseQuoteInput({ to: q.to, kg: q.kg, cbm: q.cbm, dv: q.dv, p: q.rows.filter(qpFilled).map(QI.encodePackageRow) }, today());
    if (error || !input) res = { error: error || "Nhập điểm đến và trọng lượng." };
    else {
      const g = S.groups.find((x) => x.code === c?.group);
      const routes = S.routes.filter((r) => !input.serviceType || r.service === input.serviceType).map((r) => ({ routeCode: r.code, supplierCode: null }));
      res = { input, ...SQ.quoteSellRoutes(catalogOf(S), { customerCode: s.code, priceGroupCode: c?.group || null, groupAdjustPct: g?.adjust ?? null, priceAdjustPct: c?.adjust || "0" }, routes, input) };
    }
  }
  const i = res && !res.error ? res.input : null;
  return head("Tra cứu giá", "Giá áp dụng cho tài khoản của bạn hôm nay, theo điểm đến, cân nặng và kích thước. Thành tiền chính thức theo cân tại kho SkyLane.") + quoteFormHtml(false, true) +
    (!res ? "" : res.error ? `<div class="card p-3" style="color:#dc2626">${esc(res.error)}</div>` : `<p class="mb-2 text-sm"><b>${res.rows.length} tuyến</b> <span class="muted">→ ${i.iso2} · ${i.pieces} kiện · ${kg(i.totalActual)} kg${i.totalCbm ? ` · ${Number(i.totalCbm).toLocaleString("vi-VN", { maximumFractionDigits: 4 })} m³` : ""} · giá ngày ${V.viDate(i.date)}</span></p>
    <div class="card scroll"><table class="t"><thead><tr><th>#</th><th>Tuyến</th><th>Dịch vụ</th><th class="num">Cân tính phí</th><th class="num" style="background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--brand)">Thành tiền</th></tr></thead><tbody>
    ${res.rows.map((x, k) => `<tr ${k === 0 ? 'style="background:color-mix(in srgb,#10b981 10%,transparent)"' : ""}><td class="muted">${k + 1}</td><td><b>${esc(x.routeCode)}</b></td><td>${badge(x.serviceType, "info")}</td><td class="num"><b>${kg(x.chargeableWeight)} kg</b>${Number(x.totalVolumetric) ? `<div class="text-xs muted">quy đổi ${kg(x.totalVolumetric)}</div>` : ""}</td><td class="num text-base font-semibold" style="color:var(--brand)">${money(x.sellAmount)} đ ${k === 0 ? badge("Rẻ nhất", "ok") : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="py-6 text-center muted">Chưa có tuyến nào được báo giá tới ${i.iso2} cho mức cân này — vui lòng liên hệ SkyLane.</td></tr>`}
    </tbody></table></div>`);
}

// ---- Công nợ & bảng kê ----
function vPDebt() {
  const s = pS(), d = pDebt(s.code);
  const card = (l, v, sub, strong) => `<div class="card p-4"><p class="text-sm muted">${l}</p><p class="mt-1 text-2xl font-semibold" style="${strong ? "color:var(--brand)" : ""}">${money(v)} đ</p><p class="mt-1 text-xs muted">${sub}</p></div>`;
  const sts = d.sts.slice().sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
  return head("Công nợ & bảng kê", "Bảng kê SkyLane đã chốt và các vận đơn chưa lên bảng kê. Chuyển khoản theo QR trên file bảng kê.") + `
  <div class="mb-6 grid gap-3 sm:grid-cols-3">${card("Tổng công nợ còn lại", d.total, "Bảng kê còn nợ + đơn chưa lên bảng kê", true)}${card("Bảng kê còn nợ", d.billed, `${d.billedSts} bảng kê chưa thanh toán đủ`)}${card("Chưa lên bảng kê", d.unbilled, `${d.unbilledN} vận đơn — sẽ được tổng hợp vào bảng kê kỳ tới`)}</div>
  <h2 class="mb-2 font-semibold">Bảng kê đã chốt</h2><div class="card scroll mb-6"><table class="t"><thead><tr><th>Mã bảng kê</th><th>Tên</th><th>Ngày lập</th><th class="num">Số đơn</th><th class="num">Tổng tiền</th><th class="num">Đã thanh toán</th><th class="num">Còn nợ</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${sts.map((x) => `<tr><td><b>${esc(x.no)}</b></td><td class="truncate" style="max-width:240px">${esc(x.name)}</td><td class="num">${V.viDate(x.issuedAt.slice(0, 10))}</td><td class="num">${x.items.length}</td><td class="num">${money(x.total)}</td><td class="num">${money(x.paid)}</td><td class="num font-semibold" style="color:${x.total - x.paid > 0 ? "#dc2626" : "inherit"}">${money(x.total - x.paid)}</td><td>${badge(x.debt === "xuất bảng kê" ? "Chưa thanh toán" : x.debt, x.debt === "Đã thanh toán" ? "ok" : x.debt === "Thanh toán 1 phần" ? "warn" : "info")}</td><td><button class="btn g sm" data-a="p-st-dl" data-id="${x.id}">⬇ .xlsx</button></td></tr>`).join("") || `<tr><td colspan="9" class="py-6 text-center muted">Chưa có bảng kê.</td></tr>`}
  </tbody></table></div>
  <h2 class="mb-2 font-semibold">Vận đơn chưa lên bảng kê <span class="text-sm font-normal muted">(${d.un.length})</span></h2><div class="card scroll"><table class="t"><thead><tr><th>Mã vận đơn</th><th>Ngày gửi</th><th>Tuyến</th><th>Điểm đến</th><th>Trạng thái</th><th class="num">Số kiện</th><th class="num">Cân tính phí</th><th class="num">Thành tiền</th></tr></thead><tbody>
  ${d.un.map((o) => `<tr><td><b>${esc(o.bill)}</b></td><td class="num">${V.viDate(pd(o))}</td><td>${esc(o.route)}</td><td>${o.iso2}</td><td>${badge(o.status, P_TONE[o.status])}</td><td class="num">${o.packages.length}</td><td class="num">${kg(o.billed)}</td><td class="num font-semibold">${money(o.sell)}</td></tr>`).join("") || `<tr><td colspan="8" class="py-6 text-center muted">Không có đơn chưa lên bảng kê.</td></tr>`}
  ${d.un.length ? `<tr style="background:var(--soft)"><td colspan="7"><b>Tổng</b></td><td class="num"><b>${money(d.unbilled)}</b></td></tr>` : ""}</tbody></table></div>`;
}

// ---- Nội bộ: trang Cổng khách hàng (tài khoản + Xem như khách) ----
function vPortalAdmin() {
  const manage = can("portal.accounts"), list = scopedCustomers();
  return head("Cổng khách hàng", "Cấp tài khoản cho khách đăng nhập cổng (tên đăng nhập = email khách, mật khẩu mặc định 123456 — khách phải đổi ở lần đăng nhập đầu). “Xem như khách” mở cổng đúng như khách thấy (chỉ xem).") + `
  <p class="mb-3 text-sm muted">Link đăng nhập cho khách: <b style="color:var(--ink)">https://oms.skylane.vn/portal/dang-nhap</b> (tên miền xử lý sau)</p>
  <div class="card scroll"><table class="t"><thead><tr><th>Mã KH</th><th>Tên khách hàng</th><th class="num">Tài khoản</th><th>Đăng nhập gần nhất</th><th></th></tr></thead><tbody>
  ${list.map((c) => { const a = accs().filter((x) => x.customer === c.code), last = a.map((x) => x.lastLogin).filter(Boolean).sort().pop(); return `<tr><td><b>${c.code}</b></td><td>${esc(c.name)}</td><td class="num">${a.length ? `${a.filter((x) => x.active).length}/${a.length}` : '<span class="muted">Chưa có</span>'}</td><td class="text-sm muted">${a.length ? (last ? dtVi(last) : "Chưa đăng nhập") : "–"}</td><td><span class="flex justify-end gap-1">${manage ? `<button class="btn o sm" data-a="pa-acc" data-id="${c.code}">Tài khoản</button>` : ""}<button class="btn g sm" data-a="pa-view" data-id="${c.code}">👁 Xem như khách</button></span></td></tr>`; }).join("")}
  </tbody></table></div>`;
}
function paDialog(code, msg) {
  const c = cust(code), list = accs().filter((a) => a.customer === code).sort((a, b) => a.email.localeCompare(b.email));
  openDialog(`Tài khoản cổng khách — ${code} · ${c.name}`, `<div class="grid gap-4" id="f-pa" data-code="${code}">${msg ? `<div class="card p-3 text-sm" style="${msg[0] === "ok" ? "background:#ecfdf5;color:#065f46" : "color:#dc2626"}">${esc(msg[1])}</div>` : ""}
    <div class="flex flex-wrap items-end gap-2"><label class="f flex-1" style="min-width:260px"><span>Email khách cung cấp (= tên đăng nhập)</span><input class="inp" id="pa-email" type="email" placeholder="khachhang@congty.com"></label><button class="btn" data-a="pa-create">+ Tạo tài khoản</button></div>
    <p class="-mt-2 text-xs muted">Mật khẩu mặc định <b>123456</b>. Gửi cho khách: link đăng nhập, email và mật khẩu mặc định — khách sẽ được yêu cầu đổi mật khẩu ngay lần đầu.</p>
    ${list.length ? `<div class="card scroll"><table class="t"><thead><tr><th>Email</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td><b>${esc(a.email)}</b></td><td>${!a.active ? badge("Đã khóa") : a.mustChange ? badge("Chờ đổi mật khẩu", "warn") : badge("Hoạt động", "ok")}</td><td class="text-sm muted">${a.lastLogin ? dtVi(a.lastLogin) : "Chưa đăng nhập"}</td><td><span class="flex justify-end gap-1"><button class="btn g sm" data-a="pa-reset" data-id="${a.id}" title="Đặt lại mật khẩu về 123456 (khách phải đổi lại)">Đặt lại MK</button><button class="btn g sm" data-a="pa-lock" data-id="${a.id}">${a.active ? "Khóa" : "Mở khóa"}</button></span></td></tr>`).join("")}</tbody></table></div>` : `<p class="rounded-md border border-dashed line p-6 text-center text-sm muted">Khách chưa có tài khoản nào.</p>`}
    <div class="flex justify-end"><button class="btn o" data-a="close">Đóng</button></div></div>`);
}

// ---- Thao tác ----
Object.assign(A, {
  "p-login": () => {
    const fd = new FormData($("#f-plogin")), email = QR.normEmail(String(fd.get("email") || "")), pw = String(fd.get("pw") || "");
    const a = accs().find((x) => x.email === email);
    const err = (m) => ($("#p-login-err").innerHTML = `<div class="card p-3 text-sm" style="color:#dc2626">${esc(m)}</div>`);
    if (!email || !pw) return err("Nhập email và mật khẩu.");
    if (!a || a.pw !== pw) return err("Email hoặc mật khẩu không đúng.");
    if (!a.active) return err("Tài khoản đã bị khóa — vui lòng liên hệ SkyLane.");
    a.lastLogin = new Date().toISOString(); S.me = `acc:${a.id}`; save();
    location.hash = a.mustChange ? "kh-doi-mat-khau" : "kh"; render();
  },
  "p-pw": () => {
    const s = pS(), fd = new FormData($("#f-ppw")), first = s.acc.mustChange;
    const err = (m) => ($("#p-pw-err").innerHTML = `<div class="card p-3 text-sm" style="color:#dc2626">${esc(m)}</div>`);
    if (String(fd.get("current")) !== s.acc.pw) return err("Mật khẩu hiện tại không đúng.");
    const bad = QR.validateNewPassword(String(fd.get("pw") || ""), String(fd.get("confirm") || ""));
    if (bad) return err(bad);
    Object.assign(s.acc, { pw: String(fd.get("pw")), mustChange: false }); save();
    location.hash = "kh"; render(); toast(first ? "Đã đặt mật khẩu mới — chào mừng bạn đến cổng khách hàng SkyLane." : "Đã đổi mật khẩu.");
  },
  "p-logout": () => {
    if (ui.viewAs) { ui.viewAs = null; location.hash = "cong-khach-hang"; render(); return; }
    S.me = "portal-login"; save(); location.hash = "kh"; render();
  },
  "p-save": () => pSave(),
  "p-open": (el, e) => { e?.preventDefault(); pOpen(el.dataset.k, Number(el.dataset.id)); },
  "p-cancel": (el) => {
    const s = pS(), x = S.drafts.find((d) => d.id === Number(el.dataset.id) && d.d.customerCode === s.code);
    if (!x || x.status !== "CHO_XAC_NHAN") return toast("Đơn đã được SkyLane xử lý — không hủy được.", "bad");
    Object.assign(x, { status: "DA_LOAI", decidedAt: new Date().toISOString(), reason: `Khách hủy trên cổng (${s.email})` });
    save(); closeDialog(); render(); toast(`Đã hủy đơn ${x.d.billCode}.`);
  },
  "p-tab": (el) => { ui.pq.tab = el.dataset.v; ui.pq.page = 1; render(); },
  "p-filter": () => { Object.assign(ui.pq, { q: $("#p-q").value, from: $("#p-from").value, to: $("#p-to").value, page: 1 }); render(); },
  "p-unfilter": () => { Object.assign(ui.pq, { q: "", from: "", to: "", page: 1 }); render(); },
  "p-page": (el) => { ui.pq.page = Math.max(1, Number(el.dataset.v)); render(); },
  "p-export": () => pExport(),
  "p-tpl": () => pTemplate(),
  "p-imp-sample": () => { const s = pS(); ui.pImpRows = null; ui.pImpText = [SHEET_HEAD, ...sheetRowsFor(s.code).map((r) => { const x = r.slice(); x[2] = `${s.code}-X${String(r[1]).padStart(2, "0")}`; return x; })].map((r) => r.join("\t")).join("\n"); ui.pImpRes = null; render(); },
  "p-imp-check": () => { ui.pImpText = $("#p-imp-text").value; if (ui.pImpRowsText !== ui.pImpText) ui.pImpRows = null; ui.pImpRes = pAnalyze(); ui.pImpRowsText = ui.pImpText; render(); },
  "p-imp-commit": () => {
    const s = pS(), a = ui.pImpRes;
    if (s.viewAs || !a?.valid.length) return;
    const n = stageDrafts(a.valid, "PORTAL", `Cổng KH · ${s.email} · Excel`);
    ui.pImpRes = null; ui.pImpText = ""; ui.pImpRows = null; save(); ui.pq = { tab: "CHO_XAC_NHAN", q: "", from: "", to: "", page: 1 }; location.hash = "kh-van-don"; render();
    toast(`Đã gửi ${n} đơn — chờ SkyLane xác nhận.`);
  },
  "p-st-dl": (el) => { const st = S.statements.find((x) => x.id === Number(el.dataset.id) && x.customer === pS().code); if (st) downloadStatementXlsx(st); },
  "pa-acc": (el) => paDialog(el.dataset.id),
  "pa-view": (el) => { ui.viewAs = el.dataset.id; ui.pq = null; location.hash = "kh"; render(); toast(`Đang xem cổng với tư cách khách ${el.dataset.id} — chỉ xem.`); },
  "pa-create": () => {
    const code = $("#f-pa").dataset.code, email = QR.normEmail($("#pa-email").value);
    if (!QR.isEmail(email)) return paDialog(code, ["bad", "Email không hợp lệ."]);
    const dup = accs().find((a) => a.email === email);
    if (dup) return paDialog(code, ["bad", `Email này đã là tài khoản của khách ${dup.customer}.`]);
    accs().push({ id: `acc-${S.seq++}`, email, customer: code, pw: QR.DEFAULT_PASSWORD, active: true, mustChange: true, lastLogin: null });
    save(); render(); paDialog(code, ["ok", `Đã tạo tài khoản ${email} — mật khẩu mặc định ${QR.DEFAULT_PASSWORD}, khách sẽ phải đổi ở lần đăng nhập đầu.`]);
  },
  "pa-reset": (el) => { const a = accs().find((x) => x.id === el.dataset.id); Object.assign(a, { pw: QR.DEFAULT_PASSWORD, mustChange: true }); save(); paDialog(a.customer, ["ok", `Đã đặt lại mật khẩu ${a.email} về ${QR.DEFAULT_PASSWORD}.`]); },
  "pa-lock": (el) => { const a = accs().find((x) => x.id === el.dataset.id); a.active = !a.active; if (!a.active && S.me === `acc:${a.id}`) S.me = "portal-login"; save(); render(); paDialog(a.customer, ["ok", `Đã ${a.active ? "mở khóa" : "khóa"} tài khoản ${a.email}.`]); },
});
document.addEventListener("change", (e) => {
  const c = e.target.dataset?.pc;
  if (c === "p-imp-file") { pReadImportFile(e.target.files[0]); e.target.value = ""; }
  else if (c === "p-nav") location.hash = e.target.value;
});
