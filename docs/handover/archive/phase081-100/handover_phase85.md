# 引き継ぎ: Phase85完了 — UI視認性・記号衝突修正

## 作業状態
- ブランチ: phase85-ui-polish（想定・実際のブランチ名に合わせて読み替え）
- 直前作業: Phase84完了（Representation Translation Layer）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Blue theme フレット視認性修正 | `--diag-stroke` を `#c8e0f8`（明色）から `#1c3854`（`--text-secondary`と同値の暗色）へ修正。silverテーマと同じ「明背景＋暗ストローク」の整合パターンに統一 | theme.css |
| Repeat badge 記号衝突解消 | 「× 2 回 ✕」の先頭「×」（乗算記号）を削除し「2回 ✕」に変更。インラインstyleを撤去しCSSクラス化（`.repeat-count` / `.repeat-unit`） | editor.js, layout.css |
| 状態表示と削除操作の視覚分離 | `.rb-del`（削除ボタン）の前に区切り線（border-left）を追加。ラベル領域と操作領域を空間・境界で分離。数字は`tabular-nums`で桁揃え | layout.css |

AddChordモーダルの「×N回」と削除「×」の衝突は、既存の hover-only 削除ボタン実装（`.mac-preview-tag-del`）で対応済みであることを実機確認で確認した（今回の追加実装は不要だった）。

---

## 確定した設計原則

```
「状態表示（ラベル）」と「破壊的操作（削除ボタン）」は、
色を増やさず、以下の3手段で視覚的に分離する：

  - 空間（gap）
  - 境界（border-left等の区切り線）
  - タイポグラフィ（tabular-nums、font-size差）

これはchartmode.jsの[DECORATOR VISUAL LANGUAGE PRINCIPLE]
（新しい色を追加せず既存の視覚言語で区別する）と同じ考え方を、
通常エディター（editor.js）側のUIにも適用したものである。

今後、Footer・Decorator系だけでなく、editor.js側で
同種の「ラベル＋削除ボタン」を新設する場合も、この原則
（色を増やさず空間・境界・タイポグラフィで区別）を踏襲すること。
```

---

## current-issues.md更新（次回5フェーズ棚卸し時に反映）

README運用ルール（[ISSUE TRUTH SOURCE INVARIANT]）に従い、closeの確定はこのhandoverで行うが、
current-issues.md本体への反映は次回棚卸し時にまとめて行う。今は編集しない。

### 今回close確定（棚卸し時に削除対象）

- 「Modal / Theme系 — Blue theme：ダイアグラム編集モーダルのフレット番号が見えづらい」
  実機確認済み（フレット番号・弦線とも視認性改善を確認）
- 「UI改善 — AddChordモーダルの記号過剰」の残作業部分（×N回と削除×の視覚的衝突）
  既存のhover-only削除ボタン実装で対応済みと実機確認で判明。close扱いとする
- 「UI改善 — 中央パネルの繰り返し表示」
  実機確認済み（区切り線・hover・tabular-nums 3点とも確認OK）
- 「Future Features — Capo-aware Editing（表示コードでの検索・編集）」
  Phase82〜84（Chord Projection API + Representation Translation Layer）により、
  Rename/AddChord/Search/Replaceの4経路で表示コードのままの編集・検索が
  透過的に成立している。要件は事実ベースで満たされているためclose対象とする

### 今回新規に積み残したissue

なし

---

## 積み残し・保留バグ

なし（今回の作業範囲内では全て解消・実機確認済み）

---

## 次フェーズ候補

current-issues.md「5. Future Features」および今回close対象外の既存項目より（優先度未定）：

- 演奏モードの繰り返し表示（Simile記号 𝄋 検討）— 今回は意図的にOut of Scope（表記体系・Issue #26と接続するため）
- N（無音プレースホルダー）表示モデル不一致の解消
- Boundary Handleのドラッグ操作
- 二段階クリックモデルの見直し

次回5フェーズ棚卸し（Phase86予定）で反映すること：
- phase-status.mdへ「Phase85 — UI視認性・記号衝突修正」を1行追加
- current-issues.mdから上記4件の削除
- current-issues.md「4. 既知の技術的負債」の`--color-edit-point-bg`未使用等、CSS再構成候補との関連有無も棚卸し時に併せて確認

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
