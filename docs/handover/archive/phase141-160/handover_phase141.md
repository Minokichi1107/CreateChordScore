# 引き継ぎ: Phase141完了 — Chart Mode「Section = 曲の地図」（Issue #89 系）

## 最重要（次のChatへ）
- **Phase141は完成済みとして扱う。** 下記の A / B / E / D は Phase141 の未完了項目ではなく、**Phase142 以降で扱う改善候補**である。
- **Phase141 のコードは、Phase142 で設計が固まるまで変更しない。** 基準点はコミット `3afb046`。「先に少し直してから改善を考える」へ戻らないこと。
- 次の開発テーマ（Phase142）はまだ決めていない。候補（§6）を並べ、Product Intent から改めて決める。

## 作業状態
- ブランチ: `feature/phase141-section-markers`（土台は main の `89d708e`）
- コミット: `47d2aa5`（段階1）/ `79a6817`（2a）/ `7064302`（2b）/ `db55534`（3）/ `3afb046`（4）
- GitHub: **push済み**
- PR: **未作成**。main へも **未merge**。
  - 理由: Phase142 で Section 表示の見せ方（A/B/E）を固めたあと、Phase141 と合わせて1つの Section 表示機能として PR にまとめる方が履歴がきれいで、途中の見た目を main に入れずに済むため。
- 設計書: `docs/phase141-technical-design.md`（この handover と同じコミットで追加）

---

## 1. 目的と結果
目的: 歌詞のない Chart Mode で、曲のどこからどこまでが何の Section かを直感的に分かるようにする（Section は「地図」。Chord の意味づけや排他的な区分ではない）。

- [x] 段階1 `buildSectionMarkerProjection()`（Section → 描画指示への変換）
- [x] 段階2 Section Layer（開始線・終了線）の描画
- [x] 段階3 色・Section名・Header段（開始を含む行だけ上に24pxの段）
- [x] 段階4 表示ON/OFF（表示メニュー「Section境界線を表示」、localStorage `cs.sectionMarkers`）
- [x] 段階5 実データの最終確認（コード変更なし）→ **Critical / Major なし。Phase141 完了**
- 保存形式の変更なし・移行なし。Section Model / Authority は変更していない。

## 2. 実装の要点
| 層 | 役割 |
|---|---|
| Authority `analysis.raw.sections` | Section の正本（変更しない） |
| `js/app.js` `buildSectionMarkerProjection(chords, sections)` | 保存済み Section から、位置・色番号・名前の汎用アンカー `{sectionId, chordId, edge, label, colorToken}` を作る |
| `js/app.js` `initChartMode({ getSectionMarkers })` | 描画のたびに関数を呼ぶ（古い値が残らない）。OFF のときは空配列を返す |
| `js/chartmode.js` `_resolveSectionMarkers()` / `_buildSectionLayer()` | アンカーを小節内の % に変換し、行ごとの Layer に線を置く。Section の意味は知らない |
| `css/chart.css` / `css/theme.css` | 線・名前・Header段、`--section-color-0..3`（3テーマ） |

- 閲覧（Continuous）経路のみ。編集中は従来の Section Preview（金色ハイライト）のまま。fallback 表示では出さない。
- 開始位置は小節頭へ丸めない。実際のコード位置に置く。
- 詳細は `docs/phase141-technical-design.md`。

## 3. 確定した表示ルール
- 開始線＋名前（終了線に名前は付けない）
- 隣接（次の開始 = 終了の次のコード）→ 線は1本（次の開始線だけ）
- 隙間 → 終了線＋開始線の2本
- コード共有・重なり → それぞれの実際の位置に2本
- 開始コードが見つからない Section → 何も出さない（補完・推測しない）
- 色は Section の種類ではなく、Chart 上の開始位置順に4色を循環（並べ替え #95 でも色は変わらない）
- 色は現状で確定（dark=標準 / silver=強め / blue=標準）。silver は数値上コントラストが低いが、実画面で見やすいと確認済み

## 4. 最終確認の結果（10曲・104 Section・3テーマ）
- 開始位置: 小節頭79 / 小節途中15 / 最終拍10。小節頭へ丸められていない
- 境界94: 隣接84 / 隙間6 / 重なり4（うち同一コード共有2）。すべて設計どおりの本数・順序
- 線の位置: 1,116本、ずれ最大 0.016px（実アプリ10曲でもずれ 0）
- ON/OFF: 初期ON。OFFで線・名前・Header段が消え、描画はONから該当部分を除いたものと完全一致。再読み込みで保持。`'false'` 以外はすべてON
- 副作用なし: 再生、編集モード、スクロール、JSエラー
- Minor（対応不要）: ON/OFF 切替でスクロール位置の数値は保たれるが、Header段の分だけ表示中の小節が最大約170pxずれて見える

## 5. 実機フィードバック（たかっち、2026-10-06）と整理
**良かった点**: 右に出る名前は見やすい／名前は邪魔にならない／小節途中の開始も自然／ON/OFF・隣接・共有・スクロール・再生は問題なし。

| ID | 内容 | 現在の動作（設計どおり） | 扱い |
|---|---|---|---|
| A | 名前が線の左に出るときは見づらいことがある | 行の右寄り（約6割より右）の開始線では、名前を線の左側に出す | Phase142 候補 |
| B | 線とコードが近すぎて重なって見える箇所がある | 開始線はコードの最初のセグメントの左端に置く | Phase142 候補 |
| E | 隙間（Section に属さない区間）の違いが分からない | 隙間の区間は背景もコードも変えない。手がかりは名前なしの細い終了線だけ（silver は特に見つけにくい） | Phase142 候補 |
| D | Section編集中にも、通常時のような名前（label）を出したい | 編集中は従来の Section Preview のみ。Marker は閲覧専用 | 別UX候補（Section Editing 側） |

### E の目的（重要）
- 目的は、**Section の終了位置と次の開始位置が離れているという事実を、ユーザーが目で確認できるようにすること**。Section 設定の人的ミス（終了・開始の付け間違い）を見つけやすくする。
- 隙間そのものを「エラー」として表示しない。間奏のように意図的な隙間もある。意図かミスかはユーザーが判断する。
- たかっちの考えでは **案2（終了線の位置に、名前なしの小さな印を足す）** が一番よい。仕様は未決定（印の形・大きさ・色、1コード分の隙間で開始線と近い場合の見え方は Phase142 で決める）。
- 案2 は終了線が出る場所（隙間・共有）にだけ印が付く。隣接境界（約9割）の見た目は変わらない。

### 隙間の実例（確認用）
10曲中4曲・6件。いちばん分かりやすいのは「1/6の夢旅人2002」（樋口了一）。
- Chorus（小節51の右端で終了）→ Verse 2（小節56から開始）: コード8個分（小節52〜55）
- Verse 2（小節71の右端で終了）→ Chorus 2（約82から開始）: コード15個分
- 祝福（YOASOBI）2件・夜に駆ける（YOASOBI）1件・怪物（YOASOBI）1件: コード1個分（終了線と開始線が近い）
- 小節番号は夢旅人2002の実画面で確認したもの。他の曲は未確認のため記載しない。

## 6. Phase142 候補（未決定）
- [ ] A / B / E を「Section Marker 周辺の見せ方」として**1つの視覚設計**で決める（名前の配置・線の位置・コードとの最小間隔・隙間の印）
- [ ] D Section編集時の名前表示（別設計）
- [ ] 既存の Issue（#125 / #103 / Section Identity 検討Issue / Section拡張）との優先順位づけ
- 進め方: 視覚デザイン確認 → リスク確認 → 技術設計 → 「実装してください」の指示 → 実装。実装の指示があるまで始めない。

## 7. 積み残し・保留
- [ ] PR（Phase141 + Phase142 をまとめて）と main への merge
- [ ] 隙間の見分け（E）の仕様
- [ ] Header クリックでのスクロール移動（Navigation）は Phase141 では対象外。必要性は未確認
- [ ] 小節頭へのコードチェンジ自動補正は別Issue（Section Model は変更しない）
- [ ] `docs/phase-status.md` / `architecture.md` / `section-model.md` / `current-issues.md` への反映は、README のとおり棚卸し時にまとめて行う（今回は未反映）

## 8. Out of Scope（Phase141）
- Section Model / Authority の変更、Section の補完・推測・並べ替え
- 編集（Slot）経路への Marker 表示
- Header クリックによる Navigation

## 9. 検証スクリプトについて
Playwright の検証スクリプトは作業環境の一時領域にあり、リポジトリには入れていない（Chatを更新すると失われる）。再検証が必要なら、設計書 §10・§12.5 の確認項目から作り直す。

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
