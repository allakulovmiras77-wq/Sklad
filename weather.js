/* weather.js — погода по месту, где находится сотрудник (по его телефону). Общий для всех панелей.
   Место определяется только на устройстве и нигде не сохраняется на сервере. Прогноз: Open-Meteo (без ключа).
   Подключение: <script src="weather.js"></script> и <span id="wx"></span> в шапке (кому не хватает — добавится само). */
(function (g) {
  'use strict';
  const API = 'https://api.open-meteo.com/v1/forecast', API_KEY = '', // для коммерческого использования Open-Meteo: ключ тарифа и адрес https://customer-api.open-meteo.com/v1/forecast
    GEO = 'https://api.bigdatacloud.net/data/reverse-geocode-client', TTL = 20 * 60000, LS = k => { try { return localStorage.getItem(k) } catch (e) { return null } },
    LSS = (k, v) => { try { localStorage.setItem(k, v) } catch (e) { } }, J = s => { try { return JSON.parse(s) } catch (e) { return null } };
  const Z = { // тексты
    ru: { off: 'Включить погоду', ld: 'Погода…', ttl: 'Погода', fl: 'Ощущается', wd: 'Ветер', hu: 'Влажность', rp: 'Дождь', td: 'Сегодня', tm: 'Завтра', nw: 'Сейчас', up: 'Обновлено', rf: 'Обновить', lc: 'Определить моё место', cl: 'Закрыть', ms: 'м/с', sg: 'Определено по вашему телефону', ss: 'Последнее известное место', sf: 'Место предприятия (геолокация выключена)', no: 'Нет сети — показаны сохранённые данные', se: 'Нет данных. Проверьте интернет', ge: 'Разрешите доступ к местоположению в настройках телефона или браузера', dt: 'Данные: Open-Meteo', unk: 'Ваше местоположение', hr: 'По часам', dy: 'Ближайшие дни', yr: 'Определяем место…', fb: 'по предприятию', hn: 'Показана погода предприятия. Нажмите «Определить моё место», чтобы видеть погоду там, где вы находитесь',
      d_clear: 'Ясно', d_mainly: 'Малооблачно', d_partly: 'Переменная облачность', d_overcast: 'Пасмурно', d_fog: 'Туман', d_drizzle: 'Морось', d_rain: 'Дождь', d_snow: 'Снег', d_showers: 'Ливень', d_snowshowers: 'Снегопад', d_thunder: 'Гроза',
      t_thunder: 'Гроза — без нужды не выходите на улицу', t_rain: 'Ожидается дождь — возьмите зонт', t_rainat: 'Около {t} дождь — возьмите зонт', t_snow: 'Ожидается снег — оденьтесь теплее', t_hot: 'Сильная жара — пейте больше воды', t_cold: 'Холодно — тёплая одежда', t_wind: 'Сильный ветер', t_fog: 'Туман — осторожнее на дороге', t_ok: 'Погода хорошая' },
    uz: { off: 'Ob-havoni yoqish', ld: 'Ob-havo…', ttl: 'Ob-havo', fl: 'His qilinadi', wd: 'Shamol', hu: 'Namlik', rp: 'Yomg‘ir', td: 'Bugun', tm: 'Ertaga', nw: 'Hozir', up: 'Yangilandi', rf: 'Yangilash', lc: 'Joylashuvimni aniqlash', cl: 'Yopish', ms: 'm/s', sg: 'Telefoningiz bo‘yicha aniqlandi', ss: 'Oxirgi ma’lum joy', sf: 'Korxona joyi (geolokatsiya o‘chiq)', no: 'Tarmoq yo‘q — saqlangan ma’lumot ko‘rsatilmoqda', se: 'Ma’lumot yo‘q. Internetni tekshiring', ge: 'Telefon yoki brauzer sozlamalarida joylashuvga ruxsat bering', dt: 'Ma’lumot: Open-Meteo', unk: 'Sizning joylashuvingiz', hr: 'Soatlar bo‘yicha', dy: 'Keyingi kunlar', yr: 'Joy aniqlanmoqda…', fb: 'korxona bo‘yicha', hn: 'Korxona ob-havosi ko‘rsatilmoqda. Qayerda ekaningizni ko‘rish uchun «Joylashuvimni aniqlash» tugmasini bosing',
      d_clear: 'Ochiq', d_mainly: 'Asosan ochiq', d_partly: 'Qisman bulutli', d_overcast: 'Bulutli', d_fog: 'Tuman', d_drizzle: 'Mayda yomg‘ir', d_rain: 'Yomg‘ir', d_snow: 'Qor', d_showers: 'Jala', d_snowshowers: 'Qor yog‘ishi', d_thunder: 'Momaqaldiroq',
      t_thunder: 'Momaqaldiroq — ehtiyojsiz tashqariga chiqmang', t_rain: 'Yomg‘ir kutilmoqda — soyabon oling', t_rainat: 'Soat {t} atrofida yomg‘ir — soyabon oling', t_snow: 'Qor kutilmoqda — issiq kiyining', t_hot: 'Juda issiq — ko‘proq suv iching', t_cold: 'Sovuq — issiq kiyining', t_wind: 'Kuchli shamol', t_fog: 'Tuman — yo‘lda ehtiyot bo‘ling', t_ok: 'Ob-havo yaxshi' }
  };
  const CY = [[/Sh/g, 'Ш'], [/sh/g, 'ш'], [/Ch/g, 'Ч'], [/ch/g, 'ч'], [/Yo/g, 'Ё'], [/yo/g, 'ё'], [/Yu/g, 'Ю'], [/yu/g, 'ю'], [/Ya/g, 'Я'], [/ya/g, 'я'], [/O[‘ʻ’']/g, 'Ў'], [/o[‘ʻ’']/g, 'ў'], [/G[‘ʻ’']/g, 'Ғ'], [/g[‘ʻ’']/g, 'ғ'], [/ng/g, 'нг'], [/\bE/g, 'Э'], [/\be/g, 'э'], [/’/g, 'ъ']];
  const MAP = { a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з' };
  const cyr = s => { CY.forEach(([a, b]) => s = s.replace(a, b)); return s.replace(/[A-Za-z]/g, c => { const l = c.toLowerCase(), m = MAP[l]; return m ? (c === l ? m : m.toUpperCase()) : c }) };
  const lang = () => { const l = String(document.documentElement.lang || '').toLowerCase(); if (l.startsWith('uz-cyrl')) return 'uzc'; if (l.startsWith('uz')) return 'uz'; return 'ru' }; // ru, kaa и прочие — по-русски
  const T = (k, v) => { const L = lang(); let s = L === 'uzc' ? cyr(Z.uz[k] || '') : ((Z[L] || Z.ru)[k] || Z.ru[k] || k); if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const deg = n => { n = Math.round(n); return (n < 0 ? '−' : '') + Math.abs(n) + '°' };
  // код погоды WMO -> значок и ключ описания
  function kind(c, day) {
    if (c === 0) return [day === 0 ? '🌙' : '☀️', 'd_clear']; if (c === 1) return [day === 0 ? '🌙' : '🌤️', 'd_mainly']; if (c === 2) return ['⛅', 'd_partly']; if (c === 3) return ['☁️', 'd_overcast'];
    if (c === 45 || c === 48) return ['🌫️', 'd_fog']; if (c >= 51 && c <= 57) return ['🌦️', 'd_drizzle']; if ((c >= 61 && c <= 67)) return ['🌧️', 'd_rain']; if (c >= 71 && c <= 77) return ['❄️', 'd_snow'];
    if (c >= 80 && c <= 82) return ['🌧️', 'd_showers']; if (c === 85 || c === 86) return ['🌨️', 'd_snowshowers']; if (c >= 95) return ['⛈️', 'd_thunder']; return ['🌡️', 'd_partly'];
  }
  const S = { st: 'init', loc: null, data: null, city: '', at: 0, offline: false, err: '', started: false, busy: false, opts: { fallback: null } };

  const CSS = `
.wx-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:14px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.16);color:#fff;font:700 15px/1 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;cursor:pointer;max-width:100%;white-space:nowrap}
.wx-chip .i{font-size:20px;line-height:1}.wx-chip small{font-weight:600;font-size:12px;opacity:.9;max-width:92px;overflow:hidden;text-overflow:ellipsis}
.wx-wide{display:flex}.wx-wide .wx-chip{width:100%;justify-content:flex-start;min-height:46px;padding:0 14px;font-size:17px;gap:10px}.wx-wide .wx-chip small{max-width:none;flex:1;text-align:right;font-size:13px}
.wx-l .wx-chip{background:var(--card,#fff);color:var(--tx,#0f1b33);border-color:var(--bd,#dde4f0)}
@media(max-width:360px){.wx-chip small{display:none}.wx-wide .wx-chip small{display:inline}}
.wx-ov{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,system-ui,"Segoe UI",Roboto,sans-serif}
.wx-sh{background:var(--card,#fff);color:var(--tx,#0f1b33);width:100%;max-width:560px;max-height:92dvh;overflow:auto;border-radius:26px 26px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px))}
.wx-top{display:flex;align-items:center;gap:10px}.wx-top b{flex:1;font-size:18px;overflow-wrap:anywhere}.wx-top button{min-width:44px;min-height:44px;border-radius:50%;border:1px solid var(--bd,#dde4f0);background:var(--card,#fff);color:var(--tx,#0f1b33);font-size:18px;font-weight:800;cursor:pointer}
.wx-now{display:flex;align-items:center;gap:14px;margin:10px 0;padding:14px;border-radius:20px;background:linear-gradient(135deg,#0a1836,#1d5fd1);color:#fff}
.wx-now .big{font-size:54px;line-height:1;font-weight:900}.wx-now .ic{font-size:54px;line-height:1}.wx-now .tx{flex:1}.wx-now .tx b{display:block;font-size:19px}.wx-now .tx span{font-size:13px;opacity:.88}
.wx-tip{padding:11px 13px;border-radius:14px;font-weight:700;font-size:15px;background:rgba(245,158,11,.16);color:#b36b00;margin-bottom:10px}.wx-tip.ok{background:rgba(22,163,74,.14);color:#12803c}
.wx-kv{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.wx-kv div{padding:10px 4px;border-radius:14px;background:var(--bg,#eef2f9);text-align:center;font-size:12px;color:var(--mu,#64718a)}.wx-kv b{display:block;font-size:17px;color:var(--tx,#0f1b33);margin-top:2px}
.wx-h{font-size:13px;font-weight:800;color:var(--mu,#64718a);margin:12px 2px 6px;text-transform:uppercase;letter-spacing:.04em}
.wx-hr{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.wx-hr div{text-align:center;padding:8px 2px;border-radius:14px;background:var(--bg,#eef2f9);font-size:12px;color:var(--mu,#64718a)}.wx-hr .i{display:block;font-size:22px;margin:3px 0}.wx-hr b{display:block;font-size:15px;color:var(--tx,#0f1b33)}.wx-hr em{font-style:normal;color:#2f6bff;font-weight:700}
.wx-dy{display:flex;align-items:center;gap:10px;padding:9px 4px;border-top:1px solid var(--bd,#dde4f0)}.wx-dy .d{width:74px;font-weight:800}.wx-dy .i{font-size:24px}.wx-dy .s{flex:1;color:var(--mu,#64718a);font-size:13px}.wx-dy b{white-space:nowrap}
.wx-ft{margin-top:12px;font-size:12px;color:var(--mu,#64718a);line-height:1.5}.wx-ft .row{display:flex;gap:8px;margin-top:10px}.wx-ft button{flex:1;min-height:46px;line-height:1.2;padding:6px 8px;border-radius:14px;border:1px solid var(--bd,#dde4f0);background:var(--card,#fff);color:var(--tx,#0f1b33);font-weight:800;font-size:14px;cursor:pointer}
`;
  function css() { if (document.getElementById('wx-css')) return; const s = document.createElement('style'); s.id = 'wx-css'; s.textContent = CSS; document.head.appendChild(s) }

  // ===== место: только на телефоне =====
  const pos = o => new Promise((ok, no) => { if (!navigator.geolocation) return no({ code: 0 }); navigator.geolocation.getCurrentPosition(ok, no, o) });
  async function locate(ask) {
    let perm = 'prompt'; try { perm = (await navigator.permissions.query({ name: 'geolocation' })).state } catch (e) { }
    S.denied = perm === 'denied';
    if (perm === 'granted' || ask) {
      try { const p = await pos({ enableHighAccuracy: false, maximumAge: 900000, timeout: 12000 }); const l = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; LSS('wx_loc', JSON.stringify(l)); return { ...l, src: 'g' } } catch (e) { S.denied = e && e.code === 1 }
    }
    const sv = J(LS('wx_loc')); if (sv && Date.now() - sv.at < 7 * 864e5) return { ...sv, src: 's' };
    let f = null; try { f = S.opts.fallback && S.opts.fallback() } catch (e) { }
    if (f && isFinite(f.lat) && isFinite(f.lng)) return { lat: +f.lat, lng: +f.lng, src: 'f' };
    return null;
  }
  const r2 = n => Math.round(n * 100) / 100, key = l => r2(l.lat) + ',' + r2(l.lng);
  async function jget(url) { const c = new AbortController(), t = setTimeout(() => c.abort(), 10000); try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json() } finally { clearTimeout(t) } }

  async function load(force, ask) {
    if (S.busy) return; S.busy = true; if (!S.data) { S.st = 'load'; paint() }
    try {
      const loc = await locate(!!ask); if (!loc) { S.st = S.data ? 'ok' : 'off'; S.busy = false; paint(); return }
      S.loc = loc; const k = key(loc), c = J(LS('wx_c'));
      if (!force && c && c.k === k && Date.now() - c.at < TTL) { S.data = c.d; S.city = c.city || ''; S.at = c.at; S.offline = false; S.st = 'ok'; S.busy = false; paint(); return }
      const L = lang(), q = 'latitude=' + r2(loc.lat) + '&longitude=' + r2(loc.lng) + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4&wind_speed_unit=ms' + (API_KEY ? '&apikey=' + API_KEY : '');
      const [w, cty] = await Promise.allSettled([jget(API + '?' + q), jget(GEO + '?latitude=' + r2(loc.lat) + '&longitude=' + r2(loc.lng) + '&localityLanguage=' + (L === 'ru' ? 'ru' : 'uz'))]);
      if (w.status !== 'fulfilled') throw new Error('wx');
      let city = ''; if (cty.status === 'fulfilled') { const v = cty.value || {}; city = v.city || v.locality || v.principalSubdivision || '' } else if (c && c.k === k) city = c.city || '';
      S.data = w.value; S.city = city; S.at = Date.now(); S.offline = false; S.st = 'ok'; LSS('wx_c', JSON.stringify({ k, at: S.at, d: S.data, city }));
    } catch (e) {
      const c = J(LS('wx_c')); if (c && c.d) { S.data = c.d; S.city = c.city || ''; S.at = c.at; S.offline = true; S.st = 'ok' } else { S.st = 'err' }
    }
    S.busy = false; paint(); if (document.getElementById('wx-ov')) sheet();
  }

  // ===== расчёт показателей =====
  function view() {
    const d = S.data; if (!d || !d.current) return null;
    const cu = d.current, ki = kind(cu.weather_code, cu.is_day), H = d.hourly || {}, hs = H.time || [], now = cu.time || '';
    let i0 = hs.findIndex(t => t >= now.slice(0, 13)); if (i0 < 0) i0 = 0;
    const hours = []; for (let i = i0; i < Math.min(hs.length, i0 + 12); i += 2) hours.push({ h: hs[i].slice(11, 16), t: H.temperature_2m[i], p: H.precipitation_probability ? H.precipitation_probability[i] : 0, k: kind(H.weather_code[i], H.is_day ? H.is_day[i] : 1) });
    const rainAt = (() => { const day = now.slice(0, 10); for (let i = i0; i < hs.length && hs[i].slice(0, 10) === day; i++) { if ((H.precipitation_probability || [])[i] >= 60) return hs[i].slice(11, 16) } return '' })();
    const D = d.daily || {}, days = (D.time || []).map((t, i) => ({ t, k: kind(D.weather_code[i], 1), mx: D.temperature_2m_max[i], mn: D.temperature_2m_min[i], p: (D.precipitation_probability_max || [])[i] || 0 }));
    const code = cu.weather_code, tp = cu.temperature_2m; let tip = ['t_ok', 1];
    if (code >= 95) tip = ['t_thunder', 0]; else if (rainAt) tip = ['t_rainat', 0, { t: rainAt }]; else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) tip = ['t_rain', 0]; else if ((code >= 71 && code <= 77) || code === 85 || code === 86) tip = ['t_snow', 0];
    else if (tp >= 35) tip = ['t_hot', 0]; else if (tp <= 0) tip = ['t_cold', 0]; else if (cu.wind_speed_10m >= 10) tip = ['t_wind', 0]; else if (code === 45 || code === 48) tip = ['t_fog', 0];
    return { cu, ki, hours, days, tip };
  }
  const wday = s => { const L = lang(), d = new Date(s + 'T12:00:00'); let w = new Intl.DateTimeFormat(L === 'ru' ? 'ru-RU' : 'uz-UZ', { weekday: 'short' }).format(d); w = L === 'uzc' ? cyr(w) : w; return w.charAt(0).toUpperCase() + w.slice(1) };

  // ===== плашка в шапке =====
  function chip() {
    if (S.st === 'off') return `<button class="wx-chip" data-wx="open"><span class="i">📍</span><b>${esc(T('off'))}</b></button>`;
    if (S.st === 'load' && !S.data) return `<button class="wx-chip" data-wx="open"><span class="i">⛅</span><b>${esc(T('ld'))}</b></button>`;
    if (S.st === 'err' && !S.data) return `<button class="wx-chip" data-wx="open"><span class="i">⚠️</span><b>${esc(T('ttl'))}</b></button>`;
    const v = view(); if (!v) return '';
    return `<button class="wx-chip" data-wx="open" aria-label="${esc(T('ttl'))}"><span class="i">${v.ki[0]}</span><b>${deg(v.cu.temperature_2m)}</b><small>${esc(S.loc && S.loc.src === 'f' ? T('fb') : (S.city || T(v.ki[1])))}</small></button>`;
  }
  function paint() { document.querySelectorAll('#wx').forEach(h => { if (h.dataset.wxs !== S.st + S.at + lang() + S.city) { h.innerHTML = chip(); h.dataset.wxs = S.st + S.at + lang() + S.city } }) }

  // ===== окно с подробностями =====
  function sheet() {
    css(); let o = document.getElementById('wx-ov'); if (!o) { o = document.createElement('div'); o.id = 'wx-ov'; o.className = 'wx-ov'; o.addEventListener('click', e => { if (e.target === o || e.target.closest('[data-wx="close"]')) o.remove() }); document.body.appendChild(o) }
    const v = view(), src = S.loc ? T(S.loc.src === 'g' ? 'sg' : S.loc.src === 's' ? 'ss' : 'sf') : '';
    let h = `<div class="wx-sh"><div class="wx-top"><b>📍 ${esc(S.city || T('unk'))}</b><button data-wx="close" aria-label="${esc(T('cl'))}">✕</button></div>`;
    if (!v) { h += `<div class="wx-tip">${esc(S.st === 'load' ? T('yr') : S.denied ? T('ge') : T('se'))}</div>` }
    else {
      const c = v.cu; h += `<div class="wx-now"><div class="ic">${v.ki[0]}</div><div class="tx"><b>${esc(T(v.ki[1]))}</b><span>${esc(T('fl'))} ${deg(c.apparent_temperature)}</span></div><div class="big">${deg(c.temperature_2m)}</div></div>
<div class="wx-tip ${v.tip[1] ? 'ok' : ''}">${esc(T(v.tip[0], v.tip[2]))}</div>
<div class="wx-kv"><div>${esc(T('wd'))}<b>${Math.round(c.wind_speed_10m)} ${esc(T('ms'))}</b></div><div>${esc(T('hu'))}<b>${Math.round(c.relative_humidity_2m)}%</b></div><div>${esc(T('rp'))}<b>${(v.days[0] || {}).p || 0}%</b></div></div>
<div class="wx-h">${esc(T('hr'))}</div><div class="wx-hr">${v.hours.map((x, i) => `<div>${i ? esc(x.h) : esc(T('nw'))}<span class="i">${x.k[0]}</span><b>${deg(x.t)}</b>${x.p >= 20 ? `<em>${x.p}%</em>` : ''}</div>`).join('')}</div>
<div class="wx-h">${esc(T('dy'))}</div>${v.days.map((x, i) => `<div class="wx-dy"><span class="d">${i === 0 ? esc(T('td')) : i === 1 ? esc(T('tm')) : esc(wday(x.t))}</span><span class="i">${x.k[0]}</span><span class="s">${esc(T(x.k[1]))}${x.p >= 20 ? ' · 💧' + x.p + '%' : ''}</span><b>${deg(x.mn)} … ${deg(x.mx)}</b></div>`).join('')}`;
    }
    const tm = S.at ? new Date(S.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    h += `<div class="wx-ft">${S.offline ? esc(T('no')) + '<br>' : ''}${src ? esc(src) + '<br>' : ''}${S.loc && S.loc.src === 'f' ? '<b style="color:#b36b00">' + esc(S.denied ? T('ge') : T('hn')) + '</b><br>' : ''}${tm ? esc(T('up')) + ' ' + tm + ' · ' : ''}${esc(T('dt'))}<div class="row"><button data-wx="locate">📍 ${esc(T('lc'))}</button><button data-wx="refresh">↻ ${esc(T('rf'))}</button></div></div></div>`;
    o.innerHTML = h;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-wx]'); if (!b) return; const a = b.dataset.wx;
    if (a === 'open') { if (S.st === 'off' || S.st === 'err') { S.st = 'load'; paint(); sheet(); load(true, true) } else sheet() }
    else if (a === 'locate') { S.st = S.data ? 'ok' : 'load'; sheet(); load(true, true) }
    else if (a === 'refresh') load(true, false);
  });

  // ===== запуск =====
  function ensure() { if (!document.getElementById('wx')) return; css(); paint(); if (!S.started) { S.started = true; load(false, false) } }
  function init(o) { if (o) Object.assign(S.opts, o); ensure() }
  function boot() {
    ensure(); let t = 0;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(ensure, 120) }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.started && Date.now() - S.at > TTL) load(false, false) });
    setInterval(() => { if (!document.hidden && S.started && Date.now() - S.at > TTL) load(false, false) }, 5 * 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  g.WX = { init, refresh: () => load(true, false), state: S };
})(window);
