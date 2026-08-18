# Debug Session Recorder 設計メモ — Diagnostic Timeline

> **位置づけ**: Phase121で実装したMutation Recording基盤（`debugSessionRecorder.js`）の
> 実機検証を経て、「操作記録」ではなく「バグ診断のための時系列（Diagnostic Timeline）」
> として仕様を再定義するために、Phase122で起票した設計メモ。
>
> ステータス: **設計固定中（Phase122・Design Freeze）。実装はPhase123以降。**
> Phase98（section-model.md）と同じ進め方を踏襲する：
> 本フェーズではコード変更を一切行わず、仕様の確定のみを行う。

---

## [DOCUMENT AUTHORITY]

```
本ファイルはDebug Session Recorder（Diagnostic Timeline）の設計判断を
集約する設計ドキュメントである。

Recorderが「何を記録し、何を記録しないか」「なぜその項目が必要か」
「実装がこの設計に適合しているか」の判断基準は本ファイルで管理する。

architecture.md（§5.5）には概要と本ファイルへの参照のみを記載し、
設計内容を重複して保持しない。
```

役割分担のイメージ：

```
architecture.md      … システム全体構造・§5.5でRecorderの存在と本ファイルへの導線を記載
debug-recorder-design.md … Recorderサブシステムの詳細設計（本ファイル）
```

---

## 0. 経緯（1行で）

Phase121で「Mutationが起きたこと」を記録する基盤を作ったが、実機検証で
「Mutationが起きたこと」と「ユーザーがどう操作してそこに至ったか」は別の
情報だと判明した。Phase122ではこれをさらに掘り下げ、過去の実バグ
（Section誤削除・render巻き戻り等）を逆算した結果、必要なのは
「操作ログの精密化」ではなく「ユーザー操作を起点とした、内部イベントと
状態遷移の因果関係を時系列で追跡できること」だと判明した。本ファイルは
その到達点を仕様として固定する。

---

## 1. 目的（Purpose）

```
Diagnostic Timelineは、ユーザー操作そのものを記録することを目的としない。

目的は、ユーザー操作を起点として発生した「イベント（Event）」と
「状態遷移（State Transition）」を時系列で1本につなぎ、バグ発生時に
その因果関係を追跡できるようにすることである。
```

これは「Reproducible Diagnostic Session」（Phase121で定めた最終目的）の
再定義であり、Phase121時点の「操作ログ寄りの解釈」を「因果関係の追跡」
へ明確化したものである。

### [TIMELINE NOT REPLAY]（Phase122で確立）

```
Diagnostic Timelineは、バグの再現操作そのものではなく「再現時の証拠」
である。

Timelineが提供するもの:
  ・何が、どの順番で、どういう結果になったか
  ・原因候補を絞り込むための因果関係の手がかり

Timelineが提供しないもの:
  ・記録された操作列をそのまま自動再実行する機能（Replay）
  ・CSS/stacking context・rAFタイミング等、JS実行時状態の記録では
    原理的に捕捉できない不具合の直接検出
  ・記録さえあれば必ずバグが再現できるという保証

将来Replay機能が必要になった場合は、本ファイルのスコープ外の
別テーマとして扱う。Diagnostic Timelineの設計にReplayを前提とした
制約（全クリック・全キー入力・全座標の記録等）を持ち込まない。
```

---

## 2. 診断対象（何の因果関係を追うか）

```
ユーザー操作
    ↓
Semantic Event（意味のある操作単位）
    ↓
内部処理（Command / reconcile 等）
    ↓
State Transition（buffer / sections / history 等の変化）
    ↓
Render要求
    ↓
画面
```

Phase121のRecorderは「内部処理→State Transition」の一部（Mutation成功時のみ）
しか捉えられていなかった。Phase122ではこの鎖全体を対象とする。

---

## 3. Timelineの基本原則

### [DIAGNOSTIC TIMELINE AUTHORITY]（Phase121の[DEBUG SESSION RECORDER AUTHORITY]を継承・具体化）

```
Diagnostic Timelineは単一の時系列（既存の_events配列を継続利用）で
表現する。Semantic EventとMutation Eventを別の配列・別のAuthorityに
分離しない（案B・案Cの検討の結果、採用しないと確定した設計）。

理由: 2本以上のタイムラインに分けると、人間が読む際の突き合わせ負担が
増え、AIが解析する際も時系列の対応関係を再構築する必要が生じる。
1本の時系列に並べることで、「操作→内部処理→状態変化→render」という
連鎖がそのまま上から下に読める。
```

### 可読性の二重要件

```
Diagnostic Timelineは以下の両方を満たさなければならない。

  ① 人間が読んで意味が分かる（Copy Debug Reportでそのまま読める）
  ② AI（ChatGPT等）が時系列と差分から因果関係を推測できる

どちらか一方を優先して他方を犠牲にしない。人間可読性のためにJSON化を
避け、AI解析性のために各行を「イベント名＋差分」という一貫した形式に
揃える（既存の_formatEvent()の形式を踏襲する）。
```

---

## 4. 記録対象（Level 1〜3）

過去の実バグ（`current-issues.md` / `docs/handover/`記録済みのもの）を
逆算し、以下の3段階に分類する。

### Level 1：必ず記録する

```
Mutationを試みた操作（成立・不成立を問わない）
  ・Chord Mutation系（Add/Delete/Merge/Paste/Replace/Boundary/Undo/Redo）
  ・Section操作（create/rename/updateBoundary/delete）
  ・編集セッションのlifecycle（begin/end/save/cancel）

Mutationに付随する内部処理の結果
  ・reconcile()の判定結果（Sectionが変化した場合のみ。理由付き）
  ・render要求の発生（本線経由か、意図的な特殊経路か）
  ・render要求の参照元（buffer基準かraw基準か）

Analysis state変更（それぞれ独立した根拠を持つ。§8参照）
  ・repairRule変更（根拠: render巻き戻り／Phase120）
  ・capo変更（根拠: 検索異常／Phase97）
```

### Level 2：Level 1に付随する補助情報

```
「操作方法」の情報（既存のMutationイベントに同梱する）
  ・Boundary操作: method（drag/keyboard/button）
  ・Section境界ステッパー: side/dir

「内部状態の深さ」の情報（既存のMutationイベントのbefore/afterに同梱する）
  ・history.length / future.length
```

### Level 3：原則記録しない

```
Mutationを伴わない操作
  ・Selection変更（単一/範囲選択・解除）
  ・Section chip click（選択/Preview toggle）
  ・Search Navigation（Next/Prev）

理由: 過去バグ棚卸し（§9）でこれらが決定打になった実例が見当たらない。
記録すると操作ログ化し、Privacy Boundaryとの境界が曖昧になるリスクが
記録価値を上回る。
```

---

## 5. 記録しないもの（Privacy Boundary維持）

Phase121の[RECORDER PRIVACY BOUNDARY]をそのまま継承する。変更なし。

```
記録しない:
  ・キー入力そのもの
  ・検索文字列・自由入力テキスト
  ・クリック座標そのもの・pointermoveの全履歴
  ・Section名等、ユーザーが自由入力した文字列
    （既存どおり件数・idのみを記録し、名前は記録しない）
```

---

## 6. 状態遷移の追跡可能性

### [STATE TRANSITION OVER STATE VALUE]（Phase122で確立）

```
Diagnostic Timelineは「現在の状態値」の一覧（State Dump）ではなく、
「診断上重要な状態が、何によっていつ変化したか」（State Transition）
を追跡可能にすることを目的とする。

例:
  良い例: history: 3 → 2, future: 0 → 1
  避ける例: history: 2, future: 1（現在値のみ）

  良い例: repairRule: none → measureHead
  避ける例: repairRule: measureHead（現在値のみ）

この原則は§1の目的（因果関係の追跡）から直接導かれる。「今どうなって
いるか」だけでは、直前に何が起きたからそうなったのかが分からない。

[SCOPE] 本原則が定めるのは「変化を変化として表現できること」のみ。
具体的なデータ構造（イベントのbefore/afterに含めるか、専用の
Transitionフィールドを設けるか等）はPhase123以降の実装判断とする。
```

### history / future の扱い（§4との整理）

history.length / future.lengthは、Undo/Redo・Mutation系イベントの
diagnostic情報として、変更前→変更後の遷移が追跡できることを要件とする
（§4 Level 2参照）。「Mutation系イベントのbefore/afterに含めるか」
「全snapshotに常時含めるか」という実装上の持たせ方はPhase123で決定する
（本節では責務のみを定め、データ構造は規定しない）。

既存`snapshotState()`が持つフィールド（参考。変更なし）:
```
editorMode, selectedChordIds, selectedSectionId, dirty,
bufferLength（includeBuffer時）, sectionsCount（includeSections時）
```

---

## 7. Event と State Transition の関係

### 「ユーザー操作」と「Mutation attempt」の区別

```
[MUTATION ATTEMPT RECORDING]（Phase122で確立）

「ユーザーがボタン/キーを押した」ことと「Mutationを試みた」ことは
区別する。Diagnostic Timelineが記録するのは後者のみである。

判定基準（一行）: Mutation Command（またはそれに相当する状態変更処理）
が実際に呼び出されたか否か。呼び出された時点で初めて「Mutation
attempt」として記録対象になり、それ以前のUI操作（ボタンを押した・
モーダルを開いた等）は記録しない。

record()は「Mutationが成立した場合のみ呼ぶ」という運用（Phase121）を
改め、「Mutation Command（またはそれに相当する状態変更処理）が
実際に呼び出された場合、成立・不成立を問わず呼ぶ」へ拡張する。

具体例（区別の境界）:
  Deleteボタンを押した → 確認モーダルが開いた → Cancelを押した
    → Mutation Commandは一度も呼ばれていない
    → 記録しない（「ボタンを押した」というUI操作ログは残さない）

  Deleteを実行 → Command側のバリデーションで拒否された
    → Mutation Commandが呼ばれ、結果として不成立になった
    → 記録する（mutation: delete, result: rejected）

失敗時のstateBefore/stateAfterは、Mutationが実際には発生していないため
同一の値になる。これは矛盾ではなく、「試みたが何も変わらなかった」と
いう事実の正確な表現である。

対象範囲:
  ・Command Layerの結果（{ok:false, reason}）による拒否
  ・app.js側の事前バリデーションによる拒否
    （この場合はCommand Resultが存在しないため、呼び出し側が
    { ok:false, reason } 相当のオブジェクトを組み立てて渡す）

対象外（引き続き記録しない）:
  ・確認モーダルが表示される前の時点、およびモーダルでCancelされた
    場合（例: mergeSelectionのSection削除警告）。この場合Mutation
    Commandに到達していないため「ユーザー操作」の域を出ない。
    モーダルで確定された場合のみ、その先のMutation attemptとして
    記録対象になる。

この区別は、Privacy Boundary（UI操作そのものは記録しない）を守り
ながら診断情報を増やすための線引きであり、§5と対をなす。
```

### render経路の扱い

```
[RENDER PATH VISIBILITY]（Phase122で確立・実装方法は規定しない）

Diagnostic Timelineは、render要求が発生した場合に以下を識別できな
ければならない。

  ・どの経路（本線 / 意図的な特殊経路）から発生したか
  ・どのデータ（編集中のbuffer / 保存済みのraw）を参照して描画したか

[SCOPE] 本ファイルは上記の「識別できること」のみを設計要件として
定める。具体的な実装方法（ラベル文字列の命名・ヘルパー関数の新設・
既存呼び出し箇所の統廃合等）は本ファイルのスコープ外とし、Phase123
以降の実装フェーズで個別に判断する。

[背景] Phase106・Phase120はどちらも「render要求がどの経路・どの
参照元から発生したか」が実際のバグ原因だった。一方、render呼び出し
箇所の実地調査（Phase122時点）では、複数経路の存在が必ずしも設計の
誤りではなく、Mutationを伴わない部分再描画（Section Preview切替等）
のための意図的な設計であるケースも確認された。したがって「経路を
一本化すること」自体はDiagnostic Timelineの要件としない。
```

### session lifecycleの扱い

```
編集セッションのbegin/end/save/cancelを記録することで、後続の
Event/State Transitionが「どの編集セッション内で起きたか」を
Timeline上で区切れるようにする。これはPhase103で発見された
「編集終了後もSection Previewが残留する」のような、セッション境界
またぎのバグクラスの再発を診断するための最小限の区切り情報である。
```

---

## 8. 過去バグ対応表

Phase122調査時点で確認した実バグと、必要な記録項目の対応（既出の
インベントリを転記・正本化）。

| バグ種別 | Chord Mutation | Boundary+method | Undo/Redo+depth | Section操作 | セッションlifecycle | reconcile結果 | render経路 | render参照元 | repairRule変更 | capo変更 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Section意図せず削除（Phase109-111型） | ○ | | | ○ | | ◎ | | | | |
| render巻き戻り（Phase106/120型） | | | | | | | ◎ | ◎ | ◎ | |
| dirty/reset漏れ（Phase103型） | | | | ○ | ◎ | | | | | |
| 連続Undo混乱（未解決・予防） | | | ◎ | | | | | | | |
| 検索異常（Phase97型） | | | | | | | | | | ◎ |

`◎`＝直接の決定打、`○`＝補助的に有用。

**根拠の区別（分離した理由）**: repairRule変更とcapo変更は、それぞれ独立した別のバグ機構によって根拠づけられている。
- repairRule変更 → render巻き戻り（Phase120）：repairRule変更の**直後**にrenderが誤った参照元（raw）を使ったことが原因
- capo変更 → 検索異常（Phase97）：capo変更によって生じたcanonical変換の綴り違いが検索マッチングを壊した原因

両者を1列にまとめると「repairRule/capoのどちらかがあれば両方のバグを説明できる」ように誤読されるため、列を分離し、§9（採用基準）に照らして**それぞれ単独で根拠が成立している**ことを明示する。

---

## 9. 記録対象の採用・追加基準

### [RECORDING ADOPTION CRITERIA]（Phase122で確立）

```
新規記録項目は、原則として過去の実バグまたは複数の診断課題への
具体的な必要性を根拠として追加する。単なる「あると便利そう」という
推測だけでは追加しない。

判断の参考にする根拠（いずれかがあれば採用候補になる。両方揃うことを
必須条件とはしない）:
  ・current-issues.md / docs/handover/ に記録された実バグに
    直接紐づく（§8の対応表がこれに相当する）
  ・複数のバグ種別にまたがる共通要因である（§8で複数列に
    ◎が付く項目。reconcile結果／render経路／session lifecycleが該当）

この基準はRecorderが「操作ログ」「監視機能」へ変質することを防ぐ
ための歯止めであり、Phase121の[RECORDER PRIVACY BOUNDARY]が定める
「診断のための最小限」という思想を、記録項目の追加プロセス自体にも
適用したものである。
```

---

## 10. Named Invariant / 検証基準

Phase123以降の実装・変更が、本ファイルの設計原則に適合しているかを
確認できる基準として、以下を残す。後続の変更・レビューはこれらの
Named Invariantに照らして判断する（自動判定ではなく、レビュー時の
拠り所として機能させる）。

```
[DIAGNOSTIC TIMELINE AUTHORITY]     … §3。単一時系列を維持する
[TIMELINE NOT REPLAY]               … §1。Replay機能と混同しない
[STATE TRANSITION OVER STATE VALUE] … §6。現在値ではなく変化そのものを追跡可能にする
[MUTATION ATTEMPT RECORDING]        … §7。「ユーザー操作」と「Mutation attempt」を区別した上で、
                                        Mutation attemptは失敗・キャンセルも記録対象に含める
[RENDER PATH VISIBILITY]            … §7。経路・参照元の識別可能性のみを要件とし、
                                        実装方法は規定しない
[RECORDING ADOPTION CRITERIA]       … §9。新規記録項目追加の歯止め
```

既存のPhase121由来の原則（`[DEBUG SESSION RECORDER AUTHORITY]`・
`[RECORDER PRIVACY BOUNDARY]`・`[RECORDER CALL SITE RULES]`・
`[RECORDER GLOBAL ACCESSIBILITY]`）は変更・継続とも本ファイルの
前提として維持する（再掲しない。architecture.md/handover_phase121.md
参照）。

---

## 11. Phase122で決めないこと（実装スコープ外）

```
本ファイルが定めるのは「何を・なぜ記録するか」という設計要件のみ。
以下はPhase123以降、実装時に個別に判断する。

  ・record()のシグネチャ変更の具体的な形
  ・render経路のラベル名・判定方法・ヘルパー関数の要否
  ・render呼び出し箇所（capo変更ハンドラ等）の本線統合の要否・方法
  ・失敗時Result オブジェクトを自作する箇所の具体的な実装
  ・reconcile()の判定理由をどう文字列化するか
  ・実機確認の具体的な手順・チェックリスト
```

Phase123は本ファイルの範囲（§4のLevel1〜2）をすべて一度に実装する
必要はなく、既存の「1フィーチャー1コミット」原則に従い、実装時に
複数フェーズへさらに分割してよい（例: 失敗イベント対応／
reconcile・render記録の追加、を別コミット・別フェーズに分ける等）。

---

## 12. 次にこのメモを開く時にやること

- [ ] Phase123着手時、§4 Level 1〜2の実装範囲を確定し、実装単位に
      分割する（本ファイルの§11を踏まえ、複数フェーズへ分割してよい）
- [ ] render経路の識別方法（§7 [RENDER PATH VISIBILITY]）を、
      Phase122時点の実地調査結果（意図的な特殊経路3〜4件・
      暗黙の前提頼み2〜3件の分類）を踏まえて設計する
- [ ] 実装完了時、architecture.md §5.5へ本ファイルへの参照リンクを
      追記する（section-model.mdと同じ運用パターン）

### architecture.mdへの反映タイミングについて（補足）

本ファイルの§10に列挙したNamed Invariantは、Phase122時点ではまだ
設計段階（Design Freeze）にあり、実装を伴っていない。
`docs/handover/README.md`の「Named Invariant即時反映ルール」は
実装を伴う設計変更を対象とした運用であり、本ファイルはその例外を
作るものではない。architecture.mdへの反映は、Phase123で実装に着手・
完了した時点で、通常のドキュメント更新プロセスとして行う
（section-model.mdがPhase98の仕様固定時点ではarchitecture.md未反映で、
Phase99実装着手時に反映されたのと同じ扱い）。
