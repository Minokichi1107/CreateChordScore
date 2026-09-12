# 引き継ぎ: Phase109完了 — Compound Mutation Specification（Destructive Mutation限定）

## 作業状態
- ブランチ: phase109-compound-mutation
- 直前作業: Phase108完了（Section Boundary Reassignment・単一削除のみ対応）

---

## 1. Purpose（目的）

Phase108では、Section境界コードの削除時の自動付け替え（§4.3ケースB）を
単一コード削除（deleteChordCommand）にのみ実装し、複数選択削除
（deleteSelectionCommand）・結合（mergeSelectionCommand）・貼り付け上書き
（pasteSelectionCommand）は「Compound Mutation対応」として将来課題に
分離していた。

Phase109はこのうち、deleteSelectionCommand / mergeSelectionCommandの
2コマンドについて、Section境界の正しい付け替えを実現する。
pasteSelectionCommandは「削除と生成が同時に起こる」性質が大きく異なるため、
意図的にPhase110へ分離した（詳細は §3 Out of Scope参照）。

**本フェーズの成果物としての位置づけ**：「Compound Mutation APIの完成」
ではなく、「delete/mergeという2種類のDestructive Mutationで成立する
最小限のMutation Factsの確立」である。Paste対応時にFactsが不足していれば、
その時点でAPIを拡張する（必要になるまで一般化しない、という既存の
プロジェクト方針に基づく）。

---

## 2. Scope（今回やったこと）

```
・reconcile()の第2引数を全面刷新
    Phase108: { chordIdRemap }
    Phase109: { removedChordIds, leftSurvivorId, rightSurvivorId, replacement }
    chordIdRemapは完全廃止（後方互換の必要がない内部APIのため）
・[SECTION REMOVED-ID JUDGMENT] → [COMPOUND MUTATION BOUNDARY
  RESOLUTION PRINCIPLE]として再定義・拡張
・[SECTION EXTENT GUARD]の新設（merge時、Section外を巻き込んでいないか
  の判定）
・duration吸収方向（_pickAbsorbingNeighbor()）とSection境界remap方向を
  分離（[MUTATION SEMANTICS]）
・deleteChordCommand（単一削除・Phase108由来）の潜在バグを発見・修正
・Section Preview表示の同期バグを発見・修正（app.js）
    a) Sectionが生存したまま境界だけ変わるケースの再計算漏れ
    b) 再計算タイミングが実際の描画より後だったことによる1描画分の遅延
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・pasteSelectionCommandでのCompound Mutation対応
    → 「削除」と「生成」が同時に起こる点で意味論が大きく異なり、
      本フェーズの議論の中でも一度APIを拡張しかけたが、
      「delete/mergeで検証してから」という方針に立ち返り、
      Phase110へ明確に分離した。

・非連続選択（飛び石）でのCompound Mutation対応
    → 実コード確認の結果、Shift+クリック範囲選択（selectRange()）が
      常に連続区間のみを生成する設計であり、UIから非連続選択を
      作ること自体が現状不可能。deleteSelectionCommand/
      mergeSelectionCommand内の「選択範囲が連続していないため
      削除/結合できません」というチェックは、現状のUIからは
      到達しない防御的コードであることを確認した。

・Section境界の共有（同一chordIdを複数Sectionのstart/endが指す）の
  正式サポート
    → 設計検討の過程で、ユーザーが「本来共有させたかったが不可能だと
      思い込んで避けていた」という実情が判明し、価値のある拡張候補
      として浮上した。ただしUI・作成フロー・Boundary Editor・
      Preview・Navigationすべてに影響する規模のため、独立した
      Epicとしてcurrent-issues.mdへ切り出した（Compound Mutationの
      スコープには含めない）。

・merge実行によりSectionが削除される場合の確認ダイアログ
    → [SECTION EXTENT GUARD]によるSection削除自体は今回確定した
      正しい仕様。「警告なしに実行される」というUX面の課題は
      別問題として認識したが、使用頻度が低いと判断し、意図的に
      先送りとした（current-issues.md参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `reconcile()` 全面刷新 | `{ chordIdRemap }` → `{ removedChordIds, leftSurvivorId, rightSurvivorId, replacement }`。[COMPOUND MUTATION BOUNDARY RESOLUTION PRINCIPLE]・[SECTION EXTENT GUARD]を実装 | analysisSession.js |
| `deleteChordCommand()` | duration吸収先（`_pickAbsorbingNeighbor()`）とは独立に、splice前の`buffer[idx-1]`/`buffer[idx+1]`をleft/rightSurvivorIdとして計算するよう変更（潜在バグ修正） | analysisCommands.js |
| `deleteSelectionCommand()` | 新規にreconcile()呼び出しを追加。ブロック外側の生存コード2つを渡す | analysisCommands.js |
| `mergeSelectionCommand()` | 新規にreconcile()呼び出しを追加。`replacement`（ブロック先頭/末尾/置換後ID）を渡す | analysisCommands.js |
| `_syncSectionPreviewVisibility()` | 「Sectionの存在確認のみ」から「生存時は常にchordIdsを再計算」へ変更 | app.js |
| `_refreshEditorView()` | `renderChartMode()`（実描画）より前に`_syncSectionPreviewVisibility()`を呼ぶよう追加（描画順序に起因する1描画分の遅延を解消） | app.js |

`node --check`・CRLF維持・500行以内（各差分）を全ファイルで確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `chordIdRemap`を残さず完全廃止する

```
結論:
  Phase108由来の chordIdRemap: Map<oldId, newId> は、Phase109で
  removedChordIds/leftSurvivorId/rightSurvivorId/replacementへ
  完全に置き換え、APIとして残さない。

理由:
  実機検証の結果、「ブロック全体に1つのsurvivorを対応付ける」という
  chordIdRemapの設計そのものが、複数Sectionが同時に影響を受ける
  ケースや、mergeのようにSection外を巻き込むケースを正しく表現
  できないことが判明した。外部公開APIではなく、後方互換を維持する
  メリットもないため、「使われなくなったが残しておく」ことは
  将来「Section境界remapにはchordIdRemapを使えばいい」という
  誤解を招くリスクの方が大きいと判断した（ChatGPTレビュー指摘・採用）。
```

### [判断] duration吸収方向とSection境界remap方向を分離する

```
結論:
  _pickAbsorbingNeighbor()（削除された時間をどちらの隣接コードに
  吸収させるか、という音楽的な処理）と、Section境界をどちらへ
  付け替えるか、は無関係な別問題として扱う。deleteChordCommand /
  deleteSelectionCommandは、常にブロック外側の両隣（leftSurvivorId /
  rightSurvivorId）を独立に計算し、reconcile()側がSectionの
  start/endそれぞれの役割に応じてどちらを使うか判定する。

理由:
  _pickAbsorbingNeighbor()は「左に相手がいれば常に左を優先する」
  という固定の優先順位を持つ。これをそのままSection remapに
  流用すると、単一コード削除でも「Sectionが本来の範囲外（削除位置の
  手前）まで拡大する」という潜在バグが生じることを、Phase109の
  検証中に新規発見した（§6 Findings参照）。single-chord Sectionの
  テストのみでは、start===endゆえに常にCase Cへ帰結してしまい、
  remap方向の誤りが結果に現れず、Phase108時点では見逃されていた。
```

### [判断] [SECTION EXTENT GUARD]の導入（mergeのみ・deleteには不要）

```
結論:
  mergeがSectionの意味領域を超えて外側のコードまで巻き込んでいる
  場合、Sectionは（部分remapではなく）削除する。判定は
  「replacement.firstChordId/lastChordIdが、Sectionのstart/end
  それぞれと一致するか」で行う（extendsLeft/extendsRight）。
  deleteには同種のガードを設けない。

理由:
  delete（消滅）とmerge（置換）はMutationの意味論が根本的に異なる。
  deleteはブロックが消えるだけで、その領域を「代表」する新しい実体は
  生まれない。一方mergeは、ブロック全体を1つの新しいコードに置き換え、
  そのコードがブロックの全領域を「代表」してしまう。そのため、
  merge結果がSection外の領域まで代表してしまうと、Sectionの意味が
  意図せず拡大してしまう（実機検証・たかっちさんの実感「セクション外の
  コードを含んでいて範囲が拡大するのには違和感がある」を踏まえ確定）。
  deleteにはこの「代表する実体」が存在しないため、同種の問題は
  原理的に発生しない。

  4パターン（完全一致／部分一致／外側を含む／内部のみ）で検証し、
  extendsLeft/extendsRightの2条件のみで全パターンを正しく判定
  できることを確認した（§6 Findings参照）。
```

### [判断] merge完全一致時はSectionを削除せず生存させる（[BEHAVIOR CHANGE]）

```
結論:
  merge範囲がSectionの意味領域（interior）とぴったり一致する場合、
  Sectionは削除されず、start=end=merge結果のIDとして生存する。

理由:
  当初の実機テストでは「merge全体飲み込み→Section削除」を「OK」と
  確認していたが、設計討議の過程で「Xとしてコードが残っているの
  だから、Sectionも残ってほしい」という感覚が確認され、これを
  優先して仕様を変更した。「セクション外を巻き込んで範囲が拡大する
  のは困る」という別の懸念とは区別し、「ぴったり一致」の場合のみ
  生存、「範囲が拡大する」場合は削除、という2つの軸で整理した。
```

### [判断] 単一コードSection削除時の挙動変更（[BEHAVIOR CHANGE]再確認）

```
結論:
  Phase108では単一コードSection（start===end）の唯一のコードが
  削除されるとremapして生存していたが、Phase109ではSection自体が
  削除される。今回の実機テストで、たかっちさんに改めて意思確認し
  「その際はコードを削除した場合はセクションごと消えてほしい」との
  回答を得て、この挙動変更を正式に確定した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### mergeSelectionCommandは「先頭コードを残す」のではなく「新規UUID生成」だった

議論の初期段階では、CreateChordScoreの`mergeSelectionCommand`が
一般的な「merge」（新規コード生成）とは異なり「先頭コードを残す」
実装だという前提で設計を進めていたが、実コード確認の結果、これは
誤りだった。実際には選択範囲の全コード（先頭含む）が削除され、
`crypto.randomUUID()`による全く新しいIDのコードに置き換わる実装
だった。表示上の名前（chord名）は先頭のものを引き継ぐため
「先頭が残ったように見える」だけだった。

この発見（grep/view before assertの原則を怠っていた反省点）が、
結果的にPhase109の設計（delete/mergeとも「ブロック全体が1つの
survivorへ収束する」という同型のFacts）をシンプルにする方向に
働いた。なお、UUID新規生成・confidence固定値(1)という実装自体の
妥当性（先頭のUUIDを維持すべきではないか、という論点）は、
merge操作の意味論そのものに関わる別の設計判断として、今回は
現状維持のまま据え置いた（current-issues.md参照）。

### 単一削除（deleteChordCommand）にも「Section外への拡大」の潜在バグがあった

Phase109は当初、複数選択削除（deleteSelectionCommand）で発見された
「Section外のコードまで巻き込んで拡大する」バグの修正が主眼だったが、
検証の過程で、Phase108由来の単一削除（deleteChordCommand）にも
全く同じ構造のバグが潜在していたことを新規発見した。

```
Section: X〜G（W, X, Y, Gという並び。Wは含まない）
Xを削除 → _pickAbsorbingNeighbor()は「左に相手がいれば常に左を優先」
  という固定ロジックによりWへ吸収
→ chordIdRemap = {X → W}
→ SectionがW〜G（Wは本来Section外）まで拡大
```

Phase108のテストは単一コードSection（start===end）のみを対象と
していたため、remap方向の誤りが結果（Case Cになるかどうか）に
影響せず、見逃されていた。Phase109でduration吸収方向とSection
remap方向を完全に分離したことで、この潜在バグも合わせて解消された。

### 「Section外への拡大」に見えた現象のうち、一部は表示上の錯覚だった

実機テストで「複数選択削除でSectionが後続コードまで巻き込んで
広がった」という報告があったが、詳細な調査の結果、これは2つの
独立した仕組みの組み合わせによるものだった。

```
① Section境界のremap（今回設計・実装） → 正しく動作していた
   （IDとしては元々Section内だったコードへ正しく付け替わっていた）

② duration吸収（Phase75由来の既存機能。削除された時間を隣接コードが
   肩代わりして伸びる）→ Sectionとは無関係の既存仕様
   吸収先のコードの表示幅が大きく伸びたことで、Sectionの背景色も
   見た目上「広がった」ように見えていた
```

たかっちさんへ「Section内に留まる範囲でのdurationの伸びは自然に
感じるか」を確認したところ「特に問題ない」との回答を得たため、
②はバグではなく仕様として確定した。ただし、この切り分けの過程で
③（Section外を巻き込む複数削除・merge、後述）の**真のバグ**も
同時に見つかっており、「見た目は同じ現象に見えても原因は複数」
という教訓が得られた。

### Section Preview表示の同期漏れ（2段階で発見・修正）

実機テストで「delete/merge実行後、Section Previewのハイライトが
消える・古い範囲のまま残る（ESCで一度解除して再表示すると正しくなる）」
という報告があり、調査の結果、2つの独立した問題が重なっていた。

```
問題1（データ層）:
  _syncSectionPreviewVisibility()（renderSectionBar()末尾から呼ばれる）
  が「Sectionが存在するか」のみを確認し、「存在するが境界の中身が
  変わったか」を見ていなかった。Phase106の境界編集UIでは個別に
  手動再計算するコードが入っていたが、Phase109で追加したdelete/merge
  経路には同じ対処がなかった。
  → _syncSectionPreviewVisibility()自体を「生存時は常に再計算する」
    方式へ修正（Phase106の個別対処は重複するが実害なし・残置）。

問題2（描画順序）:
  問題1を修正した直後、今度は「Undoすると一瞬消えて、次の操作で
  正しく表示される」という新しい症状が発生した。原因は
  _refreshEditorView()内でrenderChartMode()（実際の描画）が
  renderSectionBar()（Preview再計算を含む）より先に呼ばれており、
  その回の描画には間に合っていなかったため。
  → renderChartMode()の前に_syncSectionPreviewVisibility()を
    明示的に呼ぶよう追加。

Phase106の境界編集UIがこの問題を踏まなかったのは、
_refreshEditorView()を呼ぶ**前**に手動でPreview再計算を行って
いたため、たまたま順序問題を回避できていたからだった。
```

この一連の調査は、単一のバグ報告から「実は2つの別々の原因（存在確認
漏れ・描画順序）が重なっていた」ことを1つずつ切り分けて特定した
プロセスであり、今回のPhase109で最も時間を要した部分だった。

### 非連続選択（飛び石）はUI上そもそも作成不可能

`selectRange()`（Shift+クリック範囲選択）の実装を確認したところ、
anchorからtargetまでのbuffer上の連続区間を機械的に選択する設計
になっており、「歯抜けの選択」を作るUI操作自体が存在しないことが
確認できた。deleteSelectionCommand/mergeSelectionCommand内の
「選択範囲が連続していないため削除/結合できません」というチェックは、
現状のUIからは到達しない防御的コードである。Phase109の設計で
「非連続選択は対象外とする」という前提を置いていたが、これは
むしろ「常に自動的に満たされている前提」であったことが実コード
確認で判明した。

---

## 7. Remaining Issues（残課題）

```
P1  Section境界編集ステッパーが動作しない（実機報告により発見）
    状態: 未調査。Phase109のreconcile()引数拡張との因果関係は
    現時点では確認されていない（getSections()の無引数呼び出し経路
    自体はPhase108までと同一のまま、という限定的な確認のみ取れて
    いる）。Phase109以前から存在していた可能性もあるため、
    [FEATURE REGRESSION POLICY]に従い実装漏れと断定せず、次回発生時に
    updateSectionBoundaryCommand()の呼び出し経路を実機で再調査する。

P2  merge実行でSectionが削除される場合の確認UX未実装
    状態: 意図的に先送り（使用頻度が低いと判断）。
    [SECTION EXTENT GUARD]によるSection削除自体は正しい仕様であり、
    バグではない。「警告なしに実行される」というUX面の課題として
    別途記録。

P3  pasteSelectionCommandのCompound Mutation対応（Phase110候補）
    削除と生成が同時に起こるため、本フェーズのFacts（removedChordIds/
    leftSurvivorId/rightSurvivorId/replacement）だけで表現できるか
    未検証。

P4  Section境界共有の正式サポート（独立Epic候補）
    同一chordIdを複数Sectionのstart/endが指すケース。UI・作成
    フロー・Boundary Editor・Preview・Navigationすべてに影響する
    規模のため、Compound Mutationとは独立したEpicとして
    current-issues.mdへ分離。

P5  merge操作の意味論見直し（UUID・confidence・オブジェクト同一性）
    現状mergeSelectionCommandは新規UUID・confidence固定値1を
    生成する実装。先頭コードのUUID維持へ変更するかどうかは、
    Compound Mutationとは独立した設計判断として保留。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase109でCompound Mutation（delete/merge限定）のSection対応が完結した。
次の候補（優先順位は次回セッション開始時に相談）:

  ・P1（境界編集ステッパー）の実機再調査 ※既存バグの可能性が高く優先度高
  ・pasteSelectionCommandのCompound Mutation対応（Phase110候補・P3）
  ・Section UX Epic（current-issues.md参照）
  ・Section境界共有の正式サポート（P4・独立Epic）
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・reconcile(session, facts)
      { chordIdRemap } → { removedChordIds, leftSurvivorId,
        rightSurvivorId, replacement } へ全面刷新
      [COMPOUND MUTATION BOUNDARY RESOLUTION PRINCIPLE]・
      [SECTION EXTENT GUARD]を実装
      理由: Phase109本体（§5参照）

js/analysisCommands.js
  ・deleteChordCommand()
      leftSurvivorId/rightSurvivorIdを duration吸収方向と独立に計算
      理由: 潜在バグ修正（§6 Findings参照）
  ・deleteSelectionCommand()
      reconcile()呼び出しを新規追加
      理由: Phase109本体（§5参照）
  ・mergeSelectionCommand()
      reconcile()呼び出しを新規追加（replacement Facts）
      理由: Phase109本体（§5参照）
  ・コメント更新
      chordIdRemapへの言及を新API名へ更新

js/app.js
  ・_syncSectionPreviewVisibility()
      「存在確認のみ」→「生存時は常に再計算」へ変更
      理由: Section Preview同期漏れ修正（§6 Findings参照）
  ・_refreshEditorView()
      renderChartMode()前に_syncSectionPreviewVisibility()を追加
      理由: 描画順序に起因する1描画分の遅延修正（§6 Findings参照）

node --check 全ファイル通過・CRLF全行維持確認済み。
実機確認済み（単一削除・複数選択削除・Undo/Redo・Section Preview同期、
いずれも確認済み）。
mergeは以下6パターンを確認済み: 完全一致／開始側部分一致／終了側部分
一致／開始側外側巻き込み／終了側外側巻き込み／内部のみ（境界非該当）。
```

---

## 10. Micro Log

- 当初「chordIdRemapをleftSurvivorId/rightSurvivorIdへ置き換える」
  提案に対し、ChatGPTレビューで「merge/deleteを区別せず統合するのは
  時期尚早」との指摘を受け、一度実装を保留して4パターン検証を先に行った
- mergeSelectionCommandの「新規UUID生成」という実装事実を誤認したまま
  設計を進めていたことが、実コード確認で判明（grep/view before assert
  の原則の重要性を再確認）
- 「merge完全一致→Section削除」という当初の実機テストOK判定を、
  たかっちさんとの追加討議の末に「Section生存」へ仕様変更した
  （[BEHAVIOR CHANGE]として明記）
- Section Preview同期バグは、1回目の修正（存在確認→常時再計算）だけでは
  解決せず、Undoで新たな症状（描画順序起因のちらつき）が発覚し、
  2段階の修正が必要だった
- 「Section外を巻き込んだmergeでSectionが削除される」動作について、
  当初「困る」との反応があったが、確認ダイアログの実装は使用頻度の
  低さを理由に意図的に先送りとした

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue:
  - P1 Compound Mutation対応（複数選択削除／Merge。Phase108で新規
    積み残されたIssue。Pasteのみ「Compound Mutation対応（Paste）」
    として再定義し継続）
- 今回新規に積み残したissue:
  - Section境界編集ステッパーが動作しない（§7 P1参照）
  - merge実行でSectionが削除される場合の確認UX未実装（§7 P2参照）
  - pasteSelectionCommandのCompound Mutation対応（§7 P3参照）
  - Section境界共有の正式サポート（§7 P4参照・独立Epic）
  - merge操作の意味論見直し（§7 P5参照）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
