# 引き継ぎ: Phase126完了 — 演奏モード「復帰」プルダウンのUI改善（GitHub Issue #86）

## 作業状態
- ブランチ: phase126
- 直前作業: Phase125完了（ブルーテーマ演奏モード閉じるボタン視認性修正）

---

## 1. Purpose（目的）

GitHub Issue #86（演奏モード「復帰」プルダウンのデザイン不調和）の解消。
当初は`#perform-scroll-grace`の見た目修正のみを想定していたが、設計討議の
結果、「頻度の低い設定を常時表示ボタン列に置くべきか」という指摘（たかっち
さん）を起点に、UI構造の見直し（通常モードの表示メニューへの設定集約）ま
で発展した。

---

## 2. Scope（今回やったこと）

- `#perform-scroll-grace`（復帰プルダウン）を演奏モードヘッダーから、通常
  モードの表示メニュー（`#menu-view`）へ移設
- ラベル文言を「復帰」から「手動スクロール後、演奏位置に戻るまで」へ再設計
- 「演奏モード」であることを示すバッジを追加（設定の所属を明示）
- tooltipで動作説明を補足
- ドロップダウン内でselectを正常に操作できるようJSを修正（既存の「クリック
  で即closeAllMenus()」との衝突を解消）
- 3テーマ（default/silver/blue）での視認性確認・修正

---

## 3. Out of Scope（今回はやらないと決めたこと）

- 演奏モード自動追従復帰タイマーの遅延現象そのものの調査・修正（実機確認
  中に新規発見。仮説の域を出ないため別issueとして分離）
- GitHub Issue #87（Debug Reportボタンの配置整理・今回新規登録）
- Theme Token Pair Contrast Checkerの実装（Phase125から継続保留）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| select移設 | 演奏モードヘッダーから表示メニュー（`#menu-view`）へ移動 | index.html |
| ラベル変更 | 「復帰」→「手動スクロール後、演奏位置に戻るまで」+ 演奏モードバッジ + tooltip | index.html |
| `.dd-item--select`新設 | ドロップダウン内にselectを配置するレイアウトパターン | css/layout.css |
| `.perform-mode-badge`新設 | 演奏モード専用設定であることを示すラベル（`--text-secondary`使用） | css/layout.css |
| select誤クローズ修正 | clickを`stopPropagation`、change時にメニューを閉じる | js/app.js |

（`css/perform.css`は実装過程で一時的にselect用ルールを追加したが、最終的
に表示メニューへ移設したことで撤去し、差分ゼロ＝元の状態に復帰した）

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] selectの配置場所

```
結論: 演奏モードヘッダーの常時表示から、通常モードの表示メニューへ移設

理由: 「頻繁に変更しない設定を常時表示ボタン列に置くべきか」という指摘が
妥当だった。既存の表示メニューには「別モードの動作設定をメインヘッダーか
ら配置する」前例（Chart コード図トグル）が既にあり、この構造に揃えること
で一貫性のあるUIになった。
```

### [判断] ラベル文言

```
結論: 「手動スクロール後、演奏位置に戻るまで」

理由: 「復帰」という内部用語は初見ユーザーに意味が伝わらない。ChatGPTとの
討議を経て、ユーザーの行動起点（①スクロールする→②待つ→③演奏位置に戻る）
で表現するのが直感的と判断した。ラベル＝何を設定するものか、tooltip＝どう
いう動作になるのか、で役割分担した。
```

### [判断] 演奏モードバッジの色

```
結論: 新規token追加を避け、既存の--text-secondaryを採用

理由: 当初--text-perform-title（演奏モード専用色）を検討したが、これは演
奏モードの暗いヘッダー背景専用に設計された色であり、明背景（ドロップダウ
ン内）に持ち込むとsilverテーマでコントラストが崩壊した（Phase125の
--surface-btn-close/--text-secondary問題と同種の破綻パターン）。

既存token精査の結果、「演奏モードを示す」意味論を保ちつつ明背景で機能する
tokenは存在しないと判明した。--text-perform-*系は全て暗背景専用設計、
--text-accent系は汎用強調色で意味が異なる、--color-redは既にCAPO表示専用
の意味を持つ、--grad-perform-headerはテーマごとに色相がバラバラ、といず
れも不適格だった。

ただし、バッジの目的（「演奏モードの設定だと分かる」）はテキストラベル
「演奏モード」自体で既に満たされており、色による意味付けは必須要件ではな
いと判断。視認性を最優先し、3テーマとも「明るい面の上で読める」設計済みの
--text-secondaryを採用した。
```

### [判断] Component alias汎用化の是非

```
結論: .perform-mode-badgeは汎用化せず、performプレフィックスで所有を明示

理由: 現時点で用途が演奏モード設定のみで、他モードへの転用予定がない。
ui-rules.mdのComponent token許容条件（複数箇所で参照される場合のみ許可）
と同じ考え方で、実際に複数箇所で必要になった時点で一般化する方針とした
（先回りの抽象化を避ける）。
```

### [判断] ドロップダウン内selectの誤クローズ対応

```
結論: select自体のclickイベントをstopPropagationし、change時に明示的に
メニューを閉じる

理由: 既存の「.dropdown内クリックで一律closeAllMenus()」（Phase29）は、
全項目がボタン（1クリック即確定）という前提で作られていた。selectは値確
定までに複数の操作ステップ（開く→選ぶ）を要するため、同じ挙動では機能し
ない。他の.dd-item（ボタン）の挙動は無変更のまま、selectのみ例外的に扱う
設計とした。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- 表示メニュー（`#menu-view`）は既に「別モードの動作設定をメインヘッダー
  から配置する」前例（Chart コード図トグル）を持っており、Issue #86の対
  応をこの構造に合わせることで一貫性のあるUIになった。
- `.dropdown`内の全項目はこれまでbutton要素のみで構成されており、select
  等のフォーム部品を配置する前例がなかった。今回`.dd-item--select`として
  新パターンを確立した。
- 演奏モード関連の色トークン（`--text-perform-*`）は、いずれも演奏モード
  の暗いヘッダー背景専用に設計されており、明背景での使用を想定していない
  ことが判明した。この制約はPhase125の発見（`--surface-btn-close`/
  `--text-secondary`問題）と同種のパターンであり、「Componentごとに使用
  コンテキスト（暗背景/明背景）を意識したtoken設計が必要」という教訓を再
  確認した。
- 実機確認中、「手動スクロール後、自動追従の再開が設定秒数より遅く感じ
  る」という新規の観察報告があった。`js/perform.js`（Phase94 B4由来）の
  コード調査の結果、`_manualScrollSuspendUntil`は`scroll`イベントが発火
  するたびに「`Date.now() + 設定秒数`」へ再起算される仕組みになっており、
  慣性スクロールが継続している間はタイマーが延長され続ける可能性があると
  判明した。ただし実際にどの程度`scroll`イベントが継続するかは未検証であ
  り、仮説の域を出ない。Phase126では`js/perform.js`を一切変更していない
  ため、今回の変更が原因ではないことは確認済み。

---

## 7. Remaining Issues（残課題）

- 演奏モード自動追従復帰タイマーの遅延現象（仮説: `scroll`イベント再起算
  による延長。未検証・次回発生時に実機計測が必要）
- GitHub Issue #87（Debug Reportボタンの配置整理・下記参照）

---

## 8. Next Phase（次フェーズ開始位置）

次点候補は優先順位を定めていない。以下から選定：

- スクロール復帰タイマー遅延の実機調査（`js/perform.js`の`scroll`イベン
  ト発生パターンを計測してから対応を検討）
- GitHub Issue #87（Debug Reportボタンの配置整理。Tools/Editメニュー配下
  への移動候補。着手時に既存メニューの情報階層を確認して配置先を決定）

---

## 9. Files Changed（変更ファイル一覧）

```
index.html
  ・演奏モードヘッダーから「復帰」select一式を削除
  ・#menu-view（表示メニュー）末尾に演奏モード設定行を追加
    （バッジ + ラベル + tooltip + select）
    理由: 頻度の低い設定を常時表示ボタン列から分離し、既存の「別モード設
    定をメインヘッダーに集約する」パターンに揃えるため

css/layout.css
  ・.dd-item--select / .dd-item--select select 新設
    理由: ドロップダウン内にselectを配置する初のパターンを確立するため
  ・.perform-mode-badge 新設
    理由: 表示メニュー内の項目が演奏モード専用設定であることを示すため

js/app.js
  ・#perform-scroll-graceのclickイベントにstopPropagation追加
  ・change時に.menu-group.openを明示的に閉じる処理を追加
    理由: 既存の「.dropdown内クリックで一律closeAllMenus()」（Phase29）
    はボタン専用の前提で作られており、select操作と衝突していたため

css/perform.css
  ・変更なし（実装過程で追加したselect専用ルールを、最終的に表示メニュー
    へ移設したことで撤去し、元の状態に復帰した）
```

---

## 10. Micro Log

（フェーズ完了につき本文へ整理済み。本セクションは削除）

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue:
  - 演奏モード「復帰」プルダウンのデザイン不調和（GitHub Issue #86。
    Phase125で発見・Phase126で解消。詳細は上記参照）
- 今回新規に積み残したissue:
  - 演奏モード自動追従復帰タイマーの遅延現象（未検証・新規発見）
  - GitHub Issue #87（Debug Reportボタンの配置整理・新規登録）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- 演奏モード「復帰」プルダウンのデザイン不調和（GitHub Issue #86）
  （Phase125で発見・Phase126で解消。単なる見た目修正に留まらず、UI構造の
  見直し（表示メニューへの移設）・ラベル文言の再設計・演奏モードバッジ追
  加・selectのドロップダウン内操作対応まで実施。詳細は上記参照）

#### ADD
- 見出し: 演奏モード自動追従復帰タイマーの遅延現象（未検証）
  状態: 観察中（Phase126で新規発見）
  内容: 手動スクロール後、自動追従の再開が設定秒数より遅く感じられる場合
  がある。js/perform.jsの`_manualScrollSuspendUntil`は、scrollイベントが
  発火するたびに「Date.now() + 設定秒数」へ再起算される仕組みのため、慣
  性スクロールが継続している間はタイマーが延長され続ける可能性がある（仮
  説・未検証）。次回発生時に実機でscrollイベントの発生パターンを計測して
  から対応を検討する。

- 見出し: 通常モードヘッダーのDebug Reportボタン配置見直し（GitHub Issue #87）
  状態: 未対応
  内容: 通常モードのヘッダーメニューでDebug Report専用ボタンが1枠を占有
  している。Debug Reportは主にデバッグ・検証時に使用するため、通常利用時
  のヘッダーから独立ボタンを外し、既存のToolsまたはEditメニュー配下へ整
  理する候補。着手時に既存メニューの情報階層を確認し、配置先を決定する。
  Debug Session Recorder / Diagnostic Timelineの内部仕様は変更対象外。

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ 演奏モード「復帰」プルダウンのUI改善（Phase126・GitHub Issue #86解
    消。単純な見た目修正から、討議を経て表示メニューへの設定移設・ラベル
    文言再設計・演奏モードバッジ追加・ドロップダウン内select操作対応まで
    発展。--text-secondaryの流用により新規token追加なしで3テーマの視認
    性を確保）

- Major Milestones（Perform Mode関連。新規テーブル行として追加候補）:
  | 126 | 演奏モード「復帰」プルダウンのUI改善（GitHub Issue #86。
    `#perform-scroll-grace`を演奏モードヘッダーから通常モードの表示メ
    ニューへ移設。ラベルを「手動スクロール後、演奏位置に戻るまで」に変更
    し演奏モードバッジ・tooltipを付与。`.dd-item--select`新設によりド
    ロップダウン内でのselect配置パターンを確立。既存の「.dropdown内クリ
    ックで一律closeAllMenus()」（Phase29）とselect操作の衝突を解消） |
    index.html / css/layout.css / js/app.js |

- Future Candidates: 以下を追加
  - 演奏モード自動追従復帰タイマーの遅延現象調査（Phase126で新規発見・
    未検証）
  - GitHub Issue #87（Debug Reportボタンの配置整理）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
