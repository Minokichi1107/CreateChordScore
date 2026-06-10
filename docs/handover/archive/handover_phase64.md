# 引き継ぎ: Phase64完了 — timing model rehydration redesign

## 作業状態

* ブランチ: main
* 直前作業: Phase63完了（playback UX stabilization / restore lifecycle fix）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `loadAnalysis()` 戻り値拡張 | `raw` と `normalized` を追加。normalized は loadAnalysis() が1度だけ生成する runtime cache | js/analysisLoader.js |
| `buildNormalizedTimingAnalysis()` 呼び出し移動 | chartmode.js → analysisLoader.js へ移動。consumer は normalized を読むのみ。rebuild responsibility は loadAnalysis() に集約 | js/analysisLoader.js |
| `buildGridViewModel()` 境界整理 | 引数を analysis（全体）に統一。normalized.beats/downbeats を timing source として使用 | js/chartmode.js |
| `endTime` を measures[] に付与 | `model.getMeasure(mi).endTime` を measures 初期化時に追加 | js/chartmode.js |
| `initChartMode` 更新 | `getNormalized` 追加・`seekTo` 正式化 | js/app.js |
| restore ordering contract コメント追記 | loadProj() に ①〜⑥ の順序を明示 | js/app.js |
| `isRestore` フラグ適用（Phase63 漏れ） | loadChordData 引数・capo reset ガード・IndexedDB restore 呼び出しの3箇所 | js/app.js |
| `showOpenFilePicker` 移行（Phase60.5 漏れ） | audio-btn / chord-btn / btn-open を showOpenFilePicker に変更 | js/app.js |
| `PICKER_IDS` import 追加 | project.js からの import に追加 | js/app.js |
| audio MIME タイプ修正 | `'audio/*'` → 個別 MIME タイプ指定（Chrome は `*` を受け付けない） | js/app.js |

---

## 確定した設計原則

### 4層 architecture contract（Phase64で確立）

```
Layer 1: Persistence Domain
  analysis/{id}.json:
    raw                persisted canonical source（timing persistence の唯一の canonical source）
  project.json:
    project.lines      コード譜本体
    project.id         UUID（system-wide authority key）
    capo / key / tempo UI state
    hasAnalysis        フラグのみ

Layer 2: Runtime Cache（project.analysis）
  NEVER persist / NEVER treat as source of truth
  analysis = {
    raw,               persisted canonical timing data（Persistence Layer からの配置済みコピー）
    normalized,        timing専用補助データ（RUNTIME CACHE）
      ├─ beats          repair済み timing source
      ├─ downbeats      repair済み timing source
      ├─ diagnostics    analyzeTiming() 結果
      └─ repair         repairDownbeats() 結果
    bpm, timeSignature, chords, meta  runtime参照用フィールド（normalized とは異なり rebuild 責務を持たない通常データ）
  }

Layer 3: Chart Mode Runtime Domain（chartmode.js ownership）
  timingModel          createTimingModel() から生成
  measures[]           startTime / endTime / slots 保証済み
  cursor / playback    rAF loop

Layer 4: UI Projection（capo依存はここだけ）
  chord label = transposeChord(chord, -capo)
  将来の Nashville / movable key / transpose preview もここに閉じ込める
```

### normalized の責務（Phase64で確定）

```
normalized = timing layer 専用の deterministic derived cache

deterministic の意味:
  raw が同じなら normalized は常に同じ結果になる。
  これが serialize 禁止 / migration source 禁止 / equality source 禁止 の根拠。
  「rebuild 可能」であることが設計上の前提。

含むもの:
  beats / downbeats（repair済み）
  diagnostics（analyzeTiming 結果）
  repair（repairDownbeats 結果）

含まないもの（analysis から直接取得する）:
  chords / timeSignature / bpm / meta

理由:
  chords / timeSignature は musical/project layer であり timing layer ではない。
  normalized は analysis の代用品ではない（今回の失敗パターンとして確認済み）。
  normalized を analysis 全体の代用品として使うと
  musical/project layer と timing layer の境界が崩れる。
```

### normalized の invalidate 条件

```
rebuild が必要な場合:
  - analysis 再読込（loadAnalysis() 呼び出し時）
  - repair policy 変更
  - 将来の manual timing edit
  - timing semantics change（timeSignature 変更・pickup interpretation・subdivision policy 等）

rebuild 不要:
  - capo 変更（capo は Layer 4 のみに影響）
  - Chart Mode open / close
  - UI 変更全般
```

### restore ordering contract（loadProj の実行順序）

```
① deserializeProject()        lines / title / capo 復元
② analysis/{id}.json 読込      raw のみ取得
③ loadAnalysis({ raw })        normalized 生成（capo 非依存）
   project.analysis = { raw, normalized, ... }
④ capo UI 復元（_prevCapo）    ← ③の後でよい（capo 非依存）
⑤ audio / chord 自動復元      isRestore=true で capo reset スキップ
⑥ refreshEditor()              全 runtime state が揃った後

[TIMING INVARIANT]
  normalized は capo 非依存。
  capo 変更では normalized rebuild 不要。
  capo は UI Projection layer のみに影響する。

[PERSIST INVARIANT]
  analysis.normalized は serialize 禁止。
  serializeProject() は hasAnalysis フラグのみ保存する。

[OWNERSHIP INVARIANT]
  chartmode.js は persistence ownership を持たない。
  normalized timing data と projection inputs のみを受け取る。
  project.analysis の直接参照は app.js の責務（chartmode.js に持たせない）。
```

### isRestore semantics（Phase63設計・Phase64で実コード適用）

```
loadChordData(data, filename, isRestore = false)

isRestore = false（default）: manual ingest 経路
  - _prevCapo 分を逆算して lines を canonical に戻す
  - capo を 0 にリセット（project.capo / UI / _prevCapo の3点セット）

isRestore = true: IndexedDB 自動復元経路
  - capo reset をスキップ
  - loadProj() が uiState.capo で設定済みの _prevCapo を保持する
```

---

## 発見・修正した実装漏れ（Phase64の重要な成果）

### handover に記録されていたが実コードに未適用だったもの

```
Phase60.5: showOpenFilePicker 移行
  handover_phase61.md に記録済み
  → app.js に未適用（audio-btn / chord-btn / btn-open が <input>.click() のまま）
  → Phase64 で適用

Phase63: isRestore フラグ
  handover_phase63.md に記録済み
  → app.js に未適用（loadChordData 引数・capo reset ガード・IndexedDB 呼び出し）
  → Phase64 で適用

Phase61: endTime が measures[] に未付与
  hotfix で「旧 project の互換問題」として対処していたが
  → 実際は buildGridViewModel での新規生成でも endTime が入っていなかった
  → 根本原因は生成側（Phase61 hotfix は症状への対処だった）
  → Phase64 で measures 初期化時に endTime を付与
```

### 教訓

```
「handover に書いてある」と「実コードに反映済み」は別問題。
handover audit だけでは不十分。実コード audit も必要。

特に以下は漏れやすい:
  - フラグ追加（isRestore 等）の呼び出し側への適用
  - API 移行（showOpenFilePicker 等）の全経路への適用
  - 生成側のフィールド追加（endTime 等）
```

### audio MIME タイプ修正

```
Chrome の showOpenFilePicker は 'audio/*' を受け付けない。
個別 MIME タイプを明示する必要がある。

× 'audio/*': ['.mp3', '.wav', ...]
✅ 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'], ...
```

---

## 積み残し・保留

### restored asset state synchronization（Phase62から継続）

```
現象:
  project restore 後、audio/chord は復元済みだが
  「〇〇を読み込んでください」バナーが表示されることがある。

本質:
  manual ingest と IndexedDB restore が別 state 扱いになっている。
  runtime loaded flags が manual ingest path でしか更新されていない。

優先度: 中（UX に直結）
```

### timing model rehydration の schema contract（未完）

```
restore ordering contract は確立した。
しかし「load 後に何をどの順序で再構築するか」の
schema versioning / migration layer は未定義のまま。

必要なもの:
  - runtime timing schema contract の定義
  - schema versioning / migration layer
  - invariant validation（endTime 等の必須フィールド保証）

現状: isRestore / endTime 付与で止血済み。根本設計は将来フェーズ。
```

### debug API 整理（Phase62から継続）

```
window.__CS_REPAIR__ 等の TEMP タグ付きコードが残留している。
window.__CS_DEBUG__ への統合は将来フェーズ。
```

---

## 次フェーズ候補

### A. restored asset state synchronization（推奨・UX改善）

```
restore 後のバナー誤表示を解消する。
ingest / restore state の統合。
runtime loaded flags の restore-aware 化。
```

### B. debug API 整理（運用改善・実装コスト小）

```
window.__CS_DEBUG__ 統合。
TEMP REPAIR タグの残留コード削除。
window.__CS_REPAIR__ / window.__CS_TRANSPOSE__ 等を削除。
docs/ デバッグガイド作成。
```

### C. Chart Mode pickup-aware alignment（設計フェーズが必要）

```
Phase61 で numbering correction は完了。
alignment correction（pickup offset metadata / leading empty slot）は未着手。
normalized measure model authority が整っているため設計着手可能。
```

---

## backlog continuity

### restore lifecycle 系

- capo restore バグ: **完了（Phase63設計・Phase64実装）**
- showOpenFilePicker 移行: **完了（Phase60.5設計・Phase64実装）**
- endTime 付与: **完了（Phase64）**
- timing model rehydration schema contract: 将来フェーズ
- restored asset state synchronization: 将来候補

### Chart Mode 系

- normalized timing pipeline 確立: **完了（Phase59）**
- 4層 architecture contract 確立: **完了（Phase64）**
- pickup measure numbering: **完了（Phase61）**
- pickup-aware measure alignment: 将来候補
- Chart/editor 並列表示: 設計フェーズが必要
- Issue #45 Type A/C: A案（手動修正UI）大規模・将来

### その他

- debug API 整理: 将来候補（B案）
- moveChordAcrossLines: Chart 関連作業後に実装予定

---

## commit message

```
feat: Phase64 timing model rehydration redesign

architecture:
- establish 4-layer architecture contract:
    Layer 1: Persistence Domain (analysis.raw only)
    Layer 2: Runtime Cache (project.analysis.normalized - NEVER persist)
    Layer 3: Chart Mode Runtime Domain (chartmode.js ownership)
    Layer 4: UI Projection (capo-dependent rendering only)
- confirm: normalized = timing-layer-only auxiliary data
    (chords / timeSignature / bpm / meta belong to musical/project layer)
- define restore ordering contract in loadProj() (①〜⑥ invariant)

analysisLoader.js:
- add raw and normalized to loadAnalysis() return value
- move buildNormalizedTimingAnalysis() call from chartmode.js to here
- normalized is generated once and cached; consumers read as source of truth only
  (rebuild responsibility is consolidated in loadAnalysis())

chartmode.js:
- clarify buildGridViewModel() boundary: analysis(full) as argument
- use analysis.normalized.beats/downbeats as timing source
- use analysis.chords/timeSignature directly from analysis
- add endTime to measures[] initialization (root cause of Phase61 hotfix)
- clarify: normalized is timing-layer-only auxiliary data, not analysis replacement
  (chords/timeSignature/bpm/meta belong to musical/project layer)

app.js (Phase63 isRestore - was in handover but not applied to code):
- add isRestore param to loadChordData() (default false)
- guard capo reset with if (!isRestore)
- pass isRestore=true in IndexedDB chord restore path

app.js (Phase60.5 showOpenFilePicker - was in handover but not applied):
- add PICKER_IDS to import from project.js
- migrate audio-btn to showOpenFilePicker with PICKER_IDS.audio
- migrate chord-btn to showOpenFilePicker with PICKER_IDS.chord
- migrate btn-open to showOpenFilePicker with PICKER_IDS.projectOpen
- fix audio MIME type: 'audio/*' → explicit MIME types (Chrome requirement)
- add AbortError guard and <input> fallback to all pickers
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
