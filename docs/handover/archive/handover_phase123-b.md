# 引き継ぎ: Phase123-B完了 — history/future の before→after 記録

## 作業状態
- ブランチ: phase123-b-history-future-recording
- 直前作業: Phase123-A完了（Mutation Attempt Recording）

## micro-log
（フェーズ完了につき本文へ整理済み。本セクションは削除）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `snapshotState()` 共通フィールド追加 | `historyLength` / `futureLength`（`analysisEditor.history.length` / `.future.length`）を無条件の共通フィールドとして追加 | debugSessionRecorder.js |
| JSDoc `[SNAPSHOT FIELDS]` 更新 | 共通フィールド一覧へ`historyLength`/`futureLength`を追記 | debugSessionRecorder.js |

`app.js`側の変更は0箇所（既存の`_recSnapshot()`が`analysisEditor`を
丸ごと`snapshotState()`へ渡す構造のため、呼び出し元約40箇所は無改修）。

## 設計判断

```
結論: historyLength / futureLength は共通snapshot fieldとする
      （bufferLength/sectionsCountのようなopts経由のopt-in指定にしない）。

理由: _formatDiffLine()（レポート整形）は before === after の場合に
      差分行を出さない既存の仕組みを持つ。historyLengthが変化しない
      イベント（copySelection等）では自動的に非表示になるため、
      opt-inにしなくてもレポートにノイズは出ない。
      debug-recorder-design.md §6 [STATE TRANSITION OVER STATE VALUE]
      （現在値ではなく変化そのものを追跡可能にする）の要件を、
      既存の差分抑制機構にそのまま乗せる形で満たせると判断した。
```

## 確定した設計原則

新規Named Invariantの追加・変更なし。Phase122で確立済みの
`[STATE TRANSITION OVER STATE VALUE]`（debug-recorder-design.md §6）を、
`snapshotState()`の実装へ反映しただけ。

## Out of Scope（あれば）

- Semantic Interaction Event（クリック・ドラッグ等の操作記録。
  debug-recorder-design.md §4 Level1後半〜Level3相当）
- reconcile()の判定結果の記録
- render経路・render参照元の識別（`[RENDER PATH VISIBILITY]`）
- Section境界移動（updateSectionBoundary）の意味的操作情報
  （どちらの境界を・どの操作方法で・どこからどこへ）

いずれもPhase122の設計メモが「Phase123で決めないこと」または
「Level 3以降」として区分済みの項目であり、今回のスコープに含めていない。

## 実機確認（あれば）

```
□ 通常のMutation（addChord等）→ historyLength: N → N+1 → OK
□ Undo → historyLength: N → N-1 / futureLength: M → M+1 → OK
□ Redo → historyLength: N → N+1 / futureLength: M → M-1 → OK
□ Mutation拒否（copySelection等） → historyLength/futureLength行が
  表示されない（変化なしのため） → OK
```

上記はスタブ環境（Node.js単体実行）での確認。実プロジェクト上での
実機確認はたかっち側で実施予定。

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue: なし

## 積み残し・保留バグ

なし

## 次フェーズ候補

Phase122の`debug-recorder-design.md` §4 Level 1後半〜Level3
（Semantic Interaction Event・reconcile診断情報・render経路識別）。
着手時は`debug-recorder-design.md`を参照して範囲を再確認すること。

## Deferred Documentation（棚卸し時に反映する内容）

```
phase-status.md
  - Current Status（完了済みリスト）に追加:
    ✓ history/future の before→after 記録（Phase123-B・
      snapshotState()の共通フィールドとしてhistoryLength/futureLengthを
      追加。opts経由のopt-in指定は不要（差分フォーマッタが変化なしを
      自動抑制するため）。app.js側は無改修）
  - Major Milestones（Analysis Editorテーブル）に追加:
    | 123-B | history/future の before→after 記録（
      debug-recorder-design.md [STATE TRANSITION OVER STATE VALUE]の
      実装。snapshotState()の共通フィールド化により、Mutation
      Attempt Recording（Phase123-A）の呼び出し箇所を一切変更せずに
      Undo/Redoスタック深さの遷移を記録可能にした）
      | debugSessionRecorder.js |
  - Future Candidates: 次候補を更新
    ```
    Phase123-C候補: Semantic Interaction Event（クリック・ドラッグ等の
    操作記録。debug-recorder-design.md §4 Level1後半〜）
    ```

current-issues.md
  - No changes.

README.md
  - No changes.
```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
