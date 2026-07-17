# 引き継ぎ: Phase41完了 — Chart Mode + Normalize System

## 作業状態
- ブランチ: phase41-step1（継続）
- 直前作業: Phase41完了（Step1〜Step5全完了）

---

## Phase41 の成果

### 完了したもの

| Step | 内容 | ファイル |
|---|---|---|
| Step1 | chordmini_fetch.py に analysis.raw 追加 | tools/chordmini_fetch.py |
| Step1+ | batch_fetch.ps1 新設・GUI修正 | tools/ |
| Step2 | analysisLoader.js 新設 | js/analysisLoader.js |
| Step3 | Chart Mode UI | js/chartmode.js / js/timing.js / index.html / css/components.css |
| Step4 | project.js 永続化（raw-only serialize） | js/project.js |
| Step5 | コード名正規化システム | js/analysisLoader.js / resource/analysis/replacementMap.json |

---

## 確定した設計

### project.analysis 構造

```js
project.analysis = {
  raw: { ... },          // [RAW-READONLY] serialize 用・不変
  bpm,
  timeSignature,         // { numerator, denominator }
  beats,                 // number[]（sanitize済み）
  downbeats,             // number[]（sanitize済み）
  chords,                // normalize済み（replacementMap適用後）
  meta,
}
```

### normalize pipeline（analysisLoader.js）

```
raw.chords
  ↓ sanitizeChords()     入力整形（null除去・数値補正）
  ↓ normalizeChordName() 意味変換（replacementMap適用）
  ↓ analysis.chords      UI/timing/chartが参照

raw は不変。normalizeルール変更時も raw から再生成可能。
```

### replacementMap（resource/analysis/replacementMap.json）

- 140件（元データ100件 + エンハーモニック自動補完40件）
- exact string replacement のみ（regex は将来）
- A#系とBb/Db/Eb/Gb/Ab系の両方を収録
- fetchReplacementMap() でlazy fetch・module-level cache

### Chart Mode（js/chartmode.js / js/timing.js）

```
project.analysis
  ↓ createTimingModel()   beats/downbeats → TimingModel
  ↓ buildGridViewModel()  onset-only GridViewModel
  ↓ expandCarryForward()  render時のみ（保存禁止）
  ↓ renderChartMode()     DOM描画
```

**重要設計方針:**
- onset-only canonical（carry-forward はrender時のみ）
- インデックスは全0-based（UI表示時のみ+1）
- Chart Mode は projection layer（editor state を mutation しない）
- measure highlight のみ実装（slot highlight は将来）

### TimingModel 動作モード

| mode | 条件 | 動作 |
|---|---|---|
| `"full"` | downbeats正常（2以上）・beats正常（3以上） | 小節グリッド全有効 |
| `"beat-only"` | beats正常・downbeats不安定 | 拍子情報から小節推定 |
| `"fallback"` | beats不安定 | コード列均等表示のみ |

### project.js serialize（raw-only）

```js
// serializeProject
analysis: project.analysis?.raw
  ? { raw: project.analysis.raw }
  : null,

// deserializeProject
analysis: data.analysis?.raw
  ? { raw: data.analysis.raw }
  : null,

// loadProj（app.js）
project.analysis = await loadAnalysis(newProject.analysis ?? null);
```

---

## 新規ファイル

```
js/timing.js
  - createTimingModel()
  - mode判定（full / beat-only / fallback）
  - quantize()（nearest + anticipationWindow）
  - getMeasure()
  - 外部依存ゼロ

js/chartmode.js
  - buildGridViewModel()
  - resolveCollision()
  - expandCarryForward()
  - initChartMode() / openChartMode() / closeChartMode()
  - renderChartMode()
  - updateChartPlayback()（measure highlight）

resource/analysis/replacementMap.json
  - 140件の chord name 置換辞書
```

---

## 変更ファイル

```
js/analysisLoader.js
  - loadAnalysis() に raw を追加（戻り値）
  - loadAnalysis() async化
  - fetchReplacementMap() 追加
  - normalizeChordName() 追加（sanitize と分離）

js/project.js
  - serializeProject(): analysis raw-only 保存
  - deserializeProject(): analysis raw-only 復元

js/app.js
  - loadChordData() async化
  - loadProj() に await loadAnalysis() 追加
  - initChartMode() 追加（DOMContentLoaded内）
  - Chart Mode ボタンイベント追加
  - timeupdate に updateChartPlayback 追加

index.html
  - #btn-chart-mode ボタン追加
  - #chart-overlay DOM追加

css/components.css
  - Chart Mode CSS追加
```

---

## バックログ（次回棚卸し時に current-issues.md へ反映）

### analysis persistence redesign
状態: 要検討
内容: analysis.raw を project.json に埋め込む現設計は
      曲データ肥大化・git diff 汚染・autosave 負荷の問題がある。
方向性:
  - analysis を別ファイルとして外部化
  - project には source ファイル名・version のみ保存
  - derived data と編集データの分離
優先度: normalize system 整備後に再設計

### Chart Mode 再生バー
状態: 未着手
内容: Chart Mode に mini transport（▶ + シークバー）を追加
      現在はメイン画面で再生してから開く必要がある
方向性: floating mini transport として軽量実装

### Chart Mode 歌詞同期
状態: 未着手
内容: onset に lyric fragment を追加
      [G] 君がいた のような表示
方向性: onset-only 構造に lyric を自然に拡張できる設計済み

### Chart Mode slot highlight
状態: 未着手
内容: 現在は measure 単位のみ。将来 slot 単位ハイライトへ。
備考: timing jitter の影響を受けやすいので安定確認後に実装

### replacementMap GUI編集機能
状態: 未着手
内容: 未知コード一覧から辞書を編集するUI
方向性:
  - unknown chord collection（normalize時に未知コードを収集）
  - 「→ 何に置換する？」の GUI
  - 半自動 normalize system へ発展

### replacementMap regex 対応
状態: 未着手
内容: exact match だけでなく正規表現による置換ルール追加
優先度: exact map で十分な間は不要

---

## 次フェーズ候補

直近優先度（高）:
- replacementMap の拡充（実曲でテストして不足分を追記）
- analysis persistence redesign（project.json 肥大化対策）

中期:
- Chart Mode 再生バー（mini transport）
- Chart Mode 歌詞同期
- unknown chord collection UI

---

## 運用ルール（変わらず）

- current-issues.md / phase-status.md / architecture.md / handover は
  5フェーズごとに棚卸し更新
- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
