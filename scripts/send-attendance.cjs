const admin = require('firebase-admin');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const WIDTH = 1536;
const HEADER_HEIGHT = 142;
const FOOTER_HEIGHT = 104;
const TABLE_HEADER_HEIGHT = 42;
const ROW_HEIGHT = 27;
const LEFT_WIDTH = 332;
const REFERENCE_PATH = path.join(__dirname, '..', 'attendance-reference.png');

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[ch]);
}

function getStatus(marks, personId, day) {
  const dayKey = String(day).padStart(2, '0');
  const dayKeyShort = String(day);
  // The app's stored map can be either day -> employee or employee -> day.
  const candidates = [
    marks?.[dayKey]?.[personId], marks?.[dayKeyShort]?.[personId],
    marks?.[personId]?.[dayKey], marks?.[personId]?.[dayKeyShort]
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string'
      ? candidate
      : candidate && typeof candidate === 'object'
        ? (candidate.status ?? candidate.mark ?? candidate.value ?? '')
        : '';
    const normalized = String(value).trim().toUpperCase();
    if (['Б', 'НБ', 'ПД'].includes(normalized)) return normalized;
  }
  return '';
}

async function main() {
  const serviceAccountText = process.env.FIREBASE_SERVICE_ACCOUNT;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const dryRun = process.env.ATTENDANCE_DRY_RUN === '1';

  if (!serviceAccountText) throw new Error('Не задан FIREBASE_SERVICE_ACCOUNT');
  if (!dryRun && (!botToken || !chatId)) {
    throw new Error('Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID');
  }
  if (!fs.existsSync(REFERENCE_PATH)) {
    throw new Error(`Не найден референсный рисунок: ${REFERENCE_PATH}. Проверьте, что attendance-reference.png находится в корне репозитория.`);
  }

  const serviceAccount = JSON.parse(serviceAccountText);
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = Object.fromEntries(parts.map(item => [item.type, item.value]));
  const year = Number(part.year), month = Number(part.month);
  const monthId = `${part.year}-${part.month}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const now = new Date();
  const timestamp = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(now);
  const monthName = new Intl.DateTimeFormat('ru-RU', {
    month: 'long', year: 'numeric', timeZone: 'Asia/Tashkent'
  }).format(new Date(Date.UTC(year, month - 1, 15)));
  const monthTitle = monthName.charAt(0).toLocaleUpperCase('ru-RU') + monthName.slice(1);
  const period = `01.${part.month}.${part.year} – ${String(daysInMonth).padStart(2, '0')}.${part.month}.${part.year}`;

  const [staffSnapshot, attendanceSnapshot] = await Promise.all([
    db.collection('hr_staff').get(),
    db.collection('hr_att').doc(monthId).get()
  ]);
  const staff = staffSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(person => person.active !== false && person.name)
    .sort((a, b) => (Number(a.ord) || 9999) - (Number(b.ord) || 9999) ||
      String(a.name).localeCompare(String(b.name), 'ru'));
  if (!staff.length) throw new Error('В hr_staff не найдены активные сотрудники с именами');

  const attendance = attendanceSnapshot.exists ? attendanceSnapshot.data() : {};
  const marks = attendance.marks || {};
  const rowHeight = staff.length > 32 ? Math.max(22, Math.min(ROW_HEIGHT, Math.floor(760 / staff.length))) : ROW_HEIGHT;
  const tableY = HEADER_HEIGHT;
  const bodyY = tableY + TABLE_HEADER_HEIGHT;
  const bodyHeight = staff.length * rowHeight;
  const height = bodyY + bodyHeight + FOOTER_HEIGHT;
  const dayWidth = (WIDTH - LEFT_WIDTH) / daysInMonth;
  const colors = { 'Б': '#28b463', 'НБ': '#ed1c24', 'ПД': '#f5a623' };
  const textColors = { 'Б': '#063d1b', 'НБ': '#ffffff', 'ПД': '#ffffff' };

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect x="0" y="${tableY}" width="${WIDTH}" height="${height-tableY}" fill="#f8fbff"/>
    <rect x="0" y="${tableY}" width="${WIDTH}" height="${TABLE_HEADER_HEIGHT}" fill="#082f5b"/>
    <rect x="0" y="${tableY}" width="64" height="${TABLE_HEADER_HEIGHT}" fill="#bd1428"/>
    <rect x="64" y="${tableY}" width="${LEFT_WIDTH-64}" height="${TABLE_HEADER_HEIGHT}" fill="#082f5b"/>
    <text x="32" y="${tableY+27}" text-anchor="middle" fill="#fff" font-size="20" font-weight="bold" font-family="DejaVu Sans, sans-serif">№</text>
    <text x="${(64+LEFT_WIDTH)/2}" y="${tableY+27}" text-anchor="middle" fill="#fff" font-size="18" font-weight="bold" font-family="DejaVu Sans, sans-serif">ФИО СОТРУДНИКА</text>
    <text x="${WIDTH/2}" y="${bodyY+bodyHeight/2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-20 ${WIDTH/2} ${bodyY+bodyHeight/2})" fill="#d71935" fill-opacity="0.10" font-size="130" font-weight="bold" font-family="DejaVu Sans, sans-serif">Склад LT</text>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const x = LEFT_WIDTH + (day - 1) * dayWidth;
    const date = new Date(Date.UTC(year, month - 1, day));
    const isSunday = date.getUTCDay() === 0;
    if (isSunday) svg += `<rect x="${x}" y="${tableY}" width="${dayWidth}" height="${TABLE_HEADER_HEIGHT}" fill="#bd1428"/>`;
    svg += `<text x="${x+dayWidth/2}" y="${tableY+27}" text-anchor="middle" fill="#fff" font-size="${dayWidth<34?13:16}" font-weight="bold" font-family="DejaVu Sans, sans-serif">${day}</text>`;
  }

  staff.forEach((person, index) => {
    const y = bodyY + index * rowHeight;
    const bg = index % 2 === 0 ? '#fdfefe' : '#edf4fa';
    svg += `<rect x="0" y="${y}" width="${WIDTH}" height="${rowHeight}" fill="${bg}" fill-opacity="0.91"/>`;
    svg += `<text x="32" y="${y+rowHeight*0.69}" text-anchor="middle" fill="#082f5b" font-size="${Math.min(17,rowHeight*0.62)}" font-family="DejaVu Sans, sans-serif">${index+1}</text>`;
    // Keep full names. Use a smaller font only for unusually long names rather than truncating.
    const name = String(person.name).replace(/^[\s.,…⋯]+/, '').trim();
    const nameFont = name.length > 26 ? 14 : name.length > 20 ? 16 : 18;
    svg += `<text x="78" y="${y+rowHeight*0.69}" fill="#082f5b" font-size="${Math.min(nameFont,rowHeight*0.65)}" font-weight="bold" font-family="DejaVu Sans, sans-serif">${escapeXml(name)}</text>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const x = LEFT_WIDTH + (day - 1) * dayWidth;
      const status = getStatus(marks, person.id, day);
      if (status) {
        const cellW = Math.max(10, dayWidth - 5);
        const cellH = Math.max(15, rowHeight - 4);
        svg += `<rect x="${x+2.5}" y="${y+2}" width="${cellW}" height="${cellH}" rx="4" fill="${colors[status]}"/>`;
        svg += `<text x="${x+dayWidth/2}" y="${y+rowHeight*0.69}" text-anchor="middle" fill="${textColors[status]}" font-size="${Math.min(17,rowHeight*0.58)}" font-weight="bold" font-family="DejaVu Sans, sans-serif">${status}</text>`;
      }
    }
  });
  // Thin table grid lines.
  for (let i = 0; i <= staff.length; i++) {
    const y = bodyY + i * rowHeight;
    svg += `<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="#9eafbf" stroke-width="0.8"/>`;
  }
  svg += `<line x1="0" y1="${tableY}" x2="${WIDTH}" y2="${tableY}" stroke="#fff" stroke-width="1"/>`;
  for (let x = 0; x <= daysInMonth; x++) {
    const xx = LEFT_WIDTH + x * dayWidth;
    svg += `<line x1="${xx}" y1="${tableY}" x2="${xx}" y2="${bodyY+bodyHeight}" stroke="#b4c2cf" stroke-width="0.7"/>`;
  }
  [64, LEFT_WIDTH].forEach(x => { svg += `<line x1="${x}" y1="${tableY}" x2="${x}" y2="${bodyY+bodyHeight}" stroke="#8ca0b4" stroke-width="1"/>`; });
  svg += `</svg>`;

  const reference = sharp(REFERENCE_PATH);
  const meta = await reference.metadata();
  if (meta.width !== WIDTH || meta.height < HEADER_HEIGHT + FOOTER_HEIGHT) {
    throw new Error(`Размер attendance-reference.png неожиданный: ${meta.width}x${meta.height}; ожидается ширина ${WIDTH}px.`);
  }
  const header = await sharp(REFERENCE_PATH).extract({ left: 0, top: 0, width: WIDTH, height: HEADER_HEIGHT }).png().toBuffer();
  const footer = await sharp(REFERENCE_PATH).extract({ left: 0, top: meta.height - FOOTER_HEIGHT, width: WIDTH, height: FOOTER_HEIGHT }).png().toBuffer();
  const body = await sharp(Buffer.from(svg)).png().toBuffer();

  // Place the original reference header/footer around the live table. Cover only the static month/date fields.
  const monthOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="470" height="126"><rect x="0" y="0" width="470" height="126" rx="24" fill="#f8fbff" stroke="#d9e2ec" stroke-width="1.5"/><text x="235" y="59" text-anchor="middle" fill="#a50e21" font-size="43" font-weight="bold" font-family="DejaVu Sans, sans-serif">${escapeXml(monthTitle)}</text><text x="235" y="91" text-anchor="middle" fill="#315477" font-size="20" font-family="DejaVu Sans, sans-serif">Период: ${escapeXml(period)}</text></svg>`);
  const footerDate = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="455" height="48"><rect x="0" y="0" width="455" height="48" rx="4" fill="#082f5b"/><text x="8" y="30" fill="#fff" font-size="17" font-family="DejaVu Sans, sans-serif">Сформировано: ${escapeXml(timestamp)}</text></svg>`);
  const image = await sharp({ create: { width: WIDTH, height, channels: 4, background: '#ffffff' } })
    .composite([
      { input: header, top: 0, left: 0 },
      { input: body, top: 0, left: 0 },
      { input: monthOverlay, top: 7, left: 555 },
      { input: footer, top: height - FOOTER_HEIGHT, left: 0 },
      { input: footerDate, top: height - FOOTER_HEIGHT + 26, left: 78 }
    ])
    .png()
    .toBuffer();

  if (dryRun) {
    const out = process.env.ATTENDANCE_PREVIEW_PATH || '/tmp/attendance-preview.png';
    fs.writeFileSync(out, image);
    console.log(`ТЕСТОВОЕ изображение создано: ${out}`);
    console.log(`Сотрудников: ${staff.length}; дней: ${daysInMonth}; месяц: ${monthId}`);
    console.log('Telegram не вызывался: ATTENDANCE_DRY_RUN=1.');
    return;
  }

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `Табель учёта швей «Склад LT» — ${monthTitle}`);
  form.append('photo', new Blob([image], { type: 'image/png' }), 'attendance.png');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: 'POST', body: form });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram не отправил изображение: ${JSON.stringify(result)}`);
  console.log(`Табель за ${monthId} отправлен в Telegram. Сотрудников: ${staff.length}; дней: ${daysInMonth}.`);
}

main().catch(error => { console.error(error); process.exit(1); });
