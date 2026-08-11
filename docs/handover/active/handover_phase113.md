# 引き継ぎ: Phase113完了 — Section境界メニューのHit-Test横取りバグ修正

## 作業状態
- ブランチ: phase113-section-menu-hit-test
- 直前作業: Phase112完了（選択解除ボタン Footer再描画漏れ修正）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `#section-bar` | `position: relative; z-index: 10;` を追加 | analysis-editor.css |

## 原因

Section ▼メニュー内の境界ステッパー（◀開始▶／◀終了▶）・Rename・Deleteボタンのクリックが、
下層の `#chart-grid`（`.chart-slot`）に奪われていた。ボタン自体の見た目・DOM上の位置（rect）は
正しく、`.sec-chip-menu` の `z-index: 20` も正しく設定されていたが、実際に効いていなかった。

原因はスタッキングコンテキストの分断。

```
#chart-overlay (fixed, z-index:300)
  ├─ #section-bar (static, z-index:auto)
  │    └─ .sec-chip--previewing (relative, transform: translateY(1px))
  │         └─ .sec-chip-menu (absolute, z-index:20)   ← ここまでは正しく手前に描画される
  │
  └─ #chart-grid (static, z-index:auto)
       └─ .chart-slot (relative, z-index:auto)
```

`.sec-chip--previewing`（Phase107・Preview中チップの「押し込み」表現）に付与されている
`transform: translateY(1px)` が、CSSの仕様上それだけで独自のスタッキングコンテキストを
生成する。これにより `.sec-chip-menu` の `z-index: 20` は `.sec-chip--previewing` という
ローカルな箱の中でしか有効にならず、`#section-bar` と `#chart-grid` という外側の比較には
一切参加できなくなっていた。その結果、`#section-bar` と `#chart-grid` の外側の重なり順を
明示的に制御できておらず、下層の `.chart-slot` がクリックを受け取る状態になっていた。

境界ステッパーメニューを開く操作は必ず `_previewSection()` を伴う設計（Phase106）のため、
メニューを開いている間は常にこの状態になっていた。

## 修正

```diff
 #section-bar {
   display: flex;
   align-items: center;
   gap: 6px;
   padding: 6px 16px;
   border-bottom: 1px solid var(--border-ui);
   background: var(--surface-raised);
   flex-shrink: 0;
   flex-wrap: wrap;
+  position: relative;
+  z-index: 10;
 }
```

`#section-bar` 自体に明示的な `z-index` を与えることで、内部で `.sec-chip--previewing` が
どんなスタッキングコンテキストを作ろうと、`#section-bar` 全体が `#chart-grid`
（`z-index: auto`）より確実に手前で描画されるようにした。

`.sec-chip--previewing` の `transform`（Phase107のUX表現）は変更していない。既存の
デザインを維持したまま、外側のスタッキング構造だけを明示化する最小修正。

## 確定した設計原則

新規Named Invariantの追加はなし。ただし今回の知見は、Phase97で確立した
`[MEASURE NUMBER HIT-TEST INVARIANT]`（見た目は小さいが実際のDOM領域が広い要素が
クリックを横取りするパターン）と同系統の教訓として、architecture.mdに追記する価値がある
（棚卸し時に検討）。

- **transformはスタッキングコンテキストを生成する**という一般原則が、Decorator側の
  ローカルな視覚表現（Phase107の`translateY(1px)`）と、Section Bar全体のstacking設計
  という別レイヤーの関心事を意図せず衝突させた事例。
- Section Bar・Chart Gridのように「兄弟要素同士でz-indexを比較させたい」場合は、
  比較させたい階層（今回は`#section-bar`）自体に明示的な`position`+`z-index`を
  持たせる必要がある。子要素だけにz-indexを与えても、途中の要素がtransform等で
  スタッキングコンテキストを作っていると、その外側には伝播しない。

## 実機確認

```
□ 境界ステッパー（開始◀▶・終了◀▶）すべて反応 ✅
□ 「名前を変更」クリック → モーダルが開く ✅
□ 「削除」メニュー項目のホバー確認 ✅
□ メニューを閉じた通常状態でのChart Modeクリック・選択（回帰なし） ✅
□ 副次効果: メニューがChart Grid背景と重なって見づらい問題も同時に解消 ✅
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - Section境界編集ステッパーが動作しない（Phase109実機テストで発見・Phase113で解消。
    原因は`.sec-chip--previewing`のtransformが生成するスタッキングコンテキストにより
    `.sec-chip-menu`のz-indexが`#chart-grid`側の`.chart-slot`に対して機能していなかったこと）
- 今回新規に積み残したissue: なし

## 次フェーズ候補

- B. Section境界共有の正式サポート（独立Epic）
- C. Section UX Epic（P1〜P4）
- 5フェーズ棚卸し（Phase109〜113。今回で対象が揃った）

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- Section境界編集ステッパーが動作しない（Phase109実機テストで発見・Phase113で解消。
  `.sec-chip--previewing`のtransformによるスタッキングコンテキスト分断が原因。
  `#section-bar`へ明示的な`position: relative; z-index: 10;`を追加して解決）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Section境界メニューのHit-Test横取りバグ修正（Phase113・`.sec-chip--previewing`の
    transformが生成するスタッキングコンテキストにより、境界ステッパー/Rename/Delete
    ボタンのクリックが下層`#chart-grid`の`.chart-slot`に奪われていた不具合を解消。
    `#section-bar`へ明示的な`z-index`を付与）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 113 | Section境界メニューのHit-Test横取りバグ修正（`.sec-chip--previewing`の
    transformが独自スタッキングコンテキストを生成し、`.sec-chip-menu`のz-indexが
    `#chart-grid`側と比較されなくなっていた。`#section-bar`へz-index明示で解決。
    Phase97 [MEASURE NUMBER HIT-TEST INVARIANT]と同系統の教訓） | analysis-editor.css |

- Future Candidates: 変更なし

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
