import json
import os
import sqlite3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
DB = os.environ.get('DATABASE_PATH', str(ROOT / 'materials.sqlite3'))


def connect():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def initialize():
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS materials(id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL, supplier_id INTEGER REFERENCES suppliers(id));
        CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, worker TEXT NOT NULL, note TEXT NOT NULL, urgent INTEGER NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id), material_id INTEGER NOT NULL REFERENCES materials(id), quantity REAL NOT NULL CHECK(quantity>0), received REAL NOT NULL DEFAULT 0, supplier_id INTEGER REFERENCES suppliers(id), status TEXT NOT NULL DEFAULT 'new');
        ''')
        if not db.execute('SELECT 1 FROM materials').fetchone():
            db.executemany('INSERT INTO suppliers(name) VALUES (?)', [('Постачальник пластику',), ('Постачальник плівки',), ('Постачальник комплектуючих',)])
            db.executemany('INSERT INTO materials(name,category,unit,supplier_id) VALUES (?,?,?,?)', [
                ('ПВХ білий 3 мм · 2030 × 3050', 'Листові матеріали', 'лист', 1),
                ('ПВХ білий 5 мм · 2030 × 3050', 'Листові матеріали', 'лист', 1),
                ('Акрил прозорий 3 мм', 'Листові матеріали', 'лист', 1),
                ('Композит білий 3 мм', 'Листові матеріали', 'лист', 1),
                ('Oracal 641 чорна матова · 1 м', 'Плівки', 'пог. м', 2),
                ('Oracal 641 біла глянцева · 1 м', 'Плівки', 'пог. м', 2),
                ('Монтажна плівка · 1 м', 'Плівки', 'пог. м', 2),
                ('LED модуль 12 В · білий', 'Комплектуючі', 'шт.', 3),
                ('Блок живлення 12 В · 100 Вт', 'Комплектуючі', 'шт.', 3),
                ('Скотч двосторонній · 19 мм', 'Витратні матеріали', 'рулон', 3)])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'static'), **kwargs)

    def reply(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/state':
            with connect() as db:
                self.reply({table: [dict(row) for row in db.execute('SELECT * FROM ' + table)] for table in ['materials', 'suppliers', 'requests', 'items']})
        else:
            super().do_GET()

    def do_POST(self):
        try:
            size = int(self.headers.get('Content-Length', 0))
            if size > 100000:
                raise ValueError('Завеликий запит')
            data = json.loads(self.rfile.read(size))
            with connect() as db:
                if self.path == '/api/requests':
                    worker = str(data.get('worker', '')).strip()
                    if not worker or not data.get('items'):
                        raise ValueError('Вкажіть ім’я та додайте матеріали')
                    request_id = db.execute('INSERT INTO requests(worker,note,urgent) VALUES (?,?,?)', (worker[:100], str(data.get('note', ''))[:2000], bool(data.get('urgent')))).lastrowid
                    for item in data['items']:
                        quantity = float(item['quantity'])
                        if not 0 < quantity <= 1000000:
                            raise ValueError('Некоректна кількість')
                        material = db.execute('SELECT * FROM materials WHERE id=?', (int(item['material_id']),)).fetchone()
                        if material is None:
                            raise ValueError('Матеріал не знайдено')
                        db.execute('INSERT INTO items(request_id,material_id,quantity,supplier_id) VALUES (?,?,?,?)', (request_id, material['id'], quantity, material['supplier_id']))
                    result = {'id': request_id}
                elif self.path == '/api/items':
                    item = db.execute('SELECT * FROM items WHERE id=?', (int(data['id']),)).fetchone()
                    if item is None:
                        raise ValueError('Позицію не знайдено')
                    supplier = data.get('supplier_id', item['supplier_id'])
                    status = data.get('status', item['status'])
                    received = float(data.get('received', item['received']))
                    if status not in ['new', 'quoted', 'ordered', 'partial', 'done'] or not 0 <= received <= item['quantity']:
                        raise ValueError('Некоректний стан або кількість')
                    if received == item['quantity']:
                        status = 'done'
                    elif received > 0:
                        status = 'partial'
                    db.execute('UPDATE items SET supplier_id=?,status=?,received=? WHERE id=?', (supplier, status, received, item['id']))
                    result = {'ok': True}
                elif self.path == '/api/materials':
                    name = str(data.get('name', '')).strip()
                    unit = str(data.get('unit', '')).strip()
                    if not name or not unit:
                        raise ValueError('Вкажіть назву та одиницю виміру')
                    result = {'id': db.execute('INSERT INTO materials(name,category,unit,supplier_id) VALUES (?,?,?,?)', (name[:200], str(data.get('category', 'Інше'))[:100], unit[:30], data.get('supplier_id'))).lastrowid}
                elif self.path == '/api/suppliers':
                    name = str(data.get('name', '')).strip()
                    if not name:
                        raise ValueError('Вкажіть назву постачальника')
                    result = {'id': db.execute('INSERT INTO suppliers(name) VALUES (?)', (name[:200],)).lastrowid}
                else:
                    self.reply({'error': 'Не знайдено'}, 404)
                    return
            self.reply(result, 201)
        except (ValueError, KeyError, TypeError, sqlite3.IntegrityError) as error:
            self.reply({'error': str(error)}, 400)


if __name__ == '__main__':
    initialize()
    ThreadingHTTPServer((os.environ.get('HOST', '127.0.0.1'), int(os.environ.get('PORT', '8000'))), Handler).serve_forever()
