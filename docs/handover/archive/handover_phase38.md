# 引き継ぎ: Phase38完了 — 設計フェーズ / Phase39-0完了 — token abstraction cleanup

## 作業状態
- ブランチ: phase38
- 直前作業: Phase38設計確定・Phase39-0実装完了（tokens.js新設・modals.js修正）

---

## Phase38 — 設計フェーズ

### Phase38-1: chordEntry.js 責務境界・DI方針確定

#### chordEntry.js が持つもの
- `openAddChord(idx)`
- `insertAt` state（modal内ローカル）
- `renderModalPreview()`
- `mkInsertBtn()`
- `addChord()` / `addSep()`
- キーボードハンドリング（Enter / Escape / 入力中preview）

#### app.js が保持しDI経由で渡すもの
```js
initChordEntry({
  getLines:            () => project.lines,   // アクセサ渡し（値コピー禁止）
  getPalette:          () => palette,
  getPaletteTranspose: () => paletteTranspose,
  addToPaletteIfNew,
  refreshEditor,
  openModal,
  closeModal: closeMod,
  mkMBtn,
  toast,
  forcePreviewChord: (chord) => { ... },
})
```

#### app.js 接続面（切り出し後）
```js
import { initChordEntry, openAddChord } from './chordEntry.js';
// DOMContentLoaded
initChordEntry({ ... });
// createEditorCallbacks
onAddChord: (idx) => { openAddChord(idx); },
```

#### preview layer 3層分離
```
hover preview    ← canUpdateDiagFromHover() guard あり
locked preview   ← diagLocked 中の固定表示
modal transient  ← modal 内入力中の一時表示（lock を上書きしない）
```

```js
// app.js
function forcePreviewChord(chord) {
  // diagLocked であっても右パネルを一時更新するが diagLockedChord は書き換えない
  setDiagRight(chord, getCapo(), getDiagCallbacks());
}

// transient preview session 終了時の復元
// （現段階では closeMod() から呼ぶ暫定案）
// 将来: beginTransientPreview() / endTransientPreview() に移行
function restoreDiagAfterTransientPreview() {
  if (diagLocked && diagLockedChord) {
    updateDiagRight(diagLockedChord);
  }
}
```

---

### Phase38-2: 入力系UX統合設計

#### keyboard editing model（mac-input）
```
Enter
  入力値あり → addChord() → input クリア
  入力値なし → closeMod()

Escape（IME composing 中は無視）
  入力値あり → input クリア（closeMod しない）
  入力値なし → closeMod()

input イベント → forcePreviewChord()
```

IME guard:
```js
inp.addEventListener('keydown', e => {
  if (e.isComposing) return;
  // ...
});
```

#### simile token 設計
```js
{ type: 'simile', bars: 1 }  // 1小節繰り返し
{ type: 'simile', bars: 2 }  // 2小節繰り返し
```

| token | 意味 | 性質 |
|---|---|---|
| `{type:'sep'}` | 小節線（bar line） | layout token |
| `{type:'simile', bars:1}` | 1小節繰り返し | musical semantic token |
| `{type:'simile', bars:2}` | 2小節繰り返し | musical semantic token |

再生意味は現段階では未定義（renderer token のみ）。

#### display state（simile 表示スタイル）
```js
// uiState への追加（将来 uiState 統合時）
let simileStyle = {
  editor:  'text',  // 編集系: "sim." / "sim.2"（原則固定）
  perform: 'svg'    // 演奏系: SVG描画（デフォルト）
}
// localStorage 永続（editor/perform 独立保存）
```

ヘッダー「表示」メニューは `perform` 側の切り替えが主目的。

#### render policy
```js
renderSimile(token, simileStyle)
// simileStyle: 'text' | 'ascii' | 'unicode' | 'svg'
```

#### interaction hierarchy 再設計
```
primary   → キーボード入力（mac-input）
secondary → insertion cursor（現在位置の視覚表示）
tertiary  → マウス操作UI（hover 時のみ表示）
```

| 要素 | 変更後 |
|---|---|
| insert-btn `+` | insertion cursor `|` に変更・active 位置のみ強調 |
| 削除 `✕` | hover 時のみ表示 |
| sep `/` | tertiary に統合 |
| sim. / sim.2 | tertiary に統合 |

AddChord modal が常時見せるべきもの: 現在挿入位置（cursor）/ preview / 確定済みtoken列 のみ。

token shorthand（将来）:
```
/   → sep
ss  → sim.（1小節）
ss2 → sim.2（2小節）
nc  → N.C.
```

---

### Phase38-3: 行またぎコード移動（将来実装準備）

A案確定（app.js 内関数）:
```js
function moveChordAcrossLines(fromLineIdx, ci, direction) {
  const lines = project.lines;
  if (direction === 'prev' && fromLineIdx > 0) {
    const chord = lines[fromLineIdx].chords.splice(ci, 1)[0];
    lines[fromLineIdx - 1].chords.push(chord);
    refreshEditor();
  }
  if (direction === 'next' && fromLineIdx < lines.length - 1) {
    const chord = lines[fromLineIdx].chords.splice(ci, 1)[0];
    lines[fromLineIdx + 1].chords.unshift(chord);
    refreshEditor();
  }
}
```

将来の callback 接続面:
```js
// createEditorCallbacks に追加予定
onChordKeyNav: (lineIdx, ci, direction) => {
  moveChordAcrossLines(lineIdx, ci, direction);
},
```

---

## Phase39-0 — token abstraction cleanup

### 変更ファイル
- `tokens.js`（新設）
- `modals.js`（2箇所修正）

---

### tokens.js 新設

musical token stream の domain-level utility として独立。
`chords.js` への追加でも `chordEntry.js` への組み込みでもなく独立ファイル。

```js
// tokens.js
export function isChordToken(token) {
  return token?.type === 'chord'
      || ('chord' in (token || {}) && !token?.type);
}
export function isSepToken(token) {
  return token?.type === 'sep'
      || token?.chord === '/';   // 旧形式互換（徐々に排除）
}
export function isSimileToken(token) {
  return token?.type === 'simile';
}
export function tokenToText(token, opts = {}) {
  if (isSepToken(token))    return '/';
  if (isSimileToken(token)) return token.bars === 2 ? 'sim.2' : 'sim.';
  return token.chord ?? '?';
}
```

設計判断:
- `isChordToken` はプロパティ存在判定（`'chord' in token`）。truthy判定だと `{chord:''}` を落とす
- `isSepToken` は旧形式互換（`c.chord === '/'`）を維持。migration完了後に削除判断
- `isChordToken` は未知 token を chord 扱いしない（`!token?.type` 条件付き）

### modals.js 修正

`import { isSepToken, tokenToText } from './tokens.js'` を追加。

**268行目: コピー元プレビュー**
```js
// Before
const prev = line.chords.map(c =>
  `<span class="chord-tag" style="pointer-events:none"><span>${c.chord}</span></span>`
).join('');

// After
const prev = line.chords.map(c =>
  isSepToken(c)
    ? `<span class="chord-sep" style="pointer-events:none;padding:0 4px">/</span>`
    : `<span class="chord-tag" style="pointer-events:none"><span>${tokenToText(c)}</span></span>`
).join('');
```

**278行目: コピー先リストのコード一覧**
```js
// Before
l.chords.map(c => c.chord).join(' ')

// After
l.chords.map(c => tokenToText(c)).join(' ')
```

### regression確認済み
- コピーモーダルで `undefined` が消えた ✅
- コピー元プレビューで `/` が正しく表示される ✅

---

## ドキュメント更新予定

> Phase41棚卸しまで実ファイルは編集しない。
> 棚卸し時にこの内容を各ファイルへ反映すること。

---

### phase-status.md への変更

#### 追加（`### Phase37` の後に追加）

```markdown
### Phase38 — 設計フェーズ（chordEntry / token stream / simile）

#### Phase38-1: chordEntry.js 責務境界・DI方針確定
- chordEntry subsystem の境界・DI シグネチャ設計
- preview layer 3層分離設計（hover / locked / modal transient）
- `forcePreviewChord` / `restoreDiagAfterTransientPreview` 命名確定

#### Phase38-2: 入力系UX統合設計
- keyboard editing model 確定（Enter/Escape/IME guard）
- simile token 設計（`{type:'simile', bars:1|2}`）
- `editorSimileStyle` / `performSimileStyle` 分離設計
- interaction hierarchy 再設計（primary=キーボード / secondary=cursor / tertiary=マウス）
- token shorthand 方針（`/`→sep、`ss`→sim. 等・将来）

#### Phase38-3: line mutation 拡張準備
- `moveChordAcrossLines` を app.js 内関数として確定（A案）
- `onChordKeyNav` callback 接続面設計

### Phase39-0 — token abstraction cleanup

#### 作業内容
- `tokens.js` 新設（musical token stream の domain-level utility）
  - `isChordToken` / `isSepToken` / `isSimileToken` / `tokenToText`
  - `isChordToken` はプロパティ存在判定（`'chord' in token`）
  - `isSepToken` は旧形式 `c.chord === '/'` 互換維持
- `modals.js` 修正（`c.chord` 直読み2箇所を `tokenToText` 経由に変更）
  - コピー元プレビュー（268行）
  - コピー先リストのコード一覧（278行）
- `undefined` 表示バグ修正確認済み

#### 性質
- UI変更なし・ロジック変更なし
- token architecture migration の最初の実装
- `c.chord` 直読み禁止文化の起点
```

#### 更新（`## 現在地` を置き換え）

```markdown
## 現在地

- Phase39-0完了・phase38ブランチ
- `tokens.js` 導入済み（musical token stream utility layer）
- `modals.js` の token abstraction 漏れ修正済み
- chordEntry.js 実装・simile token 導入は次フェーズ（Phase39-1〜）
```

#### 更新（`## 次フェーズ候補` を置き換え）

```markdown
## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

直近（Phase39-1〜）:
- chordEntry.js 実装（openAddChord の app.js からの切り出し）
- simile token 挿入UI（AddChordモーダル）
- interaction hierarchy 改善（insertion cursor / hover-only 削除ボタン）
- editor.js / perform.js への tokenToText 適用

将来（設計議論が必要）:
- 行またぎコード移動
- renderTokenNode 層（SVG simile 描画）
```

---

### current-issues.md への変更

#### 追加（`## 1. バックログ` の先頭に追加）

```markdown
### editor.js / perform.js への tokenToText 適用
状態: 未着手
内容: Phase39-0 で tokens.js を導入したが、editor.js / perform.js の
`c.chord` 直読み箇所はまだ未修正。simile token 実装時に合わせて対応する。
対象:
- editor.js: chord-tag 表示（ns.textContent = c.chord）
- perform.js: chord 表示・sep 判定（c.chord === '/' フォールバック）
```

#### 追加（`## 4. 既知の技術的負債` に追加）

```markdown
- `isSepToken` の旧形式互換（`c.chord === '/'`）は migration 完了後に削除判断
```

---

### architecture.md への変更

`## 3. JSモジュール構成` のテーブルに追加：

```markdown
| tokens.js | musical token stream の分類・変換ユーティリティ（isChordToken / isSepToken / isSimileToken / tokenToText） |
```

---

### ui-rules.md への変更

変更なし。
