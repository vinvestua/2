function sheetsConfig(){try{return JSON.parse(localStorage.getItem('ceh-sheets')||'null')}catch{return null}}
async function sheetsApi(path,data){
 const config=sheetsConfig();
 const url=new URL(config.url);
 let options={redirect:'follow'};
 if(data){options.method='POST';options.headers={'Content-Type':'text/plain;charset=utf-8'};options.body=JSON.stringify({key:config.key,path,data})}
 else url.searchParams.set('key',config.key);
 const response=await fetch(url,options);
 if(!response.ok)throw Error('Не вдалося підключитися до Google-таблиці');
 const result=await response.json();if(result.error)throw Error(result.error);return result;
}
function connectionBanner(){
 const connected=!!sheetsConfig();
 document.querySelector('.demo').innerHTML=(connected?'Google-таблицю налаштовано · Дані завантажуються з вашого вебдодатка.':'ДЕМОВЕРСІЯ · Заявки тільки в цьому браузері. Для спільної роботи підключіть Google-таблицю.')+' <button class="secondary" id="connect-sheets">'+(connected?'Налаштування підключення':'Підключити Google-таблицю')+'</button>';
 document.querySelector('.live').textContent=connected?'● Google Sheets':'● Локальна демоверсія';
 document.querySelector('#connect-sheets').onclick=()=>{
  const config=sheetsConfig()||{};
  showForm(`<h2>Підключення Google-таблиці</h2><p>Спочатку розгорніть Apps Script у вашій таблиці. Інструкція є в репозиторії, у папці google-apps-script.</p><label>URL вебдодатка Apps Script</label><input name="url" type="url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(config.url||'')}" required><label>Спільний ключ ACCESS_KEY</label><input name="key" type="password" autocomplete="off" value="${esc(config.key||'')}" required><p>Кожен, хто має ключ, може бачити й змінювати заявки. Демо-заявки автоматично не переносяться.</p>`,async values=>{
   const url=new URL(values.url);if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error('Потрібне посилання Apps Script, яке закінчується на /exec');
   url.search='';url.hash='';
   const test=new URL(url);test.searchParams.set('key',values.key);const response=await fetch(test);const result=await response.json();if(result.error)throw Error(result.error);if(!Array.isArray(result.materials)||!Array.isArray(result.items))throw Error('Неочікувана відповідь скрипту');
   localStorage.setItem('ceh-sheets',JSON.stringify({url:url.href,key:values.key}));location.reload();
  });
 };
}
