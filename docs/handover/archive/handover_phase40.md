# handover_phase40.md

````markdown
# 引き継ぎ: Phase40完了 — Chart Mode 設計フェーズ

## 作業状態
- ブランチ: phase38（継続）
- 直前作業: Phase40完了（Issue #26 設計フェーズ・全設計確定）

---

## Phase40 の成果

### 設計したもの（実装は Phase41 以降）

| 対象 | 内容 |
|---|---|
| project.analysis | analysis.raw のデータ構造確定 |
| analysisLoader.js | 新規モジュール・責務・API確定 |
| timing.js | 新規モジュール・API確定 |
| chartmode.js | 新規モジュール・GridViewModel確定 |
| Chart Mode UI | レイアウト・動作モード確定 |
| chordmini_fetch.py | 改修方針確定 |

---

## 確定した設計

### 1. project.analysis.raw（保存対象・immutable）

```js
project.analysis = {
  raw: {  // [RAW-READONLY] 書き換え禁止。analysisLoader.js のみ生成可
    chords: [
      { chord: "G:maj", start: 41.33, end: 42.77 }
    ],
    beats:     [0.38, 0.76, 1.14, ...],
    downbeats: [0.38, 1.90, 3.42, ...],
    timeSignature: {
      numerator:   4,
      denominator: 4
    },
    bpm: 120,
    meta: {
      detector:    "madmom",
      model:       "madmom",
      source:      "chordmini",
      generatedAt: "2026-05-23T..."
    }
  }
  // derived は保存しない（render時生成）
}
```

**immutable 規約:**
- `Object.freeze` は shallow のため技術的封鎖には不十分
- 「raw を mutate しない規約」＋ derived 完全分離で対応
- `// [RAW-READONLY]` コメントをコードレビューのチェックポイントとする

---

### 2. TimingModel 動作モード

| mode | 条件 | 動作 |
|---|---|---|
| `"full"` | downbeats正常・beats正常 | 小節グリッド・再生同期・quantize 全有効 |
| `"beat-only"` | beats正常・downbeats不安定 | `timeSignature.numerator` 拍で小節推定 |
| `"fallback"` | beats も不安定 | timing semantic を諦める。コード列均等表示のみ |

**beat-only の注意:**
- `"4/4固定"` ではなく `beatsPerMeasure = timeSignature.numerator` を使う
- downbeat なしで拍子情報のみ使う

**fallback の定義:**
- 均等割りで強引にグリッド生成しない（「それっぽいが嘘」になる）
- timing semantic を諦め・小節線なし・sync なし
- ヘッダーに「タイミング解析不可」を明示

---

### 3. timing.js API（確定）

```js
// 生成
const model = createTimingModel({
  beats,
  downbeats,
  timeSignature:      { numerator: 4, denominator: 4 },
  resolutionPerBeat:  2,           // display resolution（将来分離予定）
  quantizeMode:       "nearest",   // "nearest" | "floor" | "ceil"
  anticipationWindow: 0.5,         // スロット幅の何倍まで先読みするか
  audioDuration:      243.5        // 最終小節 endTime 計算用
});

// プロパティ
model.mode          // "full" | "beat-only" | "fallback"
model.measureCount  // detector quality 依存（注意点あり・後述）

// メソッド
model.quantize(41.33)
// → { measure:12, beat:1, slot:0, confidence:"high" | "low" }

model.getMeasure(12)
// → { startTime:41.28, endTime:42.80, beatCount:4,
//     confidence:"high" | "low" | "estimated" }
```

**measureCount の注意:**
- `downbeats.length` ベースだが detector 品質依存
- detector が最終小節開始を検出できない場合に欠ける
- 将来: `inferredMeasureCountFromDuration()` で補完予定
- 現段階: 「measureCount は detector quality に依存する」認識で実装

**スロット構造（4/4・8分グリッド）:**
```
1小節 = 8スロット（resolutionPerBeat=2 × beatsPerMeasure=4）

beat 0 → slot 0（4分頭）, slot 1（8分裏）
beat 1 → slot 2, slot 3
beat 2 → slot 4, slot 5
beat 3 → slot 6, slot 7
```

**quantize の吸着仕様:**
```
基本: nearest（最近傍）
anticipation guard:
  コード開始が次 beat より anticipationWindow スロット分 早い場合
  → 次 beat の slot 0 に吸着
```

**6/8 注記:**
```js
// [FIXME-6/8] 6/8 は numerator=6 として扱っているが
// 音楽的には2拍系(3+3)。将来 metricalStructure 導入時に修正。
```

**timing.js の依存:**
- 外部依存ゼロ（import なし）
- chartmode.js のみが import する
- UI・DOM・project構造に一切触らない

---

### 4. GridViewModel（保存しない・render時生成）

```js
{
  measures: [
    {
      index: 0,
      startTime: 0.38,
      confidence: "high",       // measure confidence
      slots: [
        {
          slotIndex: 0,
          onsets: [             // 配列（collision対応）
            {
              chord:      "G",
              time:       0.38,
              duration:   1.44, // chord.end - chord.start
              confidence: "high"
            }
          ]
        },
        {
          slotIndex: 4,
          onsets: [
            { chord:"Dm7", time:0.76, duration:0.92, confidence:"high" }
          ]
        }
        // onset なし slot は記録しない（onset-only）
      ]
    }
  ]
}
```

**onset-only 規約:**
- 全スロットに chord を埋めない
- carry-forward（継続補完）は render 時のみ行う
- `expandCarryForward()` をキャッシュしない（derived cache への保存禁止）

**collision 解決（render時）:**
```
優先順位:
  1. confidence が高い方
  2. duration が長い方（短時間ノイズ排除）
  3. time が遅い方（後勝ち）
```

---

### 5. analysisLoader.js（新規）

**責務:**
- ChordMini解析JSON → analysis.raw への変換
- validate + normalize（csvImporter.js とは完全分離）

**返り値:**
```js
// 成功
{
  ok: true,
  data: { chords, beats, downbeats, timeSignature, bpm, meta },
  warnings: ["downbeats が不安定です（beat-only モードで動作）"]
}

// 失敗
{
  ok: false,
  errors: ["chords フィールドが見つかりません"]
}
```

**validate 内容:**
- 必須: `chords[]` 存在・各要素に `chord/start/end`
- 警告: beats/downbeats が null または空 → mode 降格
- 正規化: `timeSignature "4/4"` → `{ numerator:4, denominator:4 }`
- chord 名の正規化はここではやらない（timing/chord semantic 分離）

---

### 6. Chart Mode UI

**レイアウト:**
```
ヘッダー: 曲名・BPM・拍子・mode警告
再生バー: 既存 aEl と共有
グリッド: 4小節/行 × 8スロット
```

**mode 別表示:**
```
full:       小節グリッド + quantize + playback sync
beat-only:  小節線は推定。ヘッダー「小節線は推定です」
fallback:   コード列均等表示。ヘッダー「タイミング解析不可」
```

**Perform Mode との境界:**
```
Chart Mode が参照するもの: project.analysis.raw・aEl（音声）
Chart Mode が触らないもの: project.lines・editor.js・perform.js 等
```

---

### 7. モジュール追加計画

**新規作成:**
```
js/timing.js          TimingModel（UI依存ゼロ・外部依存ゼロ）
js/chartmode.js       GridViewModel生成 + Chart Mode UI
js/analysisLoader.js  ChordMini JSON → analysis.raw
```

**既存ファイルへの最小変更:**
```
project.js    analysis.raw の serialize/deserialize 追加
app.js        Chart Mode 開閉・initChartMode 追加
index.html    Chart Mode ボタン・オーバーレイDOM 追加
```

**変更しないファイル:**
```
editor.js / perform.js / tapmode.js / replace.js
tokens.js / chordEntry.js / modals.js / audio.js
chords.js / idb.js / csvImporter.js
```

---

### 8. chordmini_fetch.py 改修方針

**現在の出力（推定）:**
```json
{ "chords": [{ "chord":"G:maj", "start":41.33, "end":42.77 }] }
```

**改修後の出力:**
```json
{
  "chords":    [{ "chord":"G:maj", "start":41.33, "end":42.77 }],
  "beats":     [0.38, 0.76, 1.14],
  "downbeats": [0.38, 1.90, 3.42],
  "timeSignature": "4/4",
  "bpm":       120,
  "_source":   "chordmini",
  "_version":  1,
  "meta": {
    "detector":    "madmom",
    "model":       "madmom",
    "generatedAt": "2026-05-23T..."
  }
}
```

**将来（ChordScore内API直接呼び出し）:**
```
ChordScore内「解析」ボタン
  ↓
/api/recognize-chords-offload
/api/detect-beats-offload
  ↓
同じ analysis.raw へ格納
→ Chart Mode の動作は変わらない
```

---

## 全禁止事項（確定）

```
analysis.raw を書き換える                              → NG（immutable規約）
GridViewModel を project に保存する                    → NG
全スロットに chord を埋める                            → NG（onset-only）
onset を単一値で持つ                                   → NG（配列で持つ）
carry-forward 結果をキャッシュする                     → NG（render時のみ）
timeSignature を文字列のまま内部処理する               → NG（構造化）
beat-only mode で 4/4 を固定仮定する                   → NG（拍子情報を使う）
fallback mode で均等グリッドを生成する                 → NG（timing諦める）
csvImporter.js に analysis 解析を入れる                → NG（分離済み）
Chart Mode が project.lines を変更する                 → NG
timing.js に UI・DOM・project 依存を入れる             → NG
既存 editor/perform/tap/replace を変更する             → NG
resolutionPerBeat を「唯一絶対の解像度」と固定する     → NG（将来分離予定）
```

---

## Phase41 実装チェックリスト

```
Step 1: chordmini_fetch.py 改修
  □ beats[] 出力追加（/api/detect-beats-offload 呼び出し）
  □ downbeats[] 出力追加
  □ meta（detector/model/generatedAt）追加
  □ bpm 出力追加
  □ timeSignature 出力追加

Step 2: analysisLoader.js 新規作成
  □ loadAnalysis(jsonText) → { ok, data, warnings } | { ok, errors }
  □ validate（chords必須・各要素チェック）
  □ normalize（timeSignature 文字列 → 構造体）
  □ warnings（beats/downbeats 欠損時）
  □ [RAW-READONLY] コメント規約

Step 3: timing.js 新規作成
  □ createTimingModel({ beats, downbeats, timeSignature,
                        resolutionPerBeat, quantizeMode,
                        anticipationWindow, audioDuration })
  □ mode 自動判定（full / beat-only / fallback）
  □ beat-only は timeSignature.numerator を使う（4/4固定禁止）
  □ quantize（nearest + anticipationWindow）
  □ getMeasure（最終小節 endTime = audioDuration）
  □ measureCount = downbeats.length（detector依存を認識の上）
  □ [FIXME-6/8] コメント追加
  □ UI依存ゼロ・外部 import ゼロ 確認

Step 4: project.js 拡張
  □ analysis.raw の serialize（derived は含まない）
  □ analysis.raw の deserialize
  □ analysis が null の場合の backward compatibility

Step 5: chartmode.js + index.html
  □ buildGridViewModel（onset-only・collision対応）
  □ collision解決（confidence → duration → time）
  □ carry-forward（render時のみ・キャッシュ禁止）
  □ mode別表示（full / beat-only / fallback）
  □ Chart Mode ヘッダー（mode・BPM・拍子表示）
  □ 4小節 × 8スロット グリッド
  □ 独立ボタンから開く（Perform Mode とは別）
```

---

## 次フェーズ開始手順

**Step 1 から開始。`chordmini_fetch.py` の現在のコードを貼ること。**

改修内容:
- `/api/detect-beats-offload` の呼び出し追加
- beats / downbeats / meta / bpm / timeSignature を JSON 出力に追加

---

## ドキュメント更新（次回棚卸し時）

- phase-status.md に Phase40 完了を追記
- architecture.md に timing.js / chartmode.js / analysisLoader.js を追記
- current-issues.md の Issue #26 を「設計完了・実装待ち」に更新
````