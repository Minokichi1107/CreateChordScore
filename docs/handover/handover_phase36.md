# 引き継ぎ: Phase36完了 — Hover Overlay Interaction Redesign

## 作業状態
- ブランチ: main
- 直前作業: Phase36完了（hover popup撤去・click semantics再設計・diagLock gesture追加・diagOn削除）

---

## 今回の完了内容

### 変更ファイル
- `editor.js` — hover popup callback削除・click/longpress event再設計
- `app.js` — `onChordHover` 縮退・`showPopup`/`hidePopup` callback削除・`diag-toggle` ハンドラ削除・`diagOn` state削除・diagLock長押し解除追加
- `index.html` — `diag-toggle` ボタン削除

---

## Phase36-1 — hover popup停止

### 変更内容
`onChordHover` から `showPopup` 呼び出しを削除し、右パネル更新のみに縮退。

```js
// Before
onChordHover: (chord, element) => {
  if (!canUpdateDiagFromHover()) return;
  updateDiagRight(chord);
  showPopup(chord, element);
},
showPopup: (chord, element) => { showPopup(chord, element); },
hidePopup: () => { hidePopup(); },

// After
onChordHover: (chord) => {
  if (!canUpdateDiagFromHover()) return;
  updateDiagRight(chord);
},
```

`editor.js` の `mouseleave → hidePopup` ハンドラ、callback destructuring の `showPopup` / `hidePopup` も削除。

### 設計判断
- `showPopup` / `hidePopup` 関数本体・popup DOM・popup CSS は今フェーズでは削除しない
- まず「使わなくする」ことで interaction regression を止め、DOM/CSS 削除は次フェーズ以降
- hover → 右パネル一本化により、二重 preview（popup + 右パネル）の冗長さが解消された

---

## Phase36-2 — click semantics再設計（longpress = diagLock）

### 背景
dblclick = diagLock を実装していたが、ブラウザの event order の問題で成立しなかった。

```
click → onChordEdit → openChordEdit() 即時実行
click
dblclick → この時点でmodalが既に開いている
```

click delay（220ms）を試みたが、race condition が残った。

### 解決策: longpress（400ms）に変更

```js
let pressTimer = null;

tag.addEventListener('mousedown', e => {
  if (e.target.classList.contains('del-x')) return;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (callbacks.onChordDblClick) callbacks.onChordDblClick(idx, ci, c.chord);
  }, 400);
});
tag.addEventListener('mouseup', () => {
  clearTimeout(pressTimer);
});
tag.addEventListener('mouseleave', () => {
  clearTimeout(pressTimer);
});
tag.addEventListener('click', e => {
  if (e.target.classList.contains('del-x')) return;
  if (pressTimer === null) return;
  clearTimeout(pressTimer);
  pressTimer = null;
  onChordEdit(idx, ci);
});
```

### 動作フロー
```
短押し（400ms以内）→ click → modal open（即時）
長押し（400ms以上）→ longpress → diagLock（modalは開かない）
```

### 設計判断
- `onChordDblClick` callback名は変更しない（app.js変更不要）
- `pressTimer = null` を longpress 完了時にセットすることで、その後の click イベントを無視
- `dblclick` イベントリスナーは削除（longpressに一本化）
- click即時実行に戻したため、modal open の体感遅延も解消

---

## Phase36-3 — diagLock解除 gesture追加

右パネルヘッダー（`.phdr`）の長押しで `unlockDiag()` を呼ぶ。

```js
const phdr = document.querySelector('#panel-right .phdr');
let phdrPressTimer = null;

phdr.addEventListener('mousedown', () => {
  if (!diagLocked) return;
  phdrPressTimer = setTimeout(() => {
    phdrPressTimer = null;
    if (!diagLocked) return;
    unlockDiag();
  }, 400);
});
phdr.addEventListener('mouseup', () => { clearTimeout(phdrPressTimer); });
phdr.addEventListener('mouseleave', () => { clearTimeout(phdrPressTimer); });
```

### 設計判断
- hit area は `#diag-lock-badge`（🔒 glyph）単体ではなく `.phdr` 全体にした
- timer発火時に `if (!diagLocked) return` を二重チェック（ESC race condition対策）
- lock / unlock の gesture が対称（chord-tag長押し → lock、phdr長押し → unlock）

---

## Phase36-4 — diag-toggle / diagOn 削除

### 削除内容
- `index.html`: `<button id="diag-toggle">` 削除
- `app.js`: `let diagOn = true` 削除
- `app.js`: `getEditorUIState()` の `diagOn` 削除
- `app.js`: `diag-toggle` イベントハンドラ削除
- `app.js`: `DOMContentLoaded` の `diagOn` 復元ブロック削除
- `editor.js`: destructuring から `diagOn` 削除

### 設計判断
- `editor.js` の `renderLines` は `diagOn` を destructuring していたが実際には参照していなかった
- `localStorage` の `cs_diagOn` キーは放置（害なし）

---

## regression確認済み
- hover → 右パネルのみ更新 ✅
- hover popup が出ない ✅
- 短押し → modal即時open ✅
- 長押し → diagLock発動 ✅
- 長押し後にmodalが開かない ✅
- phdr長押し → diagLock解除 ✅
- ESC diagLock解除（既存）✅
- Lキー diagLockトグル（既存）✅
- 表示メニューからダイアグラムトグル消去 ✅
- 右パネルダイアグラム正常表示 ✅
- コンソールエラーなし ✅

---

## ドキュメント更新予定

> Phase39棚卸しまで実ファイルは編集しない。
> 次セッション開始時にこの内容を各ファイルへ反映すること。

---

### phase-status.md への変更

#### 追加（`### Phase35` の後に追加）

```markdown
### Phase36 — Hover Overlay Interaction Redesign

#### Phase36-1: hover popup停止
- `onChordHover` から `showPopup` 呼び出しを削除
- hover → 右パネル更新のみに縮退（二重preview解消）
- `showPopup` / `hidePopup` callback・`mouseleave` ハンドラ削除
- popup DOM・CSS・関数本体は意図的保留（次フェーズで削除）

#### Phase36-2: click semantics再設計
- dblclick → longpress（400ms）に変更
- click即時実行に戻し modal open 遅延を解消
- `onChordDblClick` callback名は維持（app.js変更なし）

#### Phase36-3: diagLock解除 gesture追加
- 右パネル `.phdr` 長押し（400ms）→ `unlockDiag()`
- lock / unlock gesture の対称化
- mousedown時・timer発火時の二重チェックで ESC race condition 対策

#### Phase36-4: diag-toggle / diagOn 削除
- `diag-toggle` ボタン（index.html）削除
- `diagOn` state・復元処理・イベントハンドラ削除
- `editor.js` destructuring から `diagOn` 削除
```

#### 更新（`## 現在地` を置き換え）

```markdown
## 現在地

- Phase36完了・mainブランチ
- hover popup撤去・右パネル preview に一本化
- chord-tag longpress = diagLock 安定動作
- lock / unlock gesture 対称化（longpress lock / phdr longpress unlock / ESC / Lキー）
- diagOn state・diag-toggle UI 削除済み
```

#### 更新（`## 次フェーズ候補` を置き換え）

```markdown
## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

優先度中：
- popup DOM・CSS・関数本体の削除（Phase36-1の残り）
- TAP閉じるボタン hover feedback（`--surface-hover` 適用）
- pause icon alignment

将来（設計議論が必要）：
- openAddChord subsystem化（chordEntry.js）
- 行またぎコード移動
```

---

### current-issues.md への変更

#### 削除（完了済みのため）

`## 1. バックログ` の以下の項目を削除：

```
### ダイアグラム固定操作
状態: ほぼ完了（あとはマウス操作追加）
内容: ポインタ移動で表示が変わってしまうため、編集時に右パネルに固定する操作を追加したい。
...
```

#### 追加（`## 1. バックログ` の先頭に追加）

```markdown
### popup DOM・CSS・関数本体の削除
状態: 未着手
内容: Phase36-1で hover popup を「使わなくした」が、以下がまだ残存している。
- `showPopup` / `hidePopup` 関数本体（app.js）
- popup要素（`#popup`）のHTML（index.html）
- popup関連CSS
削除前に popup が他の箇所から参照されていないか確認すること。
```

#### 更新（`### diagLocked — 将来拡張候補` を置き換え）

```markdown
### diagLocked — 将来拡張候補
状態: 検討
内容: Phase36で確立した diagLock gestureに将来追加できる操作。
- context menu からのlock
- long press = lock（タッチ対応時・PC版は実装済み）
備考: dblclick = lock はevent競合問題により longpress に変更済み。
```

---

### ui-rules.md への変更

変更なし。

---

### architecture.md への変更

`## 4. 状態管理` の `// 独立let変数` セクションを以下に更新：

```markdown
// 独立let変数（将来 uiState 統合予定）
let diagLocked        // ダイアグラム固定フラグ
let diagLockedChord   // ロック中のコード
let currentDiagChord  // 右パネル現在表示コード（source of truth）
let leftCollapsedManual  // <<ボタン操作（localStorage永続）
let leftCollapsedAuto    // resize自動（runtime only）
let leftExpandedOverride // narrow時の一時展開（runtime only）

// diagLock API（app.js内・Phase36で確立）
// updateDiagRight(chord, capo) — 右パネル更新の正式API（currentDiagChordを常に同期）
// lockDiag(chord)              — diagLock有効化
// unlockDiag()                 — diagLock解除
// canUpdateDiagFromHover()     — hover更新guard（diagLocked時はfalse）
// updateDiagLockUI()           — ロック状態のUI反映（.phdr クラス切替）
```
