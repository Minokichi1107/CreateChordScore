# アーキテクチャ概要

> 最終更新: Phase59完了時点

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
| analysisLoader.js | analysis.raw の validate / sanitize / normalize → project.analysis 生成 | Phase41 |
| timing.js | TimingModel（beat / measure grid 構築・quantize）。外部依存ゼロ。Phase59で diagnostics / repair / normalized pipeline 追加 | Phase41 |
| chartmode.js | Chart Mode UI・GridViewModel 生成・playback sync（projection renderer） | Phase41 |

### 依存関係ルール

- `app.js` がオーケストレーター。モジュール間の連携は `app.js` 経由を原則とする
- モジュール間の直接操作禁止（例: `editor.js` → `audio.js` の直接呼び出しは禁止）
- `project.js` はデータ管理・変換に限定（UI操作を含まない）
- `modals.js` はUI lifecycle と callback通知のみ。state mutationは app.js が担当
- `tokens.js` は domain-level utility。どのモジュールからも参照可（app.js 経由不要）
- `analysisLoader.js` は analysis data の ingestion 専用。UI / DOM / project.lines に触らない
- `timing.js` は外部依存ゼロ。chartmode.js のみが import する（pure functions のみ・DOM / global state に触らない）
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
  id,        // UUID（IndexedDB参照キー）
  title,
  artist,
  beats,
  audioFile,
  lines[],
  palette[]
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

この原則により：
- serialize は必ず token object をそのまま保存する
- import / migration は raw 文字列から token を生成する（逆引き禁止）
- 表示文字列を DB lookup key や比較に使ってはならない

将来 simile / Nashville / Roman numeral / slash bass 等が追加されても
この原則は変わらない。

### renderer の projection 責務（Phase44-Step4 確定）

| renderer | projection | 方式 |
|---|---|---|
| chartmode.js | あり | render 時に `transposeChord(chord, -capo)` で変換 |
| perform.js | なし（mutated state renderer） | app.js の destructive model で変換済みの `c.chord` をそのまま render |
| editor.js | なし（mutated state renderer） | 同上 |

---

## 7. 将来予定

### chordEntry.js 拡張（Phase39以降）

Phase39-5で app.js との接続完成。現在の実装範囲：
- `openAddChord(idx)`
- `insertAt` state管理
- `addChord` / `addSep`（addSep は barline canonical 生成）
- キーボードハンドリング（Enter / Escape / IME guard）
- `isChordLikeInput` domain validation

Phase39以降の拡張予定：
- insertion cursor 化
- keyboard-first chord entry（insertion model 再設計）
- simile token 挿入UI
- token shorthand（`/`→barline、`ss`→sim. 等）

### Issue #26 — barline → bars[] 移行パス

現在の token stream モデル（`[token, barline, token]`）から、
将来の bars 構造（`bars[].chords[]`）への移行に備えた設計：

- `isSepToken()` が access layer として確立（Phase39-3/4）
- 新規生成は `{ type: 'barline' }` canonical（Phase39-4）
- 旧データは `isSepToken()` で透過的に扱える
- storage migration は Issue #26 設計フェーズで判断

### その他将来予定
- モジュールが肥大化した場合は責務単位での再分割を検討
- 機能追加・既知課題は `current-issues.md` を参照

---

## 8. カポ設計の移行状態（Phase43 audit 確認）

現在プロジェクト内でカポの扱いが2つの方式で混在している。

### 旧方式（editor / palette / importUndo）

capo change → `c.chord` を直接書き換える（destructive mutation model）

```js
// app.js capo changeイベント
const semitones = -diff;
project.lines.forEach(line => {
  line.chords.forEach(c => { c.chord = transposeChord(c.chord, semitones); });
});
```

### 新方式（chartmode.js / Phase43以降）

capo change → 表示時のみ変換（display projection model）
`analysis.raw` は実音canonical として不変

```js
// chartmode.js _renderChartGrid
chordEl.textContent = _transposeChord(cell.chord, -capo); // render時のみ
```

### 既知の制約

- `importUndoStack` はフォーム音スナップショットを保存するため、
  capo変更後にUndoすると chord と capo の整合性が保証されない
- `analysis.raw` の実音canonical は全経路で保護されている（✅ 確認済み）

### 移行方針

この混在は意図的な移行途中の状態。
全面的な projection 化は editor / perform / import / save-load 全体に
波及するため大規模な設計変更になる。
将来の semantic / projection redesign フェーズで統合を検討する。

---

## 9. Chart Mode timing pipeline（Phase59で確立）

### normalized timing pipeline

raw analysis を直接 `createTimingModel()` に渡さない。
`buildNormalizedTimingAnalysis()` を経由することで
timing normalization / diagnostics / repair を preprocessing として分離する。

```
raw analysis（project.analysis）
    ↓
timing.js: buildNormalizedTimingAnalysis()   ← 全 consumer の入口（pure function）
    ├─ analyzeTiming()    drift 診断（常に実行・副作用なし）
    └─ repairDownbeats()  continuity-aware repair（repair: true 時のみ・default OFF）
    ↓
normalized timing source { beats, downbeats, diagnostics, repair }
    ↓
chartmode.js: buildGridViewModel()
    ↓
createTimingModel()                          ← 消費者のまま（シグネチャ変更なし）
```

将来の perform.js / click seek / waveform sync も同一 timing source を参照できる。

### 責務境界ルール

```
timing.js:
  pure functions のみ
  DOM / global state / window に触らない
  window.__TIMING_DEBUG__ への書き込みは呼び出し側の責務

chartmode.js:
  window.__TIMING_DEBUG__ への書き込み責務を持つ
  buildGridViewModel() が normalized pipeline の呼び出し元

createTimingModel():
  消費者のまま（preprocessing を受け取るだけ）
  repair ロジックを埋め込まない
```

### repair の設計思想

```
音楽的な「演奏の揺れ」（タメ・シンコペ・グルーヴ）は直さない。
madmom が明らかに道を踏み外した時だけそっと補助する。
「自信がないなら触るな」を基本方針とする。

repair default OFF: heuristic の誤補正リスクが未評価なため。
                    現段階では observational / research mode を優先。
```

### Issue #45 failure taxonomy（Phase59で確立）

| Type | 原因 | 自動補正可否 |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats） | 不可 |
| Type B | pickup measure（弱起小節） | 限定的（設計要） |
| Type C | beat resolution mismatch（半テンポ検出等） | 不可 |
| Type D | 局所 drift → 全体伝播 | B案（repairDownbeats）で対応可 |

Type A/C は A案（手動修正UI）のみで根治可能。
Type D は今回調査した4曲では未発生（発生ケース収集中）。

### DevTools 診断

```javascript
window.__TIMING_DEBUG__ = {
  raw:         { beats, downbeats },        // 変更前の生データ
  diagnostics: analyzeTiming() の結果,     // 常に書き込み
  repair:      repairDownbeats() の結果,   // repair:true 時のみ
  normalized:  { beats, downbeats },        // createTimingModel に渡した最終値
}
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
