// Отправка рассылок владельца (новости / обновления программы) через Web Push.
// Берёт из Firestore рассылки со статусом queued (их создаёт владелец в окне 🔔 → «Отправить»),
// отправляет push тем, кто есть в broadcasts/{id}.uids и включил уведомления (push_subs), и записывает итог.
// Запуск: node scripts/send-broadcast.cjs (workflow «Send broadcast»).
const admin = require('firebase-admin');
const webpush = require('web-push');

const PUB = process.env.VAPID_PUBLIC_KEY || 'BC3BGD4LE3xmqFPArNHMC0mXa3WcQv5FsROz5sv_45AjYCcX8hDgN47T-uzDVSQWv1WFNBV-aail1j0VSQ7OuWM';
const PRIV = process.env.VAPID_PRIVATE_KEY;
if (!PRIV) { console.error('Нет секрета VAPID_PRIVATE_KEY'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
webpush.setVapidDetails('mailto:lidertekstil10@gmail.com', PUB, PRIV);

async function sendOne(ref, d) {
  const uids = Array.isArray(d.uids) ? [...new Set(d.uids.map(String))].slice(0, 500) : [];
  const payload = JSON.stringify({
    title: String(d.title || 'LT Склад').slice(0, 80),
    body: String(d.body || '').slice(0, 600),
    url: './',
    tag: 'lt-news-' + ref.id
  });
  const stats = { total: uids.length, sent: 0, failed: 0, noSub: 0, gone: 0 };
  const subRefs = uids.map(u => db.collection('push_subs').doc(u));
  const snaps = subRefs.length ? await db.getAll(...subRefs) : [];
  const jobs = [];
  snaps.forEach(s => {
    const v = s.exists ? s.data() : null;
    if (!v || !v.sub || !v.sub.endpoint) { stats.noSub++; return; }
    jobs.push({ ref: s.ref, sub: v.sub });
  });
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(jobs.slice(i, i + 10).map(async j => {
      try {
        await webpush.sendNotification(j.sub, payload, { TTL: 86400, urgency: 'high' });
        stats.sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) {
          stats.gone++;
          try { await j.ref.delete(); } catch (_) {}
        } else {
          stats.failed++;
          console.log('Ошибка отправки:', e && (e.statusCode || e.message));
        }
      }
    }));
  }
  await ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp(), stats });
  console.log('Рассылка', ref.id, 'готова:', JSON.stringify(stats));
}

(async () => {
  const queued = (await db.collection('broadcasts').where('status', '==', 'queued').get()).docs;
  // «sending» дольше 10 минут — прошлый запуск оборвался, пробуем ещё раз
  const stuck = (await db.collection('broadcasts').where('status', '==', 'sending').get()).docs
    .filter(d => { const t = d.data().sendingAt; return !t || Date.now() - t.toMillis() > 10 * 60 * 1000; });
  const all = queued.concat(stuck);
  if (!all.length) { console.log('Новых рассылок нет'); return; }
  for (const d of all) {
    // защита от двойной отправки: статус меняется в транзакции
    const ok = await db.runTransaction(async tx => {
      const s = await tx.get(d.ref);
      const st = s.data().status;
      if (st !== 'queued' && st !== 'sending') return false;
      tx.update(d.ref, { status: 'sending', sendingAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    });
    if (!ok) continue;
    try { await sendOne(d.ref, d.data()); }
    catch (e) { console.error('Сбой рассылки', d.id, e); await d.ref.update({ status: 'queued' }).catch(() => {}); }
  }
})().catch(e => { console.error(e); process.exit(1); });
