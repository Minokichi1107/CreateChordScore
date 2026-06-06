# 引き継ぎ: Phase59完了 — timing stabilization infrastructure + timing failure taxonomy

## 作業状態

* ブランチ: main
* commit 予定: `feat: Phase59 timing stabilization infrastructure`

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `analyzeTiming()` 追加 | beats/downbeatsの統計診断。副作用なし。repair ON/OFF問わず常に実行 | js/timing.js |
| `repairDownbeats()` 追加 | continuity-aware downbeat repair（experimental）。default OFF | js/timing.js |
| `buildNormalizedTimingAnalysis()` 追加 | 全consumerの入口。pure function。DOM/global stateに触らない | js/timing.js |
| `buildGridViewModel()` 変更 | rawAnalysisを直接createTimingModel()に渡さず、normalized pipeline経由に変更 | js/chartmode.js |
| `window.__TIMING_DEBUG__` 書き込み | diagnostics / repair / normalized を常に保持。DevTools確認用 | js/chartmode.js |
| measure DOM data属性追加 | `data-confidence` / `data-repair-state` を全measureに付与 | js/chartmode.js |
| 診断オーバーレイCSSクラス追加 | `.chart-measure--drift-repaired`（黄枠）/ `.chart-measure--drift-rejected`（赤枠） | css/components.css |
| ヘッダーコメント修正 | Phase57 slot DOM invariantの古い「逆引き」記述を実態に合わせて修正 | js/chartmode.js |

---

## 確定した設計原則

### normalized timing pipeline（Phase59で確立）

```
raw analysis
    ↓
timing.js: buildNormalizedTimingAnalysis()   ← 全consumerの入口
    │                                           pure function
    ├─ analyzeTiming()    診断（常に実行）
    └─ repairDownbeats()  補正（repair: true 時のみ）
    ↓
normalized timing source { beats, downbeats, diagnostics, repair }
    ↓
chartmode.js: buildGridViewModel()
    ↓
createTimingModel()                           ← 消費者のまま（変更なし）
```

これにより将来の perform.js / click seek / waveform sync も同一 timing authority を参照できる。

### repair の設計思想

```
音楽的な「演奏の揺れ」（タメ・シンコペ・グルーヴ）は直さない。
madmom が明らかに道を踏み外した時だけそっと補助する。
「自信がないなら触るな」を基本方針とする。

continuity-aware:
  repair[n] の結果を expected[n+1] の計算に連鎖させる。
  各小節独立判定ではなく修正後の位置から次を推定する。

tolerance-based snap:
  |expected - nearestBeat| < beatInterval × 0.3 のみ吸着。
  超えたら repair rejected（元の downbeat を維持）。

local/global hybrid median:
  全体 median だけでは局所的なテンポ揺れを drift と誤認する。
  近傍 ±2 小節の local median と global median を 7:3 で加重平均。
```

### repair default OFF の理由

```
heuristic の誤補正リスクが未評価なため。
現段階では observational / research mode を優先する。
「直したつもりで別の曲を壊す」を避けることが最優先。
有効性が確認された段階で opt-in UI として開放予定。
```

### createTimingModel() は消費者のまま

```
repair は preprocessing として独立。
createTimingModel() のシグネチャは一切変更しない。
将来の repair algorithm 改善は buildNormalizedTimingAnalysis() 内で完結する。
```

### __TIMING_DEBUG__ の責務分離

```
timing.js:    pure functions のみ（DOM / global state に触らない）
chartmode.js: window.__TIMING_DEBUG__ への書き込み責務を持つ

DevTools で以下を確認できる:
  window.__TIMING_DEBUG__.diagnostics  ← analyzeTiming() の結果
  window.__TIMING_DEBUG__.repair       ← repairDownbeats() の結果（repair:false なら null）
  window.__TIMING_DEBUG__.normalized   ← createTimingModel に渡された最終値
  window.__TIMING_DEBUG__.raw          ← 変更前の生データ（beats / downbeats）
```

---

## 動作確認結果（4曲）

### 曲1: BPM 143 / 4/4拍子 / 156小節

```
severity:            "none"
driftCount:          0
maxConsecutiveDrift: 0
→ この曲では downbeat drift は発生していなかった

注意: 末尾152〜154小節で 11〜14% の伸びが観測された。
      現在の threshold（±20%）では drift 判定されていないが
      「自然な rit.」か「drift 予兆」かは現時点では断定できない。
```

### 曲2〜4: Issue #45 実ケース分類（Phase59調査で新たに判明）

4曲を調査した結果、当初の想定（Type D: 局所drift → 全体伝播）は
今回調査した4曲では確認できなかった。代わりに以下の3タイプが発見された。

---

## Issue #45 実ケース分類（Phase59で確定）

Phase59 の調査により、Issue #45「小節頭ズレ」の実態が類型化された。
これが Phase59 の本質的な成果（timing failure taxonomy）。

```
┌────────┬──────────────────────────────────────┬──────────────┐
│ Type   │ 現象・原因                            │ B案で直せるか│
├────────┼──────────────────────────────────────┼──────────────┤
│ Type A │ beat tracking collapse                │ 不可         │
│        │ beat-level resolution を失い           │ A案のみ      │
│        │ measure-level pulse のみ出力される    │              │
│        │ （beats ≈ downbeats になる）           │              │
├────────┼──────────────────────────────────────┼──────────────┤
│ Type B │ pickup measure（弱起小節）             │ 限定的に可能 │
│        │ 小節1だけ短い（3拍分など）             │ （要設計）   │
│        │ beats / downbeats 自体は正確           │              │
├────────┼──────────────────────────────────────┼──────────────┤
│ Type C │ beats 半テンポ or 粒度異常            │ 不可         │
│        │ beats 間隔が本来の倍になっている       │ A案のみ      │
│        │ downbeat も同様にズレる               │              │
├────────┼──────────────────────────────────────┼──────────────┤
│ Type D │ 局所 drift → 全体伝播                 │ 可能         │
│        │ （当初の想定ケース）                  │ B案の対象    │
│        │ 今回調査した4曲では確認できなかった   │              │
│        │ ※サンプル数少・発生頻度は未確定      │              │
└────────┴──────────────────────────────────────┴──────────────┘
```

### Type A の詳細（beat tracking collapse）

```
症状:
  beats:     [0.59, 3.11, 5.63, ...]  間隔 ≈ 2.52秒
  downbeats: [0.59, 3.11, 5.63, ...]  ← beats と完全一致

本来 BPM143 / 4/4 なら:
  beats 間隔    ≈ 0.42秒（拍レベル）
  downbeats 間隔 ≈ 1.68秒（小節レベル）

原因:
  madmom の beat tracker が拍レベルの分解に失敗し
  小節レベルの pulse のみを出力している状態
  → beats が downbeats 粒度になってしまう

対処: A案（手動修正UI）のみ。B案では原理的に修正不可。
```

### Type B の詳細（pickup measure）

```
症状:
  beats:     [0.23, 0.55, 0.87, ...]  間隔 ≈ 0.37〜0.38秒（BPM162）
  downbeats: [0.23, 1.50, 2.88, ...]

  小節1の長さ: 1.50 - 0.23 = 1.27秒 ≈ 3.4拍分
  小節2以降:   約1.47〜1.51秒（4拍分）← 正常

原因:
  曲が小節の途中の拍から始まっている（弱起）
  beats / downbeats 自体は正確

pickup 判定条件（暫定案・要慎重設計）:
  小節1の長さ < beatsPerMeasure × 0.75 拍分 → pickup と見なす
  ただし単純な measure length 比較だけでは
  rubato intro / free tempo intro / detection jitter での
  誤検出リスクあり。判定条件は未確定。

対処候補:
  小節1を「前打ち小節」として番号を 0 または「♩」にする
  小節1をスキップして小節2を「1」とする
  ※いずれも timeSignature を考慮した設計が必要
```

### Type D について（今回未発生）

```
今回調査した4曲すべてで severity: "none" または Type A/B/C に分類され、
「局所 drift → 以降全小節ズレ続ける」ケースは確認できなかった。
ただしサンプル数が少なく曲傾向も偏りがあるため、
Type D の発生頻度は現時点では未確定。
B案（repairDownbeats）は Type D 専用として引き続き待機状態。
```

---

## Issue #45 の状態更新

| 項目 | 状態 |
|---|---|
| normalized pipeline 確立 | ✅ 完了 |
| diagnostics 基盤 | ✅ 完了 |
| repair infrastructure | ✅ 完了（default OFF） |
| ケース分類（Type A/B/C/D） | ✅ Phase59調査で確定 |
| Type D（drift）補正効果 | 未検証（発生ケース収集中） |
| Type A（beat tracking collapse）対処 | 未着手（A案のみ） |
| Type B（pickup measure）対処 | 未着手（設計要） |
| Type C（beats粒度異常）対処 | 未着手（A案のみ） |
| Issue #45 根治 | 未完 |

**Issue #45 は「resolved」ではなく「classified / instrumented」の状態。**

今は「問題を直した」ではなく「問題の種類を正確に分類できた」フェーズ。
B案（自動補正）だけでは根治できず、Type A/C には A案が必要と確定した。

---

## 積み残し・保留

### Type D heuristic tuning（今後のデータ収集後）

現在の drift 閾値（±20%）は conservative。
より多くの曲で diagnostics を収集してから調整する。

### Type B: pickup measure 自動検出（設計要）

```
判定条件は現状未確定。
単純な measure length 比較だけでは誤検出リスクあり。
rubato / free tempo intro との区別が課題。
設計フェーズを別途設ける。
```

### Type A/C: beats 出力異常の早期検知

```
現在の analyzeTiming() では beats ≈ downbeats の異常を検知しない。
将来的に以下の heuristic 検知を追加予定:
  beats.length ≈ downbeats.length → 異常フラグ（heuristic warning・確定判定ではない）
  beats 間隔 median ≈ downbeats 間隔 median → 異常フラグ（heuristic warning・確定判定ではない）
  → Chart Mode 開封時に "⚠ beat tracking 異常の可能性" 警告を表示
  注意: extremely sparse percussion / ambient intro / half-time groove 等で
        false positive が起きる可能性あり。確定判定には使わない。
```

### A案（手動修正UI）の設計フェーズ

Type A/C の最終解として必要性が確定した。
発生ケースの分類が完了したため、設計フェーズに入れる段階になった。

```
必要な要素:
  measure クリック → 時刻修正 UI
  timing mutation authority（project.analysis に修正データを保持）
  persistence（修正データの保存）
  undo
  UI editing layer
規模: 大（専用フェーズが必要）
```

### 末尾 rit. の扱い

曲1で末尾 152〜154 小節の伸び（11〜14%）を観測。
現在の threshold（±20%）未満だが「自然な rit.」か「drift 予兆」かは未判断。
end-of-song detection を追加するかは今後の判断。

---

## 次フェーズ候補

### A. Chart Mode click seek（推奨・実装コスト低）

normalized timing pipeline が確立したため実装可能。

```
実装フロー:
  chart-grid click イベント
      ↓
  slot の data-slot-index / data-measure-index 取得
      ↓
  getMeasure(measureIndex).startTime
    + (slotIndex / slotsPerMeasure) × 小節長  ← 暫定実装
      ↓
  app.js の seekTo コールバック経由で aEl.currentTime 設定
      ↓
  playback authority は app.js が持つ（chartmode.js が aEl に直接触らない）

注意:
  上記の式は「slot = 等間隔」を前提とした暫定実装。
  将来 triplet / swing / variable subdivision が入った場合は
  beat-aware seek mapping への移行が必要になる。
```

### B. Type B（pickup measure）表示補正（実装コスト小）

小節1が短い場合に番号を「0」にするだけでも UX が改善する。
判定条件の設計は慎重に行う（誤検出リスクあり）。

### C. A案（手動修正UI）設計フェーズ（実装コスト大）

Type A/C は自動補正不可と確定。
発生ケースの分類が完了したため設計着手が可能な段階。

### D. moveChordAcrossLines（要注意）

Phase57 以降、slot semantic / measure ownership / carry propagation への
波及が大きくなっているため、他のフェーズ完了後に慎重に設計する。

---

## commit message

```
feat: Phase59 timing diagnostics and normalization pipeline

- add analyzeTiming() to timing.js: drift diagnostics and failure taxonomy (always runs, no side effects)
- add repairDownbeats() to timing.js: continuity-aware repair (experimental, default OFF)
- add buildNormalizedTimingAnalysis() to timing.js: unified entry point for all consumers
- update buildGridViewModel() to use normalized timing pipeline
- write window.__TIMING_DEBUG__ for DevTools inspection
- add data-confidence / data-repair-state attributes to measure DOM
- add .chart-measure--drift-repaired / --drift-rejected CSS classes
- fix stale comment in Phase57 slot DOM invariant section
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
