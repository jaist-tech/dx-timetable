"""
JAISTのりかえ - 管理者ツールサーバ

ローカル専用。tools/parsers/ を呼び、public/data/ に書き込む。

起動: python3 tools/admin/server.py
ブラウザ: http://localhost:9001/
"""

import os
import re
import sys
import json
import email
import email.policy
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# このファイルから見たプロジェクトルート (project1/)
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PUBLIC_DATA = os.path.join(PROJECT_ROOT, 'public', 'data')
ADMIN_STATIC = HERE  # index.html, app.js, style.css

JST = timezone(timedelta(hours=9))


def _now_iso():
    return datetime.now(JST).isoformat(timespec='seconds')


def load_manifest():
    path = os.path.join(PUBLIC_DATA, 'manifest.json')
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {'regular': {}, 'special': {}}


# Late-import wrappers (lazy so http.server starts even if these modules fail to load)
def check_payload(*a, **kw):
    from check_commit import check_payload as _impl
    return _impl(*a, **kw)


def commit_payload(*a, **kw):
    from check_commit import commit_payload as _impl
    return _impl(*a, **kw)


class Handler(BaseHTTPRequestHandler):

    # quieter logs
    def log_message(self, fmt, *args):
        sys.stderr.write("[admin] " + fmt % args + "\n")

    # ---- helpers ----

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, indent=2).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            with open(path, 'rb') as f:
                data = f.read()
        except FileNotFoundError:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'404 Not Found')
            return
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ---- routing ----

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ('/', '/index.html'):
            return self._send_file(os.path.join(ADMIN_STATIC, 'index.html'), 'text/html; charset=utf-8')
        if path == '/app.js':
            return self._send_file(os.path.join(ADMIN_STATIC, 'app.js'), 'application/javascript; charset=utf-8')
        if path == '/style.css':
            return self._send_file(os.path.join(ADMIN_STATIC, 'style.css'), 'text/css; charset=utf-8')
        if path == '/api/manifest':
            return self._send_json(load_manifest())
        if path == '/api/files':
            return self._handle_list_files()
        if path == '/api/file':
            from urllib.parse import parse_qs
            qs = parse_qs(parsed.query)
            kind = (qs.get('kind') or [''])[0]
            file = (qs.get('file') or [''])[0]
            return self._handle_get_file(kind, file)
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'404 Not Found')

    def _handle_list_files(self):
        """登録ファイル一覧を返す。manifest と各ファイルのメタ概要をまとめる。
        fallback_to のような『file を持たない仮想エントリ』は除外する。
        manifest にあるが実体ファイルが無いものは ghost フラグを立てる。
        """
        manifest = load_manifest()
        result = {'regular': [], 'special': []}
        for kind in ('regular', 'special'):
            for segment, entries in (manifest.get(kind) or {}).items():
                for entry in entries:
                    if not entry.get('file'):
                        continue  # fallback_to entries: skip
                    full = os.path.join(PUBLIC_DATA, kind, entry['file'])
                    ghost = not os.path.exists(full)
                    item = {
                        'kind': kind,
                        'segment': segment,
                        'ghost': ghost,
                        **entry,
                    }
                    result[kind].append(item)
        return self._send_json(result)

    def _handle_get_file(self, kind, file):
        """個別ファイル中身を返す。"""
        if kind not in ('regular', 'special'):
            return self._send_json({'error': 'invalid kind'}, 400)
        # path traversal protection
        if not file or '/' in file or '\\' in file or '..' in file or not file.endswith('.json'):
            return self._send_json({'error': 'invalid file'}, 400)
        full = os.path.join(PUBLIC_DATA, kind, file)
        try:
            with open(full, encoding='utf-8') as f:
                doc = json.load(f)
        except FileNotFoundError:
            return self._send_json({'error': 'not found'}, 404)
        except Exception as e:
            return self._send_json({'error': str(e)}, 500)
        return self._send_json(doc)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/parse':
            return self._handle_parse()
        if path == '/api/check':
            return self._handle_check()
        if path == '/api/commit':
            return self._handle_commit()
        if path == '/api/delete':
            return self._handle_delete()
        if path == '/api/update':
            return self._handle_update()
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'404 Not Found')

    # ---- handlers ----

    def _read_multipart(self):
        """multipart/form-data を email モジュールで分解。
        Returns: dict {field_name: {'filename': str|None, 'value': bytes}}
        """
        ctype = self.headers.get('Content-Type', '')
        if 'multipart/form-data' not in ctype:
            raise ValueError('expected multipart/form-data')
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        # email parser needs full headers + body
        full = b'Content-Type: ' + ctype.encode() + b'\r\n\r\n' + body
        msg = email.message_from_bytes(full, policy=email.policy.default)
        result = {}
        for part in msg.iter_parts():
            disp = part.get('Content-Disposition', '')
            m = re.search(r'name="([^"]+)"', disp)
            if not m:
                continue
            name = m.group(1)
            fm = re.search(r'filename="([^"]*)"', disp)
            filename = fm.group(1) if fm else None
            payload = part.get_payload(decode=True)
            if payload is None:
                payload = (part.get_content() or '').encode('utf-8')
            result[name] = {'filename': filename, 'value': payload}
        return result

    def _handle_parse(self):
        """PDF + 任意ヒント (segment, kind) を受け取り、抽出結果を返す。"""
        try:
            fields = self._read_multipart()
        except Exception as e:
            return self._send_json({'error': f'multipart parse failed: {e}'}, 400)
        pdf_field = fields.get('pdf')
        if not pdf_field or not pdf_field.get('filename'):
            return self._send_json({'error': 'pdf field is missing'}, 400)
        filename = pdf_field['filename']
        pdf_bytes = pdf_field['value']

        # Optional hints: segment, kind
        def _val(name):
            f = fields.get(name)
            if not f:
                return None
            v = f['value']
            if isinstance(v, bytes):
                v = v.decode('utf-8')
            return v.strip() or None

        hint_segment = _val('segment')
        hint_kind = _val('kind')

        # Lazy import (avoid pdfplumber at server startup if no parse yet)
        import parser_adapter

        # 1. Determine segment (hint > filename guess > error)
        segment = hint_segment or parser_adapter.guess_segment_from_filename(filename)
        # 2. Determine kind (hint > filename guess)
        kind = hint_kind or parser_adapter.guess_kind_from_filename(filename)

        if not segment:
            return self._send_json({
                'received_filename': filename,
                'received_bytes': len(pdf_bytes),
                'segment_guess': None,
                'kind_guess': kind,
                'error': 'segment could not be guessed from filename. Please supply hint.',
            }, 200)  # 200 to let frontend prompt user

        # Save PDF to a temp path (parsers expect a file path)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tf:
            tf.write(pdf_bytes)
            tmp_path = tf.name

        try:
            result = parser_adapter.parse_pdf(tmp_path, segment, kind)
        except NotImplementedError as e:
            os.unlink(tmp_path)
            return self._send_json({
                'received_filename': filename,
                'segment_guess': segment,
                'kind_guess': kind,
                'error': f'parser not yet implemented: {e}',
            }, 200)
        except Exception as e:
            os.unlink(tmp_path)
            return self._send_json({
                'received_filename': filename,
                'segment_guess': segment,
                'kind_guess': kind,
                'error': f'parse error: {e}',
            }, 500)
        os.unlink(tmp_path)

        return self._send_json({
            'received_filename': filename,
            'received_bytes': len(pdf_bytes),
            'segment_guess': segment,
            'kind_guess': kind,
            'result': result,
        })

    def _read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def _handle_check(self):
        """整合性チェック。リクエスト body は parse 結果と同形式の dict。"""
        try:
            payload = self._read_json_body()
        except Exception as e:
            return self._send_json({'error': f'invalid JSON: {e}'}, 400)
        manifest = load_manifest()
        results = check_payload(payload, manifest)
        return self._send_json(results)

    def _handle_commit(self):
        """確認済みデータをファイルに書き込み、manifest を更新する。"""
        try:
            payload = self._read_json_body()
        except Exception as e:
            return self._send_json({'error': f'invalid JSON: {e}'}, 400)
        manifest = load_manifest()
        results = check_payload(payload, manifest)
        if results['errors']:
            return self._send_json({
                'error': 'check failed',
                'check': results,
            }, 400)

        try:
            written = commit_payload(payload, manifest)
        except Exception as e:
            return self._send_json({
                'error': f'commit failed: {e}',
            }, 500)
        return self._send_json({
            'ok': True,
            'written': written,
        })

    def _handle_delete(self):
        """ファイル削除 + manifest からエントリ除去。
        body: { kind, file }  ※ ghost (実体無し) でも manifest を整理できる
        """
        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json({'error': f'invalid JSON: {e}'}, 400)
        kind = body.get('kind')
        file = body.get('file')
        if kind not in ('regular', 'special'):
            return self._send_json({'error': 'invalid kind'}, 400)
        if not file or '/' in file or '\\' in file or '..' in file or not file.endswith('.json'):
            return self._send_json({'error': 'invalid file'}, 400)
        try:
            from check_commit import delete_entry
            removed = delete_entry(kind, file)
        except Exception as e:
            return self._send_json({'error': f'delete failed: {e}'}, 500)
        return self._send_json({'ok': True, 'removed': removed})

    def _handle_update(self):
        """既存ファイルのメタデータを部分更新する (上書き保存)。
        body: { kind, file, meta_updates }  ※ meta_updates は編集可フィールドのみ
        """
        try:
            body = self._read_json_body()
        except Exception as e:
            return self._send_json({'error': f'invalid JSON: {e}'}, 400)
        kind = body.get('kind')
        file = body.get('file')
        meta_updates = body.get('meta_updates') or {}
        if kind not in ('regular', 'special'):
            return self._send_json({'error': 'invalid kind'}, 400)
        if not file or '/' in file or '\\' in file or '..' in file or not file.endswith('.json'):
            return self._send_json({'error': 'invalid file'}, 400)
        try:
            from check_commit import update_entry
            result = update_entry(kind, file, meta_updates)
        except FileNotFoundError as e:
            return self._send_json({'error': str(e)}, 404)
        except ValueError as e:
            return self._send_json({'error': str(e)}, 400)
        except Exception as e:
            return self._send_json({'error': f'update failed: {e}'}, 500)
        return self._send_json({'ok': True, 'result': result})


def main(port=9001):
    addr = ('127.0.0.1', port)
    server = ThreadingHTTPServer(addr, Handler)
    print(f"admin server: http://localhost:{port}/")
    print(f"  PROJECT_ROOT = {PROJECT_ROOT}")
    print(f"  PUBLIC_DATA  = {PUBLIC_DATA}")
    server.serve_forever()


if __name__ == '__main__':
    main()
