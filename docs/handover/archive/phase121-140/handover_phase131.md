# 引き継ぎ: Phase131完了 — N.C.（No Chord）挿入・Chart Mode表示対応

## 作業状態
- ブランチ: main（直接push済み）
- commit: `ac92365`（origin/main へ push済み・working tree clean）
- 直前作業: Phase130完了（Add Point Owner誤認修正・range-fit paste機能）
- 対象Issue: GitHub Issue #92

---

## 1. Purpose（目的）

Chart Modeでコード変更によりN.C.（No Chord）を挿入・表示できるようにする
（GitHub Issue #92）。着手前にExploration（現状調査）を行い、入力側
（showChordSelector経由のコード変更）は既にN.C.を安全に受け付ける設計に
なっている一方、Chart Mode側の除外フィルタが唯一の欠落箇所であることを
確認した上で実装した。

---

## 2. Issue #92 の最終状態

```
Exploration（現状調査）で判明した事実:
  ・入力側（showChordSelector / isNoChordInput / toCanonicalChord /
    transposeChord / findChord）は既にN.C.を安全に扱える設計だった
  ・Chart Mode側（buildGridViewModel / _renderFallbackGrid）の
    除外フィルタ（c.chord !== 'N'）だけが唯一の欠落箇所だった

Phase131で実施した追加のProduct Intent（たかっちさんの要望）:
  ・Add Chord Modal（showChordSelector共通UI）へのN.C.専用ボタン追加
  ・Shift+Nショートカットの新設

結果: 上記すべてを実装し、実機確認PASS。
GitHub Issue #92はこのHandover作成後にCloseする想定（未確認ならこの場で判断）。
```

---

## 3. 実装した内容

| 変更 | 内容 | ファイル |
|---|---|---|
| N.C.ボタン追加 | `showChordSelector()`へ「N.C.」ボタンを追加。`commit('N')`を呼ぶのみで、既存の`isNoChordInput()`正規化経路をそのまま利用 | chordEntry.js |
| Shift+Nショートカット | `isAnalysisEditing()`ブロック内に追加。`single`/`edit-point`モードで既存の`aep-add`/`aep-add-here`ボタンと同一のsplitTime計算を再利用し、モーダルを開かず即挿入 | app.js |
| Chart Mode除外フィルタ撤廃 | `buildGridViewModel()` / `_renderFallbackGrid()`の`c.chord !== 'N'`条件を撤廃。N.C.も通常のonsetとしてGridへ含める | chartmode.js |
| 表示ラベル変換 | セル描画時、`chord === 'N'`の場合のみ表示テキストを`'N.C.'`に変換。`data-chord`属性・lookup用の値は生値`'N'`のまま維持（tooltip等の既存安全設計を壊さない） | chartmode.js |

差分規模：3ファイル・58行追加/6行削除。新規CSS・新規Decoratorの追加はなし。

---

## 4. Product Intent（製品意図）との関係

```
確定した仕様（モック→Product Freeze）:
  ・N.C.ボタンは「決定」ボタンと同じ高さ・横並び
  ・表示はアイコン＋「N.C.」→ 実装時、アイコンは見送りテキストのみ「N.C.」に簡略化
    （実装段階の判断。視覚意匠より実装の単純さ・既存ボタンクラスとの整合を優先）
  ・showChordSelector()共通UIに実装 → 追加・挿入・変更の3入口すべてに反映（確定通り）
  ・N/NC/N.C.のテキスト入力は維持（確定通り）
  ・ショートカットはShift+N（確定通り）
  ・Chart ModeはN.C.も通常のBuffer Entryとして表示（確定通り）
  ・Chart Mode表示は新規Visual Designを追加せず、既存の通常セルと
    同一スタイル＋ラベル変換のみ（Technical Design時のChatGPT指摘を反映し確定）
```

[軽微な差異] Product Freeze時点のモックにあった「🎵アイコン＋N.C.」は、
実装では文言のみの「N.C.」ボタンに簡略化された。UXの実質（配置・サイズ・
挙動）は確定仕様通りのため、Acceptance（実機確認）でも問題として扱われて
いない。次回同種のUI追加時に、アイコン付与要否の判断基準として記録に残す
価値があるかは次フェーズ以降の任意判断とする。

---

## 5. Invariant（不変条件）

```
新規のNamed Invariant（[XXX]形式）は追加していない。

既存Invariantの解消（Named Invariantではなく、architecture.md §12の
説明文としての「Known Design Gap」）:
  「Analysis Editorの編集モデル（buffer）は無音プレースホルダー（chord:'N'）を
  実在する編集対象として扱うが、Chart Modeの表示モデル（buildGridViewModel）は
  Nを表示前に除外する」という記述は、Phase131の実装により事実と一致しなくなった。
  Named Invariantではないため即時反映ルールの対象外だが、次回Checkpointで
  architecture.md §12の当該記述を更新（削除）する必要がある（8節参照）。

既存の安全設計をそのまま活用した点（新設ではなく既存の再確認）:
  ・findChord('N') → null（既存仕様のまま）
  ・transposeChord('N', ...) → 'N'（無変換。既存ガードのまま）
  ・_isNoChordEntry()（analysisCommands.js）の正規化基準と、
    showChordSelector()のisNoChordInput()判定は元々一致していた
```

---

## 6. Validation（検証）結果

### 自動テスト（Playwright経由・実モジュール実行）

```
□ buildGridViewModel()にN.C.を含む合成データを渡す
  → GridのslotへN.C.が正しく格納される                          → PASS
□ showChordSelector()のN.C.ボタンをDOM上でクリック
  → onSelect({name:'N'})が呼ばれる                              → PASS
□ テキスト入力 N / NC / N.C. → すべて {name:'N'} に正規化        → PASS
□ 通常コード（Am7）の入力・findChord解決                        → 変化なし（Regressionなし）
□ 小文字ルート（am7）の拒否                                     → 既存仕様通り維持
□ toCanonicalChord('N', capo) / transposeChord('N', ...)        → 'N'のまま安全
□ コンソールエラー                                              → ゼロ
```

### 実機確認（今回報告分）

```
□ N.C.ボタンがAdd Chord Modalに表示・押下で追加できる            → PASS
□ Chart Modeに C | Am | N.C. | G のように表示される              → PASS
□ N.C.の変更・削除・Undo/Redo                                   → PASS
□ Shift+N（single / edit-point）                                → PASS
□ git diff --check                                              → エラーなし
```

未実施（今回スコープ外）：3テーマでの見た目確認・pickup measure内でのN.C.・
Section境界とN.C.の相互作用は明示的に検証していない（9節参照）。

---

## 7. Git checkpoint（Git上の確定点）

```
commit: ac92365
push先: origin/main
working tree: clean
```

---

## 8. 次フェーズへ持ち越す事項

- **architecture.md §12の「Known Design Gap」記述の更新**：Phase131により
  事実と一致しなくなったため、次回Documentation Checkpointで該当記述を
  削除・更新する（Named Invariantではないため即時反映ルールの対象外）
- **current-issues.mdの同名項目のClose**（下記Deferred Documentation参照）
- **GitHub Issue #92のClose判断**：本文に今回のスコープ外の要望が残っていないか確認の上でClose
- 未検証範囲（3テーマ表示・pickup measure内のN.C.・Section境界との相互作用）は、
  実運用で問題が確認された場合にのみ追調査する（机上の先回り調査はしない）

---

## 9. patchファイルについて

Phase131で作成した3件のpatchファイル（`01_chordEntry.js.patch` /
`02_app.js.patch` / `03_chartmode.js.patch`）は、commit `ac92365`として
既にorigin/mainへ反映済みのため**不要（削除して問題なし）**。

Phase130以前のpatchファイルの整理は、本Handoverのスコープ外として
明示的に対象外とする（今回は無理に整理範囲を広げない）。

---

## Issue状態変更記録
- 今回closeしたissue: なし（GitHub Issue #92はPhase131時点では未Close。Close要否の判断は8節参照）
- 今回新規に積み残したissue: なし

## 積み残し・保留
- architecture.md §12「Known Design Gap」記述の更新（8節参照。Named Invariantではないため次回Checkpoint対応）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- 見出し: Known Design Gap — N（無音プレースホルダー）の表示モデル不一致
  （Phase131で解消。`buildGridViewModel()` / `_renderFallbackGrid()`の
  N.C.除外フィルタを撤廃し、Chart Modeでも通常のBuffer Entryとして
  表示・選択・編集できるようになったため）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ N.C.（No Chord）挿入・Chart Mode表示対応（Phase131・GitHub Issue #92。
    Add Chord Modal共通UI（showChordSelector）へN.C.ボタンを追加し、
    追加・挿入・変更の3入口すべてに反映。Shift+Nショートカット新設
    （既存aep-add/aep-add-hereと同一のsplitTime計算を再利用）。
    Chart Mode側のN.C.除外フィルタを撤廃し、通常のBuffer Entryとして
    表示・編集可能にした。新規CSS・新規Decoratorは追加せず、既存
    Visual Designをそのまま踏襲。architecture.md §12の「Known Design
    Gap」はこのPhaseで解消済み・次回Checkpointで該当記述を更新要）

- Major Milestones（Analysis Editor関連テーブルへ追加候補）:
  | 131 | N.C.（No Chord）挿入・Chart Mode表示対応（GitHub Issue #92。
    入力側は既に安全設計済みだったことをExplorationで確認した上で、
    Chart Mode側の除外フィルタ撤廃・N.C.ボタン・Shift+Nショートカットを
    実装。Playwrightによる自動検証と実機確認の両方でPASS） | chordEntry.js /
    app.js / chartmode.js |

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
