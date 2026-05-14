#!/usr/bin/env python3
"""
ChordAnalyzer - ギター練習用コード解析ツール
使い方: python analyze.py <音声ファイル> [--output output.json]
"""

import sys
import json
import argparse
import numpy as np

def analyze_chords(audio_path, hop_duration=0.5):
    """音声ファイルからコード進行を解析する"""
    try:
        import librosa
    except ImportError:
        print("エラー: librosaがインストールされていません")
        print("以下のコマンドでインストールしてください:")
        print("  pip install librosa")
        sys.exit(1)

    print(f"読み込み中: {audio_path}")
    
    # 音声読み込み（モノラル、22050Hz）
    try:
        y, sr = librosa.load(audio_path, mono=True)
    except Exception as e:
        print(f"エラー: ファイルを読み込めませんでした: {e}")
        sys.exit(1)

    duration = librosa.get_duration(y=y, sr=sr)
    print(f"曲の長さ: {duration:.1f}秒")
    print("コード解析中...")

    # --- ビートトラッキング ---
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    if hasattr(tempo, '__len__'):
        tempo = float(tempo[0])
    else:
        tempo = float(tempo)

    # --- クロマグラム（コード推定の基礎）---
    hop_length = int(sr * hop_duration)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length, bins_per_octave=36)

    # --- コードテンプレートマッチング ---
    chord_labels, chord_times = estimate_chords(chroma, sr, hop_length, duration)

    # --- 調性推定 ---
    key = estimate_key(y, sr)

    result = {
        "file": audio_path,
        "duration": round(duration, 2),
        "tempo": round(tempo, 1),
        "key": key,
        "chords": chord_labels,
        "times": chord_times,
        "beat_times": beat_times.tolist()
    }

    return result


def estimate_chords(chroma, sr, hop_length, duration):
    """クロマ特徴量からコードを推定"""
    
    # 12音のノート名
    NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # コードテンプレート（クロマベクトル）
    # メジャー: 1,0,0,0,1,0,0,1,0,0,0,0
    # マイナー: 1,0,0,1,0,0,0,1,0,0,0,0
    # 7th:     1,0,0,0,1,0,0,1,0,0,1,0
    # m7:      1,0,0,1,0,0,0,1,0,0,1,0
    
    TEMPLATES = {}
    for i, root in enumerate(NOTE_NAMES):
        # メジャー
        t = np.zeros(12)
        t[i % 12] = 1; t[(i+4) % 12] = 1; t[(i+7) % 12] = 1
        TEMPLATES[root] = t
        # マイナー
        t = np.zeros(12)
        t[i % 12] = 1; t[(i+3) % 12] = 1; t[(i+7) % 12] = 1
        TEMPLATES[root + 'm'] = t
        # 7th
        t = np.zeros(12)
        t[i % 12] = 1; t[(i+4) % 12] = 1; t[(i+7) % 12] = 1; t[(i+10) % 12] = 0.8
        TEMPLATES[root + '7'] = t
        # マイナー7th
        t = np.zeros(12)
        t[i % 12] = 1; t[(i+3) % 12] = 1; t[(i+7) % 12] = 1; t[(i+10) % 12] = 0.8
        TEMPLATES[root + 'm7'] = t
        # sus4
        t = np.zeros(12)
        t[i % 12] = 1; t[(i+5) % 12] = 1; t[(i+7) % 12] = 1
        TEMPLATES[root + 'sus4'] = t

    chord_times = []
    chord_labels = []
    prev_chord = None
    
    n_frames = chroma.shape[1]
    
    for frame_idx in range(n_frames):
        chroma_vec = chroma[:, frame_idx]
        
        # ノルム正規化
        norm = np.linalg.norm(chroma_vec)
        if norm < 0.01:
            chord = 'N'  # 無音
        else:
            chroma_norm = chroma_vec / norm
            
            # テンプレートとのコサイン類似度
            best_chord = 'N'
            best_score = -1
            for chord_name, template in TEMPLATES.items():
                score = np.dot(chroma_norm, template / np.linalg.norm(template))
                if score > best_score:
                    best_score = score
                    best_chord = chord_name
            
            chord = best_chord if best_score > 0.5 else 'N'
        
        time = frame_idx * hop_length / sr
        
        # 連続する同じコードはまとめる
        if chord != prev_chord:
            chord_times.append(round(time, 2))
            chord_labels.append(chord)
            prev_chord = chord

    return chord_labels, chord_times


def estimate_key(y, sr):
    """楽曲の調性（キー）を推定"""
    import librosa
    
    NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    # クロマ全体の平均
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    
    # Krumhansl-Kesslerプロファイル
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                               2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                               2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    
    best_key = 'C'
    best_score = -999
    
    for i in range(12):
        # メジャー
        rotated = np.roll(chroma_mean, -i)
        score = np.corrcoef(rotated, major_profile)[0, 1]
        if score > best_score:
            best_score = score
            best_key = NOTE_NAMES[i] + ' major'
        # マイナー
        score = np.corrcoef(rotated, minor_profile)[0, 1]
        if score > best_score:
            best_score = score
            best_key = NOTE_NAMES[i] + ' minor'
    
    return best_key


def main():
    parser = argparse.ArgumentParser(
        description='音声ファイルからコード進行を解析します',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
  python analyze.py song.mp3
  python analyze.py song.mp3 --output result.json
  python analyze.py song.wav --hop 1.0
        """
    )
    parser.add_argument('audio', help='解析する音声ファイル (mp3, wav, flac, m4a等)')
    parser.add_argument('--output', '-o', default='chord_data.json',
                        help='出力JSONファイル名 (デフォルト: chord_data.json)')
    parser.add_argument('--hop', type=float, default=0.5,
                        help='コード検出間隔（秒） (デフォルト: 0.5)')
    
    args = parser.parse_args()
    
    result = analyze_chords(args.audio, hop_duration=args.hop)
    
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 解析完了!")
    print(f"   推定キー: {result['key']}")
    print(f"   テンポ:   {result['tempo']} BPM")
    print(f"   コード数: {len(result['chords'])}")
    print(f"   出力先:   {args.output}")
    print(f"\n次のステップ:")
    print(f"  chord_player.html をブラウザで開き、{args.output} を読み込んでください")


if __name__ == '__main__':
    main()
