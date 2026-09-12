# 引き継ぎ: Phase114完了 — merge実行時のSection削除確認UX

## 作業状態
- ブランチ: phase114-merge-section-warning
- 直前作業: Phase113完了（Section境界メニューHit-Test修正・Phase109〜113棚卸し）

---

## 1. Purpose（目的）

merge（複数選択コードを1つに結合する操作）がSectionの意味領域を超えて
外側のコードまで巻き込む場合、既存仕様（[SECTION EXTENT GUARD]・
Phase109確立）によりそのSectionは無警告で削除される。これはバグではなく
仕様通りの動作だが、ユーザーが気づかないまま消えてしまう問題があった
（current-issues.md「merge実行でSectionが削除される場合の確認UX未実装」・
Phase109で発見・意図的に先送りされていた項目）。

本フェーズでは、削除される見込みのSectionがある場合のみ、merge実行前に
確認モーダルを挟むようにする。

---

## 2. Scope（今回やったこと）

- `analysisSession.js`: `reconcile()`内の判定ロジックを`_evaluateSectionMutation()`
  として抽出（Commit1・挙動不変）
- `analysisSession.js`: `predictSectionImpact()`を新設。指定したMutation Facts
  で削除される見込みのSectionを予測する読み取り専用関数（Commit2）
- `analysisCommands.js`: `mergeSelectionCommand()`内のFacts組み立てロジックを
  `_buildMergeFacts()`として抽出。`previewMergeSectionImpact()`を新設し、
  実行前にSectionへの影響を予測できるようにした（Commit2）
- `modals.js`: `openMergeSectionWarningModal()`を新設（既存モーダルパターンを踏襲）
- `app.js`: `mergeSelection()`を`_runMerge()`に分割し、実行前に
  `previewMergeSectionImpact()`を呼んで分岐する構造へ変更

---

## 3. Out of Scope（今回はやらないと決めたこと）

- delete操作・paste操作・Ctrl+V操作での同様のSection削除警告
  （merge以外は発生頻度・UI導線が異なるため別Phaseで検討。current-issues.md
  「merge操作の意味論見直し」等とも独立した論点として扱う）
- 非連続選択時のmerge対応拡大（現行UIには非連続選択を作る手段がなく、
  `_buildMergeFacts()`内の連続性チェックは実質到達しないコードのまま
  据え置き。実機テストで確認済み・変更不要と判断）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `_evaluateSectionMutation()`抽出 | `reconcile()`内のSection1件ぶんの判定ロジックを独立関数化。`reconcile()`自体は`.map()`で呼ぶだけの薄い関数に | analysisSession.js |
| `predictSectionImpact()`新設 | `getSections()` + `_evaluateSectionMutation()`のみで構成。削除される見込みのSectionを列挙する読み取り専用関数。merge可否判定は行わない | analysisSession.js |
| `_buildMergeFacts()`抽出 | `mergeSelectionCommand()`が使うMutation Facts組み立てロジックを独立関数化。preview/execute両方の唯一の生成元 | analysisCommands.js |
| `previewMergeSectionImpact()`新設 | `_buildMergeFacts()` → `predictSectionImpact()`を呼び、影響を受けるSection一覧を返す | analysisCommands.js |
| `openMergeSectionWarningModal()`新設 | 影響を受けるSection名を列挙し、Undo案内文言を含む確認モーダル | modals.js |
| `mergeSelection()`分割 | 実行前に`previewMergeSectionImpact()`を呼び、影響ありならモーダル経由、無ければ即`_runMerge()` | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] EXTENT GUARD判定ロジックの共有化

```
結論: predictSectionImpact()は独自の判定ロジックを持たず、reconcile()と
      同じ_evaluateSectionMutation()を共有する。

理由: ChatGPTレビュー（1回目）で、predictSectionImpact()が[SECTION EXTENT
      GUARD]を独自に再計算する設計だと二重実装になる、という指摘を受けた。
      Phase109〜111で慎重に統一してきたMutation Facts判定ロジックを、
      Phase114で再び分岐させないための修正。
```

### [判断] Mutation Facts生成元の一本化

```
結論: previewMergeSectionImpact()とmergeSelectionCommand()は、どちらも
      _buildMergeFacts()という同一関数を呼ぶ。「範囲」ではなく実際の
      Mutation Facts形式（blockIds等）で予測を行う。

理由: ChatGPTレビュー（1回目）で、predictSectionImpact(session, mergeRange)
      のような「範囲ベース」のAPIは、既存のMutation Facts設計
      （[COMPOUND MUTATION BOUNDARY RESOLUTION PRINCIPLE]・Phase109）と
      別体系になってしまうという指摘を受けた。実コード確認の結果、
      mergeSelectionCommand()は削除対象ID・新規ID生成をbuffer書き換え前に
      確定していることが分かり（594〜608行目）、この共有が可能だった。
```

### [判断] predictSectionImpact()の責務を「予測のみ」に限定

```
結論: predictSectionImpact()はMutationの成否判定を行わない。merge可否
      （選択件数・連続性）は_buildMergeFacts()の戻り値（ok/reason）が
      別途担う。

理由: ChatGPTレビュー（2回目）で、predictSectionImpact()の役割が
      「merge成否検証」に見えると責務が曖昧になるという指摘を受けた。
      JSDocに「このFunctionはMutationの成否判定を行わない」と明記し、
      呼び出し順序（_buildMergeFacts()のok確認 → predictSectionImpact()）
      をpreviewMergeSectionImpact()内で固定した。
```

### [判断] Invariant検証（validateSectionInvariants）はpredict対象外

```
結論: predictSectionImpact()は[SECTION EXTENT GUARD]由来の削除のみを
      予測し、Mutation実行後のbuffer状態を前提とするinvariant検証は
      行わない。

理由: 実行前時点ではMutation後の新しいID（merged._id相当）がbuffer上に
      まだ存在しないため、validateSectionInvariants()を素朴に適用すると
      「存在しないIDだから無効」という誤判定になる。mergeにおいては
      EXTENT GUARDが実質唯一の削除トリガーであり、この限定は実用上
      問題ないと判断（JSDocの[LIMITATION]として明記・透明化）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- `mergeSelectionCommand()`は、削除対象ID一覧（blockIds）とmerge後の新ID
  （`merged._id`）を`buffer.splice()`より前に確定している構造だった
  （594〜608行目）。この事実がPhase114の設計（実行前にFactsを組み立てて
  予測に使う）を成立させる前提となった。
- `mergeSelection()`のJSDocには元々「確認ダイアログなし・即実行」という
  Invariantが明記されていた（Phase75由来の方針）。Phase114ではこれを
  「通常は確認なし・Section削除見込み時のみ確認」へ更新した。既存の
  ドキュメント化されたInvariantを変更する際は、コメント自体の更新も
  忘れずに行う必要があると再確認した。
- `mergeSelection()`の戻り値を使っている呼び出し元は`aep-merge`ボタンの
  クリックハンドラ1箇所のみで、戻り値は使われていなかった。モーダルを
  挟むことで戻り値のタイミングが変わる（同期→非同期分岐）変更だったが、
  実害がないことをgrepで確認してから実装を進めた。

---

## 7. Remaining Issues（残課題）

なし（本フェーズのスコープ内で完結）。

---

## 8. Next Phase（次フェーズ開始位置）

優先順位（たかっちの指定）: ②（本フェーズで完了）→ ③ → ④ → ①

次候補:
- ③ 置換直後のCtrl+Z UX改善
- ④ `__analysisEditorDebug`の正式化判断
- ① `isChordLikeInput`末尾検証強化

---

## 9. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・reconcile()から_evaluateSectionMutation()を抽出（Commit1）
    理由: predictSectionImpact()との判定ロジック二重実装を避けるため
  ・predictSectionImpact()を新設（Commit2）
    理由: merge実行前にSectionへの影響を読み取り専用で予測するため

js/analysisCommands.js
  ・mergeSelectionCommand()からFacts組み立てロジックを_buildMergeFacts()
    として抽出（Commit2）
    理由: preview/execute間でのFacts生成ロジック重複を避けるため
  ・previewMergeSectionImpact()を新設（Commit2）
    理由: app.js側がmerge実行前にSection影響を確認できるようにするため

js/modals.js
  ・openMergeSectionWarningModal()を新設（Commit2）
    理由: 影響を受けるSectionをユーザーへ提示し、実行可否の判断を委ねるため

js/app.js
  ・import追加（openMergeSectionWarningModal・previewMergeSectionImpact）
  ・mergeSelection()を分割し、_runMerge()を抽出（Commit2）
    理由: preview結果に応じてモーダル経由/即実行を分岐する必要があったため
  ・mergeSelection()のJSDoc（[INVARIANT]記述）を更新
    理由: 「確認ダイアログなし・即実行」という既存の明文化されたInvariantが
    実態と合わなくなったため
```

---

## 10. Micro Log

- `_evaluateSectionMutation`抽出 → node --check + 7パターン回帰テストで
  reconcile()新旧一致を確認 → Commit1確定
- ChatGPTレビュー1回目: EXTENT GUARD二重実装・Mutation Facts不整合の
  指摘を受け、設計を`_buildMergeFacts()`/`predictSectionImpact()`共有方式へ修正
- 実コード（analysisCommands.js・app.js・modals.js）を確認してから
  Commit2の詳細設計を確定（[grep/view before assert]原則）
- Commit2実装後、10パターン（予測5・実行新旧一致5）の自動回帰テストで
  全PASSを確認
- ChatGPTレビュー2回目: predictSectionImpact()の責務限定を明記する
  よう指摘を受け、JSDocへ反映
- 実機テスト8パターン全て期待通り（複数Section同時削除・Undo復元を含む）
- ChatGPTレビュー3回目（最終監査）: `_buildMergeFacts()`単一生成元性・
  `predictSectionImpact()`の責務限定をコード上で確認し、最終承認

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: merge実行でSectionが削除される場合の確認UX未実装
  （Phase109で発見・Phase114で解消）
- 今回新規に積み残したissue: なし

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- merge実行でSectionが削除される場合の確認UX未実装（Phase109で発見・
  Phase114で解消。`[SECTION EXTENT GUARD]`によりSection外を巻き込む
  mergeでSectionが削除される際、実行前に確認モーダルを表示するように
  なった。`predictSectionImpact()`（analysisSession.js）・
  `previewMergeSectionImpact()`（analysisCommands.js）を新設し、
  既存の`reconcile()`判定ロジック（`_evaluateSectionMutation()`）を
  共有することで二重実装を回避）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ merge実行時のSection削除確認UX（Phase114・`[SECTION EXTENT GUARD]`
    発動時にのみ確認モーダルを表示。`_evaluateSectionMutation()`共有化に
    より`reconcile()`との判定ロジック二重実装を回避）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 114 | merge実行時のSection削除確認UX（`predictSectionImpact()`・
    `previewMergeSectionImpact()`新設。`_buildMergeFacts()`をpreview/
    execute共通の唯一のFacts生成元とし、`_evaluateSectionMutation()`を
    `reconcile()`と共有することで判定ロジックの二重実装を回避） | analysisSession.js / analysisCommands.js / modals.js / app.js |

- Future Candidates: 変更なし（次候補は③置換直後のCtrl+Z UX改善）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
