# 引き継ぎ: Phase111完了 — Ctrl+V (pasteAbsolute) Section Boundary Reconciliation

## 作業状態
- ブランチ: phase111-pasteabsolute-boundary-resolution
- 直前作業: Phase110完了（pasteSelectionCommandへのCompound Mutation Boundary Resolution拡大）

---

## 1. Purpose（目的）

Phase110では `reconcile()` のSection boundary reconciliationを
`deleteChordCommand()` / `deleteSelectionCommand()` / `mergeSelectionCommand()` /
`pasteSelectionCommand()`（Ctrl+Shift+V）へ拡張したが、Ctrl+V
（`buildPastePlan()` / `commitPastePlan()`）は意図的にスコープ外としていた
（handover_phase110.md §7 P1参照）。

Phase111は、まずCtrl+VのMutation Semanticsをコードから正確に把握したうえで
（Phase111-A〜C）、既存の`reconcile()` Factsモデルへ統合する設計が可能かを
検証し（ChatGPTレビュー・Phase111-D）、実装・実機検証（Phase111-E〜F）まで
完了させることを目的とした。

```
delete         : N → 0   （Phase108〜109で対応）
merge          : N → 1   （Phase109で対応）
pasteSelection : N → M   （Phase110で対応）
Ctrl+V         : ← 本フェーズ（Phase111）
```

---

## 2. Scope（今回やったこと）

```
・buildPastePlan()の分岐（fullyInside / overlapsStart&&overlapsEnd /
  overlapsStart / overlapsEnd / else）をコード監査し、既存4パターンの
  Mutation Semanticsとの異同を整理（Phase111-A・B）
・「単一コード内完結ペースト」という新規パターンを発見
  （1つの既存コードがpaste領域を完全に包含し、左右2断片へ分断される
  ケース。従来のdelete/merge/pasteSelectionにはない構造）
・上記パターンを既存reconcile() Factsモデル（removedChordIds /
  firstChordId / lastChordId / replacementFirstChordId /
  replacementLastChordId）へそのまま統合できることを設計（Phase111-C）
・ChatGPTレビューを受け、3点の定義修正を反映（Phase111-D）
    a) firstChordId/lastChordIdを「removedChordIdsの最小/最大」ではなく
       「Mutation blockの旧先頭/旧末尾」として定義
    b) 「位置ベースSection」という表現を廃し、「IDが維持されるため
       reconciliation不要」と言い換え
    c) newIds（貼付コードのみ）とreplacementFirstChordId/
       replacementLastChordId（新ブロック全体の境界）の意味を分離
・buildPastePlan()の戻り値へMutation Factsを追加（既存フィールドは無変更）
・commitPastePlan()へreconcile()呼び出しを追加
    removedChordIdsが空の場合はreconcile()自体を呼ばない
    （Mutation Semantics上、意味のある処理がないため）
・実機検証（テスト1〜10。§7参照）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・EPS境界（貼付位置が既存コードの境界と厳密に一致するケース）の
  個別検証
    → buildPastePlan()の既存境界判定ロジック（fullyInside/
      overlapsStart/overlapsEnd）自体は一切変更していないため、
      Phase111で新たに壊れるリスクはないと判断し、個別の実機検証は
      行わなかった（ChatGPTレビュー時の確認事項だったが、実装方針が
      「既存判定結果からFactsを構築するだけ」に確定した時点で
      優先度が下がった）。

・個別コード選択パネルの×ボタン無反応バグの調査・修正
    → Phase111の実機検証中に発見したが、Section reconciliationとは
      無関係の独立したUIバグのため、原因調査は行わずcurrent-issues.md
      へ新規Issueとして記録するに留めた（§8参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `buildPastePlan()` | 既存の5分岐（fullyInside/overlapsStart&&overlapsEnd/overlapsStart/overlapsEnd/else）ロジックは無変更のまま、並行してremovedChordIds/firstChordId/lastChordId/replacementFirstChordId/replacementLastChordIdを計算し、戻り値へ追加 | analysisCommands.js |
| `commitPastePlan()` | buffer代入後・refreshSelection前にreconcile()呼び出しを追加。removedChordIds.size===0の場合はスキップ | analysisCommands.js |

`node --check`・CRLF全行維持を確認済み。既存のbuildPastePlan()分岐・
survivors構築・merged構築・戻り値のbuffer/newIdsの意味は一切変更していない。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 「単一コード内完結ペースト」をN→M replacementとして統合する

```
結論:
  1つの既存コードXがpaste領域を完全に包含し、X-left/X-rightという
  2つの新規IDへ分断されるケースも、専用のMutation種別を新設せず、
  既存のreconcile() Facts（removedChordIds / firstChordId /
  lastChordId / replacementFirstChordId / replacementLastChordId）
  でそのまま表現する。

理由:
  Section視点では「Xという1つのidが消え、X-left〜貼付コード〜X-right
  という新しい連続ブロックが生まれた」という点で、Phase109のmerge
  （N→1）・Phase110のpasteSelection（N→M）と構造的に同じ
  （firstChordId=lastChordId=Xとなる、N=1の特殊系）。reconcile()
  自体を変更する必要がなく、Command Layer側でFactsを正しく構築する
  だけで既存の判定ロジックにそのまま乗る（ChatGPTレビュー承認・採用）。
```

### [判断] removedChordIdsが空の場合はreconcile()を呼ばない

```
結論:
  純粋なtruncateのみ（既存コードのidが維持されたまま短くなるだけ）で
  完結するCtrl+Vでは、commitPastePlan()内でreconcile()自体を
  呼び出さない。

理由:
  Sectionから見てidの消滅が一切発生しないため、Section boundary
  reconciliationを行う意味がない。「効率化」ではなく「Mutation
  Semantics上、処理する対象がない」という整理（ChatGPTレビュー承認）。
```

### [判断] `newIds`と`replacementFirstChordId`/`replacementLastChordId`を明確に分離する

```
結論:
  buildPastePlan()の戻り値において、newIds（貼付によって新規生成した
  コードのidのみ）と、replacementFirstChordId/replacementLastChordId
  （Mutation後に生まれた新ブロック全体の先頭・末尾）を別フィールドの
  まま維持し、混同しない。

理由:
  通常ケースではreplacementFirstChordId/replacementLastChordIdは
  newChords（＝newIds）の先頭・末尾と一致するが、「単一コード内完結
  ペースト」発生時はX-left/X-rightがこれに該当し、newIdsには一切
  含まれない。両者を同一視するとPhase111の実装で混同事故が起きる
  というChatGPTレビュー指摘を受け、コメントで明示的に区別した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### Ctrl+Vは単一のMutation種別ではなく、既存パターンの組み合わせだった

Phase111-A時点では「Ctrl+Vは既存3種（delete/merge/pasteSelection）とは
根本的に異なる複合Mutationではないか」という懸念があったが、実際に
buildPastePlan()の分岐を1つずつ既存Factsモデルへ照合した結果、

```
fullyInside消滅       → 既存のdelete相当（removedChordIdsへ追加）
片側truncate          → そもそもidが変わらないため対象外
単一コード内完結ペースト → merge/pasteSelectionと同型（N=1の特殊系）
```

の3パターンに分解でき、いずれも既存のreconcile() Factsモデルの範囲内で
表現可能だった。新しいMutation種別や`reconcile()`自体の変更は不要だった。

### 実機検証で個別コード選択パネルの×ボタンが無反応であることを発見

Section reconciliationの検証中に偶然発見。ブラウザ拡張機能由来の
コンソールエラー（`content-script-start.js` / `myContent.js`）が
同時に出ていたが、これはCreateChordScore自体とは無関係と確認した。
×ボタン自体は、押してもコンソールにエラーが出ず、パネルも閉じず、
何も起きない（原因未特定）。回避策として、チャート上で別のコードを
クリックすれば選択は切り替わることを確認した。

---

## 7. 実機確認結果

```
□ Section境界に触れないCtrl+V                          → Section不変 ✅
□ startのみ消滅するCtrl+V                              → start remap、end不変 ✅
□ endのみ消滅するCtrl+V                                → end remap、start不変 ✅
□ Section全体を消滅させるCtrl+V                        → start/endが新ブロックへremap ✅
□ Section外へ左側拡張                                  → [SECTION EXTENT GUARD]発火、Section削除 ✅
□ Section外へ右側拡張                                  → [SECTION EXTENT GUARD]発火、Section削除 ✅
□ 単一コード内完結ペースト（新パターン）                   → X-left/X-rightへ正しくremap ✅
□ removedChordIdsが空のCtrl+V（純粋truncateのみ）        → reconcile()が呼ばれず、Section不変 ✅
□ 単一コードSection（start=end）が対象コードの内部にペースト → 生存し、start=X-left/end=X-rightになる ✅
□ Undo 1回で全て戻るか                                  → 1回で完全に復元、2回目のUndoで変化なし ✅
```

全10項目とも期待どおりの結果。回帰も確認されていない。

---

## 8. Remaining Issues（残課題）

```
P1  個別コード選択パネルの×ボタンが無反応（Phase111実機テストで発見）
    状態: 未調査
    内容: 下部の個別コード選択パネル（コード名・秒数・小節数を表示する
    パネル）の×ボタンを押しても、選択解除・パネルクローズのいずれも
    発生しない。コンソールにもエラーは出ない。
    回避策: チャート上で別のコードをクリックすれば選択は切り替わる。
    Section Preview機能とは独立したstateのため、今回のCompound
    Mutation対応の検証自体には支障がなかった。

P2  EPS境界（貼付位置が既存コードの境界と厳密に一致するケース）の
    個別実機検証は未実施
    状態: 意図的に見送り（§3参照）。buildPastePlan()の既存判定ロジック
    自体は無変更のため回帰リスクは低いと判断しているが、将来
    buildPastePlan()自体に手を入れる際は改めて確認が必要。
```

---

## 9. Next Phase（次フェーズ開始位置）

```
Phase111でSection Data LayerのCompound Mutation対応
（delete/merge/pasteSelection/Ctrl+V）が全て完結した。

次の候補（優先順位は次回セッション開始時に相談）:
  ・P1（×ボタン無反応）の原因調査 ※Section機能とは無関係の独立バグ
  ・Section境界共有の正式サポート（current-issues.md参照・独立Epic）
  ・Section UX Epic（current-issues.md参照）
  ・5フェーズ棚卸し（Phase109〜113。本handoverと同時 or 次回）
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/analysisCommands.js
  ・buildPastePlan()
      removedChordIds / firstChordId / lastChordId /
      replacementFirstChordId / replacementLastChordId の計算を追加
      既存の5分岐ロジック・survivors構築・戻り値のbuffer/newIdsは無変更
      理由: Phase111本体（§4・§5参照）
  ・commitPastePlan()
      reconcile()呼び出しを追加（removedChordIds.size>0の場合のみ）
      理由: Phase111本体（§4・§5参照）

node --check通過・CRLF全行維持確認済み。
実機確認済み（§7参照・全10項目）。
```

---

## 11. Micro Log

- Phase111開始時、直前のPhase111チャットが消失するトラブルがあったが、
  たかっちさんが保管していた引き継ぎプロンプトから正常に再開できた
- Phase111-A時点では「単一コード内完結ペースト」を既存モデルで表現できるか
  懸念があったが、Section視点で捉え直すことで merge（N→1）の特殊系に
  すぎないと判明し、reconcile()自体の変更は不要という結論に至った
- ChatGPTレビューで、start/endどちらへremapすべきかの直感的な迷い
  （Phase111-B時点）を、Phase111-Cで正しく修正できていたことが確認された
- 実機検証中に、Section機能とは無関係な既存UIバグ（×ボタン無反応）を
  偶然発見。当初はブラウザ拡張機能由来のコンソールエラーと誤認しかけたが、
  切り分けの結果無関係と判明した
- ドキュメント差分監査中、`git commit`実行時にpathspecを省略したため、
  README.md用のbaselineコミットにarchitecture.mdの編集後内容が意図せず
  混入する事故が発生した。git reset --hardではなくリポジトリ再初期化で
  対処し、以降の全add/commitでpathspecを明示する運用へ切り替えた。
  「baseline作成時は必ず対象ファイルをpathspecで明示する」という
  実務上の教訓として記録する

---

## 12. Deferred Documentation（棚卸し時に反映する内容）

```
### current-issues.md

#### CLOSE
- Ctrl+V（そのまま貼り付け）がSection境界reconciliationに未対応
  （Phase110で発見・Phase111で解消）

#### ADD
- 見出し: 個別コード選択パネルの×ボタンが無反応（Phase111実機テストで発見）
  状態: 未調査
  内容: 下部の個別コード選択パネル（コード名・秒数・小節数を表示する
  パネル）の×ボタンを押しても、選択解除・パネルクローズのいずれも
  発生しない。コンソールにもエラーは出ない（ブラウザ拡張機能由来の
  無関係なコンソールエラーとは切り分け済み）。
  回避策: チャート上で別のコードをクリックすれば選択は切り替わる。
  Section Preview機能とは独立したstateのため、Compound Mutation対応の
  検証自体には支障がなかった。

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Section Boundary Reassignment（Ctrl+V対応拡大・Phase111・
    buildPastePlan()/commitPastePlan()へreconciliation拡大。
    「単一コード内完結ペースト」という新しいMutation topologyも
    既存Factsモデル（N=1特殊系）で表現可能と確認。reconcile()自体は
    無変更。Section Data LayerのCompound Mutation対応が
    delete/merge/pasteSelection/Ctrl+Vの全経路で完結）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 111 | Compound Mutation Boundary Resolution（Ctrl+V対応拡大。
    buildPastePlan()/commitPastePlan()へreconciliation拡大。
    単一コード内完結ペーストをN=1特殊系として統合） |
    analysisCommands.js |

- Future Candidates → Section Subsystem Progressの更新:
  P1（Compound Mutation対応）を「完了（delete/merge/
  pasteSelection/Ctrl+V全経路）」に更新
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
