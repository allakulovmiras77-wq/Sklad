// Общий QR-код на входе.
// Первый скан за день = приход, второй = уход.
// Тип отметки определяет сервер, а не телефон сотрудника.
exports.recordSewingAttendance = onCall({
  region: 'us-central1',
  enforceAppCheck: false
}, async request => {
  const { uid, staffId, staff } =
    await signedInWorker(request);

  const data = request.data || {};

  if (data.qr !== 'SKLAD_LT_SEWING_ENTRANCE_V1') {
    throw new HttpsError(
      'invalid-argument',
      'QR-код не распознан.'
    );
  }

  const gps = validateLocation(data);
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

    const hasIn = events.some(e => e.action === 'in');
    const hasOut = events.some(e => e.action === 'out');

    let action;

    if (!hasIn) {
      action = 'in';
    } else if (!hasOut) {
      action = 'out';
    } else {
      throw new HttpsError(
        'already-exists',
        'Приход и уход за сегодня уже отмечены.'
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

    tx.set(ref, {
      day,
      month,
      staffId,
      uid,
      staffName: staff.name || '',
      state: 'pending',
      events: [...events, event],
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

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
      action,
      late: action === 'in' && clock > LATE_AFTER
    };
  });

  return {
    ok: true,
    ...result,
    message: result.action === 'in'
      ? 'Приход сохранён. Ожидает проверки руководителем.'
      : 'Уход сохранён. Ожидает проверки руководителем.'
  };
});
