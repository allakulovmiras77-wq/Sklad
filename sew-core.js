/* sew-core.js — расчёт рабочего времени швей. Общий для sewing.html и index.html.
   Правила: работа 09:00–17:30, обед 13:00–13:30 (не считается), до 09:00 и после 17:30 не считается.
   Отметок в день сколько угодно: 1-я = приход, 2-я = уход, 3-я = приход, ... */
(function (g) {
  const OFF = 5 * 3600000, pad = n => String(n).padStart(2, '0');
  const SUN_CREDIT = true; // отработанные минуты в воскресенье идут в запас часов
  const minOf = ms => ((((ms + OFF) % 864e5) + 864e5) % 864e5) / 6e4;
  const dayOf = ms => new Date(ms + OFF).toISOString().slice(0, 10);
  const toMin = (s, d) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : d };
  const hm = m => pad(Math.floor(m / 60)) + ':' + pad(Math.floor(m % 60));
  const nm = c => (c === 'П' ? 'Б' : c === 'В' ? '' : (c || ''));

  function times(cfg) {
    cfg = cfg || {};
    const T = {
      start: toMin(cfg.lateAfter, 540), end: toMin(cfg.earlyBefore, 1050),
      lunchA: toMin(cfg.lunchFrom, 780), lunchB: toMin(cfg.lunchTo, 810),
      open: Math.min(Number.isInteger(cfg.openMin) ? cfg.openMin : 420, 420),
      half: +cfg.halfMinutes > 0 ? +cfg.halfMinutes : 180
    };
    T.req = (T.end - T.start) - (T.lunchB - T.lunchA);
    return T;
  }
  const ov = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));

  // Пары приход/уход одного дня -> засчитанные минуты
  function pairs(evs, T, nowMs, isToday) {
    const P = []; let W = 0; const nowMin = minOf(nowMs);
    for (let i = 0; i < evs.length; i += 2) {
      const a = evs[i], b = evs[i + 1], s = minOf(a.tms);
      let f = b ? minOf(b.tms) : null, live = false, noout = false;
      if (!b) { if (isToday && nowMin < T.end) { f = nowMin; live = true } else noout = true }
      let m = 0, from = null, to = null;
      if (f != null) {
        from = Math.max(s, T.start); to = Math.min(f, T.end);
        if (to > from) m = (to - from) - ov(from, to, T.lunchA, T.lunchB); else { from = to = null }
      }
      W += m; P.push({ in: a.tms, out: b ? b.tms : null, m, from, to, live, noout });
    }
    return { P, W: Math.round(W) };
  }

  // Расчёт месяца для одной швеи
  // o: {mo, ev:[события швеи за месяц], doc:{marks,ed,open}, T, nowMs, from:'YYYY-MM-DD', open:число|undefined (перенос)}
  function month(o) {
    const { mo, T, nowMs } = o, doc = o.doc || {}, ev = o.ev || [];
    const [Y, M] = mo.split('-').map(Number), nd = new Date(Y, M, 0).getDate();
    const today = dayOf(nowMs), nowMin = minOf(nowMs), by = {};
    ev.forEach(e => (by[e.day] = by[e.day] || []).push(e));
    const marks = doc.marks || {}, ed = doc.ed || {};
    const open = typeof doc.open === 'number' ? doc.open : (+o.open || 0);
    let bal = open; const days = [], S = { b: 0, pd: 0, nb: 0, w: 0, att: 0, plus: 0, minus: 0 };
    for (let d = 1; d <= nd; d++) {
      const dd = pad(d), day = mo + '-' + dd, wd = new Date(Y, M - 1, d).getDay(), R = wd === 0 ? 0 : T.req;
      const evs = (by[day] || []).slice().sort((a, b) => (a.n - b.n) || (a.tms - b.tms));
      const isToday = day === today, future = day > today, pre = !!o.from && day < o.from;
      const pr = pairs(evs, T, nowMs, isToday), e = ed[dd] || {}, fix = typeof e.w === 'number';
      const W = fix ? e.w : pr.W, att = evs.length > 0 || fix, pend = isToday && nowMin < T.end;
      const mark = nm(marks[dd]), balBefore = bal;
      let prop = '';
      if (!future && !pre && wd !== 0) {
        if (!att) { if (!pend) prop = 'НБ' }
        else if (!pend) prop = (W >= R || W + Math.max(0, balBefore) >= R) ? 'Б' : (W >= T.half ? 'ПД' : 'НБ');
      }
      const status = mark || prop, src = mark ? 'mark' : (prop ? 'auto' : '');
      const r = +e.r || 0; let c = 0;
      if (!future && !pre) {
        if (wd === 0) { if (SUN_CREDIT && att && !pend) c = W }
        else if (status === 'Б' && att && !pend) c = W - R;
      }
      c += r; bal += c;
      const first = pr.P[0], lastP = pr.P[pr.P.length - 1];
      const flags = {
        late: !!first && minOf(first.in) > T.start + 1, noout: pr.P.some(p => p.noout) && !pend,
        early: !!lastP && lastP.out != null && minOf(lastP.out) < T.end - 1 && W < R,
        inside: pr.P.length > 0 && pr.P[pr.P.length - 1].out == null && !!(lastP && (lastP.live || lastP.noout))
      };
      const dayRec = { d, dd, day, wd, R, W, P: pr.P, evs, att, status, src, prop, mark, c, r, bal, balBefore, fix, note: e.n || '', pend, future, pre, flags,
        covered: status === 'Б' && att && !pend && wd !== 0 && W < R };
      days.push(dayRec);
      if (!future && !pre) {
        if (wd !== 0) { if (status === 'Б') S.b++; else if (status === 'ПД') S.pd++; else if (status === 'НБ') S.nb++ }
        if (att) S.att++; S.w += W; if (c > 0) S.plus += c; else S.minus += c;
      }
    }
    return { mo, nd, days, open, bal, S };
  }

  // Оценка зарплаты (повторяет логику бухгалтерии: воскресенье = Б, если за пн–сб набрано ≥ 4.5 дня)
  function pay(cur, prev, rate, nowMs) {
    if (!rate) return null;
    const today = dayOf(nowMs), val = c => c === 'Б' ? 1 : c === 'ПД' ? .5 : 0;
    const get = day => { const m = day.slice(0, 7); const src = m === cur.mo ? cur : (prev && m === prev.mo ? prev : null); return src ? src.days[+day.slice(8) - 1] : null };
    let P = 0, H = 0, A = 0, Sn = 0;
    cur.days.forEach(x => {
      if (x.future || x.pre || x.day >= today) return;
      if (x.wd === 0) {
        if (x.mark) { if (x.mark === 'Б') P++; else if (x.mark === 'ПД') H++; else if (x.mark === 'НБ') A++; return }
        let t = 0;
        for (let b = 1; b <= 6; b++) { const dt = new Date(Date.UTC(+x.day.slice(0, 4), +x.day.slice(5, 7) - 1, +x.day.slice(8) - b)).toISOString().slice(0, 10), y = get(dt); if (y) t += val(y.status) }
        if (t >= 4.5) P++; else Sn++;
      } else { if (x.status === 'Б') P++; else if (x.status === 'ПД') H++; else if (x.status === 'НБ') A++ }
    });
    const base = +rate.pay || 0, r = +rate.ded || 66000, adv = +rate.adv || 0, bonus = +rate.bonus || 0, fine = +rate.fine || 0;
    let gross, ded = 0;
    if (rate.type === 'day') gross = base * (P + H * .5); else { ded = r * (A + H * .5 + Sn); gross = Math.max(0, base - ded) }
    return { P, H, A, Sn, base, ded: Math.round(ded), gross: Math.round(gross), bonus, fine, adv, net: Math.round(gross + bonus - fine - adv), type: rate.type || 'month' };
  }

  // Подписи
  const U = { ru: { h: 'ч', m: 'мин' }, uz: { h: 'soat', m: 'daq' } };
  function dur(m, L) {
    const u = U[L] || U.ru; m = Math.round(Math.abs(m)); const h = Math.floor(m / 60), r = m % 60;
    return ((h ? h + ' ' + u.h + ' ' : '') + ((r || !h) ? r + ' ' + u.m : '')).trim();
  }
  const bal = (m, L) => { m = Math.round(m); return m === 0 ? '0' : (m > 0 ? '+' : '−') + dur(m, L) };

  g.SEW = { minOf, dayOf, toMin, hm, times, pairs, month, pay, dur, bal, nm, pad, SUN_CREDIT };
})(typeof window !== 'undefined' ? window : globalThis);
