# 引き継ぎ: Phase110完了 — Paste Mutation Boundary Resolution

## 作業状態
- ブランチ: phase110-paste-boundary-resolution
- 直前作業: Phase109完了（Compound Mutation Boundary Resolution・削除/Merge限定）

---

## 1. Purpose（目的）

Phase109ではSection境界の再割り当て（reconcile()）をdeleteChordCommand()・
deleteSelectionCommand()・mergeSelectionCommand()へ拡張したが、
pasteSelectionCommand()は「削除と生成が同時に起こる」性質のため意図的に
Phase110へ分離していた（handover_phase109.md §3参照）。Phase110は
このPaste（N→M Mutation）にSection reconciliationを対応させる。

```
delete : N → 0   （Phase108〜109で対応）
merge  : N → 1   （Phase109で対応）
paste  : N → M   ← 本フェーズ（Phase110）
```

---

## 2. Scope（今回やったこと）

```
・reconcile()のreplacement Factsを拡張
    Phase109: { firstChordId, lastChordId, replacementChordId }
    Phase110: { firstChordId, lastChordId,
                 replacementFirstChordId, replacementLastChordId }
    replacementChordId（単数）は完全廃止（後方互換なし）
・reconcile()内部、startRemoved && endRemoved 分岐を
  start/end独立設定可能な形へ変更
    （mergeはN→1のため両者が同一値になる特殊系として自然に収束）
・mergeSelectionCommand()を新Facts形式へ更新
・pasteSelectionCommand()にSection reconciliation追加
    splice前に旧ブロックのfirstChordId/lastChordId/removedChordIdsを確定
    splice後、refreshSelection前にreconcile()を呼ぶ
・[MUTATION SEMANTICS]にpaste（N→M）を追加
    delete(N→0) / merge(N→1) / paste(N→M) の3分類確立
・[SECTION EXTENT GUARD]の判定式が「旧ブロック（firstChordId/
  lastChordId）」を見て、remap先の決定が「新ブロック
  （replacementFirstChordId/replacementLastChordId）」を見る、
  という二段構造であることをarchitecture.mdへ明記
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・buildPastePlan() / commitPastePlan()（Ctrl+V「そのまま貼り付け」経路）
    → 既存コードの分割・複製という異なるMutation構造を持つため、
      pasteSelectionCommand()とは別設計が必要。意図的にスコープ外。
      [重要] この経路はreconcile()を一切呼ばない。実機検証の結果、
      Section境界を含む範囲にCtrl+Vで貼り付けると、境界remapが
      行われないまま旧IDが失われ、結果的にSectionが削除される
      ことを確認した。これは「バグ」と断定するものではなく、
      Phase110で対応していない未対応経路として扱う（§7参照）。

・Section境界共有の正式サポート（Phase109で既に別Epicとして分離済み）

・Audio durationへの自動フィット
    → Phase110の議論初期で新規に浮上した論点だが、reconcile()とは
      無関係の別機能（Pasteの時間配置ロジックそのものの拡張）と
      判明したためスコープ外と確認した。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `reconcile()` Facts拡張 | `replacementChordId`（単数）→`replacementFirstChordId`/`replacementLastChordId`（2値） | analysisSession.js |
| `reconcile()` 内部ロジック | startRemoved&&endRemoved分岐でstart/endを独立設定可能に | analysisSession.js |
| `mergeSelectionCommand()` | 新Facts形式へ更新（N→1のため両者同一値） | analysisCommands.js |
| `pasteSelectionCommand()` | Section reconciliation追加（splice前にFacts確定→splice後にreconcile呼び出し） | analysisCommands.js |
| コメント更新 | Section系対象コマンド一覧にpaste追加、buildPastePlan/commitPastePlanの対象外明記 | analysisCommands.js |

node --check・CRLF維持を確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `replacementChordId`を残さず完全廃止する

```
結論:
  旧フィールド名は互換用に一切残さない。

理由:
  Paste（N→M）を表現するには単数の実体では不可能であり、
  残しても「使われない冗長フィールド」になるだけ。外部公開APIでは
  なくSection Session内部のFactsのため、後方互換を維持するメリットも
  ない（ChatGPTレビュー指摘・採用）。
```

### [判断] mergeは`replacementFirstChordId === replacementLastChordId`とする

```
結論:
  N→1という意味論そのものは変えず、新Facts形式の中で「先頭と末尾が
  同じ値」という自然な特殊系として表現する。

理由:
  delete(N→0)/merge(N→1)/paste(N→M)という3種のMutationを同一の
  Facts構造で表現できることが確認できた。専用の分岐を増やす必要が
  ない。
```

### [判断] EXTENT GUARDは「旧ブロック」、remap先は「新ブロック」を見る、という区別を明文化する

```
結論:
  [SECTION EXTENT GUARD]の判定式（extendsLeft/extendsRight）は
  firstChordId/lastChordId（Mutation前の削除対象ブロック）のみを
  参照し、replacementFirstChordId/replacementLastChordId（Mutation後
  の新ブロック）は一切参照しない。この区別をarchitecture.mdへ明記した。

理由:
  ドキュメントレビュー時、EXTENT GUARDの判定式に新ブロックの値
  （replacementFirstChordId等）が誤って使われていないか、という
  懸念が指摘された。実装（analysisSession.js）・ドキュメント案の
  両方を再確認した結果、実際には旧ブロックの値のみを使う設計に
  最初からなっており、混同は発生していなかった。ただし将来
  （Phase111でCtrl+VのMutation Semanticsを設計する際等）に同種の
  混同が起きるリスクを防ぐため、両者の違いを明示的な一文として
  architecture.mdへ追記した（ChatGPTレビュー指摘・採用）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 実機検証で「Ctrl+V」と「Ctrl+Shift+V」の混同が複数回発生した

Phase110の実機検証過程で、「Sectionが原因不明に消える」という報告が
複数回上がり、DevToolsのブレークポイント・Consoleでのbuffer比較等を
経て切り分けを試みたが、いずれも決定打を得られなかった。最終的に
たかっちさんご自身の気づきにより、これらの操作が実際には
`Ctrl+Shift+V`ではなく`Ctrl+V`だったことが判明した。

```
Ctrl+Shift+V → pasteSelectionCommand() → reconcile()を通る
Ctrl+V       → pasteAbsolute() → buildPastePlan()/commitPastePlan()
               → reconcile()を通らない
```

DevToolsでの深追いよりも、まず最小構成（1コード→1コードのPaste）で
UI上の結果を確認する方が効率的だった、という教訓が得られた
（ChatGPTレビュー指摘・実践）。この切り分けの結果、Case A〜F・単一
コードSection完全置換のすべてが`Ctrl+Shift+V`経由で実機確認できた。

### Merge回帰確認の「NG」も、Section外巻き込みによる正しい動作だった

初回のMerge回帰確認で「Sectionが消えた」と報告されたが、詳細確認の
結果、結合対象がSection範囲＋Section外のコード1個（Case F相当の
状況）になっていたことが判明した。Section範囲と選択範囲を完全一致
させて再テストしたところ、Merge自体は正常に動作した。

この経緯自体が、[SECTION EXTENT GUARD]・[COMPOUND MUTATION BOUNDARY
RESOLUTION PRINCIPLE]の判定ロジックが意図通り厳密であることの
副次的な証拠にもなった（Section外を巻き込む操作は、Merge・Pasteの
どちらでも一貫してSection削除という結果になることを確認）。

### ドキュメントレビューにおける「grep/view before assert」の再確認

ChatGPTレビューで[SECTION EXTENT GUARD]の判定式が新旧ブロックの値を
混同しているのではという指摘があったが、実際に実装コード
（analysisSession.js）を`grep`で確認した結果、該当箇所は最初から
正しい実装になっていた（§5参照）。指摘そのものは実装バグの発見には
至らなかったが、「新旧ブロックの値を混同しないこと」という一般原則
としての価値はあったため、ドキュメントへの明示的な注記として採用した。
レビュー指摘を鵜呑みにせず実コードで裏取りする、という
CLAUDE.mdの原則が機能した一例。

---

## 7. Remaining Issues（残課題）

```
P1  Ctrl+V（pasteAbsolute）がSection境界reconciliationに未対応
    （今回発見・優先度：高・次フェーズ最優先候補）
    状態: 未対応（Phase110は意図的にスコープ外としたが、UX上の実害が
    確認されたため次フェーズで最優先候補とする）
    内容: buildPastePlan()/commitPastePlan()（Ctrl+V経路）はreconcile()
    を一切呼ばない。実機検証により、Section境界コードを含む範囲へ
    Ctrl+Vで貼り付けると、境界remapが行われないまま旧IDが失われ、
    後続のgetSections()呼び出し時にvalidateSectionInvariants()が
    「参照先が見つからない」と判定してSectionが削除されることを
    確認した。これを仕様として承認するか、reconciliation対応を
    拡張するかはPhase111で設計判断する（現時点では未対応経路という
    事実のみを記録する）。current-issues.mdへ正式Issue登録済み。

P2  単一コード削除時の描画崩れ（今回発見・優先度：低・未検証）
    状態: 観察中・再現条件未確定（スクリーンショット未取得）
    内容: Section境界を含む単一コード削除の直後、画面描画が一瞬
    おかしくなる現象が報告された。Section機能のデータ整合性の問題か、
    Chart Modeの再描画タイミングの問題か切り分けできていない。
    Phase106の[RENDER CONTEXT INVARIANT]（renderChartMode()引数省略
    問題）と類似の症状の可能性もある。次回発生時に実機で再現・
    スクリーンショット取得のうえ調査する。
    [current-issues.mdへの反映について] 再現条件・証拠が不十分な
    ため、今回はhandoverへの観察記録に留め、current-issues.mdへの
    正式Issue登録は見送る。再現できた時点で正式Issue化する。

P3  duration absorptionによるSection表示幅の変化（既存挙動・再確認のみ）
    状態: 既存のduration absorption（Phase75由来の隣接コード伸長）に
    伴う表示上の変化として認識している。今回のテストで改めて同じ
    現象が観測されたが、新規のSection境界不整合とは確認されていない。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
最優先候補: Ctrl+V（pasteAbsolute）のSection境界reconciliation対応（P1）
  ユーザーからの早期着手希望あり。

Phase111着手時の留意点（ChatGPTレビュー指摘）:
  いきなりbuildPastePlan()/commitPastePlan()にreconcile()を
  組み込むのではなく、まずCtrl+V（pasteAbsolute）のMutation
  Semantics自体を定義するところから始める。buildPastePlan()/
  commitPastePlan()は「絶対位置保持・Planning/Applying分離」という
  既存の独立した設計（architecture.md §12参照）を持つため、
  Phase109〜110で確立したdelete(N→0)/merge(N→1)/paste(N→M)の
  枠組みにそのまま当てはまるとは限らない。既存コードの分割・複製を
  伴う場合、「削除された旧コード」「新しく生成された/分割された
  コード」の対応関係がpasteSelectionCommand()より複雑になる可能性が
  高く、この対応関係の整理がPhase111の設計フェーズの中心になる
  見込み。

次点候補:
  P2の再現・調査
  Section UX Epic（current-issues.md参照・従来通りの優先度）
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・reconcile(session, facts)
      replacement Factsを { firstChordId, lastChordId,
      replacementChordId } から { firstChordId, lastChordId,
      replacementFirstChordId, replacementLastChordId } へ拡張
      startRemoved && endRemoved 分岐でstart/endを独立設定可能に変更
      理由: Phase110本体（§4・§5参照）
      JSDocを新Facts形状・[MUTATION SEMANTICS]のpaste追加に合わせて更新

js/analysisCommands.js
  ・mergeSelectionCommand()
      reconcile()呼び出しを新Facts形式へ更新
      （replacementFirstChordId = replacementLastChordId = merged._id）
      理由: Phase110本体（§4・§5参照）
  ・pasteSelectionCommand()
      splice前に removedChordIds / firstChordId / lastChordId を確定
      splice後、refreshSelection前に reconcile() を呼ぶよう追加
      理由: Phase110本体（§4参照）
  ・コメント更新
      Section系対象コマンド一覧へpasteSelectionCommandを追加
      buildPastePlan/commitPastePlanが対象外である旨を明記

node --check 両ファイル通過・CRLF全行維持確認済み。
実機確認済み（Case A〜F・単一コードSection完全置換・Merge回帰・
Undo 1回原則、いずれもCtrl+Shift+V経由で確認済み）。
Delete回帰（remap自体）は問題なし。描画崩れは別件として観察記録
（§7 P2参照）。
```

---

## 10. Micro Log

- 当初「Ctrl+Vでもリロード後は動くはず」という前提でDevToolsの
  ブレークポイント・Console調査を重ねたが、決定打を得られず。
  最終的に操作手順そのものの確認（Ctrl+V vs Ctrl+Shift+V）に
  立ち返ったことで解決した。DevToolsでの深追いより先に、UI上の
  最小構成テストを行うべきだった、という反省点
- Merge回帰の「NG」報告も、選択範囲がSection外を1個巻き込んでいた
  という単純な原因だった。テスト条件を都度厳密に確認する重要性を
  再確認した
- architecture.mdレビュー時、EXTENT GUARDの判定式に新旧ブロックの
  値の混同があるのではという指摘を受けたが、実装コードをgrepで
  確認した結果、該当箇所は既に正しい実装だった。レビュー指摘を
  実コードで裏取りしてから反映する、という手順の重要性を再確認
- current-issues.mdの更新時、完了済み項目（Section Data Layer）の
  説明ブロックをそのまま残しかけたが、README.mdの
  [FILE SCOPE INVARIANT]・[CLOSE BY DELETION]に反すると指摘を受け、
  ブロック自体を削除する形へ修正した
- phase-status.mdへのPhase110反映を一度検討したが、5フェーズ棚卸し
  ルールに反すると判断し、今回は変更を見送った（次回Phase109〜113の
  棚卸しでまとめて反映する）

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue:
  - pasteSelectionCommand()におけるCompound Mutation Boundary
    Resolutionを完了した。一方、buildPastePlan()/commitPastePlan()
    （Ctrl+V経路）は未対応であり、Paste全体としての対応が完了した
    わけではない（新規issue参照）。
  - Section Data Layer（完了済み項目の説明ブロックを
    [CLOSE BY DELETION]に従って削除。詳細は本handoverおよび次回
    phase-status.md棚卸しに記録）。
- 今回新規に積み残したissue:
  - Ctrl+V（pasteAbsolute）がSection境界reconciliationに未対応
    （§7 P1参照・優先度高）
  （単一コード削除時の描画崩れは証拠不十分のため見送り。
   handover内の観察記録として保持）

---

## Deferred Documentation（次回棚卸し時にphase-status.mdへ反映する内容）

```
phase-status.md
  - Current Status（完了済みリスト）に追加:
    ✓ Section Boundary Reassignment（Paste対応拡大・Phase110・
      pasteSelectionCommand（Ctrl+Shift+V）へreconciliation拡大。
      replacement FactsをreplacementFirstChordId/
      replacementLastChordIdへ拡張し、delete(N→0)/merge(N→1)/
      paste(N→M)を統一的に扱えるように。Section Data Layerの
      Compound Mutation対応がpasteSelectionCommandまで完了。
      ただしbuildPastePlan/commitPastePlan（Ctrl+V経路）は
      未対応のまま残る）

  - Major Milestones（Analysis Editorテーブル）に追加:
    | 110 | Compound Mutation Boundary Resolution（Paste対応拡大。
      pasteSelectionCommandへreconciliation拡大。replacement Factsを
      2値化し delete/merge/pasteを統一的に扱えるように。Ctrl+V経路は
      未対応のまま） | analysisSession.js / analysisCommands.js |

  - Future Candidates → Section Subsystem Progressの更新:
    P1（Compound Mutation対応）を「完了（delete/merge/paste
    selection）。Ctrl+V経路のみ次フェーズへ継続」に更新
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
