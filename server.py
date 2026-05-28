#!/usr/bin/env python3
import http.server, socketserver, webbrowser, threading, os, sys, subprocess
import json, re  # ★ 追加

PORT = 8767
DIR  = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, format, *args):
        pass

    # ★ 追加
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    # ★ 追加
    def do_POST(self):
        if self.path == '/save-analysis':
            self._handle_save_analysis()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_save_analysis(self):
        try:
            length  = int(self.headers.get('Content-Length', 0))
            body    = self.rfile.read(length)
            data    = json.loads(body)
            project_id = data.get('projectId', '')

            # path traversal 防止（UUID形式のみ許可）
            if not re.match(r'^[a-zA-Z0-9_-]+$', project_id):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'invalid projectId')
                return

            # analysis/ ディレクトリ自動作成
            analysis_dir = os.path.join(DIR, 'analysis')
            os.makedirs(analysis_dir, exist_ok=True)

            # 書き込み
            path = os.path.join(analysis_dir, f'{project_id}.json')

            # ★ 追加: 上書き検出log
            if os.path.exists(path):
                print(f'[analysis] overwrite: {project_id}')
                
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(str(e).encode())


def open_browser():
    import time
    time.sleep(1.5)
    url = f'http://localhost:{PORT}/index.html'
    try:
        if sys.platform == 'win32':
            os.startfile(url)
        else:
            webbrowser.open(url)
    except Exception:
        try:
            subprocess.Popen(f'start {url}', shell=True)
        except Exception:
            print(f'ブラウザを手動で開いてください: {url}')

url = f'http://localhost:{PORT}/index.html'
print('=' * 52)
print('  ChordPlayer サーバー起動中')
print(f'  {url}')
print('  ブラウザが開かない場合は上記URLをブラウザで開いてください')
print('  停止: Ctrl+C')
print('=' * 52)

threading.Thread(target=open_browser, daemon=True).start()

try:
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print('\nサーバーを停止しました。')
except OSError as e:
    if '10048' in str(e) or 'Address already in use' in str(e):
        print(f'\nポート {PORT} は既に使用中です。')
        print(f'ブラウザで開いてください: {url}')
        try:
            os.startfile(url)
        except Exception:
            pass
        input('Enterキーで終了...')
    else:
        print(f'エラー: {e}')
        input('Enterキーで終了...')
