# 引き継ぎ: Phase34完了（34-1a / 34-1b）

## 作業状態
- ブランチ: main
- 直前作業: Phase34-1b完了（diagLocked UI実装）

---

## 今回の完了内容

### Phase34-1a: diagLocked state導入・hover抑止

#### app.js への追加

**状態変数（独立let変数。将来 uiState 統合予定）:**
```js
let diagLocked = false;
let diagLockedChord = null;
let currentDiagChord = null; // 右パネル現在表示中コード（Lキー用 source of truth）
```

**API関数:**
```js
lockDiag(chord)        // null guard付き
unlockDiag()           // diagLocked / diagLockedChord を両方リセット
canUpdateDiagFromHover() // hover更新可否判定
updateDiagLockUI()     // phdr の class/visibility を更新
```

**正式API化（重要）:**
```js
function updateDiagRight(chord, capo = getCapo()) {
  currentDiagChord = chord;
  setDiagRight(chord, capo, getDiagCallbacks());
}
```
- app.js 内で `setDiagRight` を直接呼ぶ箇所をゼロ化
- `updateDiagRight` が右パネル更新の唯一の入口
- `currentDiagChord` を常に同期する責務を持つ

**hover guard（2箇所 → onChordHover callback統合）:**
- `renderPalette()` の mouseenter
- `createEditorCallbacks()` の `onChordHover`（setDiagRight + showPopup を一元管理）

---

### Phase34-1b: diagLocked UI・キー操作実装

#### 操作仕様（確定）

| 操作 | 動作 |
|---|---|
| Lキー | lock/unlock トグル（guard: INPUT/TEXTAREA・演奏モード中は無視） |
| Escキー | modal open中: modal close / diagLocked中: unlock |
| ダブルクリック | **保留**（後述） |

#### UI実装

**index.html:**
```html
<div class="phdr">
  <span>CHORD DIAGRAM</span>
  <span id="diag-lock-badge">🔒</span>
</div>
```
- `hidden` 属性は使わない（`display:none` になるため visibility が効かなくなる）

**components.css 追記:**
```css
#panel-right .phdr {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
#diag-lock-badge {
  width: 1em;
  font-size: 13px;
  visibility: hidden;
}
.phdr.diag-locked {
  color: var(--color-amber);
}
.diag-locked #diag-lock-badge {
  visibility: visible;
}
```

**updateDiagLockUI（app.js）:**
- `phdr.classList.add/remove('diag-locked')` のみ
- badge の hidden 操作は不要（CSS visibility で制御）

#### editor.js への変更

**onChordHover callback追加:**
```js
// editor.js: mouseenter を onChordHover に統一
tag.addEventListener('mouseenter', () => {
  if (callbacks.onChordHover) callbacks.onChordHover(c.chord, tag);
});

// app.js: guard を一元管理
onChordHover: (chord, element) => {
  if (!canUpdateDiagFromHover()) return;
  updateDiagRight(chord);
  showPopup(chord, element);
},
```

---

## dblclick 保留の経緯（重要）

**試みた実装:** chord-tag dblclick → `closeMod()` → `updateDiagRight(chord)` → `lockDiag(chord)`

**問題:** dblclick が成立しない。

**切り分け結果:**
```
popup ON  → dblclick不可
popup OFF → dblclick不可
```
→ popup overlay だけが原因ではない。

**根本原因（推定）:**
```
1回目 click
 ↓
onChordEdit() → modal open
 ↓
focus変化 / DOM状態変化
 ↓
2回目clickが別要素扱い
 ↓
dblclickシーケンス崩壊
```

**判断:** dblclick は主要UXではなく、Lキーで代替可能。修正コストが高いため保留。

**将来対応:** hover overlay interaction redesign と合わせて設計する（後述バックログ参照）。

---

## keybindings.md 更新事項

Phase34-1bで以下を追加:

| Key | Scope | Action | guard |
|---|---|---|---|
| `L` | global | diagLock toggle | INPUT/TEXTAREA・演奏モード中は無視 |
| `Escape` | global | modal close → diagLock解除（優先順位順） | なし |

---

## 重要な設計ルール（継続）

- app.js 内で `setDiagRight` を直接呼ばない → `updateDiagRight` 経由
- `currentDiagChord` は DOM（diag-title等）から取得しない → app.js の変数が source of truth
- `diagLocked` / `diagLockedChord` は独立let変数（将来 uiState 統合時に移行）
- badge表示は `hidden` 属性ではなく CSS `visibility` で制御

#### Phase34-2: 左パネル自動折りたたみ

**状態変数（独立let変数）:**
```js
let leftCollapsedManual = false;   // <<ボタン・localStorage永続
let leftCollapsedAuto = false;     // 960px未満でtrue・runtime only
let leftExpandedOverride = false;  // narrow時の手動展開・runtime only
```

**実表示ロジック:**
```js
function applyLeftCollapsed() {
  const collapsed = (leftCollapsedManual || leftCollapsedAuto)
                    && !leftExpandedOverride;
  document.body.classList.toggle('left-collapsed', collapsed);
}
```

**ブレークポイント: 960px**
- 環境により `window.innerWidth` が物理解像度と異なる場合があるため、
  1440pxから960pxに調整（実測値: 1280px環境で確認）

**重要な設計ルール:**
- `autoCollapsed` は保存しない（viewport状態から毎回導出）
- `manualCollapsed` のみlocalStorage保存（ユーザー意思）
- `leftExpandedOverride` は960px以上に戻った時点でリセット
- narrow時に手動展開後の微resizeで再collapseしない設計