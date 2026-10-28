
const admin = require('firebase-admin');
const sharp = require('sharp');

async function main() {
  const serviceAccountText = process.env.FIREBASE_SERVICE_ACCOUNT;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!serviceAccountText || !botToken || !chatId) {
    throw new Error(
      'Не заданы FIREBASE_SERVICE_ACCOUNT, TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID'
    );
  }

  const serviceAccount = JSON.parse(serviceAccountText);
  if (serviceAccount.private_key) {
    serviceAccount.private_key =
      serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  // Текущий месяц по времени Узбекистана (UTC+5).
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const part = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const year = Number(part.year);
  const month = Number(part.month);
  const monthId = `${part.year}-${part.month}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [staffSnapshot, attendanceSnapshot] = await Promise.all([
    db.collection('hr_staff').get(),
    db.collection('hr_att').doc(monthId).get()
  ]);

  const staff = staffSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(person => person.active !== false && person.name)
    .sort((a, b) =>
      (Number(a.ord) || 9999) - (Number(b.ord) || 9999) ||
      String(a.name).localeCompare(String(b.name), 'ru')
    );

  if (!staff.length) {
    throw new Error('В hr_staff не найдены активные сотрудники с именами');
  }

  const attendance = attendanceSnapshot.exists
    ? attendanceSnapshot.data()
    : {};
  const marks = attendance.marks || {};

  const colors = {
    'Б': '#d9f5df',
    'НБ': '#ffdada',
    'ПД': '#ffe8bf'
  };

  const textColors = {
    'Б': '#16753b',
    'НБ': '#b42318',
    'ПД': '#a85b00'
  };

  const left = 330;
  const numberWidth = 44;
  const dayWidth = 38;
  const top = 154;
  const rowHeight = 43;
  const width = left + daysInMonth * dayWidth + 24;
  const height = top + staff.length * rowHeight + 116;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[ch]);

  const monthName = new Intl.DateTimeFormat('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Tashkent'
  }).format(new Date(Date.UTC(year, month - 1, 15)));

  let svg = `
  <svg xmlns="http://www.w3.org/2000/svg"
       width="${width}" height="${height}"
       viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="0" y="0" width="${width}" height="105" fill="#173f30"/>
    <text x="28" y="43" fill="#ffffff" font-size="29"
          font-weight="bold" font-family="DejaVu Sans, sans-serif">
      Склад LT — табель посещаемости
    </text>
    <text x="28" y="78" fill="#e3f4e9" font-size="21"
          font-family="DejaVu Sans, sans-serif">
      ${esc(monthName)}
    </text>
    <text x="${width - 25}" y="78" text-anchor="end"
          fill="#e3f4e9" font-size="16"
          font-family="DejaVu Sans, sans-serif">
      Всего сотрудников: ${staff.length}
    </text>
    <text x="${width / 2}" y="${height / 2}"
          text-anchor="middle" dominant-baseline="middle"
          transform="rotate(-25 ${width / 2} ${height / 2})"
          fill="#d43c3c" fill-opacity="0.09"
          font-size="100" font-weight="bold"
          font-family="DejaVu Sans, sans-serif">Склад LT</text>
    <rect x="0" y="105" width="${width}" height="${top - 105}"
          fill="#edf2ef"/>
    <text x="18" y="136" fill="#18372b" font-size="17"
          font-weight="bold" font-family="DejaVu Sans, sans-serif">№</text>
    <text x="${numberWidth + 12}" y="136" fill="#18372b"
          font-size="17" font-weight="bold"
          font-family="DejaVu Sans, sans-serif">ФИО сотрудника</text>
  `;

  for (let d = 1; d <= daysInMonth; d++) {
    const x = left + (d - 1) * dayWidth;
    const date = new Date(Date.UTC(year, month - 1, d));
    const weekday = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      timeZone: 'UTC'
    }).format(date).replace('.', '');

    svg += `
      <text x="${x + dayWidth / 2}" y="127"
            text-anchor="middle" fill="#18372b"
            font-size="14" font-weight="bold"
            font-family="DejaVu Sans, sans-serif">${d}</text>
      <text x="${x + dayWidth / 2}" y="146"
            text-anchor="middle" fill="#53645a"
            font-size="10" font-family="DejaVu Sans, sans-serif">${esc(weekday)}</text>
    `;
  }

  staff.forEach((person, index) => {
    const y = top + index * rowHeight;
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f7f9f8';

    svg += `
      <rect x="0" y="${y}" width="${width}" height="${rowHeight}"
            fill="${rowColor}" fill-opacity="0.94"/>
      <line x1="0" y1="${y + rowHeight}" x2="${width}"
            y2="${y + rowHeight}" stroke="#dce4df"/>
      <text x="18" y="${y + 27}" fill="#607067" font-size="15"
            font-family="DejaVu Sans, sans-serif">${index + 1}</text>
      <text x="${numberWidth + 12}" y="${y + 27}" fill="#172a21"
            font-size="15" font-family="DejaVu Sans, sans-serif">${esc(person.name)}</text>
    `;

    for (let d = 1; d <= daysInMonth; d++) {
      const day = String(d).padStart(2, '0');
      const status = String((marks[person.id] || {})[day] || '').trim();
      const x = left + (d - 1) * dayWidth;

      if (colors[status]) {
        svg += `
          <rect x="${x + 2}" y="${y + 5}" width="${dayWidth - 4}"
                height="${rowHeight - 10}" rx="5"
                fill="${colors[status]}" fill-opacity="0.96"/>
          <text x="${x + dayWidth / 2}" y="${y + 26}"
                text-anchor="middle" fill="${textColors[status]}"
                font-size="13" font-weight="bold"
                font-family="DejaVu Sans, sans-serif">${status}</text>
        `;
      } else {
        svg += `
          <text x="${x + dayWidth / 2}" y="${y + 26}"
                text-anchor="middle" fill="#c4ccc7"
                font-size="12" font-family="DejaVu Sans, sans-serif">—</text>
        `;
      }
    }
  });

  const footerY = top + staff.length * rowHeight + 34;

  svg += `
    <text x="20" y="${footerY}" fill="#16753b" font-size="17"
          font-weight="bold" font-family="DejaVu Sans, sans-serif">Б — был</text>
    <text x="145" y="${footerY}" fill="#b42318" font-size="17"
          font-weight="bold" font-family="DejaVu Sans, sans-serif">НБ — не был</text>
    <text x="325" y="${footerY}" fill="#a85b00" font-size="17"
          font-weight="bold" font-family="DejaVu Sans, sans-serif">ПД — полдня</text>
    <text x="${width - 22}" y="${height - 22}" text-anchor="end"
          fill="#52665a" font-size="20" font-weight="bold"
          font-style="italic" font-family="DejaVu Sans, sans-serif">
      Created by Miras
    </text>
  </svg>`;

  const image = await sharp(Buffer.from(svg)).png().toBuffer();

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `Табель посещаемости «Склад LT» — ${monthName}`);
  form.append('photo', new Blob([image], { type: 'image/png' }), 'attendance.png');

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    { method: 'POST', body: form }
  );

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram не отправил изображение: ${JSON.stringify(result)}`);
  }

  console.log(`Табель за ${monthId} отправлен в Telegram.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
