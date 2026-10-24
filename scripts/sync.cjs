// Синхронизация остатков WB и Ozon (до 2 магазинов на каждый) -> Firestore (коллекция mp). Запускается GitHub Actions.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const E = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).trim()])); // убираем случайные пробелы в секретах

// Названия магазинов (можно поменять на свои, они покажутся в приложении):
const NAMES = { wb: ['Lider Tekstil', 'LT STYLE'], ozon: ['Lider Tekstil', 'LT STYLE'] };

const wbAcc = [1, 2].map(i => ({ name: NAMES.wb[i - 1], token: E['WB_TOKEN_' + i] || (i === 1 ? E.WB_TOKEN : '') })).filter(a => a.token);
const ozAcc = [1, 2].map(i => ({
  name: NAMES.ozon[i - 1],
  id: E['OZON_CLIENT_ID_' + i] || (i === 1 ? E.OZON_CLIENT_ID : ''),
  key: E['OZON_API_KEY_' + i] || (i === 1 ? E.OZON_API_KEY : '')
})).filter(a => a.id && a.key);

const sleep = ms => new Promise(r => setTimeout(r, ms));
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
async function wbReport(token, path) {
  const out = []; const limit = 100000; let offset = 0;
  for (;;) {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/' + path, {
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
    for (const [path, kind] of [['wb-warehouses', 'fbo'], ['seller-warehouses', 'fbs']]) {
      try {
        for (const it of await wbReport(acc.token, path)) {
          const a = normArt(it.vendorCode || it.supplierArticle || it.saName || it.sa);
          const s = normSize(it.techSize || it.size || it.tech_size) || '—';
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
        const r = await fetch('https://api-seller.ozon.ru/v4/product/info/stocks', {
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

(async () => { await syncOzon(); await syncWB(); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });
