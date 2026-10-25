// Ежедневная копия данных склада -> Firestore (коллекция backups). Хранится 14 дней.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const all = async c => (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));
(async () => {
  const bags = await all('bags'), prods = await all('prods'), users = await all('users');
  const st = await db.collection('settings').doc('main').get();
  const date = new Date().toISOString().slice(0, 10);
  const total = bags.reduce((n, b) => n + (b.items || []).reduce((m, i) => m + (+i.q || 0), 0), 0);
  const doc = { date, ts: Date.now(), nb: bags.length, np: prods.length, total, bags, prods,
    users: users.map(u => ({ id: u.id, email: u.email || '', name: u.name || '', blocked: !!u.blocked })),
    settings: st.exists ? st.data() : {} };
  const size = Buffer.byteLength(JSON.stringify(doc));
  if (size > 900000) { delete doc.users; console.log('Копия большая, сотрудники не сохранены:', size); }
  await db.collection('backups').doc(date).set(doc);
  console.log('Копия сохранена:', date, 'мешков:', bags.length, 'штрихкодов:', prods.length, 'всего шт.:', total, 'байт:', size);
  const old = (await db.collection('backups').get()).docs.map(d => d.id).sort().reverse().slice(14);
  for (const id of old) await db.collection('backups').doc(id).delete();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
