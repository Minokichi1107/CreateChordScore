# ChordPlayer v2 - JSONフォーマット仕様

---

## 内部JSONフォーマット（chord_player.html が読み込む形式）

```json
{
  "file": "mysong.mp3",
  "duration": 243.5,
  "tempo": 120.0,
  "key": "G major",
  "chords": ["G", "Em", "C", "D", "G", "Am", "D7", "G"],
  "times":  [0.00, 2.50, 5.00, 7.50, 10.00, 12.50, 15.00, 17.50],
  "model":  "chord-cnn-lstm",
  "source": "ChordMini API"
}
```

- `chords` … コード名の配列（同じコードが続く場合はまとめる）
- `times`  … 各コードの開始時刻（秒）、chordsと同じ長さ
- `tempo`  … BPM（0の場合は不明）
- `key`    … 推定キー（例: "G major", "A minor"）

---

## ChordMini API レスポンス形式

### POST /api/recognize-chords

```json
{
  "chords": [
    {"time": 0.0,  "chord": "G:maj"},
    {"time": 2.5,  "chord": "E:min"},
    {"time": 5.0,  "chord": "C:maj"},
    {"time": 7.5,  "chord": "D:maj"},
    {"time": 10.0, "chord": "N"}
  ],
  "duration": 243.5
}
```

コード表記（コロン形式）の変換ルール：
| API表記    | 変換後 | 意味             |
|------------|--------|------------------|
| G:maj      | G      | Gメジャー        |
| E:min      | Em     | Eマイナー        |
| C:maj7     | Cmaj7  | Cメジャー7th     |
| A:min7     | Am7    | Aマイナー7th     |
| D:dom7     | D7     | Dドミナント7th   |
| B:dim      | Bdim   | Bディミニッシュ  |
| F:aug      | Faug   | Fオーギュメント  |
| C:sus4     | Csus4  | Csus4            |
| N          | N      | 無音             |

### POST /api/detect-beats

```json
{
  "beats": [0.5, 1.0, 1.5, 2.0, 2.5],
  "downbeats": [0.5, 2.5],
  "bpm": 120.0
}
```

---

## Python変換スクリプト（APIレスポンス → 内部形式）

```python
import json, requests

def convert_api_to_player_json(chord_response, beats_response=None, filename=""):
    """
    ChordMini APIレスポンスをchord_player.html用JSONに変換
    """
    QUAL_MAP = {
        'maj': '', 'min': 'm', 'maj7': 'maj7', 'min7': 'm7',
        'dom7': '7', '7': '7', 'dim': 'dim', 'aug': 'aug',
        'sus2': 'sus2', 'sus4': 'sus4', 'hdim7': 'm7b5',
        'maj9': 'maj9', 'min9': 'm9', 'add9': 'add9',
    }

    def normalize(raw):
        if not raw or raw in ('N', 'X'): return 'N'
        if ':' in raw:
            root, qual = raw.split(':', 1)
            return root + QUAL_MAP.get(qual, qual)
        return raw

    raw = chord_response.get('chords', [])
    chords, times = [], []
    prev = None

    for item in raw:
        ch = normalize(item.get('chord', item.get('label', '')))
        t  = round(float(item.get('time', item.get('start', 0))), 2)
        if ch != prev:
            chords.append(ch)
            times.append(t)
            prev = ch

    return {
        "file":     filename,
        "duration": round(float(chord_response.get('duration', 0)), 2),
        "tempo":    round(float(beats_response.get('bpm', 0)), 1) if beats_response else 0,
        "key":      chord_response.get('key', ''),
        "chords":   chords,
        "times":    times,
        "model":    "chord-cnn-lstm",
        "source":   "ChordMini API"
    }


def analyze_with_api(audio_path, output_json="chord_data.json"):
    """
    音声ファイルをChordMini APIで解析してJSONを保存
    ※ ローカルにAPIサーバーが動いている場合
    """
    API_BASE = "http://localhost:5001"
    # リモートの場合:
    # API_BASE = "https://chordmini-backend-191567167632.us-central1.run.app"

    with open(audio_path, 'rb') as f:
        audio_bytes = f.read()

    # コード認識
    print("コード解析中...")
    chord_resp = requests.post(
        f"{API_BASE}/api/recognize-chords",
        files={"file": (audio_path, audio_bytes)},
        data={"model": "chord-cnn-lstm"}
    ).json()

    # ビート検出
    print("ビート検出中...")
    try:
        beats_resp = requests.post(
            f"{API_BASE}/api/detect-beats",
            files={"file": (audio_path, audio_bytes)},
            data={"model": "madmom"}
        ).json()
    except Exception:
        beats_resp = None

    result = convert_api_to_player_json(chord_resp, beats_resp, audio_path)

    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 保存: {output_json}")
    print(f"   コード数: {len(result['chords'])}")
    print(f"   テンポ: {result['tempo']} BPM")
    return result


if __name__ == "__main__":
    import sys
    analyze_with_api(sys.argv[1], sys.argv[2] if len(sys.argv)>2 else "chord_data.json")
```

---

## 使い方まとめ

### ブラウザUIから（推奨）
1. `chord_player.html` を開く
2. 「音声」ボタンで音楽ファイルを選ぶ
3. 「⚡ API解析」ボタン → 自動でChordMini APIに送信・JSONも自動保存
4. PLAY！

### ローカルAPIサーバー（ChordMiniApp）が動いている場合
- `chord_player.html` 内の `API_BASE` を `http://localhost:5001` に変更するだけ

### analyze.pyを使う場合（大容量ファイル）
```
python analyze.py 曲.mp3
```
→ `chord_data.json` を「JSON」ボタンで読み込む
