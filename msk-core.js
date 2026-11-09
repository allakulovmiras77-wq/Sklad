// ===== \u0421\u043a\u043b\u0430\u0434 \u041c\u043e\u0441\u043a\u0432\u0430 \u2014 \u043e\u0431\u0449\u0435\u0435 \u044f\u0434\u0440\u043e (\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u044e\u0442 moscow.html \u0438 moscow-admin.html) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit, getDoc, getDocs, setDoc, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { D } from "./msk-i18n.js?v=5";

const firebaseConfig = {
  apiKey: "AIzaSyCf8-kD-Grk20GnJKIINPyAKSpnoJ6H3pI",
  authDomain: "lider-tekstil.firebaseapp.com",
  projectId: "lider-tekstil",
  storageBucket: "lider-tekstil.firebasestorage.app",
  messagingSenderId: "44919046709",
  appId: "1:44919046709:web:6dd5c7d217b4bb983ce77c"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const fns = getFunctions(app, "us-central1");
export { signOut, onAuthStateChanged, updatePassword, collection, doc, onSnapshot, query, where, orderBy, limit, getDoc, getDocs, setDoc, updateDoc };

export const OWNER = "lidertekstil10@gmail.com";
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12))).slice(0, 40);

// ---------- \u0430\u0440\u0442\u0438\u043a\u0443\u043b\u044b ----------
const LK = { "\u0425": "X", "\u041c": "M", "\u0410": "A", "\u0421": "C", "\u0415": "E", "\u041e": "O", "\u0420": "P", "\u0422": "T", "\u0412": "B", "\u041d": "H", "\u041a": "K", "\u041b": "L" };
export const nk = t => String(t == null ? "" : t).trim().toUpperCase().replace(/[\u0425\u041c\u0410\u0421\u0415\u041e\u0420\u0422\u0412\u041d\u041a\u041b]/g, c => LK[c]);
export const keyOf = (a, s) => (nk(a) + "~" + nk(s)).replace(/[\/\\.#\[\]*\s]+/g, "_");
export const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
export const sizeRank = s => { const i = SIZES.indexOf(nk(s)); return i < 0 ? 99 : i; };
export const cmpAS = (x, y) => String(x.a).localeCompare(String(y.a), "ru", { numeric: true }) || sizeRank(x.s) - sizeRank(y.s) || String(x.s).localeCompare(String(y.s), "ru", { numeric: true });
export const BAG_RE = /^(MIX|MONO|UZUM)-?(\d+)$/i;
export const bagId = raw => { const m = BAG_RE.exec(String(raw).trim()); return m ? m[1].toUpperCase() + "-" + m[2].padStart(3, "0") : null; };

// ---------- \u044f\u0437\u044b\u043a ----------
let LANG = "ru";
export const lang = () => LANG;
export const t = (k, v) => {
  const e = D[k];
  let s = e ? (e[LANG === "uz" ? 1 : 0] || e[0]) : k;
  if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]);
  return s;
};
export const setLangLocal = l => { LANG = l === "uz" ? "uz" : "ru"; document.documentElement.lang = LANG; try { localStorage.setItem("msk_lang", LANG); } catch (e) { } };
try { setLangLocal(localStorage.getItem("msk_lang") || "ru"); } catch (e) { }

// ---------- \u0444\u043e\u0440\u043c\u0430\u0442\u044b (\u0432\u0440\u0435\u043c\u044f \u043f\u043e \u041c\u043e\u0441\u043a\u0432\u0435) ----------
const loc = () => (LANG === "uz" ? "uz-UZ" : "ru-RU");
export const fmtN = n => (Number(n) || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
export const tsMs = v => (v && v.toMillis ? v.toMillis() : (typeof v === "number" ? v : 0));
export const fmtDT = v => { const m = tsMs(v); return m ? new Intl.DateTimeFormat(loc(), { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(m)) : "\u2014"; };
export const fmtD = v => { const m = tsMs(v); return m ? new Intl.DateTimeFormat(loc(), { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(m)) : "\u2014"; };
export const ymdMsk = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map(x => [x.type, x.value])); return p.year + "-" + p.month + "-" + p.day; };

// ---------- \u0442\u0435\u043c\u0430 ----------
export const setThemeLocal = th => { const v = th === "dark" ? "dark" : "light"; document.documentElement.dataset.theme = v; try { localStorage.setItem("msk_theme", v); } catch (e) { } const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = v === "dark" ? "#08182a" : "#0b2239"; return v; };
try { setThemeLocal(localStorage.getItem("msk_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); } catch (e) { }

// ---------- \u0432\u044b\u0437\u043e\u0432 \u0441\u0435\u0440\u0432\u0435\u0440\u043d\u044b\u0445 \u0444\u0443\u043d\u043a\u0446\u0438\u0439 ----------
const ERR = { "functions/unauthenticated": "err_auth", "functions/permission-denied": "err_perm", "functions/unavailable": "err_net", "functions/deadline-exceeded": "err_net" };
export async function call(name, data) {
  try { const r = await httpsCallable(fns, name)(data); return r.data; }
  catch (e) {
    const known = e && e.code && ERR[e.code];
    const real = e && e.message && !/^(internal|unavailable|not_found|unknown)$/i.test(String(e.message).trim());
    const msg = real ? e.message : (known ? t(known) : (e && e.code === "functions/not-found" ? t("err_notdeployed") : (e && e.code === "functions/internal" ? t("err_noreply") : t("err_server"))));
    const er = new Error(msg); er.code = e && e.code; throw er;
  }
}

// ---------- \u0437\u0432\u0443\u043a ----------
const SND_DEF = { on: true, vol: 0.7, scanOk: "beep", scanErr: "buzz" };
export const Snd = {
  cfg: Object.assign({}, SND_DEF), ctx: null,
  load(o) { this.cfg = Object.assign({}, SND_DEF, o || {}); },
  ac() { try { this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === "suspended") this.ctx.resume(); } catch (e) { } return this.ctx; },
  tone(f, st, d, type = "sine", g = 1, f2) {
    const c = this.ac(); if (!c) return;
    const o = c.createOscillator(), gn = c.createGain(), t0 = c.currentTime + st;
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.linearRampToValueAtTime(f2, t0 + d);
    const v = Math.max(0.0001, this.cfg.vol * g * 0.6);
    gn.gain.setValueAtTime(v, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(gn); gn.connect(c.destination); o.start(t0); o.stop(t0 + d + 0.02);
  },
  LIST: {
    scanOk: { beep: [[1000, 0, .12]], chime: [[880, 0, .1], [1320, .1, .16]], click: [[1800, 0, .05, "square", .6]], pop: [[600, 0, .14, "sine", 1, 1100]] },
    scanErr: { buzz: [[200, 0, .3, "sawtooth"]], double: [[300, 0, .14, "square"], [300, .2, .14, "square"]], low: [[140, 0, .4, "triangle", 1.2]], alarm: [[620, 0, .12, "square"], [420, .14, .12, "square"], [620, .28, .12, "square"]] }
  },
  seq(a) { a.forEach(n => this.tone(n[0], n[1], n[2], n[3] || "sine", n[4] || 1, n[5])); },
  play(kind, force) {
    if (!this.cfg.on && !force) return;
    const L = this.LIST;
    if (kind === "scanOk") this.seq(L.scanOk[this.cfg.scanOk] || L.scanOk.beep);
    else if (kind === "scanErr") this.seq(L.scanErr[this.cfg.scanErr] || L.scanErr.buzz);
    else if (kind === "opOk") this.seq([[660, 0, .1], [880, .1, .1], [1175, .2, .2]]);
    else if (kind === "opErr") this.seq([[400, 0, .14, "square"], [300, .16, .14, "square"], [200, .32, .26, "square"]]);
    else if (kind === "warn") this.seq([[900, 0, .1, "square"], [900, .16, .1, "square"], [900, .32, .1, "square"]]);
    try { if (navigator.vibrate) navigator.vibrate(kind === "scanOk" || kind === "opOk" ? 60 : [120, 60, 120]); } catch (e) { }
  }
};
["click", "touchstart", "keydown"].forEach(ev => document.addEventListener(ev, () => Snd.ac(), { once: true, passive: true }));

// ---------- \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0435 \u0438 \u043d\u0438\u0436\u043d\u0435\u0435 \u043e\u043a\u043d\u043e ----------
let tmr;
export function toast(msg, kind = "") {
  let el = $("#toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.className = kind; el.textContent = msg; void el.offsetWidth; el.classList.add("on");
  clearTimeout(tmr); tmr = setTimeout(() => el.classList.remove("on"), 3200);
}
let ovClose = null;
export function openSheet(html, onClose) {
  let ov = $("#ov"); if (!ov) { ov = document.createElement("div"); ov.id = "ov"; ov.innerHTML = '<div id="sh"></div>'; document.body.appendChild(ov); ov.addEventListener("click", e => { if (e.target === ov) closeSheet(); }); }
  $("#sh").innerHTML = '<div class="gr"></div>' + html; ov.classList.add("on"); ovClose = onClose || null; $("#sh").scrollTop = 0;
  return $("#sh");
}
export function closeSheet() { const ov = $("#ov"); if (ov) ov.classList.remove("on"); const f = ovClose; ovClose = null; if (f) f(); }
export function confirmBox({ title, text, ok, danger, extra }) {
  return new Promise(res => {
    const sh = openSheet(`<h2>${esc(title)}</h2><div class="mu" style="margin-bottom:12px;white-space:pre-line">${text || ""}</div>${extra || ""}<div class="row" style="margin-top:14px"><button class="btn w" data-c="0">${esc(t("cancel"))}</button><button class="btn w ${danger ? "d" : "p"}" data-c="1">${esc(ok || t("confirm"))}</button></div>`, () => res(false));
    $$("[data-c]", sh).forEach(b => b.onclick = () => { const v = b.dataset.c === "1"; ovClose = null; closeSheet(); res(v); });
  });
}
export function askNumber({ title, value = 1, ok, label }) {
  return new Promise(res => {
    const sh = openSheet(`<h2>${esc(title)}</h2><label class="f">${esc(label || t("qty"))}<input id="an" type="number" inputmode="numeric" min="1" value="${value}" class="num"></label><div class="row" style="margin-top:14px"><button class="btn w" data-c="0">${esc(t("cancel"))}</button><button class="btn w p" data-c="1">${esc(ok || "OK")}</button></div>`, () => res(null));
    const inp = $("#an", sh); setTimeout(() => { inp.focus(); inp.select(); }, 60);
    const go = () => { const n = parseInt(inp.value, 10); if (!(n > 0)) { inp.focus(); return; } ovClose = null; closeSheet(); res(n); };
    inp.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    $$("[data-c]", sh).forEach(b => b.onclick = () => { if (b.dataset.c === "1") go(); else { ovClose = null; closeSheet(); res(null); } });
  });
}

// ---------- \u0441\u043a\u0430\u043d\u0435\u0440 (USB / Bluetooth / \u0422\u0421\u0414 \u043a\u0430\u043a \u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u0430) ----------
export const Scan = {
  handler: null, active: true, lastCode: "", lastAt: 0,
  buf: "", tLast: 0, fast: 0, pre: null, el: null,
  set(fn) { this.handler = fn; },
  feed(code, src) {
    code = String(code || "").trim(); if (code.length < 2) return;
    const now = Date.now();
    // \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u044b\u0439 \u0434\u0432\u043e\u0439\u043d\u043e\u0439 \u00ab\u0432\u044b\u0441\u0442\u0440\u0435\u043b\u00bb \u0441\u043a\u0430\u043d\u0435\u0440\u0430 (<350 \u043c\u0441) \u0438\u0433\u043d\u043e\u0440\u0438\u0440\u0443\u0435\u043c; \u0434\u0432\u0435 \u0440\u0435\u0430\u043b\u044c\u043d\u044b\u0435 \u0435\u0434\u0438\u043d\u0438\u0446\u044b \u043f\u043e\u0434\u0440\u044f\u0434 \u2014 \u0441\u0447\u0438\u0442\u0430\u0435\u043c
    if (src === "hw" && code === this.lastCode && now - this.lastAt < 350) return;
    if (src === "cam" && code === this.lastCode && now - this.lastAt < 1400) return;
    this.lastCode = code; this.lastAt = now;
    if (this.handler) this.handler(code, src || "hw");
  },
  init() {
    document.addEventListener("keydown", e => {
      if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now(), el = e.target, inField = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const gap = now - this.tLast;
      if (e.key === "Enter" || e.key === "Tab") {
        if (this.buf.length >= 3 && this.fast >= 2) {
          e.preventDefault();
          if (inField && this.pre !== null && el.value !== this.pre) { el.value = this.pre; el.dispatchEvent(new Event("input", { bubbles: true })); }
          const code = this.buf; this.buf = ""; this.fast = 0; this.pre = null; this.tLast = 0;
          this.feed(code, "hw"); return;
        }
        this.buf = ""; this.fast = 0; this.pre = null; return;
      }
      if (e.key.length !== 1) return;
      if (gap > 80 || this.buf === "") { this.buf = ""; this.fast = 0; this.pre = inField ? el.value : null; }
      else this.fast++;
      this.buf += e.key; this.tLast = now;
    }, true);
  }
};

// ---------- \u043a\u0430\u043c\u0435\u0440\u0430 (BarcodeDetector, \u0437\u0430\u043f\u0430\u0441\u043d\u043e\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442 \u2014 ZXing) ----------
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load " + src)); document.head.appendChild(s); }); }
export const Cam = {
  async open(onCode, title) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(t("cam_unsupported"), "er"); return; }
    const el = document.createElement("div"); el.className = "cam";
    el.innerHTML = `<video playsinline muted></video><div class="top"><b class="sp">${esc(title || t("scan_camera"))}</b><button class="btn s" data-tc style="display:none">\u{1f526}</button><button class="btn s" data-x>\u2715 ${esc(t("close"))}</button></div><div class="fr"></div><div class="msg">${esc(t("cam_hint"))}</div>`;
    document.body.appendChild(el);
    const v = $("video", el), fr = $(".fr", el), msg = $(".msg", el);
    let stream = null, off = false, reader = null, raf = 0, torch = false;
    const stop = () => { off = true; cancelAnimationFrame(raf); try { reader && reader.reset(); } catch (e) { } if (stream) stream.getTracks().forEach(x => x.stop()); el.remove(); };
    $("[data-x]", el).onclick = stop;
    const hit = code => {
      if (off) return;
      const now = Date.now(); if (code === this._l && now - this._t < 1400) return; this._l = code; this._t = now;
      fr.classList.add("ok"); setTimeout(() => fr.classList.remove("ok"), 500);
      msg.textContent = code;
      Scan.lastCode = ""; onCode(code, { stop });
    };
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
    catch (e) { msg.textContent = (e && e.name === "NotAllowedError") ? t("cam_denied") : t("cam_unsupported"); msg.style.bottom = "50%"; return; }
    v.srcObject = stream; try { await v.play(); } catch (e) { }
    const tr = stream.getVideoTracks()[0], caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.torch) { const tb = $("[data-tc]", el); tb.style.display = ""; tb.onclick = async () => { torch = !torch; try { await tr.applyConstraints({ advanced: [{ torch }] }); } catch (e) { } }; }
    if ("BarcodeDetector" in window) {
      let det; try { det = new BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "data_matrix"] }); } catch (e) { det = null; }
      if (det) {
        const loop = async () => { if (off) return; try { const r = await det.detect(v); if (r && r[0] && r[0].rawValue) hit(r[0].rawValue); } catch (e) { } raf = setTimeout(loop, 120); };
        loop(); return;
      }
    }
    try {
      if (!window.ZXing) await loadScript("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js");
      reader = new ZXing.BrowserMultiFormatReader();
      reader.decodeFromStream(stream, v, res => { if (res) hit(res.getText()); });
    } catch (e) { msg.textContent = t("cam_unsupported"); }
  }
};

// ---------- Excel / CSV ----------
async function xl() { if (!window.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"); return window.XLSX; }
export async function exportXlsx(name, sheets) {
  try {
    const X = await xl(), wb = X.utils.book_new();
    sheets.forEach(s => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s.rows), String(s.name).slice(0, 30)));
    X.writeFile(wb, name + ".xlsx");
  } catch (e) {
    const rows = sheets[0].rows, csv = "\ufeff" + rows.map(r => r.map(c => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = name + ".csv"; a.click();
    toast(t("export_csv"), "");
  }
}
export async function readTable(file) {
  const X = await xl(), buf = await file.arrayBuffer();
  const wb = X.read(buf, { type: "array" }), ws = wb.Sheets[wb.SheetNames[0]];
  return X.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
}

// ---------- \u0441\u0442\u0430\u0442\u0443\u0441\u044b \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0439 ----------
export const ST = {
  draft: ["st_draft", ""], pending: ["st_pending", "wr"], confirmed: ["st_confirmed", "in"], transit: ["st_transit", "in"],
  partial: ["st_partial", "wr"], delivered: ["st_delivered", "ok"], discrepancy: ["st_discrepancy", "er"], cancelled: ["st_cancelled", ""]
};
export const stChip = s => { const m = ST[s] || ["", ""]; return `<span class="chip ${m[1]}">${esc(m[0] ? t(m[0]) : s)}</span>`; };
export const BAGST = { pending: ["bs_wait", ""], ok: ["bs_ok", "ok"], diff: ["bs_diff", "wr"], lost: ["bs_lost", "er"] };

// ---------- \u043f\u043e\u0440\u043e\u0433\u0438 \u043e\u0441\u0442\u0430\u0442\u043a\u043e\u0432 ----------
export function level(q, th, def) {
  const r = (th && th.r != null && th.r !== "") ? +th.r : def.r, y = (th && th.y != null && th.y !== "") ? +th.y : def.y;
  if (q <= r) return "r"; if (q <= y) return "y"; return "g";
}
export const DEF_TH = { y: 30, r: 10 };

// ---------- \u0438\u043a\u043e\u043d\u043a\u0438 ----------
export const IC = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  stock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></svg>',
  recv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6h14v11H1zM15 10h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  inv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
  set: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>'
};

// ---------- \u043a\u0440\u0443\u043f\u043d\u0430\u044f \u043f\u043e\u0434\u043f\u0438\u0441\u044c \u00abCreated by Miras\u00bb ----------
export const byline = () => '<div class="byline"><div class="ln"></div><div class="by">Created by <em>Miras</em></div><div class="by2">\u0421\u043a\u043b\u0430\u0434 LT \u00b7 \u041c\u043e\u0441\u043a\u0432\u0430</div></div>';

// ---------- \u0438\u043b\u043b\u044e\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e\u0433\u043e \u0441\u043a\u043b\u0430\u0434\u0430 ----------
export function heroArt() {
  return `<svg class="art" viewBox="0 0 800 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
<defs>
<linearGradient id="hg-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2239"/><stop offset="1" stop-color="#16456b"/></linearGradient>
<linearGradient id="hg-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b5a86" stop-opacity=".0"/><stop offset="1" stop-color="#071a2c" stop-opacity=".9"/></linearGradient>
<linearGradient id="hg-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9140"/><stop offset="1" stop-color="#e8610f"/></linearGradient>
<linearGradient id="hg-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d6" stop-opacity=".95"/><stop offset="1" stop-color="#fff6d6" stop-opacity="0"/></linearGradient>
<linearGradient id="hg-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9edf2"/><stop offset="1" stop-color="#b8c4d2"/></linearGradient>
<linearGradient id="hg-c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a066"/><stop offset="1" stop-color="#b67a43"/></linearGradient>
</defs>
<rect width="800" height="360" fill="url(#hg-w)"/>
<!-- \u043e\u043a\u043d\u043e \u0441 \u0432\u0438\u0434\u043e\u043c \u043d\u0430 \u041c\u043e\u0441\u043a\u0432\u0443 -->
<g opacity=".55"><rect x="560" y="40" width="190" height="110" rx="10" fill="#244f78"/>
<path d="M565 150v-34h14v-14h10v14h12v-22l6-10 6 10v22h14v-18h10v18h10v-30l8-14 8 14v30h12v-12h14v12h30v-0z" fill="#12385a"/>
<path d="M650 116c0-10 8-14 8-22 0-6-4-8-8-12 4-2 12 0 12 10 0 8 4 10 4 16z" fill="#ff9140" opacity=".8"/>
<circle cx="710" cy="62" r="11" fill="#ffd9a8" opacity=".8"/></g>
<!-- \u0441\u0432\u0435\u0442\u0438\u043b\u044c\u043d\u0438\u043a\u0438 -->
<g><path d="M120 0v34M360 0v34M600 0v34" stroke="#0a1a2b" stroke-width="3"/>
<path d="M96 34h48l-8 12h-32zM336 34h48l-8 12h-32zM576 34h48l-8 12h-32z" fill="#0a1a2b"/>
<path d="M100 46h40l30 150h-100zM340 46h40l30 150h-100zM580 46h40l30 150h-100z" fill="url(#hg-l)" opacity=".16"/></g>
<!-- \u0441\u0442\u0435\u043b\u043b\u0430\u0436\u0438 -->
<g>
<g transform="translate(14,92)">
<rect x="0" y="0" width="6" height="190" fill="#ff7a1a"/><rect x="214" y="0" width="6" height="190" fill="#ff7a1a"/>
<rect x="0" y="60" width="220" height="7" fill="url(#hg-r)"/><rect x="0" y="126" width="220" height="7" fill="url(#hg-r)"/><rect x="0" y="182" width="220" height="7" fill="url(#hg-r)"/>
<rect x="12" y="18" width="46" height="42" rx="3" fill="url(#hg-c)"/><rect x="12" y="18" width="46" height="8" fill="#a8693a" opacity=".5"/><rect x="62" y="28" width="52" height="32" rx="3" fill="url(#hg-c)"/><rect x="120" y="14" width="44" height="46" rx="3" fill="url(#hg-c)"/><rect x="170" y="30" width="38" height="30" rx="3" fill="url(#hg-c)"/>
<g><rect x="14" y="86" width="50" height="40" rx="14" fill="url(#hg-b)"/><rect x="26" y="96" width="14" height="14" fill="#0c1b2b"/><path d="M28 98h4v4h-4zM34 104h4v4h-4z" fill="#fff"/>
<rect x="72" y="92" width="52" height="34" rx="14" fill="url(#hg-b)"/><rect x="84" y="99" width="12" height="12" fill="#0c1b2b"/><path d="M86 101h3v3h-3z" fill="#fff"/>
<rect x="134" y="84" width="48" height="42" rx="14" fill="url(#hg-b)"/><rect x="146" y="94" width="13" height="13" fill="#0c1b2b"/><path d="M148 96h3v3h-3z" fill="#fff"/></g>
<rect x="14" y="146" width="56" height="36" rx="3" fill="url(#hg-c)"/><rect x="78" y="152" width="48" height="30" rx="3" fill="url(#hg-c)"/><rect x="132" y="140" width="60" height="42" rx="3" fill="url(#hg-c)"/>
</g>
<g transform="translate(566,92)">
<rect x="0" y="0" width="6" height="190" fill="#ff7a1a"/><rect x="214" y="0" width="6" height="190" fill="#ff7a1a"/>
<rect x="0" y="60" width="220" height="7" fill="url(#hg-r)"/><rect x="0" y="126" width="220" height="7" fill="url(#hg-r)"/><rect x="0" y="182" width="220" height="7" fill="url(#hg-r)"/>
<rect x="14" y="22" width="52" height="38" rx="3" fill="url(#hg-c)"/><rect x="74" y="12" width="46" height="48" rx="3" fill="url(#hg-c)"/><rect x="128" y="26" width="76" height="34" rx="3" fill="url(#hg-c)"/>
<g><rect x="14" y="88" width="54" height="38" rx="14" fill="url(#hg-b)"/><rect x="28" y="97" width="13" height="13" fill="#0c1b2b"/><path d="M30 99h3v3h-3z" fill="#fff"/>
<rect x="76" y="84" width="50" height="42" rx="14" fill="url(#hg-b)"/><rect x="88" y="95" width="13" height="13" fill="#0c1b2b"/><path d="M90 97h3v3h-3z" fill="#fff"/>
<rect x="134" y="94" width="66" height="32" rx="14" fill="url(#hg-b)"/><rect x="150" y="100" width="12" height="12" fill="#0c1b2b"/></g>
<rect x="12" y="140" w="0" height="0"/><rect x="16" y="148" width="64" height="34" rx="3" fill="url(#hg-c)"/><rect x="88" y="142" width="54" height="40" rx="3" fill="url(#hg-c)"/><rect x="150" y="152" width="52" height="30" rx="3" fill="url(#hg-c)"/>
</g></g>
<!-- \u043f\u043e\u043b -->
<rect y="282" width="800" height="78" fill="#0a1a2b"/><rect y="282" width="800" height="78" fill="url(#hg-f)"/>
<path d="M0 300h800" stroke="#f2b01e" stroke-width="3" stroke-dasharray="26 16" opacity=".7"/>
<path d="M0 282h800" stroke="#1e4a70" stroke-width="2"/>
<!-- \u043f\u0430\u043b\u043b\u0435\u0442\u0430 \u0441 \u043a\u043e\u0440\u043e\u0431\u043a\u0430\u043c\u0438 \u043f\u043e \u0446\u0435\u043d\u0442\u0440\u0443 -->
<g transform="translate(300,236)"><rect x="0" y="40" width="130" height="10" fill="#8a5a2e"/><rect x="8" y="50" width="16" height="8" fill="#6d4623"/><rect x="57" y="50" width="16" height="8" fill="#6d4623"/><rect x="106" y="50" width="16" height="8" fill="#6d4623"/>
<rect x="4" y="2" width="58" height="38" rx="3" fill="url(#hg-c)"/><rect x="66" y="8" width="60" height="32" rx="3" fill="url(#hg-c)"/><path d="M4 12h58M66 18h60" stroke="#a8693a" stroke-width="3" opacity=".6"/>
<rect x="30" y="-22" width="64" height="26" rx="9" fill="url(#hg-b)"/><rect x="44" y="-16" width="11" height="11" fill="#0c1b2b"/><path d="M46 -14h3v3h-3z" fill="#fff"/></g>
<!-- \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u0441\u043e \u0441\u043a\u0430\u043d\u0435\u0440\u043e\u043c-\u043f\u0438\u0441\u0442\u043e\u043b\u0435\u0442\u043e\u043c -->
<g transform="translate(232,170)">
<ellipse cx="38" cy="116" rx="40" ry="6" fill="#000" opacity=".25"/>
<path d="M22 112l-4-46h42l-2 46z" fill="#15314d"/>
<path d="M14 66l-4-40a22 22 0 0 1 22-18h12a22 22 0 0 1 22 18l-4 40z" fill="#ff7a1a"/>
<path d="M22 30h4v34h-4zM50 30h4v34h-4z" fill="#ffe27a" opacity=".85"/>
<circle cx="38" cy="-4" r="14" fill="#f1c9a5"/><path d="M24 -6a14 14 0 0 1 28 0v-3a14 14 0 0 0-28 0z" fill="#ffd23f"/><rect x="22" y="-10" width="32" height="6" rx="3" fill="#f2b01e"/>
<path d="M58 34l32 -6" stroke="#ff7a1a" stroke-width="10" stroke-linecap="round"/><circle cx="92" cy="27" r="6" fill="#f1c9a5"/>
<g transform="translate(90,14) rotate(-8)"><rect x="0" y="0" width="30" height="16" rx="5" fill="#243b53"/><rect x="24" y="3" width="10" height="10" rx="2" fill="#ff3b3b"/><rect x="6" y="14" width="10" height="16" rx="4" fill="#243b53"/></g>
<path d="M124 22L180 44" stroke="#ff3b3b" stroke-width="2.2" opacity=".9"/><path d="M124 22L180 44" stroke="#ff9a9a" stroke-width="6" opacity=".25"/>
<path d="M26 112v10M50 112v10" stroke="#0a1a2b" stroke-width="8" stroke-linecap="round"/>
</g>
<!-- \u0432\u0442\u043e\u0440\u043e\u0439 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a \u0441 \u043a\u043e\u0440\u043e\u0431\u043a\u043e\u0439 -->
<g transform="translate(494,184)">
<ellipse cx="30" cy="104" rx="36" ry="6" fill="#000" opacity=".25"/>
<path d="M14 100l-2-38h36l-2 38z" fill="#1a3a5b"/>
<path d="M8 62l-3-34a18 18 0 0 1 18-14h12a18 18 0 0 1 18 14l-3 34z" fill="#2f7de1"/>
<circle cx="30" cy="2" r="13" fill="#e2b48e"/><path d="M17 0a13 13 0 0 1 26 0v-3a13 13 0 0 0-26 0z" fill="#3b2a20"/>
<rect x="-8" y="32" width="62" height="38" rx="3" fill="url(#hg-c)"/><path d="M-8 46h62" stroke="#a8693a" stroke-width="4" opacity=".6"/><rect x="14" y="52" width="16" height="10" fill="#fff" opacity=".85"/>
<path d="M12 100v10M38 100v10" stroke="#0a1a2b" stroke-width="8" stroke-linecap="round"/>
</g>
<!-- \u043f\u043e\u0433\u0440\u0443\u0437\u0447\u0438\u043a -->
<g transform="translate(640,214)" opacity=".95">
<rect x="-6" y="-26" width="6" height="86" fill="#f2b01e"/><rect x="6" y="-26" width="6" height="86" fill="#f2b01e"/>
<rect x="-30" y="52" width="40" height="6" fill="#c9d3dd"/>
<rect x="10" y="22" width="78" height="32" rx="8" fill="#f2b01e"/><rect x="42" y="2" width="42" height="26" rx="4" fill="#f2b01e"/><path d="M48 6h30v16H48z" fill="#9ed0ff" opacity=".8"/>
<circle cx="30" cy="58" r="12" fill="#0a1a2b"/><circle cx="30" cy="58" r="5" fill="#8fa3b7"/><circle cx="74" cy="58" r="12" fill="#0a1a2b"/><circle cx="74" cy="58" r="5" fill="#8fa3b7"/>
<rect x="-34" y="26" width="30" height="26" rx="3" fill="url(#hg-c)"/>
</g>
<!-- \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430/\u0422\u0421\u0414 \u043d\u0430 \u043f\u0435\u0440\u0435\u0434\u043d\u0435\u043c \u043f\u043b\u0430\u043d\u0435 \u0441\u043f\u0440\u0430\u0432\u0430 \u0432\u043d\u0438\u0437\u0443 -->
<g transform="translate(700,250) rotate(8)"><rect width="70" height="98" rx="12" fill="#0a1a2b" stroke="#2b5a85" stroke-width="3"/><rect x="8" y="10" width="54" height="44" rx="6" fill="#16456b"/><path d="M16 20h30M16 28h38M16 36h24" stroke="#ff9140" stroke-width="4" stroke-linecap="round"/><rect x="14" y="62" width="42" height="12" rx="4" fill="#ff7a1a"/><circle cx="35" cy="86" r="5" fill="#2b5a85"/></g>
</svg>`;
}

// ---------- \u0437\u0430\u043f\u0443\u0441\u043a \u0441\u043a\u0430\u043d\u0435\u0440\u0430 \u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440\u043d\u043e\u0433\u043e \u0440\u0435\u0436\u0438\u043c\u0430 ----------
Scan.init();
