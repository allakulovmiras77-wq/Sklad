'use strict';

// Только серверные административные операции для существующей схемы Склад LT.
// Не меняет коллекции, документы или функции учёта, не относящиеся к этим операциям.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Безопасно инициализируем Admin SDK даже при отдельной загрузке модуля.
if (!getApps().length) initializeApp();
const db = getFirestore();
const OWNER = 'lidertekstil10@gmail.com';
const REGION = 'us-central1';
const MAX_BATCH = 450;

function fail(code, message) { throw new HttpsError(code, message); }
function ownerOnly(request) {
  if (!request.auth) fail('unauthenticated', 'Войдите в аккаунт.');
  const email = String(request.auth.token.email || '').toLowerCase();
  if (email !== OWNER) fail('permission-denied', 'Операция доступна только владельцу управляющей панели.');
  return email;
}
function cleanKeyText(value) {
  const LK = { 'Х':'X','М':'M','А':'A','С':'C','Е':'E','О':'O','Р':'P','Т':'T','В':'B','Н':'H','К':'K','Л':'L' };
  return String(value == null ? '' : value).trim().toUpperCase().replace(/[ХМАСЕОРТВНКЛ]/g, c => LK[c]);
}
function stockKey(a, s) {
  return (cleanKeyText(a) + '__' + cleanKeyText(s)).replace(/[\/\\#?\[\]]/g, '_');
}
function intQty(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

// Обе кнопки вызывают один серверный endpoint, но очищают строго выбранный склад.
// Документы мешков и SKU не удаляются: только количество/содержимое обнуляется.
exports.mskClearWarehouse = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  try {
    const email = ownerOnly(request);
    const warehouse = String((request.data || {}).warehouse || '');
    if (!['khojeyli', 'moscow'].includes(warehouse)) {
      fail('invalid-argument', 'Неизвестный склад.');
    }

    const now = Date.now();
    const actionId = 'clear_' + warehouse + '_' + now;
    let changed = 0;
    let totalQty = 0;

    if (warehouse === 'khojeyli') {
      // Ходжейли: очищаем только содержимое мешков. Документы мешков и каталог prods не трогаем.
      const snap = await db.collection('bags').get();
      for (let offset = 0; offset < snap.docs.length; offset += MAX_BATCH) {
        const batch = db.batch();
        const docs = snap.docs.slice(offset, offset + MAX_BATCH);
        docs.forEach(d => {
          const items = Array.isArray(d.data().items) ? d.data().items : [];
          totalQty += items.reduce((n, item) => n + intQty(item && item.q), 0);
          batch.update(d.ref, { items: [], lu: email, lt: now });
        });
        await batch.commit();
        changed += docs.length;
      }
      await db.collection('log').add({
        bag: 'ALL', type: 'warehouse_clear', a: '', s: '', d: -totalQty,
        ts: now, u: email, warehouse: 'khojeyli', actionId,
        note: 'Очищено содержимое мешков; документы мешков и каталог товаров сохранены'
      });
    } else {
      // Москва: актуальная схема проекта использует msk_stock (не msk_items).
      // Обнуляем только физический остаток q; транзит tr и документы отправлений сохраняем.
      const snap = await db.collection('msk_stock').get();
      const chunkSize = Math.floor(MAX_BATCH / 2); // по 2 записи: остаток + запись истории
      for (let offset = 0; offset < snap.docs.length; offset += chunkSize) {
        const batch = db.batch();
        const docs = snap.docs.slice(offset, offset + chunkSize);
        docs.forEach(d => {
          const row = d.data() || {};
          const before = intQty(row.q);
          totalQty += before;
          batch.update(d.ref, {
            q: 0,
            lo: actionId + '_' + d.id,
            lt: FieldValue.serverTimestamp()
          });
          if (before > 0) {
            batch.set(db.collection('msk_ops').doc(), {
              type: 'warehouse_clear', warehouse: 'moscow',
              a: String(row.a || ''), s: String(row.s || ''),
              d: -before, q: 0, uid: request.auth.uid,
              name: email, ts: FieldValue.serverTimestamp(),
              day: new Date().toISOString().slice(0, 10),
              reason: 'Очистка склада владельцем', actionId
            });
          }
        });
        await batch.commit();
        changed += docs.length;
      }
      await db.collection('msk_admin_audit').add({
        type: 'warehouse_clear', warehouse: 'moscow', actionId,
        uid: request.auth.uid, email, changed, totalQty,
        ts: FieldValue.serverTimestamp(),
        note: 'Физические остатки обнулены; карточки SKU, транзит и отправления сохранены'
      });
    }

    return { ok: true, warehouse, changed, totalQty, actionId };
  } catch (e) {
    console.error('mskClearWarehouse failed:', e && e.stack || e);
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', 'Ошибка очистки склада: ' + String((e && e.message) || e).slice(0, 220));
  }
});

// Отмена отправки владельцем с обратным движением остатков.
// Для уже принятых позиций товар снимается с текущего остатка Москвы;
// если его там уже недостаточно, операция целиком отклоняется, чтобы не создать минус.
// Непринятый товар возвращается в исходные мешки. Мешки не удаляются.
exports.mskAdminCancelShip = onCall({ region: REGION, enforceAppCheck: false }, async request => {
  const email = ownerOnly(request);
  const data = request.data || {};
  const shipId = String(data.shipId || '').trim();
  const reason = String(data.reason || 'Отмена владельцем').trim().slice(0, 300);
  if (!shipId || shipId.length > 160) fail('invalid-argument', 'Не указан номер отправки.');

  const shipRef = db.collection('msk_ships').doc(shipId);
  const auditRef = db.collection('msk_admin_audit').doc('cancel_' + shipId);
  return db.runTransaction(async tx => {
    const shipSnap = await tx.get(shipRef);
    const auditSnap = await tx.get(auditRef);
    if (auditSnap.exists) return { ok: true, duplicate: true, shipId };
    if (!shipSnap.exists) fail('not-found', 'Отправка не найдена.');
    const ship = shipSnap.data() || {};
    if (ship.status === 'cancelled') fail('failed-precondition', 'Эта отправка уже отменена.');
    if (!Array.isArray(ship.lines) || !Array.isArray(ship.bags)) fail('failed-precondition', 'У отправки повреждён состав.');

    const rcvQuery = db.collection('msk_ops').where('ship', '==', shipId);
    const rcvSnap = await tx.get(rcvQuery);
    const received = new Map();
    rcvSnap.docs.forEach(docSnap => {
      const op = docSnap.data() || {};
      if (op.type !== 'receive') return;
      const line = Number(op.ln);
      if (!Number.isInteger(line) || line < 0) return;
      const cur = received.get(line) || { good: 0, bad: 0 };
      cur.good += intQty(op.d);
      cur.bad += intQty(op.bad);
      received.set(line, cur);
    });

    const returnedBags = new Set(Array.isArray(ship.ret) ? ship.ret : []);
    const bagIds = [...new Set(ship.bags.map(x => String(x).trim()).filter(Boolean))];
    const bagRefs = bagIds.map(id => db.collection('bags').doc(id));
    const bagSnaps = bagRefs.length ? await tx.getAll(...bagRefs) : [];
    const bagData = new Map();
    bagSnaps.forEach((s, i) => {
      if (!s.exists) fail('failed-precondition', 'Мешок ' + bagIds[i] + ' не найден.');
      bagData.set(bagIds[i], Array.isArray(s.data().items) ? s.data().items : []);
    });

    const restoreByBag = new Map();
    const stockByKey = new Map();
    ship.lines.forEach((line, index) => {
      const bag = String(line.bag || '').trim();
      if (!bag || returnedBags.has(bag)) return; // ранее возвращённые мешки повторно не трогаем
      const a = String(line.a || '').trim();
      const s = String(line.s || '').trim();
      const expected = intQty(line.q);
      if (!a || !s || expected <= 0) return;
      const r = received.get(index) || { good: 0, bad: 0 };
      const good = r.good;
      const damaged = Math.min(expected, r.bad);
      // В открытой отправке остаток ещё в пути; в закрытой недостача считается потерянной.
      const restoreQty = ship.status === 'open'
        ? Math.max(good, expected - damaged)
        : good;
      if (restoreQty > 0) {
        if (!restoreByBag.has(bag)) restoreByBag.set(bag, new Map());
        const map = restoreByBag.get(bag);
        const key = cleanKeyText(a) + '~' + cleanKeyText(s);
        const cur = map.get(key) || { a, s, q: 0 };
        cur.q += restoreQty;
        map.set(key, cur);
      }
      if (good > 0) {
        const key = stockKey(a, s);
        const cur = stockByKey.get(key) || { key, a, s, q: 0 };
        cur.q += good;
        stockByKey.set(key, cur);
      }
    });

    const stockRows = [...stockByKey.values()];
    const stockRefs = stockRows.map(r => db.collection('msk_stock').doc(r.key));
    const stockSnaps = stockRefs.length ? await tx.getAll(...stockRefs) : [];
    const writes = bagRefs.length + stockRefs.length + 2;
    if (writes > MAX_BATCH) fail('resource-exhausted', 'Слишком большая отправка для безопасной отмены. Обратитесь к разработчику.');

    const now = Date.now();
    stockRows.forEach((row, i) => {
      const snap = stockSnaps[i];
      const current = snap.exists ? intQty(snap.data().q) : 0;
      if (current < row.q) {
        fail('failed-precondition', 'Нельзя отменить: на складе Москва уже нет достаточного количества ' + row.a + ' ' + row.s + '. Есть ' + current + ', нужно вернуть ' + row.q + '.');
      }
      tx.update(stockRefs[i], {
        q: current - row.q,
        lo: 'cancel_' + shipId + '_' + row.key,
        lt: FieldValue.serverTimestamp()
      });
    });

    bagIds.forEach((bagId, i) => {
      if (returnedBags.has(bagId)) return;
      const currentItems = bagData.get(bagId) || [];
      const merged = new Map();
      currentItems.forEach(item => {
        const key = cleanKeyText(item.a) + '~' + cleanKeyText(item.s);
        const old = merged.get(key) || { a: String(item.a), s: String(item.s), q: 0 };
        old.q += intQty(item.q);
        merged.set(key, old);
      });
      (restoreByBag.get(bagId) || new Map()).forEach((item, key) => {
        const old = merged.get(key) || { a: item.a, s: item.s, q: 0 };
        old.q += item.q;
        merged.set(key, old);
      });
      tx.update(bagRefs[i], { items: [...merged.values()], lu: email, lt: now });
    });

    tx.update(shipRef, {
      status: 'cancelled',
      ret: bagIds,
      cancelledAt: now,
      cancelledBy: email,
      cancelReason: reason
    });
    tx.set(auditRef, {
      type: 'ship_cancel', shipId, shipNo: String(ship.no || shipId),
      uid: request.auth.uid, email, reason,
      restoredBags: [...restoreByBag.keys()],
      restoredLines: restoreByBag.size,
      moscowLines: stockRows.length,
      ts: FieldValue.serverTimestamp()
    });
    return { ok: true, shipId, status: 'cancelled', restoredBags: restoreByBag.size, adjustedMoscowRows: stockRows.length };
  });
});
