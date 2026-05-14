#!/usr/bin/env python3
"""
convert_csv_v3.py - Chordino CSV → ChordPlayer v3 用 JSON 変換
小節単位集約・次コード・歌詞対応

使い方:
  python convert_csv_v3.py song.csv
  python convert_csv_v3.py song.csv --bpm 120 --beats 4 --audio song.mp3
  python convert_csv_v3.py song.csv --lyrics lyrics.lrc
"""

import csv, json, re, argparse, os, sys
from typing import Optional


# ──────────────────────────────────────────
# コード正規化
# ──────────────────────────────────────────
def normalize_chord(raw: str) -> str:
    raw = raw.strip()
    if not raw or raw.upper() in ('N', 'X', 'N.C.'):
        return 'N'
    # コロン形式 (ChordMini API): "G:maj" → "G"
    QUAL_MAP = {
        'maj':'','min':'m','maj7':'maj7','min7':'m7',
        'dom7':'7','7':'7','dim':'dim','aug':'aug',
        'sus2':'sus2','sus4':'sus4','hdim7':'m7b5',
    }
    if ':' in raw:
        root, qual = raw.split(':', 1)
        return root + QUAL_MAP.get(qual, qual)
    return raw


# ──────────────────────────────────────────
# キー推定
# ──────────────────────────────────────────
def estimate_key(chords: list) -> str:
    freq = {}
    for c in chords:
        if c == 'N': continue
        m = re.match(r'^([A-G][b#]?)', c.split('/')[0])
        if m: freq[m.group(1)] = freq.get(m.group(1), 0) + 1
    if not freq: return ''
    return max(freq, key=freq.get) + ' major'


# ──────────────────────────────────────────
# CSV パース
# ──────────────────────────────────────────
def parse_chordino_csv(path: str) -> tuple:
    """(chords, times) を返す。連続する同コードはまとめる"""
    chords, times = [], []
    prev = None
    with open(path, newline='', encoding='utf-8-sig') as f:
        for row in csv.reader(f):
            if len(row) < 2: continue
            try:
                t  = float(row[0].strip())
                ch = normalize_chord(row[1])
            except ValueError:
                continue
            if ch != prev:
                times.append(round(t, 3))
                chords.append(ch)
                prev = ch
    return chords, times


# ──────────────────────────────────────────
# LRC 歌詞パース
# ──────────────────────────────────────────
def parse_lrc(path: str) -> list:
    """[(time_sec, lyric), ...] を返す"""
    result = []
    pattern = re.compile(r'\[(\d+):(\d+\.\d+)\](.*)')
    with open(path, encoding='utf-8-sig') as f:
        for line in f:
            m = pattern.match(line.strip())
            if m:
                t = int(m.group(1))*60 + float(m.group(2))
                result.append((round(t, 2), m.group(3).strip()))
    return sorted(result, key=lambda x: x[0])


# ──────────────────────────────────────────
# 小節集約
# ──────────────────────────────────────────
def build_measures(chords, times, duration, bpm, beats_per_measure):
    """
    小節単位に集約した配列を返す。
    各要素:
      {
        "measure": 1,
        "time":    0.0,
        "chord":   "G",
        "next":    "Em",    # 次の小節のコード
        "beats":   4,       # この小節の拍数
        "lyric":   ""       # 歌詞（後で付与）
      }
    """
    sec_per_beat    = 60.0 / bpm
    sec_per_measure = sec_per_beat * beats_per_measure
    total_measures  = int(duration / sec_per_measure) + 1
    measures = []

    for m in range(total_measures):
        m_start = m * sec_per_measure
        m_end   = m_start + sec_per_measure
        if m_start > duration: break

        # この小節の開始時刻に対応するコード
        chord = 'N'
        for i, t in enumerate(times):
            if t <= m_start + sec_per_measure * 0.05:
                chord = chords[i]
            else:
                break

        measures.append({
            'measure': m + 1,
            'time':    round(m_start, 3),
            'end':     round(min(m_end, duration), 3),
            'chord':   chord,
            'next':    '',     # 後で付与
            'beats':   beats_per_measure,
            'lyric':   '',
        })

    # 次コードを付与（異なるコードの最初のもの）
    for i, ms in enumerate(measures):
        for j in range(i+1, len(measures)):
            if measures[j]['chord'] != ms['chord'] and measures[j]['chord'] != 'N':
                ms['next'] = measures[j]['chord']
                break

    return measures


# ──────────────────────────────────────────
# 歌詞を小節に紐付け
# ──────────────────────────────────────────
def attach_lyrics(measures, lyrics):
    """lyrics = [(time, text), ...]"""
    if not lyrics: return
    for ms in measures:
        for t, text in lyrics:
            if ms['time'] <= t < ms['end']:
                ms['lyric'] = (ms['lyric'] + ' ' + text).strip()


# ──────────────────────────────────────────
# メイン出力フォーマット
# ──────────────────────────────────────────
def build_output(chords, times, measures, duration, bpm, beats,
                 filename, audio_name, model):
    return {
        'file':             audio_name or filename,
        'duration':         round(duration, 2),
        'tempo':            bpm,
        'beats_per_measure': beats,
        'key':              estimate_key(chords),
        'model':            model,
        'source':           'CSV変換 (Chordino+NNLS Chroma)',
        # フラットリスト（chord_player.html の再生同期に使用）
        'chords':           chords,
        'times':            times,
        # 小節単位（詳細表示・次コード・歌詞用）
        'measures':         measures,
    }


# ──────────────────────────────────────────
# サンプルJSON生成（ドキュメント用）
# ──────────────────────────────────────────
SAMPLE_JSON = {
    "file": "mysong.mp3",
    "duration": 307.1,
    "tempo": 126,
    "beats_per_measure": 4,
    "key": "A major",
    "model": "Chordino+NNLS Chroma",
    "source": "CSV変換",
    "chords": ["N","D","E","C#m7","F#m","E6","D"],
    "times":  [0.000, 2.368, 5.016, 7.477, 9.985, 11.331, 12.539],
    "measures": [
        {
            "measure": 1,
            "time":    0.000,
            "end":     1.905,
            "chord":   "N",
            "next":    "D",
            "beats":   4,
            "lyric":   ""
        },
        {
            "measure": 2,
            "time":    1.905,
            "end":     3.810,
            "chord":   "D",
            "next":    "E",
            "beats":   4,
            "lyric":   "愛してる"
        },
        {
            "measure": 3,
            "time":    3.810,
            "end":     5.714,
            "chord":   "E",
            "next":    "C#m7",
            "beats":   4,
            "lyric":   "君のそばに"
        },
        {
            "measure": 4,
            "time":    5.714,
            "end":     7.619,
            "chord":   "C#m7",
            "next":    "F#m",
            "beats":   4,
            "lyric":   ""
        }
    ]
}


# ──────────────────────────────────────────
# CLI
# ──────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description='Chordino CSV → ChordPlayer v3 JSON 変換',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  # 基本
  python convert_csv_v3.py song.csv

  # テンポ・拍子を指定
  python convert_csv_v3.py song.csv --bpm 120 --beats 4

  # 音声ファイル名と歌詞(.lrc)を付与
  python convert_csv_v3.py song.csv --audio song.mp3 --lyrics song.lrc

  # サンプルJSONを生成
  python convert_csv_v3.py --sample
        """
    )
    parser.add_argument('csv', nargs='?', help='Chordino CSVファイル')
    parser.add_argument('--output',   '-o', default='', help='出力JSONファイル名')
    parser.add_argument('--audio',    '-a', default='', help='音声ファイル名（表示用）')
    parser.add_argument('--bpm',      '-b', type=float, default=0,
                        help='テンポ（BPM）。0の場合は自動推定（粗め）')
    parser.add_argument('--beats',    '-t', type=int, default=4,
                        help='拍子（拍/小節）デフォルト: 4')
    parser.add_argument('--duration', '-d', type=float, default=0,
                        help='曲の長さ（秒）。省略時はCSVの最終タイムスタンプから推定')
    parser.add_argument('--lyrics',   '-l', default='', help='LRC歌詞ファイル')
    parser.add_argument('--sample',   action='store_true', help='サンプルJSONを生成して終了')
    args = parser.parse_args()

    # サンプル生成モード
    if args.sample:
        out = 'sample_chord_data.json'
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(SAMPLE_JSON, f, ensure_ascii=False, indent=2)
        print(f'✅ サンプルJSON生成: {out}')
        return

    if not args.csv:
        parser.print_help()
        sys.exit(1)

    if not os.path.exists(args.csv):
        print(f'エラー: ファイルが見つかりません: {args.csv}')
        sys.exit(1)

    print(f'📂 読み込み中: {args.csv}')
    chords, times = parse_chordino_csv(args.csv)
    print(f'   コード数: {len(chords)}')

    duration = args.duration or (times[-1] + 2 if times else 0)

    # BPM自動推定（粗め）
    bpm = args.bpm
    if bpm <= 0:
        # コード変化間隔の中央値から推定
        intervals = [times[i+1]-times[i] for i in range(min(len(times)-1,20))]
        if intervals:
            med = sorted(intervals)[len(intervals)//2]
            bpm = round(60.0 / med / args.beats * 4, 1)
            bpm = max(60, min(200, bpm))
        else:
            bpm = 120
        print(f'   テンポ自動推定: {bpm} BPM（不正確な場合は --bpm で指定してください）')

    measures = build_measures(chords, times, duration, bpm, args.beats)

    # 歌詞付与
    if args.lyrics and os.path.exists(args.lyrics):
        lyrics = parse_lrc(args.lyrics)
        attach_lyrics(measures, lyrics)
        print(f'   歌詞行数: {len(lyrics)}')

    result = build_output(
        chords, times, measures, duration, bpm, args.beats,
        args.csv, args.audio,
        'Chordino+NNLS Chroma (Sonic Visualiser)'
    )

    out = args.output or os.path.splitext(args.csv)[0] + '.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f'\n✅ 変換完了!')
    print(f'   出力JSON:  {out}')
    print(f'   推定キー:  {result["key"]}')
    print(f'   テンポ:    {bpm} BPM')
    print(f'   小節数:    {len(measures)}')
    print(f'   曲の長さ:  {int(duration//60)}:{int(duration%60):02d}')
    print(f'\nchord_player.html の「JSON/CSV」ボタンで {out} を読み込んでください')


if __name__ == '__main__':
    main()
