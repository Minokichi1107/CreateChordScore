# 引き継ぎ: Phase39-5完了 — chordEntry subsystem 接続完成

## 作業状態
- ブランチ: phase38（継続）
- 直前作業: Phase39-5完了（incomplete migration 修正・subsystem ownership 確定）

---

## 今回の完了内容

### 変更ファイル
- `app.js` — chordEntry import追加・旧openAddChord削除・forcePreviewChord追加・initChordEntry追加

---

## 背景

Phase39-1 で `chordEntry.js` を新設・設計したが、`app.js` 側の接続（import / initChordEntry）が未完了のまま残存していた。実態として：

- `chordEntry.js` は存在するが使われていない
- `app.js` 内の旧 `openAddChord` 定義が生きている
- subsystem migration が半端状態

この状態のまま token / barline / keyboard 系の実装を進めると、app.js 側だけ古い・chordEntry.js 側だけ新しいという二重実装崩壊が起きる危険があった。

---

## Phase39-5 — subsystem 接続完成

### 1. import 追加

```js
// app.js（tokens.js importの直後）
import { initChordEntry, openAddChord } from './chordEntry.js';
```

### 2. forcePreviewChord 追加

`updateDiagLockUI()` 直後・diagLock API ブロック末尾に配置。

```js
// ── preview layer API ──────────────────
// diagLocked 中でも右パネルを一時更新する（diagLockedChord は書き換えない）
// chordEntry.js の transient preview から使用。
// updateDiagRight との違い: currentDiagChord を更新しないため
//   diagLock 状態が壊れない。modal close 後に lock が復元可能。
// 将来: beginTransientPreview() / endTransientPreview() に発展予定
function forcePreviewChord(chord) {
  setDiagRight(chord, getCapo(), getDiagCallbacks());
}
```

**現在は未使用。** Phase39-2 で unlock on open（B案）を採用したため、`initChordEntry` には渡さない。将来の preview layer 多層化（keyboard / playback preview 等）向けに予約。

### 3. 旧 openAddChord 本体削除（約150行削減）

旧 763〜912 行（`function openAddChord(idx){...}`）を完全削除。

削除内訳：
- `mkInsertBtn` / `renderModalPreview` / `addChord` / `addSep`（内部関数群）
- modal body HTML生成
- keyboard handler
- palette HTML生成

### 4. initChordEntry 呼び出し追加

`initModals({...})` 直後に配置。

```js
// ⑦ ChordEntry 初期化（Phase39-5: chordEntry.js接続完成）
initChordEntry({
  getLines:            () => project.lines,
  getPalette:          () => palette,
  getPaletteTranspose: () => paletteTranspose,
  addToPaletteIfNew,
  refreshEditor,
  openModal,
  closeModal:          closeMod,
  mkMBtn,
  toast,
  unlockDiag,
  onPreviewChord:      (chord) => updateDiagRight(chord),
  transposeChord,
});
```

DI シグネチャは Phase39-2 確定版（`unlockDiag` / `onPreviewChord` を渡す・`forcePreviewChord` は渡さない）。

---

## subsystem ownership の現在地

| 層 | 役割 |
|---|---|
| `app.js` | orchestration のみ（DI提供・state所有） |
| `chordEntry.js` | chord entry subsystem（openAddChord の実体） |
| `tokens.js` | token semantic（isSepToken / tokenToText） |
| `editor.js` | editor rendering |
| `perform.js` | perform rendering |
| `modals.js` | 軽量 modal 群 |

---

## regression確認済み
- AddChord モーダル起動（全経路）✅
- chord insert / sep insert 動作 ✅
- preview routing 正常 ✅
- app startup 正常 ✅
- `openAddChord` の duplicate definition なし（`app.js` は呼び出しのみ）✅
- console error なし ✅

---

## ドキュメント更新予定

> 次回棚卸し時に各ファイルへ反映すること。

---

### phase-status.md への変更

#### 追加（`### Phase39-2` の後に追加）

```markdown
### Phase39-3 — editor.js / perform.js への tokenToText / isSepToken 適用

#### 作業内容
- `editor.js` に `import { isSepToken, tokenToText }` 追加
- sep判定を `isSepToken(c)` に統一（旧形式 `c.chord==='/'` 互換を吸収）
- chord表示を `tokenToText(c)` 経由に変更（DOM表示のみ）
- `perform.js` に同様の変更を適用
- lookup key (`c.chord`) と display (`tokenToText(c)`) の責務分離確立
- `const chordName = c.chord` / `const displayName = tokenToText(c)` で明示的に分離

#### 性質
- UI変更なし・ロジック変更なし
- rendering abstraction 適用フェーズ
- `c.chord` 直読み禁止文化の editor / perform への拡大

### Phase39-4 — barline canonical 化

#### 作業内容
- `tokens.js`: `isSepToken()` に `type:'barline'` 条件追加
- `tokens.js`: ヘッダーコメントに canonical / legacy / deprecated の3層を明記
- `app.js` / `chordEntry.js`: 生成5箇所を `{ type:'barline' }` に変更
- `app.js` / `chordEntry.js`: 判定3箇所を `isSepToken()` に変更
- `app.js` に `import { isSepToken }` 追加
- `chordEntry.js` に `import { isSepToken }` 追加
- storage migration は今回行わない（旧データは `isSepToken()` で透過的に扱う）

#### 性質
- UI変更なし・ロジック変更なし（保存データの canonical 形式が変わる）
- separator token の musical semantic 化
- Issue #26（Beat/Grid）への将来の移行パスを確保

### Phase39-5 — chordEntry subsystem 接続完成

#### 作業内容
- `app.js` に `import { initChordEntry, openAddChord }` 追加
- `app.js`: `forcePreviewChord()` をトップレベルに追加（現在未使用・preview layer 予約）
- `app.js`: 旧 `openAddChord` 本体を削除（約150行削減）
- `app.js`: `initChordEntry({...})` を `initModals` 直後に追加
- Phase39-1 の incomplete migration を修正・subsystem ownership 確定

#### 性質
- UI変更なし・ロジック変更なし（ownership 切替）
- Phase39-1 の migration 完了
- app.js が orchestration 層へ帰還
```

#### 更新（`## 現在地` を置き換え）

```markdown
## 現在地

- Phase39-5完了・phase38ブランチ
- token stream architecture 整理フェーズ（39-3〜5）完了
  - rendering abstraction（tokenToText / isSepToken）全モジュール適用
  - barline canonical 化・access layer 確立
  - chordEntry subsystem ownership 確定
- 次の大型設計フェーズ（Issue #26 / keyboard-first input）の基盤整備完了
```

#### 更新（`## 次フェーズ候補` を置き換え）

```markdown
## 次フェーズ候補

詳細は `current-issues.md` のバックログを参照。

直近（Phase39-6〜）:
- ドキュメント棚卸し（phase-status / current-issues / architecture 更新）
- isChordLikeInput の末尾検証強化（または parseChordToken として tokens.js へ統合）

将来（設計フェーズが必要）:
- Issue #26: Beat/Grid 対応（bar / measure semantic 設計）
- isSepToken() → isBarlineToken() rename（Issue #26 設計フェーズで判断）
- keyboard-first chord entry（insertion model 再設計）
- 行またぎコード移動
- renderTokenNode 層（SVG simile 描画）
```

---

### current-issues.md への変更

#### 削除（完了済みのため）

```
### editor.js / perform.js への tokenToText 適用
```

#### 追加（`## 4. 既知の技術的負債` に追加）

```markdown
### barline storage migration
状態: 意図的保留
内容: 保存済みデータの `{ type:'sep' }` / `{ chord:'/' }` を `{ type:'barline' }` へ migration。
現在は `isSepToken()` で透過的に扱えるため不急。
時期: Issue #26 の bars[] 設計フェーズ前後に合わせて実施を検討。
```

---

### architecture.md への変更

`## 3. JSモジュール構成` のテーブルを更新：

```markdown
| chordEntry.js | コード入力サブシステム（openAddChord / insertAt state管理 / transient preview） |
| tokens.js | musical token stream の分類・変換ユーティリティ（isChordToken / isSepToken / isSimileToken / tokenToText） |
```

`## 6. 将来予定` の `chordEntry.js（将来）` セクションを削除し、以下に置き換え：

```markdown
### chordEntry.js（Phase39-5で実装・接続完了）
`openAddChord` は Phase39-1 で新設、Phase39-5 で app.js との接続が完成。

Phase39-6以降の拡張予定:
- insertion cursor 化
- keyboard-first chord entry（insertion model 再設計）
- simile token 挿入UI（Phase39 後半）
- token shorthand（Phase39 後半）
```
