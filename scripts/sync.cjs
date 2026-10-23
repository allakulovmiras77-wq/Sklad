const lat=t=>String(t||'').trim().toUpperCase().replace(/Х/g,'X').replace(/Л/g,'L').replace(/М/g,'M').replace(/С/g,'S');
const fixS=s=>s.replace(/^XXXL$/,'3XL').replace(/^XXL$/,'2XL');
const SZ=/^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|\d{2,3})$/;
function split(off){
  const t=String(off||'').trim().toUpperCase();
  const m=t.match(/^(.*?)[\s\-_\/.]+([^\s\-_\/.]+)$/);
  if(m&&SZ.test(fixS(lat(m[2]))))return{a:m[1],s:fixS(lat(m[2]))};
  return{a:t,s:''};
}
async function api(url,opt,name){
  const r=await fetch(url,opt);
  if(!r.ok)throw new Error(name+' '+r.status+' '+(await r.text()).slice(0,120));
  return r.json();
}
async function ozon(id,key){
  const out=[];let cursor='';
  for(let i=0;i<200;i++){
    const j=await api('https://api-seller.ozon.ru/v4/product/info/stocks',{method:'POST',
      headers:{'Client-Id':id,'Api-Key':key,'Content-Type':'application/json'},
      body:JSON.stringify({filter:{visibility:'ALL'},limit:1000,cursor})},'Ozon');
    for(const it of j.items||[]){
      let fbo=0,fbs=0;
      for(const s of it.stocks||[]){if(s.type==='fbo')fbo+=s.present||0;else fbs+=s.present||0}
      out.push({...split(it.offer_id),fbo,fbs});
    }
    if(!j.cursor||!(j.items||[]).length)break;
    cursor=j.cursor;
  }
  return out;
}
async function wb(token){
  const j=await api('https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2019-06-20',
    {headers:{Authorization:token}},'WB');
  return j.map(x=>{
    let a=String(x.supplierArticle||'').trim().toUpperCase(),s=fixS(lat(x.techSize));
    if(!s||s==='0')return{...split(a),fbo:x.quantity||0,fbs:0};
    return{a,s,fbo:x.quantity||0,fbs:0};
  });
}
function merge(stores){
  const map=new Map();
  stores.forEach((st,i)=>{
    for(const it of st.items){
      const k=lat(it.a)+'|'+it.s;
      let r=map.get(k);
      if(!r){r={a:it.a,s:it.s,fbo:0,fbs:0,st:stores.map(()=>({fbo:0,fbs:0}))};map.set(k,r)}
      r.fbo+=it.fbo;r.fbs+=it.fbs;r.st[i].fbo+=it.fbo;r.st[i].fbs+=it.fbs;
    }
  });
  return [...map.values()].sort((x,y)=>(x.a+x.s).localeCompare(y.a+y.s,'ru',{numeric:true}));
}
const E=k=>(process.env[k]||'').trim(),SF=['','_1','_2'];
const NAMES=['Lider Tekstil','LT STYLE'];
async function run(db,FV,key,title,creds,fn){
  if(!creds.length)return false;
  const stores=[],errs=[];
  for(let i=0;i<creds.length;i++){
    const name=NAMES[i]||'Магазин '+(i+1);
    try{stores.push({name,items:await fn(creds[i])})}
    catch(e){errs.push(name+': '+e.message);stores.push({name,items:[]})}
  }
  const ref=db.collection('mp').doc(key);
  if(errs.length===stores.length){
    await ref.set({err:errs.join('; ').slice(0,400),updated:Date.now()},{merge:true});
    console.log(title,'ошибка:',errs.join('; '));return true;
  }
  await ref.set({rows:merge(stores),names:stores.map(s=>s.name),updated:Date.now(),
    err:errs.length?errs.join('; ').slice(0,400):FV.delete()});
  console.log(title,'готово, магазинов:',stores.length,errs.length?'ошибки: '+errs.join('; '):'');
  return errs.length>0;
}
async function main(){
  const admin=require('firebase-admin');
  admin.initializeApp({credential:admin.credential.cert(JSON.parse(E('FIREBASE_SERVICE_ACCOUNT')))});
  const db=admin.firestore(),FV=admin.firestore.FieldValue;
  const oz=SF.map(s=>[E('OZON_CLIENT_ID'+s),E('OZON_API_KEY'+s)]).filter(c=>c[0]&&c[1]);
  const wbt=SF.map(s=>E('WB_TOKEN'+s)).filter(Boolean);
  const a=await run(db,FV,'ozon','Ozon',oz,c=>ozon(c[0],c[1]));
  const b=await run(db,FV,'wb','Wildberries',wbt,c=>wb(c));
  if(a||b)process.exitCode=1;
}
module.exports={split,merge,lat};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exit(1)});error(e.message);process.exit(1)});
