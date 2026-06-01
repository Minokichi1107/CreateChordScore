# 引き継ぎ: Phase39-2完了 — unlock on open / isChordLikeInput / Shift+L

## 作業状態
- ブランチ: phase38（継続）
- 直前作業: Phase39-2完了

---

## 今回の完了内容

### 変更ファイル
- `chordEntry.js` — unlockDiag DI追加・isChordLikeInput導入・IME対策
- `app.js` — Lキー → Shift+L変更・initChordEntry DI更新・forcePreviewChordコメント追記

---

## Phase39-2a — AddChord open時 unlock on open

### 設計選択（B案採用）

Phase38で検討していた2案のうち「AddChord open時にlockを解除する」B案を採用。

| 案 | 内容 | 採用理由 |
|---|---|---|
| A案: restore方式 | modal close時にdiaLockedChordを復元 | 不採用：modal中に「元コードに突然戻る」体験が不自然 |
| B案: unlock on open | modal open時にlockを解除 | 採用：目的が競合するため解除が自然 |

### 実装内容

**chordEntry.js**
```js
export function openAddChord(idx) {
  // AddChord 開始 = diagLock session 終了
  _unlockDiag?.();
  // ...
}
```

**initChordEntry DI変更（app.js）**
```js
initChordEntry({
  // forcePreviewChord は渡さない（unlock後は updateDiagRight で足りる）
  unlockDiag,
  onPreviewChord: (chord) => updateDiagRight(chord),
  transposeChord,
});
```

**forcePreviewChord（app.js・現在未使用）**
- 将来の preview layer 多層化に備えた予約APIとしてトップレベルに残置
- 詳細コメントを追記（`updateDiagRight` との違い・将来の発展形）

---

## Phase39-2b — isChordLikeInput 導入

### 背景

IMEイベント制御（isComposing / compositionend / keyup）ではChromeの挙動不安定により
日本語誤入力を完全に防げなかった。

### 設計転換

```
「IMEイベントで止める」
↓
「コード入力として妥当かをdomainで検証する」
```

### 実装

```js
// chordEntry.js — モジュールスコープ
function isChordLikeInput(v) {
  return /^[A-G](#|♯|b|♭)?/.test(v.trim());
}
```

**共通利用箇所（2箇所）:**
```js
// addChord 内
if (!isChordLikeInput(ch)) return;

// input preview（onPreviewChord）
inp.addEventListener('input', () => {
  const v = inp.value.trim();
  if (isChordLikeInput(v)) _onPreviewChord?.(v);
});
```

**通るもの:** `C`, `Cm7`, `D♭`, `F#sus4`, `Bbadd9`, `Am7/D`
**落ちるもの:** `あ`, `あdf`, `hello`（H始まり）

### 現行の制約（current-issues.md に積み残し）

`/^[A-G](#|♯|b|♭)?/` は先頭のみ見ているため
`Cほげ` / `A日本語` が通ってしまう。

将来は末尾まで検証する正規表現に強化、または
`parseChordToken(raw)` として tokens.js に統合することを検討。

---

## Phase39-2c — Lキー → Shift+L 変更

### 変更内容（app.js）

```js
// Before
if (e.key === 'l' || e.key === 'L') {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  ...
}

// After
if (e.shiftKey && (e.key === 'l' || e.key === 'L')) {
  if (document.getElementById('perform-overlay')?.hidden === false) return;
  ...
}
```

**変更理由:**
- 単独Lキーは歌詞入力と衝突（lyric-inputにフォーカスがある状態が常態のため）
- Shift+Lなら歌詞入力中でも誤発動しない
- INPUT/TEXTAREAガードを削除（Shift+Lはテキスト入力と干渉しない）

**動作確認済み:**
- 歌詞入力中でも Shift+L で diagLock トグル ✅
- 演奏モード中は無視 ✅

---

## IME guard の現在の構造

イベント制御と domain validation の二重構造になっている（冗長だが安全）:

```
keydown
  e.isComposing → return
  justComposed（compositionend後） → return
  ↓ Enterが通った場合
addChord(v)
  isChordLikeInput(v) → false なら return
  ↓ 追加実行
```

将来的に `isChordLikeInput` が安定すれば、
`isComposing` / `justComposed` によるイベント制御は削除してよい。

---

## regression確認済み
- `+コード` → modal open ✅
- modal open 時に diagLock 解除 ✅
- input preview（Am入力→右パネル更新）✅
- D♭ 入力→右パネル更新 ✅
- 日本語入力（あ）→ addChord/preview ともに弾かれる ✅
- Shift+L → diagLock トグル ✅
- 歌詞入力中 Shift+L → diagLock トグル ✅
- Escape → modal close ✅
- 長押しlock（chord-tag 400ms長押し）✅

---

## ドキュメント更新予定

> 次回棚卸し時に各ファイルへ反映すること。

---

### phase-status.md への変更

#### 追加（`### Phase39-1` の後に追加）

```markdown
### Phase39-2 — unlock on open / isChordLikeInput / Shift+L

#### Phase39-2a: unlock on open
- AddChord modal open 時に `unlockDiag()` を呼ぶ（B案採用）
- A案（restore方式）は不採用：modal close時に突然元コードへ戻る体験が不自然
- `forcePreviewChord` は将来の preview layer 多層化向けに app.js トップレベルへ予約残置
- DI更新: `forcePreviewChord` を外し `unlockDiag` / `onPreviewChord` を追加

#### Phase39-2b: isChordLikeInput 導入
- IMEイベント制御（isComposing / compositionend）から domain validation へ設計転換
- `isChordLikeInput(v)` をモジュールスコープに新設
- `addChord` / `onPreviewChord` の両方で共通利用
- ♭（U+266D）/ ♯（U+266F）等の音楽記号は通過
- 日本語・A-G以外で始まる文字列は遮断
- 先頭のみ検証の暫定実装（末尾検証強化は current-issues.md へ積み残し）

#### Phase39-2c: Lキー → Shift+L
- 単独Lキーが lyric-input と常時衝突していたため Shift+L に変更
- INPUT/TEXTAREA ガードを削除（Shift+L はテキスト入力と干渉しない）
- 演奏モード中は引き続き無視
```

#### 更新（`## 現在地` を置き換え）

```markdown
## 現在地

- Phase39-2完了・phase38ブランチ
- AddChord modal: unlock on open・isChordLikeInput・Shift+L 対応済み
- preview layer API（forcePreviewChord）app.js トップレベルに予約済み
- isChordLikeInput の末尾検証強化は current-issues.md へ積み残し
```

#### 更新（`## 次フェーズ候補` を置き換え）

```markdown
## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

直近（Phase39-3〜）:
- editor.js / perform.js への tokenToText 適用
- simile token 挿入UI
- interaction hierarchy 改修（insertion cursor / hover-only 削除ボタン）

将来（設計議論が必要）:
- isChordLikeInput 末尾検証強化（または parseChordToken として tokens.js へ統合）
- 行またぎコード移動
- renderTokenNode 層（SVG simile 描画）
```

---

### current-issues.md への変更

#### 追加（`## 4. 既知の技術的負債` に追加）

```markdown
### isChordLikeInput の末尾検証強化
状態: 未着手
内容: 現行の `/^[A-G](#|♯|b|♭)?/` は先頭のみ検証するため、
`Cほげ` / `A日本語` のような入力が通ってしまう。
方向性:
- 末尾まで検証する正規表現に強化（暫定案）:
  `/^[A-G](#|♯|b|♭)?[a-zA-Z0-9()+\-susmajdimaugM♭♯#/]*$/`
- または将来 `parseChordToken(raw)` として tokens.js に統合
  `{ type:'chord', raw:'D♭maj7', normalized:'C#maj7' }` のような構造
- 優先度: 低（実害は限定的。誤入力されても normalizeChordName で処理される）
```

---

### architecture.md への変更

`## 4. 状態管理` の diagLock API セクションに追記：

```markdown
// AddChord open時のlock解除方針（Phase39-2で確立）
// B案採用: openAddChord() 冒頭で unlockDiag() を呼ぶ
// A案（restore方式）は不採用 → forcePreviewChord のコメントに設計意図を記載
```

---

### ui-rules.md / keybindings.md への変更

keybindings.md の Lキー記述を Shift+L に更新：

```markdown
| Shift+L | diagLock トグル | 演奏モード中は無効。テキスト入力中でも動作する |
```
