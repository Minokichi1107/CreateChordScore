# 引き継ぎ: Phase127-D'完了 — Provenance Tooltip機構の刷新

## 作業状態
- ブランチ: phase127-provenance-status
- 直前作業: Phase127-D完了

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| 表示ON/OFF設定 | 「編集状況を表示」トグルを表示メニューへ追加 | index.html / app.js / components.css |
| textTooltip.js新設 | 1行テキスト専用の独立ephemeral tooltipモジュール | textTooltip.js（新規） |
| Library/Chart Mode接続 | hover委譲・タップ表示（既存の外クリックパターン踏襲） | app.js / chartmode.js |
| title属性削除 | textTooltip.js動作確認後、ネイティブtitleを撤去 | app.js |
| 文言見直し | 開発者向け文言→ユーザー向け簡潔表現へ変更 | app.js |

## 設計判断

### [textTooltip.js Ownership]（ChatGPT Review反映・明文化）

```
責務:
  1行テキストの一時表示のみ

保持しないもの:
  ・Provenance data / Project state / Chart state / UI preference

Domain knowledge: なし
Authority: なし（Phase67 chart-diag-tooltipと同じEphemeral UI原則を踏襲）
```

「共通化 vs 完全重複」の二択ではなく、単一責務を持つ独立サブシステムとして
切り出す第3の設計判断（modals.jsの依存注入パターンを前例とする）。

### 経緯（Technical Design B が2周した理由）

```
1周目: 「Chart Modeは既存Phase67 tooltipを拡張、Libraryは完全新規実装」
       → ChatGPT Review: Review Candidate
       （module ownership判断を早々に二択で確定するのは早いと指摘）

2周目: modals.jsの依存注入パターンを前例に、textTooltip.jsという
       独立モジュール（第3案）を再設計 → APPROVE
```

## 確定した設計原則

新規Named Invariantの追加・変更なし。既存の`[DECORATOR ADDITION RULE]`における
「UIサブシステム側に正本の判断を持たせない（正本の導出はapp.js側が担い、描画側は
渡された値を使うだけ）」という責務分離の考え方を、`showTextTooltip`/
`hideTextTooltip`注入にも適用した。ただしtextTooltip.js自体はDecoratorそのもの
ではなく、Ephemeral UI infrastructure（設計思想の転用先）である点は区別する。

## 実機確認

```
□ Library一覧の●hover → 安定表示                          → OK
□ Chart Modeヘッダーの●hover → 安定表示                    → OK
□ Chart Mode終了時にtooltipが残留しない                     → OK
□ 文言が新表現に統一されている                              → OK
□ 表示ON/OFFトグルとの組み合わせ                            → OK
□ 3テーマでの見た目                                        → OK
□ title属性削除後、ブラウザ標準tooltipとの二重表示なし        → OK
  （以前より表示が安定したことを実機で確認）
```

### 検証状態：tap挙動（未検証）

```
検証状態: 未検証
PC環境でhover動作は確認済み
tap → 表示 → 外部tap → 非表示は未実機検証
実装は既存の外クリック閉じパターン（Section▼メニュー等）を踏襲

「ロジックはリスクが低い」という評価と「動作を実機確認した」という事実は
混同しない（未検証は未検証のまま記録する）。
```

## current-issues.mdへの反映（本handoverで直接反映・完了）

> [運用メモ] 本フェーズはDeferred Documentation運用の最後の記録として
> 作成する。current-issues.mdへは棚卸しを待たず、本handover作成と同時に
> 直接反映済み（新プロセス移行の境界を明確にするため）。この直接反映運用を
> 正式ルールとするかは、Phase127完了時のプロセス振り返りで確定する
> （本handover時点では試行であり確定事項ではない）。

- CLOSE: 該当なし（native title不安定問題は正式issue化される前に発見・解消したため）
- ADD: Provenance tooltip（textTooltip.js）のtap挙動が実機未検証
- ADD: Chart コード図メニューの✔初期同期漏れ（潜在的不整合・実害未確認）
- ADD: Library一覧の長い曲名ellipsis位置の固定要望

## 開発プロセス改善（Phase127並行議論・参考記録）

Phase127-D'の実施と並行して、Claude/ChatGPT/たかっちさんの3者で開発プロセス
簡素化を議論した。要点のみ記録する（正式なREADME反映は別途）。

```
新プロセス（合意形成済み・README正式反映待ち）:

Intent → Design（必要なら簡易モック含む） → Risk Check → Implementation
→ Verify → Record

Risk Check 3項目:
  ① Product Intent / UXに不確実性があるか
  ② Authority / Responsibility / Named Invariantを変更するか
  ③ 実装前にユーザーが見る画面・挙動について未確定な点があるか
  → いずれかYesならChatGPT Review、全てNoならそのまま実装
  → 判定はClaudeが一次判定、たかっちさんが必要なら修正

  [Phase127-D' handover監査で修正済み] 当初案「③ 合意できているか」は
  論理が逆転していた誤記（合意できている＝Yes＝Reviewとなってしまう）。
  「未確定な点があるか」へ訂正した。

Record一本化:
  micro-log→handover→Deferred Documentation→Checkpointの4段階を
  「フェーズ完了時に1ファイル書く」＋「current-issues.mdへその場で
  直接反映」の2段階へ統合する方針（Named Invariant変更時のarchitecture.md
  即時反映ルールは維持）。

本handoverはこの新運用への移行第一号として、Deferred Documentation
中間バッファを使わずcurrent-issues.mdへ直接反映した。
```

## 次フェーズ候補

- Phase127-E（Provenance Popover・見積もり: 中〜大規模）
- Phase127-F（既存データの状態補完・見積もり: 小〜中規模）
- 開発プロセス簡素化のREADME正式反映（別途）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
