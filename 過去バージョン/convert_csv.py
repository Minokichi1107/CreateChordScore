#!/usr/bin/env python3
"""
convert_csv.py - Sonic Visualiser / Chordino CSV → chord_player.html 用 JSON 変換

使い方:
  python convert_csv.py input.csv
  python convert_csv.py input.csv --output result.json
  python convert_csv.py input.csv --audio mysong.mp3  # 音声ファイル名を埋め込む
"""
import csv
import json
import argparse
import os
import re
import sys


def normalize_chord(raw: str) -> str:
    """
    Chordino のコード表記を chord_player.html 用に正規化する

    変換例:
      N       → N
      D       → D
      C#m7    → C#m7
      F#/C#   → F#/C#  （スラッシュコードはそのまま保持）
      Bb      → Bb
      E6      → E6
      D6      → D6
      Emaj7   → Emaj7
      Abm     → Abm
    """
    raw = raw.strip()
    if not raw or raw in ('N', 'X', 'n', 'x'):
        return 'N'
    return raw


def estimate_key(chords: list) -> str:
    """コード出現頻度から調性を簡易推定"""
    MAJOR_SCALE = {
        'C': ['C','Dm','Em','F','G','Am'],
        'G': ['G','Am','Bm','C','D','Em'],
        'D': ['D','Em','F#m','G','A','Bm'],
        'A': ['A','Bm','C#m','D','E','F#m'],
        'E': ['E','F#m','G#m','A','B','C#m'],
        'B': ['B','C#m','D#m','E','F#','G#m'],
        'F#': ['F#','G#m','A#m','B','C#','D#m'],
        'F': ['F','Gm','Am','Bb','C','Dm'],
        'Bb': ['Bb','Cm','Dm','Eb','F','Gm'],
        'Eb': ['Eb','Fm','Gm','Ab','Bb','Cm'],
        'Ab': ['Ab','Bbm','Cm','Db','Eb','Fm'],
    }
    freq = {}
    for c in chords:
        if c == 'N': continue
        root = c.split('/')[0]  # スラッシュコードのルートのみ
        # クオリティを除いてルートのみ
        m = re.match(r'^([A-G][b#]?)', root)
        if m:
            freq[m.group(1)] = freq.get(m.group(1), 0) + 1

    best_key, best_score = 'Unknown', -1
    for key, scale in MAJOR_SCALE.items():
        score = sum(freq.get(n, 0) for n in scale)
        if score > best_score:
            best_score, best_key = score, key + ' major'

    return best_key


def convert(csv_path: str, audio_name: str = '', duration_override: float = 0) -> dict:
    chords = []
    times  = []
    prev   = None

    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            try:
                t  = float(row[0].strip())
                ch = normalize_chord(row[1])
            except ValueError:
                continue

            # 連続する同じコードはまとめる
            if ch != prev:
                times.append(round(t, 3))
                chords.append(ch)
                prev = ch

    if not times:
        print('エラー: コードデータが見つかりませんでした')
        sys.exit(1)

    # 曲の総時間：最後のコード時刻 or 指定値
    duration = duration_override if duration_override > 0 else times[-1]

    key = estimate_key(chords)

    return {
        'file':     audio_name or os.path.basename(csv_path).replace('.csv', ''),
        'duration': round(duration, 3),
        'tempo':    0,        # Chordino はテンポ情報なし（後で手動入力可）
        'key':      key,
        'chords':   chords,
        'times':    times,
        'model':    'Chordino + NNLS Chroma (Sonic Visualiser)',
        'source':   'CSV変換'
    }


def main():
    parser = argparse.ArgumentParser(
        description='Sonic Visualiser / Chordino CSV → chord_player.html 用 JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python convert_csv.py song_chords.csv
  python convert_csv.py song_chords.csv --output song.json
  python convert_csv.py song_chords.csv --audio "my song.mp3" --duration 307.1
        """
    )
    parser.add_argument('csv',      help='Chordino が出力したCSVファイル')
    parser.add_argument('--output', '-o', default='',
                        help='出力JSONファイル名（省略時: CSVと同名.json）')
    parser.add_argument('--audio',  '-a', default='',
                        help='対応する音声ファイル名（表示用）')
    parser.add_argument('--duration', '-d', type=float, default=307.1,
                        help='曲の総時間（秒）デフォルト: 307.1')
    args = parser.parse_args()

    if not os.path.exists(args.csv):
        print(f'エラー: ファイルが見つかりません: {args.csv}')
        sys.exit(1)

    out = args.output or os.path.splitext(args.csv)[0] + '.json'
    data = convert(args.csv, args.audio, args.duration)

    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f'\n✅ 変換完了!')
    print(f'   入力CSV:  {args.csv}')
    print(f'   出力JSON: {out}')
    print(f'   推定キー: {data["key"]}')
    print(f'   コード数: {len(data["chords"])}')
    print(f'   曲の長さ: {int(data["duration"]//60)}:{int(data["duration"]%60):02d}')
    print(f'\nchord_player.html の「JSON」ボタンで {out} を読み込んでください')


if __name__ == '__main__':
    main()
