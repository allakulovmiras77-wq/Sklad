// Синхронизация остатков WB и Ozon (до 2 магазинов на каждый) -> Firestore (коллекция mp). Запускается GitHub Actions.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const E = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).trim()])); // убираем случайные пробелы в секретах

// Названия магазинов (можно поменять на свои, они покажутся в приложении):
const NAMES = { wb: ['Lider Tekstil', 'LT STYLE'], ozon: ['Lider Tekstil', 'LT STYLE'], uzum: ['Uzum Market', 'Uzum 2'] };

const wbAcc = [1, 2].map(i => ({ name: NAMES.wb[i - 1], token: E['WB_TOKEN_' + i] || (i === 1 ? E.WB_TOKEN : '') })).filter(a => a.token);
const ozAcc = [1, 2].map(i => ({
  name: NAMES.ozon[i - 1],
  id: E['OZON_CLIENT_ID_' + i] || (i === 1 ? E.OZON_CLIENT_ID : ''),
  key: E['OZON_API_KEY_' + i] || (i === 1 ? E.OZON_API_KEY : '')
})).filter(a => a.id && a.key);

const uzAcc = [1, 2].map(i => ({ name: NAMES.uzum[i - 1], token: E['UZUM_TOKEN_' + i] || (i === 1 ? E.UZUM_TOKEN : '') })).filter(a => a.token);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fx(url, opt) { // fetch с 3 попытками при сетевом сбое
  for (let i = 0; i < 3; i++) {
    try { return await fetch(url, opt); } catch (e) { if (i === 2) throw e; await sleep(3000 * (i + 1)); }
  }
}
const SZ = { 'Х': 'X', 'Л': 'L', 'М': 'M', 'С': 'S' };
const normSize = s => String(s || '').trim().toUpperCase().replace(/[ХЛМС]/g, c => SZ[c]);
const normArt = s => String(s || '').trim().toUpperCase();

function add(map, n, a, s, idx, fbo, fbs) {
  const k = a + '|' + s;
  const r = map.get(k) || { a, s, st: Array.from({ length: n }, () => ({ fbo: 0, fbs: 0 })) };
  r.st[idx].fbo += fbo; r.st[idx].fbs += fbs; map.set(k, r);
}
function finish(map) {
  return [...map.values()].map(r => ({
    a: r.a, s: r.s, st: r.st,
    fbo: r.st.reduce((n, x) => n + x.fbo, 0),
    fbs: r.st.reduce((n, x) => n + x.fbs, 0)
  })).filter(r => r.fbo + r.fbs > 0)
    .map(r => ({ ...r, n: r.fbo + r.fbs }))
    .sort((x, y) => x.a.localeCompare(y.a, 'ru', { numeric: true }) || x.s.localeCompare(y.s, 'ru', { numeric: true }));
}
const crypto = require('crypto');
const sigOf = x => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');
async function save(id, names, rows, err) {
  const ref = db.collection('mp').doc(id), now = Date.now(), errS = err ? String(err).slice(0, 450) : '';
  let old = {}; try { const x = await ref.get(); old = x.exists ? x.data() : {}; } catch (e) {}
  const sig = rows ? sigOf(rows) : old.sig;
  if ((!rows || sig === old.sig) && (old.err || '') === errS && old.checked && now - old.checked < 30 * 60000) return; // без изменений: не пишем
  const d = { checked: now, names, err: errS || admin.firestore.FieldValue.delete() };
  if (rows) { if (sig !== old.sig) { d.rows = rows; d.sig = sig; } d.updated = now; } // rows=null: старые данные остаются, только ошибка
  await ref.set(d, { merge: true });
}
async function prevRows(id) { try { const x = await db.collection('mp').doc(id).get(); return x.exists ? (x.data().rows || []) : []; } catch (e) { return []; } }
function carry(map, n, idx, rows) { // магазин не ответил: оставляем его прошлые остатки, чтобы цифры не обнулялись
  for (const r of rows) { const x = (r.st || [])[idx]; if (x && (x.fbo || x.fbs)) add(map, n, r.a, r.s, idx, +x.fbo || 0, +x.fbs || 0); }
}

// ---------- Wildberries ----------
// Карточки товаров: из них берём артикул продавца и размер по chrtId / nmId (в отчёте по остаткам их нет)
async function wbCards(token) {
  const map = new Map(); let cursor = { limit: 100 };
  for (let i = 0; i < 300; i++) {
    const r = await fx('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { cursor, filter: { withPhoto: -1 } } })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('WB-контент ' + r.status + (r.status === 401 || r.status === 403 ? ': токену нужна категория «Контент» (только чтение)' : ' ' + t.slice(0, 100)));
    }
    const j = await r.json(); const cards = j.cards || [];
    for (const c of cards) {
      const v = normArt(c.vendorCode);
      map.set('n' + c.nmID, { a: v, s: '' });
      for (const z of c.sizes || []) map.set(Number(z.chrtID), { a: v, s: z.techSize });
    }
    const cur = j.cursor || {};
    if (cards.length < 100 || !cur.nmID) break;
    cursor = { limit: 100, updatedAt: cur.updatedAt, nmID: cur.nmID };
    await sleep(700);
  }
  console.log('WB карточек (ключей):', map.size);
  return map;
}
async function wbReport(token, path) {
  const out = []; const limit = 100000; let offset = 0;
  for (;;) {
    const r = await fx('https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/' + path, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, offset })
    });
    if (!r.ok) {
      const t = await r.text(); let dt = '';
      try { dt = JSON.parse(t).detail || ''; } catch (e) {}
      if (r.status === 401 || r.status === 403) throw new Error('WB-v3 отказ ' + r.status + (dt ? ' (' + dt + ')' : '') + '. Токен должен быть категории «Аналитика», только чтение.');
      throw new Error('WB-v3 ' + path + ' ' + r.status + ' ' + t.slice(0, 120));
    }
    const j = await r.json();
    const items = Array.isArray(j) ? j : ((j.data && (j.data.items || j.data.rows || j.data)) || j.items || j.rows || []);
    if (!Array.isArray(items)) throw new Error('WB: неожиданный ответ ' + JSON.stringify(j).slice(0, 150));
    if (offset === 0 && items[0]) console.log('WB ' + path + ' пример строки:', JSON.stringify(items[0]).slice(0, 600));
    out.push(...items);
    if (items.length < limit) break;
    offset += limit; await sleep(21000);
  }
  return out;
}
const wbQty = it => {
  if (typeof it.quantity === 'number') return it.quantity;
  if (Array.isArray(it.warehouses)) return it.warehouses.reduce((n, w) => n + (+w.quantity || 0), 0);
  return +it.quantityWarehousesFull || +it.stockCount || 0;
};
async function cardsCached(acc, idx) { // карточки WB кэшируем: при сбое токена/сети остатки всё равно обновятся
  const ref = db.collection('sync_meta').doc('wb_cards_' + idx);
  try {
    const m = await wbCards(acc.token);
    const items = [...m.entries()].map(([k, v]) => [k, v.a, v.s].join('\t')), sig = sigOf(items);
    let old = {}; try { const x = await ref.get(); old = x.exists ? x.data() : {}; } catch (e) {}
    if (sig !== old.sig || Date.now() - (old.at || 0) > 6 * 36e5) await ref.set({ at: Date.now(), sig, items }).catch(e => console.error('wb_cards:', e.message));
    return { m, stale: false };
  } catch (e) {
    let x = null; try { x = await ref.get(); } catch (e2) {}
    if (x && x.exists && x.data().items) {
      const m = new Map(); for (const t of x.data().items) { const [k, a, z] = t.split('\t'); m.set(k[0] === 'n' ? k : Number(k), { a, s: z || '' }); }
      return { m, stale: true, err: e.message };
    }
    throw e;
  }
}

async function syncWB() {
  if (!wbAcc.length) return;
  const map = new Map(); const errs = [], bad = [];
  for (let idx = 0; idx < wbAcc.length; idx++) {
    const acc = wbAcc[idx], lm = new Map(); let ok = true;
    let cards = new Map();
    try { const cc = await cardsCached(acc, idx); cards = cc.m; if (cc.stale) errs.push(acc.name + ': карточки взяты из кэша (' + cc.err + ')'); }
    catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); bad.push(idx); continue; }
    for (const [path, kind] of [['wb-warehouses', 'fbo'], ['seller-warehouses', 'fbs']]) {
      try {
        for (const it of await wbReport(acc.token, path)) {
          const c = cards.get(Number(it.chrtId)) || cards.get('n' + it.nmId) || {};
          const a = normArt(c.a || it.vendorCode || it.supplierArticle || it.saName || it.sa);
          let s = normSize(c.s || it.techSize || it.size || it.tech_size);
          if (!s || s === '0') s = '—';
          const q = wbQty(it);
          if (a) add(lm, wbAcc.length, a, s, idx, kind === 'fbo' ? q : 0, kind === 'fbs' ? q : 0);
        }
      } catch (e) { console.error(acc.name, e.message); if (ok) errs.push(acc.name + ': ' + e.message + ' (остатки этого магазина старые)'); ok = false; }
      if (kind === 'fbo') await sleep(21000);
    }
    if (ok) for (const r of lm.values()) add(map, wbAcc.length, r.a, r.s, idx, r.st[idx].fbo, r.st[idx].fbs); else bad.push(idx);
  }
  if (bad.length) { const pr = await prevRows('wb'); bad.forEach(i => carry(map, wbAcc.length, i, pr)); }
  await save('wb', wbAcc.map(a => a.name), bad.length === wbAcc.length ? null : finish(map), errs.join('; '));
  console.log('WB готово, позиций:', map.size, errs.length ? '(есть ошибка)' : '');
}

// ---------- Ozon ----------
const SIZE_RE = /^([2-5]?XL|XXL|XS|S|M|L|\d{2}(-\d{2})?)$/;
function splitOffer(o) {
  const id = normArt(o);
  const pm = /^(.*?)\s*[(\[]\s*([^)\]]+?)\s*[)\]]$/.exec(id); // B2 (2XL)
  if (pm) { const sz = normSize(pm[2]); if (SIZE_RE.test(sz)) return { a: pm[1], s: sz }; }
  const m = /^(.*?)[-_/ ]+([^-_/ ]+)$/.exec(id); // B2-2XL, B2_2XL, B2 2XL
  if (m) { const sz = normSize(m[2]); if (SIZE_RE.test(sz)) return { a: m[1], s: sz }; }
  return { a: id, s: '—' };
}
async function syncOzon() {
  if (!ozAcc.length) return;
  const map = new Map();
  try {
    for (let idx = 0; idx < ozAcc.length; idx++) {
      const acc = ozAcc[idx];
      const H = { 'Client-Id': acc.id, 'Api-Key': acc.key, 'Content-Type': 'application/json' };
      let cursor = '';
      for (let i = 0; i < 200; i++) {
        const r = await fx('https://api-seller.ozon.ru/v4/product/info/stocks', {
          method: 'POST', headers: H, body: JSON.stringify({ cursor, filter: { visibility: 'ALL' }, limit: 1000 })
        });
        if (!r.ok) throw new Error(acc.name + ': Ozon ' + r.status + ' ' + (await r.text()).slice(0, 150));
        const j = await r.json(); const items = j.items || [];
        if (i === 0 && items[0]) console.log('Ozon', acc.name, 'пример строки:', JSON.stringify(items[0]).slice(0, 600));
        for (const it of items) {
          let fbo = 0, fbs = 0;
          for (const st of it.stocks || []) { const p = +st.present || 0; if (String(st.type).toLowerCase() === 'fbo') fbo += p; else fbs += p; }
          const x = splitOffer(it.offer_id); add(map, ozAcc.length, x.a, x.s, idx, fbo, fbs);
        }
        if (!j.cursor || !items.length) break;
        cursor = j.cursor;
      }
    }
    await save('ozon', ozAcc.map(a => a.name), finish(map));
    console.log('Ozon готово, позиций:', map.size);
  } catch (e) { console.error(e.message); await save('ozon', ozAcc.map(a => a.name), null, e.message); }
}


// ---------- Uzum: замена названий (товар + цвет) на наши артикулы ----------
// Правила хранятся в приложении (Ещё → Настройки → «Uzum: названия → наши артикулы»); если там пусто, используется этот список.
const DEF_UZMAP = "LIDER МК4 | Темсин = МК1\nLIDER МК4 | Темсер = МК4\nLIDER МК4 | Темзел = МК5\nLIDER МК4 | серебрн = МК8\nLIDER Хм2 | Темсин = ХМ2\nLIDER Хм2 | Темсер = ХМ4\nLIDER Хм2 | Темзел = ХМ11\nLIDER Хм2 | серебрн = ХМ8\nLIDER В4 | зелен = В5\nLIDER В4 | светсер = В8\nLIDER В4 | СЕРЫЙ = КВ4\nLIDER В4 | СИНИЙ = КВ2\nLIDER В4 | ТЕМНСЕР = В4\nLIDER В4 | ТЕМЕСИН = В2\nLIDER ЖМ | ЛАВАНДА = ЖВ2\nLIDER ЖМ | КОРАЛЛМЕЛ = ЖВ6\nLIDER ЖМ | МАРСАЛ = ЖВ4\nLIDER ЖМ | АМЕТИС = ЖВ2\nLIDER ЖМ | ТЕМНРОЗ = ЖВ11\nLIDER ЖМ | АМЕТИС = ЖМШ2\nLIDER ЖМ | ПАСТКОР = ЖМШ6\nLIDER ЖМ | СИРЕН = ЖМШ4\nLIDER ЖМ | ФУКСИЯ = ЖМШ11\nLIDER ЖМК | АМЕТИС = ЖМК2\nLIDER ЖМК | ПАСТКОР = ЖМК6\nLIDER ЖМК | СИРЕН = ЖМК4\nLIDER ЖМК | ФУКСИЯ = ЖМК11\nLIDER П | ТЕМНСЕР = П4\nLIDER П | ТЕМНСИН = П2\nLITEKS-ДЕТСКИЙВАФЕЛЬНЫЙ | Светские = ДВК7\nLITEKS-ДЕТСКИЙВАФЕЛЬНЫЙ | корроз = ДВК6\nLITEKS-ДЕТСКИЙВАФЕЛЬНЫЙ | сермел = ДВК8\nLITEKS-ДЕТСКИЙВАФЕЛЬНЫЙ | темнсин = ДВК2\nLITEKS-ДЕТСКИЙВАФЕЛЬНЫЙ | темнсер = ДВК4\nLITEKS-ДЕТСКИЙМАХРОВЫЙ | фуксия = ДМК11\nLITEKS-ДЕТСКИЙМАХРОВЫЙ | ПУДР = ЖМК6\nLITEKS-ДЕТСКИЙМАХРОВЫЙ | СЕРЫЙ = ДМК8";
const GLY = { 'Х': 'X', 'М': 'M', 'К': 'K', 'В': 'B', 'Е': 'E', 'С': 'C', 'Т': 'T', 'А': 'A', 'Р': 'P', 'О': 'O', 'Н': 'H' };
const nmS = s => String(s || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[ХМКВЕСТАРОН]/g, c => GLY[c]).replace(/[^A-Z0-9А-Я]+/g, ' ').trim();
const hasSeq = (hay, needle) => !!needle && (' ' + hay + ' ').includes(' ' + needle + ' ');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function parseUz(txt) {
  const out = [];
  for (const line of String(txt || '').split(/\n/)) {
    const eq = line.lastIndexOf('='); if (eq < 0) continue;
    const art = line.slice(eq + 1).trim(), parts = line.slice(0, eq).split('|').map(x => x.trim());
    if (!art || parts.length < 2) continue;
    out.push({ p: nmS(parts[0]), c: nmS(parts[1]), h: parts[2] ? nmS(parts[2]) : '', art: art.toUpperCase() });
  }
  return out;
}
function uzMatch(rules, full) {
  let hits = rules.filter(r => hasSeq(full, r.p) && hasSeq(full, r.c) && (!r.h || hasSeq(full, r.h)));
  if (!hits.length) { // опечатка в цвете на 1 букву
    const words = full.split(' ');
    hits = rules.filter(r => hasSeq(full, r.p) && (!r.h || hasSeq(full, r.h)) && r.c.length >= 5 && !r.c.includes(' ') && words.some(w => w.length >= 5 && lev(w, r.c) <= 1));
    if (hits.length > 1) { const same = new Set(hits.map(h => h.art)); if (same.size > 1) return { art: hits[0].art, amb: true }; }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => (b.h ? 1 : 0) - (a.h ? 1 : 0) || b.p.length - a.p.length);
  const best = hits[0];
  const amb = hits.some(h => h.p === best.p && h.c === best.c && !!h.h === !!best.h && h.art !== best.art);
  return { art: best.art, amb };
}

const chText = ch => { // characteristics бывает массивом, объектом или строкой
  const a = Array.isArray(ch) ? ch : (ch && typeof ch === 'object' ? Object.values(ch) : (ch ? [ch] : []));
  return a.map(c => (c && typeof c === 'object') ? [c.charValue, c.value, c.title, c.name].filter(Boolean).join(' ') : String(c)).join(' ');
};
const uzSize = (sz, title) => { if (sz !== '—') return sz; const m = /(?:^|[\s,\-\/])(\d?XL|XXL|XS|S|M|L|\d{2}(?:-\d{2})?)\s*$/i.exec(String(title || '')); return m ? normSize(m[1]) : sz; };
const uzRules = async () => { const st = await db.collection('settings').doc('main').get(); return parseUz(st.exists && st.data().uzmap !== undefined ? st.data().uzmap : DEF_UZMAP); };
// ---------- Uzum Market: остатки ----------
const UZ = 'https://api-seller.uzum.uz/api/seller-openapi';
async function uzGet(path, token) {
  for (const auth of [token, 'Bearer ' + token]) {
    const r = await fx(UZ + path, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (r.status === 401 && auth === token) continue;
    if (!r.ok) throw new Error('Uzum ' + r.status + (r.status === 401 || r.status === 403 ? ': проверьте токен Uzum' : ' ' + (await r.text()).slice(0, 120)));
    return r.json();
  }
}
async function uzShops(acc) { let shops = await uzGet('/v1/shops', acc.token); if (!Array.isArray(shops)) shops = (shops && (shops.payload || shops.shops)) || []; return shops; }
async function syncUzum() {
  if (!uzAcc.length) return;
  const map = new Map(), meta = new Map(), skus = {}, errs = [], bad = [];
  try {
    const rules = await uzRules();
    for (let idx = 0; idx < uzAcc.length; idx++) {
      const acc = uzAcc[idx], lm = new Map();
      try {
        for (const sh of await uzShops(acc)) {
          for (let page = 0; page < 200; page++) {
            const j = await uzGet('/v1/product/shop/' + sh.id + '?size=100&page=' + page + '&sortBy=DEFAULT&order=ASC', acc.token);
            const list = (j && (j.productList || (j.payload && j.payload.productList))) || [];
            if (page === 0 && list[0]) console.log('Uzum пример товара:', JSON.stringify(list[0]).slice(0, 700));
            for (const p of list) for (const k of p.skuList || []) {
              const x = splitOffer(k.article || k.skuTitle || p.title);
              const sz = uzSize(x.s, k.skuTitle || k.skuFullTitle);
              const full = nmS([p.title, k.article, k.skuTitle, k.skuFullTitle, chText(k.characteristics)].join(' '));
              const hit = uzMatch(rules, full), art = hit ? hit.art : x.a, key = art + '|' + sz;
              if (k.skuId) skus[k.skuId] = [art, sz];
              if (!meta.has(key)) meta.set(key, { m: hit ? (hit.amb ? 2 : 1) : 0, raw: (String(p.title || '') + ' | ' + String(k.article || k.skuTitle || '')).slice(0, 120) });
              else if (hit && hit.amb) meta.get(key).m = 2;
              add(lm, uzAcc.length, art, sz, idx, +k.quantityActive || 0, +k.quantityFbs || 0);
            }
            if (list.length < 100) break;
            await sleep(300);
          }
        }
        for (const r of lm.values()) add(map, uzAcc.length, r.a, r.s, idx, r.st[idx].fbo, r.st[idx].fbs);
      } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message + ' (остатки этого магазина старые)'); bad.push(idx); }
    }
    if (bad.length) { const pr = await prevRows('uzum'); bad.forEach(i => carry(map, uzAcc.length, i, pr)); }
    const rows = finish(map).map(r => ({ ...r, ...(meta.get(r.a + '|' + r.s) || {}) }));
    await save('uzum', uzAcc.map(a => a.name), bad.length === uzAcc.length ? null : rows, errs.join('; '));
    if (Object.keys(skus).length) await db.collection('sync_meta').doc('uzum_map').set({ skus, updated: Date.now() }).catch(e => console.error('uzum_map:', e.message));
    console.log('Uzum готово, позиций:', map.size, 'не сопоставлено:', rows.filter(r => r.m === 0).length, 'неоднозначно:', rows.filter(r => r.m === 2).length);
    rows.filter(r => r.m !== 1).slice(0, 15).forEach(r => console.log('  Uzum', r.m === 2 ? 'неоднозначно' : 'не сопоставлено', '->', r.raw));
  } catch (e) { console.error(e.message); await save('uzum', uzAcc.map(a => a.name), null, e.message); }
}

// ---------- Продажи по дням (последние 30 дней) -> mp/sales_wb, mp/sales_ozon ----------
const dayKey = ts => new Date(ts + 5 * 36e5).toISOString().slice(0, 10); // по времени Ташкента
const DAYS = Array.from({ length: 30 }, (_, i) => dayKey(Date.now() - (29 - i) * 864e5));
// kind: 'fbs' | 'fbo' | 'u' (канал не определён). q — общий итог (как и раньше), fs/fo/fu — разбивка по каналам.
function addSale(map, n, a, s, idx, day, q, kind) {
  const di = DAYS.indexOf(day); if (di < 0 || !a) return;
  const k = a + '|' + s;
  const r = map.get(k) || { a, s, st: Array.from({ length: n }, () => ({ q: Array(30).fill(0), fs: Array(30).fill(0), fo: Array(30).fill(0), fu: Array(30).fill(0) })) };
  r.st[idx].q[di] += q; r.st[idx][kind === 'fbs' ? 'fs' : kind === 'fbo' ? 'fo' : 'fu'][di] += q; map.set(k, r);
}
async function saveSales(id, names, map, errs, arch = true) {
  const d = { checked: Date.now(), names, days: DAYS };
  const ref = db.collection('mp').doc('sales_' + id);
  if (errs.length >= names.length) { d.err = errs.join('; ').slice(0, 450); await ref.set(d, { merge: true }); return; }
  d.err = errs.length ? errs.join('; ').slice(0, 450) : admin.firestore.FieldValue.delete();
  const rows = [...map.values()].filter(r => r.st.some(x => x.q.some(v => v > 0)))
    .sort((x, y) => x.a.localeCompare(y.a, 'ru', { numeric: true }) || x.s.localeCompare(y.s, 'ru', { numeric: true }));
  const sig = sigOf(rows); let old = {}; try { const x = await ref.get(); old = x.exists ? x.data() : {}; } catch (e) {}
  d.updated = Date.now();
  if (sig !== old.sig) { d.rows = rows; d.sig = sig; }
  const full = process.env.FULL_ARCHIVE === '1' || new Date(Date.now() + 5 * 36e5).getUTCHours() === 3;
  if (sig === old.sig && !errs.length && !old.err && old.checked && Date.now() - old.checked < 30 * 60000) return;
  await ref.set(d, { merge: true });
  if (sig === old.sig && !full) return;
  // Дневной архив для модуля «Склад Москва»: msk_sales/{день}.{ozon|wb} = [[артикул, размер, FBS, FBO, не определено], ...]
  if (arch) try {
    const batch = db.batch();
    DAYS.forEach((day, i) => {
      if (!full && i < DAYS.length - 3) return;
      const rows = [];
      for (const r of map.values()) {
        let fs = 0, fo = 0, fu = 0;
        for (const st of r.st) { fs += st.fs[i]; fo += st.fo[i]; fu += st.fu[i]; }
        if (fs || fo || fu) rows.push([r.a, r.s, fs, fo, fu]);
      }
      batch.set(db.collection('msk_sales').doc(day), { day, updated: Date.now(), [id]: rows }, { merge: true });
    });
    await batch.commit();
  } catch (e) { console.error('msk_sales:', e.message); }
}
const FD = 62, FDAYS = Array.from({ length: FD }, (_, i) => dayKey(Date.now() - (FD - 1 - i) * 864e5));
const z = () => Array(FD).fill(0), r2 = v => Math.round(v * 100) / 100;
const moneyOf = v => { if (v == null) return 0; if (typeof v === 'object') v = v.amount ?? v.value ?? 0; return Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0; };
const newStore = name => ({ name, rev: z(), pay: z(), com: z(), log: z(), pen: z(), stor: z(), oth: z(), ads: z(), qty: z(), rq: z(), arts: {}, fin: false });
const addArt = (st, a, q, rev, pay, di) => { const o = st.arts[a] || (st.arts[a] = { q: z(), r: z(), p: z() }); if (di >= 0) { o.q[di] += q; o.r[di] += rev; o.p[di] += pay; } };
async function ozList(path, H, body0) { // Ozon v3/v4: курсор вместо offset
  const out = []; let cursor = '';
  for (let i = 0; i < 300; i++) {
    const r = await fx('https://api-seller.ozon.ru' + path, { method: 'POST', headers: H, body: JSON.stringify({ ...body0, limit: 100, cursor }) });
    if (!r.ok) throw new Error('Ozon ' + path + ' ' + r.status + ' ' + (await r.text()).slice(0, 120));
    const j = await r.json(), res = (j.result && !Array.isArray(j.result)) ? j.result : j;
    const list = res.postings || (Array.isArray(j.result) ? j.result : []);
    if (i === 0 && list[0]) console.log('Ozon', path, 'пример:', JSON.stringify(list[0]).slice(0, 500));
    out.push(...list);
    if (!res.has_next || !res.cursor || res.cursor === cursor) break;
    cursor = res.cursor; await sleep(250);
  }
  return out;
}
let OZFIN = null;
async function syncOzonSales() {
  if (!ozAcc.length) return;
  const map = new Map(), errs = [], fin = ozAcc.map(a => newStore(a.name));
  const since = new Date(Date.now() - FD * 864e5).toISOString(), to = new Date().toISOString();
  for (let idx = 0; idx < ozAcc.length; idx++) {
    const acc = ozAcc[idx], st = fin[idx];
    const H = { 'Client-Id': acc.id, 'Api-Key': acc.key, 'Content-Type': 'application/json' };
    try {
      const fbo = await ozList('/v3/posting/fbo/list', H, { sort_dir: 'ASC', filter: { since, to }, with: { analytics_data: false, financial_data: false } });
      const fbs = await ozList('/v4/posting/fbs/list', H, { sort_dir: 'ASC', filter: { since, to }, with: {} });
      for (const [list, kind, df] of [[fbo, 'fbo', p => p.created_at], [fbs, 'fbs', p => p.in_process_at || p.shipment_date]]) {
        for (const p of list) {
          const ts = Date.parse(df(p)); if (!ts) continue;
          const day = dayKey(ts), di = FDAYS.indexOf(day), cancel = /cancel/i.test(String(p.status));
          for (const pr of p.products || []) {
            const q = +pr.quantity || 1, x = splitOffer(pr.offer_id);
            if (cancel) { if (di >= 0) st.rq[di] += q; continue; }
            addSale(map, ozAcc.length, x.a, x.s, idx, day, q, kind);
            if (di >= 0) { const rv = moneyOf(pr.price) * q; st.rev[di] += rv; st.qty[di] += q; addArt(st, x.a, q, rv, 0, di); }
          }
        }
      }
    } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); }
  }
  OZFIN = fin;
  await saveSales('ozon', ozAcc.map(a => a.name), map, errs);
  console.log('Ozon продажи готово, позиций:', map.size, errs.length ? '(есть ошибка)' : '');
}
async function syncWBSales() {
  if (!wbAcc.length) return;
  const map = new Map(), errs = [];
  const from = dayKey(Date.now() - 31 * 864e5);
  for (let idx = 0; idx < wbAcc.length; idx++) {
    const acc = wbAcc[idx];
    try {
      let r = await fx('https://statistics-api.wildberries.ru/api/v1/supplier/orders?flag=0&dateFrom=' + from, { headers: { Authorization: acc.token } });
      if (r.status === 429) { await sleep(62000); r = await fx('https://statistics-api.wildberries.ru/api/v1/supplier/orders?flag=0&dateFrom=' + from, { headers: { Authorization: acc.token } }); }
      if (!r.ok) throw new Error('WB-статистика ' + r.status + (r.status === 401 || r.status === 403 ? ': токену нужна категория «Статистика» (только чтение)' : ' ' + (await r.text()).slice(0, 100)));
      const j = await r.json(); const list = Array.isArray(j) ? j : [];
      if (list[0]) console.log('WB заказ (пример):', JSON.stringify(list[0]).slice(0, 500));
      for (const o of list) {
        if (o.isCancel) continue;
        const a = normArt(o.supplierArticle), sz = normSize(o.techSize);
        const wt = String(o.warehouseType || ''); // «Склад продавца» = FBS, «Склад WB» = FBO (FBW)
        const kind = /продав/i.test(wt) ? 'fbs' : /wb/i.test(wt) ? 'fbo' : 'u';
        addSale(map, wbAcc.length, a, (!sz || sz === '0') ? '—' : sz, idx, String(o.date || '').slice(0, 10), 1, kind);
      }
    } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); }
    await sleep(62000);
  }
  await saveSales('wb', wbAcc.map(a => a.name), map, errs);
  console.log('WB продажи готово, позиций:', map.size, errs.length ? '(есть ошибка)' : '');
}

// ---------- Аналитика WB и Ozon -> mp/fin_wb, mp/fin_ozon ----------
const num = v => Number(String(v ?? 0).replace(/\s/g, '').replace(',', '.')) || 0;
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return num(o[k]); return 0; };
const classify = name => { // вид начисления -> статья расходов (названия у Ozon приходят и по-английски)
  const t = String(name || '').toLowerCase();
  if (/штраф|претенз|fine|penalt|claim/.test(t)) return 'pen';
  if (/хранен|размещен|storage|placement/.test(t)) return 'stor';
  if (/комисс|commission|acquiring|эквайринг/.test(t)) return 'com';
  if (/логист|доставк|магистрал|обработк|сортиров|выдач|миля|кроссдок|cross.?dock|logistic|delivery|lastmile|courier|drop.?off|pick.?up|handover|packing|sorting|acceptance|processing/.test(t)) return 'log';
  if (/реклам|продвижен|трафарет|клик|click|promo|advert/.test(t)) return 'ads';
  if (/выручк|реализац|продаж|за товар|^sale$|revenue/.test(t)) return 'sale';
  return 'oth';
};
const RU_T = { logistic: 'Логистика', returnflowlogistic: 'Обратная логистика (возвраты)', payperclick: 'Оплата за клик (реклама)', acquiring: 'Эквайринг', lastmilecourier: 'Доставка курьером до покупателя', 'drop-off agent': 'Drop-off (приём в пункте)', correctioncommission: 'Корректировка комиссии', pickuppointreturnacceptance: 'Приём возвратов в ПВЗ', itemcompensation: 'Компенсации за товар', labelbrandverified: 'Проверка маркировки', analyticspremium: 'Premium-аналитика', packingfee: 'Упаковка', deliverytohandoverplacebyozon: 'Доставка до места выдачи' };
const ruName = n => RU_T[String(n || '').toLowerCase()] || n;
const firstTid = n => { const q = [n]; while (q.length) { const x = q.shift(); if (Array.isArray(x)) x.forEach(y => q.push(y)); else if (x && typeof x === 'object') { if (x.type_id != null) return x.type_id; Object.values(x).forEach(y => { if (y && typeof y === 'object') q.push(y); }); } } return null; };
async function saveFin(id, names, stores, payNet, err, extra) {
  const ref = db.collection('mp').doc('fin_' + id), now = Date.now();
  const st = stores.map(s => { const o = { ...s }; for (const k of ['rev', 'pay', 'com', 'log', 'pen', 'stor', 'oth', 'ads']) o[k] = s[k].map(r2);
    o.arts = Object.entries(s.arts).map(([a, v]) => ({ a, q: v.q.map(r2), r: v.r.map(r2), t: v.r.reduce((x, y) => x + y, 0) })).sort((x, y) => y.t - x.t).slice(0, 40).map(({ a, q, r }) => ({ a, q, r })); return o; });
  const sig = sigOf(st); let old = {}; try { const x = await ref.get(); old = x.exists ? x.data() : {}; } catch (e) {}
  const errS = err ? String(err).slice(0, 450) : '';
  if (sig === old.sig && (old.err || '') === errS && old.checked && now - old.checked < 30 * 60000) return;
  const d = { checked: now, updated: now, names, days: FDAYS, payNet, err: errS || admin.firestore.FieldValue.delete(), ...(extra || {}) };
  if (sig !== old.sig) { d.st = st; d.sig = sig; }
  await ref.set(d, { merge: true });
}
const money = x => { // {amount:'-12.5',currency} | число | строка
  if (x == null) return 0; if (typeof x !== 'object') return num(x);
  for (const k of ['amount', 'value', 'accrued', 'total_amount']) if (x[k] != null) return money(x[k]);
  return x.units != null ? num(x.units) + num(x.nanos) / 1e9 : 0;
};
function accItems(node, out, types, depth = 0) { // собирает «листовые» строки начислений: комиссия, услуги, сборы
  if (depth > 9 || node == null) return false;
  if (Array.isArray(node)) { let f = false; for (const x of node) f = accItems(x, out, types, depth + 1) || f; return f; }
  if (typeof node !== 'object') return false;
  let found = false;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'total_amount' || v == null) continue;
    if (k === 'sale_amount') { out.push({ n: 'Выручка по начислениям', v: money(v), kind: 'sale' }); found = true; continue; }
    if (k === 'sale_commission' || (k === 'commission' && typeof v === 'object')) { const m = money(v); if (m) { out.push({ n: 'Комиссия Ozon', v: m, kind: 'com' }); found = true; } continue; }
    if (typeof v === 'object') found = accItems(v, out, types, depth + 1) || found;
  }
  if (found) return true;
  const tid = node.type_id ?? node.accrual_id, m = ['accrued', 'amount', 'price', 'value'].map(k => node[k]).find(x => x != null);
  if ((tid != null || node.name) && m != null) { out.push({ n: types[tid] || node.name || ('тип ' + tid), v: money(m) }); return true; }
  return false;
}
const shapeOf = (o, d = 0) => { if (Array.isArray(o)) return o.length ? [shapeOf(o[0], d + 1)] : []; if (o && typeof o === 'object') { if (d > 5) return '{…}'; const r = {}; for (const k of Object.keys(o).slice(0, 14)) r[k] = shapeOf(o[k], d + 1); return r; } return typeof o; };
function findTypes(j) { // справочник видов начислений: ищем массив объектов с id и названием
  const q = [j]; while (q.length) { const x = q.shift(); if (Array.isArray(x)) { if (x.length && typeof x[0] === 'object' && x[0] && ('id' in x[0] || 'type_id' in x[0] || 'accrual_id' in x[0])) return x; x.slice(0, 3).forEach(y => q.push(y)); } else if (x && typeof x === 'object') Object.values(x).forEach(y => q.push(y)); }
  return [];
}
async function syncOzonFin() {
  if (!ozAcc.length || !OZFIN) return;
  const errs = [], dbg = { cats: {}, shapes: {} };
  for (let idx = 0; idx < ozAcc.length; idx++) {
    const acc = ozAcc[idx], st = OZFIN[idx], H = { 'Client-Id': acc.id, 'Api-Key': acc.key, 'Content-Type': 'application/json' };
    try {
      const types = {};
      try {
        const r = await fx('https://api-seller.ozon.ru/v1/finance/accrual/types', { method: 'POST', headers: H, body: '{}' });
        if (r.ok) { const j = await r.json(); for (const t of findTypes(j)) types[t.id ?? t.type_id ?? t.accrual_id] = t.name || t.title || t.description || t.name_ru || ''; dbg.typesN = Object.keys(types).length; }
      } catch (e) {}
      const byType = {};
      for (let di = 0; di < FD; di++) {
        let last = '';
        for (let pg = 0; pg < 100; pg++) {
          const r = await fx('https://api-seller.ozon.ru/v1/finance/accrual/by-day', { method: 'POST', headers: H, body: JSON.stringify(last ? { date: FDAYS[di], last_id: last } : { date: FDAYS[di] }) });
          if (!r.ok) { if (di === 0) throw new Error('Ozon начисления ' + r.status + ' ' + (await r.text()).slice(0, 160)); break; }
          const j = await r.json(), list = j.accruals || (j.result && j.result.accruals) || [];
          if (!dbg.shape && list[0]) dbg.shape = JSON.stringify(shapeOf(list.find(x => x.accrued_category === 'POSTING') || list[0])).slice(0, 1400);
          for (const a of list) {
            const items = [], total = money(a.total_amount), cat = a.accrued_category || '?';
            accItems(a, items, types);
            if (!items.length) { const tid = firstTid(a); items.push(tid != null ? { n: types[tid] || ('тип ' + tid), v: total } : { n: 'Не разобрано', v: total, kind: 'skip' }); }
            const cs = dbg.cats[cat] || (dbg.cats[cat] = { n: 0, sum: 0 }); cs.n++; cs.sum = r2(cs.sum + total);
            if (!dbg.shapes[cat]) dbg.shapes[cat] = JSON.stringify(shapeOf(a)).slice(0, 900);
            st.pay[di] += total;
            let sale = 0, cost = 0;
            for (const it of items) {
              const nm = ruName(it.n), c = it.kind || classify(it.n), arr = byType[nm] || (byType[nm] = z());
              if (c === 'skip') { arr[di] += it.v; continue; }
              if (c === 'sale') { sale += it.v; arr[di] += it.v; continue; }
              st[c][di] += -it.v; cost += it.v; arr[di] += it.v;
            }
            const resid = total - sale - cost;
            if (resid < -0.5) { st.oth[di] += -resid; (byType['Прочие удержания'] || (byType['Прочие удержания'] = z()))[di] += resid; }
            else if (resid > 0.5) (byType['Начислено за продажи (нетто)'] || (byType['Начислено за продажи (нетто)'] = z()))[di] += resid;
          }
          if (!list.length || !j.last_id || j.last_id === last) break;
          last = j.last_id; await sleep(150);
        }
        await sleep(120);
      }
      st.fin = true; st.types = Object.entries(byType).sort((x, y) => Math.abs(y[1].reduce((p, q) => p + q, 0)) - Math.abs(x[1].reduce((p, q) => p + q, 0))).slice(0, 30).map(([n, a]) => ({ n, v: a.map(r2) }));
    } catch (e) { console.error(acc.name, e.message); st.ferr = e.message.slice(0, 200); errs.push(acc.name + ': ' + e.message); }
  }
  console.log('Ozon структура начисления:', dbg.shape || '—');
  await saveFin('ozon', ozAcc.map(a => a.name), OZFIN, true, errs.length === ozAcc.length ? errs.join('; ') : '', { dbg });
  console.log('Ozon аналитика готова', errs.length ? '(ошибки: ' + errs.length + ')' : '');
}
async function wbGetJson(url, token, opt = {}) { // с повтором при 429
  for (let t = 0; t < 2; t++) {
    const r = await fx(url, { headers: { Authorization: token, 'Content-Type': 'application/json' }, ...opt });
    if (r.status === 429 && t === 0) { await sleep(65000); continue; }
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 160));
    return r.json();
  }
}
async function syncWBFin() {
  if (!wbAcc.length) return;
  const stores = wbAcc.map(a => newStore(a.name)), errs = [], fbsAll = {};
  for (let idx = 0; idx < wbAcc.length; idx++) {
    const acc = wbAcc[idx], st = stores[idx];
    try { // продажи (статистика): выручка, к перечислению и комиссия по дням — в реальном времени
      const rows = await wbGetJson('https://statistics-api.wildberries.ru/api/v1/supplier/sales?flag=0&dateFrom=' + FDAYS[0], acc.token);
      for (const o of Array.isArray(rows) ? rows : []) {
        const di = FDAYS.indexOf(dayKey(Date.parse(String(o.date).length > 19 ? o.date : o.date + '+03:00'))); if (di < 0) continue;
        const ret = /^R/i.test(String(o.saleID)) || num(o.forPay) < 0, sg = ret ? -1 : 1;
        const pwd = Math.abs(num(o.priceWithDisc)), fp = Math.abs(num(o.forPay)), a = normArt(o.supplierArticle);
        st.rev[di] += sg * pwd; st.pay[di] += sg * fp; st.com[di] += sg * (pwd - fp);
        if (ret) st.rq[di]++; else st.qty[di]++;
        if (a) addArt(st, a, ret ? -1 : 1, sg * pwd, sg * fp, di);
      }
    } catch (e) { console.error(acc.name, 'sales', e.message); errs.push(acc.name + ': продажи ' + e.message); }
    await sleep(62000);
    try { // отчёты реализации (токен «Финансы»): логистика, штрафы, хранение, удержания — обновляются WB раз в неделю
      const body = { dateFrom: FDAYS[0], dateTo: FDAYS[FD - 1], limit: 100000, offset: 0, period: 'daily' };
      let rows = null, lastErr = '';
      for (const host of ['finance-api.wildberries.ru', 'statistics-api.wildberries.ru']) {
        try { const j = await wbGetJson('https://' + host + '/api/finance/v1/sales-reports/detailed', acc.token, { method: 'POST', body: JSON.stringify(body) });
          rows = Array.isArray(j) ? j : (j.data || j.rows || j.reports || []); if (rows[0]) console.log('WB финотчёт пример:', JSON.stringify(rows[0]).slice(0, 500)); break; }
        catch (e) { lastErr = e.message; }
      }
      if (!rows) throw new Error(lastErr);
      for (const r of rows) {
        const di = FDAYS.indexOf(String(r.rr_dt || r.rrDt || r.saleDt || r.sale_dt || r.reportDate || '').slice(0, 10)); if (di < 0) continue;
        st.log[di] += pick(r, ['delivery_rub', 'deliveryRub', 'deliveryService']);
        st.pen[di] += pick(r, ['penalty']);
        st.stor[di] += pick(r, ['storage_fee', 'storageFee']);
        st.oth[di] += pick(r, ['deduction']) + pick(r, ['acceptance']) - pick(r, ['additional_payment', 'additionalPayment']);
      }
      st.fin = true;
    } catch (e) { console.error(acc.name, 'finance', e.message); st.ferr = e.message.slice(0, 200); }
    await sleep(62000);
    try { // FBS: новые заказы и поставки (токен «Маркетплейс»)
      const nw = await wbGetJson('https://marketplace-api.wildberries.ru/api/v3/orders/new', acc.token);
      const sup = await wbGetJson('https://marketplace-api.wildberries.ru/api/v3/supplies?limit=1000&next=0', acc.token);
      const list = sup.supplies || [], cut = Date.now() - 30 * 864e5;
      fbsAll[acc.name] = { nw: (nw.orders || []).length, open: list.filter(x => !x.done).length,
        done30: list.filter(x => x.done && Date.parse(x.closedAt || x.createdAt) > cut).length,
        last: list.filter(x => x.done).sort((x, y) => Date.parse(y.closedAt || 0) - Date.parse(x.closedAt || 0)).slice(0, 6).map(x => [x.name || x.id, (x.closedAt || '').slice(0, 10)]) };
    } catch (e) { fbsAll[acc.name] = { err: (e.message.match(/^\d{3}/) || ['ошибка'])[0] }; }
  }
  await saveFin('wb', wbAcc.map(a => a.name), stores, false, errs.length === wbAcc.length ? errs.join('; ') : '', { fbs: fbsAll });
  console.log('WB аналитика готова', errs.length ? '(есть ошибки)' : '');
}

// ---------- Uzum: продажи (заказы FBS за 30 дней) -> mp/sales_uzum ----------
async function uzOrders(shopId, token, from, to) {
  const out = [], seen = new Set();
  const grab = async extra => {
    for (let page = 0; page < 100; page++) {
      const j = await uzGet('/v2/fbs/orders?shopIds=' + shopId + '&page=' + page + '&size=50&dateFrom=' + from + '&dateTo=' + to + extra, token);
      const list = (j && j.payload && j.payload.orders) || (j && (j.orders || j.orderList)) || (Array.isArray(j) ? j : []);
      for (const o of list) { const id = o.id || o.orderId; if (id) { if (seen.has(id)) continue; seen.add(id); } out.push(o); }
      if (list.length < 50) break;
      await sleep(300);
    }
  };
  try { await grab(''); }
  catch (e) { // если API требует статус заказа, запрашиваем по статусам
    if (!/Uzum (400|422)/.test(e.message)) throw e;
    for (const st of ['CREATED', 'PACKING', 'PENDING_DELIVERY', 'DELIVERING', 'ACCEPTED_AT_DP', 'DELIVERED_TO_CUSTOMER_DELIVERY_POINT', 'DELIVERED', 'COMPLETED']) await grab('&status=' + st);
  }
  return out;
}
async function syncUzumSales() {
  if (!uzAcc.length) return;
  const map = new Map(), errs = [];
  let skus = {}, rules = [];
  try { const m = await db.collection('sync_meta').doc('uzum_map').get(); skus = m.exists ? (m.data().skus || {}) : {}; } catch (e) {}
  try { rules = await uzRules(); } catch (e) {}
  const to = Date.now(), from = to - 30 * 864e5;
  for (let idx = 0; idx < uzAcc.length; idx++) {
    const acc = uzAcc[idx];
    try {
      for (const sh of await uzShops(acc)) {
        const orders = await uzOrders(sh.id, acc.token, from, to);
        if (orders[0]) console.log('Uzum заказ (пример):', JSON.stringify(orders[0]).slice(0, 600));
        for (const o of orders) {
          if (/CANCEL|RETURN/i.test(String(o.status))) continue;
          const ts = typeof o.dateCreated === 'number' ? o.dateCreated : Date.parse(o.dateCreated || o.createdAt || o.date);
          if (!ts) continue;
          for (const it of o.orderItems || o.items || []) {
            const q = +it.amount || +it.quantity || 1; let a, z;
            const sk = skus[it.skuId];
            if (sk) { a = sk[0]; z = sk[1]; }
            else {
              const x = splitOffer(it.article || it.skuTitle || it.productTitle); a = x.a; z = uzSize(x.s, it.skuTitle || it.skuFullTitle);
              const hit = uzMatch(rules, nmS([it.productTitle, it.skuTitle].join(' '))); if (hit) a = hit.art;
            }
            addSale(map, uzAcc.length, a, z, idx, dayKey(ts), q, 'fbs');
          }
        }
      }
    } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); }
  }
  await saveSales('uzum', uzAcc.map(a => a.name), map, errs, false);
  console.log('Uzum продажи готово, позиций:', map.size, errs.length ? '(есть ошибка)' : '');
}

// Режимы: node scripts/sync.cjs stock — остатки (каждые 5 минут); sales — продажи (каждые 10 минут); без аргумента — всё сразу
const MODE = process.argv[2] || 'all';
(async () => {
  if (MODE !== 'sales') { await syncOzon(); await syncUzum(); await syncWB(); } // WB последним: у него длинные паузы из-за лимитов
  if (MODE !== 'stock') { await syncOzonSales(); await syncOzonFin(); await syncUzumSales(); await syncWBSales(); await syncWBFin(); }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
