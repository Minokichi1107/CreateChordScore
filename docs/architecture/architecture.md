# アーキテクチャ概要

> 最終更新: Phase39完了時点

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
│   ├─ app.js
│   ├─ audio.js
│   ├─ editor.js
│   ├─ chords.js
│   ├─ project.js
│   ├─ csvImporter.js
│   ├─ perform.js
│   ├─ modals.js
│   ├─ chordEntry.js
│   ├─ tokens.js
│   └─ idb.js
├─ resource/
│   ├─ audio/
│   ├─ chords/
│   ├─ icons/
│   └─ projects/
├─ docs/
├─ tools/
├─ scripts/
└─ testdata/
```

---

## 3. JSモジュール構成

| モジュール | 責務 |
|---|---|
| app.js | アプリ起動・状態管理・モジュール間調整（オーケストレーター） |
| audio.js | 音声再生管理 |
| editor.js | コード譜編集 |
| chords.js | コード情報・ダイアグラム・lookup |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理 |
| csvImporter.js | CSVインポート |
| perform.js | 演奏モード関連処理 |
| modals.js | 軽量modal群（time / repeat / copy / diagram / chordEdit） |
| chordEntry.js | コード入力サブシステム（openAddChord / insertAt state管理 / transient preview） |
| tokens.js | musical token stream の分類・変換ユーティリティ（isChordToken / isSepToken / isSimileToken / tokenToText） |
| idb.js | IndexedDB操作層（audio/chord_sourceのローカル保存） |

### 依存関係ルール

- `app.js` がオーケストレーター。モジュール間の連携は `app.js` 経由を原則とする
- モジュール間の直接操作禁止（例: `editor.js` → `audio.js` の直接呼び出しは禁止）
- `project.js` はデータ管理・変換に限定（UI操作を含まない）
- `modals.js` はUI lifecycle と callback通知のみ。state mutationは app.js が担当
- `tokens.js` は domain-level utility。どのモジュールからも参照可（app.js 経由不要）
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

### token access layer（tokens.js）

```javascript
isSepToken(token)    // barline / sep / '/' の全形式を吸収
isChordToken(token)  // chord token 判定（プロパティ存在判定）
isSimileToken(token) // simile token 判定
tokenToText(token)   // DOM表示用変換（lookup key には使わない）
```

### 責務分離ルール

| 用途 | 使用値 |
|---|---|
| 内部処理（lookup / compare / callback） | `c.chord`（raw） |
| DOM表示 | `tokenToText(c)` |
| separator判定 | `isSepToken(c)` |

`tokenToText()` を lookup key / compare / storage に使うことは禁止。

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
