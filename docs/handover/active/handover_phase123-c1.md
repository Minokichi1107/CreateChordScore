# 引き継ぎ: Phase123-A補正 + Phase123-C1完了 — reconcile診断情報の記録

## 作業状態
- ブランチ: phase123-c1-reconcile-diagnostics
- 直前作業: Phase123-B完了（history/future の before→after 記録）
- コミット構成: A補正 + C1 を1コミットにまとめる（下記[Git補足]参照）

### [Git補足] A補正とC1を1コミットにまとめた理由

`pasteAbsolute()`はPhase123-A時点でMutation Attempt Recording自体が
存在しなかった（A補正で初めて`record()`呼び出しを追加する箇所）ため、
A補正分（`before`/`after`snapshot・`record()`呼び出しそのもの）と
C1分（`reconcile`引数の追加）が実装上**同一の追加行に同居**する形に
なった。他の4経路（deleteChord/deleteSelection/pasteSelection/
_runMerge）は既存のrecord()呼び出しへC1分のみを追記する形で
分離できたが、`pasteAbsolute()`だけは行単位でA/Cを分割できない。

git diffで確認した結果、この1点を除けば全差分はC1のみで完結して
いた。`pasteAbsolute()`の性質上、分割する実益が薄いと判断し、
Phase123-Aのhandoverが先例として残した「④（app.js側独自ガード）を
①③と同一コミットに含める」という判断（分割してもコミットの性質が
変わらない場合はまとめてよい）を踏襲し、1コミットとした。

---

## 1. Purpose（目的）

`docs/debug-recorder-design.md`（Phase122で設計固定）の`[MUTATION ATTEMPT
RECORDING]`・`[STATE TRANSITION OVER STATE VALUE]`に基づき、Diagnostic
Timelineへ「`reconcile()`によってSectionが実際に何を変化させたか」を
記録できるようにする。

現状の`sectionsCount`（個数のみ）では、個数が変わらないremap（境界の
付け替え）を検知できないという既知の制約があった（Phase123-A
Findings・updateSectionBoundaryの差分行が出ない問題）。本フェーズは
この制約を解消する。

あわせて、Phase123-Aの実装時に見落とされていた`pasteAbsolute()`
（Ctrl+V）のMutation Attempt Recording漏れを補正した（実装順序上は
C1着手前に先行したが、コード上の性質によりC1と同一コミットにまとめて
いる。[Git補足]参照）。

---

## 2. Scope（今回やったこと）

### Phase123-A補正（C1と同一コミット・[Git補足]参照）
- `pasteAbsolute()`（Ctrl+V・app.js）へMutation Attempt Recordingを追加
  （成功: `{ok:true, count}` / 拒否: `{ok:false, reason}`）。他4経路
  （deleteChord/deleteSelection/pasteSelection/mergeSelection）と同じ
  記録パターンに統一

### Phase123-C1
- `debugSessionRecorder.js`
  - `snapshotSections()` 新設 — reconcile診断専用のSection局所
    スナップショット（`{id, startChordId, endChordId}`の配列）
  - `diffSections()` 新設 — before/after比較により`removed`/`remapped`
    を分類する純粋関数。変化なしは`null`
  - `record()` — 5番目の引数`reconcile`を追加
  - `buildReport()` — `reconcile`フィールドの専用フォーマットを追加
    （`result`と同じく汎用diffループの外で特別扱い）
- `app.js`
  - reconcile()を実Factsで呼ぶ5経路（deleteChord / deleteSelection /
    pasteSelection / pasteAbsolute / mergeSelection＝`_runMerge`）へ
    `snapshotSections()`/`diffSections()`を組み込み

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **`sectionsCount`（既存の共通フィールド）の変更・置き換え**
  `snapshotSections`/`diffSections`は共通フィールド化せず、reconcile()
  を実Factsで呼ぶ5経路専用の別枠として実装した（5. Design Decisions
  参照）。
- **render経路・参照元の識別（`[RENDER PATH VISIBILITY]`）**
  Phase123-C2候補として次フェーズへ持ち越し。
- **repairRule変更・capo変更の記録**
  Phase123-C3候補として次フェーズへ持ち越し。
- **セッションlifecycle（begin/end/save/cancel）の記録**
  Phase123-C4候補として次フェーズへ持ち越し。
- **`created`（Section新規作成）の`diffSections()`対応**
  `reconcile()`自体はSectionを新規作成しない（削除・remapのみ）ため、
  対象外とした。`createSectionCommand`自体のMutation Attempt Recording
  はPhase123-Aで既に対応済み。

上記4項目（C2〜C4・created対応除く）は、いずれも`debug-recorder-design.md`
§4 Level1に明記されているがPhase123-A/Bの対象範囲外だった項目であり、
本フェーズの調査で再確認した（6. Findings参照）。

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `pasteAbsolute()`修正 | Mutation Attempt Recording追加（A補正） | app.js |
| `snapshotSections()`新設 | Section局所スナップショット取得（reconcile診断専用） | debugSessionRecorder.js |
| `diffSections()`新設 | before/after比較 → `removed`/`remapped`分類。変化なしは`null` | debugSessionRecorder.js |
| `record()`拡張 | 5番目の引数`reconcile`を追加（省略可・後方互換） | debugSessionRecorder.js |
| `_formatReconcile()`新設 | reconcileフィールドの人間可読フォーマット | debugSessionRecorder.js |
| `_formatEvent()`修正 | `e.reconcile`があれば`_formatReconcile()`を呼ぶ分岐を追加 | debugSessionRecorder.js |
| 5経路への組み込み | deleteChord / deleteSelection / pasteSelection / pasteAbsolute / `_runMerge`（mergeSelection）へ`sectionsBefore`/`sectionsAfter`取得と`diffSections()`呼び出しを追加 | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `sectionsSnapshot`を共通snapshot fieldにしない（方式B採用）

```
結論: reconcile診断専用のsnapshotSections()/diffSections()は、
      snapshotState()のopts（includeBuffer/includeSections等）とは
      別枠の独立ヘルパーとする。全イベント共通のフィールドにはしない。

理由（訂正版）: 「Sectionと無関係な操作を記録しなくてよい」という
      理由ではない。イベント自体（result/history等）は今まで通り
      全操作で記録される。理由は「reconcile()を実Factsで呼ばない
      操作にreconcile診断フィールドを付けても、常に空になるだけで
      意味を持たない」こと、および共通フィールド化すると
      Section数×全イベント数のデータ量になる一方、局所方式なら
      Section数×該当5経路のみで済むこと（ChatGPTレビューで整理）。
```

### [判断] `remapped`は変更前→変更後の具体値を保持する

```
結論: remappedエントリは `{ sectionId, startChordId?: {from,to},
      endChordId?: {from,to} }` とし、変化した側のフィールドのみ
      含める（個数の増減だけでなく、どのchordIdからどのchordIdへ
      変わったかを残す）。

理由: sectionsCount（個数のみ）ではupdateSectionBoundary等のremap
      （個数不変）を検知できないという既存の制約（Phase123-A
      Findings）を解消することが本フェーズの主目的のため。
```

### [判断] 変化なし（`diffSections()`が`null`を返す）場合、`reconcile`
### フィールド自体をrecord()へ渡さない

```
結論: reconcile()を呼ぶ経路であっても、Sectionに実際の変化が
      なければTimeline上に`reconcile:`行を一切出さない。

理由: 既存のhistoryLength/futureLength（Phase123-B）と同じ
      「変化そのものだけを残す」思想（[STATE TRANSITION OVER STATE
      VALUE]）を踏襲。呼ばれたことと変化したことを区別できる設計。
```

### [判断] `created`（Section新規作成）は`diffSections()`の対象外

```
結論: diffSections()はremoved/remappedのみを扱う。createdの概念は
      持たせない。

理由: reconcile()自体はSectionを新規作成する処理を持たない（Section
      作成はcreateSectionCommand()が担い、reconcile()を経由しない）。
      Mutation Attempt Recording（Phase123-A）が既にcreateSectionの
      成功/拒否を記録しているため、diffSections()側で重複対応する
      必要がない。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- **`reconcile()`の実呼び出し経路は5つに限定される**ことを実コードの
  grepで確認した：`deleteChordCommand` / `deleteSelectionCommand` /
  `pasteSelectionCommand` / `commitPastePlan`（Ctrl+V経由）/
  `mergeSelectionCommand`（analysisCommands.js）。これ以外の
  `reconcile()`呼び出しは`getSections()`経由（読み取り専用の整合性
  チェック・render毎に発生）であり、記録対象に含めるとrenderノイズに
  なるため除外した。
- **`pasteAbsolute()`（Ctrl+V）にMutation Attempt Recordingが1つも
  存在しなかった**ことを発見した。Phase123-Aの対象範囲（5経路）に
  本来含まれるべきだったが、実装時に見落とされていた。C1着手前に
  独立補正として先行実装した。
- **`_runMerge()`の`includeSections`（sectionsCount）は既に実装済み
  だったが、個数の増減しか見ておらず、remap（個数不変の境界移動）を
  検知できない**という制約が、Phase123-Aのhandoverで既に指摘されて
  いた（updateSectionBoundaryの差分行が出ない問題）。本フェーズの
  `snapshotSections`/`diffSections`はこの制約とは独立した別枠の
  フィールドとして追加し、既存の`sectionsCount`は変更していない。
- **Phase122設計書（`debug-recorder-design.md`）§4 Level1を照合した
  結果、reconcile以外に4項目の未記録項目**（render経路・参照元 /
  repairRule変更 / capo変更 / セッションlifecycle）が見つかった。
  いずれも実コード（`onSetRepairRule`/`onClearRepairRule`/capo変更
  ハンドラ/`beginAnalysisEdit`等）に`_recRecord()`呼び出しが一切
  無いことを確認した。C1のスコープには含めず、C2〜C4候補として
  切り分けた（1フィーチャー1コミット原則に沿う）。

---

## 7. 実機確認（たかっち実施・6ケース）

```
① 通常のMutation（deleteSelection・Section無関係） → OK
   result/editorMode/dirty/historyLength/bufferLengthが正しく記録される

② Section境界コード削除 → reconcile.remapped → OK
   startChordId: c004 → c005 が具体値で記録される

③ Section範囲を丸ごと削除 → reconcile.removed → OK
   removed: [<sectionId>] が記録される

④ Section境界付け替え（③と同系統の操作） → reconcile.remapped → OK
   startChordIdのbefore→afterが正しく記録される

⑤ Ctrl+V（pasteAbsolute） → Mutation Attempt Recording + reconcile → OK
   A補正（pasteAbsoluteイベント自体の記録）と、C1（reconcile.remapped）
   の両方が同時に確認できた

⑥ renameSection / copySelection（reconcile()を呼ばない操作） →
   reconcile: 行が出ない → OK
   同一Timeline内でpasteAbsolute（reconcileあり）と隣接していたが、
   renameSection/copySelection単体には正しくreconcileが付加されて
   いないことを確認した
```

[補足] ⑥では「reconcile()を呼ぶが変化がない」ケース（diffSections()
が`null`を返すケース）は未検証のまま。ただしこれは実装（`diffSections()`
がnullなら`record()`へreconcileを渡さない設計）の静的確認と、Node単体
スタブテスト（10. Micro Log参照）で既に確認済みのため、実機での追加
検証は必須としなかった。

---

## 8. Remaining Issues（残課題）

Phase123-C1のスコープ内に残課題なし。

以下はPhase122設計書（`debug-recorder-design.md`）§4 Level1に明記されて
いるが、本フェーズでは着手しなかった項目（6. Findings参照）。

```
Phase123-C2候補: render経路・参照元の識別（[RENDER PATH VISIBILITY]）
Phase123-C3候補: repairRule変更・capo変更の記録
Phase123-C4候補: セッションlifecycle（begin/end/save/cancel）の記録
```

---

## 9. Next Phase（次フェーズ開始位置）

上記3候補（C2〜C4）はいずれも独立した記録対象（呼び出し箇所が別々）
のため、優先順位は次回セッションで改めて判断する。`debug-recorder-
design.md` §4 Level1の対応表（過去バグ根拠）を参照して優先度を
決めることを推奨する。

---

## 10. Files Changed（変更ファイル一覧）

```
js/app.js
  ・pasteAbsolute() へMutation Attempt Recording追加（A補正）＋
    reconcile引数追加（C1）を同一箇所へまとめて実装
    理由: reconcile()を実Factsで呼ぶ5経路の1つだが記録漏れだったため
    （A補正）。A補正で新規追加する行にC1のreconcile引数が同居する
    構造上、行単位でのコミット分割ができないため1コミットにまとめた
    （[Git補足]参照）
  ・deleteChord() / deleteSelection() / pasteSelection() /
    pasteAbsolute() / _runMerge() へ sectionsBefore/sectionsAfter取得
    と diffSections() 呼び出しを追加
    理由: reconcile()による実際のSection変化をDiagnostic Timelineへ
    記録するため

js/debugSessionRecorder.js
  ・snapshotSections() 新設
    理由: reconcile診断専用のSection局所スナップショットを取得するため
    （既存snapshotState()の共通フィールドとは意図的に別枠）
  ・diffSections() 新設
    理由: before/after比較からremoved/remappedを分類する純粋関数として、
    Session/Command Layer（[BOUNDARY INVARIANT]対象）に触れずに
    診断ロジックを実装するため
  ・record() のシグネチャに reconcile 引数を追加
    理由: 既存イベント構造（result特別扱いと同じパターン）を維持したまま
    reconcile診断を追加するため
  ・_formatReconcile() 新設・_formatEvent() 修正
    理由: reconcileフィールドを人間可読なDebug Reportへ反映するため
```

---

## 11. Micro Log

- `reconcile(state, {...})`の全呼び出し経路をgrepで洗い出し、5経路
  （Command Layer由来）と`getSections()`経由（render毎の読み取り
  専用）を区別
- `pasteAbsolute()`にMutation Attempt Recording自体が無いことを発見
  → A補正として独立実装・`node --check`確認
- `snapshotSections()`/`diffSections()`をdebugSessionRecorder.jsへ
  実装。Node単体スタブテスト（`node -e`によるimport実行）で
  `diffSections()`の5ケース（変化なし/remap/removed/複合/null入力）を
  検証し、全て期待通りの分類結果を確認
- `buildReport()`の出力フォーマットもNode単体スタブテストで確認
  （Section無関係イベントに`reconcile:`行が出ないこと、remap/removed
  それぞれが正しく整形されることを確認）
- 5経路（deleteChord/deleteSelection/pasteSelection/pasteAbsolute/
  _runMerge）へ組み込み後、`node --check`（app.js/debugSessionRecorder.js
  両方）で構文確認
- たかっちさんによる実機確認（6ケース）を実施。全てPASS。⑥について
  「reconcile()を呼ぶが変化がないケース」は未検証だが、静的確認と
  Node単体テストで代替可能と判断（7. 実機確認 補足参照）

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - render経路・参照元の識別（`[RENDER PATH VISIBILITY]`・Phase123-C2候補）
  - repairRule変更・capo変更の記録（Phase123-C3候補）
  - セッションlifecycle（begin/end/save/cancel）の記録（Phase123-C4候補）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: Debug Session Recorder — render経路・参照元の識別（[RENDER PATH VISIBILITY]）
  状態: 未着手（Phase122で設計要件のみ確定・実装未着手）
  内容: `debug-recorder-design.md` §7 [RENDER PATH VISIBILITY]が要求する、
  render要求がどの経路（本線/意図的な特殊経路）・どのデータ（編集中の
  buffer/保存済みのraw）を参照して発生したかの識別。Phase106・Phase120の
  render巻き戻りバグの再発防止に直結する診断情報。実装方法（ラベル文字列・
  ヘルパー関数の要否等）は`debug-recorder-design.md`のスコープ外として
  未規定のまま。

- 見出し: Debug Session Recorder — repairRule変更・capo変更の記録
  状態: 未着手
  内容: `onSetRepairRule`/`onClearRepairRule`（app.js）・capo変更ハンドラ
  （`document.getElementById('capo').addEventListener('change', ...)`）
  のいずれにも`_recRecord()`呼び出しが存在しないことをPhase123-C1調査で
  確認した。repairRule変更はrender巻き戻り（Phase120）、capo変更は
  検索異常（Phase97）という、それぞれ独立した実バグを根拠に
  `debug-recorder-design.md` §4 Level1で記録対象に指定されている。

- 見出し: Debug Session Recorder — セッションlifecycle（begin/end/save/cancel）の記録
  状態: 未着手
  内容: `beginAnalysisEdit()`/`endAnalysisEdit()`/`saveAnalysisEdit()`
  のいずれにも`_recRecord()`呼び出しが存在しないことをPhase123-C1調査で
  確認した。dirty/reset漏れ（Phase103・Section Previewの残留バグ）を
  根拠とし、後続のEvent/State Transitionが「どの編集セッション内で
  起きたか」をTimeline上で区切るための最小限の情報。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Debug Session Recorder — Phase123-A補正（Phase123-C1・pasteAbsolute()
    へMutation Attempt Recordingを追加。reconcile()を実Factsで呼ぶ5経路の
    記録漏れを解消）
  ✓ Debug Session Recorder — reconcile診断情報の記録（Phase123-C1・
    snapshotSections()/diffSections()新設。reconcile()を実Factsで呼ぶ
    5経路でSectionのremoved/remappedを記録。sectionsCount（個数のみ）
    では検知できなかった境界remapを、変更前→変更後の具体値付きで
    診断可能にした。共通snapshot fieldにはせず、該当5経路専用の
    別枠として実装）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 123-C1 | Debug Session Recorder — reconcile診断情報の記録（
    debug-recorder-design.md [MUTATION ATTEMPT RECORDING]続編。
    snapshotSections()/diffSections()新設。reconcile()を実Factsで
    呼ぶ5経路（deleteChord/deleteSelection/pasteSelection/
    pasteAbsolute/mergeSelection）でSection変化を診断。
    pasteAbsolute()のMutation Attempt Recording記録漏れも同時に補正。
    render経路識別・repairRule/capo変更・セッションlifecycleは
    C2〜C4候補として次フェーズへ持ち越し）
    | app.js / debugSessionRecorder.js |

- Future Candidates: 次候補を更新
  ```
  Phase123-C2候補: render経路・参照元の識別（[RENDER PATH VISIBILITY]）
  Phase123-C3候補: repairRule変更・capo変更の記録
  Phase123-C4候補: セッションlifecycle（begin/end/save/cancel）の記録
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
