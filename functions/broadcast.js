'use strict';
// Рассылка уведомлений владельцем: новости компании, обновления программы.
// Вызывается из notify.js (кнопка «Отправить»). Получатели уже выбраны владельцем и записаны в broadcasts/{id}.uids.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const webpush = require('web-push');

if (!getApps().length) initializeApp();
const db = getFirestore();
const ADMIN = 'lidertekstil10@gmail.com';
const VAPID_PUB = 'BC3BGD4LE3xmqFPArNHMC0mXa3WcQv5FsROz5sv_45AjYCcX8hDgN47T-uzDVSQWv1WFNBV-aail1j0VSQ7OuWM';

exports.sendBroadcast = onCall({ region: 'us-central1', timeoutSeconds: 120, enforceAppCheck: false }, async request => {
  const email = String((request.auth && request.auth.token && request.auth.token.email) || '').toLowerCase();
  if (!request.auth) throw new HttpsError('unauthenticated', 'Войдите в аккаунт.');
  if (email !== ADMIN) throw new HttpsError('permission-denied', 'Рассылку может отправлять только владелец.');

  const id = String((request.data && request.data.id) || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Нет номера рассылки.');

  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) throw new HttpsError('failed-precondition', 'На сервере нет ключа уведомлений (VAPID_PRIVATE_KEY). Запустите Deploy broadcast function.');
  webpush.setVapidDetails('mailto:' + ADMIN, VAPID_PUB, priv);

  const ref = db.collection('broadcasts').doc(id);
  // Защита от двойной отправки: статус queued -> sending выполняется один раз.
  const d = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpsError('not-found', 'Рассылка не найдена.');
    const v = s.data();
    if (v.status !== 'queued') return { done: true, stats: v.stats || {} };
    tx.update(ref, { status: 'sending' });
    return v;
  });
  if (d.done) return { ok: true, repeated: true, stats: d.stats };

  const uids = Array.isArray(d.uids) ? [...new Set(d.uids.map(String))].slice(0, 500) : [];
  const payload = JSON.stringify({
    title: String(d.title || 'LT Склад').slice(0, 80),
    body: String(d.body || '').slice(0, 600),
    url: './',
    tag: 'lt-news-' + id
  });

  const stats = { total: uids.length, sent: 0, failed: 0, noSub: 0, gone: 0 };
  const refs = uids.map(u => db.collection('push_subs').doc(u));
  const snaps = refs.length ? await db.getAll(...refs) : [];

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
        }
      }
    }));
  }

  await ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), stats });
  return { ok: true, stats };
});
