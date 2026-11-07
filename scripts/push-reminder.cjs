// Напоминание «Не забудьте отсканировать QR» через веб-уведомления (Web Push).
// Получатели: швеи (hr_sew_profiles) и сотрудники склада, которым владелец назначил сканер (users.qrScan).
// Язык берётся из подписки (ru / uz). Тем, кто уже отметил приход сегодня, напоминание не отправляется.
// Запуск: node scripts/push-reminder.cjs (FORCE=1 — тестовая отправка всем с подпиской).

const admin = require('firebase-admin');
const webpush = require('web-push');

const PUB = process.env.VAPID_PUBLIC_KEY || 'BC3BGD4LE3xmqFPArNHMC0mXa3WcQv5FsROz5sv_45AjYCcX8hDgN47T-uzDVSQWv1WFNBV-aail1j0VSQ7OuWM';
const PRIV = process.env.VAPID_PRIVATE_KEY;
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';

if (!PRIV) {
  console.error('Нет секрета VAPID_PRIVATE_KEY');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  )
});

const db = admin.firestore();

webpush.setVapidDetails(
  'mailto:lidertekstil10@gmail.com',
  PUB,
  PRIV
);

const TZ = 'Asia/Tashkent';
const now = new Date();

const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(now).map(x => [x.type, x.value])
);

const day = parts.year + '-' + parts.month + '-' + parts.day;
const nowMin = Number(parts.hour) * 60 + Number(parts.minute);
const isSunday = parts.weekday === 'Sun';

const TXT = (start) => ({
  ru: {
    title: '☀️ Доброе утро! Не забудьте отметиться',
    body: 'Отсканируйте QR-код при входе на работу — начало дня в ' + start + '. Хорошего рабочего дня! 💙'
  },
  uz: {
    title: '☀️ Xayrli tong! Belgilashni unutmang',
    body: "Ishga kirganingizda QR-kodni skanerlang — ish kuni soat " + start + " da boshlanadi. Ishingiz xayrli o'tsin! 💙"
  }
});

(async () => {
  if (!FORCE) {
    if (isSunday) {
      console.log('Воскресенье — пропуск');
      return;
    }

    if (nowMin < 8 * 60) {
      console.log('Слишком рано (' + nowMin + ' мин)');
      return;
    }

    if (nowMin >= 10 * 60) {
      console.log('Уже поздно для утреннего напоминания');
      return;
    }

    // Защита от двойной отправки.
    try {
      await db.collection('push_runs')
        .doc(day + '_morning')
        .create({
          at: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
      console.log('Сегодня напоминание уже отправлено');
      return;
    }
  }

  const cfgSnap = await db.collection('app_config')
    .doc('attendance')
    .get();

  const start = (
    (cfgSnap.exists && cfgSnap.data().lateAfter) || '09:00'
  ).toString().slice(0, 5);

  const T = TXT(start);

  // Получатели.
  const targets = new Map();

  const sewingSnap = await db.collection('hr_sew_profiles').get();

  sewingSnap.docs.forEach(d => {
    const p = d.data();

    if (p.active !== false && !p.replacedBy) {
      targets.set(d.id, 'sewing.html');
    }
  });

  const usersSnap = await db.collection('users')
    .where('qrScan', '==', true)
    .get();

  usersSnap.docs.forEach(d => {
    if (!d.data().blocked) {
      targets.set(d.id, './');
    }
  });

  // Кто уже отметил приход сегодня.
  const came = new Set();

  const sewingEvents = await db.collection('hr_qr_events')
    .where('day', '==', day)
    .get();

  sewingEvents.docs.forEach(d => {
    const v = d.data();

    if (v.n === 1) {
      came.add(v.uid);
    }
  });

  const warehouseEvents = await db.collection('hr_wh_scans')
    .where('day', '==', day)
    .get();

  warehouseEvents.docs.forEach(d => {
    const v = d.data();

    if (v.n === 1) {
      came.add(v.uid);
    }
  });

  // Подписки пользователей.
  const subs = (await db.collection('push_subs').get()).docs;

  let sent = 0;
  let skipped = 0;
  let removed = 0;
  let failed = 0;

  for (const s of subs) {
    const v = s.data();
    const uid = s.id;

    if (!FORCE && !targets.has(uid)) {
      skipped++;
      continue;
    }

    if (!FORCE && came.has(uid)) {
      skipped++;
      continue;
    }

    if (!v.sub || !v.sub.endpoint) {
      skipped++;
      continue;
    }

    const m = T[v.lang === 'uz' ? 'uz' : 'ru'];

    const payload = JSON.stringify({
      title: m.title,
      body: m.body,
      url: targets.get(uid) || './',
      tag: 'lt-qr-' + day
    });

    try {
      await webpush.sendNotification(
        v.sub,
        payload,
        {
          TTL: 3600,
          urgency: 'high'
        }
      );

      sent++;

    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await s.ref.delete().catch(() => {});
        removed++;
      } else {
        failed++;

        console.error(
          'push error',
          uid,
          e && e.statusCode,
          e && e.body
        );
      }
    }
  }

  console.log(JSON.stringify({
    day,
    force: FORCE,
    targets: targets.size,
    subscriptions: subs.length,
    sent,
    skipped,
    removedDead: removed,
    failed
  }));

})().catch(e => {
  console.error(e);
  process.exit(1);
});
