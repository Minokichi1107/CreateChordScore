# Phase127 完了スナップショット — Provenance機能一式

> 位置づけ: Phase127（127-A〜127-F・E①〜E②）の完了記録。
> 旧`phase127_snapshot.md`（127-D時点までの進行中ドラフト・
> docs/handover/README.mdの「micro-log」と同じ性質の下書き）を、
> 完了後の総括として清書したもの。
> 各サブフェーズの詳細な設計判断・実機確認結果は、対応する
> `docs/handover/archive/handover_phase127-*.md`を正本とする。
> 本ファイルは「Phase127全体として何を作り、何を守り、何が
> 未解決のまま残ったか」を後から俯瞰するための総括に徹する。

---

## 0. Phase127とは何だったか（1行で）

ライブラリの曲について「chordmini解析そのままか／人間が修正したか／
外部資料と照合済みか」を一目で分かるようにする**Provenance（編集・確認
の来歴）表示機能**一式の実装。データモデル設計から始まり、UI表示、
Tooltip機構の試行錯誤、外部資料確認機能、既存データへの遡及補完
（バックフィル）、詳細確認UI（Popover）まで、Phase127-A〜Fの全工程
を含む。

副産物として、開発プロセス自体の実験（Risk Check導入・Handover
Review最大2ラウンド制の確立）も本Phase内で行われた。

---

## 1. サブフェーズ一覧（実際の時系列）

実装順は名称の連番と必ずしも一致しない。実際にコミットされた順序は
以下の通り（詳細は各handover参照）。

```
127-A  Product Freeze（UI仕様確定）
127-B  Technical Design（データモデル確定）
127-C  自動検出・データ層実装
127-D  ●表示UI実装
127-D' Tooltip機構実装（textTooltip.js新設）
127-F  既存データBackfill・Non-destructive安全化   ← mainへ最初にマージ
127-E① External Check編集UI（右クリック→編集Modal）
127-E② Provenance Popover本体
       （↑この過程でD'のTooltipを廃止・Popoverへ一本化）
```

`127-F`が`127-E①`より先に完了・mainへマージされている点に注意
（連番の順序と実装順は一致しない。各handoverの「作業状態」節に
明記済み）。

---

## 2. 127-A〜127-D（データモデル・基本UI）

### 目的・仕様（127-A・127-B）

```
UI仕様（確定）:
  進捗インジケーター方式。初期は灰●1個、条件を満たすごとに
  固定順（黄→青→緑）で●が追加される。

  ● 灰 = 何も記録なし
  🟡 = hasContentEdit（コード進行・タイミングの手動修正あり）
  🔵 = hasStructureEdit（セクション構成の手動設定・編集あり）
  🟢 = externalCheck.checked（外部資料と照合済み）

表示場所: Library一覧・Chart Modeヘッダーの両方（共有コンポーネント）
```

```javascript
// データモデル（確定）
analysis.raw.provenance = {
  source: 'chordmini',
  hasContentEdit: boolean,      // 一方向フラグ（false→trueのみ）
  hasStructureEdit: boolean,    // Phase127-Fで「現在状態からの導出値」へ意味変更（後述）
  externalCheck: {
    checked: boolean, reference: string, url: string,
    checkedAt: string|null, memo: string,
  },
}

project.provenanceSummary = {   // Library高速表示用の要約（派生データ）
  hasContentEdit, hasStructureEdit, externalCheck: { checked },
}
```

**[PROVENANCE FACT INVARIANT]**（確定・変更なし）: `hasContentEdit` /
`hasStructureEdit`は「Commandがok:trueを返したか」ではなく「実際に
値が変わったか」を記録する。

### 実装（127-C・127-D）

- `normalizeProvenance()`（analysisLoader.js）による既存曲への
  デフォルト値付与
- 各種Command（updateChord/moveBoundary/Section系）への値比較付き
  フラグ更新ロジック
- `renderProvenanceDots()`（app.js）共通ヘルパーによるLibrary/Chart Mode
  共有表示

127-D完了時点で「Tooltipが不安定」という既知の課題が残っていた
（次節参照）。

---

## 3. 127-D'：Tooltip機構 → その後Phase127-E②で廃止（重要な経緯）

### 127-D'時点での実装

ネイティブ`title`属性の信頼性が低かったため、`textTooltip.js`という
独立モジュール（1行テキスト専用のephemeral tooltip・Chart Mode hover
chord diagramと同じ設計原則を踏襲）を新設し、Library/Chart Mode両方の
dotから共有利用できるようにした。

### その後の展開（Phase127-E②で廃止）

Phase127-E②でProvenance Popover（右クリックで詳細情報を一括表示する
UI）を実装した際、以下の理由でこのTooltip機構自体を**廃止**した。

```
[TOOLTIP CONSOLIDATION]（Phase127-E②で確立）

理由: Popoverが🟡🔵🟢すべての状態と詳細を表示する以上、Tooltipの
「1行説明」はPopoverの表示内容に完全に包含される（重複するだけで
独自の価値がない）。加えて、dotをhoverした直後に右クリックすると
Tooltipを閉じる処理がどこにも無く、Tooltip残留とPopoverの座標
重なりが構造的に起こることが判明した。

対応: hover Tooltipのイベント配線（Library/Chart Mode双方）を撤去。
textTooltip.js自体は「1行テキストの汎用tooltip」として設計された
独立サブシステムであり、Provenance専用実装ではないため削除せず
残置した（呼び出し元が無いorphaned module。current-issues.md記録済み）。
```

**教訓として残すべき点**: 127-D'で「良い設計」として導入した機構が、
後続フェーズ（E②）でUXの再検討の結果、丸ごと不要になった。これは
127-D'の設計判断が誤りだったということではなく、**Popoverという
より情報量の多いUIが追加されたことで、Tooltipの存在意義そのものが
なくなった**という展開である。個々のフェーズの判断が正しくても、
後続フェーズの追加によって前提が変わりうることの実例として記録する。

---

## 4. 127-F：既存データBackfillとNon-destructive安全化

正本: `docs/handover/archive/handover_phase127-f.md`

### 設計上の核心：🟡と🔵で遡及判定の可否が非対称

```
🔵 hasStructureEdit（Section）
  → raw.sections.length > 0 という「現在の事実」は確認可能
  → 自動バックフィルは安全に実現できる
  → ただし意味を「Sectionを過去に人間が編集した」ではなく
    「現在Section構造が存在する」に変更した（事実ベース原則。
    存在は証明できるが、誰がいつ作ったかは過去データから
    証明できないため）
  → Structure Syncとして実装。Migration状態とは独立に、
    実行のたびに現在状態との一致を検査する

🟡 hasContentEdit（コード・タイミング）
  → chordmini生出力を保存していないため、どのコードが後から
    修正されたか判定する手段が原理的にない
  → 一度きりのMigration判定として実装（Content Migration。
    contentEditBackfillで状態管理）
```

### [BACKFILL NON-DESTRUCTIVE INVARIANT]（architecture.md §12・正本）

バックフィルは`raw.provenance` / `contentEditBackfill` /
`provenanceSummary`以外のデータを一切変更しない。`baseVersion`による
楽観的並行性制御・conflict時の🟡🔵両方破棄・読み込み失敗時の
再試行、をすべて実装済み。

### 未解決のまま残った事項：Section消失問題

```
発見: 実機テスト中、Section構成を持っていた1曲でSection消失を発見
初期仮説: バックフィルのTOCTOU（同時編集による上書き）が原因 → 撤回
再調査結果:
  ・消失したSectionはバックフィル実行より前から存在していた
  ・同時編集の証拠がない
  ・単発実行でSectionを消す具体的なコードパスが見つからない
  ・再現できない

現在の結論: 原因不明・件数1・再現性なし。これ以上の深追いは
打ち切り、観察継続とする。baseVersionによる並行性制御は
「原因を特定して修正したもの」ではなく、将来のstale overwriteを
防ぐ予防的安全策として位置づける。
```

**この扱いについての明確化**: 「原因を特定して修正していない」ことは、
Phase127全体の完了判定を妨げない。Section消失問題は「未解決の
観察事項」として記録に残すが、Phase127の実装スコープに含まれる
作業自体はすべて完了している。この2つを混同しない。

---

## 5. 127-E①：External Check編集UI

正本: `docs/handover/archive/handover_phase127-e1.md`

`raw.provenance.externalCheck`（🟢）の唯一の書き込み窓口
`writeExternalCheck()`と、編集モーダル`_openExternalCheckModal()`を
新設。Library一覧（行の右クリック）・Chart Modeヘッダー（dotの
右クリック）の両方から編集可能にした。

`checkedAt`はfalse→true遷移時のみ更新し、チェック解除時も
`reference`/`url`/`memo`は保持する設計（「確認情報をクリア」操作での
み全消去）。

---

## 6. 127-E②：Provenance Popover本体

正本: `docs/handover/active/handover_phase127-e2.md`

### 確定した操作導線

```
右クリック → Provenance Popover（一次確認UI・🟡🔵🟢の状態と詳細を一括表示）
              ↓
         「確認情報を編集する」
              ↓
         既存External Check編集Modal（二次編集UI・127-E①で実装済み）
```

Context Menu（「見る／編集」の2択メニュー）を挟む案を検討したが不採用。
Popover自体が既に十分な情報量を持つため、右クリック→Popoverの一本道
とした。Library＝行全体、Chart Mode＝dotグループ限定、という右クリック
の当たり判定の非対称は意図的に維持（操作体系の統一と当たり判定範囲の
統一は別の関心事と整理）。

### 副次的な技術対応

- Popover位置補正の`getBoundingClientRect()`呼び出しが強制同期
  リフローを引き起こしうる問題を、`requestAnimationFrame`で次
  フレームへ遅延させることで予防的に回避（実際に報告された「カクつき」
  の原因ではなく、別の曲を開いた際の非同期取得＝正常挙動だったと
  判明したが、この改善自体は無害なため維持）
- `[TOOLTIP CONSOLIDATION]`の確立（3節参照）

### 残された技術的負債（記録済み・未対応）

```
・textTooltip.jsがorphaned module（呼び出し元なし）
  → Provenance専用実装ではないため削除せず残置

・Naming debt: _setupLibraryContextMenu() / onExternalCheckRequested
  → 実装の意味は変わったが（Context Menu→Popover呼び出し・
    引数なし→座標渡し）、関数名・コールバック名は旧設計時代のまま
  → 機能上の問題はないためリネームせず、将来の整理候補として記録
```

---

## 7. 開発プロセスの実験（Phase127の副産物）

Phase127の途中から、以下のプロセスを試験導入した。

```
Intent → Exploration → Technical Design → Risk Check
  → Implementation → Validation → Review/Handover

Risk Check判定基準: Named Invariant / Authority / Architecture境界 /
  Product Intent・UX / 設計不確実性 のいずれかに該当する場合のみ
  Review Candidateとする。
```

実例として、「Sectionの遡及バックフィルの意味定義」（Structure Syncの
意味を「編集した」ではなく「設定されている」へ修正した判断）が
Review Candidateとして機能した（`phase127-process-review.md`参照）。

さらにPhase127-D'完了後には、ChatGPT/Claude双方がhandoverを独立発行
してクロス監査するという役割交換の試行も行った（`handover_phase127-f.md`
がその実例）。この試行を踏まえ、最終的に以下の運用ルールを確立した。

### [確立] Handover Review 最大2ラウンド制

```
docs/handover/README.mdへ正式反映済み。

Round 1: 監査者が確定を妨げる問題をまとめて指摘する
Round 2: 修正版を最終監査し、PASSまたは重大な未解決問題を判定する

原則として3ラウンド目以降は行わない。軽微な表現・体裁上の指摘は、
確定を妨げない限り無限に往復せず、必要に応じて次回のDocumentation
Checkpointへ回す。

目的: AI同士の無限レビューによる運用コスト・認知負荷を防ぐこと。
```

「ChatGPTとClaudeでhandoverを二重発行する」方式自体は、作成の手間が
増えるため通常運用には採用しないと結論づけた（クロス監査は必要な
場合のみ例外的に実施）。

---

## 8. Phase127完了時点でのファイル配置

```
docs/handover/active/
  handover_phase127-e2.md          ← 唯一のactive（最新完了フェーズ）

docs/handover/archive/
  handover_phase127-D-prime.md
  handover_phase127-e1.md
  handover_phase127-f.md
  phase127-f_snapshot.md（F②完了前の下書き。歴史的記録として残置）
  phase127_snapshot.md（本ファイル。127-D時点の下書きを同一パスの
    まま清書・更新。新旧を別ファイルに分けたわけではない）

docs/current-issues.md
  Issue番号ルール（[ISSUE ID AUTHORITY]）新設・#28訂正・#45/#91
  reopen反映・#103/#104追加・E②由来の技術的負債2件追加・Tooltip
  廃止に伴う陳腐化Issue1件削除

docs/phase-status.md
  Phase125〜127-E②を反映。Provenance機能を独立テーブル
  「Provenance / Data Provenance」として分離

docs/handover/README.md
  Handover Review（最大2ラウンド）ルールを追記済み
```

Phase127-E②のコード変更（Popover本体・Tooltip廃止・rAF対応）は
commit `bef9da6`としてブランチ`phase127-e-provenance-popover`へ
push済み。current-issues.md・phase-status.md・本ファイルの更新は
本チャットセッション内での作業であり、まだリポジトリへcommitして
いない（次のアクションとして反映が必要）。

---

## 9. GitHub Issue台帳の棚卸し（Phase127 closeoutで実施）

Phase127完了処理の一環として、current-issues.md・phase-status.mdの更新
直前にGitHub Issues全件（open 46件・closed 50件）の棚卸しを行った。

### 重大な発見：内部Issue番号とGitHub Issue番号は別の採番体系

current-issues.mdが使う「Issue #26」のような番号は、GitHub Issueの
番号とは独立した内部採番であり、多くは偶然一致していたが**少なくとも
1件、完全な偶然の衝突**が見つかった。

```
内部「Issue #28」（current-issues.md）
  = Decorator視認性優先原則の既存Decoratorへの適用確認

GitHub Issue #28（実際のGitHub上）
  = ウインドウを分割または小さくした時に上部パネルのボタンの
    文字が見切れる問題（既にclosed・全くの別内容）
```

この発見を受け、`[ISSUE ID AUTHORITY]`（今後はGitHub Issue番号を
正式IDとする・既存内部番号は遡及変更せず歴史的記録として維持する）を
current-issues.mdへ確立した。

### 誤クローズの発見・reopen

棚卸しの過程で、以下2件がGitHub上で内容と矛盾した状態でcloseされて
いることが判明し、たかっちさんの判断でreopenした。

```
GitHub Issue #45（Chart Mode小節頭ズレ）
  → 2026-06-24にcompletedとしてclose済みだったが、本文・
    current-issues.md双方でType A/C/D未対応と記載されたまま。
    「現在のIssue管理上は未完了」と判断しreopen。

GitHub Issue #91（Chart Modeのコード進行を通常モードへ挿入）
  → 2026-09-02に作成・本文で「低優先度のバックログ」とされて
    いたにも関わらず同日中にcompletedとしてclose。実装の痕跡
    （コミット・PR）が一切見当たらず、同様にreopen。
```

いずれも「原因を確定した」のではなく「現状の記録と矛盾するため安全側
にreopenした」という扱いであり、Section消失問題（4節）と同じ「事実と
判断を分離する」原則で記録した。

### 新規発見・追加したIssue

```
GitHub Issue #103 — ユーザー向け表記から内部モデルの用語を排除する
  Phase127-E②で個別に直面した課題（「Provenance」を避け「編集・確認の
  状態」という表記へ変更した実例）を、横断的な方針として一般化したもの。

GitHub Issue #104 — Section追加メニューへ日本式の音楽構成プリセットを追加
  イントロ・Aメロ・Bメロ・サビ等、J-POP構成の呼び方をプリセット化する
  将来候補。実装方式は未確定（着手時にTechnical Designで検討）。
```

---

## 10. Phase127完了時点での未解決事項一覧（今後への引き継ぎ）

以下はPhase127の実装完了を妨げるものではないが、将来対応候補として
記録しておく。現在はすべてcurrent-issues.mdへ反映済み（詳細は同ファイル
参照。本表は概要のみ）。

| 項目 | GitHub Issue | 状態 | 優先度 |
|---|---|---|---|
| Chart Mode小節頭ズレ（Type A/C/D未対応） | #45（reopen済み） | 未着手 | 中 |
| Chart Modeのコード進行を通常モードへ挿入 | #91（reopen済み） | 未着手 | 低 |
| Decorator視認性優先原則の適用確認（🟡色問題含む） | 未登録（内部#28のみ） | 検討中 | 低 |
| ユーザー向け表記から内部モデル用語を排除 | #103（新規） | 未対応 | 低 |
| Section追加メニューへ日本式構成プリセット | #104（新規） | 未着手 | 低 |
| Section消失問題（原因未確定） | 未登録 | 観察継続・再現待ち | 中（再発時に調査） |
| textTooltip.jsのorphaned module化 | 未登録 | 削除せず残置 | 低 |
| Naming debt（`_setupLibraryContextMenu()`等） | 未登録 | リネームせず記録のみ | 低 |
| Provenance Popover内容の拡張余地（🟡🔵に理由・日時等のメタデータがない） | 未登録 | 未着手・将来候補 | 低 |

---

## 11. Phase127: COMPLETE

Phase127として計画していた作業（データモデル設計・自動検出・表示UI・
Tooltip機構の試行と統合・External Check編集・既存データBackfill・
Non-destructive安全化・Provenance Popover・開発プロセス改善・
GitHub Issue台帳の棚卸し）はすべて完了した。

### 本ファイルの位置づけ（最終）

本ファイル（`docs/handover/archive/phase127_snapshot.md`）は、127-D
時点までの進行中ドラフトを、Phase127完了を受けて同一ファイル・同一
パスのまま清書・更新したものである（新旧を別ファイル・別配置に
分けたわけではない）。各サブフェーズの一次資料は
`docs/handover/archive/handover_phase127-*.md`・
`docs/handover/active/handover_phase127-e2.md`を正本とする。

次のIntentは、README.md記載のDevelopment Processの方針（Issue先行では
なく、新しい要望・発見事項ベースで選定する）に従い、次回のチャットで
改めて選定する。
