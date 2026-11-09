'use strict';
// ============================================================
//  Склад Москва — серверные операции (Cloud Functions v2)
//  Все изменения остатков Москвы и перемещения Ходжейли -> Москва
//  выполняются ТОЛЬКО здесь, в транзакциях Firestore.
// ============================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

if (!getApps().length) initializeApp();
const db = getFirestore();

const OWNER = 'lidertekstil10@gmail.com';
const DOMAIN = '@lt-sklad.uz';
const OPTS = { region: 'us-central1', enforceAppCheck: false };
const MAX_MUT = 450;          // лимит Firestore — 500 записей в транзакции
const MAX_BAGS = 120;         // мешков в одном отправлении
const TZ = 'Europe/Moscow';

// ---------- роли и права московских сотрудников ----------
const ALL_PERMS = ['receive', 'stockIn', 'stockOut', 'adjust', 'inventory', 'history', 'analytics', 'barcodes'];
const ROLES = {
  worker: { receive: true, stockIn: false, stockOut: false, adjust: false, inventory: false, history: false, analytics: false, barcodes: false },
  senior: { receive: true, stockIn: true, stockOut: true, adjust: false, inventory: true, history: true, analytics: false, barcodes: true },
  manager: { receive: true, stockIn: true, stockOut: true, adjust: true, inventory: true, history: true, analytics: true, barcodes: true }
};

// ---------- нормализация артикулов и размеров (как в index.html) ----------
const LK = { 'Х': 'X', 'М': 'M', 'А': 'A', 'С': 'C', 'Е': 'E', 'О': 'O', 'Р': 'P', 'Т': 'T', 'В': 'B', 'Н': 'H', 'К': 'K', 'Л': 'L' };
const nk = t => String(t == null ? '' : t).trim().toUpperCase().replace(/[ХМАСЕОРТВНКЛ]/g, c => LK[c]);
const keyOf = (a, s) => (nk(a) + '~' + nk(s)).replace(/[\/\\.#\[\]*\s]+/g, '_');
const clean = t => String(t == null ? '' : t).trim().slice(0, 60);

function dayMsk(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}

function bad(code, msg) { return new HttpsError(code, msg); }

// Любой неожиданный сбой отдаём клиенту с текстом причины (а не просто «INTERNAL»)
const handle = h => onCall(OPTS, async req => {
  try { return await h(req); }
  catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error('msk error', e && e.stack || e);
    throw new HttpsError('internal', 'Сбой на сервере: ' + String((e && e.message) || e).slice(0, 220));
  }
});

function int(v, max = 1000000) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw bad('invalid-argument', 'Количество должно быть целым числом от 0 до ' + max + '.');
  return n;
}

function checkOp(opId) {
  if (typeof opId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(opId)) throw bad('invalid-argument', 'Нет номера операции (opId).');
  return opId;
}

// ---------- кто вызывает ----------
async function actor(req) {
  if (!req.auth) throw bad('unauthenticated', 'Войдите в аккаунт.');
  const uid = req.auth.uid;
  const email = String(req.auth.token.email || '').toLowerCase();
  const isOwner = email === OWNER;
  const [stS, acS, usS] = await db.getAll(
    db.collection('msk_staff').doc(uid), db.collection('msk_access').doc(uid), db.collection('users').doc(uid));
  const st = stS.exists ? stS.data() : null;
  const ac = acS.exists ? acS.data() : null;
  const us = usS.exists ? usS.data() : null;
  if (!isOwner) {
    if (st && st.active === false) throw bad('permission-denied', 'Доступ закрыт.');
    if (!st && us && us.blocked === true) throw bad('permission-denied', 'Доступ закрыт.');
  }
  let name = email;
  if (st && (st.firstName || st.lastName)) name = (st.firstName + ' ' + st.lastName).trim();
  else if (us && (us.fullName || us.name)) name = us.fullName || us.name;
  else if (isOwner) name = 'Владелец';
  return { uid, email, isOwner, st, ac, us, name, perms: (st && st.perms) || {} };
}
const needOwner = A => { if (!A.isOwner) throw bad('permission-denied', 'Только владелец.'); };
const canSend = A => A.isOwner || (!!A.ac && A.ac.send === true);
const canConfirm = A => A.isOwner || (!!A.ac && A.ac.confirm === true);
const canViewShips = A => A.isOwner || !!A.st || (!!A.ac && (A.ac.view || A.ac.send || A.ac.confirm));
const hasP = (A, p) => A.isOwner || (!!A.st && A.perms[p] === true);

// ---------- общие помощники транзакций ----------
function sumRows(rows) { return rows.reduce((n, r) => n + r.q, 0); }

function mergeRows(rows) {
  const m = new Map();
  for (const r of rows) {
    const a = clean(r.a), s = clean(r.s);
    if (!a || !s) throw bad('invalid-argument', 'У строки не указан артикул или размер.');
    const k = keyOf(a, s);
    const x = m.get(k) || { key: k, a, s, q: 0 };
    x.q += r.q; m.set(k, x);
  }
  return [...m.values()];
}

function hist(tx, A, e) {
  tx.set(db.collection('msk_history').doc(), Object.assign({
    ts: FieldValue.serverTimestamp(), day: dayMsk(), uid: A.uid, name: A.name, wh: 'moscow',
    a: '', s: '', q: 0, reason: '', comment: ''
  }, e));
}

const getAllSafe = (tx, refs) => refs.length ? tx.getAll(...refs) : Promise.resolve([]);
function guard(n) { if (n > MAX_MUT) throw bad('resource-exhausted', 'Слишком большая операция. Разбейте её на части.'); }

function bagAvail(d) {
  if (!d) return false;
  const q = (d.items || []).reduce((n, i) => n + (Number(i.q) || 0), 0);
  if (q <= 0) return false;
  return !d.msk || d.msk.st !== 'transit';
}

function bagRows(d) {
  return (d.items || []).filter(i => Number(i.q) > 0).map(i => ({ a: String(i.a), s: String(i.s), q: Number(i.q) }));
}

function addLog(ship, st, A, note) {
  const l = (ship.log || []).slice(-40);
  l.push({ ts: Date.now(), st, by: A.name, uid: A.uid, note: note || '' });
  return l;
}

// ============================================================
//  1. Сотрудники Москвы (только владелец)
// ============================================================
exports.mskCreateStaff = handle(async req => {
  const A = await actor(req); needOwner(A);
  const d = req.data || {};
  const login = String(d.login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw bad('invalid-argument', 'Логин: 3–30 символов, латиница, цифры, точка, дефис.');
  const pw = String(d.password || '');
  if (pw.length < 8) throw bad('invalid-argument', 'Временный пароль — минимум 8 символов.');
  const role = ROLES[d.role] ? d.role : 'worker';
  const perms = Object.assign({}, ROLES[role]);
  if (d.perms && typeof d.perms === 'object') for (const p of ALL_PERMS) if (typeof d.perms[p] === 'boolean') perms[p] = d.perms[p];
  let u;
  try {
    u = await getAuth().createUser({ email: login + DOMAIN, password: pw, displayName: login });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') throw bad('already-exists', 'Такой логин уже занят.');
    throw bad('internal', 'Не удалось создать аккаунт: ' + (e.message || e.code));
  }
  try {
    await db.collection('msk_staff').doc(u.uid).set({
      uid: u.uid, login, email: login + DOMAIN, role, perms, active: true,
      firstName: '', lastName: '', profileDone: false, tempPw: true,
      lang: 'ru', theme: 'light', createdAt: Date.now(), createdBy: A.email
    });
  } catch (e) {
    // не оставляем «пустой» аккаунт без профиля: откатываем создание
    try { await getAuth().deleteUser(u.uid); } catch (x) { /* ignore */ }
    throw bad('internal', 'Не удалось сохранить профиль сотрудника: ' + (e.message || e.code));
  }
  await db.collection('msk_history').add({
    ts: FieldValue.serverTimestamp(), day: dayMsk(), uid: A.uid, name: A.name, wh: 'moscow', type: 'staff_create',
    a: '', s: '', q: 0, reason: '', comment: login + ' / ' + role
  });
  return { uid: u.uid, login };
});

exports.mskSetStaff = handle(async req => {
  const A = await actor(req); needOwner(A);
  const d = req.data || {};
  const uid = String(d.uid || '');
  const ref = db.collection('msk_staff').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw bad('not-found', 'Сотрудник не найден.');
  const upd = {};
  if (d.role && ROLES[d.role]) upd.role = d.role;
  if (d.perms && typeof d.perms === 'object') {
    const cur = Object.assign({}, snap.data().perms || {});
    for (const p of ALL_PERMS) if (typeof d.perms[p] === 'boolean') cur[p] = d.perms[p];
    upd.perms = cur;
  }
  if (typeof d.firstName === 'string') upd.firstName = clean(d.firstName).slice(0, 40);
  if (typeof d.lastName === 'string') upd.lastName = clean(d.lastName).slice(0, 40);
  if (typeof d.active === 'boolean') {
    upd.active = d.active;
    await getAuth().updateUser(uid, { disabled: !d.active });
    if (!d.active) await getAuth().revokeRefreshTokens(uid);
  }
  if (d.newPassword) {
    if (String(d.newPassword).length < 8) throw bad('invalid-argument', 'Пароль — минимум 8 символов.');
    await getAuth().updateUser(uid, { password: String(d.newPassword) });
    await getAuth().revokeRefreshTokens(uid);
    upd.tempPw = true;
  }
  if (Object.keys(upd).length) await ref.update(upd);
  return { ok: true };
});

// ============================================================
//  2. Отправка Ходжейли -> Москва
// ============================================================
async function nextShipNo() {
  const ref = db.collection('msk_meta').doc('counters');
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    const n = ((s.exists && s.data().ship) || 0) + 1;
    tx.set(ref, { ship: n }, { merge: true });
    return 'MSK-' + String(n).padStart(4, '0');
  });
}

exports.mskShipSave = handle(async req => {
  const A = await actor(req);
  if (!canSend(A)) throw bad('permission-denied', 'Нет права «Отправка в Москву».');
  const d = req.data || {};
  const ids = [...new Set((Array.isArray(d.bagIds) ? d.bagIds : []).map(x => String(x).trim().toUpperCase()))].filter(Boolean);
  if (!ids.length) throw bad('invalid-argument', 'Выберите хотя бы один мешок.');
  if (ids.length > MAX_BAGS) throw bad('invalid-argument', 'В одном отправлении не больше ' + MAX_BAGS + ' мешков.');
  const snaps = await db.getAll(...ids.map(id => db.collection('bags').doc(id)));
  const bags = [];
  for (let i = 0; i < snaps.length; i++) {
    if (!snaps[i].exists) throw bad('not-found', 'Мешок ' + ids[i] + ' не найден.');
    if (!bagAvail(snaps[i].data())) throw bad('failed-precondition', 'Мешок ' + ids[i] + ' пуст или уже в пути.');
    bags.push({ id: ids[i], items: bagRows(snaps[i].data()), st: 'pending' });
  }
  const rows = mergeRows(bags.flatMap(b => b.items));
  const submit = d.submit === true;
  const status = submit ? 'pending' : 'draft';
  const comment = String(d.comment || '').slice(0, 300);
  if (d.shipId) {
    const ref = db.collection('msk_ships').doc(String(d.shipId));
    const s = await ref.get();
    if (!s.exists) throw bad('not-found', 'Отправление не найдено.');
    const sh = s.data();
    if (!['draft', 'pending'].includes(sh.status)) throw bad('failed-precondition', 'Это отправление уже нельзя менять.');
    if (sh.createdBy.uid !== A.uid && !canConfirm(A)) throw bad('permission-denied', 'Чужое отправление.');
    await ref.update({ bags, bagIds: ids, rows, total: sumRows(rows), bagCount: bags.length, comment, status, log: addLog(sh, status, A, 'изменено') });
    return { id: ref.id, no: sh.no, status };
  }
  const no = await nextShipNo();
  const ship = {
    no, status, createdBy: { uid: A.uid, name: A.name }, createdAt: Date.now(), comment,
    bags, bagIds: ids, rows, total: sumRows(rows), bagCount: bags.length, recvTotal: 0,
    log: [{ ts: Date.now(), st: status, by: A.name, uid: A.uid, note: 'создано' }]
  };
  const batch = db.batch();
  batch.set(db.collection('msk_ships').doc(no), ship);
  batch.set(db.collection('msk_history').doc(), {
    ts: FieldValue.serverTimestamp(), day: dayMsk(), uid: A.uid, name: A.name, wh: 'khojeyli', type: 'ship_create',
    a: '', s: '', q: ship.total, ship: no, reason: '', comment: ship.bagCount + ' меш.'
  });
  await batch.commit();
  return { id: no, no, status };
});

exports.mskShipConfirm = handle(async req => {
  const A = await actor(req);
  if (!canConfirm(A)) throw bad('permission-denied', 'Нет права подтверждать отправку.');
  const d = req.data || {};
  const opId = checkOp(d.opId), shipId = String(d.shipId || '');
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const shipRef = db.collection('msk_ships').doc(shipId);
    const [opS, shipS] = await tx.getAll(opRef, shipRef);
    if (opS.exists) return Object.assign({}, opS.data().result, { dup: true });
    if (!shipS.exists) throw bad('not-found', 'Отправление не найдено.');
    const ship = shipS.data();
    if (!['draft', 'pending'].includes(ship.status)) throw bad('failed-precondition', 'Отправление уже подтверждено или отменено.');
    const bagRefs = ship.bagIds.map(id => db.collection('bags').doc(id));
    const bagSnaps = await tx.getAll(...bagRefs);
    const bags = [];
    bagSnaps.forEach((s, i) => {
      if (!s.exists) throw bad('not-found', 'Мешок ' + ship.bagIds[i] + ' не найден.');
      if (!bagAvail(s.data())) throw bad('failed-precondition', 'Мешок ' + ship.bagIds[i] + ' уже в пути или пуст. Обновите отправление.');
      bags.push({ id: ship.bagIds[i], items: bagRows(s.data()), st: 'pending' });
    });
    const rows = mergeRows(bags.flatMap(b => b.items));
    const itemSnaps = await getAllSafe(tx, rows.map(r => db.collection('msk_items').doc(r.key)));
    guard(bags.length + rows.length * 3 + 4);
    const now = Date.now();
    bags.forEach((b, i) => {
      tx.update(bagRefs[i], { items: [], msk: { ship: shipId, no: ship.no, st: 'transit', at: now }, lu: A.email, lt: now });
    });
    rows.forEach((r, i) => {
      const ref = db.collection('msk_items').doc(r.key);
      if (itemSnaps[i].exists) tx.update(ref, { tr: (Number(itemSnaps[i].data().tr) || 0) + r.q, upd: now });
      else tx.set(ref, { a: r.a, s: r.s, q: 0, tr: r.q, bc: [], bt: 'unit', name: '', created: now, upd: now });
      tx.set(db.collection('log').doc(), { bag: ship.no, type: 'out', a: r.a, s: r.s, d: r.q, ts: now, u: A.email, note: 'Отправка в Москву', ship: shipId });
      hist(tx, A, { type: 'ship_confirm', wh: 'khojeyli', a: r.a, s: r.s, q: r.q, ship: ship.no, comment: 'В пути в Москву' });
    });
    const log = addLog(ship, 'confirmed', A, 'подтверждено к отправке');
    log.push({ ts: now, st: 'transit', by: A.name, uid: A.uid, note: 'в доставке' });
    const upd = {
      status: 'transit', bags, rows, total: sumRows(rows), bagCount: bags.length,
      confirmedBy: { uid: A.uid, name: A.name }, confirmedAt: now, log
    };
    tx.update(shipRef, upd);
    const result = { ok: true, no: ship.no, status: 'transit', total: upd.total, bags: bags.length };
    tx.set(opRef, { type: 'ship_confirm', uid: A.uid, ts: now, result });
    return result;
  });
});

exports.mskShipCancel = handle(async req => {
  const A = await actor(req);
  if (!canConfirm(A)) throw bad('permission-denied', 'Нет права отменять отправку.');
  const d = req.data || {};
  const opId = checkOp(d.opId), shipId = String(d.shipId || ''), reason = String(d.reason || '').slice(0, 200);
  if (!reason.trim()) throw bad('invalid-argument', 'Укажите причину отмены.');
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const shipRef = db.collection('msk_ships').doc(shipId);
    const [opS, shipS] = await tx.getAll(opRef, shipRef);
    if (opS.exists) return Object.assign({}, opS.data().result, { dup: true });
    if (!shipS.exists) throw bad('not-found', 'Отправление не найдено.');
    const ship = shipS.data();
    if (!['draft', 'pending', 'transit'].includes(ship.status)) throw bad('failed-precondition', 'Это отправление нельзя отменить (уже есть приёмка).');
    const now = Date.now();
    if (ship.status === 'transit') {
      if ((ship.bags || []).some(b => b.st !== 'pending')) throw bad('failed-precondition', 'Часть мешков уже принята. Отмена невозможна.');
      const bagRefs = ship.bags.map(b => db.collection('bags').doc(b.id));
      const bagSnaps = await tx.getAll(...bagRefs);
      const rows = mergeRows(ship.bags.flatMap(b => b.items));
      const itemSnaps = await getAllSafe(tx, rows.map(r => db.collection('msk_items').doc(r.key)));
      guard(ship.bags.length + rows.length * 3 + 4);
      ship.bags.forEach((b, i) => {
        const cur = bagSnaps[i].exists ? bagRows(bagSnaps[i].data()) : [];
        const merged = mergeRows(cur.concat(b.items)).map(r => ({ a: r.a, s: r.s, q: r.q }));
        if (bagSnaps[i].exists) tx.update(bagRefs[i], { items: merged, msk: FieldValue.delete(), lu: A.email, lt: now });
      });
      rows.forEach((r, i) => {
        if (itemSnaps[i].exists) tx.update(db.collection('msk_items').doc(r.key), { tr: Math.max(0, (Number(itemSnaps[i].data().tr) || 0) - r.q), upd: now });
        tx.set(db.collection('log').doc(), { bag: ship.no, type: 'in', a: r.a, s: r.s, d: r.q, ts: now, u: A.email, note: 'Отмена отправки в Москву', ship: shipId });
        hist(tx, A, { type: 'ship_cancel', wh: 'khojeyli', a: r.a, s: r.s, q: r.q, ship: ship.no, reason });
      });
    }
    tx.update(shipRef, { status: 'cancelled', cancelReason: reason, log: addLog(ship, 'cancelled', A, reason) });
    const result = { ok: true, no: ship.no, status: 'cancelled' };
    tx.set(opRef, { type: 'ship_cancel', uid: A.uid, ts: now, result });
    return result;
  });
});

// ============================================================
//  3. Приёмка в Москве
// ============================================================
function shipStatusAfter(bags) {
  const pend = bags.filter(b => b.st === 'pending').length;
  const done = bags.length - pend;
  if (pend === 0) return bags.some(b => b.st === 'diff' || b.st === 'lost') ? 'discrepancy' : 'delivered';
  return done > 0 ? 'partial' : 'transit';
}

exports.mskReceive = handle(async req => {
  const A = await actor(req);
  if (!hasP(A, 'receive')) throw bad('permission-denied', 'Нет права принимать отправления.');
  const d = req.data || {};
  const opId = checkOp(d.opId), shipId = String(d.shipId || '');
  const input = Array.isArray(d.bags) ? d.bags : [];
  if (!input.length) throw bad('invalid-argument', 'Не выбраны мешки для приёмки.');
  if (input.length > MAX_BAGS) throw bad('invalid-argument', 'Слишком много мешков за раз.');
  const comment = String(d.comment || '').slice(0, 400);
  const photos = (Array.isArray(d.photos) ? d.photos : []).filter(p => typeof p === 'string' && p.startsWith('data:image/') && p.length < 260000).slice(0, 4);
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const shipRef = db.collection('msk_ships').doc(shipId);
    const [opS, shipS] = await tx.getAll(opRef, shipRef);
    if (opS.exists) return Object.assign({}, opS.data().result, { dup: true });
    if (!shipS.exists) throw bad('not-found', 'Отправление не найдено.');
    const ship = shipS.data();
    if (!['transit', 'partial'].includes(ship.status)) throw bad('failed-precondition', 'Это отправление не ожидает приёмки.');
    const bags = ship.bags.map(b => Object.assign({}, b));
    const diffs = [], accepted = [], seen = new Set();
    const delta = new Map();          // key -> { a, s, add, dec }
    const bump = (a, s, add, dec) => {
      const k = keyOf(a, s);
      const x = delta.get(k) || { key: k, a: clean(a), s: clean(s), add: 0, dec: 0 };
      x.add += add; x.dec += dec; delta.set(k, x);
    };
    for (const inp of input) {
      const id = String(inp.id || '').trim().toUpperCase();
      if (seen.has(id)) continue; seen.add(id);
      const bi = bags.findIndex(b => b.id === id);
      if (bi < 0) throw bad('invalid-argument', 'Мешок ' + id + ' не входит в это отправление.');
      const b = bags[bi];
      if (b.st !== 'pending') throw bad('failed-precondition', 'Мешок ' + id + ' уже принят.');
      const got = new Map();
      for (const r of (Array.isArray(inp.rows) ? inp.rows : [])) {
        const g = int(r.got, 100000), bd = int(r.bad || 0, 100000);
        if (bd > g) throw bad('invalid-argument', 'Повреждённых больше, чем получено (' + id + ').');
        const k = keyOf(r.a, r.s);
        const x = got.get(k) || { a: clean(r.a), s: clean(r.s), got: 0, bad: 0 };
        x.got += g; x.bad += bd; got.set(k, x);
      }
      const exp = new Map(mergeRows(b.items).map(r => [r.key, r]));
      let hasDiff = false;
      const outRows = [];
      for (const [k, e] of exp) {
        const g = got.get(k) || { a: e.a, s: e.s, got: 0, bad: 0 };
        outRows.push({ a: e.a, s: e.s, exp: e.q, got: g.got, bad: g.bad });
        bump(e.a, e.s, g.got - g.bad, e.q);
        if (g.got < e.q) { hasDiff = true; diffs.push({ kind: 'shortage', bag: id, a: e.a, s: e.s, exp: e.q, got: g.got }); }
        if (g.got > e.q) { hasDiff = true; diffs.push({ kind: 'surplus', bag: id, a: e.a, s: e.s, exp: e.q, got: g.got }); }
        if (g.bad > 0) { hasDiff = true; diffs.push({ kind: 'damaged', bag: id, a: e.a, s: e.s, exp: e.q, got: g.got, bad: g.bad }); }
      }
      for (const [k, g] of got) {
        if (exp.has(k) || (g.got === 0)) continue;
        hasDiff = true;
        outRows.push({ a: g.a, s: g.s, exp: 0, got: g.got, bad: g.bad });
        bump(g.a, g.s, g.got - g.bad, 0);
        diffs.push({ kind: 'wrong', bag: id, a: g.a, s: g.s, exp: 0, got: g.got, bad: g.bad });
      }
      bags[bi] = Object.assign({}, b, {
        st: hasDiff ? 'diff' : 'ok', rec: outRows, by: A.name, byUid: A.uid, at: Date.now(),
        comment: String(inp.comment || '').slice(0, 200)
      });
      accepted.push(id);
    }
    const rows = [...delta.values()];
    const itemSnaps = await getAllSafe(tx, rows.map(r => db.collection('msk_items').doc(r.key)));
    const bagDocRefs = accepted.map(id => db.collection('bags').doc(id));
    guard(accepted.length + rows.length * 2 + diffs.length + 5);
    const now = Date.now();
    rows.forEach((r, i) => {
      const ref = db.collection('msk_items').doc(r.key);
      if (itemSnaps[i].exists) {
        const cur = itemSnaps[i].data();
        tx.update(ref, { q: (Number(cur.q) || 0) + r.add, tr: Math.max(0, (Number(cur.tr) || 0) - r.dec), upd: now });
      } else tx.set(ref, { a: r.a, s: r.s, q: r.add, tr: 0, bc: [], bt: 'unit', name: '', created: now, upd: now });
      hist(tx, A, { type: 'receive', a: r.a, s: r.s, q: r.add, ship: ship.no, reason: 'Приёмка отправления' });
    });
    diffs.forEach(df => hist(tx, A, {
      type: 'receive_diff', a: df.a, s: df.s, q: df.kind === 'damaged' ? df.bad : Math.abs(df.got - df.exp),
      ship: ship.no, bag: df.bag, reason: df.kind, comment: 'ожидалось ' + df.exp + ', получено ' + df.got
    }));
    bagDocRefs.forEach(ref => tx.set(ref, { msk: { st: 'done', rcv: now } }, { merge: true }));
    const status = shipStatusAfter(bags);
    const recvTotal = (ship.recvTotal || 0) + rows.reduce((n, r) => n + r.add, 0);
    const log = addLog(ship, status, A, 'принято мешков: ' + accepted.length + (diffs.length ? ', расхождений: ' + diffs.length : ''));
    tx.update(shipRef, { bags, status, recvTotal, log, lastRecvAt: now });
    tx.set(db.collection('msk_receipts').doc(opId), {
      ship: shipId, no: ship.no, uid: A.uid, name: A.name, ts: now, bags: accepted, diffs, comment, photos: photos.length
    });
    if (photos.length) tx.set(db.collection('msk_photos').doc(opId), { ship: shipId, uid: A.uid, ts: now, photos });
    const result = { ok: true, no: ship.no, status, accepted: accepted.length, diffs: diffs.length, added: rows.reduce((n, r) => n + r.add, 0) };
    tx.set(opRef, { type: 'receive', uid: A.uid, ts: now, result });
    return result;
  });
});

// Закрыть отправление: мешки, которые так и не приехали, считаются потерянными
exports.mskShipClose = handle(async req => {
  const A = await actor(req);
  if (!hasP(A, 'receive')) throw bad('permission-denied', 'Нет права принимать отправления.');
  const d = req.data || {};
  const opId = checkOp(d.opId), shipId = String(d.shipId || ''), reason = String(d.reason || '').slice(0, 200);
  if (!reason.trim()) throw bad('invalid-argument', 'Укажите причину.');
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const shipRef = db.collection('msk_ships').doc(shipId);
    const [opS, shipS] = await tx.getAll(opRef, shipRef);
    if (opS.exists) return Object.assign({}, opS.data().result, { dup: true });
    if (!shipS.exists) throw bad('not-found', 'Отправление не найдено.');
    const ship = shipS.data();
    if (!['transit', 'partial'].includes(ship.status)) throw bad('failed-precondition', 'Нечего закрывать.');
    const lost = ship.bags.filter(b => b.st === 'pending');
    if (!lost.length) throw bad('failed-precondition', 'Все мешки уже приняты.');
    const rows = mergeRows(lost.flatMap(b => b.items));
    const itemSnaps = await getAllSafe(tx, rows.map(r => db.collection('msk_items').doc(r.key)));
    guard(lost.length + rows.length * 2 + 5);
    const now = Date.now();
    rows.forEach((r, i) => {
      if (itemSnaps[i].exists) tx.update(db.collection('msk_items').doc(r.key), { tr: Math.max(0, (Number(itemSnaps[i].data().tr) || 0) - r.q), upd: now });
      hist(tx, A, { type: 'receive_diff', a: r.a, s: r.s, q: r.q, ship: ship.no, reason: 'missing_bag', comment: reason });
    });
    lost.forEach(b => tx.set(db.collection('bags').doc(b.id), { msk: { st: 'done', rcv: now, lost: true } }, { merge: true }));
    const bags = ship.bags.map(b => b.st === 'pending' ? Object.assign({}, b, { st: 'lost', by: A.name, at: now, comment: reason }) : b);
    tx.update(shipRef, { bags, status: 'discrepancy', log: addLog(ship, 'discrepancy', A, 'не получено мешков: ' + lost.length + ' — ' + reason) });
    const result = { ok: true, no: ship.no, status: 'discrepancy', lost: lost.length };
    tx.set(opRef, { type: 'ship_close', uid: A.uid, ts: now, result });
    return result;
  });
});

// ============================================================
//  4. Приход / списание / корректировка / инвентаризация
// ============================================================
exports.mskStockOp = handle(async req => {
  const A = await actor(req);
  const d = req.data || {};
  const type = d.type === 'out' ? 'out' : 'in';
  if (!hasP(A, type === 'in' ? 'stockIn' : 'stockOut')) throw bad('permission-denied', 'Нет права на эту операцию.');
  const opId = checkOp(d.opId);
  const reason = String(d.reason || '').slice(0, 120).trim();
  if (type === 'out' && !reason) throw bad('invalid-argument', 'Укажите причину списания.');
  const comment = String(d.comment || '').slice(0, 300);
  const rows = mergeRows((Array.isArray(d.items) ? d.items : []).map(r => ({ a: r.a, s: r.s, q: int(r.q) })).filter(r => r.q > 0));
  if (!rows.length) throw bad('invalid-argument', 'Нет позиций с количеством больше нуля.');
  if (rows.length > 100) throw bad('invalid-argument', 'Не больше 100 позиций за раз.');
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const refs = rows.map(r => db.collection('msk_items').doc(r.key));
    const snaps = await tx.getAll(opRef, ...refs);
    if (snaps[0].exists) return Object.assign({}, snaps[0].data().result, { dup: true });
    const now = Date.now();
    rows.forEach((r, i) => {
      const s = snaps[i + 1];
      const cur = s.exists ? (Number(s.data().q) || 0) : 0;
      const nq = type === 'in' ? cur + r.q : cur - r.q;
      if (nq < 0) throw bad('failed-precondition', 'Недостаточно на складе: ' + r.a + ' ' + r.s + ' (есть ' + cur + ', нужно ' + r.q + ').');
      if (s.exists) tx.update(refs[i], { q: nq, upd: now });
      else tx.set(refs[i], { a: r.a, s: r.s, q: nq, tr: 0, bc: [], bt: 'unit', name: '', created: now, upd: now });
      hist(tx, A, { type: type === 'in' ? 'stock_in' : 'stock_out', a: r.a, s: r.s, q: r.q, reason, comment, before: cur, after: nq });
    });
    const result = { ok: true, rows: rows.length, qty: sumRows(rows) };
    tx.set(opRef, { type: 'stock_' + type, uid: A.uid, ts: now, result });
    return result;
  });
});

async function setCounts(A, d, type) {
  const opId = checkOp(d.opId);
  const reason = String(d.reason || '').slice(0, 120).trim();
  const comment = String(d.comment || '').slice(0, 300);
  const rows = mergeRows((Array.isArray(d.rows) ? d.rows : []).map(r => ({ a: r.a, s: r.s, q: int(r.counted) })));
  if (!rows.length) throw bad('invalid-argument', 'Нет позиций.');
  if (rows.length > 200) throw bad('invalid-argument', 'Не больше 200 позиций за раз.');
  return db.runTransaction(async tx => {
    const opRef = db.collection('msk_ops').doc(opId);
    const refs = rows.map(r => db.collection('msk_items').doc(r.key));
    const snaps = await tx.getAll(opRef, ...refs);
    if (snaps[0].exists) return Object.assign({}, snaps[0].data().result, { dup: true });
    const now = Date.now();
    let changed = 0;
    rows.forEach((r, i) => {
      const s = snaps[i + 1];
      const cur = s.exists ? (Number(s.data().q) || 0) : 0;
      if (cur === r.q && s.exists) return;
      changed++;
      if (s.exists) tx.update(refs[i], { q: r.q, upd: now });
      else tx.set(refs[i], { a: r.a, s: r.s, q: r.q, tr: 0, bc: [], bt: 'unit', name: '', created: now, upd: now });
      hist(tx, A, { type, a: r.a, s: r.s, q: Math.abs(r.q - cur), reason: reason || (type === 'inventory' ? 'Инвентаризация' : ''), comment, before: cur, after: r.q });
    });
    const result = { ok: true, rows: rows.length, changed };
    tx.set(opRef, { type, uid: A.uid, ts: now, result });
    return result;
  });
}

exports.mskInventory = handle(async req => {
  const A = await actor(req);
  if (!hasP(A, 'inventory')) throw bad('permission-denied', 'Нет права на инвентаризацию.');
  return setCounts(A, req.data || {}, 'inventory');
});

exports.mskAdjust = handle(async req => {
  const A = await actor(req);
  if (!hasP(A, 'adjust')) throw bad('permission-denied', 'Нет права на корректировку.');
  const d = req.data || {};
  if (!String(d.reason || '').trim()) throw bad('invalid-argument', 'Укажите причину корректировки.');
  return setCounts(A, { opId: d.opId, reason: d.reason, comment: d.comment, rows: [{ a: d.a, s: d.s, counted: d.counted }] }, 'adjust');
});

// ============================================================
//  5. Штрихкоды и товары
// ============================================================
exports.mskSetBarcode = handle(async req => {
  const A = await actor(req);
  if (!hasP(A, 'barcodes')) throw bad('permission-denied', 'Нет права привязывать штрихкоды.');
  const d = req.data || {};
  const a = clean(d.a), s = clean(d.s), code = String(d.code || '').trim().replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 64);
  if (!a || !s || code.length < 3) throw bad('invalid-argument', 'Нужны артикул, размер и штрихкод (от 3 знаков).');
  const bt = d.bt === 'art' ? 'art' : 'unit';
  const dup = await db.collection('msk_items').where('bc', 'array-contains', code).limit(2).get();
  const key = keyOf(a, s);
  if (dup.docs.some(x => x.id !== key)) throw bad('already-exists', 'Этот штрихкод уже привязан к другой позиции.');
  const ref = db.collection('msk_items').doc(key);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const s0 = await tx.get(ref);
    if (s0.exists) tx.update(ref, { bc: FieldValue.arrayUnion(code), bt, upd: now });
    else tx.set(ref, { a, s, q: 0, tr: 0, bc: [code], bt, name: '', created: now, upd: now });
    hist(tx, A, { type: 'barcode', a, s, q: 0, reason: bt === 'art' ? 'штрихкод артикула' : 'штрихкод единицы', comment: code });
  });
  return { ok: true };
});

// Первоначальный импорт (1С / Excel / CSV). Остатки задаются только для НОВЫХ позиций.
exports.mskImport = handle(async req => {
  const A = await actor(req); needOwner(A);
  const d = req.data || {};
  const list = Array.isArray(d.rows) ? d.rows : [];
  if (!list.length) throw bad('invalid-argument', 'Файл пуст.');
  if (list.length > 150) throw bad('invalid-argument', 'Не больше 150 строк за один запрос.');
  const rows = [];
  for (const r of list) {
    const a = clean(r.a), s = clean(r.s);
    if (!a || !s) continue;
    const q = r.q === '' || r.q == null ? 0 : int(r.q);
    const bc = String(r.bc || '').split(/[;,\s]+/).map(x => x.replace(/[^A-Za-z0-9_.\-]/g, '')).filter(x => x.length >= 3);
    rows.push({ key: keyOf(a, s), a, s, q, bc, name: clean(r.name) });
  }
  if (!rows.length) throw bad('invalid-argument', 'Нет корректных строк (артикул + размер).');
  const uniq = [...new Map(rows.map(r => [r.key, r])).values()];
  return db.runTransaction(async tx => {
    const refs = uniq.map(r => db.collection('msk_items').doc(r.key));
    const snaps = await tx.getAll(...refs);
    guard(uniq.length * 2 + 2);
    const now = Date.now();
    let created = 0, updated = 0;
    uniq.forEach((r, i) => {
      if (snaps[i].exists) {
        const up = { upd: now };
        if (r.bc.length) up.bc = FieldValue.arrayUnion(...r.bc);
        if (r.name && !snaps[i].data().name) up.name = r.name;
        tx.update(refs[i], up); updated++;
      } else {
        tx.set(refs[i], { a: r.a, s: r.s, q: r.q, tr: 0, bc: r.bc, bt: 'unit', name: r.name, created: now, upd: now });
        created++;
        if (r.q > 0) hist(tx, A, { type: 'import_init', a: r.a, s: r.s, q: r.q, reason: 'Первоначальный импорт', before: 0, after: r.q });
      }
    });
    return { ok: true, created, updated };
  });
});

// Проверка связи: владелец нажимает «Проверить сервер» и сразу видит, работают ли функции
exports.mskPing = handle(async req => {
  const A = await actor(req);
  return { ok: true, owner: A.isOwner, moscow: !!A.st, node: process.version, time: Date.now() };
});
