# Section自動生成 MVP — 実装メモ

状態: 実装済み（初版）。仕様の経緯は Claude プロジェクトの `claude/section-auto-mvp-*.md` を参照。

## 動作

1. Section編集バーの「✨ 自動生成」（Sectionが0件の曲のみ有効）を押す。
2. ディスク上のデータで適格性を確認する（既存の `evaluateSectionGenerationEligibility()`）。
3. 境界候補を生成し、確認画面を開く。**確認画面を閉じるまで曲のデータは変わらない。**
4. 「採用」で、編集状態・ディスク・コード列を再検証し、`applyGeneratedSectionsCommand()` で1操作として適用する（Undo 1回で戻る）。
5. 永続化は既存の保存（`saveAnalysisEdit()`）。新しい保存経路・保存APIは追加していない。

## ファイル

| ファイル | 役割 |
|---|---|
| `js/sectionBoundaryDetection.js` | 境界候補の検出（純粋関数）。Python試作の移植。`SECTION_BOUNDARY_ALGORITHM_VERSION` |
| `js/sectionAutoGeneration.js` | 小節→コードID変換、Section集合の検証、下書き→Section変換（純粋関数） |
| `js/sectionAutoGenerationModal.js` | 確認画面（UIのみ。`openModal`/`mkMBtn` は注入） |
| `js/app.js` | ボタン、適格性確認、採用時の再検証と適用（接続のみ） |
| `scripts/test-section-auto-generation.mjs` | 単体テスト |

## 小節→コードIDの規則

- 小節位置は0始まりの小節番号（画面表示は1始まり）。コードの小節は `model.quantize(chord.start).measure`（チャート表示と同じ）。
- 最初のSectionは必ず `buffer[0]` から始まる。
- 境界 `b` の開始コード = 小節が `b` 以降で最初の、名前のあるコード。`b` 小節にコードが無ければ次のコードに寄せ（`snapped`）、画面に実際の小節を表示する。
- 前のSectionの終端 = 次のSectionの開始コードの1つ前。最後のSectionは `buffer` の最後まで。
- 変換できない境界（後続コードなし／前の境界と同じコードになる／昇順でない／整数でない）は**エラーにして適用しない**。IDを推測して作らない。
- N.C.（`N`）は通常のコード。名前が空のコードはSectionの開始にしない。

## Section集合の検証（生成物専用）

個別の検証は既存 `validateSectionInvariants()`。集合では次を検証する: ID重複なし／type・name が空でない／時系列順／重ならない／隙間がない／先頭が `buffer[0]`・末尾が最後のコード。
Sectionのデータモデル自体は隙間・重なりを許す（`section-model.md`）。この制約は**自動生成の結果にだけ**課す。

## 採用前の状態変更検知

- 候補生成時に `buffer` のスナップショットを保持し、採用時に `hasSectionGenerationCodeEdits()`（JSON全体の比較）で比較する。コードの追加・削除・名前・時刻の変更を検出する。
- ディスク上の適格性を、開始時と採用直前の2回確認する。
- 限界: 他のタブ・他のプロセスによるディスク変更を、競合として検出する仕組みではない（保存時の競合検出は今回の範囲外）。

## 精度と限界（11曲の評価）

- 区切り位置の一致率（±1小節）: 調整に使った6曲 約0.60〜0.65、初見5曲 約0.27〜0.28。曲ごとの差が大きい（0.00〜0.80）。
- 確認画面の数値（前後4小節の変化など）は事実の表示であり、正解率とは連動していない。確率に見える表示はしない。
- そのため**全曲で確認が必須**。自動適用は未実装。
- 小節の長さが不規則な曲では位置がずれやすい（確認画面に警告を出す。しきい値30%は未検証の目安）。
- 「同じ進行」表示、フィードバック記録、Section名の自動分類は未実装。

## 既知の制約

- `evaluateSectionGenerationEligibility()` は、解析ファイルに `sections` 欄が無い曲を `sections-missing` として拒否する。ChordMini取得直後でまだ保存していない曲は、一度保存して `sections: []` が入るまで自動生成できない。
