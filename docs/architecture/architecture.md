# アーキテクチャ概要

## 0. Overview（全体像）

CreateChordScoreは以下の主要サブシステムから構成される。

```
音声・コード解析
  ChordMini API → analysisLoader.js → project.analysis
        │
        ▼
Chart Mode（表示・演奏用グリッド）
  chartmode.js が GridViewModel を生成・描画
  projection renderer（app.js経由でnormalizedを注入される）
        │
        ▼
Analysis Editor（解析結果の手動編集・§12）
  Editor Session（buffer/selection/search）
        │
        ▼
  Editing Commands（単一編集・複数編集・位置編集・検索置換）
        │
        ▼
  UI Projection（deriveEditorMode等）
        │
        ▼
  Decorator Layer（Selection Highlight / Boundary Handle / EditPoint Marker）
        │
        ▼
Project Repository（保存・復元・§11）
  IndexedDB "projects" store が正本
```

### 設計の背骨（このプロジェクト全体を貫く考え方）

```
Authority（正本） → Projection（導出） → Rendering（描画）
```

状態は必ずどこか1箇所が正本（Authority）を持ち、それ以外は正本から
都度導出される一時値（Projection）として扱う。Projectionを直接
書き換えることはしない。この考え方はTiming Pipeline・Analysis Editor・
Search Engineを含む、本プロジェクト全体で一貫して採用している。

### 用語定義

| 用語 | 意味 |
|---|---|
| Authority | 唯一の正本。ある状態について、書き込み権限を持つ唯一の場所 |
| Single Writer | Authorityへの唯一の更新窓口となる関数（例: `moveBoundary()`） |
| Projection | Authorityから導出される表示・UI状態。直接書き換えない |
| Derived Cache | Authorityから一意に再計算できるキャッシュ（Projectionの一種。例: `selection.boundaryIndex`） |
| Runtime Cache | 実行時のみ保持するキャッシュ全般（永続化しない。Derived Cacheを含むより広い概念。例: `project.analysis.normalized`） |

Derived Cache と Runtime Cache の違い：Derived Cacheは「元になる値から一意に
再計算できる」という導出の明確さを指す狭い概念。Runtime Cacheは「永続化しない
実行時データ」という保存範囲を指す広い概念で、Derived Cacheを包含する。

### 読む順番の目安

| 知りたいこと | 参照先 |
|---|---|
| 今何ができるか（機能一覧・モジュール構成） | §1〜3 |
| 状態はどこに集約されているか | §4 |
| Chart Modeのタイミング処理の仕組み | §9 |
| Analysis Editorの内部構造 | §12 |
| どの状態が正本（Authority）か | §13 |
| 検索・置換の仕組み | §14 |

### 開発フェーズについて

現在の開発状況・直近の変更点は `phase-status.md` を参照。
本ドキュメント（architecture.md）は「現在確定している設計」のみを記載し、
「Phase◯◯時点」のような進行中の経過は書かない（読んだ時点で古びるため）。

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
│   ├─ components.css    ← 複数モジュール共有／所有権未確定の残置分
│   ├─ modal.css         ← Phase86で分離（modals.js所有）
│   ├─ chord-entry.css   ← Phase86で分離（chordEntry.js所有）
│   ├─ library.css       ← Phase86で分離（app.js Library UI所有）
│   ├─ analysis-editor.css ← Phase86で分離（app.js Footer UI所有）
│   ├─ tapmode.css       ← Phase86で分離（tapmode.js所有）
│   ├─ chart.css         ← Phase86で分離（chartmode.js所有）
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
│   ├─ chartmode.js      ← Phase41で新設
│   ├─ analysisSession.js  ← Phase86-2で新設（Analysis Editor Session Layer）
│   └─ analysisCommands.js ← Phase87で新設（Analysis Editor Command Layer）
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
└─ docs/
```

---

### CSS ownership（Phase86で確立）

```
CSSファイルの分割単位は「見た目の種類（editor系/modal系等）」ではなく、
「そのDOMを生成するJSモジュールの所有権」で決める。
```

Phase86の棚卸しで、components.cssの全セレクタが既にモジュール固有namespace
（`chart-*` → chartmode.js、`aep-*` → app.js Footer UI、`library-*` → app.js
Library UI、`mac-*`/`insert-cursor*` → chordEntry.js、`modal-*`/`copy-list*`/
`diagram-string*` → modals.js、`tov-*`/`tap-ov-*` → tapmode.js）を持っており、
JSモジュール境界とCSS責務がほぼ一致していることが判明した。この事実に基づき、
「UI機能」ではなく「DOM生成元のモジュール」を分割基準として採用した。

複数モジュールから共有されるコンポーネント（`.speed-cluster`等）や、
所有権がまだ確定していないもの（`.scope-selector`等）はcomponents.cssに
残置する。この判断基準は今後 replace.css や diag-lock.css を切り出す際にも適用する。

---

## 3. JSモジュール構成

| モジュール | 責務 | 導入 |
|---|---|---|
| app.js | アプリ起動・状態管理・モジュール間調整（オーケストレーター） | 初期 |
| audio.js | 音声再生管理 | 初期 |
| editor.js | コード譜編集・譜面UI描画 | 初期 |
| chords.js | コード情報・ダイアグラム描画・lookup。検索マッチング専用のenharmonic正規化（`normalizeEnharmonic()`・Phase97） | 初期 |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理・Project Repository API（Phase73） | 初期 |
| csvImporter.js | CSV / JSON インポート・パース | 初期 |
| perform.js | 演奏モード状態管理・描画・スクロール同期 | Phase12 |
| tapmode.js | TAP Mode オーバーレイの状態・描画・入力制御 | Phase12 |
| replace.js | 置換機能（replace bar）の状態・UI・ロジック | Phase12 |
| modals.js | 軽量modal群（time / repeat / copy / diagram / chordEdit） | Phase33 |
| chordEntry.js | コード入力サブシステム（openAddChord / insertAt state管理 / transient preview） | Phase39-1 |
| tokens.js | musical token stream の分類・変換ユーティリティ（isChordToken / isSepToken / isNoChordToken / tokenToText） | Phase39-0 |
| idb.js | IndexedDB操作層（audio / chord_source / projects のローカル保存） | Phase32・Phase73で"projects" store追加 |
| analysisLoader.js | analysis.raw の validate / sanitize / normalize → project.analysis 生成。buildNormalizedTimingAnalysis() の呼び出し元（Phase64〜）。normalized の rebuild responsibility を集約。repairRule（Phase72）・sanitizeChords export（Phase74-C）を含む | Phase41 |
| timing.js | TimingModel（beat / measure grid 構築・quantize）。外部依存ゼロ。Phase59で diagnostics / repair / normalized pipeline 追加。Phase72-Bで applyAnchorRepair() 追加 | Phase41 |
| chartmode.js | Chart Mode UI・GridViewModel 生成・playback sync（projection renderer）。rAF playback loop ownership（Phase63〜）。解析編集モードの選択・境界移動UI（Phase74）。Collision Indicator projection（Phase92）。Boundary Handle Drag Editing（Phase93）・Hover + Direct Drag（Phase95-A2）・Decorator Inventory整理／Visual Hierarchy確立（Phase96）・Selection Hit-Test統一（Phase97） | Phase41 |
| analysisSession.js | Analysis Editor Session Layer。state primitiveの計算のみを担う（history push/pop・selection計算・editPoint確定等）。DOM/audio/Chart runtimeには一切触れない（§12参照）。Section Session（validateSectionInvariants / reconcile / getSections。Phase100-A）を含む。History snapshotは`{ buffer, sections }`形状（Phase104でbuffer単体から拡張） | Phase86-2 |
| analysisCommands.js | Analysis Editor Command Layer。「ユーザー操作1回」単位のbuffer mutation（copy/cut/delete/paste/merge/update/split/moveBoundary/addChord）を担う。DOM/Chart runtime/toastには触れない（[BOUNDARY INVARIANT]参照・§12）。Section Commands（create/rename/updateBoundary/deleteSectionCommand。Phase100-A）を含む | Phase87〜89 |

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
- `audio.js` / `tapmode.js` は `isEditingAnalysis` のようなコールバックを app.js から注入され、
  自身の判断でショートカットの発火可否を決める（依存の向きを逆転させない・Phase74-E）
- `analysisSession.js` / `analysisCommands.js` は DOM / Chart Mode runtime / audio runtime / toast を
  直接操作してはならない（[BOUNDARY INVARIANT]・§12参照）。state mutationとResult返却のみを責務とし、
  副作用の実行権限は app.js が持つ
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

### assetState（Phase65で確立・Phase66で実適用）

```javascript
assetState = {
  audioLoaded:    false,   // audio が使える状態か
  chordLoaded:    false,   // chord データが使える状態か
  restoreSettled: true,    // asset restore transaction 完了フラグ
}
```

```
[ASSET AUTHORITY INVARIANT]
assetState は runtime における asset loaded 状態の唯一の authority（single source of truth）。

DOM state や derived runtime state
  (button.classList / aEl.src / palette.length 等)
を authority source として参照してはいけない。
これらは assetState を「反映する（projection）」だけ。
```

API（app.js）：
- `setAudioLoaded(loaded, filename, opts)` / `setChordLoaded(loaded, filename, opts)`
  state更新 → UI同期 → banner評価 を1箇所に集約。`{silent:true}` で評価抑制可。
- `_evaluateBannerState()`
  assetState + project metadataの純粋なUI projection。
  `restoreSettled=false` の間（loadProj()のasync restore transaction中）は評価をスキップし、
  transient phaseでのbanner誤表示・flickerを防ぐ。
- `loadChordData` は ingest 専用。asset authority確立（`setChordLoaded`呼び出し）は呼び出し側の責務。

---

## 5. 起動フロー

```
DOMContentLoaded（async化・Phase73-C）
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
initLibrary()         ← Phase73-Cで追加
↓
restoreLastProjectOnStartup()  ← Phase73-C・73-Eでlistプロジェクト/lastOpenedProjectId経由に変更
```

---

## 5.5 debug observability layer（Phase66で確立）

`window.__CS_DEBUG__` は runtime state の getter projection layer。
DevTools から runtime state を観測するための唯一の窓口。

```javascript
window.__CS_DEBUG__ = {
  get timing()  { /* project.analysis から直接読む */ },
  get project() { /* project + assetState shallow clone */ },
  get chart()   { /* chartState + chartMeasuresPerRow */ },
  perf: { ... }, // getter projection（Phase70-Aで確立）
  dumpInvariants() { /* snapshot生成 + console出力 + return snapshot */ },
};
```

```
[DEBUG LAYER INVARIANT]
  debug layer は state を所有しない。
  runtime state → getter projection → DevTools

  禁止パターン:
    window.__CS_DEBUG__.perf.lastRAFDelta = dt;  // ← 書き込み禁止

  これは assetState/DOM の「authority ではなく projection」（Phase65）と同じ思想。
```

- `assetState` は shallow clone で返す（DevToolsからのmutation防止）
- `dumpInvariants()` はsnapshotをreturnする（二次解析のため）
- timing objectはreplace禁止（object自体の再代入はgetter構造を破壊する）
- `window.__TIMING_DEBUG__`（Phase59〜65）は廃止。timing診断は `__CS_DEBUG__.timing` getterに統合（Phase66）
- Phase55〜65のTEMP REPAIRブロック（`__CS_TRANSPOSE__` 等）はPhase66で削除済み

### perf instrumentation（Phase70-Aで確立）

chartmode.js が `_perfState`（lastRAFDelta / maxRAFDelta / longFrames / longFrameLog）を所有し、
`getPerfState()` をexportする。app.js側の `__CS_DEBUG__.perf` はこの戻り値をそのまま返す
getter projectionであり、他のgetter（timing/project/chart）と設計原則が統一されている。
計測スコープはChart Mode open中のみ（`_rafLoop`と同じ）。openのたびにリセットする
（タブ非アクティブ→open直後の巨大dtがstall判定に混入するのを防ぐため）。

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

### 新方式（chartmode.js / Phase43以降、Analysis Editor / Phase82以降）

capo change → 表示時のみ変換（display projection model）
`analysis.raw` は実音canonical として不変

Analysis EditorはPhase82でChord Projection API（`toDisplayChord()` / `toCanonicalChord()`、chords.js）へ移行した。
Analysis Editor内部のAuthority（`analysisEditor.buffer`）は引き続きCanonical Chord（raw）のままであり、
Footer表示・Rename dialog・AddChord・Search・Replaceの各UI境界でのみProjectionを行う。
Editor UIはCanonical Chordを直接扱ってはならず、変換は上記2関数のみを経由する
（詳細は`docs/handover/handover_phase82.md`参照）。

### 既知の制約

- `importUndoStack` はフォーム音スナップショットを保存するため、
  capo変更後にUndoすると chord と capo の整合性が保証されない
- `analysis.raw` の実音canonical は全経路で保護されている（✅ 確認済み）

### 移行方針

この混在は意図的な移行途中の状態（editor / palette / importUndoの旧方式のみ残存）。
Analysis EditorはPhase82でdisplay projection modelへ統一済み。
残る旧方式の全面的なprojection化は将来のsemantic / projection redesignフェーズで統合を検討する。

---

## 9. Chart Mode timing pipeline（Phase59〜Phase64で確立）

### 4層 architecture contract（Phase64で確立）

```
Layer 1: Persistence Domain
  analysis/{id}.json:
    raw                persisted canonical source（timing persistence の唯一の canonical source）
      raw.sections      Section構造（user-authored structural metadata。Phase103）。
                        ChordMini由来ではないが、既存の永続化スキーマとの一貫性を
                        優先しrawに保持する（[PERSISTENCE OWNERSHIP PRINCIPLE]・§12参照）
    repairRule         null または { version, type:'anchorDownbeat', beatTime }（Phase72）
  project.json:
    project.lines      コード譜本体
    project.id         UUID（system-wide authority key）
    capo / key / tempo UI state
    hasAnalysis        フラグのみ

Layer 2: Runtime Cache（project.analysis）
  NEVER persist / NEVER serialize / NEVER treat as source of truth
  analysis = {
    raw,               runtime-loaded canonical timing data（Persistence Layer からロードした canonical source）
    repairRule,        Phase72で追加。raw同様、独立フィールドとしてロードされる
    normalized,        timing専用補助データ（RUNTIME CACHE）
      ├─ beats          repair済み timing source
      ├─ downbeats      repair済み timing source
      ├─ diagnostics    analyzeTiming() 結果
      └─ repair         repairDownbeats() 結果
    bpm, timeSignature, chords, meta   runtime参照用（normalized とは別物・rebuild 責務なし）
  }

Layer 3: Chart Mode Runtime Domain（chartmode.js ownership）
  timingModel          createTimingModel() から生成（repairRule適用後）
  measures[]           startTime / endTime / slots 保証済み
  cursor / playback    rAF loop（Phase63〜）

Layer 4: UI Projection（capo依存はここだけ）
  chord label = transposeChord(chord, -capo)
  将来の Nashville / movable key / transpose preview もここに閉じ込める
```

### normalized の責務（Phase64で確定）

```
normalized = timing layer 専用の disposable derived cache
  analysis.raw から rebuild 可能であることを前提とする。
  rebuild 可能であることが、serialize 禁止・migration source 禁止の根拠。

含むもの:
  beats / downbeats（repair済み）
  diagnostics（analyzeTiming 結果）
  repair（repairDownbeats 結果）

含まないもの（analysis から直接取得する）:
  chords / timeSignature / bpm / meta
  ※ normalized を analysis 全体の代用品として使わない
    （musical/project layer と timing layer の境界が崩れる）

rebuild entry point:
  通常の rebuild entry point は loadAnalysis()（analysisLoader.js）。
  rebuild orchestration authority は app.js が持つ。
  将来 manual timing edit 等が入ると、loadAnalysis() を経由しない
  rebuild パスが必要になる可能性がある。その場合は app.js が
  直接 buildNormalizedTimingAnalysis() を呼び出す設計で対応する。

rebuild が必要なケース（主なもの）:
  - analysis 再読込（通常は loadAnalysis() 経由）
  - repair policy 変更
  - 将来の manual timing edit / timing semantics change

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
② analysis/{id}.json 読込      raw / repairRule を取得
③ loadAnalysis({ raw, repairRule })  normalized 生成（capo 非依存）
   project.analysis = { raw, repairRule, normalized, ... }
④ capo UI 復元（_prevCapo）    ← ③の後でよい（capo 非依存）
⑤ audio / chord 自動復元      isRestore=true で capo reset スキップ・
                              analysis関連処理は完全スキップ（Phase72-B hotfix）
⑥ refreshEditor()              全 runtime state が揃った後

[TIMING INVARIANT]
  normalized は capo 非依存。capo は Layer 4（UI Projection）のみに影響する。
  capo 変更では normalized rebuild 不要。

[OWNERSHIP INVARIANT]
  chartmode.js は persistence ownership を持たない。
  normalized timing data と projection inputs のみを受け取る。
  project.analysis の直接参照は app.js の責務（chartmode.js に持たせない）。

[PERSIST INVARIANT]
  normalized は disposable derived cache。
  serializeProject() は hasAnalysis フラグのみを保存する。
  normalized を serialize / migration source として扱わない。

[ANALYSIS AUTHORITY INVARIANT]（Phase72-Bで確立）
  analysis（raw / repairRule）の唯一の正本は analysis/{id}.json。
  IndexedDB復元経路（isRestore=true）はanalysisに一切触れない
  （コード進行データ復元のみを責務とする）。
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

### Chart Mode Correction Authority（Phase72で確立）

```
repairRule = 「結果」ではなく「意図」を保存する。
  良い例: { type: "anchorDownbeat", beatTime: 2.37 }
  悪い例: { measureStarts: [1.25, 3.75, ...] }（normalizedの先取り保存）

raw.beatsは絶対に変更しない。
pickup detection（既存）とanchor repair（新規）は別層として分離する。

[FINAL MEASURES PERSISTENCE PROHIBITION]
repair適用後のfinal measuresはderived runtime projectionであり、
analysis.json（persistence layer）へ保存してはならない。

[SINGULAR SHAPE]
repairRuleは単数（配列ではない）。複数repairの相互作用は意図的に対象外。
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
// Phase66以降: window.__CS_DEBUG__.timing getter で取得（§5.5参照）
window.__CS_DEBUG__.timing = {
  raw:         { beats, downbeats },
  diagnostics: analyzeTiming() の結果,
  repair:      repairDownbeats() の結果（repair:false なら null）,
  normalized:  { beats, downbeats },
}

// window.__TIMING_DEBUG__（Phase59〜65）は Phase66 で廃止済み
```

### Chart Mode slot DOM invariant（Phase57で確立・Phase68でcanonical/visual分離）

```
semantic slot:  常に固定（expandToSlots の結果）
slot DOM:       全 slot（onset / carry / empty / projectionEmpty）を常に生成する
active lookup:  data-visual-slot-index 属性経由（逆引き不要・Phase68でdata-slot-indexからrename）

timing / layout / presentation の3層分離:
  semantic slot  → timing unit
  slot DOM       → fixed grid
  chord label    → visual presentation（--duration-slots CSS変数で幅制御）
  playhead       → measure直下 continuous overlay
```

---

## 9.5 Chart Mode projection layer（Phase68〜69で確立）

### canonical timing space ≠ visual projection space

```
canonical timing space（timing.js / quantize / beats）— authority・変更なし
  measure.slots[].slotIndex   : actual slot index
  model.quantize(time)        : { measure, slot }（actual）
  model.getBeatPosition(time) : 0.0〜1.0（actual空間の比率）

        │ projection adapter（chartmode.js限定）
        ▼

visual projection space — 表示・interaction・highlight層
  data-visual-slot-index
  expandToSlots()の onset/carry/empty/projectionEmpty配置
  updateChartPlaybackのslot highlight対象
  hover ownership（Phase67）/ active ownership（Phase69）/ seek target exclusion を含む
```

```
[PROJECTION INVARIANT]
  canonical timing（measure.startTime/endTime, beats, quantize結果）は一切変更しない。
  projection は measure 0（pickup measure）の表示位置調整に限定される。
  playhead position（continuous）はremap対象外（discrete slot highlightingのみremap）。
```

### 単一変換源: projectPickupSlotIndex()

actual slot index → visual slot index の変換は `projectPickupSlotIndex()`（export）に集約する。
`expandToSlots()`（rendering）と `updateChartPlayback()`（highlight）の両方がこれを使うことで、
表示と再生位置のズレを防ぐ。右詰め基準（末尾slotが安定するよう ceil を使用）。

### projection authorityの集約

```
_renderChartGrid() で leadingOffset を一度だけ計算
    ↓
chartState.pickupLeadingOffset ─┬→ updateChartPlayback()
pickupCtx.leadingOffset ────────┴→ expandToSlots()
```

### carry regeneration invariant

canonical carry（actual slot space）は直接remapしない。
canonical carry durationはactual slot spaceに基づくため、そのままvisual slot spaceへ
持ち込むと圧縮後にdurationの重複・伸長が発生する。
onset ownershipのみがprojection対象であり、carry ownershipはvisual slot spaceで再生成する。

### projectionEmpty slot

```
projectionEmpty slot は visual slot authority を持たない（data-visual-slot-index 不在）。
これにより hover / playback highlight / seek の対象外であることが
DOM invariant として保証される（runtime conditionalによる除外ではない）。

データ表現: { type:'empty', projectionEmpty:true, measureIndex }
  - beatIndex を持たない（timing authorityを持たないことをデータレベルで保証）
  - data-visual-slot-index を付与しない（DOM属性レベルで保証）
  - chart-slot--beat（区切り線）も付与しない
```

projectionEmpty exclusionのownershipはrender DOM生成側（expandToSlots / _renderChartGrid）にあり、
playback側（updateChartPlayback）はこのDOM contractを前提として動作する（Phase69 audit済み）。

将来この不可侵性を緩める変更（projectionEmptyへのdata属性追加等）は慎重にレビューすること。

### スコープ境界

Phase68のpickup projectionは `mode==='full'`（downbeats検出成功）限定。
`mode==='beat-only'` でのpickup対応は別issue
（canonical measure grouping自体がpickupを考慮していないため、visual projectionだけでは解決できない）。

### .chart-slot--active（Phase69）

outline主体・低alpha（背景alpha .06）。`.chart-slot[data-visual-slot-index="N"]` セレクタを使用し、
visual slot spaceを対象とするprojection-aware playback highlightingを実現する。

視覚的レイヤー構造（役割分離）：
```
1. playhead（continuous motion）       — canonical timing space のまま（measure内 left%）
2. slot active（離散的 beat focus）    — visual slot space（Phase69で追加）
3. measure active（broad context）     — .chart-measure--active（背景・border）
```

### Chart Mode hover chord diagram（Phase67で確立）

```
ephemeral UI: tooltip は chartState に authority を持たない。
hover event → render だけで完結。state 化しない。

hover event → _showTooltip(chord, anchorRect)
            → findChord() → drawDiagram() → innerHTML
            → position 計算（実サイズで overflow 判定）
```

- single tooltip instance（body直下・`openChartMode`/`closeChartMode`とlifecycle連動）
- `data-chord` には `transposeChord(rawChord, -capo)` 済みの表示用chord名を格納
  （tooltip側はcapoを再適用しない・二重projection防止）
- event delegation（pointerover/out + relatedTarget guard）でchart-grid rootから委譲
- hover hitboxはscrollWidthベースのinteraction heuristic（暫定。正式なhitbox authorityは
  将来のhover hitbox分離フェーズで確立予定）
- 表示メニュー・`Shift+D`でON/OFF切替（localStorage: `cs.chartDiagHover`、デフォルトON）

### Chart Mode Collision Indicator（Phase92で確立・P1 v1）

```
GridViewModelの各slotが量子化（quantizeTime、最近傍slot方式）により
複数onsetを持つ場合、resolveCollision()が以下の優先順位で1件を選ぶ
（Phase91で実測確定した既存仕様）:
  1. confidence（高い方）
  2. duration（長い方）
  3. time（遅い方＝後発優先）

敗れたonsetはデータ（analysisEditor.buffer）としては消えず、
Chart Mode描画（Rendering層）のみから脱落する。この脱落を可視化するのが
Collision Indicatorの目的である。
```

**スコープ（P1 v1・normal pathのみ）**

```
onsetMap: slotIndex → { chosen, hiddenCount }
  chosen        resolveCollision()が選んだonset
  hiddenCount   同一slotで衝突し敗れたonsetの数（slot.onsets.length - 1）

hiddenIdsは持たせない（[Command Layer原則]と同様、ViewModelの責務を
「描画に必要な情報」に限定するため。将来「隠れたコードをクリックで
選択」する機能が必要になった時点で初めてID配列を追加する）。
```

[PICKUP COLLISION SCOPE INVARIANT]
Collision Indicator（P1 v1）はnormal path（`expandToSlots()`の通常経路）
のみを対象とする。pickup measure（`mode==='full'`かつ小節0）では
`remapPickupOnsetMap()`が視覚圧縮による**別種の衝突**（Stage2 collision：
同一quantized slotでの衝突ではなく、複数actual slotが同一visual slotへ
合流する際の衝突）を内部で解決しており、意味論が異なるためhiddenCountを
合算しない。pickup measureでのCollision Indicatorは将来のP1 v2として
別途スコープ化する（現状は表示されない＝既知の制約）。

**UI**

```
.chart-slot-collision（chart.css）
  Amber系ドット（--color-amber-rgb流用・新token追加なし。
  [DECORATOR VISUAL LANGUAGE PRINCIPLE]準拠）
  hover表示はtitle属性のみ（"+N hidden chord(s)"）。
  専用tooltip機構（Chart Mode hover chord diagram）は流用しない
  （診断インジケータとして必要十分なため、hitbox/lifecycle等の
  文脈を持ち込まない）。
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

---

## 11. Project Repository Architecture

```
Project Repository
（現在の実装は IndexedDB "projects" store）
    │
    ├─ Repository API（project.js）
    │    listProjects() / getProject() / saveProjectToDB() / deleteProject()
    │
    ├─ Restore Authority
    │    lastOpenedProjectId（localStorage）が「次回起動時に開く曲」の正本。
    │    updatedAt はライブラリの並び順にのみ使う（復元対象の判定には使わない）。
    │
    └─ Generation Counter
         非同期のプロジェクト読み込み中に、後から来た読み込みリクエストのみが
         project state への書き込み権限を持つ。古いリクエストの結果は破棄する。
```

### データの対象範囲

| 対象 | 保存場所 |
|---|---|
| project core data（id/title/lines/capo等） | Project Repository（IndexedDB "projects"） |
| audio / chord_source 実体 | idb.js assets store（既存・Phase32〜） |
| analysis実体（raw/repairRule） | analysis/{id}.json（既存・Phase42, 72） |
| customDiagrams | localStorage（project非依存） |

### Project Repository Invariants

1. **[PR-1]** Project core dataのcanonical sourceはIndexedDB "projects" store
2. **[PR-2]** レコード形状はserializeProject(project, uiState)の出力と同一
3. **[PR-3]** createdAt/updatedAt/schemaVersionはRepository層のみで管理し、serializeProject()の出力には混入しない

---

## 12. Analysis Editor Architecture

Analysis Editorは、Editor Session（状態）・Session Layer（state primitive）・
Command Layer（編集コマンド群）・UI Projection（表示モード導出）・
Decorator Layer（装飾描画）を主要コンポーネントとする編集サブシステムである。

Phase86-2〜89で、元々app.js内に集約されていた実装は以下の2層へ分離された。

```
Session Layer（analysisSession.js）      Command Layer（analysisCommands.js）
  = state primitiveの計算のみ              = 「ユーザー操作1回」= pushHistory()を伴う
  historyを積まない                        historyを積む（[AE-6]のUndo単位1操作ルール）
  例: refreshSelection / selectRange /      例: deleteSelectionCommand /
      setEditPointFields /                      copySelectionCommand / pasteSelectionCommand /
      activateSearchIndex（Phase90）             mergeSelectionCommand / updateChordCommand /
                                                  splitChordCommand / moveBoundaryCommand /
                                                  addChordCommand
```

両層とも共通の境界を持つ：state mutationとResult返却のみを行い、DOM操作・
Chart Mode runtime同期（setSelectedChordIds等）・toast・audio/focus/scrollといった
副作用は一切呼ばない（[BOUNDARY INVARIANT]参照）。副作用の実行はすべて app.js 側の
薄いラッパーが担う。

```
Analysis Editor
  Editor Session（app.js内 analysisEditor・createAnalysisSession()で生成）
    ├─ buffer            編集中の作業コピー（structuredCloneでraw.chordsから生成）
    ├─ history / future   Undo/Redo用スナップショット（structuredClone・past/futureスタック方式）
    ├─ selection (Derived Cache)
    │    ├─ chordIds        選択中のコードの_id（配列。単一〜複数選択に対応）
    │    ├─ boundaryIndex   chordIdsからbufferを検索して導いた派生値（左境界）
    │    ├─ anchorChordId   Shift+クリック範囲選択の起点
    │    └─ editPoint       挿入位置 { ownerId, measureIndex, slotIndex }（chordIdsと排他）
    ├─ search
    │    └─ { open, query, replaceText, matches, activeIndex, focusRequested }
    ├─ clipboard          編集セッションをまたいで永続化される（意図的仕様か検討の余地あり・Phase87 Findings）
    └─ dirty              未保存フラグ

  Session Layer（analysisSession.js・historyを積まないstate primitive）
      ├─ refreshSelection(session, chordIds?, anchorChordId?)   選択状態の唯一の同期窓口
      ├─ selectRange(session, anchorId, targetId)               Shift+クリック範囲選択のstate計算
      ├─ setEditPointFields() / clearEditPointField()           editPointの確定・解除
      ├─ pushHistory() / undoBuffer() / redoBuffer()            history/future⇄buffer入替
      └─ activateSearchIndex()（Phase90）                       検索結果のwrap-around index計算

  Command Layer（analysisCommands.js・pushHistory()を1回だけ呼ぶ「ユーザー操作1回」単位）
    単一編集
      ├─ splitChordCommand() / updateChordCommand()   コード追加・情報更新の実体（Phase88）
      ├─ deleteChordCommand()                          コードを削除（隣接吸収・自動選択。Phase87）
      └─ moveBoundaryCommand(boundaryIndex, newTime)   境界を書き換える唯一の窓口（Result Protocol対象外・§下記）

    複数編集
      ├─ deleteSelectionCommand()                     複数削除（単一選択時はdeleteChordCommandへ委譲）
      ├─ copySelectionCommand() / cutSelectionCommand()  コピー・切り取り
      ├─ pasteSelectionCommand()                       範囲に合わせて貼り付け（比率ベース）
      └─ mergeSelectionCommand()                       選択範囲を1コードへ結合

    位置編集
      ├─ addChordCommand()                             Add Here / aep-add の分割+リネームを
      │                                                 1トランザクションで実行（[UNDO TRANSACTION INVARIANT]・Phase89）
      ├─ buildPastePlan() / commitPastePlan()           そのまま貼り付け（絶対位置保持・Planning/Applying分離）
      └─ shiftSelectionRange(deltaSec)                  範囲シフト（Forward Wall Model・app.js残置）

    検索・置換（詳細は §14 参照）
      ├─ searchChords(buffer, query)                   pure function・matchIds配列を返す
      ├─ replaceCurrentMatch() / replaceAllMatches()    既存のupdateChordCommand等を利用
      └─ _activateSearchMatch()                         選択+シーク（UI層・app.js残置。
                                                          index計算のみactivateSearchIndex()へ委譲）

  UI Projection
    └─ deriveEditorMode(selection)   selectionから'idle'/'single'/'multi'/'edit-point'を導出する
                                      純粋関数。business logicの分岐条件に使わない。

  Decorator Layer（chartmode.js）
    ├─ Selection Highlight    chartState内、_renderChartGrid()のslotループ内でその場判定
    ├─ Boundary Handle        hover駆動のみ（Phase96で選択駆動版を廃止・統合。
    │                         `.chart-slot--boundary-hover`・app.js `_boundaryDragState`
    │                         がselection非依存でchordId起点にboundaryIndexを導出）
    ├─ EditPoint Marker       setEditPointMarker() / editPointMarker
    │                         （post-hoc DOM patch方式は廃止済み）
    ├─ Collision Indicator    GridViewModelのonsetMap経由（Projection・§9.5参照。Phase92）
    └─ Decorator Inventory    全Decoratorの棚卸し・Intent軸整理（Phase96・下記参照）
```

Derived Cache = 正本から常に再計算できるキャッシュ。正本（chordIds等）が変われば、
このキャッシュ（boundaryIndex等）も必ず再計算するか破棄する（保持したまま放置しない）。

Derived Cacheの例:
  - `selection.boundaryIndex` — `selection.chordIds`から導出
  - `analysisEditor.search.matches` — `search.query`とbufferから導出

### [BOUNDARY INVARIANT]（Phase87で確立）

```
analysisSession.js / analysisCommands.js は DOM / Chart Mode runtime /
audio runtime / toast を直接操作してはならない。
Session/Commandは state mutation と Result返却のみを責務とし、
副作用の実行権限は app.js が持つ。

例外を作らない（1行の副作用呼び出しであってもapp.js側に残す）。
```

### Result Protocol（Phase87で確立）

```
Command Layerの関数は共通のResult形状 { ok, reason?, selectedChordIds?, count? }
を返す。app.js側はr.okとr.reasonを見てtoast可否を判断し、
「エラー文言の所有権はapp.js」という原則が実装レベルでも一貫する。

例外:
  - moveBoundaryCommand(): ドラッグ操作等で1操作中に連続呼び出しされる
    可能性がある低レベルprimitiveのため、number|nullを返す（Result Protocol対象外）
  - buildPastePlan(): pure planning helperのため専用形状
    { ok, reason?, buffer?, newIds? } を維持する
    （commitPastePlan()がこれを受け取り統一shapeへ変換する）
```

### [UNDO TRANSACTION INVARIANT]（Phase89で確立）

```
ユーザーから「1回の操作」と認識される編集は、内部的に複数のbuffer mutation
を伴っても pushHistory() は1回でなければならない。

Phase79のcommitPastePlan（Paste系）で確立した原則を、addChordCommand
（Add Here / aep-add系のコード追加操作）にも適用したもの。
将来「分割+α」のような複合操作を追加する際も、この原則を踏襲する。
```

### getPasteOrigin() の依存方向（Phase87で確立）

```
getPasteOrigin() は内部で getTimeForGridPosition()（chartmode.js）を呼ぶため、
Command Layerへは移さずapp.js残置とした。副作用を持たない問い合わせ関数だが、
「状態操作層がUI描画モジュールに依存する」形は既存のモジュール依存ルール
（§3・chartmode.jsはapp.js経由のみ参照可能）に反するため。
```

### Analysis Editor Invariants

1. **[AE-1]** buffer が編集操作の唯一の対象。project.analysis.raw への直接書き込みは行わない
2. **[AE-2]** project（正本）への反映は保存（saveAnalysisEdit）時のみ行う
3. **[AE-3]** selection.boundaryIndex は _refreshSelection() 経由でのみ更新する（直接書き換えない）
4. **[AE-4]** buffer が丸ごと入れ替わる操作（reset/begin/delete/undo/redo）はすべて _refreshSelection() を呼ぶ
5. **[AE-5]** Undo/Redo は buffer 単位のスナップショット（structuredClone）
6. **[AE-6]** 一括操作（deleteSelection / replaceAllMatches / pasteAbsolute等）は
   内部で複数の変更を行っても _pushHistory() を1回だけ呼ぶ（Undo単位を1操作に保つ）
7. **[AE-7]** selection.chordIds と selection.editPoint は排他。
   editPoint は永続化されない一時的なUI状態であり、選択変化・project切替・
   Chart Mode再構築のいずれかで必ずクリアされる
8. **[AE-8]** Decoratorはselectionから導出されるProjectionであり、
   selection / editPointを変更してはならない（描画専用）
9. **[AE-9]**（Phase82）Editor UIはCanonical Chord（raw）を直接扱ってはならない。
   Canonicalとの変換は`toDisplayChord()` / `toCanonicalChord()`（chords.js）の
   2関数のみを経由する。対象はコード名（chord文字列）のProjectionのみで、
   id/duration/timing等を含むChordオブジェクト全体の変換は行わない

### [BOUNDARY EDIT AUTHORITY]

```
moveBoundary(boundaryIndex, newTime) が境界更新の唯一の窓口。
Invariant: left.end と right.start は常に同じ値になるよう更新する。

個別移動（単一選択）: selection.boundaryIndexが指す境界をmoveBoundary()で動かす。
範囲シフト（複数選択）: shiftSelectionRange()が「選択範囲の直前コードのend」と
  「選択範囲末尾コードのstart」の2箇所のみを可変とする（Forward Wall Model）。
  この2箇所以外は方向に関わらず一切変更しない設計のため、追加の状態管理
  （snapshot/totalDelta等）なしに往復操作の可逆性が保証される。
```

### [DECORATOR ADDITION RULE]

Chart Mode上に新しい装飾（Decorator）を追加する場合、以下のパターンに従う。

```
1. 対象を表すローカル状態をchartStateに追加する（例: editPointMarker）
2. その状態を更新する専用setter関数を新設する（例: setEditPointMarker）
3. 判定は_renderChartGrid()のslotループ内で行う（post-render DOM patchは導入しない）
4. 正本（selectionやeditPoint等）からの導出ロジックはapp.js側に置き、
   chartmode.js側は「渡された値を表示するだけ」の責務に留める

[Phase96での適用例] Boundary Handleは当初この例（boundaryHandleChordId /
setBoundaryHandleTarget）で実装されたが、hover駆動版（Phase95-A2）導入後に
選択駆動版の存在意義が薄れ、Phase96のDecorator Inventory整理で選択駆動版を
廃止した。ドラッグ確定時に渡すchordIdは、selection経由ではなくbuffer
から直接boundaryIndexを導出する方式（app.js `_boundaryDragState`）へ
差し替えている。ローカル状態・専用setterというルール自体は変わらないが、
「どこから正本を導出するか」は実装過程で見直されうる、という実例。
```

### [DECORATOR VISUAL LANGUAGE PRINCIPLE]

```
Decoratorは新しい機能ごとに新しい色を追加しない。
まず既存の視覚言語（色相・濃淡・線幅・形状・表示条件）で区別できないかを検討する。
同一概念（編集対象の階層等）は同系色で階層化し、異なる概念
（Playback=時間軸／EditPoint=挿入位置等）のみ別色を使う。

現在のDecorator視覚言語一覧:
| 要素 | 色 | 形 | 意味 |
|---|---|---|---|
| Playback | 青 | 面（進行） | 再生状態 |
| Selection | 緑（濃） | 面 | 編集対象 |
| Search候補 | 緑（薄・同一トークン流用） | 面（薄い） | 候補 |
| Boundary Handle | Amber | 左線 | 動かせる境界 |
| EditPoint | 紫 | 縦カーソル（点滅） | 挿入位置 |
```

### Decorator Inventory（Phase96で確立）

Chart Mode上に同時に存在しうる視覚装飾（Decorator）の一覧。
新規Decorator追加時は、まずこの表と照合し、既存Intentとの重複が無いか確認すること。

| Decorator | Intent（何を伝えたいか） | Layer | Primary/Secondary | 表示条件 | Exclusive（排他） |
|---|---|---|---|---|---|
| Playhead | 今どこを演奏しているか | Overlay | Primary | 再生中 | 共存可 |
| Active Slot | 今の拍を把握する（Playheadの補助） | Overlay | Secondary | 再生中 かつ 対象slot | 共存可 |
| Active Measure | 小節を見失わない（Playheadの補助） | Background | Secondary | 再生中 かつ 対象小節 | 共存可 |
| 拍線／拍頭 | 拍・小節の区切りを常に示す | Background | Primary | 常時 | 共存可 |
| Selection | 編集対象を示す | Background | Primary | 選択中 | **EditPointと排他** |
| Boundary Handle | 編集可能な境界を示す | Overlay | Primary | 編集中 AND hover AND 左境界あり（曲頭でない） | Selectionと共存可 |
| EditPoint | 挿入位置を示す | Overlay | Primary | selection.editPoint確定時 | **Selectionと排他** |
| Search候補（未アクティブ） | 検索結果の存在を示す | Background | Secondary | 検索中のみ | Selectionが視覚的に勝つ（共存可） |
| Search候補（現在の検索位置） | 今どの検索結果を見ているかを示す | Background | Primary（検索中のみ） | 検索中 かつ 現在地 | Selectionと事実上同一表現（共存可） |
| Collision Indicator | 隠れているコードの存在を警告する | Overlay | Secondary | 衝突時のみ | 共存可 |
| Correction Badge | 解析タイミング補正の状態を示す | Overlay | Secondary（開発者寄り） | 補正時のみ | 共存可 |
| Section Preview | 曲構造（Section）の範囲を示す | Background | Primary（Sectionという独自Intent） | チップクリックでPreview中のみ | Selection/Searchと共存可（selectionとは独立したstate） |

**[運用ルール] Decorator Usability Audit**
新規Decoratorを追加・変更する際は、Decorator Inventory表への追加に加えて
以下を確認する（Phase96のUIレビューで最も価値があったのは「表示を減らす」
ことではなく「ユーザーが意味を理解できないDecoratorを減らす」ことだった、
という教訓に基づく。表を作った後も形骸化させないための継続運用ルール）:
  ・目的（Intent）は何か
  ・対象ユーザーは誰か（演奏者向け／編集者向け／開発者向け）
  ・初見のユーザーが5秒以内に意味を理解できるか

### [ONE INTENT, ONE PRIMARY DECORATOR]（Phase96で確立）

```
同じIntent（伝えたい意味）を持つDecoratorが複数存在する場合、
そのうち1つだけをPrimaryとし、視覚強度を最大にする。
残りはSecondaryとして、Primaryより明確に弱い表現に留める。

[注記] Primaryは「Chart Mode全体で1つ」ではなく「Intent単位で1つ」。
Intentが異なれば、それぞれが独立してPrimaryを持ってよい
（例: Playhead=「再生位置」のPrimary、Selection=「編集対象」のPrimary、
EditPoint=「挿入位置」のPrimaryは、互いに競合しない別々のIntent）。

新規Decorator追加時は、Decorator Inventoryの「Intent」列を確認し、
既存Decoratorと同じIntentを持っていないか必ず評価すること。
同じIntentが既にPrimaryとして存在する場合、新規Decoratorは
Secondary（弱い表現）として追加するか、既存Decoratorへ統合することを検討する。

例（現在の再生位置という1つのIntentに対して）:
  Playhead       — Primary（唯一の強い表現）
  Active Slot    — Secondary（拍の把握を助けるだけ）
  Active Measure — Secondary（小節を見失わない程度）
```

背景（経緯）: Chart Modeの視覚装飾は個々には正しい役割を持っていたが、
「今どこを演奏しているか」という1つの意味を複数のDecorator（Playhead・
Active Slot・Active Measure）が同時に、かつ同程度の視覚強度で表現していたため、
実際に使う側からは「意味は複数あるはずなのに、知覚上は1種類にしか見えない」
という状態になっていた（Semantic は複数でも Visual が近すぎる、という
UI設計上よくある問題）。個々のDecoratorの実装は誤っていなかったが、
「主役が決まっていない」ことが根本原因だった。

### [VISUAL HIERARCHY]（Phase96で確立）

```
Decoratorは実装上の重要度ではなく、ユーザーが最初に知覚してほしい順番で
視覚強度を決める。視覚強度は Primary > Secondary を維持すること。

architecture.mdには視覚強度の設計意図（Primary/Secondaryの区分）のみを書き、
具体的な実装値（outline alpha値・border-width等）はchart.css側の
コメントに留める（WHAT/HOWの分離。THEME LAYER RESPONSIBILITYと同じ考え方）。

[Search Highlightの事例（Phase97〜98の試行錯誤を経て確立）]
候補が多数同時に表示されるDecorator（Search候補等）では、VSCodeの検索
ウィジェットと同じ「候補は同じ形のまま低い強度・現在地は同じ形のまま
高い強度」という設計に倣う。試行錯誤の過程で、一度は形状（ドット等の
追加装飾）による区別を試みたが、装飾が増えることでかえって画面が
うるさくなり効果も薄かった。最終的には形状を増やさず、候補の強度を
大きく下げることと、その強度値をテーマごとに調整すること
（THEME LAYER RESPONSIBILITY参照）の組み合わせで解決した。
教訓: 強弱だけの区別が機能しない場合、まず装飾を足す前に「弱い方の
強度が本当に十分弱いか」「テーマごとの基準色に対して強度が適切か」を
先に見直すこと。
```

### [THEME LAYER RESPONSIBILITY]（Phase97で確立）

```
theme.cssは色トークン（color / border-color等の値。alphaを含む
rgba()形式の色トークンも対象）を持つ。
Decoratorの状態表現そのもの（あるDecoratorにbackground/outline/
box-shadowを適用するかどうかという判断）はchart.css（Decoratorの
実装側）が責務を持つ。theme.cssで「chart.css側が定義していない
状態表現を追加する」形の上書きは行わない。

[明確化] これは「theme.cssにbackgroundプロパティの値を一切書けない」
という意味ではない。例えば--color-search-candidate-bgのように、
「この色トークンの強さ（alpha）をテーマごとに変える」ことは色
トークンの定義そのものであり許容される。禁止しているのは、
chart.css側の対象Decoratorに存在しない状態表現をtheme.css側だけで
独自に追加・復活させることである。
```

背景（経緯）: chart.css側でActive Measureの背景塗りを廃止したにも関わらず、
theme.cssのsilverテーマ専用オーバーライド（`body[data-theme="silver"] .chart-measure--active`）
に古い`background`定義が独立して残っており、シルバーテーマだけ旧デザインが
復活して見える不具合が発生した（実機検証で発見・修正済み）。原則として、
chart.cssを直せば全テーマへ反映される、という前提を保つための原則。

### [DECORATOR LEGIBILITY PRINCIPLE]（Phase102-Bで採用）

```
CreateChordScoreは鑑賞アプリではなく編集ツールである。Decoratorは
意味の伝達を最優先し、必要であればテーマとの調和より視認性を優先してよい。

運用ルール:
・色相（Hue）はテーマ間で統一し、alpha値・明度のみ背景の明暗に応じて
  調整する（Boundary Handle=Amberの既存パターンを踏襲）
・テーマ間の等価性は「同じRGBA値」ではなく「同じ役割だと一目で
  分かること」を基準とする
・彩度・明度の具体的な選択（原色寄り／中彩度等）は都度の判断に委ねる。
  本原則が定めるのは優先順位（視認性 > テーマ調和）のみ

[THEME LAYER RESPONSIBILITY]（Phase97）との関係:
  [THEME LAYER RESPONSIBILITY]は「色の値をどこで定義するか」という
  責務分離の原則であり、本原則（視認性優先）とは別の関心事。
  2つが競合する場面では本原則を優先する。
```

背景（経緯）: Section Preview（Phase102）が当初Selectionトークンを流用した
結果、重なると判別しづらいという課題が実機確認で判明した。「背景色と調和
させよう」とする微調整では視認性を損なうことが分かり、専用色相（ゴールド系）
へ変更する過程でこの原則を確立した。Section Preview以外の既存Decorator
（Selection / Search Highlight等）への適用可否は`current-issues.md`の
検討事項として別途管理する。

### Boundary Handle統合（Phase96で確立）

```
Boundary Handleは「選択版」（常時表示・selection.boundaryIndex駆動）と
「hover版」（Phase95-A2・hover駆動）の2種類が存在していたが、選択版を廃止し
hover版へ一本化した。理由: Phase95-A2でhoverだけでも境界編集できるように
なった時点で、「選択したから常時ハンドルが出る」という設計の存在意義が
薄れていた（Decorator Inventory棚卸しで発見）。

ドラッグ確定時に渡すchordIdは、selection経由ではなくbufferから直接
boundaryIndexを導出する（app.js: `_boundaryDragState`。selectionとは
独立したephemeral state）。これにより「選択中とは別のコードの境界を
hoverから直接ドラッグする」ケースにも対応している。
```

### Selection Hit-Test統一（Phase97で確立）

```
[HIT-TEST INVARIANT]
コードを表すslot（onset・carry。empty/projectionEmptyは対象外）は、
いずれも自分自身（slotEl）にdata-chord-idを持つ。従来はonsetセルのみ
ラベル（chart-chord-name、セル下部にのみ配置）にdata-chord-idがあり、
セル自身には無かったため、セル上部をクリックするとclosest('[data-chord-id]')
が失敗し、意図せずeditPointへ落ちる不具合があった（実機で発見・修正済み）。

[MEASURE NUMBER HIT-TEST INVARIANT]
.chart-measure-numはposition:absolute + pointer-events:noneとする。
position指定の無い通常ブロック要素のままだと、見た目は右上の小さい
数字だけでも、実際のDOM要素は小節の横幅いっぱいの帯としてレイアウト上の
場所を占有し、chart-slotsより前面でクリック・ホバーを横取りしてしまう
（実機で発見・修正済み）。装飾目的の要素はpointer-events:none等で
クリックを素通りさせることを、今後の新規Decorator追加時にも徹底する。

[POINTER CAPTURE INVARIANT]
setPointerCapture()は「ドラッグが確定した瞬間」まで呼び出しを遅らせる。
pointerdown時点で無条件にcaptureすると、ドラッグしないプレーンな
クリックでも後続clickイベントのe.targetが捕捉元要素に固定され、
data-chord-idを持つ子要素を正しく解決できなくなる（実機で発見・修正済み）。
```

### Search Engine: Enharmonic対応（Phase97で確立）

```
[SEARCH ENHARMONIC INVARIANT]
searchChords()の比較はnormalizeEnharmonic()（chords.js）を通した
正規化キー同士で行う。findChord()（CHORD_DB lookup）・表示・保存には
一切使わない（enharmonicを統合しないという既存方針は変えない。
検索マッチングという1箇所のみの例外）。

背景: Capo往復変換（画面表示 → toCanonicalChord()）の結果、
transposeRoot()の出力表記（シャープ/フラットどちらで返すか）は
「入力文字列にb/#が付いているか」に依存するため、bufferの実際の綴りと
異なる表記になるケースがあった（例: buffer='Eb', capo適用後の画面表示
'B'を検索語として入力 → toCanonicalChord('B',+4)='D#' となり、
'D#' !== 'Eb' で一致しない）。音は同じでも綴りが違うだけで検索が
機能しなくなる、異名同音特有の不具合だった（実機・実データで確認済み）。

[既知の制約] 検索欄は「画面に表示されている名前」で検索する設計であり、
実音（canonical）そのものを直接入力すると、capo分の変換がもう一度
適用されて別の音になる（バグではなく設計上の入力仕様）。実音そのもので
検索したいという需要があれば、将来的な機能拡張として別途検討する
（current-issues.md Future Features参照）。
```

### Known Design Gap

```
Analysis Editorの編集モデル（buffer）は無音プレースホルダー（chord:'N'）を
実在する編集対象として扱うが、Chart Modeの表示モデル（buildGridViewModel）は
Nを表示前に除外する。編集モデルと表示モデルの間に、何を編集対象と見なすかに
ついての設計上の差異が存在する。
```

詳細・対応状況は `current-issues.md` を参照。

### Section Subsystem（Phase98〜103）

```
Verse / Chorus のような曲構造単位（Section）を扱うAnalysis Editorの
サブシステム。詳細設計・データモデル・ライフサイクルは section-model.md
（[DOCUMENT AUTHORITY]・Sectionサブシステムの設計判断を集約する
設計ドキュメント）を参照する。本節では実装済みの構成要素の対応関係と、
Section機能から確立した設計原則のみを記載する。
```

**実装の対応関係**（S→A→B→Preview→Persistence→Historyの各段階）

| 段階 | 内容 | Phase | 実装箇所 |
|---|---|---|---|
| S. Specification | データモデル・境界コード増減ルール・Invariants確定（Design Freeze） | 98 | section-model.md |
| A. Session Layer | `validateSectionInvariants()` / `reconcile()` / `getSections()` | 100-A | analysisSession.js |
| A. Command Layer | `createSectionCommand` / `renameSectionCommand` / `updateSectionBoundaryCommand` / `deleteSectionCommand` | 100-A | analysisCommands.js |
| B. Editor UI | Section Bar・作成ダイアログ・Rename/Delete管理メニュー | 101-1〜3 | app.js |
| Preview Decorator | selectionとは独立したChart Mode上のハイライト（`_previewSectionId`） | 102・102-B | app.js / chartmode.js |
| Persistence | `analysis.raw.sections`。既存の`saveAnalysisFile()`等はAPI無変更のまま対応 | 103 | analysisLoader.js / app.js |
| History Integration | Section系4コマンドをpushHistory()経由でUndo/Redo対象化。history/futureのスナップショット形状を`{ buffer, sections }`へ拡張 | 104 | analysisSession.js / analysisCommands.js |

**データモデル**（詳細は section-model.md §4）

```javascript
Section = { id, type, name, startChordId, endChordId }
```

**Authority Scope**：Analysis Editor Session限定（`session.sections`。Runtime Authority）。
永続化先は `analysis.raw.sections`（Persistence Authority）。両者の関係は
[PERSISTENCE OWNERSHIP PRINCIPLE]（下記）に従う。

**[SECTION SESSION CONSISTENCY INVARIANT]（Phase100-Aで確立）**

```
Sectionコレクションは必ず getSections(session) 経由でのみ読む。
呼び出し側（Command Layer / Renderer / UI）はSectionの整合性修復
（reconcile）を行ってはならない（修復責務はreconcile()のみに集約する）。
```

**[SECTION HISTORY INTEGRATION]（Phase100-Aで確立・Phase104で解消）**

```
Section系4コマンド（createSectionCommand / renameSectionCommand /
updateSectionBoundaryCommand / deleteSectionCommand）は、Phase104で
pushHistory()を呼ぶよう統合された。呼び出し位置は既存Command
（deleteChordCommand等）と完全に同じ規則（バリデーション通過後・
実際の変更の直前）に揃えてある。

対応方法: history/futureのスナップショット形状を、buffer単体から
{ buffer, sections } へ拡張した（analysisSession.js の
_snapshotSession()・pushHistory()/undoBuffer()/redoBuffer()）。
buffer・sectionsはそれぞれ独立にstructuredCloneされるため、
一方の変更がもう一方へ波及することはない。

[Phase103での関連修正だった内容の解消] Phase103時点ではdirty（未保存
変更の有無）とhistory（Undo記録）が独立した責務として扱われ、
Section系コマンドはpushHistory()を呼ばずにstate.dirty = trueのみを
個別に呼んでいた。Phase104でpushHistory()呼び出しに統合したことで、
この個別dirty設定は削除し、既存コマンドと同じくpushHistory()内の
session.dirty = trueへ一本化した（二重管理の解消）。

[app.js側への影響確認（Phase104）] undoEdit()/redoEdit()は
undoBuffer()/redoBuffer()の戻り値がtrueであれば_refreshEditorView()
を呼ぶという既存フローのまま変更不要だった。_refreshEditorView()が
無条件にrenderSectionBar()を呼ぶため、undo/redo後のSection Bar再描画は
自動的に行われる。Section Preview（_previewSectionId）・▼メニュー
（_openSectionMenuId）の残留防止ガード（_syncSectionPreviewVisibility /
_syncSectionMenuVisibility）もrenderSectionBar()末尾から呼ばれる
既存の仕組みのため、undo/redoによるSection消滅にも自動的に対応できる
（Phase102・101-3で確立済みの仕組みがそのまま機能した）。

[既知の制約・将来対応] updateSectionBoundaryCommand()はPhase104時点で
app.js側から呼び出すUI（境界編集UI）が未実装のため、実質的に到達しない
（current-issues.md P2/P3参照）。History対応済みの実装として維持する
方針であり、将来UIが実装された際は、Section Previewが有効な状態で
境界がUndo/Redoされた場合にPreview側のchordIds（Derived Cache）が
追随して再計算されるか、別途確認が必要（現状は経路自体が存在しない
ため実害なし）。
```

### [PERSISTENCE OWNERSHIP PRINCIPLE]（Phase103で明文化）

```
ownership（生成元）と storage location（保存場所）は
必ずしも一致させる必要はない。

保存場所は、永続化スキーマとの整合性・既存APIとの互換性・
変更範囲の最小化を優先して決定してよい。ownershipの違いは
コード変更ではなく、ドキュメントコメント（[OWNERSHIP]）で
明文化すれば十分に伝わる。

[適用例] Sectionはユーザー定義の構造メタデータ（generation: User）
だが、raw.chords/beats/downbeats（generation: ChordMini）と同じ
analysis.raw配下（raw.sections）に保存する。既存の永続化スキーマ
（rawを丸ごとPOSTする1回の保存経路）を維持し、saveAnalysisFile()
等のAPI変更を避けるための判断（詳細はhandover_phase103.md参照）。

将来 lyrics / bookmarks / annotations / AI metadata 等の
ユーザー定義メタデータが追加される際も、この原則に従って
保存場所を判断できる。
```

### [EDITOR RESET AUTHORITY]（Phase103で明文化）

```
Analysis Editor終了時に破棄すべきephemeral stateは、
必ず resetAnalysisEditor()（唯一のリセット窓口。Cancel / Save成功 /
Project切替 / Chart Mode終了のすべてがここを経由する）に集約する。

編集中限定の新機能（selection/search/Section Preview等）を追加した
場合、対応するreset処理を同時にここへ登録すること。

[発見の経緯] Phase102で追加されたSection Preview（_previewSectionId）
がこの窓口への登録から漏れており、編集終了後も非編集のChart Mode表示に
ハイライトが残留するバグとしてPhase103の実機検証で発見された
（詳細はhandover_phase103.md参照）。
```

---

## 13. Authority Index

このプロジェクトの各状態について、「唯一の正本（Authority）」と「唯一の更新窓口（Single Writer）」の対応表。

Authorityには2種類ある。区別が必要な行は「種別」列に明記する。
- **Persistence Authority**: ディスク/DB上の永続データの正本
- **Runtime Authority**: メモリ上の実行時状態の正本（永続化とは別の関心事）

[AUTHORITY INDEX SCOPE]
Authority Indexには永続状態または唯一の正本のみを掲載する。
Runtime Projection・Derived Cache・Decorator状態はAuthorityではなく、
各Authorityから導出される一時状態として扱う（下記「13.1 Runtime Projection」参照）。

| 対象 | Module | Authority | 種別 | Single Writer |
|---|---|---|---|---|
| Project core data | project.js | Project Repository | Persistence | `saveProjectToDB()` |
| Analysis（raw/repairRule） | analysisLoader.js | analysis/{id}.json | Persistence | `saveAnalysisFile()` |
| Section（session.sections） | analysisSession.js | Analysis Editor Session | Runtime | `createSectionCommand()` 等4コマンド（analysisCommands.js） |
| Section永続化（raw.sections） | analysisLoader.js | analysis/{id}.json | Persistence | `saveAnalysisFile()`（Analysis本体と同一。raw丸ごとPOST時に含まれる） |
| 境界（コード間の時刻） | app.js | Analysis Editor | Runtime | `moveBoundary()` |
| 選択状態（chordIds/boundaryIndex/anchorChordId） | app.js | Analysis Editor | Runtime | `_refreshSelection()` |
| 挿入位置（editPoint） | app.js | Analysis Editor | Runtime | `setEditPoint()` / `clearEditPoint()` |
| クリップボード | app.js | Analysis Editor | Runtime | `copySelection()` |
| 検索入力状態（query/replaceText） | app.js | Analysis Editor | Runtime | `openSearchBar()` 等（search.query/replaceText） |
| 起動時の復元対象 | app.js | Restore Authority | Runtime | `updateLastOpenedProject()` |
| 再生速度 | audio.js | Playback | Runtime | `setSpeed()` |
| Asset読み込み状態 | app.js | assetState | Runtime | `setAudioLoaded()` / `setChordLoaded()` |
| Seek位置 | app.js | `aEl.currentTime`（audio要素） | Runtime | `seekTo()`（mutation boundary。chartmode.jsはconsumerでありwriterではない） |
| project.lines への変更（実行時） | app.js | app.js | Runtime | （app.js経由の各編集API） |
| project.lines の永続化 | project.js | Project Repository | Persistence | `saveProjectToDB()` |

既存の詳細な説明は各セクション参照：§4（assetState）／§9（timing pipeline authority、特に「playback authority 3層分離」§9のaEl.currentTime authority）／§11・§12（Project Repository・Analysis Editor）。

原則として、Authorityを持たないモジュールは状態を所有しない。状態変更はSingle Writerのみが行う。

---

### 13.1 Runtime Projection

以下は正本（Authority）ではなく、Authorityから都度導出される一時値である。
直接書き換えてはならない。正本が変化した際、これらは再計算されるか破棄される。

| Projection | Derived From | 導出関数 |
|---|---|---|
| editorMode | selection | `deriveEditorMode(selection)` |
| chartState（hover先のboundary対象） | pointerover対象chordId | `_setupBoundaryHoverEvents()`（Phase95-A2。selection非依存） |
| _boundaryDragState | ドラッグ対象chordId | `_getChordBufferIndex(chordId)`経由でboundaryIndexをその場導出（app.js。Phase96で選択駆動版から差し替え） |
| chartState.editPointMarker | selection.editPoint | `setEditPointMarker()` |
| chartState.searchMatchIds | analysisEditor.search.query + buffer | `setSearchMatches()` |
| analysisEditor.search.matches | analysisEditor.search.query + buffer | `searchChords(buffer, query)`（Phase97よりnormalizeEnharmonic()経由の比較） |
| GridViewModel slot.hiddenCount（Phase92） | measure.slots[].onsets（衝突数） | `resolveCollision()`呼び出しに付随する集計（normal pathのみ・§9.5参照） |
| chartState.sectionPreviewChordIds | _previewSectionId（app.js ephemeral）+ Section.startChordId/endChordId | `setSectionPreview()`（Phase102。selection/searchとは独立したstate。resetAnalysisEditor()でのクリアが必須・[EDITOR RESET AUTHORITY]参照） |

[PROJECTION AUTHORITY INVARIANT]
Projectionの更新窓口（setEditPointMarker()等）はchartmode.js側に置かれるが、
「いつ・何から再計算するか」の判断（正本からの導出ロジック）はapp.js側が持つ。
chartmode.js側は「渡された値を表示するだけ」の責務に留める（[DECORATOR ADDITION RULE]、§12参照）。

---

## 14. Search Engine

### 14.1 Overview

Analysis Editorに、コード進行に対する検索・置換機能を提供するサブシステム。
目的は「特定のコードが曲のどこに出てくるか」を素早く見つけ、必要なら一括で修正できるようにすること。

```
query
  ↓
searchChords()
  ↓
matches
  ↓
activeIndex
  ↓
_activateSearchMatch()（選択+シーク）
  ↓
selection
  ↓
Decorator（Search Highlight）
```

Engine（見つける）とUI層（選択+シークする）は分離されている。
`searchChords()` は pure function であり、将来ライブラリ検索・歌詞検索等が
同じ「buffer→matchIds」の考え方を再利用しやすい設計になっている。

[Phase90] `_activateSearchMatch()`内のindex計算（wrap-around処理と
`search.activeIndex`確定）は`activateSearchIndex()`（analysisSession.js・
Session Layer）へ抽出済み。selection同期・Chart Mode同期・audio seek・
DOM再描画は無変更でapp.js側に残置している（検索移動はbufferを変更せず
historyも積まない「navigation」のため、Command Layerではなく
Session Layerに分類される・§12参照）。

### 14.2 Search State

```javascript
analysisEditor.search = {
  open,             // 検索バーの開閉状態
  query,            // 検索文字列（Authority）
  replaceText,      // 置換文字列（Authority）
  matches,          // 検索結果のchordId配列（Derived Cache）
  activeIndex,       // 現在アクティブな検索結果のindex
  focusRequested,    // 開いた直後の自動フォーカス制御用
}
```

| 対象 | 種別 |
|---|---|
| query / replaceText（検索入力状態） | Authority |
| matches / activeIndex | Derived Cache（query + bufferから導出） |

### 14.3 Search Flow

```
User Input（検索欄への入力）
  ↓
search.query 更新
  ↓
searchChords(buffer, query)   ← pure function・buffer（実音・正本）のみ対象
  ↓
search.matches 更新
  ↓
searchGoToNext() / searchGoToPrev() / F3 / Shift+F3
  ↓
_activateSearchMatch(index)   ← 選択+シーク（UI層）
  ↓
selection.chordIds 更新 + aEl.currentTime 直接設定
  ↓
Decorator（Search Highlight・Selection Highlightの薄い版として表現）
```

検索対象はbuffer（実音・正本）のみ。capo変換後の表示名は対象外
（Capo-aware Editingは将来の独立フェーズ候補・current-issues.md参照）。

### 14.4 Replace

| コマンド | 対象 | Undo単位 |
|---|---|---|
| `replaceCurrentMatch(newName)` | 単体置換。既存の`updateChord()`をそのまま呼ぶ | 1操作 |
| `replaceCurrentAndAdvance(direction)` | 置換して次/前へ。置換欄のEnter/Shift+Enterから呼ばれる | 1操作 |
| `replaceAllMatches(newName)` | 一括置換。bufferへ直接書き込み、`_pushHistory()`は1回だけ | 1操作（[AE-6]準拠） |

置換はSearch Engine自身のロジックを持たず、既存のEditing Commands
（updateChord等）を呼ぶか、bufferを直接操作した上でAE-6（Undo1操作の原則）
に従う。Projectへは一切触れない（bufferのみを操作する、という
Analysis Editor全体の原則[AE-1]をそのまま踏襲する）。

### 14.5 Search Invariants

```
[SEARCH-1] matches は buffer + query から常に再計算できる（Derived Cache）
[SEARCH-2] Replace系コマンドは buffer のみを変更する（project.analysis.rawには触れない）
[SEARCH-3] 検索結果のSelectionは、既存のselection authorityにそのまま乗る
           （検索専用のselection機構は持たない）
[SEARCH-4] Searchはplayback authority（aEl.currentTime）を直接更新できるが、
           これは_activateSearchMatch()経由のみ（既存のseekTo系mutation boundaryと同一）
[SEARCH-5] Search Highlightは専用色を持たない（[DECORATOR VISUAL LANGUAGE PRINCIPLE]、§12参照）。
           Selectionの濃淡（薄いalpha・細枠）で「候補」を表現する
```
