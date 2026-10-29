/* Bind to the user's spreadsheet using Extensions → Apps Script. */
const TABLES = {
  suppliers: ['id', 'name'],
  materials: ['id', 'name', 'category', 'unit', 'supplier_id'],
  requests: ['id', 'worker', 'note', 'urgent', 'created'],
  items: ['id', 'request_id', 'material_id', 'quantity', 'received', 'supplier_id', 'status']
};
const SPREADSHEET_ID = '1KzI30jBEXZYOKRmtUYpDkYVpSJHxnzpTerNxFnLoCO8';
function book_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(name) {
  const book = book_(), title = 'Цех_' + name;
  let sheet = book.getSheetByName(title);
  if (!sheet) { sheet = book.insertSheet(title); sheet.appendRow(TABLES[name]); sheet.setFrozenRows(1); }
  return sheet;
}
function rows_(name) {
  const values = sheet_(name).getDataRange().getValues();
  return values.slice(1).filter(row => row[0] !== '').map(row => Object.fromEntries(TABLES[name].map((key, i) => [key, row[i] instanceof Date ? row[i].toISOString() : row[i]])));
}
function next_(name) { return Math.max(0, ...rows_(name).map(row => Number(row.id))) + 1; }
function append_(name, row) {
  // Write strings as literal text; prevent spreadsheet formula execution.
  sheet_(name).appendRow(TABLES[name].map(key => typeof row[key] === 'string' && /^[=+@-]/.test(row[key]) ? "'" + row[key] : row[key] === undefined || row[key] === null ? '' : row[key]));
}
function output_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function authorize_(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (!expected || key !== expected) throw Error('Невірний ключ доступу. Задайте ACCESS_KEY у властивостях скрипту.');
}
function doGet(e) {
  try {
    authorize_(e.parameter.key);
    const state = Object.fromEntries(Object.keys(TABLES).map(name => [name, rows_(name)]));
    state.materials.forEach(m => { m.supplier_id = m.supplier_id || null; });
    state.items.forEach(i => { i.supplier_id = i.supplier_id || null; });
    return output_(state);
  } catch (error) { return output_({error: error.message}); }
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    authorize_(body.key);
    lock.waitLock(30000);
    const data = body.data;
    if (body.path === 'requests') {
      if (!String(data.worker || '').trim() || !Array.isArray(data.items) || !data.items.length) throw Error('Вкажіть працівника та матеріали');
      const materials = rows_('materials');
      data.items.forEach(i => { if (!materials.some(m => Number(m.id) === Number(i.material_id)) || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 || Number(i.quantity) > 1000000) throw Error('Некоректний матеріал або кількість'); });
      const id = next_('requests');
      append_('requests', {id, worker: String(data.worker).slice(0,100), note: String(data.note || '').slice(0,2000), urgent: Boolean(data.urgent), created: new Date().toISOString()});
      let itemId = next_('items');
      data.items.forEach(i => append_('items', {id:itemId++, request_id:id, material_id:Number(i.material_id), quantity:Number(i.quantity), received:0, supplier_id:materials.find(m=>Number(m.id)===Number(i.material_id)).supplier_id, status:'new'}));
      return output_({id});
    }
    if (body.path === 'items') {
      const rows = rows_('items'), index = rows.findIndex(i => Number(i.id) === Number(data.id));
      if (index < 0) throw Error('Позицію не знайдено');
      const row = rows[index];
      if (data.supplier_id !== undefined) {
        if (data.supplier_id !== null && !rows_('suppliers').some(s => Number(s.id) === Number(data.supplier_id))) throw Error('Постачальника не знайдено');
        row.supplier_id = data.supplier_id;
      }
      if (data.status !== undefined) {
        if (!['new','quoted','ordered','partial','done'].includes(data.status)) throw Error('Некоректний статус');
        row.status = data.status;
      }
      if (data.received !== undefined) {
        const qty = Number(data.received);
        if (!Number.isFinite(qty) || qty < Number(row.received) || qty > Number(row.quantity)) throw Error('Некоректна кількість');
        row.received = qty;
      }
      if (Number(row.received) === Number(row.quantity)) row.status = 'done';
      else if (Number(row.received) > 0) row.status = 'partial';
      sheet_('items').getRange(index + 2, 1, 1, TABLES.items.length).setValues([TABLES.items.map(k => row[k] === null ? '' : row[k])]);
      return output_({ok:true});
    }
    if (['suppliers','materials'].includes(body.path)) {
      if (!String(data.name || '').trim()) throw Error('Вкажіть назву');
      if (body.path === 'materials' && !String(data.unit || '').trim()) throw Error('Вкажіть одиницю виміру');
      const id = next_(body.path);
      append_(body.path, {id, name:String(data.name).slice(0,200), category:String(data.category || 'Інше').slice(0,100), unit:String(data.unit || '').slice(0,30), supplier_id:data.supplier_id});
      return output_({id});
    }
    throw Error('Невідома дія');
  } catch (error) { return output_({error: error.message}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function setup() {
  Object.keys(TABLES).forEach(sheet_);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ACCESS_KEY')) props.setProperty('ACCESS_KEY', Utilities.getUuid() + Utilities.getUuid());
}
