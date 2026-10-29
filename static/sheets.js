async function sheetsFetch(url,options={}){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(url,{...options,signal:controller.signal});
  if(!response.ok)throw Error('Google повернув помилку доступу. У розгортанні скрипту виберіть «Хто має доступ: Усі».');
  const text=await response.text();let result;
  try{result=JSON.parse(text)}catch{throw Error('Адреса повернула сторінку Google замість даних. Оновіть розгортання Apps Script: «Ввести в дію → Керувати введеннями в дію → олівець → Нова версія». Доступ: «Усі». Використовуйте URL вебдодатка із закінченням /exec.')}
  if(result.error)throw Error(result.error);
  return result;
 }catch(error){
  if(error.name==='AbortError')throw Error('Google не відповів за 20 секунд. Перевірте інтернет і повторіть. Якщо помилка повторюється, перевірте розгортання скрипту.');
  if(error instanceof TypeError)throw Error('Браузер не зміг звернутися до скрипту. Перевірте: виконувати від вашого імені; доступ — «Усі»; після зміни коду вибрана «Нова версія» розгортання.');
  throw error;
 }finally{clearTimeout(timer)}
}
function sheetsConfig(){try{return JSON.parse(localStorage.getItem('ceh-sheets')||'null')}catch{return null}}
async function sheetsApi(path,data){
 const config=sheetsConfig();
 const url=new URL(config.url);
 let options={redirect:'follow'};
 if(data){options.method='POST';options.headers={'Content-Type':'text/plain;charset=utf-8'};options.body=JSON.stringify({key:config.key,path,data})}
 else url.searchParams.set('key',config.key);
 return sheetsFetch(url,options);
}
function connectionBanner(){
 const connected=!!sheetsConfig();
 document.querySelector('.demo').innerHTML=(connected?'Google-таблицю налаштовано · Дані завантажуються з вашого вебдодатка.':'ДЕМОВЕРСІЯ · Заявки тільки в цьому браузері. Для спільної роботи підключіть Google-таблицю.')+' <button class="secondary" id="connect-sheets">'+(connected?'Налаштування підключення':'Підключити Google-таблицю')+'</button>';
 document.querySelector('.live').textContent=connected?'● Google Sheets':'● Локальна демоверсія';
 document.querySelector('#connect-sheets').onclick=()=>{
  const config=sheetsConfig()||{};
  showForm(`<h2>Підключення Google-таблиці</h2><p>Спочатку розгорніть Apps Script у вашій таблиці. Інструкція є в репозиторії, у папці google-apps-script.</p><label>URL вебдодатка Apps Script</label><input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(config.url||'')}" required><label>Спільний ключ ACCESS_KEY</label><input name="key" type="password" autocomplete="off" value="${esc(config.key||'')}" required><p>Кожен, хто має ключ, може бачити й змінювати заявки. Демо-заявки автоматично не переносяться.</p>`,async values=>{
   values.url=values.url.trim();values.key=values.key.trim();const url=new URL(values.url);if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error('Потрібне посилання Apps Script, яке закінчується на /exec');
   url.search='';url.hash='';
   const test=new URL(url);test.searchParams.set('key',values.key);const result=await sheetsFetch(test);if(!Array.isArray(result.materials)||!Array.isArray(result.items))throw Error('Неочікувана відповідь скрипту');
   localStorage.setItem('ceh-sheets',JSON.stringify({url:url.href,key:values.key}));location.reload();
  });
 };
}
