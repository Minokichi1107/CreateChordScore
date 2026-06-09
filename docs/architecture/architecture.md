# アーキテクチャ概要

> 最終更新: Phase64完了時点

---

## 1. ツール概要

ブラウザベースのギターコード譜エディター。
音声ファイルの再生・コード進行の編集・ダイアグラム表示・プロジェクト保存を行う。
フレームワーク非依存（Vanilla JS）。

---

## 2. ディレクトリ構造

```
CreateChordScore/
├─ index.html
├─ server.py
├─ css/
│   ├─ base.css
│   ├─ theme.css
│   ├─ layout.css
│   ├─ components.css
│   ├─ state.css
│   └─ perform.css
├─ js/
│   ├─ app.js            ← オーケストレーター
│   ├─ audio.js
│   ├─ editor.js
│   ├─ chords.js
│   ├─ project.js
│   ├─ csvImporter.js
│   ├─ perform.js
│   ├─ tapmode.js        ← Phase12で分離
│   ├─ replace.js        ← Phase12で分離
│   ├─ modals.js         ← Phase33で新設
│   ├─ chordEntry.js     ← Phase39-1で新設
│   ├─ tokens.js         ← Phase39-0で新設
│   ├─ idb.js
│   ├─ analysisLoader.js ← Phase41で新設
│   ├─ timing.js         ← Phase41で新設（外部依存ゼロ）
│   └─ chartmode.js      ← Phase41で新設
├─ resource/
│   ├─ audio/    ← .gitignore対象（*.mp3等）
│   ├─ chords/   ← .gitignore対象（著作権保護）
│   ├─ icons/    ← Git管理
│   ├─ lyrics/   ← .gitignore対象（著作権保護）
│   ├─ projects/ ← .gitignore対象（個人データ）
│   ├─ analysis/ ← .gitignore対象 / replacementMap.jsonのみGit管理
│   └─ sample/   ← .gitignore対象（個人素材）
├─ docs/
├─ tools/                ← chordmini_fetch.py 等の外部ツール
├─ scripts/              ← バックアップ・起動バッチ
└─ testdata/
```

---

## 3. JSモジュール構成

| モジュール | 責務 | 導入 |
|---|---|---|
| app.js | アプリ起動・状態管理・モジュール間調整（オーケストレーター） | 初期 |
| audio.js | 音声再生管理 | 初期 |
| editor.js | コード譜編集・譜面UI描画 | 初期 |
| chords.js | コード情報・ダイアグラム描画・lookup | 初期 |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理 | 初期 |
| csvImporter.js | CSV / JSON インポート・パース | 初期 |
| perform.js | 演奏モード状態管理・描画・スクロール同期 | Phase12 |
| tapmode.js | TAP Mode オーバーレイの状態・描画・入力制御 | Phase12 |
| replace.js | 置換機能（replace bar）の状態・UI・ロジック | Phase12 |
| modals.js | 軽量modal群（time / repeat / copy / diagram / chordEdit） | Phase33 |
| chordEntry.js | コード入力サブシステム（openAddChord / insertAt state管理 / transient preview） | Phase39-1 |
| tokens.js | musical token stream の分類・変換ユーティリティ（isChordToken / isSepToken / isNoChordToken / tokenToText） | Phase39-0 |
| idb.js | IndexedDB操作層（audio / chord_source のローカル保存） | Phase32 |
| analysisLoader.js | analysis.raw の validate / sanitize / normalize → project.analysis 生成。buildNormalizedTimingAnalysis() の呼び出し元（Phase64〜）。normalized の rebuild responsibility を集約 | Phase41 |
| timing.js | TimingModel（beat / measure grid 構築・quantize）。外部依存ゼロ。Phase59で diagnostics / repair / normalized pipeline 追加 | Phase41 |
| chartmode.js | Chart Mode UI・GridViewModel 生成・playback sync（projection renderer）。rAF playback loop ownership（Phase63〜） | Phase41 |

### 依存関係ルール

- `app.js` がオーケストレーター。モジュール間の連携は `app.js` 経由を原則とする
- モジュール間の直接操作禁止（例: `editor.js` → `audio.js` の直接呼び出しは禁止）
- `project.js` はデータ管理・変換に限定（UI操作を含まない）
- `modals.js` はUI lifecycle と callback通知のみ。state mutationは app.js が担当
- `tokens.js` は domain-level utility。どのモジュールからも参照可（app.js 経由不要）
- `analysisLoader.js` は analysis data の ingestion 専用。UI / DOM / project.lines に触らない。normalized の rebuild responsibility を持つ
- `timing.js` は外部依存ゼロ。pure functions のみ・DOM / global state に触らない。chartmode.js と analysisLoader.js が import する
- `chartmode.js` は projection renderer。app.js 経由で normalized を注入される。project tree から直接読み取り禁止
- `tapmode.js` / `replace.js` は app.js 経由で初期化される（initTapMode / initReplace）
- `utils.js` / `helpers.js` は作らない

### modals.js 依存注入パターン

`modals.js` は `initModals({...})` で依存を注入される。

```javascript
initModals({
  // 共通土台
  openModal, closeModal, mkMBtn, toast, getAudioTime,
  // diagram modal用
  getPreviewSvg, getCapo, generateId,
  onAddDiagram, onUpdateDiagram, getDiagCallbacks,
  // chord edit modal用
  onPreviewChord,
})
```

### chordEntry.js 依存注入パターン

`chordEntry.js` は `initChordEntry({...})` で依存を注入される（Phase39-5で接続完成）。

```javascript
initChordEntry({
  getLines,            // () => project.lines（アクセサ渡し・値コピー禁止）
  getPalette,          // () => palette
  getPaletteTranspose, // () => paletteTranspose
  addToPaletteIfNew,
  refreshEditor,
  openModal,
  closeModal,
  mkMBtn,
  toast,
  unlockDiag,          // AddChord open時にlock解除（B案・Phase39-2で確立）
  onPreviewChord,      // (chord) => void（input変更時の右パネル更新）
  transposeChord,
})
```

注入ルール：
- 「何をしたいか」を表す抽象callbackを渡す
- 広域stateの丸渡し禁止
- `project.lines` は直接渡さずアクセサ経由

---

## 4. 状態管理

状態は `app.js` に集中管理される。

### project
```javascript
project = {
  id,        // UUID（IndexedDB参照キー・system-wide authority key）
  title,
  artist,
  beats,
  audioFile,
  lines[],
  palette[],
  capo,      // UI state兼serialize互換
  hasAnalysis // フラグのみ（analysis本体は外部ファイル）
}
```

### uiState
```javascript
uiState = {
  focLine,   // フォーカス行インデックス（-1: 未選択）
  tapIdx,    // TAPモードインデックス
  rbHits,    // 置換回数
}

// 独立let変数（将来 uiState 統合予定）
let diagLocked        // ダイアグラム固定フラグ
let diagLockedChord   // ロック中のコード
let currentDiagChord  // 右パネル現在表示コード（source of truth）
let leftCollapsedManual  // <<ボタン操作（localStorage永続）
let leftCollapsedAuto    // resize自動（runtime only）
let leftExpandedOverride // narrow時の一時展開（runtime only）
let rightHidden          // 右パネル非表示フラグ（localStorage永続・body.right-hidden同期・Phase49追加）
```

### audioState
```javascript
audioState = {
  currentTime,
  duration,
  playing
}
```

### diagLock API（app.js内・Phase36で確立）

```javascript
// updateDiagRight(chord, capo) — 右パネル更新の正式API（currentDiagChordを常に同期）
// lockDiag(chord)              — diagLock有効化
// unlockDiag()                 — diagLock解除
// canUpdateDiagFromHover()     — hover更新guard（diagLocked時はfalse）
// updateDiagLockUI()           — ロック状態のUI反映（.phdr クラス切替）
// forcePreviewChord(chord)     — diagLocked中でも右パネルを一時更新（currentDiagChord書き換えなし）
//                                現在未使用・将来の preview layer 多層化向けに予約（Phase39-5）
```

AddChord open時のlock解除方針（Phase39-2で確立）：
- B案採用: `openAddChord()` 冒頭で `unlockDiag()` を呼ぶ
- A案（restore方式）は不採用 → `forcePreviewChord` のコメントに設計意図を記載

### project identity semantics（Phase62で確立）

```
操作                       project.id    用途
─────────────────────────────────────────────────────────
上書き保存                 維持          同一project継続
別名保存                   維持          同一projectの別ファイル
新規プロジェクトとして保存   新UUID        別project lineage開始
─────────────────────────────────────────────────────────

UUID は system-wide authority key（analyses / IndexedDB assets / autosave / 将来の workspace）。
filename ≠ project identity。
```

---

## 5. 起動フロー

```
DOMContentLoaded
↓
setupEventHandlers()
↓
initAudioEngine()
↓
initPerformMode()
↓
initTapMode()
↓
initReplace()
↓
initModals()         ← Phase33で追加
↓
initChordEntry()     ← Phase39-5で追加（chordEntry subsystem接続完成）
↓
initChartMode()      ← Phase41で追加
↓
loadCustomDiagrams()
↓
restoreFromLocalStorage()
```

---

## 6. token stream 設計

### token 種別

| token | 内部表現 | 状態 |
|---|---|---|
| chord | `{ chord: 'Am7' }` | 現行 |
| barline | `{ type: 'barline' }` | canonical（Phase39-4以降） |
| barline legacy | `{ type: 'sep' }` | deprecated（storage互換維持） |
| barline legacy | `{ chord: '/' }` | deprecated（storage互換維持） |
| simile | `{ type: 'simile', bars: 1\|2 }` | 設計済み・未実装 |
| no_chord | `{ type: 'no_chord' }` | canonical（Phase44-Step2以降） |

### token access layer（tokens.js）

```javascript
isSepToken(token)     // barline / sep / '/' の全形式を吸収
isChordToken(token)   // chord token 判定（プロパティ存在判定）
isSimileToken(token)  // simile token 判定
isNoChordToken(token) // no_chord token 判定（Phase44-Step2追加）
tokenToText(token)    // DOM表示用変換（lookup key には使わない）
```

### 責務分離ルール（Phase44-Step3 確定）

| 用途 | 使用値 | 理由 |
|---|---|---|
| display（DOM表示） | `tokenToText(c)` | no_chord / simile も安全に変換できる |
| lookup（DB検索） | `c.chord`（raw） | CHORD_DB のキーは raw 文字列 |
| transpose（移調） | `isChordToken(c)` 判定後に `c.chord` | no_chord / barline を誤って移調しない |
| serialize（保存） | token object そのまま | 変換しない。復元時の互換性を保つ |

**禁止事項:**
- `tokenToText()` を lookup key / compare / storage に使うこと
- `tokenToText()` の出力から token semantic を逆引きすること（非可逆）

### display projection は非可逆（Phase44-Step3 確定）

`tokenToText()` は「表示用の投影（projection）」であり、
元の token semantic を復元できない一方向変換である。

**display projection ≠ persisted semantic**

### renderer の projection 責務（Phase44-Step4 確定）

| renderer | projection | 方式 |
|---|---|---|
| chartmode.js | あり | render 時に `transposeChord(chord, -capo)` で変換 |
| perform.js | なし（mutated state renderer） | app.js の destructive model で変換済みの `c.chord` をそのまま render |
| editor.js | なし（mutated state renderer） | 同上 |

---

## 7. 将来予定

### chordEntry.js 拡張（Phase39以降）

現在の実装範囲：
- `openAddChord(idx)`
- `insertAt` state管理
- `addChord` / `addSep`（addSep は barline canonical 生成）
- キーボードハンドリング（Enter / Escape / IME guard）
- `isChordLikeInput` domain validation

将来の拡張予定：
- keyboard-first chord entry（insertion model 再設計）
- simile token 挿入UI
- token shorthand（`/`→barline、`ss`→sim. 等）

### Issue #26 — barline → bars[] 移行パス

- `isSepToken()` が access layer として確立（Phase39-3/4）
- 新規生成は `{ type: 'barline' }` canonical（Phase39-4）
- storage migration は Issue #26 設計フェーズで判断

### その他将来予定
- moveChordAcrossLines: Chart 関連作業後に実装予定
- 機能追加・既知課題は `current-issues.md` を参照

---

## 8. カポ設計の移行状態（Phase43 audit 確認）

現在プロジェクト内でカポの扱いが2つの方式で混在している。

### 旧方式（editor / palette / importUndo）

capo change → `c.chord` を直接書き換える（destructive mutation model）

### 新方式（chartmode.js / Phase43以降）

capo change → 表示時のみ変換（display projection model）
`analysis.raw` は実音canonical として不変

### 既知の制約

- `importUndoStack` はフォーム音スナップショットを保存するため、
  capo変更後にUndoすると chord と capo の整合性が保証されない
- `analysis.raw` の実音canonical は全経路で保護されている（✅ 確認済み）

### 移行方針

この混在は意図的な移行途中の状態。
全面的な projection 化は将来の semantic / projection redesign フェーズで統合を検討する。

---

## 9. Chart Mode timing pipeline（Phase59〜Phase64で確立）

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
  NEVER persist / NEVER serialize / NEVER treat as source of truth
  analysis = {
    raw,               persisted canonical timing data（Persistence Layer からの配置済みコピー）
    normalized,        timing専用補助データ（RUNTIME CACHE）
      ├─ beats          repair済み timing source
      ├─ downbeats      repair済み timing source
      ├─ diagnostics    analyzeTiming() 結果
      └─ repair         repairDownbeats() 結果
    bpm, timeSignature, chords, meta   runtime参照用（normalized とは別物・rebuild 責務なし）
  }

Layer 3: Chart Mode Runtime Domain（chartmode.js ownership）
  timingModel          createTimingModel() から生成
  measures[]           startTime / endTime / slots 保証済み
  cursor / playback    rAF loop（Phase63〜）

Layer 4: UI Projection（capo依存はここだけ）
  chord label = transposeChord(chord, -capo)
  将来の Nashville / movable key / transpose preview もここに閉じ込める
```

### normalized の責務（Phase64で確定）

```
normalized = timing layer 専用の deterministic derived cache

含むもの:
  beats / downbeats（repair済み）
  diagnostics（analyzeTiming 結果）
  repair（repairDownbeats 結果）

含まないもの（analysis から直接取得する）:
  chords / timeSignature / bpm / meta

禁止:
  normalized を analysis 全体の代用品として使わない
  （musical/project layer と timing layer の境界が崩れる）

rebuild が必要な場合:
  - analysis 再読込（loadAnalysis() 呼び出し時）
  - repair policy 変更
  - 将来の manual timing edit
  - timing semantics change

rebuild 不要:
  - capo 変更（capo は Layer 4 のみに影響）
  - Chart Mode open / close / UI 変更全般
```

### normalized timing pipeline

```
raw analysis
    ↓
analysisLoader.js: loadAnalysis()          ← normalized の rebuild 責務を集約
    └─ buildNormalizedTimingAnalysis()
        ├─ analyzeTiming()    診断（常に実行・副作用なし）
        └─ repairDownbeats()  補正（repair: true 時のみ・default OFF）
    ↓
project.analysis = { raw, normalized, bpm, timeSignature, chords, meta }
    ↓
app.js: getNormalized() 経由で chartmode.js に注入
    ↓
chartmode.js: buildGridViewModel(analysis)
    ↓
createTimingModel()                        ← 消費者のまま（シグネチャ変更なし）
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

[TIMING INVARIANT]   normalized は capo 非依存。capo は Layer 4 のみに影響。
[PERSIST INVARIANT]  analysis.normalized は serialize 禁止。
[OWNERSHIP INVARIANT] chartmode.js は persistence ownership を持たない。
                      project.analysis の直接参照は app.js の責務。
```

### isRestore semantics（Phase63設計・Phase64で実コード確定）

```
loadChordData(data, filename, isRestore = false)

isRestore = false（default）: manual ingest 経路
  - _prevCapo 分を逆算して lines を canonical に戻す
  - capo を 0 にリセット（project.capo / UI / _prevCapo の3点セット）

isRestore = true: IndexedDB 自動復元経路
  - capo reset をスキップ
  - loadProj() が uiState.capo で設定済みの _prevCapo を保持する
```

### playback authority 3層分離（Phase63で確立）

```
authority layer:
  audio engine (aEl.currentTime) = source of truth
  chartmode.js は aEl に直接触らない（seekTo 経由のみ）

notification layer:
  timeupdate → line highlight / perform sync / tapmode
  visual playback rendering の responsibility は持たない

visual update layer（Chart Mode open 中のみ）:
  requestAnimationFrame ループ（_rafLoop）
    └→ 毎フレーム _getAudioEl().currentTime を読んで updateChartPlayback()
    └→ interpolation なし（authority = audio engine のまま）

単発更新:
  pause / seeked / ended → app.js が updateChartPlayback() を1回呼ぶ

rAF lifecycle:
  openChartMode()  → _startRafLoop()
  closeChartMode() → _stopRafLoop()
```

### seek authority（Phase60で確立）

```
seek authority = createTimingModel() が生成した normalized measure model の startTime
raw downbeats の直接参照は禁止。

seekTo = transport mutation boundary（chartmode.js は transport state を持たない）。
aEl.currentTime の書き換えは app.js のみが行う。
```

### pickup-aware measure numbering（Phase61で確立）

```
measure identity（mi）と display numbering semantics は分離する。

mi:      GridViewModel の 0-based index（data layer identity）
表示番号: getDisplayMeasureNumber(mi, isPickup) が決める（render phase）

detectPickupMeasure() の判定条件:
  条件A: measures[0] の長さ < normalized median measure length × 0.75
  条件B: measures[1〜N] の長さが中央値の ±30% 以内（正常範囲の確認）
  → 2条件 AND で pickup と判定

表示: pickup 小節0 → "0"、以降 1, 2, 3 ...（通常は 1, 2, 3 ...）
```

### repair の設計思想

```
音楽的な「演奏の揺れ」（タメ・シンコペ・グルーヴ）は直さない。
madmom が明らかに道を踏み外した時だけそっと補助する。
「自信がないなら触るな」を基本方針とする。

repair default OFF: heuristic の誤補正リスクが未評価なため。
```

### Issue #45 failure taxonomy（Phase59で確立）

| Type | 原因 | 自動補正可否 |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats） | 不可 |
| Type B | pickup measure（弱起小節）| 番号補正: 完了（Phase61）/ alignment: 将来候補 |
| Type C | beat resolution mismatch（半テンポ検出等） | 不可 |
| Type D | 局所 drift → 全体伝播 | B案（repairDownbeats）で対応可 |

Type A/C は A案（手動修正UI）のみで根治可能。
Type D は今回調査した4曲では未発生（発生ケース収集中）。

### DevTools 診断

```javascript
// Phase59時点: window.__TIMING_DEBUG__（chartmode.js が書き込む）
window.__TIMING_DEBUG__ = {
  raw:         { beats, downbeats },
  diagnostics: analyzeTiming() の結果,
  repair:      repairDownbeats() の結果（repair:false なら null）,
  normalized:  { beats, downbeats },
}

// 将来: window.__CS_DEBUG__ に統合予定（debug API 整理フェーズ）
```

### Chart Mode slot DOM invariant（Phase57で確立）

```
semantic slot:  常に固定（expandToSlots の結果）
slot DOM:       全 slot（onset / carry / empty）を常に生成する
active lookup:  data-slot-index 属性経由（逆引き不要）

timing / layout / presentation の3層分離:
  semantic slot  → timing unit
  slot DOM       → fixed grid
  chord label    → visual presentation（--duration-slots CSS変数で幅制御）
  playhead       → measure直下 continuous overlay
```

---

## 10. PICKER_IDS による用途別ファイル管理（Phase60.5で確立・Phase64で実装）

```javascript
// project.js で export
export const PICKER_IDS = {
  audio:       'ccs-audio',
  chord:       'ccs-chord',
  projectOpen: 'ccs-project-open',
  projectSave: 'ccs-project-save',
};
```

Chrome は showOpenFilePicker / showSaveFilePicker の id ごとに「最後に使ったフォルダ」を記憶する。
用途別に id を分けることで、音声・コード・プロジェクトそれぞれのフォルダが独立して記憶される。

**AbortError ガード必須:**
```javascript
try { ... } catch (err) {
  if (err.name === 'AbortError') return;  // キャンセルは正常
  // ...
}
```

**Chrome audio MIME タイプ注意:**
`'audio/*'` は Chrome で受け付けられない。個別 MIME タイプを明示する必要がある。
```javascript
// ✅ 正しい
'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'], 'audio/ogg': ['.ogg'], ...
// ✗ 誤り（Chrome で動作しない）
'audio/*': ['.mp3', '.wav', ...]
```
