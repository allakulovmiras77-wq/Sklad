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
async function save(id, names, rows, err) {
  const d = { checked: Date.now(), names };
  if (err) d.err = String(err).slice(0, 450);
  else { d.err = admin.firestore.FieldValue.delete(); d.rows = rows; d.updated = Date.now(); }
  await db.collection('mp').doc(id).set(d, { merge: true });
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
async function syncWB() {
  if (!wbAcc.length) return;
  const map = new Map(); const errs = [];
  for (let idx = 0; idx < wbAcc.length; idx++) {
    const acc = wbAcc[idx];
    let cards = new Map();
    try { cards = await wbCards(acc.token); } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); continue; }
    for (const [path, kind] of [['wb-warehouses', 'fbo'], ['seller-warehouses', 'fbs']]) {
      try {
        for (const it of await wbReport(acc.token, path)) {
          const c = cards.get(Number(it.chrtId)) || cards.get('n' + it.nmId) || {};
          const a = normArt(c.a || it.vendorCode || it.supplierArticle || it.saName || it.sa);
          let s = normSize(c.s || it.techSize || it.size || it.tech_size);
          if (!s || s === '0') s = '—';
          const q = wbQty(it);
          if (a) add(map, wbAcc.length, a, s, idx, kind === 'fbo' ? q : 0, kind === 'fbs' ? q : 0);
        }
      } catch (e) { console.error(acc.name, e.message); if (kind === 'fbo') errs.push(acc.name + ': ' + e.message); }
      if (kind === 'fbo') await sleep(21000);
    }
  }
  const err = errs.join('; ');
  await save('wb', wbAcc.map(a => a.name), finish(map), err);
  console.log('WB готово, позиций:', map.size, err ? '(есть ошибка)' : '');
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
  } catch (e) { console.error(e.message); await save('ozon', ozAcc.map(a => a.name), [], e.message); }
}

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
async function syncUzum() {
  if (!uzAcc.length) return;
  const map = new Map();
  try {
    for (let idx = 0; idx < uzAcc.length; idx++) {
      const acc = uzAcc[idx];
      let shops = await uzGet('/v1/shops', acc.token);
      if (!Array.isArray(shops)) shops = (shops && (shops.payload || shops.shops)) || [];
      for (const sh of shops) {
        for (let page = 0; page < 200; page++) {
          const j = await uzGet('/v1/product/shop/' + sh.id + '?size=100&page=' + page + '&sortBy=DEFAULT&order=ASC', acc.token);
          const list = j.productList || (j.payload && j.payload.productList) || [];
          if (page === 0 && list[0]) console.log('Uzum пример товара:', JSON.stringify(list[0]).slice(0, 700));
          for (const p of list) for (const k of p.skuList || []) {
            const x = splitOffer(k.article || k.skuTitle || p.title);
            let sz = x.s;
            if (sz === '—') { const m = /(?:^|[\s,\-\/])(\d?XL|XXL|XS|S|M|L|\d{2}(?:-\d{2})?)\s*$/i.exec(String(k.skuTitle || k.skuFullTitle || '')); if (m) sz = normSize(m[1]); }
            add(map, uzAcc.length, x.a, sz, idx, +k.quantityActive || 0, +k.quantityFbs || 0);
          }
          if (list.length < 100) break;
          await sleep(300);
        }
      }
    }
    await save('uzum', uzAcc.map(a => a.name), finish(map));
    console.log('Uzum готово, позиций:', map.size);
  } catch (e) { console.error(e.message); await save('uzum', uzAcc.map(a => a.name), [], e.message); }
}

// ---------- Продажи по дням (последние 30 дней) -> mp/sales_wb, mp/sales_ozon ----------
const dayKey = ts => new Date(ts + 5 * 36e5).toISOString().slice(0, 10); // по времени Ташкента
const DAYS = Array.from({ length: 30 }, (_, i) => dayKey(Date.now() - (29 - i) * 864e5));
function addSale(map, n, a, s, idx, day, q) {
  const di = DAYS.indexOf(day); if (di < 0 || !a) return;
  const k = a + '|' + s;
  const r = map.get(k) || { a, s, st: Array.from({ length: n }, () => ({ q: Array(30).fill(0) })) };
  r.st[idx].q[di] += q; map.set(k, r);
}
async function saveSales(id, names, map, errs) {
  const d = { checked: Date.now(), names, days: DAYS };
  const ref = db.collection('mp').doc('sales_' + id);
  if (errs.length >= names.length) { d.err = errs.join('; ').slice(0, 450); await ref.set(d, { merge: true }); return; }
  d.err = errs.length ? errs.join('; ').slice(0, 450) : admin.firestore.FieldValue.delete();
  d.rows = [...map.values()].filter(r => r.st.some(x => x.q.some(v => v > 0)))
    .sort((x, y) => x.a.localeCompare(y.a, 'ru', { numeric: true }) || x.s.localeCompare(y.s, 'ru', { numeric: true }));
  d.updated = Date.now();
  await ref.set(d, { merge: true });
}
async function syncOzonSales() {
  if (!ozAcc.length) return;
  const map = new Map(), errs = [];
  const since = new Date(Date.now() - 30 * 864e5).toISOString(), to = new Date().toISOString();
  for (let idx = 0; idx < ozAcc.length; idx++) {
    const acc = ozAcc[idx];
    const H = { 'Client-Id': acc.id, 'Api-Key': acc.key, 'Content-Type': 'application/json' };
    try {
      for (let off = 0, i = 0; i < 60; i++, off += 1000) { // FBO
        const r = await fx('https://api-seller.ozon.ru/v2/posting/fbo/list', { method: 'POST', headers: H,
          body: JSON.stringify({ dir: 'ASC', filter: { since, to }, limit: 1000, offset: off, with: { analytics_data: false, financial_data: false } }) });
        if (!r.ok) throw new Error('Ozon-продажи FBO ' + r.status + ' ' + (await r.text()).slice(0, 100));
        const j = await r.json(); const list = j.result || [];
        if (i === 0 && list[0]) console.log('Ozon FBO заказ (пример):', JSON.stringify(list[0]).slice(0, 500));
        for (const p of list) {
          if (/cancel/i.test(String(p.status))) continue;
          const day = dayKey(Date.parse(p.created_at));
          for (const pr of p.products || []) { const x = splitOffer(pr.offer_id); addSale(map, ozAcc.length, x.a, x.s, idx, day, +pr.quantity || 1); }
        }
        if (list.length < 1000) break;
        await sleep(300);
      }
      for (let off = 0, i = 0; i < 60; i++, off += 1000) { // FBS
        const r = await fx('https://api-seller.ozon.ru/v3/posting/fbs/list', { method: 'POST', headers: H,
          body: JSON.stringify({ dir: 'ASC', filter: { since, to }, limit: 1000, offset: off, with: {} }) });
        if (!r.ok) throw new Error('Ozon-продажи FBS ' + r.status + ' ' + (await r.text()).slice(0, 100));
        const j = await r.json(); const res = j.result || {}; const list = res.postings || [];
        if (i === 0 && list[0]) console.log('Ozon FBS заказ (пример):', JSON.stringify(list[0]).slice(0, 500));
        for (const p of list) {
          if (/cancel/i.test(String(p.status))) continue;
          const day = dayKey(Date.parse(p.in_process_at || p.shipment_date));
          for (const pr of p.products || []) { const x = splitOffer(pr.offer_id); addSale(map, ozAcc.length, x.a, x.s, idx, day, +pr.quantity || 1); }
        }
        if (!res.has_next && list.length < 1000) break;
        await sleep(300);
      }
    } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); }
  }
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
        addSale(map, wbAcc.length, a, (!sz || sz === '0') ? '—' : sz, idx, String(o.date || '').slice(0, 10), 1);
      }
    } catch (e) { console.error(acc.name, e.message); errs.push(acc.name + ': ' + e.message); }
    await sleep(62000);
  }
  await saveSales('wb', wbAcc.map(a => a.name), map, errs);
  console.log('WB продажи готово, позиций:', map.size, errs.length ? '(есть ошибка)' : '');
}

(async () => { await syncOzon(); await syncWB(); await syncUzum(); await syncOzonSales(); await syncWBSales(); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
