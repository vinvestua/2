// GitHub Pages has no application server. This mode is explicitly a local demo.
async function pagesApi(path,data){
 const key='ceh-demo-v1';
 let db=JSON.parse(localStorage.getItem(key)||'null');
 if(!db){db=await (await fetch('./demo-data.json')).json();localStorage.setItem(key,JSON.stringify(db))}
 const next=table=>Math.max(0,...db[table].map(row=>row.id))+1;
 if(path==='state')return db;
 if(path==='requests'){
  if(!data.worker.trim()||!data.items.length||data.items.some(i=>!Number.isFinite(i.quantity)||i.quantity<=0||i.quantity>1000000))throw Error('Вкажіть ім’я та коректну кількість');
  const id=next('requests');db.requests.push({id,worker:data.worker,note:data.note,urgent:data.urgent,created:new Date().toISOString()});
  for(const item of data.items){const m=db.materials.find(m=>m.id===item.material_id);db.items.push({id:next('items'),request_id:id,material_id:m.id,quantity:item.quantity,received:0,supplier_id:m.supplier_id,status:'new'})}
  localStorage.setItem(key,JSON.stringify(db));return {id};
 }
 if(path==='items'){
  const item=db.items.find(i=>i.id===data.id);if(!item)throw Error('Позицію не знайдено');
  if(data.received!==undefined&&(!Number.isFinite(data.received)||data.received<item.received||data.received>item.quantity))throw Error('Некоректна кількість');
  Object.assign(item,data);if(item.received===item.quantity)item.status='done';else if(item.received>0)item.status='partial';
 }else if(path==='materials'||path==='suppliers'){
  if(!data.name?.trim())throw Error('Вкажіть назву');db[path].push({...data,id:next(path)});
 }else throw Error('Невідома дія');
 localStorage.setItem(key,JSON.stringify(db));return {ok:true};
}
if(location.hostname.endsWith('github.io')){
 document.querySelector('.demo').textContent='ДЕМОВЕРСІЯ · Заявки зберігаються тільки в цьому браузері. Інші пристрої та менеджер їх не бачать. Для спільної роботи потрібне підключення серверної бази.';
 document.querySelector('.live').textContent='● Локальна демоверсія';
}
