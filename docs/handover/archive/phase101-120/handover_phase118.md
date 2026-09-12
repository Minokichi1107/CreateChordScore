# 引き継ぎ: Phase118完了 — Undo/Redo後の変更箇所ナビゲーション（Mutation Region方式）

## 作業状態
- ブランチ: phase118-undo-redo-navigation
- 直前作業: Phase117完了（isChordLikeInput()末尾検証強化）

---

## 1. Purpose（目的）

Phase115の実機検証中に発見された新規課題「Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX」（current-issues.md Future Features）に対応する。

`undoEdit()` / `redoEdit()` は従来buffer/画面の再描画のみを行い、どのコードが変更されたか分かる位置へのスクロールは行っていなかった。delete/move/split/merge/paste/Section boundary mutation等、操作の種類によって「変更箇所」の定義が異なるため、対象位置の特定方法を含めた設計が必要だった。

---

## 2. Scope（今回やったこと）

- `analysisSession.js`: `computeMutationFocusChordId(oldBuffer, newBuffer)` を新設。
  swap前後のbufferを比較し、ナビゲーション対象のchordIdを返す純粋関数
- `app.js`: `undoEdit()` / `redoEdit()` へ、swap前bufferの保持 → 上記関数呼び出し
  → `scrollToChord()` 呼び出しを追加

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **Section系コマンド（create/rename/updateBoundary/deleteSectionCommand）へのNavigation対応**
  今回のUndo/Redo Navigationはbuffer mutationのみを対象とし、sections-only
  mutation（session.sectionsのみ変更）はNavigation Hintを生成しない。
  これは「Section操作がNavigation非対応」という意味ではなく、Section自体には
  Phase105で確立済みの独立したSection Navigation（`[NAVIGATION OWNERSHIP]`・
  チップクリックで選択+scrollToChord()）が既にあるため、統合すると
  「編集履歴のナビゲーション」と「Section UIのナビゲーション」が
  混ざってしまう、という意図的な設計（ChatGPTレビューで明示的に合意済み）
- **Undo/Redoで移動元と移動先の関係を示す視覚的フィードバック（アニメーション・ハイライト等）**
  実機検証で「瞬間移動のため移動先を認識しづらい」という課題が判明したが、
  これは独立したUX課題として次フェーズへ分離した（7. Remaining Issues参照）
- **`scrollToChord()` へのsmooth scroll復活**
  Phase106で解決済みの `[RENDER CONTEXT INVARIANT]` 発見のきっかけとなった
  scrollTop競合（アニメーション中の再描画によるレイアウト崩壊）を再発させるリスクが
  あるため不採用。Section Navigation（Phase105〜107）と共有している関数のため、
  Undo/Redo側だけの都合で変更しない

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `computeMutationFocusChordId()` 新設 | oldBuffer/newBufferを`_id`で比較し、Mutation Region（変更区間の和集合）からnavigation対象chordIdを求める純粋関数 | analysisSession.js |
| `undoEdit()` 修正 | `undoBuffer()`呼び出し前にswap前bufferの参照を保持 → 呼び出し後にdiff計算 → `scrollToChord()`呼び出しを追加 | app.js |
| `redoEdit()` 修正 | `undoEdit()`と同じロジック（`redoBuffer()`版） | app.js |

変更行数: analysisSession.js +約100行（新規関数のみ・既存関数への変更なし）、app.js +約24行（undoEdit/redoEditの既存ロジックは変更せず、必要な処理を追記）。`node --check`構文チェック・CRLF維持確認済み。既存コードの既存ロジックは変更せず、必要な処理を既存関数へ追記した（diffは追記のみ）。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] History snapshot（`{ buffer, sections }`）には一切手を入れない

```
結論: focusTime/focusChordIdのような「どこを見せるか」の情報は
      History entry（pushHistory()が積むスナップショット）へ含めない。
      undoBuffer()/redoBuffer()もPhase104から一切変更していない。

理由: History snapshotは「状態復元」のAuthorityであり、UI Navigation用の
      一時情報を混入させると意味が変わってしまう（ChatGPTレビュー指摘）。
      swap前後のbuffer参照はapp.js側で一時的に保持するだけで済み、
      Session Layer（analysisSession.js）の既存契約に触れる必要がなかった。
```

### [判断] コマンドごとの個別対応をせず、buffer diffによる汎用方式を採用

```
結論: delete/split/merge/paste/moveBoundary等、個別コマンドの知識を
      一切持たない。「swap前後で何が変わったか」だけを見る。

理由: 各コマンドが「操作直前の時刻」を個別に返す設計も検討したが、
      Undo/Redoは「過去のCommandの再実行」ではなく「History状態の復元」
      であるため、Command側の知識をNavigationへ持ち込むと責務が
      混ざる（ChatGPTレビュー指摘）。buffer diffのみを見る方式なら、
      Phase109〜111で確立した[COMPOUND MUTATION BOUNDARY RESOLUTION
      PRINCIPLE]（「何が起きたか」ではなく「結果として何が変わったか」を
      見る）と同じ考え方をそのまま踏襲でき、将来コマンドが増えても
      この関数への変更が不要になる。
```

### [判断] Navigation上の「変更」判定を `_id` / `start` / `end` / `chord` の3項目に限定

```
結論: buffer要素の全プロパティをdeep compareせず、上記3項目
      （`_id`はidentity key、start/end/chordが比較対象）のみを見る。

理由: `confidence`等の内部メタデータ（例: mergeSelectionCommandが
      新規コードへ付与する固定値1）まで比較対象に含めると、見た目上は
      何も変わっていないのに誤ってナビゲーションが発火するリスクがある。
      ホワイトリスト方式にすることで、将来buffer要素にフィールドが
      追加されても誤動作しない（ChatGPTレビュー指摘）。
```

### [判断] Mutation Region方式（変更区間の和集合→中心→最近傍探索）を採用

```
結論: 差分として見つかった全区間（removed/added/changedの[start,end)）の
      和集合を「Mutation Region」とし、その中心（regionCenter）を
      含むchord、無ければ最も近いchordをnavigation対象とする。

理由: 当初案「最初に見つかった差分」は、Map/配列の走査順に依存して
      しまいUXとして不安定（ChatGPTレビュー指摘）。Region方式なら
      Merge/Pasteのような複数コード同時変更でも一意に決まり、かつ
      Undo/Redoの方向に関わらず対称に振る舞う（同じregionから
      同じロジックで求まるため、方向ごとの特殊分岐が不要）。
```

### [判断] 境界移動（#3ケース）を特殊扱いしない

```
結論: 境界移動時にRegion中心が「動かした境界そのもの」ではなく
      「変更範囲全体の中心」に寄る（例: A(0-2)→A(0-3), B(2-4)→B(3-4)の
      場合、region=[0,4]・center=2でAが選ばれ、境界(3)そのものではない）
      挙動を、Phase118では許容する。

理由: 境界移動だけ専用ロジックを入れると、最初に避けたかった
      「コマンドごとの個別知識」が再び混入してしまう（ChatGPTレビュー
      指摘）。実機検証でも、通常の編集範囲では実害が確認できなかった
      （8. 実機確認参照）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- `analysisEditor.buffer` の要素は全て `{ _id, start, end, chord, ... }` という均一構造
  であることをapp.js全体のgrepで確認した（barline等の別tokenは`project.lines`側のみで、
  Analysis Editor bufferには混在しない）。これにより汎用的なdiff方式が成立する前提が
  取れた（[grep/view before assert]の実践）。
- `undoBuffer()`/`redoBuffer()`は呼び出し時点でswap前のbuffer参照をまだ保持できる
  （関数内部で`session.future`/`session.history`へpushしてから`session.buffer`を
  上書きする構造のため）。この性質を利用し、app.js側で「swap呼び出し直前の参照を
  変数に控えておくだけ」で新旧bufferの比較が可能だった。analysisSession.js側への
  変更（戻り値の拡張等）が一切不要だった。
- 実機検証で、Region方式が「境界移動でも変更範囲全体の中心に寄る」という仕様どおりの
  挙動をすることを確認したが、実際のプロジェクトでは境界移動1回あたりの変更範囲が
  画面外に及ぶほど長くならないため、「変更した境界が画面外に出て見つからない」という
  具体的な問題は再現できなかった（8. 実機確認参照）。
- 実機検証を通じて、Region方式そのものとは別に「瞬間移動のため移動元と移動先の
  空間的関係が分かりにくい」という新しい課題が見つかった。これはMutation Region
  の計算ロジックの問題ではなく、`scrollToChord()`が瞬間移動（behavior:'auto'）で
  あることに起因する、Navigation演出面の課題であるため、別Issueとして切り分けた
  （7. Remaining Issues参照）。

---

## 7. Remaining Issues（残課題）

Phase118のスコープ内に残課題なし。

以下は実機検証中に発見された**新規の課題**であり、Phase118とは別テーマとして
Future Issueへ分離した。

```
新規Issue: Undo/Redo Navigation Feedback（変更箇所の一時ハイライト）
状態: 未着手・設計方向は決定済み
内容: Phase118でUndo/Redo後にscrollToChord()が発火するようになったが、
瞬間移動のため「どこから どこへ 移動したか」が分かりにくいという
実機フィードバックがあった。
smooth scroll復活は不採用（Phase106の[RENDER CONTEXT INVARIANT]発見の
原因となったscrollTop競合を再発させるリスクがあるため。scrollToChord()は
Section Navigationとも共有しているため、Undo/Redo側の都合だけで変更しない）。

第一候補案（ChatGPTとの検討で合意）:
  ・scrollToChord()自体は変更しない（即時ジャンプを維持）
  ・移動後の対象chordを300〜500ms程度の一時ハイライト（pulse等）で
    強調しフェードアウトさせる
  ・「強調する」という責務をscrollToChord()に持たせず、独立した
    Navigation Feedback Decoratorとして設計する
    （[DECORATOR ADDITION RULE]に沿う: ローカル状態＋専用setterを新設し、
    正本の導出はapp.js側、chartmode.js側は表示のみを担当する形）
  ・実装前にDecorator Inventory（architecture.md §12）との重複確認、
    [ONE INTENT, ONE PRIMARY DECORATOR]準拠確認が必要
```

---

## 8. 実機確認

```
□ 通常のUndo → 変更箇所付近へスクロールする → OK
□ 通常のRedo → 変更箇所付近へスクロールする → OK
□ Section作成/Rename/境界編集/削除のUndo/Redo → スクロールしない（buffer diffなしのため） → OK
□ 境界移動のUndo/Redo → Region中心のコードへスクロールする（仕様どおり。
  「境界そのものが画面外に出る」ケースは実際の編集範囲では再現できず） → OK（仕様どおり）
△ スクロールが瞬間移動のため、移動元と移動先の空間的関係が分かりにくい
  → バグではなくUX課題として認識。7. Remaining Issuesへ分離
```

---

## 9. Next Phase（次フェーズ開始位置）

次候補（優先順位未確定・新規発見事項ベース）:

```
・Undo/Redo Navigation Feedback（変更箇所の一時ハイライト。7. Remaining Issues参照）
・（Phase115 handoverより持ち越し）isChordLikeInput末尾検証強化 → Phase117で対応済み
```

現時点で明確な次点候補は積み残しておらず、Phase119は新規の要望・発見事項ベースで選定する。

---

## 10. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・computeMutationFocusChordId() を新設
    理由: Undo/Redo時のNavigation対象を、History snapshotの形状を変えずに
    swap前後のbuffer比較のみから導出するため

js/app.js
  ・undoEdit() へ swap前buffer参照の保持 → computeMutationFocusChordId()
    呼び出し → scrollToChord()呼び出しを追加
    理由: Undoで変更箇所へ自動的にナビゲートできるようにするため
  ・redoEdit() へ同様の変更を追加
    理由: Redoでも同じNavigation UXを提供するため
```

---

## 11. Micro Log

- 設計フェーズ: ChatGPTとの往復で「focusTimeをHistoryへ入れない」
  「コマンド個別知識を持ち込まない」の2大方針を確定
- 実コード調査（analysisSession.js / app.js / chartmode.js）を実施し、
  undoBuffer()/redoBuffer()がswap前buffer参照を app.js側で自然に
  保持できる構造であることを確認（[grep/view before assert]）
- 「最初に見つかった差分」方式を却下し、Mutation Region（区間の和集合→
  中心→最近傍探索）方式へ設計変更（ChatGPTレビュー指摘）
- Navigation上の「変更」判定基準を `_id/start/end/chord` に限定する
  ホワイトリスト方式で確定（ChatGPTレビュー指摘）
- delete/add/boundary/split/merge/paste/undo/redo/変更なし/Section-only
  の10ケースを表にまとめ、期待値を事前に確定
- 実装（analysisSession.js・app.js）→ node --check（3ファイル）→
  Mutation Region単体テスト10ケース全PASS → Section-only変更
  （別参照・同値）の個別確認 → PASS → diff確認（既存コード無変更）
- 実機検証: 通常のUndo/Redo・Section-only操作・境界移動を確認。
  「瞬間移動で移動元と移動先の関係が分かりにくい」という新規課題を発見
- 新規課題の対応方針をChatGPTと検討: smooth scroll復活は不採用、
  「即時ジャンプ＋短時間ハイライト」を第一候補としてFuture Issueへ分離

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX
    （Phase115で発見・Phase118で解消。`computeMutationFocusChordId()`
    （analysisSession.js）を新設し、Undo/Redo実行前後のbuffer比較のみから
    Navigation対象を導出する方式を採用。History snapshot自体は無変更）
- 今回新規に積み残したissue:
  - Undo/Redo Navigation Feedback（変更箇所の一時ハイライト。
    未着手・設計方向は決定済み。7. Remaining Issues参照）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX（Phase115で発見・
  Phase118で解消。`computeMutationFocusChordId()`（analysisSession.js）が
  Undo/Redo実行前後のbufferを`_id`基準で比較し、変更区間の和集合
  （Mutation Region）の中心に最も近いコードへ`scrollToChord()`する方式を
  採用。History snapshot（`{buffer, sections}`）自体は無変更。Section系
  コマンドはbuffer diffが発生しないため自動的に対象外となる）

#### ADD
- 見出し: Undo/Redo Navigation Feedback（変更箇所の一時ハイライト）
  状態: 未着手・設計方向は決定済み
  内容: Phase118でUndo/Redo後にscrollToChord()が発火するようになったが、
  瞬間移動のため「どこから どこへ 移動したか」が分かりにくいという
  実機フィードバックがあった（Phase118実機検証）。smooth scroll復活は
  不採用（Phase106の[RENDER CONTEXT INVARIANT]発見の原因となった
  scrollTop競合を再発させるリスクがあるため。scrollToChord()はSection
  Navigationとも共有している）。第一候補案: scrollToChord()自体は変更せず、
  移動後の対象chordを300〜500ms程度の一時ハイライト（pulse等）で強調し
  フェードアウトさせる、独立したNavigation Feedback Decoratorとして
  実装する（[DECORATOR ADDITION RULE]に沿う）。

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Undo/Redo後の変更箇所ナビゲーション（Phase118・`computeMutationFocusChordId()`
    新設。Undo/Redo実行前後のbuffer比較のみからNavigation対象を導出する
    Mutation Region方式を採用。History snapshotの形状は無変更。Section系
    コマンドは自動的に対象外）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 118 | Undo/Redo後の変更箇所ナビゲーション（`computeMutationFocusChordId()`
    新設。swap前後のbufferを`_id`基準で比較し、変更区間の和集合
    （Mutation Region）の中心に最も近いコードへ`scrollToChord()`する方式。
    History snapshot（`{buffer, sections}`）・`scrollToChord()`本体は
    無変更。個別コマンドの知識を持たない汎用diff方式のため、Section系
    コマンドは自動的に対象外となる） | analysisSession.js / app.js |

- Future Candidates: 次候補を更新
  ```
  新規Future: Undo/Redo Navigation Feedback（変更箇所の一時ハイライト。
  設計方向は決定済み・実装未着手）
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
