#!/usr/bin/env python3
"""
chordmini_fetch.py - chordmini.me に音声ファイルを送信してJSONを自動保存

使い方:
  python chordmini_fetch.py 曲.mp3
  python chordmini_fetch.py 曲.mp3 --output 結果.json
  python chordmini_fetch.py 曲.mp3 --compress   # ffmpegで圧縮してから送信

必要ライブラリ（初回のみ）:
  pip install requests
"""

import sys, os, json, argparse, subprocess, tempfile, time
from tkinter import Tk, filedialog

# GUIでファイル選択
def choose_file():
    root = Tk()
    root.withdraw()  # メインウィンドウを表示しない
    file_path = filedialog.askopenfilename(
        title="MP3ファイルを選択",
        filetypes=[("MP3 files", "*.mp3"), ("Audio files", "*.wav *.m4a *.flac *.mp3"), ("All files", "*.*")]
    )
    return file_path

# 引数が無い場合はGUIで選択
if len(sys.argv) < 2:
    file = choose_file()
    if not file:
        print("ファイルが選択されませんでした")
        sys.exit(1)
    sys.argv.append(file)
try:
    import requests
except ImportError:
    print("エラー: requests がインストールされていません")
    print("以下を実行してください: pip install requests")
    sys.exit(1)

# ──────────────────────────────────────
# 設定
# ──────────────────────────────────────
BACKEND_URL = "https://chordmini-backend-191567167632.us-central1.run.app"
HEADERS = {
    "Origin":  "https://www.chordmini.me",
    "Referer": "https://www.chordmini.me/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/122.0.0.0 Safari/537.36",
}

QUAL_MAP = {
    "maj":"","min":"m","maj7":"maj7","min7":"m7",
    "dom7":"7","7":"7","dim":"dim","aug":"aug",
    "sus2":"sus2","sus4":"sus4","hdim7":"m7b5",
    "maj9":"maj9","min9":"m9","add9":"add9",
}

def normalize_chord(raw):
    if not raw or raw in ("N","X","n"): return "N"
    if ":" in raw:
        root, qual = raw.split(":", 1)
        return root + QUAL_MAP.get(qual, qual)
    return raw

def estimate_key(chords):
    freq = {}
    for c in chords:
        if c == "N": continue
        r = c.split("/")[0]
        import re
        m = re.match(r"^([A-G][b#]?)", r)
        if m: freq[m.group(1)] = freq.get(m.group(1), 0) + 1
    if not freq: return ""
    return max(freq, key=freq.get) + " major"

# ──────────────────────────────────────
# ffmpegで圧縮
# ──────────────────────────────────────
def compress_audio(input_path, ffmpeg_path=None):
    """MP3をモノラル・64kbpsに圧縮して一時ファイルを返す"""
    # ffmpegを探す
    candidates = [
        ffmpeg_path,
        "ffmpeg",
        r"C:\tools\yt-dlp\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    ffmpeg = None
    for c in candidates:
        if not c: continue
        try:
            result = subprocess.run([c, "-version"],
                capture_output=True, timeout=5)
            if result.returncode == 0:
                ffmpeg = c
                break
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    if not ffmpeg:
        print("⚠️  ffmpegが見つかりません。圧縮なしで送信します。")
        return input_path, False

    suffix = os.path.splitext(input_path)[1] or ".mp3"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.close()

    cmd = [ffmpeg, "-y", "-i", input_path,
           "-ar", "22050", "-ac", "1", "-b:a", "64k",
           tmp.name]
    print(f"🔧 ffmpegで圧縮中...")
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        print("⚠️  圧縮失敗。元ファイルで送信します。")
        os.unlink(tmp.name)
        return input_path, False

    orig_mb = os.path.getsize(input_path) / 1024 / 1024
    comp_mb = os.path.getsize(tmp.name)   / 1024 / 1024
    print(f"   {orig_mb:.1f}MB → {comp_mb:.1f}MB に圧縮しました")
    return tmp.name, True

# ──────────────────────────────────────
# API送信
# ──────────────────────────────────────
def send_to_chordmini(audio_path):
    """コード認識APIに送信してレスポンスを返す"""
    file_size_mb = os.path.getsize(audio_path) / 1024 / 1024
    print(f"📤 送信中: {os.path.basename(audio_path)} ({file_size_mb:.1f}MB)")
    print(f"   送信先: {BACKEND_URL}/api/recognize-chords")
    print(f"   モデル: chord-cnn-lstm")

    with open(audio_path, "rb") as f:
        files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
        data  = {"model": "chord-cnn-lstm"}
        try:
            resp = requests.post(
                f"{BACKEND_URL}/api/recognize-chords",
                headers=HEADERS,
                files=files,
                data=data,
                timeout=300,  # 5分タイムアウト
            )
        except requests.exceptions.ConnectionError:
            print("\n❌ 接続エラー: APIサーバーに到達できません")
            print("   chordmini.me のサーバーが停止している可能性があります")
            print("   → ブラウザで chordmini.me/analyze を開いて手動で解析してください")
            sys.exit(1)
        except requests.exceptions.Timeout:
            print("\n❌ タイムアウト: 解析に時間がかかりすぎています")
            print("   ファイルサイズが大きい場合は --compress オプションを試してください")
            sys.exit(1)

    if resp.status_code == 413:
        print(f"\n❌ ファイルサイズエラー (413): {file_size_mb:.1f}MB は大きすぎます")
        print("   --compress オプションを付けて再実行してください:")
        print(f"   python chordmini_fetch.py \"{audio_path}\" --compress")
        sys.exit(1)
    elif resp.status_code == 429:
        print(f"\n❌ レート制限 (429): 短時間に送りすぎました。2分後に再試行してください")
        sys.exit(1)
    elif resp.status_code != 200:
        print(f"\n❌ APIエラー: HTTP {resp.status_code}")
        print(f"   {resp.text[:300]}")
        sys.exit(1)

    return resp.json()

def send_beat_detect(audio_path):
    """ビート検出APIに送信（失敗しても続行）"""
    try:
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
            resp = requests.post(
                f"{BACKEND_URL}/api/detect-beats",
                headers=HEADERS,
                files=files,
                data={"model": "madmom"},
                timeout=300,
            )
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return None

# ──────────────────────────────────────
# JSON変換
# ──────────────────────────────────────
def convert_to_player_json(chord_resp, beat_resp, filename):
    """chord_player.html 用の内部形式に変換"""
    raw = chord_resp.get("chords", [])
    chords, times = [], []
    prev = None

    for item in raw:
        ch = normalize_chord(item.get("chord", item.get("label", "")))
        # start/time どちらにも対応
        t  = round(float(item.get("start", item.get("time", 0))), 3)
        if ch != prev:
            chords.append(ch)
            times.append(t)
            prev = ch

    return {
        "file":     filename,
        "duration": round(float(chord_resp.get("duration", 0)), 2),
        "tempo":    round(float(beat_resp.get("bpm", 0)), 1) if beat_resp else 0,
        "key":      chord_resp.get("key", "") or estimate_key(chords),
        "chords":   chords,
        "times":    times,
        "model":    chord_resp.get("model_name", "Chord-CNN-LSTM"),
        "source":   "ChordMini (自動取得)",
        # 元データも保持（参照用）
        "_raw_total_chords": chord_resp.get("total_chords", len(raw)),
        "_raw_processing_time": chord_resp.get("processing_time", 0),
    }

# ──────────────────────────────────────
# メイン
# ──────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="chordmini.me にMP3を送信してJSONを自動保存",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python chordmini_fetch.py 曲.mp3
  python chordmini_fetch.py 曲.mp3 --compress
  python chordmini_fetch.py 曲.mp3 --output 結果.json --compress
  python chordmini_fetch.py 曲.mp3 --ffmpeg C:\\tools\\yt-dlp\\ffmpeg.exe
        """
    )
    parser.add_argument("audio",     help="音声ファイル (mp3/wav/flac等)")
    parser.add_argument("--output",  "-o", default="",
                        help="出力JSONファイル名（省略時: 曲名_chords.json）")
    parser.add_argument("--compress","-c", action="store_true",
                        help="ffmpegで圧縮してから送信（大きいファイル向け）")
    parser.add_argument("--ffmpeg",  "-f", default="",
                        help="ffmpeg.exeのフルパス（自動検出できない場合）")
    parser.add_argument("--beats",   "-b", action="store_true",
                        help="ビート検出も実行する（追加で時間がかかります）")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"エラー: ファイルが見つかりません: {args.audio}")
        sys.exit(1)

    audio_path = args.audio
    tmp_created = False

    # 圧縮
    if args.compress:
        audio_path, tmp_created = compress_audio(args.audio, args.ffmpeg or None)

    print(f"\n🎵 ChordMini 自動解析")
    print(f"   ファイル: {os.path.basename(args.audio)}")
    print()

    # コード解析
    start = time.time()
    chord_resp = send_to_chordmini(audio_path)
    elapsed = time.time() - start
    print(f"   ✅ コード解析完了 ({elapsed:.0f}秒)")

    # ビート解析（オプション）
    beat_resp = None
    if args.beats:
        print("🥁 ビート検出中...")
        beat_resp = send_beat_detect(audio_path)
        if beat_resp:
            print(f"   ✅ ビート検出完了: {beat_resp.get('bpm', 0):.1f} BPM")

    # 一時ファイル削除
    if tmp_created and audio_path != args.audio:
        os.unlink(audio_path)

    # 変換・保存
    result = convert_to_player_json(chord_resp, beat_resp, os.path.basename(args.audio))
    out = args.output or os.path.splitext(args.audio)[0] + "_chords.json"

    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*45}")
    print(f"✅ 保存完了: {out}")
    print(f"   推定キー: {result['key']}")
    print(f"   コード数: {len(result['chords'])}")
    print(f"   曲の長さ: {int(result['duration']//60)}:{int(result['duration']%60):02d}")
    print(f"   テンポ:   {result['tempo']} BPM" if result['tempo'] else "   テンポ:   不明（--beats で取得可能）")
    print(f"{'='*45}")
    print(f"\nchord_player.html の「JSON/CSV」ボタンで {os.path.basename(out)} を読み込んでください")


if __name__ == "__main__":
    main()
