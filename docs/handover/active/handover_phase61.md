# 引き継ぎ: Phase61完了 — pickup measure numbering + Phase60.5 file picker improvement

## 作業状態

* ブランチ: main
* 直前作業: Phase60完了（Chart Mode click seek）

---

## 完了したこと

### Phase61: pickup measure numbering correction

| 変更 | 内容 | ファイル |
|---|---|---|
| `detectPickupMeasure()` 追加 | 弱起小節を2条件ANDで判定。timing.js untouched | js/chartmode.js |
| `getDisplayMeasureNumber()` 追加 | measure identity と display numbering semantics を分離 | js/chartmode.js |
| `_renderChartGrid()` 修正 | pickup 判定を冒頭で1回実行・番号表示をヘルパー経由に変更 | js/chartmode.js |
| 旧スキーマ互換ガード追加 | endTime 欠損時に `return false`（旧project で Chart Mode が開かないバグ修正） | js/chartmode.js |

### Phase60.5: file picker folder memory

| 変更 | 内容 | ファイル |
|---|---|---|
| `PICKER_IDS` 定数追加 | 用途別 picker id を1箇所で管理 | js/project.js |
| `showSaveFilePicker` に id 追加 | `PICKER_IDS.projectSave` | js/project.js |
| 音声読み込みを `showOpenFilePicker` に移行 | `PICKER_IDS.audio`・AbortError ガード・FSA非対応フォールバック | js/app.js |
| コード読み込みを `showOpenFilePicker` に移行 | `PICKER_IDS.chord`・同上 | js/app.js |
| プロジェクト読み込みを `showOpenFilePicker` に移行 | `PICKER_IDS.projectOpen`・同上 | js/app.js |

---

## 確定した設計原則

### pickup-aware measure numbering semantics（Phase61で確立）

```
measure identity（mi）と display numbering semantics は分離する。

mi:              GridViewModel の 0-based index（identity）= data layer
表示番号:        getDisplayMeasureNumber(mi, isPickup) が決める = render phase

display numbering semantics は renderer-owned helper とする。
measure identity（mi）は data layer に保持し、
表示番号は render phase で決定する。
（identity ≠ presentation）

renderer 内で直接 mi+1 等を計算しない。
将来の alternate numbering / rehearsal-local numbering / section reset numbering は
getDisplayMeasureNumber() を拡張することで対応する。
将来 export / cursor / rehearsal mark / print / mini-map が追加されても、
表示番号は必ず render phase で解決する。
```

### detectPickupMeasure の判定条件

```
2条件 AND で pickup と判定:

条件A: measures[0] の長さ < normalized median measure length × 0.75
条件B: measures[1〜N] の長さが中央値の ±30% 以内（正常範囲の確認）

median 基準を採用する理由:
  measures[1] を基準にすると intro drift / early jitter で false positive が増える。

available range 全件を使用:
  短曲でも measures.slice(1) の全件を使う（固定インデックス参照なし）。

旧スキーマ互換:
  endTime が欠損している measures は pickup 判定をスキップ（return false）。
  Chart Mode の開閉には影響しない。
```

### PICKER_IDS による用途別フォルダ記憶（Phase60.5で確立）

```
Chrome は showOpenFilePicker / showSaveFilePicker の id ごとに
「最後に使ったフォルダ」を記憶する。

用途別に id を分けることで:
  音声    → 常に最後の音声フォルダ
  コード  → 常に最後のコードフォルダ
  開く    → 常に最後のプロジェクトフォルダ
  保存    → 常に最後の保存フォルダ

PICKER_IDS を project.js に export し、
app.js が import して使う（scatter 防止）。

export const PICKER_IDS = {
  audio:       'ccs-audio',
  chord:       'ccs-chord',
  projectOpen: 'ccs-project-open',
  projectSave: 'ccs-project-save',
};
```

### AbortError ガード（Phase60.5で確立）

```
showOpenFilePicker / showSaveFilePicker のキャンセルは
AbortError として throw される。

try { ... } catch (err) {
  if (err.name === 'AbortError') return;  // キャンセルは正常
  ...
}

全 picker に必須。入れないと Console error が出る。
```

### FSA API フォールバック（Phase60.5で確立）

```
window.showOpenFilePicker が存在しない場合は
<input type="file"> にフォールバックする。

if (window.showOpenFilePicker) {
  // FSA API
} else {
  document.getElementById('file-***').click();
}

Safari / Firefox / 古いChrome 対応。
```

---

## 積み残し・保留

### timing model rehydration（Phase61 hotfix で発覚）

```
現象:
  保存済み project の viewModel.measures に endTime が存在しない。
  detectPickupMeasure() で NaN が混入し renderer が停止した。

根本原因:
  viewModel（derived state）を serialize/persist している。
  project load 後に createTimingModel() を再実行していない。
  本質は serialized schema version mismatch であり、
  旧 project だけ壊れる原因はここにある。

理想形（将来）:
  保存: analysis.raw / diagnostics / repair metadata / user overrides のみ
  load後: createTimingModel() → createChartViewModel() を再生成
  → derived state を persist しない（React 系の原則と同じ）

将来:
  schema versioning / migration layer の導入を検討する。
  旧project互換・schema evolution・derived state 問題を一元管理できる。

Phase61 では endTime 欠損ガードで止血のみ行った。
本格的な rehydration は将来フェーズで対応する。
```

### pickup-aware measure alignment（Phase61スコープ外・将来候補）

```
Phase61 の scope: display numbering correction のみ
将来フェーズ: pickup-aware measure alignment

「コードを小節頭に揃えたい」という要求は alignment であり
numbering correction とは別問題。

影響範囲:
  measure.pickupOffsetBeats metadata 追加
  leading empty slot projection
  right-aligned pickup rendering
  pickup-aware cursor / seek semantics
  → slot / cursor / seek 全体に影響するため別フェーズで設計が必要

分類: pickup-aware slot projection（将来候補）
```

### Issue #45 継続

```
Type B（pickup measure）: numbering correction は Phase61 で完了
                          alignment correction は将来候補
Type A/C（beat tracking 異常）: A案（手動修正UI）が必要・大規模
Type D（drift）: 発生ケース収集中
```

---

## 次フェーズ候補

### A. timing model rehydration（推奨・技術的負債解消）

```
Phase61 hotfix で発覚した derived state persist 問題の根本解決。
project load 後に createTimingModel() を再実行する設計に変更する。
```

### B. pickup-aware measure alignment（設計フェーズが必要）

```
pickup offset metadata を measure model に持たせ、
renderer が leading empty slot を生成する。
normalized measure model authority が整っているため設計着手可能。
```

### C. Chart/editor 並列表示（設計フェーズが必要）

```
editor authority と chart authority の境界設計が未固定。
selection / scroll / mutation sync の設計が必要。
```

---

## backlog continuity

### Chart Mode 系

- Chart Mode click seek: **完了（Phase60）**
- Chart Mode pickup measure numbering: **完了（Phase61）**
- Chart Mode pickup measure alignment: 将来候補（pickup-aware slot projection）
- Chart Mode 並列表示: 設計フェーズが必要
- Issue #45 Type A/C: A案（手動修正UI）設計フェーズ（大規模・将来）
- Issue #45 Type D: 発生ケース収集中

### timing pipeline 系

- timing model rehydration（derived state を persist しない設計）: 将来候補
- Type B alignment correction: 将来候補
- Type A/C: A案のみ対処可能
- 末尾 rit. の扱い: 観測継続

### file picker 系

- PICKER_IDS による用途別フォルダ記憶: **完了（Phase60.5）**
- 将来: recent files / drag & drop / workspace restore との統合

---

## 棚卸し時の docs 更新差分（5フェーズ棚卸し時に適用）

### phase-status.md

① ヘッダー更新:
```
> 最終更新: Phase60完了時点
→ > 最終更新: Phase61完了時点
```

② 完了フェーズ一覧に Phase60.5 / Phase61 セクションを追加:
```markdown
### Phase60.5 — File picker folder memory
- `PICKER_IDS` 定数を project.js に export（用途別 picker id の一元管理）
- 音声・コード・プロジェクト読み込みを `showOpenFilePicker` に移行
- `showSaveFilePicker` に `id: PICKER_IDS.projectSave` 追加
- 用途別フォルダ記憶（audio / chord / projectOpen / projectSave を分離）
- `AbortError` ガード（キャンセル時の console error 防止）
- FSA API 非対応ブラウザへの `<input type="file">` フォールバック

### Phase61 — pickup measure numbering correction
- `detectPickupMeasure()` 追加（2条件AND判定・median 基準・available range 全件）
- `getDisplayMeasureNumber()` 追加（measure identity と display numbering semantics の分離）
- pickup 判定: 小節0 → "0"、以降 1, 2, 3 ...（通常は 1, 2, 3 ...）
- 旧スキーマ互換ガード（endTime 欠損時は pickup 判定スキップ）
- timing.js / app.js / CSS 変更なし
- hotfix: 旧project で Chart Mode が開かないバグ修正（endTime 欠損による NaN）
```

③「現在地」セクション更新:
```
- Phase60完了
→ - Phase61完了
```

④「次フェーズ候補」を更新:
```
削除（完了済み）:
  - Chart Mode pickup measure 表示補正（Type B 対応・実装コスト小）

追加:
  - timing model rehydration（derived state を persist しない設計）
  - pickup-aware measure alignment（pickup-aware slot projection）
```

### current-issues.md

① ヘッダー更新:
```
> 最終更新: Phase60完了時点
→ > 最終更新: Phase61完了時点
```

② Chart Mode pickup measure 表示補正 の状態更新:
```
状態: 未着手
→ 状態: **一部完了（Phase61）**
内容:
  numbering correction: 完了（小節0 → "0"、以降 1, 2, 3 ...）
  alignment correction: 未着手（pickup-aware slot projection として将来候補）
```

③ timing model rehydration を新規追加（技術的負債セクション）:
```
### timing model rehydration
状態: 未着手
内容: 保存済み project の viewModel.measures に endTime が存在しない問題（Phase61で発覚）。
      現在は derived state（viewModel）を serialize しているため、
      load 後に createTimingModel() を再実行していない。
      理想形: analysis.raw のみ保存し、load後に normalize pipeline を再実行する。
      Phase61 では endTime 欠損ガードで止血のみ実施。
```

---

## commit message

```
feat: Phase61 pickup measure numbering + Phase60.5 file picker improvement

Phase61:
- add detectPickupMeasure() to chartmode.js (2-condition AND, median-based)
- add getDisplayMeasureNumber() helper (measure identity / display semantics separation)
- pickup measure: 小節0 → "0", 以降 1, 2, 3 ... / 通常は 1, 2, 3 ...
- hotfix: old project compatibility guard (endTime missing → skip pickup detection)
- timing.js / app.js / CSS unchanged

Phase60.5:
- add PICKER_IDS constant to project.js (audio / chord / projectOpen / projectSave)
- migrate audio/chord/project open to showOpenFilePicker with per-purpose id
- add id to showSaveFilePicker (PICKER_IDS.projectSave)
- AbortError guard on all pickers (cancel without console error)
- fallback to <input type="file"> for non-FSA browsers
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
