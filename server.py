#!/usr/bin/env python3
import http.server, socketserver, webbrowser, threading, os, sys, subprocess
import json, re  # ★ 追加

PORT = 8767
DIR  = os.path.dirname(os.path.abspath(__file__))
ANALYSIS_DIR = os.path.join(DIR, 'analysis')

# ────────────────────────────────────────
# Analysis ファイル解決（Phase139 / Issue #118）
#
# [ANALYSIS FILE RESOLUTION]
#   projectId がAnalysisの唯一の論理キー。ファイル名は人間向けのProjection
#   （導出表示）であり、Authority（正本）ではない。
#   Analysis実体の特定は resolve_analysis_file() を唯一の窓口とし、
#   projectId に対して複数の実ファイルが存在する場合は推測せずConflictとする。
#   load / save / baseVersion の比較は、同じ1つの実ファイルを対象とする。
#   artist/title はファイル名生成にのみ使用し、Analysis JSONには保存しない。
# ────────────────────────────────────────
ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]+$')
UUID_PATTERN = re.compile(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
ANALYSIS_URL_PATTERN = re.compile(r'^/analysis/([a-zA-Z0-9_-]+)\.json$')
FILENAME_FORBIDDEN = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]')
LABEL_MAX_LEN = 60  # 人間が曲を判別できる程度の上限（識別は末尾のprojectIdが担う）


def resolve_analysis_file(project_id):
    """既存のAnalysis実ファイルを特定する（読み取り専用）。

    戻り値: ('none', None) / ('ok', path) / ('multiple', [path, ...])
    {id}.json と 名前_{id}.json が両方ある場合も旧形式優先にせず multiple とする。
    名前付き形式の探索はUUID形式のIDのみ対象（末尾一致の曖昧さを避けるため）。
    """
    found = []
    legacy_name = f'{project_id}.json'
    legacy_path = os.path.join(ANALYSIS_DIR, legacy_name)
    if os.path.isfile(legacy_path):
        found.append(legacy_path)

    if UUID_PATTERN.match(project_id) and os.path.isdir(ANALYSIS_DIR):
        suffix = f'_{project_id}.json'.lower()
        for name in sorted(os.listdir(ANALYSIS_DIR)):
            low = name.lower()
            if low.endswith(suffix) and low != legacy_name.lower():
                found.append(os.path.join(ANALYSIS_DIR, name))

    if not found:
        return ('none', None)
    if len(found) == 1:
        return ('ok', found[0])
    return ('multiple', found)


def _clean_label_part(value):
    text = FILENAME_FORBIDDEN.sub('_', str(value or ''))
    return text.strip(' .')


def build_analysis_filename(project_id, name_hint):
    """新規作成時だけ使うファイル名を生成する（純粋関数）。

    {artist}-{title}_{projectId}.json。片方のみなら使える方だけ、両方空なら
    {projectId}.json。名前付き形式はUUID形式のIDのみ。
    """
    if not UUID_PATTERN.match(project_id) or not isinstance(name_hint, dict):
        return f'{project_id}.json'
    artist = _clean_label_part(name_hint.get('artist'))
    title  = _clean_label_part(name_hint.get('title'))
    label = f'{artist}-{title}' if (artist and title) else (artist or title)
    label = label[:LABEL_MAX_LEN].strip(' .-_')
    if not label:
        return f'{project_id}.json'
    return f'{label}_{project_id}.json'

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

    def _send_json(self, status, body_bytes):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body_bytes)))
        self.end_headers()
        self.wfile.write(body_bytes)

    def do_GET(self):
        # /analysis/{id}.json は論理URL。実ファイル名はclientに見せず、
        # resolve_analysis_file() が特定した1ファイルを返す。
        # それ以外のURLは従来どおりの静的配信。
        url_path = self.path.split('?', 1)[0].split('#', 1)[0]
        m = ANALYSIS_URL_PATTERN.match(url_path)
        if not m:
            return super().do_GET()
        project_id = m.group(1)
        try:
            status, found = resolve_analysis_file(project_id)
            if status == 'none':
                self.send_response(404)
                self.end_headers()
                return
            if status == 'multiple':
                print(f'[analysis] duplicate files (load refused): {project_id}')
                self._send_json(409, b'{"ok":false,"reason":"duplicate"}')
                return
            with open(found, 'rb') as f:
                self._send_json(200, f.read())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(str(e).encode())

    # ★ 追加
    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    # ★ 追加
    def do_POST(self):
        if self.path == '/save-analysis':
            self._handle_save_analysis()
        elif self.path == '/rename-analysis':
            self._handle_rename_analysis()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_rename_analysis(self):
        """Analysisファイル名をProjectの現在のartist/titleに合わせて改名する。

        Request : { projectId, nameHint: { artist, title }, dryRun? }
        dryRun=true: 判定のみ行い、ファイルは変更しない（結果の予測を返す）
        Response: 200 { ok:true, result, ... }
          result = 'renamed'   改名した（from/to を返す）
                   'unchanged' すでに同じ名前
                   'none'      該当ファイルなし
                   'skipped'   改名しない（reason: 'empty-hint' | 'target-exists'）
                 409 { ok:false, reason:'duplicate' }  同一IDの実ファイルが複数
                 400 不正なprojectId
        改名のみ。JSONの中身・generatedAtは一切変更しない（baseVersionに影響しない）。
        """
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length))
            project_id = data.get('projectId', '')
            if not isinstance(project_id, str) or not ID_PATTERN.match(project_id):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'invalid projectId')
                return

            status, found = resolve_analysis_file(project_id)
            if status == 'multiple':
                print(f'[analysis] duplicate files (rename refused): {project_id}')
                self._send_json(409, b'{"ok":false,"reason":"duplicate"}')
                return
            if status == 'none':
                self._send_json(200, b'{"ok":true,"result":"none"}')
                return

            new_name = build_analysis_filename(project_id, data.get('nameHint'))
            old_name = os.path.basename(found)
            legacy_name = f'{project_id}.json'

            # artist/titleが両方空なら {id}.json になるが、これは「名前を消す」
            # 方向の改名になるため行わない（名前付きファイルは維持する）。
            if new_name == legacy_name:
                self._reply_rename('skipped', reason='empty-hint')
                return
            if os.path.normcase(new_name) == os.path.normcase(old_name):
                self._reply_rename('unchanged')
                return

            new_path = os.path.join(ANALYSIS_DIR, new_name)
            if os.path.exists(new_path):
                print(f'[analysis] rename skipped (target exists): {new_name}')
                self._reply_rename('skipped', reason='target-exists')
                return

            # [DRY-RUN INVARIANT] dryRun=true のときは、ここまでの判定を行うだけで
            # ファイルを一切変更しない。改名する場合の結果('renamed')だけを返す。
            if data.get('dryRun') is True:
                self._reply_rename('renamed', dryRun=True,
                                   **{'from': old_name, 'to': new_name})
                return

            os.replace(found, new_path)
            print(f'[analysis] renamed: {old_name} -> {new_name}')
            self._reply_rename('renamed', **{'from': old_name, 'to': new_name})
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(str(e).encode())

    def _reply_rename(self, result, **extra):
        body = {'ok': True, 'result': result}
        body.update(extra)
        self._send_json(200, json.dumps(body, ensure_ascii=False).encode('utf-8'))

    def _handle_save_analysis(self):
        try:
            length  = int(self.headers.get('Content-Length', 0))
            body    = self.rfile.read(length)
            data    = json.loads(body)
            project_id = data.get('projectId', '')

            # path traversal 防止（英数字・_・- のみ許可）
            if not ID_PATTERN.match(project_id):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'invalid projectId')
                return

            # nameHint（artist/title）はファイル名生成専用。JSONへは書かない。
            name_hint = data.pop('nameHint', None)

            # analysis/ ディレクトリ自動作成
            os.makedirs(ANALYSIS_DIR, exist_ok=True)

            # 既存ファイルの解決（load/save/baseVersionの比較で同じ1ファイルを使う）
            status, found = resolve_analysis_file(project_id)
            if status == 'multiple':
                print(f'[analysis] duplicate files (write refused): {project_id}')
                self.send_response(409)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok":false,"reason":"duplicate"}')
                return

            # 既存あり → そのファイル（artist/titleが変わっていても改名しない）
            # 既存なし → 新規作成時だけ名前を生成する
            if status == 'ok':
                path = found
            else:
                path = os.path.join(
                    ANALYSIS_DIR, build_analysis_filename(project_id, name_hint))

            # ★ 追加: 読み込んだ後に他の保存が入っていないか確認する。
            #
            #   [BACKFILL NON-DESTRUCTIVE INVARIANT] を守るための仕組み
            #   （楽観的並行性制御・Optimistic Concurrency Control）。
            #
            #   このチェックは baseVersion が送られてきた場合のみ働く。
            #
            #   通常の編集保存（ユーザーが今この曲を開いて行う正規の変更）は
            #   baseVersion を送らない。編集セッション中は常に自分が最新の
            #   状態を保持しているため、無条件で保存してよい（従来通り）。
            #
            #   一方、既存曲の編集状況を確認する処理（バックフィル）は、
            #   ユーザーが今操作していない曲を「観測」するだけの処理であり、
            #   自分が読んだ後に本物の変更（ユーザーによる保存）が入っていた
            #   場合、それを古いデータで上書きすることは絶対に許されない。
            #   そのため baseVersion を送り、この安全策の対象になる。
            if 'baseVersion' in data:
                base_version = data.get('baseVersion')  # None または文字列

                if base_version is None:
                    # クライアントが読み込んだファイルに generatedAt が
                    # 存在しなかった（バージョン不明の古いファイル）。
                    # 「変更されていないこと」を証明する手段が無いため、
                    # 安全側に倒して常に書き込みを拒否する。
                    print(f'[analysis] conflict (no version marker, refused): {project_id}')
                    self.send_response(409)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"ok":false,"reason":"no-version"}')
                    return

                existing_version = None
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            existing_version = json.load(f).get('generatedAt')
                    except Exception:
                        existing_version = None  # 壊れたファイル等 → 不一致扱いにする

                if existing_version != base_version:
                    # 読み込んだ後に他の保存が入っていた（最終保存時刻が変わっていた）
                    # → 安全側に倒して書き込みを拒否する。古いデータは絶対に書かない。
                    print(f'[analysis] conflict (write refused): {project_id}')
                    self.send_response(409)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"ok":false,"reason":"conflict"}')
                    return

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
