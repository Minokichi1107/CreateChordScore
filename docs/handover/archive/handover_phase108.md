# 引き継ぎ: Phase108完了 — Section Boundary Reassignment

## 作業状態
- ブランチ: phase108-boundary-reassignment
- 直前作業: Phase107完了（Section Preview UX Polish）

---

## 1. Purpose（目的）

Section境界コード（startChordId / endChordId）が削除された場合、
section-model.md §4.3ケースBの仕様では「隣接コードへ自動付け替える」
ことが定義されていた。しかしPhase100-A実装時点ではこの仕様は意図的に
見送られ（TODO(Phase100-B)として明記済み）、常にケースC（Section自体の
削除）へフォールバックしていた。

Phase98〜107でSection機能がSpecification→Session→UI→Preview→
Persistence→History→Boundary Editor→Navigation→UX Polishまで一巡し、
最後に残った仕様上の欠落がこのケースB未実装だった。Phase108はこの欠落を
解消する。

```
S. Section Specification（仕様固定）        ── Phase98完了
A. Session Layer                            ── Phase100-A完了
   Boundary Reassignment（ケースB）          ← 本フェーズ（Phase108）
B. Section Editor（UI）                     ── Phase101完了
   Section Preview Decorator                ── Phase102・102-B完了
   Section永続化                            ── Phase103完了
   Section History Integration              ── Phase104完了
   Section Navigation                       ── Phase105完了
   Section Boundary Editing UI              ── Phase106完了
   Section Preview UX Polish                ── Phase107完了
```

---

## 2. Scope（今回やったこと）

```
・reconcile()へ第2引数 { chordIdRemap } を追加（省略可能・後方互換）
    ・chordIdRemap: Map<oldChordId, newChordId>
    ・渡された場合、Section.startChordId/endChordIdをremap経由で
      書き換えてから既存のValidation（filter）を実行する
・deleteChordCommand()から、削除した瞬間に判明する
  「削除id → 吸収先id（absorbing._id）」の対応をreconcile()へ渡すよう変更
・[BOUNDARY REMAP AUTHORITY]の確立（設計原則。§5参照）
・単一コードSection（start==end）の挙動を決定
    ・「特殊ケース」として扱わず、start/endを独立にremapする一般ルールの
      自然な帰結として「両方が同じsurvivorへ付け替わる」ことを確認
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・deleteSelectionCommand（複数選択削除）でのケースB対応
    → 複数コードが一度に削除される場合、「境界がどのコードへ付け替わる
      べきか」の仕様自体が固まっていない（例: 選択範囲の前後どちらに
      揃えるか、複数のSectionが同時に影響を受ける場合の扱い等）。
      これは実装ではなく仕様策定の議論が必要なため、Phase108のスコープ
      からは意図的に除外した（ChatGPTレビューで合意済み）。
      現状は従来通りケースC（Section削除）のまま。

・mergeSelectionCommand / pasteSelectionCommand でのケースB対応
    → 上記と同じ理由。将来Compound Mutation対応として一括検討する
      （§7 Remaining Issues参照）。

・Mutation Result共通インターフェースの導入
    → 設計メモとしては価値があるが実装は行わない（§8 Future Design Notes
      参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `reconcile()` 拡張 | 第2引数 `{ chordIdRemap }` を追加（デフォルト`{}`・省略時は従来通りケースCのみ実行） | analysisSession.js |
| `deleteChordCommand()` | `state.buffer.splice()` 直後に `reconcile(state, { chordIdRemap: new Map([[id, absorbing._id]]) })` を追加 | analysisCommands.js |
| コメント追記 | Section Commandsブロック冒頭へ、Phase108の例外（deleteChordCommandのみreconcile()を直接呼ぶ理由）を追記 | analysisCommands.js |

survivor（吸収先）の決定ロジック自体は変更していない。既存の
`_pickAbsorbingNeighbor()`（Phase75由来の隣接吸収ロジック）をそのまま
利用した（§6 Findings参照）。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `deletedId/survivorId`ではなく`chordIdRemap`（Map）を渡す

```
結論:
  reconcile()への追加情報は { deletedId, survivorId } という単一ペアの
  形ではなく、chordIdRemap: Map<oldChordId, newChordId> という
  汎用的な対応表の形で渡す。

理由:
  単一削除では1エントリのMapで済むが、将来の複数選択削除・merge・
  pasteでは「A→B、C→D」のような複数の付け替えが同時に発生しうる。
  単一ペアのAPIはその時点で破綻するため、最初から複数対応可能な形で
  設計しておく（ChatGPTレビュー指摘・採用）。

  reconcile()の内部実装は「remapが1件でも複数件でも同じロジックで
  処理する」（Map.get()による単純な参照）ため、実装コストの増加は
  ほぼゼロだった。
```

### [判断] `[BOUNDARY REMAP AUTHORITY]`を新設する

```
結論:
  reconcile()はbuffer上の隣接関係からSectionの付け替え先を推測しない、
  という制約をNamed Invariantとして明文化する（architecture.md §12へ
  即時反映・Phase105のドキュメント更新ポリシーに従う）。

理由:
  削除直後のbufferだけを見ても、「消えたIDの隣に何があったか」は
  判別できない（bufferは削除後の状態しか持たないため）。この制約は
  実装の都合ではなく、Sectionが時刻を持たない設計（section-model.md §3
  「Sectionが持たないもの」）から導かれる本質的な制約である。

  この原則を明文化しておかないと、将来「bufferを見れば隣接関係くらい
  分かるのでは」という実装が[SECTION SESSION CONSISTENCY INVARIANT]と
  矛盾する形で入り込む可能性がある（ChatGPTレビュー指摘）。
```

### [判断] `start == end`（単一コードSection）を特殊ケースとして扱わない

```
結論:
  「startとendが同じIDを指すSection」を専用の分岐で処理しない。
  startChordId/endChordIdへのremap適用を完全に独立させ、その自然な
  結果として「両方が同じsurvivorへ付け替わる」ことを許容する。

理由:
  「start==endだから特別扱いする」という発想は、実装上は動くが
  設計としては例外条件を1つ増やすことになる。一方、「start/endは
  常に独立にremapされる」という1つのルールだけを持てば、start==end
  ケースは自動的にそのルールに従う（両方が同じremapを参照している
  だけ）。

  section-model.md §4.3の記述も、「単一コードSectionの特殊ケース」を
  明記する形ではなく、「startChordId/endChordIdへのremapはそれぞれ
  独立に適用される。両方が同じ削除idを参照している場合、結果として
  両方が同じsurvivorへ付け替わる」という一般化した表現へ更新する
  （ChatGPTレビュー指摘・採用）。
```

### [判断] survivor決定ロジックには一切手を加えない

```
結論:
  既存の `_pickAbsorbingNeighbor()`（Phase75由来）をそのまま利用する。
  survivor決定を独立したResult型として切り出す変更は行わない。

理由:
  実コード確認の結果、survivor決定は既にdeleteChordCommand内の独立した
  ローカル呼び出し（_pickAbsorbingNeighbor()）として分離されており、
  Command本体はその結果を使うだけの構造になっていた。「Command本体に
  決定ロジックを持たせない」というレビュー時の懸念は、実装変更なしで
  既に満たされていることが実コード確認で判明した（§6 Findings参照）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### survivor決定は実装変更なしで既に分離されていた

設計レビュー時点では「survivor決定をCommand本体から切り出すべきか」が
論点になっていたが、実コード確認の結果、`_pickAbsorbingNeighbor()`という
独立関数が既にPhase75から存在しており、`deleteChordCommand()`は
その戻り値を使うだけの構造だった。追加の切り出し作業は不要だった。

### History統合（Phase104）が無改修で今回の要件を満たした

`pushHistory()`はbuffer変更（`splice()`）より前に呼ばれており、
`{ buffer, sections }`を1組でスナップショットする（Phase104で確立済み）。
そのため`reconcile()`呼び出しをbuffer変更の直後（同一関数内）に置くだけで、
「Undoでbufferとsections両方が同時に削除前へ戻る」という1トランザクション性が
自動的に満たされた。Historyまわりのコードは一切変更していない。

### `getSections()`経由の既存呼び出しへの影響がないことを確認

`reconcile(session, options = {})`とし`chordIdRemap`をデフォルト`undefined`に
することで、`getSections()`からの既存の無引数呼び出し（render時等、
プロジェクト全体で複数箇所）は完全に従来通りの動作（ケースCのみ）を維持する。
冪等性（[INVARIANT]）も保たれる。

---

## 7. Remaining Issues（残課題）

```
P1  Compound Mutation対応（新規・Phase108で発見）
    複数選択削除（deleteSelectionCommand）・mergeSelectionCommand・
    pasteSelectionCommand経由でSection境界が削除された場合、現状は
    引き続きケースC（Section削除）のまま。仕様策定（複数Sectionが
    同時に影響を受ける場合の扱い等）が必要なため、実装より前に
    設計議論が要る。chordIdRemapは複数エントリに対応済みのAPIのため、
    reconcile()自体の変更は不要な見込み（§8 Future Design Notes参照）。

P2  Section UX Epic（Phase106より継続）
    Section機能をAnalysis Editor専用から全モード共通の楽曲構造レイヤーへ
    発展させる構想。current-issues.md参照。

（Phase93より継続）Boundary Handle Dragのpointercancel経路が未検証
  状態: 未対応（Section作業とは無関係の既存の積み残し。継続保持）
```

---

## 8. Future Design Notes（設計メモ・実装課題ではない）

```
将来、複数選択削除・Merge・Paste等の複合Mutationを統一的に扱う場合、
Mutation Result共通インターフェース（例: { buffer, chordIdRemap,
deletedIds, createdIds }）の導入を検討する。

現在のResult Protocol（{ ok, reason?, selectedChordIds?, count? }）に
chordIdRemapを組み込めば、delete/merge/paste/splitのいずれもSection側の
reconcile()へ同じ形で情報を渡せるようになる。

これは今すぐ実装する話ではなく、Phase108の設計レビューで得られた
知見として記録するのみ（ChatGPTレビュー指摘）。current-issues.mdへは
書かず、次にCompound Mutation対応（P1・上記）へ着手する際の設計の
出発点として本handoverに残す。
```

---

## 9. Next Phase（次フェーズ開始位置）

```
Phase108でSection Data Layer（基盤機能）はPhase98〜108を通じて
実用レベルで完結した。次の候補（優先順位は次回セッション開始時に相談）:

  ・5フェーズ棚卸し（Phase104〜108・本handoverと同時に着手）
  ・Section UX Epic（P1〜P8・current-issues.md参照）
  ・Theme Audit（Decorator棚卸し）
  ・Pickup Measure実曲検証
  ・Compound Mutation対応（P1・上記§7参照。仕様策定から）
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・reconcile(session, options)
      第2引数 { chordIdRemap } を追加（デフォルト{}）
      chordIdRemapが渡された場合のみ、Section.startChordId/endChordIdを
      remap経由で書き換えてから既存のvalidateSectionInvariants()による
      filterを実行する
      理由: Phase108本体（§4・§5参照）
      TODO(Phase100-B)コメントを削除し、実装済みの説明へ置き換え

js/analysisCommands.js
  ・import文
      reconcileを追加
  ・deleteChordCommand()
      state.buffer.splice(idx, 1) の直後に
      reconcile(state, { chordIdRemap: new Map([[id, absorbing._id]]) })
      を追加
      理由: Phase108本体（§4・§5参照）
  ・Section Commandsブロック冒頭コメント
      Phase108の例外（deleteChordCommandのみreconcile()を直接呼ぶ理由）
      を追記
      理由: 既存の「Command Layerはreconcile()を呼ばない」という
      invariantとの整合性を将来の読者に示すため

node --check 両ファイル通過・CRLF全行維持確認済み。
実機確認済み（単一コードSection境界削除・複数コードSection開始/終了境界
削除・Section内部削除・Undo・複数選択削除での回帰なし、いずれも確認済み）。
```

---

## 11. Micro Log

- 当初「survivor決定をCommand Layerから切り出すべきか」がChatGPTレビューの
  論点だったが、実コード確認で`_pickAbsorbingNeighbor()`が既に独立関数と
  して存在することが判明し、追加の切り出し作業なしで要件を満たせることが
  分かった
- `boundaryRemap`という命名案から`chordIdRemap`への変更はChatGPTレビュー
  指摘。Section固有の概念（boundary）ではなく、より抽象度の高い概念
  （chord IDの再マッピング）を表す名前にすることで、将来のmerge/paste/
  importでの再利用を見込んだ
- start==endケースは当初「特殊ケースとしてどう扱うか」という問いだったが、
  「start/endを独立にremapする」という1ルールだけで自動的に解決される
  ことがレビューの過程で分かった。仕様書の記述も特殊ケース列挙ではなく
  一般化した表現へ更新する

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue:
  - P2 Boundary reassignment（Section Data Layer残課題。単一削除は
    Phase108で解消。複数選択削除等は新Issue「Compound Mutation対応」へ
    再定義して継続）
  - P3 Section Selection State（Phase105で実装済みだったが未反映のまま
    残っていたもの。今回の棚卸しで解消）
  - P4 チップ本体クリック時の挙動拡張（Phase105-107で実質的に解消済み
    だったが未反映のまま残っていたもの。今回の棚卸しで解消）
- 今回新規に積み残したissue:
  - Compound Mutation対応（複数選択削除／Merge／Paste時のSection境界
    付け替え。§7 P1参照）

詳細な反映差分は `docs-updates-phase108.md` を参照。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
