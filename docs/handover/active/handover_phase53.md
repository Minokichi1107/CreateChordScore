# 引き継ぎ: Phase53完了 — insertion cursor navigation in AddChord modal

## 作業状態

* ブランチ: main（マージ済み）
* commit: `b38f7c6` feat: Phase53 — insertion cursor navigation in AddChord modal

---

## 完了したこと

| 変更                                             | 内容                                       | ファイル               |                  |
| ---------------------------------------------- | ---------------------------------------- | ------------------ | ---------------- |
| `mkInsertBtn` → `mkCursorSlot`                 | +ボタンを `                                  | ` カーソルスロットに置き換え    | js/chordEntry.js |
| `navigateInsertCursor()` 追加                    | 同行内 + 行またぎ ArrowLeft/ArrowRight 対応       | js/chordEntry.js   |                  |
| `_updateModalTitle` DI追加                       | 行移動時にモーダルタイトルを動的更新                       | js/chordEntry.js   |                  |
| keydown 拡張                                     | ArrowLeft / ArrowRight を登録               | js/chordEntry.js   |                  |
| `updateModalTitle` 注入                          | `(text) => { mTit.textContent = text; }` | js/app.js          |                  |
| `.insert-cursor-wrap` / `.insert-cursor` CSS追加 | 点滅・hover薄表示・当たり判定確保                      | css/components.css |                  |

---

## 確定した設計原則

### insertAt = editor cursor semantic

```txt
insertAt は「挿入位置」ではなく「editor cursor」として扱う。

- click = direct positioning
- ArrowLeft/Right = navigation
- Enter = insert commit

として統一。
```

### navigateInsertCursor のロジック

```txt
← キー:
  insertAt === 0        → idx-- / insertAt = null（前行末尾へ）
  insertAt === null     → lineLen-1
  それ以外              → insertAt--

→ キー:
  insertAt === null     → idx++ / insertAt = 0（次行先頭へ）
  insertAt >= lineLen-1 → null（末尾カーソルへ）
  それ以外              → insertAt++
```

### chordEntry subsystem 内で完結

```txt
navigateInsertCursor() は:

- idx
- insertAt

のみ変更する。

今回 intentionally やらなかったもの:
- token mutation
- project.lines mutation
- chord move
- editor core authority 変更
```

### cursor UI 設計

```txt
.insert-cursor-wrap
  = click hit area

.insert-cursor
  = visual cursor

通常:
  opacity: 0

hover:
  opacity: .25

active:
  opacity: 1 + blink animation
```

### modal subsystem boundary を維持

今回の行またぎ navigation は:

```txt
modal subsystem 内の cursor navigation
```

として実装。

token array boundary mutation は行わない。

`moveChordAcrossLines()` 系は editor core mutation layer の問題として将来フェーズへ分離。

---

## UIの変化

```txt
before:
+ Am7 × + Am7/D × + Dm × +

after:
  Am7 ×   Am7/D ×  |  Dm ×
```

* active位置のみ cursor 表示
* hover時のみ inactive cursor を薄表示
* AddChordモーダルの記号ノイズを削減

---

## current-issues 関連項目

今回のPhase53は以下の current-issues と関連:

* AddChordモーダルの記号過剰
* interaction hierarchy 改修
* keyboard-first navigation
* modal subsystem boundary

特に:

```txt
token boundary mutation を
modal subsystem の小機能として実装しない
```

方針を維持。

---

## 積み残し・保留

### transient preview restore（未着手・関連度高）

modal close 後、
diagLocked 状態の右パネル表示を復元する処理。

Phase39-1 で:

```txt
forcePreviewChord が
diagLockedChord を破壊しない
```

設計に変更済み。

そのため transient preview 終了後の restore flow が必要。

方向性:

```txt
restoreDiagAfterTransientPreview()
```

を app.js に追加し、
closeMod() から呼ぶ（暫定）。

将来:

* beginTransientPreview()
* endTransientPreview()

APIへ昇格予定。

Phase52/53 の modal subsystem と関連が強いため注意。

---

### B案: moveChordAcrossLines()（将来フェーズ）

token を行境界をまたいで移動させる機能。

今回やらなかった理由:

```txt
editor core mutation layer の問題になるため。
```

必要になるもの:

* undo semantics
* empty line handling
* separator semantics
* mutation authority
* renderer sync

current-issues の警告通り、
modal subsystem 内の小機能として実装しない。

---

### interaction hierarchy 改修（将来フェーズ）

候補:

* delete button hover-only 化
* insertion cursor 完全 keyboard-first 化
* inline editing hierarchy 整理

---

### simile token 挿入UI（将来フェーズ）

* AddChordモーダルから simile token を挿入
* Phase38-2 設計メモあり

---

### Chart Mode mini transport（未着手）

Chart Mode 内に:

* ▶
* seek
* speed
* volume

を持つ mini transport を追加。

現在は main transport 依存。

未確定事項:

```txt
Chart renderer が playback authority を持つか
既存 aEl の proxy とするか
```

設計判断が必要。

---

## 次フェーズ候補

### A. Chart Mode 3列/4列切替（推奨）

理由:

```txt
renderer責務整理後で、
layout拡張を入れやすいタイミングのため。
```

内容:

* `MEASURES_PER_ROW` を引数化
* 表示メニューに切替追加
* `chartMeasuresPerRow` を localStorage 永続化

注意:
render関数の引数追加が呼び出し元へ波及するため、
先に設計フェーズ推奨。

---

### B. moveChordAcrossLines（大規模）

理由:

```txt
editor core mutation layer の話になるため、
Phase53直後には重すぎる。
```

Chart拡張・interaction整理の後が自然。

---

## commit message

```txt
feat: Phase53 — insertion cursor navigation in AddChord modal
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
