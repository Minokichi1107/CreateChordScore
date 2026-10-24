# 引き継ぎ: Phase148 — Issue #116 Chart Modeコード編集モーダル簡素化・ドラッグ移動

作成日: 2026-10-24  
状態: PR #175 / #176 は `main` へマージ済み。Issue #116 はコードパレット全体の再設計が未完了のためOpenを維持する。

## 最重要（次のChatへ）

- PR #175: https://github.com/Minokichi1107/CreateChordScore/pull/175
  - マージコミット: `20c4927`
- PR #176: https://github.com/Minokichi1107/CreateChordScore/pull/176
  - 実装コミット: `6b3b38311efb53319a766fa27fd0a46c747b4e15`
  - マージコミット: `e8cffa08b33e31b8b910d1da9eef09b798df7166`
- CI（継続的インテグレーション）: PR #176の `JavaScript syntax check` は成功（run #109）。
  - これは構文チェックworkflowの成功を示す。すべてのテストや実機環境をCIで保証したという意味ではない。
- Issue #116: https://github.com/Minokichi1107/CreateChordScore/issues/116
  - 既存コード編集モーダルのProduct Intent（製品意図）はPhase148で対応済み。
  - コードパレット全体の再設計は未完了のためOpenのまま。Issueの状態変更は行っていない。

## 目的と完了内容

Chart Modeで選択済みの既存コードを編集するモーダルを簡素化し、タイトルバーをドラッグして移動できるようにする。

- [x] 既存コード1件だけを編集する簡素なモーダルに整理。
- [x] 直接入力とコードビルダーをトグルで排他表示。選択は `localStorage` の `cs.chordEditInputMode` に保存し、曲データやUndo履歴には含めない。
- [x] 両入力方式にN.C.ボタンを設置し、Enter／完了／N.C.を共通の反映経路へ統合。
- [x] ビルダーの2桁数値入力ではRoot → Type → Bassへ自動進行。入力途中のEnterは部分入力を破棄して送信しない。
- [x] Enterのイベント伝播を抑止し、アプリ側にもモーダル再オープン防止を追加。
- [x] IME変換中のEnterを送信扱いにしない保護を実装。
- [x] キャンセル／Esc／×／背景クリックは確認なしで閉じ、編集中のドラフトを破棄する。確定した編集はUndo 1回分。
- [x] タイトルバーからドラッグ移動。画面内に制約し、resize時に位置を補正。開くたび中央配置し、位置は保存しない。入力欄やボタンからはドラッグを開始しない。
- [x] タイトルを「コード編集」に統一し、幅を480px（小画面では `100vw - 24px`）に設定。

## 主な変更ファイル

- `js/chartChordEditModal.js`
- `js/chordModalDrag.js`（新規）
- `js/chordBuilderKeyboard.js`
- `js/app.js`
- `js/chordEntry.js`（`isChordLikeInput` をexport）
- `css/modal.css`
- `scripts/test-phase148-*.mjs`（Phase148テスト3本）

## 検証結果

- 既存テスト7本が成功。
- Phase148 UIテスト11グループ、キーボードテスト30グループが成功。
- 構文チェックと `git diff --check` が成功。
- Mutation test（意図的に欠陥を入れてテストの検出力を確認する試験）で、仕込んだ不具合を検出。
- 独立レビューのHeadless Chromium検証では、ドラッグ／Enter／キャンセルの32ケースが成功。
- ユーザーがWindows環境で日本語IMEを手動確認し、依頼範囲内で問題がないことを確認。
- Claudeのマージ前レビュー結論は条件付き承認・マージ可能。

## 未確認・残課題

- **実機タッチ操作:** Phase148のクローズ条件から切り離し、GitHub Issue #177「タッチ操作の受け入れテストリストを整備する」に集約。Issue #177では、未検証項目を合格扱いせず、実機確認を含むテスト計画を整備する。現時点で実機タッチ操作は未確認。
- **非Windows環境のIME:** 未確認。
- **独立したヘッダー幅超過:** viewport幅400pxでヘッダーの `scrollWidth` が406pxとなる。mainでも再現し、Phase148のモーダル変更が原因ではない。関連候補は `.header-right`、`.menu-group`、`.menu-trigger`、`#tap-btn`。Issue化は未決定で、`current-issues.md` に未登録課題として記録した。
- **軽微なレビュー指摘:** `js/chartChordEditModal.js` に旧UI（チップ／「決定」ボタン）を説明する古いコメントが残る。共有タイトル要素のドラッグlistenerはモーダルを通常経路以外で閉じた場合に残り得るが、enabled guard・次回attach時のcleanup・transform resetにより実害は抑制されている。
- Issue #116全体のコードパレット再設計はPhase148の対象外。

## 次に行うこと

- [x] Phase147〜148のDeferred DocumentationをPhase番号順に適用。
- [x] `phase-status.md` にPhase147 / Phase148の完了記録を追加。
- [x] `current-issues.md` にIssue #170と、400px幅ヘッダー超過の未登録課題を反映。
- [x] タッチ操作の未確認事項をIssue #177へ切り出し、Phase148のクローズ条件から分離する。
- [x] 400px幅ヘッダー超過は、どのUI上の不具合を意味するか未特定のため、現段階ではIssue化しない。現象の説明が不足している未トリアージ観測として記録を維持する。
- [ ] 次のPhase / Product Intentを別途選ぶ。

## Documentation Checkpoint（ドキュメント棚卸し）適用記録

### current-issues.md
- Phase147: Issue #170を意図的保留として追加。Issue #167は完了済みのため未解決課題一覧には残さない。
- Phase148: 400px幅ヘッダー超過を、具体的なユーザー影響・不具合箇所が未特定の観測として記録。Issue化は保留。
- タッチ操作の実機確認・受け入れテスト整備はIssue #177へ切り出し、Phase148では未確認事項として明記する。

### phase-status.md
- Phase147とPhase148を完了済みリスト・Chart Modeの履歴へ追加。
- PR #176のマージコミットとCIの構文チェック結果を記録。
- Current Workを2026-10-24のCheckpoint完了状態へ更新。

## 次フェーズ候補

- Issue #116のコードパレット全体の再設計を続ける。
- 400px幅ヘッダー超過の具体的な不具合箇所・ユーザー影響を特定できた場合に、Issue化を再検討する。
- タッチ操作の受け入れテストリスト整備はIssue #177で進める。
- 次のPhase / Product Intentは次のChatで別途選定する。
