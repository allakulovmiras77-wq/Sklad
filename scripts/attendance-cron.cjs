// Бесплатные уведомления через GitHub Actions (без Cloud Functions).
// Запуск: node attendance-cron.cjs morning | evening
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN, OWNER = process.env.TELEGRAM_OWNER_CHAT;
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function tg(chat, text) {
  if (!TOKEN || !chat) return false;
  try { const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) }); return r.ok; }
  catch (e) { return false; }
}
// Приход есть, а ухода нет: нужна ли авто-отметка НБ за день dd? (doc — документ hr_sew_days швеи за месяц, list — её события за день)
function needsNb(doc, dd, list) {
  const e = ((doc && doc.ed) || {})[dd] || {}, cf = e.cf || {};
  if (((doc && doc.marks) || {})[dd]) return false;                                   // отметку уже поставили вручную
  if ((Array.isArray(e.tm) && e.tm.length) || e.tin || typeof e.w === 'number') return false; // ручное время или правка часов
  const L = (list || []).filter(x => cf[String(x.n)] !== 'n').sort((a, b) => (a.n || 0) - (b.n || 0));
  if (!L.length) return false;
  const last = L[L.length - 1];
  return !((last.n % 2 === 0) || last.type === 'out' || last.asOut);                  // последняя отметка — приход, ухода нет
}
(async () => {
  const mode = process.argv[2];
  const profs = (await db.collection('hr_sew_profiles').get()).docs.map(d => ({ ...d.data(), id: d.id })).filter(p => p.active !== false && !p.replacedBy);
  if (mode === 'morning') {
    const msg = 'Доброе утро! Не забудьте отсканировать QR-код при входе на работу. Начало рабочего дня в 09:00. Желаем хорошего рабочего дня!';
    let ok = 0, skip = 0;
    for (const p of profs) { if (!p.telegramId) { skip++; continue; } (await tg(p.telegramId, msg)) ? ok++ : skip++; }
    console.log('morning sent', ok, 'skipped', skip);
  } else if (mode === 'evening') {
    const ev = (await db.collection('hr_qr_events').where('day', '==', day).get()).docs.map(d => d.data());
    const came = new Set(ev.filter(e => e.n === 1).map(e => e.staffId)), left = new Set(ev.filter(e => e.n === 2).map(e => e.staffId));
    const noIn = profs.filter(p => !came.has(p.staffId)).length, noOut = profs.filter(p => came.has(p.staffId) && !left.has(p.staffId)).length;
    await tg(OWNER, `Табель за ${day} готов к проверке.\nВсего швей: ${profs.length}. Пришли: ${came.size}. Не пришли: ${noIn}. Нет ухода: ${noOut}.\nОткройте LT Склад → Ещё → Посещаемость швей и подтвердите табель.`);
    console.log('evening summary sent');
  } else if (mode === 'noout') { // 18:05: был приход, ухода нет -> НБ, швее — уведомление (его можно изменить вручную)
    if (new Date(day + 'T12:00:00Z').getUTCDay() === 0) { console.log('воскресенье, пропуск'); return; }
    const mo = day.slice(0, 7), dd = day.slice(8, 10), dm = dd + '.' + day.slice(5, 7);
    const ev = (await db.collection('hr_qr_events').where('day', '==', day).get()).docs.map(d => d.data());
    const by = {}; for (const e of ev) for (const k of [e.staffId, e.uid]) if (k) (by[k] = by[k] || []).push(e);
    const bad = [];
    for (const p of profs) {
      if (!p.staffId) continue;
      const ref = db.collection('hr_sew_days').doc(p.id + '_' + mo), snap = await ref.get(), doc = snap.exists ? snap.data() : {};
      if (!needsNb(doc, dd, by[p.staffId] || by[p.id] || [])) continue;
      const now = Date.now();
      await ref.set({ uid: p.id, month: mo, staffId: p.staffId, name: p.name, marks: { [dd]: 'НБ' }, upd: { by: 'Авто: нет ухода до 18:00', at: now } }, { merge: true });
      await db.collection('hr_qr_audit').add({ staffId: p.staffId, day, status: 'НБ', proposed: 'НБ', by: 'Авто (нет ухода до 18:00)', byEmail: '', at: now, reason: 'Не отсканирован уход до 18:00', prev: '', name: p.name, act: 'confirm' });
      await db.collection('hr_sew_notices').doc(p.id + '_' + day).set({ uid: p.id, staffId: p.staffId, name: p.name, day, kind: 'noout', seen: false, at: now });
      if (p.telegramId) await tg(p.telegramId, `Вы не отсканировали уход за ${dm} до 18:00, поставлен НБ. Не забывайте сканировать уход. Если вы работали до конца дня, сообщите старшей швее или бухгалтеру — отметку исправят.`);
      bad.push(p.name);
    }
    if (bad.length) await tg(OWNER, `Авто-НБ за ${dm}: приход был, ухода нет (${bad.length}).\n${bad.join('\n')}\nЕсли это ошибка, исправьте: LT Склад → Ещё → Посещаемость швей.`);
    console.log('noout НБ поставлено:', bad.length, bad.join(', '));
  }
})().catch(e => { console.error(e); process.exit(1); });
