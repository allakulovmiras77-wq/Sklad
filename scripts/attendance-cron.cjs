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
(async () => {
  const mode = process.argv[2];
  const profs = (await db.collection('hr_sew_profiles').get()).docs.map(d => d.data()).filter(p => p.active !== false && !p.replacedBy);
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
  }
})().catch(e => { console.error(e); process.exit(1); });
