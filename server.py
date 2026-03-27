#!/usr/bin/env python3
import http.server, socketserver, webbrowser, threading, os, sys, subprocess

PORT = 8766
DIR  = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, format, *args):
        pass

def open_browser():
    import time
    time.sleep(1.5)
    url = f'http://localhost:{PORT}/chord_score.html'
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

url = f'http://localhost:{PORT}/chord_score.html'
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
