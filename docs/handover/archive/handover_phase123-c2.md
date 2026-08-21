# 引き継ぎ: Phase123-C2完了 — Render Event（描画イベント）の記録

## 作業状態
- 直前作業: Phase123-C1完了（Phase123-A補正 + reconcile診断情報の記録）

---

## 1. Purpose（目的）

`docs/debug-recorder-design.md`（Phase122で設計固定）の`[RENDER PATH VISIBILITY]`
に基づき、Diagnostic Timelineへ「render要求がどの経路（本線／特殊経路）から、
どのデータ（buffer／raw）を参照して発生したか」を記録できるようにする。

Phase106（Section境界編集UI・renderChartMode引数省略によるレイアウト崩壊）・
Phase120（repairRule変更時のChart表示巻き戻り）は、どちらも「render要求が
どの経路・どの参照元から発生したか」が実際のバグ原因だった。本フェーズは、
これらと同種の不具合が将来再発した際にDiagnostic Timelineで検知できるようにする
ための基盤を、Mutation-triggered renderの範囲で実装する。

---

## 2. Scope（今回やったこと）

- `js/debugSessionRecorder.js`
  - `recordRender(path, source, trigger)` 新設 — Render Event生成ロジックを
    1箇所に集約する専用関数（`record()`とは別関数。Mutation Attemptとは
    独立したEvent種別として、同一の`_events`配列へ積む）
  - `_formatEvent()` — `e.render`フィールド用の分岐を追加
    （`reconcile`と同じ「フィールド存在時のみ出力」パターン）
- `js/app.js`
  - `_refreshEditorView(mutationEvent = null)` — 引数を追加。
    `getCurrentChordSource()`と同じ分岐（`isAnalysisEditing()`）で
    `renderSource`をその場で確定させ、`renderChartMode()`呼び出しが
    （例外を投げずに）完了した直後にのみ`recordRender()`を呼ぶ
  - Mutation-triggered呼び出し元18箇所 — `_refreshEditorView();` →
    `_refreshEditorView('イベント名');`（直前の`_recRecord()`呼び出しと
    同じイベント名文字列を渡すのみ。新規の記録ロジックは追加しない）
  - `updateChord(id, patch, mutationEvent = null)` — 引数を追加し
    `_refreshEditorView(mutationEvent)`へパススルー。呼び出し元2箇所
    （`replaceCurrentMatch`→`'replace'`、`openChordRenameSelector`→
    `'renameChord'`）がそれぞれのイベント名を渡す
  - `_handleBoundaryDragEnd()` — 唯一の例外。ドラッグ中の連続
    `_refreshEditorView()`呼び出し（`_handleBoundaryDragMove()`経由）は
    引数なしのまま据え置き、ドラッグ終了時に`recordRender()`を直接1回だけ呼ぶ
    （既存の「1ジェスチャー=1イベント」方針をRender Eventにも適用）

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **`source: raw`を伴うrenderの記録**
  今回対象とした18箇所のMutation-triggered呼び出しは、すべて
  `isAnalysisEditing()`が真の間のみ到達可能な操作であるため、記録される
  `source`は理論上常に`'buffer'`である。`saveAnalysisEdit()`等の
  非Mutation renderを対象に含めることは、C2のスコープ（Mutation-triggered
  renderの可視化）を変更することになるため見送った。
- **Section Preview系（`_syncSectionPreviewVisibility()` /
  `_previewSection()` / `_clearSectionPreview()`）のrender記録**
  design doc §4 Level3「Section chip click（選択/Preview toggle）は
  原則記録しない」の趣旨を優先した。Phase106バグの直接原因箇所ではあるが、
  これを記録するとSection chip clickという操作自体が間接的にTimelineから
  復元可能になり、Level3の原則と衝突するため見送った。将来Semantic
  Interaction Event（design doc §4 Level1後半〜Level3相当）を実装する際に
  改めて検討する。
- **`[RENDER CONTEXT INVARIANT]`（Phase106）違反4箇所の修正**
  調査の過程で、`saveAnalysisEdit()` / capo変更ハンドラ / Chart Modeを
  開くボタン / 列数切替ボタンの4箇所が`renderChartMode()`呼び出し時に
  `editing`引数を渡していないことを発見した。これはC2（Recorder実装）と
  独立した既存Invariant違反であり、今回は修正せずcurrent-issues.mdへの
  新規issue候補として切り出す（6. Findings参照）。
- **repairRule / capo変更そのものの記録**（C3スコープ）
  Phase123-C1・C2の過程で判明した通り、`onSetRepairRule`/
  `onClearRepairRule`はPhase120の修正により既に`_refreshEditorView()`
  （本線）を経由するようになっている。C2実装により、これらのrepairRule
  変更起因のrenderが記録されるかは「repairRule変更ハンドラ自体が
  `mutationEvent`を渡すかどうか」次第だが、現時点では渡していないため
  記録されない。repairRule/capo変更"そのもの"（値の変化）を記録する
  仕組みはC3で対応する。

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `recordRender()`新設 | Render Event生成ロジックを1関数に集約 | debugSessionRecorder.js |
| `_formatEvent()`拡張 | `render`フィールド（path/source/trigger）の出力分岐を追加 | debugSessionRecorder.js |
| `_refreshEditorView()`修正 | `mutationEvent`引数追加。renderSource確定→render実行→成功後にrecordRender呼び出し | app.js |
| Mutation-triggered 18箇所 | `_refreshEditorView('X')`へ変更（deleteChord/deleteSelection/cutSelection/pasteSelection/pasteAbsolute/mergeSelection/replaceAll/shiftAll/splitChord/addChord/moveBoundary(ボタン・矢印キー系)/shiftSelectionRange/undo/redo/createSection/updateSectionBoundary/renameSection/deleteSection） | app.js |
| `updateChord()`パススルー | 引数追加。呼び出し元2箇所（replace/renameChord）がイベント名を渡す | app.js |
| `_handleBoundaryDragEnd()` | ドラッグ全体で1回だけ`recordRender()`を直接呼ぶ | app.js |

`node --check`（両ファイル）・`git diff --check`確認済み。18箇所すべてで
`_recRecord()`のイベント名と`_refreshEditorView()`引数が一致することを
機械的スクリプトで検証済み（5. Design Decisions参照）。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Render Eventを独立イベント種別として採用（Mutation Eventへの同梱は不採用）

```
結論: render要求は{path, source, trigger}を持つ独立したTimeline Event
      （event:'render'）として記録する。既存Mutation Attempt Event
      （result/reconcile等）への同梱フィールドにはしない。

理由: _refreshEditorView()はMutationだけでなく選択解除・検索等の
      非Mutation操作からも呼ばれるため、Mutation Eventへの同梱では
      「Mutationが起きた瞬間のrender」しか表現できず、[RENDER PATH
      VISIBILITY]の要件（render要求が発生した場合に経路・参照元を
      識別できること）を狭く解釈してしまう。独立Eventにすることで、
      将来Mutation以外のrender記録が必要になった場合も同じ形式で
      拡張できる（今回はMutation-triggeredのみに限定するが、設計として
      閉じない）。
```

### [判断] `_refreshEditorView()`に「明示的パラメータ」を渡す方式を採用（推測させない）

```
結論: _refreshEditorView(mutationEvent)という形で、呼び出し元
      （app.js側の各Mutationラッパー）が「このrenderはMutation Xに
      起因する」と明示的に宣言する。_refreshEditorView()自身は
      呼び出し元のコンテキストを推測しない。

理由: 「app.jsがオーケストレーターであり、モジュール間の連携はapp.js
      経由」という既存原則（architecture.md §3）と同じ考え方を、
      同一ファイル内の関数間関係にも適用した。record()呼び出し直後の
      文字列をそのまま渡すだけなので、Render Event生成ロジックを
      18箇所へ複製する必要がない。
```

### [判断] 記録位置は「render実行成功後」

```
結論: recordRender()の呼び出しは、renderChartMode()呼び出しの直後
      （renderAnalysisEditorPanel()等より前）に配置する。

理由: renderChartMode()は同期関数で、早期return条件は
      `!chartState.active`のみ（例外を握りつぶすtry/catchもない）。
      この位置に置くことで、_refreshEditorView()自体が早期returnした
      場合・renderChartMode()が例外を投げた場合のいずれも
      recordRender()に到達せず、「記録された＝実際に描画された」
      という対応が構造的に保証される。
```

### [判断] Section Preview系・非Mutation経路は対象外のまま維持

design doc §4 Level3の原則を優先し、Mutation-triggered 18箇所（＋
updateChord経由2箇所・drag-end 1箇所の計21呼び出し）のみを対象とした。
詳細は3. Out of Scopeを参照。

---

## 6. Findings（監査で判明した知見）

### `_refreshEditorView()`内での二重render（Phase123-C2以前からの既存挙動）

`_refreshEditorView()`冒頭で呼ばれる`_syncSectionPreviewVisibility()`は、
Previewしていた対象Sectionが当該Mutationで消滅した場合、独自に
`renderChartMode()`を呼ぶ（Section Bar同期のための防御的再描画。Phase102
由来）。この場合、1回の`_refreshEditorView()`呼び出し内で`renderChartMode()`
が2回実行されることになるが、`recordRender()`は「main」ラインの呼び出し
（正しいGridViewModelに基づく最終的な描画）1回のみに紐づけているため、
記録内容には影響しない。この二重render自体はPhase123-C2で新規に発生した
ものではなく、既存の挙動である。

### `[RENDER CONTEXT INVARIANT]`（Phase106）違反4箇所（未修正・別issue化）

`renderChartMode()`呼び出し元8箇所のうち、以下4箇所が`editing`引数を
渡していないことを発見した。

| 呼び出し元 | 欠落引数 |
|---|---|
| `saveAnalysisEdit()`（保存直後の再描画） | `editing` |
| capo変更ハンドラ | `editing` |
| Chart Modeを開くボタン | `editing` |
| 列数切替ボタン | `editing` |

Phase106で確立した`[RENDER CONTEXT INVARIANT]`は「`measuresPerRow`と
`editing`を両方明示せよ」であり、これは未修正の違反として現存している。
実害の有無は未検証。C2のスコープ外として別issue化する（Deferred
Documentation参照）。

### Drag無移動時の`ok:true`によるRender Event発生（既知の軽微な事項）

境界ハンドルをポインタで押してすぐ離した場合（一度も`_handleBoundaryDragMove()`
が呼ばれない＝実際には`renderChartMode()`が一度も実行されない）、
`_boundaryDragState.lastMoveOk`は未設定（`undefined`）のままとなる。
`_handleBoundaryDragEnd()`の判定式`ok = lastMoveOk !== false`はこの場合
`true`と評価されるため、実際にはrenderが発生していないにもかかわらず
`recordRender()`が発火し、Render Eventが1件記録される。

これはPhase123-A（Mutation Attempt Recording）で確立された既存仕様
（「クリックのみの場合もCommand拒否ではないためok:true扱いとする」）を
そのまま踏襲した結果であり、C2で新規に持ち込んだ不整合ではない。
修正するにはPhase123-Aの`moveBoundary`イベント自体の判定条件
（`lastMoveOk`の初期値の扱い）を見直す必要があり、C2のスコープ
（Render Eventの実装）を超える。今回は**修正しない**と判断した。

---

## 7. Remaining Issues（残課題）

Phase123-C2のスコープ内に残課題なし。

以下は6. Findingsで発見したが、C2のスコープ外として別途扱う事項。

```
・[RENDER CONTEXT INVARIANT]違反4箇所（未修正・原因未特定の実害有無含む）
・Drag無移動時、既存ok:true仕様によりRender Eventが記録される
  （Phase123-A由来の既存挙動。C2では変更しない）
```

---

## 8. Next Phase（次フェーズ開始位置）

**Phase123-C3: repairRule / capo変更の記録**

`debug-recorder-design.md` §4 Level1が要求する記録項目のうち、C1
（reconcile診断）・C2（render経路/参照元）に続く項目。C2までとは異なり、
C3の主題は「その変更によってrenderされたこと」ではなく、**「repairRule
やcapoという診断上重要な設定値が、いつ・どのように変化したか」**を
Timelineへ残すことである。

対象ハンドラ:
- `onSetRepairRule()` / `onClearRepairRule()`（app.js）
- capo変更ハンドラ（`document.getElementById('capo').addEventListener('change', ...)`）

根拠（過去バグ）:
- repairRule変更 → render巻き戻り（Phase120）
- capo変更 → 検索異常（Phase97）

なお、これらのハンドラが将来`_refreshEditorView(mutationEvent)`を呼ぶ
よう改修される場合、C2で実装したRender Event機構をそのまま利用できる
（新たな仕組みを作る必要はない）。

---

## 9. Files Changed（変更ファイル一覧）

```
js/debugSessionRecorder.js
  ・recordRender() 新設
    理由: Render Event生成ロジックを1箇所に集約するため
  ・_formatEvent() へ render フィールド分岐を追加
    理由: Diagnostic Timeline上でRender Eventを人間可読に表示するため

js/app.js
  ・_refreshEditorView(mutationEvent = null) へ拡張
    理由: renderSourceの確定とRender Event記録を、呼び出し元からの
    明示的な合図（推測ではなく）に基づいて行うため
  ・Mutation-triggered 18箇所（deleteChord/deleteSelection/
    cutSelection/pasteSelection/pasteAbsolute/mergeSelection/
    replaceAll/shiftAll/splitChord/addChord/moveBoundary/
    shiftSelectionRange/undo/redo/createSection/updateSectionBoundary/
    renameSection/deleteSection）で_refreshEditorView()呼び出しへ
    イベント名を追加
    理由: 直前のMutation記録と同じ文脈をrenderにも伝播させるため
  ・updateChord(id, patch, mutationEvent = null) へ拡張＋呼び出し元
    2箇所（replaceCurrentMatch/openChordRenameSelector）を修正
    理由: 共有関数を経由するMutation（replace/renameChord）にも
    同じ仕組みを適用するため
  ・_handleBoundaryDragEnd() へ recordRender() 直接呼び出しを追加
    理由: ドラッグ中の連続render個別記録を避け、「1ジェスチャー=1
    イベント」の既存方針をRender Eventにも適用するため
```

---

## 10. Micro Log

- Phase122設計書（`debug-recorder-design.md`）§7 `[RENDER PATH
  VISIBILITY]`を再確認し、`renderChartMode()`呼び出し元8箇所を実コードで
  全数調査
- 初期調査で「本線のみ・Mutation Eventへ相乗り（案A）」を提案したが、
  ChatGPTレビューで「独立Render Event（案B）」への転換を指摘され、
  設計を見直し
- `_refreshEditorView()`の33呼び出し元をスクリプトで機械分類
  （Mutation-triggered 18／共有関数経由1／Non-mutation 14）
- ChatGPTレビューで「18箇所へrecord処理を散らさない設計」を要求され、
  `recordRender()`の1箇所集約＋明示的パラメータ渡し（推測させない）方式
  を設計
- `renderChartMode()`の早期return・例外可能性を実コードで確認し、
  「render実行成功後にのみ記録する」位置を確定
- 実装（debugSessionRecorder.js・app.js）→ `node --check` → `git diff
  --check` → 全18箇所のイベント名対応をPythonスクリプトで機械検証
- Node単体スタブテストで`recordRender()`の出力フォーマット・Recording
  OFF時のno-op動作を確認
- たかっちさんによる実機確認（6ケース）を実施。全てPASS（Recording OFF
  ・Selection/Search由来のrender不在は「Copy Debug Reportボタンが
  disableのまま」という形で確認）
- ChatGPTレビューによる最終監査（6項目）を実施。5項目PASS・1項目
  （Drag無移動時のRender Event発生）を軽微な既知事項として記録

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - `[RENDER CONTEXT INVARIANT]`違反4箇所（未修正）
  - Drag無移動時、既存`ok:true`仕様によりRender Eventが記録される
    （Phase123-A由来の既存挙動・低優先度）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: `[RENDER CONTEXT INVARIANT]`違反4箇所（未修正）
  状態: 未確認・原因未特定（Phase123-C2調査中に発見）
  内容: `renderChartMode()`呼び出し元のうち、`saveAnalysisEdit()`・
  capo変更ハンドラ・Chart Modeを開くボタン・列数切替ボタンの4箇所が
  `editing`引数を渡していない。Phase106で確立した`[RENDER CONTEXT
  INVARIANT]`（`measuresPerRow`と`editing`を両方明示すること）への
  違反状態が現存している。実害の有無は未検証。Phase123-C2のRender Event
  実装とは独立した既存コードの問題であり、別途調査・修正が必要。

- 見出し: Drag無移動時、既存`ok:true`仕様によりRender Eventが記録される
  状態: 既知事項・低優先度（Phase123-C2監査で発見）
  内容: 境界ハンドルを押してすぐ離した場合（実際には一度も
  `renderChartMode()`が実行されない）でも、`_boundaryDragState.lastMoveOk`
  が未設定のため`ok:true`と判定され、Render Eventが1件記録される。
  Phase123-A（Mutation Attempt Recording）で確立された既存の`moveBoundary`
  判定仕様（クリックのみもok:true扱い）を踏襲した結果であり、Phase123-C2
  では変更しない。修正する場合はPhase123-Aの判定条件自体の見直しが
  必要（C2のスコープを超える）。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Debug Session Recorder — Render Event（描画イベント）の記録
    （Phase123-C2・`[RENDER PATH VISIBILITY]`のうちMutation-triggered
    render範囲を実装。`recordRender()`（debugSessionRecorder.js）を
    新設し、`_refreshEditorView(mutationEvent)`の明示的パラメータ渡し
    により、18箇所のMutation-triggered呼び出し＋updateChord経由2箇所＋
    ドラッグ特殊系1箇所でRender Event（path/source/trigger）を記録
    可能にした。Section Preview等の非Mutation renderはLevel3の原則に
    従い対象外のまま維持）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 123-C2 | Debug Session Recorder — Render Event（描画イベント）の記録
    （debug-recorder-design.md [RENDER PATH VISIBILITY]の実装。
    Mutation-triggered renderのみを対象とし、独立イベント種別
    （event:'render'）として単一Timelineへ記録。Render Event生成
    ロジックはrecordRender()の1箇所に集約し、_refreshEditorView()側は
    呼び出し元から明示的に渡されたmutationEventパラメータをそのまま
    使うのみで推測しない設計とした。調査過程で[RENDER CONTEXT
    INVARIANT]違反4箇所を新規発見し、別issue化） | app.js /
    debugSessionRecorder.js |

- Future Candidates: 次候補を更新
  ```
  Phase123-C3候補: repairRule / capo変更の記録
  低優先度: [RENDER CONTEXT INVARIANT]違反4箇所の調査・修正
  低優先度: Drag無移動時のRender Event既知事項（Phase123-A仕様見直しを伴う）
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
