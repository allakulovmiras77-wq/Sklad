'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();

const db = getFirestore();
const TZ = 'Asia/Tashkent';
const FACTORY = { lat: 42.3936891, lng: 59.4669044 };
const RADIUS_METERS = 100;
const LATE_AFTER = '09:30';
const ADMIN_EMAILS = [
  'lidertekstil10@gmail.com',
  'lidertekstil4@gmail.com'
];

const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((o, p) => {
    o[p.type] = p.value;
    return o;
  }, {});

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    month: `${parts.year}-${parts.month}`
  };
}

function localClock(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function distanceMeters(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) *
    Math.cos(rad(b.lat)) *
    Math.sin(dLng / 2) ** 2;

  return 6371000 * 2 *
    Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function signedInWorker(request) {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Войдите в аккаунт.'
    );
  }

  const uid = request.auth.uid;

  const staffSnap = await db.collection('hr_staff')
    .where('authUid', '==', uid)
    .limit(1)
    .get();

  if (staffSnap.empty) {
    throw new HttpsError(
      'permission-denied',
      'Аккаунт не привязан к карточке сотрудника. Обратитесь к управляющему.'
    );
  }

  const staffDoc = staffSnap.docs[0];
  const staff = staffDoc.data();

  if (staff.active === false || staff.grp !== 'sewing') {
    throw new HttpsError(
      'permission-denied',
      'Нет доступа к отметкам швей.'
    );
  }

  const userSnap = await db.collection('users').doc(uid).get();

  if (userSnap.exists && userSnap.data().blocked === true) {
    throw new HttpsError(
      'permission-denied',
      'Доступ к приложению закрыт.'
    );
  }

  return {
    uid,
    staffId: staffDoc.id,
    staff
  };
}

function validateLocation(data) {
  const lat = Number(data && data.latitude);
  const lng = Number(data && data.longitude);
  const accuracy = Number(data && data.accuracy);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Не удалось определить GPS. Включите геолокацию и попробуйте снова.'
    );
  }

  if (
    !Number.isFinite(accuracy) ||
    accuracy <= 0 ||
    accuracy > 100
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Точность GPS недостаточна. Попробуйте на улице.'
    );
  }

  const distance = distanceMeters(
    { lat, lng },
    FACTORY
  );

  if (distance > RADIUS_METERS) {
    throw new HttpsError(
      'failed-precondition',
      `Вы вне разрешённой зоны (${Math.round(distance)} м). Допуск — ${RADIUS_METERS} м.`
    );
  }

  return {
    latitude: lat,
    longitude: lng,
    accuracy: Math.round(accuracy),
    distanceMeters: Math.round(distance)
  };
}

// QR-код общий для входа.
// Проверка аккаунта и GPS выполняется на сервере.
exports.recordSewingAttendance = onCall({
  region: 'us-central1',
  enforceAppCheck: false
}, async request => {
  const { uid, staffId, staff } =
    await signedInWorker(request);

  const action = request.data && request.data.action;

  if (!['in', 'out'].includes(action)) {
    throw new HttpsError(
      'invalid-argument',
      'Неизвестный тип отметки.'
    );
  }

  if (request.data.qr !== 'SKLAD_LT_SEWING_ENTRANCE_V1') {
    throw new HttpsError(
      'invalid-argument',
      'QR-код не распознан.'
    );
  }

  const gps = validateLocation(request.data);
  const now = new Date();
  const { day, month } = dateParts(now);
  const clock = localClock(now);

  const docId = `${day}_${staffId}`;

  const ref = db.collection('hr_qr_attendance').doc(docId);
  const eventRef = db.collection('hr_qr_events').doc();

  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);

    const current = snap.exists
      ? snap.data()
      : {
          day,
          month,
          staffId,
          staffName: staff.name || '',
          events: [],
          state: 'pending'
        };

    const events = Array.isArray(current.events)
      ? current.events
      : [];

    if (events.some(e => e.action === action)) {
      throw new HttpsError(
        'already-exists',
        action === 'in'
          ? 'Приход уже отмечен. Обратитесь к руководителю, если нужна корректировка.'
          : 'Уход уже отмечен. Обратитесь к руководителю, если нужна корректировка.'
      );
    }

    if (
      action === 'out' &&
      !events.some(e => e.action === 'in')
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Сначала должна быть отметка прихода.'
      );
    }

    const event = {
      action,
      at: Timestamp.now(),
      localTime: clock,
      uid,
      gps,
      source: 'qr'
    };

    const updated = {
      ...current,
      day,
      month,
      staffId,
      uid,
      staffName: staff.name || '',
      state: 'pending',
      events: [...events, event],
      updatedAt: FieldValue.serverTimestamp()
    };

    tx.set(ref, updated, { merge: true });

    tx.set(eventRef, {
      day,
      month,
      staffId,
      uid,
      action,
      source: 'qr',
      gps,
      localTime: clock,
      createdAt: FieldValue.serverTimestamp()
    });

    return {
      day,
      clock,
      late: action === 'in' && clock > LATE_AFTER
    };
  });

  return {
    ok: true,
    ...result,
    message: result.late
      ? 'Приход сохранён. Отметка будет отмечена как опоздание после проверки.'
      : 'Отметка сохранена и ожидает проверки руководителем.'
  };
});

async function requireHrManager(request) {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Войдите в аккаунт.'
    );
  }

  const tokenEmail =
    String(request.auth.token.email || '').toLowerCase();

  const profile = await db.collection('users')
    .doc(request.auth.uid)
    .get();

  const hr = profile.exists ? profile.data().hr : '';

  if (
    !ADMIN_EMAILS.includes(tokenEmail) &&
    !['view', 'edit'].includes(hr)
  ) {
    throw new HttpsError(
      'permission-denied',
      'Нет доступа к проверке табеля.'
    );
  }

  return {
    uid: request.auth.uid,
    email: tokenEmail,
    canEdit:
      ADMIN_EMAILS.includes(tokenEmail) ||
      hr === 'edit'
  };
}

// Подтверждение QR-отметок руководителем.
exports.reviewSewingAttendance = onCall({
  region: 'us-central1'
}, async request => {
  const manager = await requireHrManager(request);

  if (!manager.canEdit) {
    throw new HttpsError(
      'permission-denied',
      'Нужны права редактирования табеля.'
    );
  }

  const day = String(request.data && request.data.day || '');
  const decisions = request.data && request.data.decisions;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Array.isArray(decisions) ||
    decisions.length < 1 ||
    decisions.length > 100
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Укажите дату и список отметок для проверки.'
    );
  }

  const parsedDay = new Date(`${day}T12:00:00Z`);

  if (
    Number.isNaN(parsedDay.getTime()) ||
    parsedDay.toISOString().slice(0, 10) !== day
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Указана несуществующая дата.'
    );
  }

  const { month } = dateParts(parsedDay);
  const batch = db.batch();
  const reviewed = [];
  const seenStaffIds = new Set();

  for (const d of decisions) {
    if (
      !d ||
      typeof d.staffId !== 'string' ||
      !d.staffId.trim() ||
      d.staffId.length > 160 ||
      !['Б', 'ПД', 'НБ'].includes(d.status)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Недопустимая отметка.'
      );
    }

    if (seenStaffIds.has(d.staffId)) {
      throw new HttpsError(
        'invalid-argument',
        `Сотрудник ${d.staffId} указан дважды.`
      );
    }

    seenStaffIds.add(d.staffId);

    const ref = db.collection('hr_qr_attendance')
      .doc(`${day}_${d.staffId}`);

    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError(
        'failed-precondition',
        `Нет QR-отметки для сотрудника ${d.staffId}.`
      );
    }

    const record = snap.data();

    if (record.state === 'approved') {
      throw new HttpsError(
        'already-exists',
        `Запись ${d.staffId} уже подтверждена.`
      );
    }

    batch.set(ref, {
      state: 'approved',
      approvedStatus: d.status,
      reviewedBy: manager.uid,
      reviewedByEmail: manager.email,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: String(d.note || '').slice(0, 300)
    }, { merge: true });

    // Совместимость с существующим месячным табелем.
    const monthRef = db.collection('hr_att').doc(month);

    batch.set(monthRef, {
      marks: {
        [d.staffId]: {
          [day.slice(8, 10)]: d.status
        }
      },
      upd: {
        [d.staffId]: {
          by: manager.email || manager.uid,
          at: Date.now(),
          source: 'qr-review'
        }
      }
    }, { merge: true });

    reviewed.push(d.staffId);
  }

  batch.set(db.collection('hr_log').doc(), {
    ts: Date.now(),
    by: manager.email || manager.uid,
    t: `Подтверждены QR-отметки швей за ${day}: ${reviewed.length}`,
    source: 'qr-review',
    staffIds: reviewed
  });

  await batch.commit();

  return {
    ok: true,
    reviewed: reviewed.length,
    day
  };
});

// Ручная корректировка табеля с обязательной причиной.
exports.correctSewingAttendance = onCall({
  region: 'us-central1'
}, async request => {
  const manager = await requireHrManager(request);

  if (!manager.canEdit) {
    throw new HttpsError(
      'permission-denied',
      'Нужны права редактирования табеля.'
    );
  }

  const data = request.data || {};
  const day = String(data.day || '');
  const staffId = String(data.staffId || '').trim();
  const status = String(data.status || '');
  const reason = String(data.reason || '').trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !staffId ||
    staffId.length > 160
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Укажите корректную дату и сотрудника.'
    );
  }

  if (!['Б', 'ПД', 'НБ'].includes(status)) {
    throw new HttpsError(
      'invalid-argument',
      'Недопустимая отметка табеля.'
    );
  }

  if (reason.length < 5 || reason.length > 500) {
    throw new HttpsError(
      'invalid-argument',
      'Укажите причину исправления (от 5 до 500 символов).'
    );
  }

  const staffRef = db.collection('hr_staff').doc(staffId);
  const staffSnap = await staffRef.get();

  if (
    !staffSnap.exists ||
    staffSnap.data().grp !== 'sewing' ||
    staffSnap.data().active === false
  ) {
    throw new HttpsError(
      'not-found',
      'Активный сотрудник-швея не найден. Проверьте ID карточки сотрудника.'
    );
  }

  const { month } = dateParts(new Date(`${day}T12:00:00Z`));

  const attendanceRef = db.collection('hr_qr_attendance')
    .doc(`${day}_${staffId}`);

  const monthRef = db.collection('hr_att').doc(month);
  const auditRef = db.collection('hr_qr_audit').doc();

  await db.runTransaction(async tx => {
    const [attendanceSnap, monthSnap] = await Promise.all([
      tx.get(attendanceRef),
      tx.get(monthRef)
    ]);

    const existing = attendanceSnap.exists
      ? attendanceSnap.data()
      : {};

    const monthData = monthSnap.exists
      ? monthSnap.data()
      : {};

    const marks = { ...(monthData.marks || {}) };
    const staffMarks = { ...(marks[staffId] || {}) };

    const previousStatus =
      staffMarks[day.slice(8, 10)] ?? null;

    const previousState = existing.state || null;

    staffMarks[day.slice(8, 10)] = status;
    marks[staffId] = staffMarks;

    const upd = { ...(monthData.upd || {}) };
    const staffUpd = { ...(upd[staffId] || {}) };

    staffUpd[day.slice(8, 10)] = {
      by: manager.email || manager.uid,
      at: Date.now(),
      source: 'manual-sewing-correction',
      reason
    };

    upd[staffId] = staffUpd;

    tx.set(monthRef, { marks, upd }, { merge: true });

    tx.set(attendanceRef, {
      day,
      month,
      staffId,
      uid: existing.uid || staffSnap.data().authUid || null,
      staffName:
        staffSnap.data().name || existing.staffName || '',
      state: 'approved',
      approvedStatus: status,
      manualCorrection: true,
      reviewedBy: manager.uid,
      reviewedByEmail: manager.email,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: reason,
      events: Array.isArray(existing.events)
        ? existing.events
        : [],
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    tx.create(auditRef, {
      day,
      month,
      staffId,
      staffName: staffSnap.data().name || '',
      previousStatus,
      newStatus: status,
      previousState,
      reason,
      actorUid: manager.uid,
      actorEmail: manager.email,
      source: 'manual',
      createdAt: FieldValue.serverTimestamp()
    });
  });

  await db.collection('hr_log').add({
    ts: Date.now(),
    by: manager.email || manager.uid,
    t: `Ручная корректировка табеля швеи ${staffSnap.data().name || staffId} за ${day}: ${status}. Причина: ${reason}`,
    source: 'manual-sewing-correction',
    staffId
  });

  return {
    ok: true,
    day,
    staffId,
    status,
    message: 'Исправление сохранено; причина и история изменений записаны.'
  };
});

// Ежедневное напоминание швеям в 08:50.
exports.sewingAttendanceReminder = onSchedule({
  schedule: '50 8 * * 1-6',
  timeZone: TZ,
  region: 'us-central1',
  secrets: [TELEGRAM_BOT_TOKEN]
}, async () => {
  const today = dateParts().day;

  const sentRef = db.collection('hr_reminder_runs').doc(today);
  const existing = await sentRef.get();

  if (existing.exists && existing.data().status === 'completed') {
    return;
  }

  await sentRef.set({
    status: 'running',
    startedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const staffSnap = await db.collection('hr_staff')
    .where('grp', '==', 'sewing')
    .get();

  const workers = staffSnap.docs.filter(d =>
    d.data().active !== false &&
    d.data().telegramChatId
  );

  const message =
    'Доброе утро! Не забудьте отметить приход на работу. ' +
    'Отсканируйте QR-код на входе и дождитесь подтверждения, ' +
    'что отметка успешно сохранена. Желаем хорошего рабочего дня!';

  let sent = 0;
  let failed = 0;
  let skipped = staffSnap.size - workers.length;

  for (const worker of workers) {
    const s = worker.data();

    const logRef = db.collection('hr_reminder_runs')
      .doc(today)
      .collection('workers')
      .doc(worker.id);

    const prior = await logRef.get();

    if (prior.exists && prior.data().status === 'sent') {
      skipped++;
      continue;
    }

    try {
      const token = TELEGRAM_BOT_TOKEN.value();

      if (!token) {
        throw new Error('Secret TELEGRAM_BOT_TOKEN не настроен');
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: s.telegramChatId,
            text: message
          })
        }
      );

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.description || `Telegram HTTP ${response.status}`
        );
      }

      await logRef.set({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp()
      });

      sent++;
    } catch (e) {
      await logRef.set({
        status: 'failed',
        error: String(e.message || e).slice(0, 300),
        attemptedAt: FieldValue.serverTimestamp()
      });

      failed++;
    }
  }

  await sentRef.set({
    status: failed ? 'completed_with_errors' : 'completed',
    sent,
    failed,
    skipped,
    completedAt: FieldValue.serverTimestamp()
  }, { merge: true });
});

// Ежедневная сводка руководителю в 17:40.
exports.sewingAttendanceManagerDigest = onSchedule({
  schedule: '40 17 * * 1-6',
  timeZone: TZ,
  region: 'us-central1',
  secrets: [TELEGRAM_BOT_TOKEN]
}, async () => {
  const today = dateParts().day;

  const configSnap = await db.collection('settings')
    .doc('sewingAttendance')
    .get();

  const chatIds =
    configSnap.exists &&
    Array.isArray(configSnap.data().telegramManagerChatIds)
      ? [...new Set(
          configSnap.data().telegramManagerChatIds
            .map(x => String(x).trim())
            .filter(Boolean)
        )]
      : [];

  if (!chatIds.length) {
    await db.collection('hr_manager_digest_runs')
      .doc(today)
      .set({
        status: 'skipped_no_manager_chats',
        day: today,
        completedAt: FieldValue.serverTimestamp()
      }, { merge: true });

    console.warn(
      'Sewing attendance digest skipped: ' +
      'settings/sewingAttendance.telegramManagerChatIds is empty.'
    );

    return;
  }

  const pendingSnap = await db.collection('hr_qr_attendance')
    .where('day', '==', today)
    .get();

  const pending = pendingSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.state !== 'approved');

  const lines = pending.slice(0, 50).map(r => {
    const events = Array.isArray(r.events) ? r.events : [];

    const arrival = events.find(e => e.action === 'in');
    const departure = events.find(e => e.action === 'out');

    const late =
      arrival && String(arrival.localTime || '') > LATE_AFTER
        ? ' — ОПОЗДАНИЕ'
        : '';

    return `• ${String(r.staffName || r.staffId || 'Сотрудник').slice(0, 80)}: приход ${arrival?.localTime || '—'}, уход ${departure?.localTime || '—'}${late}`;
  });

  const message = pending.length
    ? `Склад LT — проверка отметок швей за ${today}\n` +
      `Ожидают подтверждения: ${pending.length}\n\n` +
      `${lines.join('\n')}` +
      `${pending.length > lines.length ? `\n…и ещё ${pending.length - lines.length}` : ''}` +
      `\n\nОткройте страницу sewing.html для проверки.`
    : `Склад LT — отметки швей за ${today}\n` +
      'Неподтверждённых отметок нет. Проверьте табель при необходимости.';

  const runRef = db.collection('hr_manager_digest_runs').doc(today);

  await runRef.set({
    status: 'running',
    day: today,
    pendingCount: pending.length,
    startedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    const logRef = runRef.collection('managers')
      .doc(chatId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120));

    const prior = await logRef.get();

    if (prior.exists && prior.data().status === 'sent') {
      continue;
    }

    try {
      const token = TELEGRAM_BOT_TOKEN.value();

      if (!token) {
        throw new Error('Secret TELEGRAM_BOT_TOKEN не настроен');
      }

            const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message
          })
        }
      );

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.description || `Telegram HTTP ${response.status}`
        );
      }

      await logRef.set({
        status: 'sent',
        sentAt: FieldValue.serverTimestamp()
      });

      sent++;
    } catch (e) {
      await logRef.set({
        status: 'failed',
        error: String(e.message || e).slice(0, 300),
        attemptedAt: FieldValue.serverTimestamp()
      });

      failed++;
    }
  }

  await runRef.set({
    status: failed ? 'completed_with_errors' : 'completed',
    sent,
    failed,
    completedAt: FieldValue.serverTimestamp()
  }, { merge: true });
});
