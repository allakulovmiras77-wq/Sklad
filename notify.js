// LT Склад — уведомления и новости. Подключается одной строкой на всех панелях.
// Все: колокольчик 🔔, входящие новости, включение push на телефоне.
// Владелец: вкладка «Отправить» — выбор получателей (группы и отдельные люди) и история рассылок.
import {getApps} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,query,where,orderBy,limit,getDocs,getDoc,doc,setDoc,addDoc,deleteDoc,onSnapshot,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const ADMIN='lidertekstil10@gmail.com',VAPID='BC3BGD4LE3xmqFPArNHMC0mXa3WcQv5FsROz5sv_45AjYCcX8hDgN47T-uzDVSQWv1WFNBV-aail1j0VSQ7OuWM';
const uz=()=>/^uz/i.test(document.documentElement.lang||'')||['uz','uzc'].includes(localStorage.getItem('lang')||'');
const T={
 ru:{news:'Новости',inbox:'Входящие',send:'Отправить',hist:'История',empty:'Новостей пока нет',pushOn:'Включить уведомления на этом телефоне',pushDone:'Уведомления включены',pushDeny:'Уведомления запрещены в настройках телефона/браузера',pushNo:'Этот браузер не поддерживает уведомления',ios:'На iPhone: сначала «Поделиться» → «На экран Домой», затем откройте программу с иконки',close:'Закрыть',upd:'Обновление',imp:'Важно',nws:'Новость'},
 uz:{news:'Yangiliklar',inbox:'Kelganlar',send:'Yuborish',hist:'Tarix',empty:'Hozircha yangilik yo‘q',pushOn:'Shu telefonda bildirishnomani yoqish',pushDone:'Bildirishnomalar yoqilgan',pushDeny:'Bildirishnoma telefon/brauzer sozlamalarida taqiqlangan',pushNo:'Bu brauzer bildirishnomani qo‘llamaydi',ios:'iPhone’da: avval «Ulashish» → «Bosh ekranga», keyin dasturni ikonkadan oching',close:'Yopish',upd:'Yangilanish',imp:'Muhim',nws:'Yangilik'}
};
const t=k=>(T[uz()?'uz':'ru'][k]||T.ru[k]||k);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fd=ms=>new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tashkent'}).format(new Date(ms));
const KIND={news:{ic:'📢',k:'nws'},update:{ic:'🆕',k:'upd'},important:{ic:'⚠️',k:'imp'}};

let app,auth,db,fns,me=null,isAdm=false,inbox=[],unsub=null,tab='inbox',open=false,seen=0,first=true;
let people=[],pLoaded=false,sel=new Set(),kind='update',fTitle='',fBody='',find='',busy=false,hist=[],res='';

function css(){if(document.getElementById('ltn-css'))return;const s=document.createElement('style');s.id='ltn-css';s.textContent=`
#ltn-b{position:fixed;left:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:9000;width:48px;height:48px;border-radius:50%;border:0;background:linear-gradient(135deg,#1d5fd1,#38bdf8);color:#fff;font-size:22px;box-shadow:0 6px 18px rgba(0,0,0,.4);display:grid;place-items:center;cursor:pointer;padding:0}
#ltn-b i{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font:700 12px/20px system-ui;text-align:center;padding:0 5px;font-style:normal}
#ltn-m{position:fixed;inset:0;z-index:9500;background:rgba(2,8,23,.78);display:flex;align-items:flex-end;justify-content:center}
#ltn-p{width:100%;max-width:560px;height:92%;background:#0f1d3b;color:#e8eefc;border-radius:22px 22px 0 0;display:flex;flex-direction:column;font:15px system-ui,sans-serif}
#ltn-p *{box-sizing:border-box}.ltn-h{display:flex;align-items:center;gap:8px;padding:14px 16px 6px}.ltn-h b{flex:1;font-size:18px}
.ltn-x{border:0;background:#26365e;color:#fff;border-radius:12px;padding:9px 13px;font:700 14px system-ui}
.ltn-t{display:flex;gap:6px;padding:6px 16px;overflow-x:auto}.ltn-t button{border:0;border-radius:99px;padding:9px 15px;background:#1a2a50;color:#b6c4e6;font:700 14px system-ui;white-space:nowrap}.ltn-t button.on{background:#2563eb;color:#fff}
.ltn-s{flex:1;overflow:auto;padding:8px 16px calc(env(safe-area-inset-bottom,0px) + 18px)}
.ltn-c{background:#16264a;border-radius:16px;padding:12px 14px;margin:8px 0}.ltn-c.new{border:1px solid #38bdf8}
.ltn-c h4{margin:0 0 4px;font-size:16px}.ltn-c p{margin:0;white-space:pre-wrap;line-height:1.4;color:#d5def5}.ltn-c small{color:#8fa3cf}
.ltn-btn{width:100%;border:0;border-radius:14px;padding:14px;background:#16a34a;color:#fff;font:800 16px system-ui;margin-top:10px}.ltn-btn:disabled{opacity:.5}
.ltn-btn.b{background:#2563eb}.ltn-in{width:100%;border:1px solid #2c3f6e;background:#0b1630;color:#fff;border-radius:12px;padding:12px;font:16px system-ui;margin:6px 0}
.ltn-ch{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.ltn-ch button{border:1px solid #2c3f6e;background:#14234a;color:#cdd8f3;border-radius:99px;padding:8px 12px;font:600 14px system-ui}.ltn-ch button.on{background:#2563eb;border-color:#2563eb;color:#fff}
.ltn-pp{display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid #1e2f58}.ltn-pp input{width:22px;height:22px}.ltn-pp span{flex:1}.ltn-pp small{color:#8fa3cf}
.ltn-ok{background:#12351f;color:#86efac;border-radius:14px;padding:12px;margin:8px 0}.ltn-er{background:#3b1620;color:#fca5a5;border-radius:14px;padding:12px;margin:8px 0}
#ltn-toast{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:9600;background:#0f1d3b;color:#fff;border:1px solid #38bdf8;border-radius:16px;padding:12px 14px;font:15px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5)}
`;document.head.appendChild(s)}

const seenKey=()=>'ltn_seen_'+(me?me.uid:'');
const ms=v=>v&&v.toMillis?v.toMillis():(v?+v:Date.now());
const unread=()=>inbox.filter(x=>ms(x.at)>seen&&x.by!==(me&&me.uid)).length;

function bell(){let b=document.getElementById('ltn-b');if(!me){if(b)b.remove();return}
 if(!b){b=document.createElement('button');b.id='ltn-b';b.type='button';b.setAttribute('aria-label',t('news'));b.onclick=()=>{open=true;tab='inbox';draw()};document.body.appendChild(b)}
 const n=unread();b.innerHTML='🔔'+(n?'<i>'+(n>99?'99+':n)+'</i>':'')}

function toast(x){let e=document.getElementById('ltn-toast');if(e)e.remove();e=document.createElement('div');e.id='ltn-toast';e.innerHTML='<b>'+esc((KIND[x.kind]||KIND.news).ic+' '+x.title)+'</b><div style="opacity:.85;margin-top:2px">'+esc(String(x.body).slice(0,120))+'</div>';e.onclick=()=>{e.remove();open=true;tab='inbox';draw()};document.body.appendChild(e);setTimeout(()=>e.remove(),7000)}

async function pushState(){if(!('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window))return /iphone|ipad/i.test(navigator.userAgent)?'ios':'no';
 if(Notification.permission==='denied')return 'deny';try{const r=await navigator.serviceWorker.getRegistration();const s=r&&await r.pushManager.getSubscription();return s&&Notification.permission==='granted'?'on':'off'}catch(e){return 'off'}}
const key=k=>{const b=(k+'='.repeat((4-k.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),o=new Uint8Array(r.length);for(let i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o};
async function saveSub(sb){let lang=uz()?'uz':'ru';try{const o=await getDoc(doc(db,'push_subs',me.uid));if(o.exists()&&['ru','uz'].includes(o.data().lang))lang=o.data().lang}catch(e){}
 await setDoc(doc(db,'push_subs',me.uid),{uid:me.uid,sub:JSON.parse(JSON.stringify(sb)),lang,at:Date.now()})}
async function pushEnable(){try{const p=await Notification.requestPermission();if(p!=='granted')return draw();
 const reg=await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;
 let sb=await reg.pushManager.getSubscription();if(!sb)sb=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(VAPID)});
 await saveSub(sb)}catch(e){}draw()}
async function pushSync(){try{if(Notification.permission!=='granted'||!('serviceWorker' in navigator))return;const r=await navigator.serviceWorker.getRegistration();const sb=r&&await r.pushManager.getSubscription();if(sb)await saveSub(sb)}catch(e){}}

function listen(){if(unsub)unsub();first=true;seen=+(localStorage.getItem(seenKey())||0);
 unsub=onSnapshot(query(collection(db,'broadcasts'),where('uids','array-contains',me.uid)),s=>{
  inbox=s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>ms(b.at)-ms(a.at)).slice(0,50);
  if(!first)s.docChanges().forEach(c=>{if(c.type==='added'){const v=c.doc.data();if(v.by!==me.uid&&ms(v.at)>seen&&!(open&&tab==='inbox'))toast(v)}});
  first=false;if(open&&tab==='inbox')markSeen();bell();if(open)draw()},()=>{})}
function markSeen(){const m=inbox.reduce((a,x)=>Math.max(a,ms(x.at)),0);if(m>seen){seen=m;localStorage.setItem(seenKey(),String(m))}}

async function loadPeople(){if(pLoaded)return;pLoaded=true;const g=async n=>{try{return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}))}catch(e){return []}};
 const [us,sw,dr,mk,ct]=await Promise.all([g('users'),g('hr_sew_profiles'),g('dir_profiles'),g('msk_profiles'),g('cut_profiles')]);
 const m=new Map(),nm=x=>String(x.fullName||x.name||x.login||x.email||x.id).trim();
 const add=(arr,grp,lab,okf)=>arr.forEach(x=>{if(okf&&!okf(x))return;const o=m.get(x.id)||{id:x.id,name:nm(x),grps:new Set(),lab};o.grps.add(grp);if(grp!=='office'||!o.lab)o.lab=lab;if(x.name||x.fullName)o.name=nm(x);m.set(x.id,o)});
 add(us.filter(u=>u.blocked!==true),'office','Офис');
 add(sw,'sewing','Швея',x=>x.active!==false&&!x.replacedBy);
 add(dr,'director','Директор',x=>x.active!==false);
 add(mk,'msk','Склад Москва',x=>x.active!==false);
 add(ct,'cut','Закройщик',x=>x.active!==false);
 m.forEach(o=>{if(o.id===me.uid){o.lab='Владелец (вы)'}});
 // «Офис» = аккаунты Склада, которые не швеи, не директор и не Москва/закройка
 m.forEach(o=>{if(o.grps.size>1&&o.grps.has('office'))o.grps.delete('office')});
 people=[...m.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))}
const GR=[['all','👥 Все'],['office','🏢 Офис и склад'],['sewing','🧵 Швеи'],['director','👔 Директор'],['msk','📦 Склад Москва'],['cut','✂️ Закройщики']];
const inGrp=(p,g)=>g==='all'||p.grps.has(g);
const grpOn=g=>{const L=people.filter(p=>inGrp(p,g));return L.length>0&&L.every(p=>sel.has(p.id))};
function toggleGrp(g){const L=people.filter(p=>inGrp(p,g)),on=grpOn(g);L.forEach(p=>on?sel.delete(p.id):sel.add(p.id))}

async function loadHist(){try{hist=(await getDocs(query(collection(db,'broadcasts'),orderBy('at','desc'),limit(30)))).docs.map(d=>({...d.data(),id:d.id}))}catch(e){hist=[]}}
async function doSend(){if(busy)return;const title=fTitle.trim(),body=fBody.trim();
 if(!title||!body){res='<div class="ltn-er">Напишите заголовок и текст</div>';return draw()}
 if(!sel.size){res='<div class="ltn-er">Выберите, кому отправить</div>';return draw()}
 if(!confirm('Отправить «'+title+'» — '+sel.size+' получателям?'))return;
 busy=true;res='<div class="ltn-c">Отправляем…</div>';draw();
 try{const uids=[...sel],groups=GR.filter(g=>g[0]!=='all'&&grpOn(g[0])).map(g=>g[0]);if(grpOn('all'))groups.unshift('all');
  const r=await addDoc(collection(db,'broadcasts'),{title:title.slice(0,80),body:body.slice(0,600),kind,groups,uids,n:uids.length,by:me.uid,at:serverTimestamp(),status:'queued'});
  let st=null,err='';try{const o=await httpsCallable(fns,'sendBroadcast')({id:r.id});st=o.data&&o.data.stats}catch(e){err=(e&&e.message)||'нет связи с сервером'}
  if(st){res='<div class="ltn-ok"><b>✅ Отправлено</b><br>Push получили: <b>'+st.sent+'</b> из '+st.total+'. Остальные ('+(st.noSub+st.gone+st.failed)+') увидят новость внутри программы при следующем входе (🔔).</div>';fTitle='';fBody='';sel=new Set()}
  else res='<div class="ltn-er"><b>Новость сохранена, но push не ушёл.</b><br>'+esc(err)+'<br>Сотрудники увидят её внутри программы (🔔). Проверьте, что функция опубликована (Actions → Deploy broadcast function).</div>';
  await loadHist()}catch(e){res='<div class="ltn-er">Не удалось отправить: '+esc(e&&e.code==='permission-denied'?'нет прав — обновите правила Firebase':(e&&e.message)||'ошибка')+'</div>'}
 busy=false;draw()}

async function draw(){let m=document.getElementById('ltn-m');if(!open){if(m)m.remove();bell();return}
 if(!m){m=document.createElement('div');m.id='ltn-m';m.onclick=e=>{if(e.target===m){open=false;draw()}};document.body.appendChild(m)}
 const sc=m.querySelector('.ltn-s'),top=sc?sc.scrollTop:0,ps=await pushState();
 const tabs=[['inbox','🔔 '+t('inbox')]].concat(isAdm?[['send','✉️ '+t('send')],['hist','🕘 '+t('hist')]]:[]);
 let body='';
 if(tab==='inbox'){markSeen();bell();
  const pm={on:'<div class="ltn-ok">✅ '+t('pushDone')+'</div>',off:'<button class="ltn-btn b" id="ltn-pe">🔔 '+t('pushOn')+'</button>',deny:'<div class="ltn-er">'+t('pushDeny')+'</div>',no:'<div class="ltn-c"><small>'+t('pushNo')+'</small></div>',ios:'<div class="ltn-c"><small>'+t('ios')+'</small></div>'}[ps]||'';
  body=pm+(inbox.length?inbox.map(x=>{const k=KIND[x.kind]||KIND.news;return '<div class="ltn-c'+''+'"><h4>'+k.ic+' '+esc(x.title)+'</h4><p>'+esc(x.body)+'</p><small>'+t(k.k)+' · '+fd(ms(x.at))+'</small></div>'}).join(''):'<div class="ltn-c"><small>'+t('empty')+'</small></div>')}
 else if(tab==='send'){await loadPeople();
  const q=find.trim().toLowerCase(),L=people.filter(p=>!q||p.name.toLowerCase().includes(q));
  body=res+'<div class="ltn-ch">'+[['update','🆕 Обновление'],['news','📢 Новость'],['important','⚠️ Важно']].map(x=>'<button data-k="'+x[0]+'" class="'+(kind===x[0]?'on':'')+'">'+x[1]+'</button>').join('')+'</div>'
   +'<input class="ltn-in" id="ltn-ti" maxlength="80" placeholder="Заголовок, например: Программа обновилась" value="'+esc(fTitle)+'">'
   +'<textarea class="ltn-in" id="ltn-bo" rows="4" maxlength="600" placeholder="Текст: что нового — например, добавлена погода и время…">'+esc(fBody)+'</textarea>'
   +'<b>Кому отправить</b><div class="ltn-ch">'+GR.map(g=>'<button data-g="'+g[0]+'" class="'+(grpOn(g[0])?'on':'')+'">'+g[1]+' · '+people.filter(p=>inGrp(p,g[0])).length+'</button>').join('')+'</div>'
   +'<input class="ltn-in" id="ltn-fi" placeholder="🔎 Найти сотрудника" value="'+esc(find)+'">'
   +'<div>'+(L.map(p=>'<label class="ltn-pp"><input type="checkbox" data-p="'+esc(p.id)+'"'+(sel.has(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span><small>'+esc(p.lab)+'</small></label>').join('')||'<div class="ltn-c"><small>Никого не найдено</small></div>')+'</div>'
   +'<button class="ltn-btn" id="ltn-go"'+(busy?' disabled':'')+'>📨 Отправить'+(sel.size?' ('+sel.size+')':'')+'</button>'}
 else{await loadHist();body=hist.length?hist.map(x=>{const k=KIND[x.kind]||KIND.news,s=x.stats;return '<div class="ltn-c"><h4>'+k.ic+' '+esc(x.title)+'</h4><p>'+esc(x.body)+'</p><small>'+fd(ms(x.at))+' · получателей: '+(x.n||(x.uids||[]).length)+(s?' · push: '+s.sent+'/'+s.total:(x.status==='queued'?' · push не отправлен':''))+'</small><div><button class="ltn-x" data-d="'+x.id+'" style="margin-top:8px">🗑 Удалить</button></div></div>'}).join(''):'<div class="ltn-c"><small>Рассылок ещё не было</small></div>'}
 m.innerHTML='<div id="ltn-p"><div class="ltn-h"><b>🔔 '+t('news')+'</b><button class="ltn-x" id="ltn-cl">✕ '+t('close')+'</button></div><div class="ltn-t">'+tabs.map(x=>'<button data-t="'+x[0]+'" class="'+(tab===x[0]?'on':'')+'">'+x[1]+'</button>').join('')+'</div><div class="ltn-s">'+body+'</div></div>';
 const s2=m.querySelector('.ltn-s');if(s2)s2.scrollTop=top;
 m.querySelector('#ltn-cl').onclick=()=>{open=false;draw()};
 m.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;res='';draw()});
 const pe=m.querySelector('#ltn-pe');if(pe)pe.onclick=pushEnable;
 m.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{fTitle=m.querySelector('#ltn-ti').value;fBody=m.querySelector('#ltn-bo').value;kind=b.dataset.k;draw()});
 m.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{fTitle=m.querySelector('#ltn-ti').value;fBody=m.querySelector('#ltn-bo').value;toggleGrp(b.dataset.g);draw()});
 m.querySelectorAll('[data-p]').forEach(c=>c.onchange=()=>{c.checked?sel.add(c.dataset.p):sel.delete(c.dataset.p);fTitle=m.querySelector('#ltn-ti').value;fBody=m.querySelector('#ltn-bo').value;draw()});
 const ti=m.querySelector('#ltn-ti');if(ti){ti.oninput=()=>{fTitle=ti.value};m.querySelector('#ltn-bo').oninput=e=>{fBody=e.target.value};
  m.querySelector('#ltn-fi').oninput=e=>{find=e.target.value;fTitle=ti.value;fBody=m.querySelector('#ltn-bo').value;const p=e.target.selectionStart;draw().then(()=>{const f=document.querySelector('#ltn-fi');if(f){f.focus();try{f.setSelectionRange(p,p)}catch(_){}}})};
  m.querySelector('#ltn-go').onclick=doSend}
 m.querySelectorAll('[data-d]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить эту рассылку из истории и у получателей?'))return;try{await deleteDoc(doc(db,'broadcasts',b.dataset.d))}catch(e){}hist=hist.filter(x=>x.id!==b.dataset.d);draw()});
 bell()}

function start(u){me=u;isAdm=String(u.email||'').toLowerCase()===ADMIN;css();bell();listen();pushSync();
 try{if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})}catch(e){}}
function stop(){me=null;isAdm=false;inbox=[];people=[];pLoaded=false;sel=new Set();open=false;if(unsub){unsub();unsub=null}const m=document.getElementById('ltn-m');if(m)m.remove();bell()}

let tries=0;(function boot(){const a=getApps()[0];if(!a){if(++tries<80)return setTimeout(boot,300);return}
 app=a;auth=getAuth(app);db=getFirestore(app);fns=getFunctions(app,'us-central1');
 onAuthStateChanged(auth,u=>{if(u)start(u);else stop()})})();
