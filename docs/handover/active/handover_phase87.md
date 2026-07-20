# 引き継ぎ: Phase87完了 — Analysis Editor Command Layer抽出

## 作業状態
- ブランチ: phase87-analysis-session-extract
- 直前作業: Phase86-2完了（Session Authority抽出 + Ctrl/Cmd EditPoint + AddChord Enter修正）

---

## 1. Purpose（目的）

Phase86-2で確立したSession Authority（state mutation primitiveの分離）を一段上に拡張し、
Analysis EditorのEditing Command（copy/cut/delete/paste/merge）をapp.jsから分離する。

Session層が「stateをどう変えるか」のprimitiveだったのに対し、今回のCommand層は
「ユーザー操作1つ分の状態遷移（history 1回分）」を単位として抽出する。
app.jsは「Commandを呼び、結果に応じて画面へ反映する」オーケストレーターに限定する。

---

## 2. Scope（今回やったこと）

```
① analysisCommands.js新設（Command Layer）
   ・deleteChordCommand / deleteSelectionCommand / copySelectionCommand /
     cutSelectionCommand / pasteSelectionCommand / mergeSelectionCommand
   ・buildPastePlan（pure helper）/ commitPastePlan（Transactional Command）
   ・内部ヘルパー _isNoChordEntry / _pickAbsorbingNeighbor をapp.jsから移設
   ・全関数が共通のCommandResult形状 { ok, reason?, selectedChordIds?, count? } を返す

② app.js側の薄いラッパー化
   ・deleteChord / deleteSelection / copySelection / cutSelection /
     pasteSelection / pasteAbsolute / mergeSelection
   ・toast / setSelectedChordIds / _refreshEditorView の呼び出しをすべてapp.js側に集約
   ・getPasteOrigin() は変更なし（chartmode.js依存のためapp.js残置。理由は§5参照）

③ debug互換性の維持
   ・window.__analysisEditorDebug.buildPastePlan を、旧シグネチャ
     （originTime, clipboardの2引数）のままDevToolsから呼べるようbindラッパー化
```

当初の対象は5関数（copy/cut/delete/paste/merge）だったが、実コード監査の結果、
`deleteChord()`（単体削除ボタンの実体）と`buildPastePlan`/`commitPastePlan`（Paste系の
既存の計画/適用分離）も対象に含めることになった（詳細は§6 Findings参照）。

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・updateChord / splitChord / moveBoundary 等、他のEditing CommandのCommand化
  → 今回はcopy/cut/delete/paste/merge系（選択操作に紐づくもの）に限定した。

・Result型（CommandResult）のJSDoc typedef共有ファイル化・TypeScript化
  → 現状はanalysisCommands.js冒頭のコメントに型定義を書いているのみ。
    型を複数ファイルで厳密に共有する必要が出た時点で検討する。

・clipboardのセッションスコープ見直し
  → analysisEditor.clipboardが編集セッションをまたいで永続化される仕様
    （Phase86-2時点で発見済み）は今回も対象外。Findingsとして再掲するに留める。

・cutSelectionのtoast文言・UX変更
  → 「コピー成功toastは削除の成否に関わらず必ず出る／削除成功は無言」という
    既存の非対称挙動をそのまま維持した（意図的な現状維持。設計段階で確定済み）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| Command Layer新設 | deleteChordCommand / deleteSelectionCommand / copySelectionCommand / cutSelectionCommand / pasteSelectionCommand / mergeSelectionCommand / buildPastePlan / commitPastePlan を実装。全てstate（analysisEditor）を第1引数に取り、DOM/Chart runtime/toastには一切触れない | analysisCommands.js（新設） |
| ヘルパー移設 | `_isNoChordEntry` / `_pickAbsorbingNeighbor`（削除時の吸収方向判定）をapp.jsから移設 | analysisCommands.js |
| app.jsラッパー化 | 対象7関数（deleteChord含む）の本体をCommand呼び出し＋副作用（toast/setSelectedChordIds/_refreshEditorView）へ置換 | app.js |
| debug契約維持 | `__analysisEditorDebug.buildPastePlan`を`(originTime, clipboard) => buildPastePlan(analysisEditor, originTime, clipboard)`のbindラッパーに変更 | app.js |
| import整理 | analysisCommands.jsから8関数をimport追加（既存のanalysisSession.js importの直後に配置） | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Command Layer Boundary（analysisCommands.js = state+Result、app.js = 副作用）

```
結論:
  analysisCommands.jsの全関数は、state mutationとCommandResultの返却のみを行う。
  DOM操作・Chart Mode runtime同期（setSelectedChordIds等）・toast・audio/focus/scrollは
  一切呼ばない。これらは1行であってもapp.js側に残す。

理由:
  Phase86-2のSession Authority（[SCOPE]コメントで確立した「state mutationと
  orchestrationの分離」）を、historyを積む単位（Editing Command）にもそのまま
  拡張した。例外を作らない方針はChatGPTレビューで確定済み。

[BOUNDARY INVARIANT]
  analysisCommands.js は DOM / Chart Mode runtime / audio runtime / toast を
  直接操作してはならない。Commandは state mutation と Result返却のみを責務とし、
  副作用の実行権限は app.js が持つ。
```

### [判断] Result Protocolの統一（{ ok, reason?, selectedChordIds?, count? }）

```
結論:
  全Command関数が共通のResult形状を返す。個別の戻り値（吸収id・新規id配列・
  bool等）はやめ、ok/reason/selectedChordIds/countの組み合わせで表現する。

理由:
  buildPastePlanが元々{ok, reason}形式を持っていたため、これを他のCommandにも
  拡張するのが自然だった。app.js側はr.okとr.reasonを見るだけでtoast可否を判断でき、
  「エラー文言の所有権はapp.js」という原則が実装レベルでも一貫する。

注:
  この統一shapeは「Editing Command」（deleteChordCommand等・historyを積む/
  積まないに関わらず選択操作の結果を返すもの）に対するものであり、
  buildPastePlan（pure planning helper）は対象外。buildPastePlanは
  貼り付け計画そのものを返すため、{ ok, reason?, buffer?, newIds? } という
  専用形状を維持する（commitPastePlanがこれを受け取って{ ok, selectedChordIds,
  count }へ変換し、そこで初めて統一shapeに合流する）。
```

### [判断] deleteChordをスコープに含め、共通コア（deleteChordCommand）へ統合

```
結論:
  deleteSelectionCommand()は選択が単一の場合、deleteChordCommand()に委譲する
  （吸収ロジックの実装を1箇所に保つという既存方針を継続）。

理由:
  旧構造ではdeleteSelection()が「副作用込みのdeleteChord()」に委譲していた。
  deleteSelectionだけをCommand化すると、Command層からUI層（app.js）へ処理が
  逆流する形になり、[BOUNDARY INVARIANT]を1発で破る。そのため両方を
  同時にCommand層へ移す必要があった（実コード監査で判明・詳細は§6）。
```

### [判断] cutSelectionのtoast順序は現状維持

```
結論:
  cutSelectionCommand()は、copySelectionCommand()の結果（count）を、
  後続のdeleteSelectionCommand()が失敗してもResultへ含め続ける
  （{ ...deleteResult, count: copyResult.count }）。
  app.js側はr.count != nullなら常にコピーtoastを出し、その後r.okを見て
  削除のエラーtoastを追加で出すかを判断する。

理由:
  旧cutSelection()はcopySelection()とdeleteSelection()を別々に
  自己完結呼び出ししていたため、「コピー成功toastは削除の成否に関わらず出る」
  という非対称な挙動になっていた。Phase87はアーキテクチャ整理に限定し
  UX変更を混在させない、という方針のため、この非対称性をそのまま
  Result Protocol上で再現した。
```

### [判断] buildPastePlanはstateを明示引数に取る形へ変更

```
結論:
  buildPastePlan(state, originTime, clipboard)。グローバルanalysisEditorの
  直接参照をやめ、bufferをstate.bufferとして受け取る。

理由:
  モジュールを分離した後もグローバル変数を暗黙に読む実装のままだと、
  「pure function」という設計意図が形式的に崩れる。実際に完全pureで
  あることは実コード監査で確認済み（§6 Findings参照）。
```

### [判断] getPasteOriginはapp.js残置

```
結論:
  getPasteOrigin()はCommand層へ移さず、app.jsに残した。

理由:
  内部でgetTimeForGridPosition()（chartmode.js）を呼んでおり、これを
  Command層に含めると「状態操作層がUI描画モジュールに依存する」形になり、
  既存のモジュール依存ルール（chartmode.jsはapp.js経由のみ参照可能・
  architecture.md §3）を破る。副作用を持たない問い合わせ関数だが、
  依存方向の観点からapp.js側に留めた。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### buildPastePlanは実コード監査の結果、既に完全pureだった

```
設計段階の仮説ではなく、実コード確認で確定した事実。bufferを読むだけで
一切変更しておらず、「検証と適用の分離」（buildPastePlan → commitPastePlan）
はPhase79の時点で既に実現されていた。今回はグローバル参照をstate引数へ
置き換えただけで、ロジック自体の変更は不要だった。将来Paste系をさらに
分解する際、この「Planning層はhistoryを持たない」という原則の根拠になる。
```

### deleteSelection()はdeleteChord()（副作用込み）へ委譲する構造だった

```
設計段階では「deleteSelectionを含む5関数を移すだけ」と想定していたが、
実コード確認で、単一選択時にdeleteSelection()がapp.js側の
deleteChord()（toast/setSelectedChordIds/_refreshEditorViewを含む
自己完結関数）へそのまま委譲していることが判明した。この依存を
解消しないとCommand層からUI層への逆流が発生するため、スコープを
deleteChordにも拡大した。
```

### pasteSelection()はcommitPastePlan型の「計画/適用」分離を経由していなかった

```
buildPastePlan/commitPastePlanの存在から、Paste系は既に计画/適用分離が
できていると想定しがちだが、実際にはpasteSelection()（範囲に合わせて
貼り付け・Ctrl+Shift+V）はこの分離を経由せず、単体でhistory+buffer+
selection操作を完結させる、deleteSelection/mergeSelectionと同型の
構造だった。当初のChatGPT案の最終関数一覧からもこの関数が漏れていたため、
実コード確認をしていなければCommand Layerの抽出が不完全なまま
Phase87を終えていた可能性がある。
```

### __analysisEditorDebugは「隠れた公開API」として機能していた

```
window.__analysisEditorDebugはコード内コメントで「[TEMP DEBUG] 実装完了後に
削除すること」と書かれているが、Phase74から現在まで削除されずDevTools経由の
実質的な公開インターフェースとして使われ続けている。buildPastePlanの
シグネチャ変更（第1引数にstateを追加）はこのインターフェースの呼び出し契約
（originTime, clipboardの2引数）を暗黙に壊すところだった。実装直後の
セルフレビューで発見し、bindラッパーで契約を維持した。内部シグネチャの
変更が、コメント以外に契約を明示していない公開面を壊しうるという教訓として残す。
```

---

## 7. Remaining Issues（残課題）

```
・clipboardの永続化スコープ（Phase86-2で発見済み・今回も未変更）
  状態: 未対応（実害なし）
  内容: analysisEditor.clipboardはbeginAnalysisEdit()/resetAnalysisEditor()の
  どちらでもクリアされず、編集セッションをまたいで保持される
  （「アプリ内クリップボード」に近い挙動）。意図的な仕様か検討の余地あり。

・updateChord / splitChord / moveBoundary 等、他のEditing Commandは
  Command層に未抽出
  状態: 未着手（次フェーズ候補）

・Result型（CommandResult）が共有typedefファイルとして独立していない
  状態: 未着手・優先度低
  内容: 現状はanalysisCommands.js冒頭のコメントに型定義があるのみ。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
注意:
  updateChord()/splitChord()/moveBoundary()は、今回抽出したCommand群と異なり
  Boundary Handle・EditPoint・Chart Mode Decoratorとの同期を伴うため、
  「state mutationだけを切り出せるか」を事前に実コード監査してから
  スコープを確定すること。今回（Phase87）の成功要因も、設計を確定する前に
  deleteChord()への依存やpasteSelection()の構造を実コードで確認したことに
  あった（§6 Findings参照）。

Phase88候補: 残りのEditing CommandのCommand化
対象:
  ・updateChord() / splitChord() / moveBoundary()
  ・[BOUNDARY EDIT AUTHORITY]（architecture.md §12）を維持したまま、
    Command Layerの対象を拡張できるかを検証する

着手前に確認すべきこと:
  ・これらの関数がすでに「state操作」と「副作用」を分離しやすい形か、
    今回と同様に実コードで再確認してから抽出範囲を確定する
  ・moveBoundary()はChart Mode側のDecorator（boundaryHandleChordId等）とも
    連動するため、Session/Command境界だけでなくchartmode.js側の
    Projection Authorityとの関係も設計フェーズで整理する

その他の将来候補:
  ・Result型のJSDoc typedef共有ファイル化 / TypeScript化の検討
  ・clipboardスコープの扱い（アプリ内クリップボードとして正式化するか）の設計議論
  ・__analysisEditorDebugの正式な扱い（削除するか、正式なdebug APIとして
    architecture.md §5.5に昇格させるか）の検討
```

---

## 9. Files Changed（変更ファイル一覧）

```
analysisCommands.js（新設）
  ・deleteChordCommand / deleteSelectionCommand / copySelectionCommand /
    cutSelectionCommand / pasteSelectionCommand / mergeSelectionCommand /
    buildPastePlan / commitPastePlan を実装
  ・_isNoChordEntry / _pickAbsorbingNeighbor をapp.jsから移設
  ・理由: Analysis Editor Command Layerの分離（本フェーズの主目的）

app.js
  ・analysisCommands.jsからのimportを追加
  ・deleteChord / deleteSelection / copySelection / cutSelection /
    pasteSelection / pasteAbsolute / mergeSelection を薄いラッパー化
  ・_isNoChordEntry / _pickAbsorbingNeighbor / buildPastePlan /
    commitPastePlan の実装本体を削除（analysisCommands.jsへ移設済みのため）
  ・__analysisEditorDebug.buildPastePlanをbindラッパー化
    （旧シグネチャ(originTime, clipboard)のままDevToolsから呼べるように維持）
  ・理由: 上記と同じ。DOM/Chart runtime/toast副作用はこちらに残置
```

---

## 10. Micro Log

- 実コード監査により、deleteSelection()がdeleteChord()（副作用込み）へ委譲する
  構造だったことが判明し、当初5関数だったスコープにdeleteChordを追加した
- Command層とapp.js層で同名関数（copySelection等）を使う場合のimport衝突を、
  Command層側の関数名に`*Command`接尾辞を付けることで回避する方針を
  実装前に確定した（Phase86-2の命名前例を踏まえた設計判断）
- cutSelectionCommand実装直後のセルフレビューで、app.js側ラッパーが
  toast順序を誤って再現していたことに気づいた（削除失敗時にコピーtoastが
  出ない実装になっていた）。同一ターン内で修正した
- 実装完了直後、__analysisEditorDebug.buildPastePlanのシグネチャ変更による
  DevTools契約破壊を自己発見し、bindラッパーで修正した
- node --checkによる構文検証・括弧の深さが最終的に0へ戻るかの機械チェックを
  app.js/analysisCommands.js双方で実施
- CRLF改行の維持を確認（sed変換 + fileコマンドでの確認）
- 実機確認: Copy/Cut/Paste（範囲・絶対）/Delete/MergeそれぞれのUndo/Redoが
  1回で戻ることを確認。Cut失敗ケース（連続していない選択をDevToolsから
  意図的に作成）でコピーtoast・削除エラーtoastの両方が表示されることを確認。
  `__analysisEditorDebug.buildPastePlan(originTime, clipboard)`を旧シグネチャ
  （2引数）のまま呼び出し、内部でanalysisEditorを束縛したbindラッパー経由で
  本体の`buildPastePlan(state, originTime, clipboard)`（3引数）が実行され、
  {ok:true, buffer, newIds}が返ることを確認

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue: なし
  （clipboard永続化スコープの件はPhase86-2時点で既にFindings相当として
  認識されており、current-issues.mdへの起票は見送っている。実際に
  問題が顕在化した時点、または設計議論の俎上に載せる時点で改めて起票する）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
