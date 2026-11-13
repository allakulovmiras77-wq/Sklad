/* sew-panel.js — панель швей: «Сегодня», «Табель», «Запас часов». Общая для sewing.html (старшая швея)
   и index.html (владелец, бухгалтер, сотрудники с доступом). Данные берёт через ctx.api. */
(function (g) {
  const S = g.SEW, esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], CODES = ['', 'Б', 'ПД', 'НБ'], pad = S.pad;
  const CSS = `
.sp *{box-sizing:border-box}.sp{--g:#16a34a;--r:#ef4444;--a:#f59e0b}
.sp-tabs{display:flex;gap:6px;margin:0 0 12px;overflow-x:auto}.sp-tabs button{flex:1;white-space:nowrap;min-height:46px;padding:8px 12px}
.sp-hero{display:flex;gap:12px;align-items:center;padding:14px;border-radius:20px;margin-bottom:12px;background:linear-gradient(135deg,#14397f,#6d3fd8);color:#fff}
.sp-hero svg{width:84px;height:70px;flex:none}.sp-hero b{font-size:19px;display:block}.sp-hero span{font-size:13px;opacity:.85}
.sp-dt{display:flex;gap:8px;align-items:center;margin-bottom:10px}.sp-dt input{flex:1}.sp-dt button{min-width:48px;padding:8px 12px}
.sp-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.sp-k{border-radius:16px;padding:10px 4px;text-align:center;background:var(--card,#fff);border:1px solid var(--bd,#dde4f0)}
.sp-k b{display:block;font-size:24px;line-height:1.1}.sp-k span{font-size:11px;color:var(--mu,#64718a)}
.sp-k.g b{color:var(--g)}.sp-k.r b{color:var(--r)}.sp-k.a b{color:var(--a)}
.sp-card{background:var(--card,#fff);border:1px solid var(--bd,#dde4f0);border-radius:18px;padding:12px;margin-bottom:10px;box-shadow:var(--sh,none)}
.sp-top{display:flex;gap:10px;align-items:center}.sp-av{width:42px;height:42px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(135deg,#4c8dff,#7c5cff)}
.sp-nm{flex:1;min-width:0;font-weight:800;font-size:16px;overflow-wrap:anywhere;cursor:pointer}.sp-nm small{display:block;font-weight:500;color:var(--mu,#64718a);font-size:12px}
.sp-badge{flex:none;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:800;background:rgba(100,113,138,.15);color:var(--mu,#64718a)}
.sp-badge.in{background:rgba(22,163,74,.16);color:var(--g)}.sp-badge.out{background:rgba(245,158,11,.18);color:#b36b00}.sp-badge.bad{background:rgba(239,68,68,.15);color:var(--r)}.sp-badge.done{background:rgba(76,141,255,.16);color:#2f6bff}
.sp-bar{position:relative;height:22px;border-radius:8px;background:var(--bg,#eef2f9);margin:10px 0 2px;overflow:hidden}
.sp-bar .w{position:absolute;top:0;bottom:0;background:rgba(76,141,255,.14)}.sp-far{margin-top:8px;padding:8px 10px;border-radius:12px;border:1px dashed rgba(245,165,36,.6);font-size:13px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.sp-far button{min-height:36px;padding:2px 12px;font-size:13px}.sp-bar .l{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,rgba(100,113,138,.35) 0 4px,transparent 4px 8px)}
.sp-bar .p{position:absolute;top:5px;bottom:5px;border-radius:5px;background:linear-gradient(90deg,#22c55e,#16a34a)}.sp-bar .p.live{animation:spl 1.4s ease-in-out infinite}
.sp-bar .x{position:absolute;top:2px;bottom:2px;border:2px dashed var(--r);border-radius:5px;opacity:.7}
@keyframes spl{50%{opacity:.55}}
.sp-sc{display:flex;justify-content:space-between;font-size:10px;color:var(--mu,#64718a);margin-bottom:6px}
.sp-tk{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.sp-tk span{padding:3px 9px;border-radius:99px;font-size:13px;font-weight:700;background:var(--bg,#eef2f9);border:1px solid var(--bd,#dde4f0)}
.sp-tk .i{color:var(--g)}.sp-tk .o{color:var(--r)}
.sp-ln{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:14px;margin:4px 0 8px}
.sp-chip{padding:3px 10px;border-radius:99px;font-size:12px;font-weight:800;background:var(--bg,#eef2f9);border:1px solid var(--bd,#dde4f0)}
.sp-chip.g{color:var(--g);border-color:var(--g);background:rgba(22,163,74,.1)}.sp-chip.r{color:var(--r);border-color:var(--r);background:rgba(239,68,68,.1)}.sp-chip.a{color:#b36b00;border-color:var(--a);background:rgba(245,158,11,.14)}
.sp-btns{display:flex;gap:6px}.sp-btns button{flex:1;min-height:46px;padding:6px;font-weight:800}
.sp-btns .c{color:var(--mu,#64718a)}
.sp-s{border-radius:14px}
.sp-s.Б{color:var(--g)}.sp-s.ПД{color:#c77d00}.sp-s.НБ{color:var(--r)}
.sp-s.Б.on{background:#22c55e;color:#fff;border-color:#22c55e}.sp-s.ПД.on{background:#f59e0b;color:#2b2000;border-color:#f59e0b}.sp-s.НБ.on{background:#ef4444;color:#fff;border-color:#ef4444}
.sp-s.pr{border-style:dashed;border-width:2px;font-weight:900}.sp-s.Б.on.pr{background:rgba(34,197,94,.14);color:#16a34a;border-color:#22c55e}.sp-s.ПД.on.pr{background:rgba(245,158,11,.16);color:#c77d00;border-color:#f59e0b}.sp-s.НБ.on.pr{background:rgba(239,68,68,.13);color:#ef4444;border-color:#ef4444}
.sp-act{display:flex;gap:8px;margin:0 0 12px}.sp-act button{flex:1;min-height:50px;font-weight:800}
.sp-tw{overflow:auto;max-height:calc(100dvh - 300px);border-radius:16px;border:1px solid var(--bd,#dde4f0);background:var(--card,#fff)}
.sp-t{border-collapse:separate;border-spacing:0;font-size:12px;min-width:100%}.sp-t th,.sp-t td{padding:3px 2px;text-align:center;white-space:nowrap;border-bottom:1px solid var(--bd,#dde4f0)}
.sp-t thead th{position:sticky;top:0;background:var(--card,#fff);z-index:3;font-size:11px;line-height:1.15;padding:6px 2px;min-width:36px}
.sp-t td:first-child,.sp-t th:first-child{position:sticky;left:0;z-index:2;background:var(--card,#fff);text-align:left;min-width:128px;max-width:128px;white-space:normal;padding:4px 8px;font-weight:800;font-size:12px}
.sp-t thead th:first-child{z-index:5}.sp-t th.sun{color:var(--r)}.sp-t th.td{background:var(--ac,#1d5fd1);color:#fff;border-radius:8px 8px 0 0}
.sp-t tbody tr:nth-child(even) td{background:var(--bg,#eef2f9)}.sp-t tbody tr:nth-child(even) td:first-child{background:var(--bg,#eef2f9)}
.sp-c{min-width:32px;min-height:36px;padding:0;border-radius:8px;font-weight:800;font-size:12px;border:0;background:transparent;color:var(--tx,#111)}
.sp-c.Б{background:#22c55e;color:#fff}.sp-c.ПД{background:#f59e0b;color:#2b2000}.sp-c.НБ{background:#ef4444;color:#fff}
.sp-c.au{opacity:.45;border:2px dashed currentColor;background:transparent}.sp-c.Б.au{color:#16a34a}.sp-c.ПД.au{color:#c77d00}.sp-c.НБ.au{color:#ef4444}
.sp-c.su:not(.Б):not(.ПД):not(.НБ){color:var(--mu,#64718a)}.sp-c:disabled{opacity:.25}
.sp-t td.tt{font-weight:800;min-width:34px}
.sp-leg{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--mu,#64718a);margin:10px 2px}
.sp-big{font-size:26px;font-weight:900;line-height:1}.sp-big.g{color:var(--g)}.sp-big.r{color:var(--r)}
.sp-qb{display:flex;gap:6px;margin-top:8px}.sp-qb button{flex:1;min-height:44px;padding:4px;font-weight:800;font-size:14px}
.sp-ov{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}
.sp-sh{background:var(--card,#fff);color:var(--tx,#111);width:100%;max-width:560px;max-height:92dvh;overflow:auto;border-radius:24px 24px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px))}
.sp-sh h3{margin:0 0 4px;font-size:19px}.sp-sh label{display:block;font-size:13px;font-weight:700;color:var(--mu,#64718a);margin:12px 2px 4px}
.sp-hh{display:flex;gap:6px;align-items:center}.sp-hh input,.sp-hh select{width:76px;text-align:center}.sp-hh span{font-size:14px;color:var(--mu,#64718a)}
.sp-dr{display:flex;gap:10px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--bd,#dde4f0);cursor:pointer}
.sp-dr .d{width:46px;text-align:center;font-weight:800;line-height:1.1}.sp-dr .d small{display:block;font-weight:600;color:var(--mu,#64718a);font-size:11px}.sp-dr .d.su{color:var(--r)}
.sp-dr .m{flex:1;min-width:0;font-size:13px}
.sp-em{text-align:center;padding:26px 10px;color:var(--mu,#64718a)}
`;
  const ILL = '<svg viewBox="0 0 120 96" aria-hidden="true"><rect x="8" y="58" width="104" height="10" rx="5" fill="#ffffff55"/><path d="M22 58V30h46a12 12 0 0 1 12 12v16" fill="#fff"/><rect x="26" y="34" width="38" height="12" rx="6" fill="#4c8dff"/><rect x="74" y="30" width="6" height="28" fill="#ffd86b"/><path d="M77 58v14" stroke="#fff" stroke-width="3"/><circle cx="96" cy="26" r="13" fill="#ffd86b"/><path d="M96 18v8l6 4" stroke="#7a4b00" stroke-width="3" stroke-linecap="round" fill="none"/></svg>';

  const P = { ctx: null, st: null, inited: false };
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'ru');
  const byOrd = (a, b) => { const o = (P.st && P.st.ord) || {}, x = o[a.staffId], y = o[b.staffId]; return ((x == null ? 1e9 : x) - (y == null ? 1e9 : y)) || byName(a, b) };
  const prevMo = mo => { const [y, m] = mo.split('-').map(Number), d = new Date(y, m - 2, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1) };
  const grp = (a, k) => { const o = {}; (a || []).forEach(x => (o[x[k]] = o[x[k]] || []).push(x)); return o };
  const dm = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? dm(a && a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]) : b[k]; return o };
  const ini = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
  const fromOf = p => typeof p.created === 'number' ? S.dayOf(p.created) : undefined;
  const hhmm = ms => ms ? S.hm(S.minOf(ms)) : '—';
  const thisMo = () => S.dayOf(Date.now()).slice(0, 7);

  function init(ctx) {
    P.ctx = ctx;
    if (!P.st) P.st = { sub: 'day', date: S.dayOf(Date.now()), prof: [], ev: [], docs: {}, prev: null, M: {}, loadedMo: '', loading: false, err: '', unsub: null, unsubD: null, ord: {}, carried: {}, adjBusy: false, mBusy: false };
    if (!P.inited) {
      P.inited = true;
      const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
      document.addEventListener('click', onClick, true);
      document.addEventListener('change', e => { if (e.target.id === 'sp-date' && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value) });
      setInterval(() => { const st = P.st; if (st && st.loadedMo && st.sub === 'day' && document.querySelector('.sp') && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) { calc(); draw() } }, 30000);
    }
  }
  const draw = () => P.ctx.redraw();
  const toast = m => P.ctx.toast(m);

  async function load(force) {
    const st = P.st, ctx = P.ctx, mo = st.date.slice(0, 7);
    if (st.loading) return; st.loading = true; st.err = ''; draw();
    try {
      try { const mt = ctx.api.meta ? await ctx.api.meta() : null; st.ord = (mt && mt.ord) || {} } catch (e) { st.ord = st.ord || {} }
      if (!st.prof.length || force) st.prof = (await ctx.api.profiles()).filter(p => p.active !== false && !p.replacedBy);
      st.prof.sort(byOrd); // порядок как в табеле бухгалтера
      const [ev, docs] = await Promise.all([ctx.api.eventsMonth(mo), ctx.api.daysMonth(mo)]);
      st.ev = ev; st.docs = {}; docs.forEach(d => st.docs[d.uid] = d); st.prev = null;
      { const pm = prevMo(mo), [pe, pd] = await Promise.all([ctx.api.eventsMonth(pm), ctx.api.daysMonth(pm)]); const m = {}; pd.forEach(d => m[d.uid] = d); st.prev = { mo: pm, ev: pe, docs: m } } // прошлый месяц нужен для запаса и для воскресенья первой недели
      st.loadedMo = mo;
    } catch (e) { st.err = e && e.code === 'permission-denied' ? 'Нет доступа. Владельцу нужно опубликовать новые правила Firebase (firestore.rules).' : 'Нет связи. Потяните «Обновить».'; }
    st.loading = false; calc(); await carry(); draw(); watch(); watchDocs();
  }
  function calc() {
    const st = P.st, T = S.times(P.ctx.cfg()), now = Date.now(), mo = st.loadedMo || st.date.slice(0, 7), evBy = grp(st.ev, 'uid');
    const pe = st.prev ? grp(st.prev.ev, 'uid') : null; st.T = T; st.M = {};
    st.prof.forEach(p => {
      let open, prevM;
      if (st.prev) { prevM = S.month({ mo: st.prev.mo, ev: pe[p.id] || [], doc: st.prev.docs[p.id] || {}, T, nowMs: now, from: fromOf(p) }); open = prevM.bal }
      st.M[p.id] = S.month({ mo, ev: evBy[p.id] || [], doc: st.docs[p.id] || {}, T, nowMs: now, from: fromOf(p), open, prevM });
    });
  }
  async function carry() { // перенос запаса с прошлого месяца записываем один раз
    const st = P.st, ctx = P.ctx; if (!ctx.canEdit || !st.prev || st.carried[st.loadedMo] || st.loadedMo > thisMo()) return; st.carried[st.loadedMo] = 1;
    for (const p of st.prof) {
      if (st.docs[p.id] && typeof st.docs[p.id].open === 'number') continue;
      const v = Math.round(st.M[p.id].open); const patch = { open: v };
      try { await ctx.api.saveDay(p.id, st.loadedMo, Object.assign(p.staffId ? { staffId: p.staffId, name: p.name } : { name: p.name }, patch)); st.docs[p.id] = dm(st.docs[p.id] || { uid: p.id }, patch) } catch (e) { break }
    }
    calc();
  }
  function watch() {
    const st = P.st, ctx = P.ctx; if (st.unsub) { st.unsub(); st.unsub = null } if (!ctx.api.watchDay) return;
    const day = st.date;
    st.unsub = ctx.api.watchDay(day, evs => { st.ev = st.ev.filter(e => e.day !== day).concat(evs); calc(); draw() });
  }
  function watchDocs() { // живая синхронизация табеля: правки бухгалтера/другого устройства видны сразу
    const st = P.st, ctx = P.ctx; if (st.unsubD) { st.unsubD(); st.unsubD = null }
    if (!ctx.api.watchDays || !st.loadedMo) return; const mo = st.loadedMo;
    st.unsubD = ctx.api.watchDays(mo, list => { if (st.loadedMo !== mo) return; st.docs = {}; list.forEach(d => st.docs[d.uid] = d); calc(); draw() });
  }
  function setDate(d) { const st = P.st, mo0 = st.loadedMo; st.date = d; if (d.slice(0, 7) !== mo0) { load() } else { watch(); draw() } }

  async function save(p, patch, aud) {
    const st = P.st, ctx = P.ctx; if (!ctx.canEdit) { toast('Только просмотр'); return false }
    const mo = st.loadedMo, rec = Object.assign(p.staffId ? { staffId: p.staffId, name: p.name } : { name: p.name }, patch, { upd: { by: ctx.me(), at: Date.now() } });
    try {
      await ctx.api.saveDay(p.id, mo, rec); st.docs[p.id] = dm(st.docs[p.id] || { uid: p.id }, patch);
      if (aud) ctx.api.audit(Object.assign({ by: ctx.me(), at: Date.now(), name: p.name }, aud)).catch(() => { });
      if (ctx.afterMark && patch.marks) for (const dd in patch.marks) ctx.afterMark(p, mo + '-' + dd, patch.marks[dd]);
      calc(); draw(); return true;
    } catch (e) { console.error('sew save', e); toast(e && e.code === 'permission-denied' ? 'Нет доступа. Проверьте правила Firebase' : 'Нет связи, не сохранено'); return false }
  }
  const setMark = (p, day, code, reason) => { const dd = day.slice(8), prev = ((P.st.docs[p.id] || {}).marks || {})[dd] || ''; return save(p, { marks: { [dd]: code } }, { act: prev ? 'correct' : 'confirm', day, status: code, prev, reason: reason || '' }) };

  // ===== запас часов: атомарная запись (increment) + журнал, без prompt() =====
  const adjDay = () => { const t = S.dayOf(Date.now()); return P.st.loadedMo === t.slice(0, 7) ? t : P.st.loadedMo + '-01' };
  async function reserve(p, delta, why, rem, legacy) {
    const st = P.st, ctx = P.ctx; if (!ctx.canEdit) { toast('Только просмотр'); return false }
    if (st.adjBusy) return false; st.adjBusy = true;
    try {
      delta = Math.round(delta); if (!delta) return false;
      const mo = st.loadedMo, day = rem ? rem.day : adjDay(), dd = day.slice(8), me = ctx.me(), before = Math.round(st.M[p.id].bal);
      const add = (rem || legacy) ? null : { v: delta, n: String(why || '').slice(0, 80), by: me, at: Date.now() };
      if (ctx.api.reserve) await ctx.api.reserve(p.id, mo, dd, delta, add, rem ? rem.entry : null, { staffId: p.staffId, name: p.name, by: me });
      else { const old = ((st.docs[p.id] || {}).ed || {})[dd] || {}; await ctx.api.saveDay(p.id, mo, Object.assign(p.staffId ? { staffId: p.staffId, name: p.name } : { name: p.name }, { ed: { [dd]: { r: (+old.r || 0) + delta } }, upd: { by: me, at: Date.now() } })) }
      // оптимистично обновляем локально (snapshot потом заменит точным значением)
      const d0 = st.docs[p.id] || { uid: p.id }, e0 = Object.assign({}, (d0.ed || {})[dd] || {}); e0.r = (+e0.r || 0) + delta;
      let log = Array.isArray(e0.log) ? e0.log.slice() : [];
      if (add) log.push(add); if (rem && rem.entry) log = log.filter(x => !(x.at === rem.entry.at && x.v === rem.entry.v && x.by === rem.entry.by)); e0.log = log;
      st.docs[p.id] = Object.assign({}, d0, { ed: Object.assign({}, d0.ed || {}, { [dd]: e0 }) });
      calc(); const after = Math.round(st.M[p.id].bal); draw();
      ctx.api.audit(Object.assign({ by: me, at: Date.now(), name: p.name }, { act: rem || legacy ? 'reserve_undo' : 'reserve', day, status: S.bal(delta), prev: S.bal(before), reason: why || '' })).catch(() => { });
      toast(p.name.split(' ')[0] + ': ' + S.bal(before) + ' → ' + S.bal(after)); return true;
    } catch (e) { console.error('sew reserve', e); toast(e && e.code === 'permission-denied' ? 'Нет доступа. Проверьте правила Firebase' : 'Нет связи, не сохранено'); return false }
    finally { st.adjBusy = false }
  }

  // ===== разметка =====
  function hhInputs(id, m) { m = Math.abs(Math.round(m || 0)); return `<div class="sp-hh"><input id="${id}h" type="number" inputmode="numeric" min="0" max="24" placeholder="0" value="${m ? Math.floor(m / 60) : ''}"><span>ч</span><input id="${id}m" type="number" inputmode="numeric" min="0" max="59" placeholder="0" value="${m ? m % 60 : ''}"><span>мин</span></div>` }
  const rdH = id => { const h = document.getElementById(id + 'h').value, m = document.getElementById(id + 'm').value; return (h === '' && m === '') ? null : (Math.max(0, +h || 0) * 60 + Math.max(0, +m || 0)) };
  const balCls = m => m > 0 ? 'g' : m < 0 ? 'r' : '';
  const balChip = m => `<span class="sp-chip ${balCls(Math.round(m))}">Запас: ${S.bal(m)}</span>`;

  function bar(d, T) {
    const a = 420, span = 720, pc = m => Math.max(0, Math.min(100, (m - a) / span * 100));
    let h = `<div class="sp-bar"><div class="w" style="left:${pc(T.start)}%;width:${pc(T.end) - pc(T.start)}%"></div><div class="l" style="left:${pc(T.lunchA)}%;width:${pc(T.lunchB) - pc(T.lunchA)}%"></div>`;
    d.P.forEach(p => { if (p.from != null) h += `<div class="p${p.live ? ' live' : ''}" style="left:${pc(p.from)}%;width:${Math.max(0.6, pc(p.to) - pc(p.from))}%"></div>`; if (p.noout) h += `<div class="x" style="left:${pc(S.minOf(p.in))}%;width:3%"></div>` });
    return h + '</div><div class="sp-sc"><span>07:00</span><span>09:00</span><span>13:00</span><span>17:30</span><span>19:00</span></div>';
  }
  function state(d, isToday) {
    const last = d.P[d.P.length - 1];
    if (!d.att) return isToday ? ['Не пришла', ''] : (d.wd === 0 ? ['Выходной', ''] : ['Не была', 'bad']);
    if (last && last.out == null && (last.live)) return ['🟢 На месте', 'in'];
    if (last && last.noout) return ['⚠ Нет ухода', 'bad'];
    return isToday && d.pend ? ['🟡 Вышла', 'out'] : ['✓ Ушла', 'done'];
  }
  function ticks(d) { return d.evs.length ? `<div class="sp-tk">${d.evs.map((e, i) => `<span class="${i % 2 ? 'o' : 'i'}">${i % 2 ? '🔴' : '🟢'}${e.manual ? '👆' : ''} ${hhmm(e.tms)}${e.far ? ` <small style="color:var(--a,#f5a524)">⚠${Math.round(+e.dist || 0)} м</small>` : ''}</span>`).join('')}</div>` : '' }
  function farRow(p, d) { // отметка с расстояния больше обычного (до 600 м): видна всем, подтверждает владелец
    if (!d.far || !d.far.length) return '';
    const own = P.ctx.canConfirm;
    return d.far.map(f => {
      const lbl = f.st === 'y' ? '✓ подтверждено владельцем' : f.st === 'n' ? '✕ отклонено владельцем' : 'ждёт подтверждения владельца';
      const b = v => `data-sp="cf" data-p="${esc(p.id)}" data-d="${d.day}" data-n="${f.n}" data-v="${v}"`;
      return `<div class="sp-far"><span>⚠ Отметка №${f.n} с расстояния ${f.dist} м от предприятия · <b>${lbl}</b></span>${own ? (f.st ? `<button ${b('')}>Отменить решение</button>` : `<button class="p" ${b('y')}>Подтвердить</button><button ${b('n')}>Отклонить</button>`) : ''}</div>`;
    }).join('');
  }
  function statusBtns(p, d, ed) {
    if (!ed) return '';
    return `<div class="sp-btns">${['Б', 'ПД', 'НБ'].map(c => `<button class="sp-s ${c}${d.status === c ? ' on' : ''}${d.src === 'auto' && d.status === c ? ' pr' : ''}" data-sp="mark" data-p="${esc(p.id)}" data-d="${d.day}" data-v="${c}">${c}</button>`).join('')}<button class="c" data-sp="edit" data-p="${esc(p.id)}" data-d="${d.day}">Изменить</button></div>`;
  }
  function vDay() {
    const st = P.st, T = st.T, ed = P.ctx.canEdit, today = S.dayOf(Date.now()), isToday = st.date === today, idx = +st.date.slice(8) - 1;
    const rows = st.prof.map(p => ({ p, d: st.M[p.id] && st.M[p.id].days[idx] })).filter(x => x.d);
    let came = 0, inside = 0, left = 0, absent = 0, noout = 0;
    rows.forEach(({ d }) => { if (d.att) { came++; const l = d.P[d.P.length - 1]; if (l && l.live) inside++; else left++; if (l && l.noout) noout++ } else if (d.wd !== 0) absent++ });
    const ord = x => { const s = state(x.d, isToday)[1]; return s === 'in' ? 0 : s === 'out' ? 1 : s === 'bad' && x.d.att ? 2 : x.d.att ? 3 : 4 };
    rows.sort((a, b) => ord(a) - ord(b) || byName(a.p, b.p));
    const pend = rows.filter(({ d }) => d.src === 'auto').length;
    const dt = new Date(+st.date.slice(0, 4), +st.date.slice(5, 7) - 1, +st.date.slice(8));
    let h = `<div class="sp-dt"><button data-sp="dprev">‹</button><input id="sp-date" type="date" value="${st.date}"><button data-sp="dnext">›</button><button data-sp="today">Сегодня</button></div>
<div class="sp-kpi"><div class="sp-k"><b>${came}<small style="font-size:13px;color:var(--mu)">/${rows.length}</small></b><span>пришли</span></div><div class="sp-k g"><b>${isToday ? inside : '—'}</b><span>на месте</span></div><div class="sp-k a"><b>${left}</b><span>ушли</span></div><div class="sp-k r"><b>${absent}</b><span>не пришли</span></div></div>`;
    if (noout) h += `<div class="sp-card" style="border-color:var(--r)"><b>⚠ Нет ухода: ${noout}</b><div class="sp-chip" style="margin-top:4px;display:inline-block">Время не засчитано — нажмите «Изменить» и укажите часы</div></div>`;
    if (ed && !isToday || ed && pend) h += `<div class="sp-act">${pend ? `<button class="p" data-sp="okall">✓ Подтвердить предложенные (${pend})</button>` : ''}<button data-sp="allb">Всем Б (праздник)</button></div>`;
    if (!rows.length) return h + '<div class="sp-em">Сотрудников нет</div>';
    h += rows.map(({ p, d }) => {
      const [lb, cl] = state(d, isToday), tot = d.W, M = st.M[p.id];
      return `<div class="sp-card"><div class="sp-top"><div class="sp-av">${esc(ini(p.name))}</div><div class="sp-nm" data-sp="who" data-p="${esc(p.id)}">${esc(p.name)}<small>${d.att ? 'Отработано ' + S.dur(tot) : (dt.getDay() === 0 ? 'Воскресенье' : 'Нет отметок')}${d.fix ? ' · правка' : ''}</small></div><span class="sp-badge ${cl}">${lb}</span></div>
${bar(d, T)}${ticks(d)}${farRow(p, d)}<div class="sp-ln">${d.att ? '' : ''}${balChip(M.bal)}${d.flags.late && d.att ? '<span class="sp-chip a">опоздание</span>' : ''}${d.flags.early ? '<span class="sp-chip a">ранний уход</span>' : ''}${d.covered ? '<span class="sp-chip g">день закрыт запасом</span>' : ''}${d.r ? `<span class="sp-chip ${d.r > 0 ? 'g' : 'r'}">${S.bal(d.r)} вручную</span>` : ''}${d.note ? `<span class="sp-chip">${esc(d.note)}</span>` : ''}</div>${statusBtns(p, d, ed)}</div>`;
    }).join('');
    return h;
  }
  function vMon() {
    const st = P.st, mo = st.loadedMo || st.date.slice(0, 7), nd = new Date(+mo.slice(0, 4), +mo.slice(5, 7), 0).getDate(), ed = P.ctx.canEdit, today = S.dayOf(Date.now());
    const [y, m] = mo.split('-').map(Number), names = new Date(y, m - 1, 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' });
    let h = `<div class="sp-dt"><button data-sp="mprev">‹</button><b style="flex:1;text-align:center;text-transform:capitalize">${esc(names)}</b><button data-sp="mnext">›</button></div>
<div class="sp-leg"><span>Нажмите на клетку: пусто → Б → ПД → НБ</span><span>▫ пунктир = предложено автоматически</span></div><div class="sp-tw"><table class="sp-t"><thead><tr><th>Сотрудник</th>`;
    for (let d = 1; d <= nd; d++) { const wd = new Date(y, m - 1, d).getDay(); h += `<th class="${wd === 0 ? 'sun' : ''}${mo + '-' + pad(d) === today ? ' td' : ''}">${WD[wd]}<br>${d}</th>` }
    h += '<th>Б</th><th>ПД</th><th>НБ</th><th>Часы</th><th>Запас</th></tr></thead><tbody>';
    let rn = 0;
    st.prof.forEach(p => {
      const M = st.M[p.id]; if (!M) return; rn++;
      h += `<tr><td data-sp="who" data-p="${esc(p.id)}">${rn}. ${esc(p.name)}</td>`;
      M.days.forEach(d => {
        const dis = d.future || (d.pre && d.wd !== 0); const lbl = d.status || '·';
        h += `<td><button class="sp-c ${d.status}${d.src === 'auto' ? ' au' : ''}${d.wd === 0 ? ' su' : ''}" data-sp="cell" data-p="${esc(p.id)}" data-d="${d.day}" ${dis || !ed ? 'disabled' : ''}>${lbl}</button></td>`;
      });
      h += `<td class="tt" style="color:var(--g)">${M.S.b}</td><td class="tt" style="color:#c77d00">${M.S.pd}</td><td class="tt" style="color:var(--r)">${M.S.nb}</td><td class="tt">${Math.round(M.S.w / 6) / 10}</td><td class="tt" style="color:var(${M.bal < 0 ? '--r' : '--g'})">${S.bal(M.bal)}</td></tr>`;
    });
    return h + '</tbody></table></div><div class="sp-leg"><span><b style="color:var(--g)">Б</b> — был полный день</span><span><b style="color:#c77d00">ПД</b> — полдня</span><span><b style="color:var(--r)">НБ</b> — не был</span><span>Часы — отработано за месяц</span></div>';
  }
  function vRes() {
    const st = P.st, ed = P.ctx.canEdit, list = st.prof.map(p => ({ p, M: st.M[p.id] })).filter(x => x.M).sort((a, b) => a.M.bal - b.M.bal);
    const minus = list.filter(x => x.M.bal < 0).length, plus = list.filter(x => x.M.bal > 0).length;
    let h = `<div class="sp-kpi" style="grid-template-columns:repeat(3,1fr)"><div class="sp-k g"><b>${plus}</b><span>есть запас</span></div><div class="sp-k r"><b>${minus}</b><span>в минусе</span></div><div class="sp-k"><b>${list.length - plus - minus}</b><span>ровно 0</span></div></div>
<div class="sp-leg"><span>Запас = часы, которые швея может «отгулять». Растёт от воскресной работы и ручных добавлений, тратится, когда она уходит раньше, а день закрыт как «Б». Если запаса не хватает, он уходит в минус.</span></div>`;
    h += list.map(({ p, M }) => `<div class="sp-card"><div class="sp-top"><div class="sp-av">${esc(ini(p.name))}</div><div class="sp-nm" data-sp="who" data-p="${esc(p.id)}">${esc(p.name)}<small>за месяц: Б ${M.S.b} · ПД ${M.S.pd} · НБ ${M.S.nb} · перенос ${S.bal(M.open)}</small></div><div style="text-align:right"><div class="sp-big ${balCls(Math.round(M.bal))}">${S.bal(M.bal)}</div></div></div>
${ed ? `<div class="sp-qb">${[[-60, '−1 ч'], [-30, '−30'], [30, '+30'], [60, '+1 ч'], [90, '+1:30']].map(([v, t]) => `<button data-sp="adj" data-p="${esc(p.id)}" data-v="${v}">${t}</button>`).join('')}<button data-sp="adjs" data-p="${esc(p.id)}">⚙</button></div>` : ''}</div>`).join('');
    return h || '<div class="sp-em">Сотрудников нет</div>';
  }

  function html() {
    const st = P.st, ed = P.ctx.canEdit; if (!st) return '';
    if (!st.loadedMo && !st.loading) setTimeout(load, 0);
    const T = [['day', 'Сегодня'], ['mon', 'Табель'], ['res', 'Запас часов']];
    let h = `<div class="sp"><div class="sp-hero">${ILL}<div><b>Табель швей</b><span>${ed ? 'Отмечайте Б / ПД / НБ и правьте часы' : 'Просмотр: кто когда пришёл и ушёл'}</span></div></div>
<div class="sp-tabs">${T.map(([k, n]) => `<button class="${st.sub === k ? 'p' : ''}" data-sp="sub" data-v="${k}">${n}</button>`).join('')}<button data-sp="refresh" title="Обновить">↻</button></div>`;
    if (st.err) h += `<div class="sp-card" style="border-color:var(--r);color:var(--r)">${esc(st.err)}</div>`;
    if (st.loading && !st.loadedMo) h += '<div class="sp-em">Загрузка…</div>';
    else if (st.loadedMo) h += st.sub === 'day' ? vDay() : st.sub === 'mon' ? vMon() : vRes();
    return h + '</div>';
  }

  // ===== окна =====
  function sheet(inner) { closeSheet(); const o = document.createElement('div'); o.className = 'sp-ov'; o.id = 'sp-ov'; o.innerHTML = '<div class="sp-sh">' + inner + '</div>'; o.addEventListener('click', e => { if (e.target === o) closeSheet() }); document.body.appendChild(o) }
  const closeSheet = () => { const o = document.getElementById('sp-ov'); if (o) o.remove() };
  const pf = id => P.st.prof.find(p => p.id === id);
  function dayOf(pid, day) { return P.st.M[pid].days[+day.slice(8) - 1] }

  const okT = s => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);
  function pairRows(d, e) { // текущие пары прихода/ухода дня (из сканов или ручные)
    let rows;
    if (Array.isArray(e.tm) && e.tm.length) rows = e.tm.map(x => ({ a: x.a || '', b: x.b || '' }));
    else if (okT(e.tin)) rows = [{ a: e.tin, b: e.tout || '' }];
    else rows = d.P.map(x => ({ a: hhmm(x.in), b: x.out ? hhmm(x.out) : '' }));
    while (rows.length < 3) rows.push({ a: '', b: '' });
    return rows.slice(0, 3);
  }
  function editSheet(pid, day) {
    const p = pf(pid), d = dayOf(pid, day), e = ((P.st.docs[pid] || {}).ed || {})[d.dd] || {}, auto = (() => { const pr = S.pairs(d.evs, P.st.T, Date.now(), day === S.dayOf(Date.now())); return pr.W })();
    const dt = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8));
    sheet(`<h3>${esc(p.name)}</h3><div class="mu" style="color:var(--mu)">${WD[dt.getDay()]}, ${day.slice(8)}.${day.slice(5, 7)}.${day.slice(0, 4)} · засчитано автоматически: <b>${S.dur(auto)}</b></div>${ticks(d)}
<label>Приход и уход (до 3 пар, например 09:00–13:00 и 16:00–17:30)</label>${pairRows(d, e).map((r, i) => `<div class="sp-hh" style="margin-bottom:6px"><span style="align-self:center;color:var(--mu);min-width:20px">${i + 1}</span><input type="time" id="sp-ta${i}" value="${esc(r.a)}" style="flex:1"><input type="time" id="sp-tb${i}" value="${esc(r.b)}" style="flex:1"></div>`).join('')}
<label>Фактически отработано (оставьте пусто — считать по отметкам)</label>${hhInputs('sp-ew', d.fix ? d.W : null)}
<label>Запас часов за этот день: добавить (+) или списать (−)</label><div class="sp-hh"><select id="sp-ers"><option value="1"${(e.r || 0) >= 0 ? ' selected' : ''}>+</option><option value="-1"${(e.r || 0) < 0 ? ' selected' : ''}>−</option></select>${hhInputs('sp-er', Math.abs(e.r || 0)).replace('<div class="sp-hh">', '<div class="sp-hh" style="flex:1">')}</div>
<label>Причина / заметка</label><input id="sp-en" maxlength="80" value="${esc(e.n || '')}" placeholder="например: забыла отсканировать уход">
<div class="sp-act" style="margin-top:14px"><button class="p" data-sp="esave" data-p="${esc(pid)}" data-d="${day}">Сохранить</button><button data-sp="ereset" data-p="${esc(pid)}" data-d="${day}">Сбросить</button><button data-sp="close">Закрыть</button></div>`);
  }
  function whoSheet(pid) {
    const p = pf(pid), M = P.st.M[pid], ed = P.ctx.canEdit;
    const rows = M.days.filter(d => !d.future && !d.pre).reverse().map(d => `<div class="sp-dr" data-sp="${ed ? 'edit' : 'x'}" data-p="${esc(pid)}" data-d="${d.day}"><div class="d ${d.wd === 0 ? 'su' : ''}">${d.dd}<small>${WD[d.wd]}</small></div><div class="m">${d.evs.length ? d.evs.map((e, i) => (i % 2 ? '🔴' : '🟢') + hhmm(e.tms)).join(' ') : '<span style="color:var(--mu)">нет отметок</span>'}<br><b>${d.att ? S.dur(d.W) : '—'}</b>${d.flags.noout ? ' ⚠ нет ухода' : ''}${d.r ? ' · ' + S.bal(d.r) + ' ручн.' : ''}</div><span class="sp-chip ${d.status === 'Б' ? 'g' : d.status === 'НБ' ? 'r' : d.status ? 'a' : ''}" style="${d.src === 'auto' ? 'opacity:.6' : ''}">${d.status || '—'}</span></div>`).join('');
    const btnBox = (ed && P.ctx.api.setProfile) ? `<div class="sp-far"><span>👆 Кнопка «Я пришёл / Я ушёл» без сканера и GPS (если не открывается камера или GPS неточный): <b>${p.btn ? 'включена' : 'выключена'}</b></span><button class="${p.btn ? '' : 'p'}" data-sp="btn" data-p="${esc(pid)}" data-v="${p.btn ? '0' : '1'}">${p.btn ? 'Выключить' : 'Включить'}</button></div>` : '';
    sheet(`<h3>${esc(p.name)}</h3><div class="sp-ln" style="margin-top:6px">${balChip(M.bal)}<span class="sp-chip g">Б ${M.S.b}</span><span class="sp-chip a">ПД ${M.S.pd}</span><span class="sp-chip r">НБ ${M.S.nb}</span><span class="sp-chip">${S.dur(M.S.w)}</span></div>${btnBox}${rows || '<div class="sp-em">Нет данных</div>'}<div class="sp-act" style="margin-top:12px"><button data-sp="close">Закрыть</button></div>`);
  }

  function adjSheet(pid) {
    const p = pf(pid), M = P.st.M[pid], ed = (P.st.docs[pid] || {}).ed || {}, items = [];
    Object.keys(ed).sort().reverse().forEach(dd => {
      const e = ed[dd] || {}, log = Array.isArray(e.log) ? e.log : [], r = Math.round(+e.r || 0), leg = r - Math.round(log.reduce((n, x) => n + (+x.v || 0), 0)), day = P.st.loadedMo + '-' + dd;
      log.forEach((x, i) => items.push(`<div class="sp-dr" style="cursor:default"><div class="d">${dd}<small>${P.st.loadedMo.slice(5)}</small></div><div class="m"><b class="${x.v > 0 ? '' : ''}" style="color:var(--${x.v > 0 ? 'g' : 'r'})">${S.bal(x.v)}</b>${x.n ? ' · ' + esc(x.n) : ''}<br><small style="color:var(--mu)">${esc(x.by || '')}${x.at ? ' · ' + hhmm(x.at) : ''}</small></div><button data-sp="adjundo" data-p="${esc(pid)}" data-d="${day}" data-i="${i}" style="min-height:40px;padding:4px 10px">Отменить</button></div>`));
      if (leg) items.push(`<div class="sp-dr" style="cursor:default"><div class="d">${dd}<small>${P.st.loadedMo.slice(5)}</small></div><div class="m"><b style="color:var(--${leg > 0 ? 'g' : 'r'})">${S.bal(leg)}</b>${e.n ? ' · ' + esc(e.n) : ''}<br><small style="color:var(--mu)">ранее / правка за день</small></div><button data-sp="adjundo" data-p="${esc(pid)}" data-d="${day}" data-i="L" style="min-height:40px;padding:4px 10px">Обнулить</button></div>`);
    });
    const o = Math.round(M.open), sgn = (id, neg) => `<select id="${id}"><option value="1"${neg ? '' : ' selected'}>+</option><option value="-1"${neg ? ' selected' : ''}>−</option></select>`;
    sheet(`<h3>${esc(p.name)}</h3><div class="sp-ln">${balChip(M.bal)}</div>
<label>Добавить (+) или списать (−) запас</label><div class="sp-hh">${sgn('sp-as', false)}${hhInputs('sp-a', 0).replace('<div class="sp-hh">', '<div class="sp-hh" style="flex:1">')}</div>
<label>Причина (необязательно)</label><input id="sp-an" maxlength="80" placeholder="например: ушла раньше по просьбе">
<div class="sp-act" style="margin-top:12px"><button class="p" data-sp="adjgo" data-p="${esc(pid)}">Применить</button></div>
<label>Перенос с прошлого месяца</label><div class="sp-hh">${sgn('sp-os', o < 0)}${hhInputs('sp-o', o).replace('<div class="sp-hh">', '<div class="sp-hh" style="flex:1">')}</div>
<div class="sp-act" style="margin-top:8px"><button data-sp="opensave" data-p="${esc(pid)}">Сохранить перенос</button></div>
<label>Журнал правок за месяц</label>${items.join('') || '<div class="sp-em" style="padding:12px">Правок нет</div>'}
<div class="sp-act" style="margin-top:12px"><button data-sp="close">Закрыть</button></div>`);
  }

  async function onClick(e) {
    const t = e.target.closest('[data-sp]'); if (!t || !P.ctx) return; e.stopPropagation(); e.preventDefault();
    const d = t.dataset, st = P.st, a = d.sp, ctx = P.ctx;
    if (a === 'sub') { st.sub = d.v; draw(); return }
    if (a === 'refresh') { st.carried = {}; load(true); return }
    if (a === 'today') { setDate(S.dayOf(Date.now())); return }
    if (a === 'dprev' || a === 'dnext') { const x = new Date(st.date + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + (a === 'dnext' ? 1 : -1)); setDate(x.toISOString().slice(0, 10)); return }
    if (a === 'mprev' || a === 'mnext') { const [y, m] = (st.loadedMo || st.date.slice(0, 7)).split('-').map(Number), n = new Date(y, m - 1 + (a === 'mnext' ? 1 : -1), 1); setDate(n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-01'); return }
    if (a === 'close') { closeSheet(); return }
    if (a === 'who') { whoSheet(d.p); return }
    if (a === 'cf') { // владелец подтверждает / отклоняет отметку с большого расстояния
      if (!ctx.canConfirm) return; const p = pf(d.p), dd = d.d.slice(8);
      await save(p, { ed: { [dd]: { cf: { [d.n]: d.v || null } } } }, { act: 'far_confirm', day: d.d, status: d.v === 'y' ? 'подтверждено' : d.v === 'n' ? 'отклонено' : 'решение отменено', prev: 'отметка №' + d.n, reason: '' }); return;
    }
    if (a === 'btn') { // кнопка «Я пришёл / Я ушёл» без сканера и GPS
      if (!ctx.canEdit || !ctx.api.setProfile) return; const p = pf(d.p), on = d.v === '1';
      try { await ctx.api.setProfile(p.id, { btn: on }); p.btn = on; ctx.api.audit({ by: ctx.me(), at: Date.now(), name: p.name, act: 'btn_access', day: S.dayOf(Date.now()), status: on ? 'включена кнопка' : 'выключена кнопка', prev: '', reason: '' }).catch(() => { }); whoSheet(p.id); toast(on ? 'Кнопка «Я пришёл» включена' : 'Кнопка выключена') }
      catch (e) { toast('Нет доступа') } return;
    }
    if (a === 'edit') { if (!ctx.canEdit) return; editSheet(d.p, d.d); return }
    if (a === 'mark') { if (st.mBusy) return; st.mBusy = true; try { const p = pf(d.p), cur = ((st.docs[p.id] || {}).marks || {})[d.d.slice(8)] || ''; await setMark(p, d.d, S.nm(cur) === d.v ? '' : d.v) } finally { st.mBusy = false } return }
    if (a === 'cell') { if (st.mBusy) return; st.mBusy = true; try { const p = pf(d.p), cur = S.nm(((st.docs[p.id] || {}).marks || {})[d.d.slice(8)] || ''); await setMark(p, d.d, CODES[(CODES.indexOf(cur) + 1) % 4]) } finally { st.mBusy = false } return }
    if (a === 'okall') {
      const idx = +st.date.slice(8) - 1; let n = 0;
      for (const p of st.prof) { const x = st.M[p.id].days[idx]; if (x && x.src === 'auto' && x.status) { if (await setMark(p, st.date, x.status)) n++ } }
      toast('Подтверждено: ' + n); return;
    }
    if (a === 'allb') {
      if (!confirm('Отметить «Б» всем, у кого нет отметки за ' + st.date + '? (например, праздничный день)')) return;
      const idx = +st.date.slice(8) - 1; let n = 0;
      for (const p of st.prof) { const x = st.M[p.id].days[idx]; if (x && !x.mark) { if (await setMark(p, st.date, 'Б', 'Всем Б')) n++ } }
      toast('Отмечено: ' + n); return;
    }
    if (a === 'adj') { await reserve(pf(d.p), +d.v, 'Быстрая правка'); return }
    if (a === 'adjs') { if (ctx.canEdit) adjSheet(d.p); return }
    if (a === 'adjgo') {
      const p = pf(d.p), m = rdH('sp-a'), sg = +document.getElementById('sp-as').value, why = document.getElementById('sp-an').value.trim();
      if (!m) { toast('Укажите время'); return }
      if (await reserve(p, sg * m, why)) adjSheet(d.p); return;
    }
    if (a === 'adjundo') {
      const p = pf(d.p), e0 = (((st.docs[p.id] || {}).ed || {})[d.d.slice(8)]) || {}, log = Array.isArray(e0.log) ? e0.log : [];
      if (d.i === 'L') { const leg = Math.round(+e0.r || 0) - Math.round(log.reduce((n, x) => n + (+x.v || 0), 0)); if (leg && await reserve(p, -leg, 'Отмена', null, true)) adjSheet(d.p); return }
      const x = log[+d.i]; if (!x) return;
      if (await reserve(p, -x.v, 'Отмена', { day: d.d, entry: x })) adjSheet(d.p); return;
    }
    if (a === 'opensave') {
      const p = pf(d.p), cur = Math.round(st.M[p.id].open), m = rdH('sp-o') || 0, n = m * +document.getElementById('sp-os').value;
      if (await save(p, { open: n }, { act: 'open_balance', day: st.loadedMo, status: S.bal(n), prev: S.bal(cur), reason: '' })) { toast('Перенос сохранён'); adjSheet(d.p) } return;
    }
    if (a === 'esave' || a === 'ereset') {
      const p = pf(d.p), dd = d.d.slice(8); let rec;
      if (a === 'ereset') rec = { w: null, r: 0, n: '', log: [], tin: null, tout: null, tm: null };
      else {
        const w = rdH('sp-ew'), r = rdH('sp-er'), sign = +document.getElementById('sp-ers').value, note = document.getElementById('sp-en').value.trim().slice(0, 80);
        if ((w !== null || r) && !note) { toast('Укажите причину'); return }
        const dm = dayOf(p.id, d.d), e0 = ((st.docs[p.id] || {}).ed || {})[dd] || {}, before = pairRows(dm, e0).filter(x => x.a);
        const tm = []; let bad = '';
        for (let i = 0; i < 3 && !bad; i++) {
          const a = document.getElementById('sp-ta' + i).value, b = document.getElementById('sp-tb' + i).value;
          if (!a && !b) continue;
          if (!a) bad = 'Укажите приход в паре ' + (i + 1); else if (b && b <= a) bad = 'Уход должен быть позже прихода (пара ' + (i + 1) + ')';
          else if (tm.length && (!tm[tm.length - 1].b || a < tm[tm.length - 1].b)) bad = 'Пара ' + (i + 1) + ': приход должен быть после предыдущего ухода';
          else tm.push(b ? { a, b } : { a });
        }
        if (bad) { toast(bad); return }
        const same = !(Array.isArray(e0.tm) && e0.tm.length) && !okT(e0.tin) && JSON.stringify(tm.map(x => ({ a: x.a, b: x.b || '' }))) === JSON.stringify(before);
        rec = { w: w === null ? null : w, r: (r || 0) * sign, n: note, tm: tm.length && !same ? tm : null, tin: null, tout: null };
      }
      rec.by = ctx.me(); rec.at = Date.now();
      if (await save(p, { ed: { [dd]: rec } }, { act: 'edit_hours', day: d.d, status: (rec.tm ? rec.tm.map(x => x.a + '–' + (x.b || '…')).join(', ') + ' ' : '') + (rec.w == null ? 'авто' : S.dur(rec.w)), prev: '', reason: rec.n })) { closeSheet(); toast('Сохранено') } return;
    }
  }
  g.SEWPANEL = { init, html, load, reset() { if (P.st) { P.st.loadedMo = ''; P.st.carried = {}; if (P.st.unsub) { P.st.unsub(); P.st.unsub = null } if (P.st.unsubD) { P.st.unsubD(); P.st.unsubD = null } } }, closeSheet };
})(window);
