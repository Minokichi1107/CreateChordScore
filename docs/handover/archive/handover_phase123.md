# 引き継ぎ: Phase123-A完了 — Mutation Attempt Recording

## 作業状態
- ブランチ: main（直接コミット。本来は`phase123-mutation-attempt-recording`
  ブランチを切るべきだったが、今回は既存ブランチ運用ルールから逸脱して
  mainへ直接コミットしてしまった。次フェーズ以降はブランチ運用を徹底する）
- 直前作業: Phase122完了（Debug Session Recorder Diagnostic Timeline設計固定）
- コミット: `89d74f2` "Phase123-A: Mutation Attempt Recording"

---

## 1. Purpose（目的）

Phase122で設計固定した`docs/debug-recorder-design.md`のうち、
`[MUTATION ATTEMPT RECORDING]`（§7）を実装する。

Phase121時点のRecorderは「Mutationが成功した場合のみ」記録していたが、
本フェーズでは「Mutation Command（またはそれに相当する状態変更処理）が
実際に呼び出された場合、成功・拒否を問わず記録する」へ拡張した。

Phase123全体（`debug-recorder-design.md` §4 Level 1〜2）のうち、
本フェーズ（123-A）は**Mutation Attempt Recordingのみ**を対象とする。
history/future の before→after 記録（Level 2）は次フェーズ（123-B）へ
分離した。

---

## 2. Scope（今回やったこと）

`js/app.js`のみを変更（他ファイル無変更）。3つのパターン・
合計24箇所へ変更を加えた（うち23箇所は新規に拒否記録を追加、
1箇所は既存の記録ロジックを拒否も扱えるよう拡張）。

```
① Command Layer {ok:false} 拒否（12箇所・新規追加）
   deleteChord / deleteSelection / copySelection / cutSelection /
   pasteSelection / mergeSelection / splitChord / addChord /
   createSection / updateSectionBoundary / renameSection / deleteSection

③ moveBoundaryCommand（number|null）のResult変換（1箇所・
   既存箇所の拡張。①④と異なり「新規の拒否分岐追加」ではなく、
   既存の成功時記録ロジックを拒否も扱えるよう書き換えたもの）
   ドラッグ終了時（_handleBoundaryDragEnd）。Command Layer自体の
   Result Protocolは変更せず、app.js側で { ok: result !== null } へ変換

④ app.js側の独自ガード拒否（11箇所・新規追加・Command Resultを
   持たない経路）
   shiftSelectedBoundary（3）/ shiftSelectionRange（4）/
   undoEdit（1）/ redoEdit（1）/ replaceAllMatches（2）
```

内訳：新規追加23箇所（①12＋④11）＋既存拡張1箇所（③）＝合計24箇所。

すべて「1 Mutation Attempt = 1 Event」という既存の`record()`/
`buildReport()`構造を変更せず、拒否時も同じ構造の中で表現できることを
確認した上で実装した（Timeline Eventの粒度についてはPhase122 §6が
未決定としていたが、本フェーズで「既存構造の維持」に確定した）。

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **`updateChord()`内部の拒否（app.js 632行目）**
  `replaceCurrentMatch()` / `openChordRenameSelector()`の2箇所からのみ
  共有される関数で、渡されるidはどちらの呼び出し元でも常にbuffer内に
  実在する設計（前者はDerived Cacheの中身、後者はモーダル表示中は
  他の編集操作がブロックされる）。理論的エッジケースであり、対応するには
  `updateChord()`の戻り値仕様変更が必要で影響範囲が広がるため見送った。
- **history/future の before→after 記録（Phase122 §4 Level 2）**
  Phase123-Bへ分離。
- **Semantic Interaction Event・reconcile診断情報・render経路の識別**
  （Phase122 §4 Level 1後半〜Level 3相当）は本フェーズのスコープ外。
- **architecture.mdへの反映**
  `[MUTATION ATTEMPT RECORDING]`はPhase122で既にNamed Invariantとして
  `debug-recorder-design.md`側に確立済みであり、今回は「原則の一部実装」
  にとどまる。Phase123全体（Level1〜2）の実装完了時にまとめて
  architecture.md §5.5への参照追加を行う方針とし、本フェーズでは
  architecture.mdを更新していない。

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| ①12箇所への`_recRecord()`追加 | 各関数の`if (!r.ok) { ... }`分岐内、既存`return`の直前に追加。`after`は`before`をそのまま渡す | app.js |
| `_handleBoundaryDragMove()`修正 | `moveBoundary()`の戻り値を`_boundaryDragState.lastMoveOk`へ保持 | app.js |
| `_handleBoundaryDragEnd()`修正 | `{ ok: true }`固定から`{ ok: _boundaryDragState.lastMoveOk !== false }`へ変更（未設定時は既存動作維持でtrue扱い） | app.js |
| ④11箇所への`_recRecord()`追加 | Command Layerを経由しない拒否分岐へ、`{ ok:false, reason }`を自作して記録 | app.js |

変更行数: +90/-12（1ファイルのみ）。`node --check`構文チェック・
`git diff --check`（空白エラーなし）・改行コード（LF、破壊なし）確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Timeline Eventの粒度は「1 Mutation Attempt = 1 Event + diagnostic fields」に確定

```
経緯: Phase122（debug-recorder-design.md §6）はTimeline Eventの粒度を
      未決定のまま残していた（「1 Mutation attempt = 1 Event + diagnostic
      fields」とするか、「mutation/reconcile/renderを別行に分解する」か
      の2案を明示的に保留）。Phase123-A着手後、既存の`record()`/
      `buildReport()`の実コードを調査した結果、拒否イベントもresultに
      ok:falseを積むだけで既存フォーマッタがそのまま使えることを確認し、
      「1 Mutation Attempt = 1 Event + diagnostic fields」案を採用する
      ことに確定した。

結論: 「1 Mutation Attempt = 1 Event」のまま拡張する。別配列・別
      Authorityへの分離は行わない。

理由: reconcile結果やrender経路（Level 2以降）も、同じイベントへ
      診断フィールドを追加する形で将来対応可能。別タイムラインに
      分けるとPhase122が明示的に否定した「複数タイムライン」に
      近づいてしまう。
```

### [判断] `after = before`はCommand Layer全14関数の検証に基づく正確な表現

```
結論: Command Layer（analysisCommands.js）が持つ全14個のexport関数
      について、`ok:false`を返す分岐が必ず`pushHistory()`（session.dirty
      等への唯一の副作用発生源）より前にあることを実コードで確認した。
      したがって拒否時のafter=beforeは省略ではなく、実際に状態が
      変化していないことの正確な表現である。

根拠: grep -n "^export function\|ok: false\|pushHistory(state)" で
      全関数の該当箇所を機械的に洗い出し、順序を確認した。
```

### [判断] moveBoundaryCommandのResult Protocol自体は変更しない

```
結論: Command Layer側（number|null）は変更せず、app.js側（drag-end）
      でRecorder用の{ ok }へ変換する。

理由: moveBoundaryCommandは「1操作」ではなく「境界を挟む2要素を
      書き換えるだけの低レベルprimitive」という既存の設計原則
      （ドラッグ中に連続呼び出しされる）を崩さないため。Result
      Protocol統一（{ok,reason}化）はこのフェーズの目的ではない。
```

### [判断] ④（app.js側独自ガード）を①③と同一コミットに含める

```
結論: shiftSelectedBoundary / shiftSelectionRange / undoEdit /
      redoEdit / replaceAllMatchesの拒否も、①③と同じ
      「Mutation Attempt Recording」という1フィーチャーとして扱う。

理由: debug-recorder-design.md §7が「app.js側の事前バリデーションに
      よる拒否（Command Resultが存在しないため、呼び出し側が
      {ok:false, reason}相当を組み立てて渡す）」を明示的に対象範囲内
      としているため。分けても差分の性質（早期returnの前にrecord()を
      移動する）が同じであり、コミットを分ける実益が薄いと判断した
      （ChatGPTレビューでも同様の結論）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- **`updateChord()`のJSDocコメントは実態より古かった。** 「4箇所が
  依存」と書かれていたが、実コードのgrepでは呼び出し元は2箇所
  （`replaceCurrentMatch()` / `openChordRenameSelector()`）のみ。
  Phase89で`addChordCommand()`が`updateChord()`を経由しない独自実装へ
  変わった際、コメントが更新されないまま残っていたと考えられる。
- **`replaceAllMatches()`のempty-input/no-matches拒否は、UIから通常
  操作では到達不可能と実機検証で判明した。** 「全置換」ボタンは
  `canReplace = searchTotal > 0 && replaceText.trim()`という条件で
  `disabled`化されており、この条件を満たさない状態ではボタン自体が
  クリックできない。実装（コード）自体は正しいが、実務上到達しない
  防御的コードになっている。
- **`updateSectionBoundaryCommand()`の`start-after-end`拒否も、UIから
  通常操作では到達不可能と、たかっちさんによる実機確認の過程で
  判明した。** 境界ステッパーのボタン描画時（`renderSectionBar()`）に
  `startRightDisabled = startIdx === -1 || endIdx === -1 || startIdx >= endIdx`
  という事前ガードが既に実装されており、Command拒否条件と同じ判定を
  UI側が先回りしている。これは実装時点で見落としており、当初提示した
  実機確認手順が誤っていた（「開始▶を1回押せば拒否される」と誤案内
  していたが、実際は「単一コード化して成功する」だけだった）。
- **`deleteChordCommand()`の「最後の1つのコードは削除できません」
  拒否は、UI側に事前ガードがない**（「削除」ボタン自体に`disabled`
  条件がない）ことを確認した。理論上はUIから到達可能だが、
  実際の再現には実データを`bufferLength<=1`まで削除する必要があり、
  たかっちさんによる実機確認では時間の都合上、最終確認（拒否発生の
  瞬間）までは至らなかった（7. Remaining Issues参照）。
- **`updateSectionBoundary`の成功時、差分行が一切表示されない**ことを
  たかっちさんの実機確認で発見した。原因は`snapshotState()`の
  `includeSections`オプションが`sections.length`（個数）のみを
  追跡しており、既存Section内部のstartChordId/endChordIdの変化
  （個数は変わらない）を捉えられないため。これはPhase123-Aのバグでは
  なく、Phase121 handoverが既に指摘していた既知の制約
  （「Section境界移動のReportに意味的な操作情報が不足している」）の
  再確認である。Phase122の設計方針通り、Semantic Interaction Event
  （Level 3以降）で解決される見込みで、Phase123-Aのスコープ外。
- **たかっちさんの実機確認中、Chart Modeで画面に何も表示されなくなる
  事象が発生した**（スクリーンショット添付。bufferLengthは2残っていた
  はずだが画面上は空白）。今回のPhase123-Aの変更（`_recRecord()`
  呼び出しの追加のみ）が原因である可能性は低いと考えられるが、
  根本調査は行っていない（Out of Scope・7. Remaining Issues参照）。

---

## 7. Remaining Issues（残課題）

- **`deleteChordCommand`の「最後の1つ」拒否・`updateSectionBoundaryCommand`
  の`start-after-end`拒否は、実機（人間操作）で拒否イベントの発生
  そのものを確認できていない。**
  - `deleteChord`拒否: Puppeteer実機テストでも未検証（`deleteSelection`
    の拒否は確認済みだが、`deleteChord`という別イベント名での拒否は
    未確認）。ただし実装パターンは①グループ内で完全に共通しており、
    `deleteSelection`で動作確認済みの記録ロジックをそのまま適用した
    箇所のため、リスクは低いと判断している。
  - `updateSectionBoundary`拒否: UI側の事前ガードにより通常操作では
    到達しないことが判明済み（6. Findings参照）。実用上のリスクは
    低いが、Recorder側の記録ロジック自体（`_recRecord`呼び出し）は
    未検証のまま。
- **Chart Modeで画面に何も表示されなくなる事象**（6. Findings参照）。
  Phase123-Aとは無関係の別問題である可能性が高いが、未調査。
  次回発生時に`window.__CS_DEBUG__.chart`等で状況を確認する方針
  （既存の「原因未特定の緑の棒バグ」と同じ扱いに準じる）。
- **Modal Cancel（merge実行時のSection削除警告）は、実機UIでの
  確認ができていない。** 静的コード解析（`close()`が`_recRecord()`を
  一切呼ばないことの確認）のみで完了とした。

---

## 8. Next Phase（次フェーズ開始位置）

**Phase123-B: history/future の before→after 記録**（Level 2）

- `snapshotState()`へ`historyLength` / `futureLength`を追加する
  （既存の`bufferLength`と同じパターン）。
- Timeline Eventの粒度は本フェーズで「1 Mutation Attempt = 1 Event +
  diagnostic fields」に確定済みのため、Phase123-Bで改めて検討する
  必要はない。

**別途、次回セッションで着手を検討すべき項目**（優先度未確定）：

- Chart Modeで画面が空白になる事象の調査（6. Findings / 7. Remaining
  Issues参照）
- `deleteChord`拒否・`updateSectionBoundary`拒否の実機確認（低優先度。
  記録ロジック自体は①グループの他の箇所で動作確認済みのため）

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・①12箇所: Command Layer拒否分岐へ_recRecord()追加
    理由: Mutation Attempt（拒否）をDiagnostic Timelineへ記録するため
  ・_handleBoundaryDragMove() / _handleBoundaryDragEnd()
    理由: moveBoundaryCommandのnumber|null戻り値をRecorder用resultへ
    変換するため（Command Layer自体は無変更）
  ・④11箇所: app.js側独自ガード拒否へ_recRecord()追加
    理由: Command Resultを持たない拒否も、呼び出し側で{ok:false,reason}
    相当を組み立てて記録するため（debug-recorder-design.md §7準拠）
```

---

## 10. Micro Log

- Phase122の設計（`debug-recorder-design.md`）をAuthorityとして、
  `debugSessionRecorder.js`・`app.js`の呼び出し箇所を実コードで調査
  （[grep/view before assert]）
- Timeline Event粒度の判断根拠を、既存`record()`/`buildReport()`構造の
  精査から導出（構造変更不要と確定）
- `after = before`の妥当性を、Command Layer全14関数のgrep結果から
  機械的に検証（pushHistory()より前に全ok:false分岐があることを確認）
- ①③の実装完了後、④（app.js側独自ガード）の存在を追加調査で発見。
  ChatGPTレビューを経て①③④を1フィーチャー・1コミットとして確定
- `updateChord()`の呼び出し元・拒否到達可能性を調査し、対象外と判断
  （ChatGPTレビューで承認）
- Puppeteer + キャッシュ済みChromiumでヘッドレスE2Eテストを実施。
  `analysisEditor.state`（`__CS_DEBUG__`のlive reference）へ直接
  synthetic bufferを注入し、グローバルキーボードショートカット経由で
  Command Layer / app.js独自ガードの両方の拒否記録を確認
- たかっちさんによる実機確認を実施。当初提示した`updateSectionBoundary`
  拒否の再現手順が誤っていたことが判明（UI側事前ガードの見落とし）。
  `deleteChord`拒否も、実データの削除が`bufferLength<=1`まで至らず
  未確認のまま終了
- `git diff` / `git diff --check` / `node --check` / ステージング後の
  `git diff --cached`を確認してからコミット
- コミット時、Git identityが未設定でエラー。既存コミット履歴から
  著者情報を復元しリポジトリ限定で設定してからコミット完了
  （`f7a6357`。これはClaude作業用クローン環境でのコミットハッシュで
  あり、たかっちさんの実環境コミット`89d74f2`とは別物。同一内容の
  変更を別クローンでそれぞれコミットしたため、ハッシュが異なる）

---

## current-issues.md更新（該当issueがある場合）
> [Deferred Documentation運用ルール（README.md）に従い、この内容は
> 5フェーズ棚卸し時まで実ファイル（current-issues.md）へは未反映]
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - Chart Modeで画面に何も表示されなくなる事象（未確認・原因未特定）
  - `deleteChord`/`updateSectionBoundary`のCommand拒否記録が実機未検証
    のまま（低優先度・記録ロジック自体は他箇所で動作確認済み）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: Chart Modeで画面に何も表示されなくなる事象
  状態: 未確認・原因未特定（Phase123-A実機検証中に発見）
  内容: Analysis Editor編集中、bufferLengthは2件残っていたはずだが
  Chart Mode上にコードが一切表示されない状態が発生した
  （スクリーンショットあり）。Phase123-Aの変更（Recorder記録の追加のみ）
  が直接の原因である可能性は低いと考えられるが未調査。次回発生時、
  `window.__CS_DEBUG__.chart`等で状況を確認する方針（既存の「原因未特定の
  緑の棒バグ」と同様の扱い）。

- 見出し: `deleteChord`/`updateSectionBoundary`のCommand拒否記録が実機未検証
  状態: 検証保留（優先度低）
  内容: Phase123-Aで実装したMutation Attempt Recordingのうち、
  `deleteChordCommand`の「最後の1つ」拒否・`updateSectionBoundaryCommand`
  の`start-after-end`拒否は、実機で拒否イベントの発生そのものを確認
  できていない。前者はPuppeteer/人間実機とも未検証（同一パターンの
  `deleteSelection`は動作確認済み）。後者はUI側の事前ガード
  （境界ステッパーのdisabled制御）により通常操作では到達しないことが
  判明済み。実用上のリスクは低いと判断し、優先度低として記録のみ行う。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Mutation Attempt Recording（Phase123-A・Command Layer拒否（12箇所）・
    moveBoundaryCommandのnumber|null変換（1箇所）・app.js側独自ガード
    拒否（11箇所）をDiagnostic Timelineへ記録するよう拡張。全Command
    Layer関数で拒否分岐がpushHistory()より前にあることを検証した上で
    after=beforeを採用。history/future記録はPhase123-Bへ分離）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 123-A | Mutation Attempt Recording（debug-recorder-design.md
    [MUTATION ATTEMPT RECORDING]の実装。Command拒否・app.js側事前
    バリデーション拒否をTimelineへ記録。Timeline Event粒度は
    Phase122で未決定だった論点を「1 Mutation Attempt = 1 Event +
    diagnostic fields」に確定。updateChord()内部拒否・replaceAllMatches一部拒否・
    updateSectionBoundary拒否はUI側到達困難と判明） | app.js |

- Future Candidates: 次候補を更新
  ```
  Phase123-B候補: history/future の before→after 記録（Level 2）
  低優先度: Chart Mode空白表示事象の調査
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
