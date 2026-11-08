// ===== Склад Москва — общее ядро (используют moscow.html и moscow-admin.html) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit, getDoc, getDocs, setDoc, updateDoc }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { D } from "./msk-i18n.js";

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

// ---------- артикулы ----------
const LK = { "Х": "X", "М": "M", "А": "A", "С": "C", "Е": "E", "О": "O", "Р": "P", "Т": "T", "В": "B", "Н": "H", "К": "K", "Л": "L" };
export const nk = t => String(t == null ? "" : t).trim().toUpperCase().replace(/[ХМАСЕОРТВНКЛ]/g, c => LK[c]);
export const keyOf = (a, s) => (nk(a) + "~" + nk(s)).replace(/[\/\\.#\[\]*\s]+/g, "_");
export const SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
export const sizeRank = s => { const i = SIZES.indexOf(nk(s)); return i < 0 ? 99 : i; };
export const cmpAS = (x, y) => String(x.a).localeCompare(String(y.a), "ru", { numeric: true }) || sizeRank(x.s) - sizeRank(y.s) || String(x.s).localeCompare(String(y.s), "ru", { numeric: true });
export const BAG_RE = /^(MIX|MONO|UZUM)-?(\d+)$/i;
export const bagId = raw => { const m = BAG_RE.exec(String(raw).trim()); return m ? m[1].toUpperCase() + "-" + m[2].padStart(3, "0") : null; };

// ---------- язык ----------
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

// ---------- форматы (время по Москве) ----------
const loc = () => (LANG === "uz" ? "uz-UZ" : "ru-RU");
export const fmtN = n => (Number(n) || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
export const tsMs = v => (v && v.toMillis ? v.toMillis() : (typeof v === "number" ? v : 0));
export const fmtDT = v => { const m = tsMs(v); return m ? new Intl.DateTimeFormat(loc(), { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(m)) : "—"; };
export const fmtD = v => { const m = tsMs(v); return m ? new Intl.DateTimeFormat(loc(), { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(m)) : "—"; };
export const ymdMsk = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map(x => [x.type, x.value])); return p.year + "-" + p.month + "-" + p.day; };

// ---------- тема ----------
export const setThemeLocal = th => { const v = th === "dark" ? "dark" : "light"; document.documentElement.dataset.theme = v; try { localStorage.setItem("msk_theme", v); } catch (e) { } const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = v === "dark" ? "#08182a" : "#0b2239"; return v; };
try { setThemeLocal(localStorage.getItem("msk_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")); } catch (e) { }

// ---------- вызов серверных функций ----------
const ERR = { "functions/unauthenticated": "err_auth", "functions/permission-denied": "err_perm", "functions/unavailable": "err_net", "functions/deadline-exceeded": "err_net" };
export async function call(name, data) {
  try { const r = await httpsCallable(fns, name)(data); return r.data; }
  catch (e) {
    const known = e && e.code && ERR[e.code];
    const real = e && e.message && !/^(internal|unavailable|not_found|unknown)$/i.test(String(e.message).trim());
    const msg = real ? e.message : (known ? t(known) : (e && e.code === "functions/not-found" ? t("err_notdeployed") : t("err_server")));
    const er = new Error(msg); er.code = e && e.code; throw er;
  }
}

// ---------- звук ----------
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

// ---------- уведомление и нижнее окно ----------
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

// ---------- сканер (USB / Bluetooth / ТСД как клавиатура) ----------
export const Scan = {
  handler: null, active: true, lastCode: "", lastAt: 0,
  buf: "", tLast: 0, fast: 0, pre: null, el: null,
  set(fn) { this.handler = fn; },
  feed(code, src) {
    code = String(code || "").trim(); if (code.length < 2) return;
    const now = Date.now();
    // случайный двойной «выстрел» сканера (<350 мс) игнорируем; две реальные единицы подряд — считаем
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

// ---------- камера (BarcodeDetector, запасной вариант — ZXing) ----------
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load " + src)); document.head.appendChild(s); }); }
export const Cam = {
  async open(onCode, title) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast(t("cam_unsupported"), "er"); return; }
    const el = document.createElement("div"); el.className = "cam";
    el.innerHTML = `<video playsinline muted></video><div class="top"><b class="sp">${esc(title || t("scan_camera"))}</b><button class="btn s" data-tc style="display:none">🔦</button><button class="btn s" data-x>✕ ${esc(t("close"))}</button></div><div class="fr"></div><div class="msg">${esc(t("cam_hint"))}</div>`;
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

// ---------- статусы отправлений ----------
export const ST = {
  draft: ["st_draft", ""], pending: ["st_pending", "wr"], confirmed: ["st_confirmed", "in"], transit: ["st_transit", "in"],
  partial: ["st_partial", "wr"], delivered: ["st_delivered", "ok"], discrepancy: ["st_discrepancy", "er"], cancelled: ["st_cancelled", ""]
};
export const stChip = s => { const m = ST[s] || ["", ""]; return `<span class="chip ${m[1]}">${esc(m[0] ? t(m[0]) : s)}</span>`; };
export const BAGST = { pending: ["bs_wait", ""], ok: ["bs_ok", "ok"], diff: ["bs_diff", "wr"], lost: ["bs_lost", "er"] };

// ---------- пороги остатков ----------
export function level(q, th, def) {
  const r = (th && th.r != null && th.r !== "") ? +th.r : def.r, y = (th && th.y != null && th.y !== "") ? +th.y : def.y;
  if (q <= r) return "r"; if (q <= y) return "y"; return "g";
}
export const DEF_TH = { y: 30, r: 10 };

// ---------- иконки ----------
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
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.
