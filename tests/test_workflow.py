import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path

spec = importlib.util.spec_from_file_location('server', Path(__file__).parents[1] / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class Workflow(unittest.TestCase):
    def test_order_and_partial_delivery(self):
        with tempfile.TemporaryDirectory() as tmp:
            server.DB = str(Path(tmp) / 'test.sqlite3')
            server.initialize()
            server.initialize()
            http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            threading.Thread(target=http.serve_forever, daemon=True).start()
            base = 'http://127.0.0.1:' + str(http.server_port)
            def call(path, payload=None):
                req = urllib.request.Request(base + path, data=json.dumps(payload).encode() if payload is not None else None, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req) as response:
                    return json.load(response)
            try:
                state = call('/api/state')
                self.assertEqual(len(state['materials']), 10)
                material_id = state['materials'][0]['id']
                result = call('/api/requests', {'worker': 'Іван', 'note': 'Тестова робота', 'urgent': True, 'items': [{'material_id': material_id, 'quantity': 5}]})
                state = call('/api/state')
                self.assertEqual(state['requests'][0]['id'], result['id'])
                item = state['items'][0]
                call('/api/items', {'id': item['id'], 'status': 'quoted'})
                self.assertEqual(call('/api/state')['items'][0]['status'], 'quoted')
                call('/api/items', {'id': item['id'], 'status': 'ordered'})
                call('/api/items', {'id': item['id'], 'received': 2})
                self.assertEqual(call('/api/state')['items'][0]['status'], 'partial')
                call('/api/items', {'id': item['id'], 'received': 5})
                self.assertEqual(call('/api/state')['items'][0]['status'], 'done')
                with self.assertRaises(urllib.error.HTTPError) as error:
                    call('/api/items', {'id': item['id'], 'received': 6})
                self.assertEqual(error.exception.code, 400)
                with self.assertRaises(urllib.error.HTTPError):
                    call('/api/requests', {'worker': 'Іван', 'items': [{'material_id': material_id, 'quantity': -1}]})
                self.assertEqual(len(call('/api/state')['requests']), 1)
                supplier = call('/api/suppliers', {'name': 'Тест постачальник'})
                call('/api/materials', {'name': 'Тест матеріал', 'unit': 'шт.', 'supplier_id': supplier['id']})
                self.assertEqual(len(call('/api/state')['materials']), 11)
                with urllib.request.urlopen(base + '/') as response:
                    self.assertIn('Матеріали'.encode(), response.read())
            finally:
                http.shutdown()
                http.server_close()


if __name__ == '__main__':
    unittest.main()
