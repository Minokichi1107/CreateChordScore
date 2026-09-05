# Handover 運用ルール

> handoverはフェーズ時点の設計判断・実装経緯・検証結果を記録する履歴であり、
> architecture.mdの代替ではない。Named Invariantの正本はarchitecture.mdとする。

## このディレクトリの役割

各フェーズ完了時の引き継ぎ情報を集約する。
設計判断・積み残し・次フェーズ候補はここに書く。

正式ドキュメント（phase-status.md / architecture.md 等）への
反映は、固定フェーズ数ではなく「意味のある設計変更」「大きな機能の
完了」等をトリガーとした棚卸し時にまとめて行う（詳細は
「ドキュメント棚卸し」セクション参照）。

### ディレクトリ構成（active / archive）

```
docs/handover/
  ├─ active/
  │   └─ handover_phaseXX.md   ← 直前フェーズのhandoverを1件のみ置く
  └─ archive/
      └─ handover_phaseXX.md   ← それ以前のフェーズ（active/から移動済み）
```

新しいフェーズのhandoverを作成したら、`active/`内の旧handoverは
`archive/`へ移動する（`git mv`）。`active/`には常に直前フェーズの
1件のみが置かれる。

---

## なぜこの運用が必要か

本プロジェクトは canonical / projection / authority / ownership /
runtime cache / rebuild responsibility など、
subsystem boundary を伴う設計判断が積み重なっている。

そのため handover は「何を変更したか」の記録ではなく、
「なぜその設計判断を採用したか」を保存するための
continuity document として機能する。

---

## current-issues.md の状態管理（issue open/close）方針

issue の open/close は **handover作成時に記録する**（current-issues.md
自体の更新ではない）。実装中は current-issues.md を触らない。

```
実装中
  └ current-issues.mdは触らない（コード内コメント・micro-logのみでよい）
        ↓
handover作成時
  └ 「今回closeしたissue」「今回新規に積み残したissue」を整理し、
    Deferred Documentationへ ADD / MODIFY / CLOSE として記録する
    （current-issues.md自体はまだ更新しない）
        ↓
Documentation Checkpoint（下記「ドキュメント棚卸し」参照）
  └ 対象handoverのDeferred Documentationを時系列順に適用し、
    current-issues.mdを最新状態へ更新する
```

[ISSUE TRUTH SOURCE INVARIANT]
handoverとcurrent-issues.mdは役割が異なる。

```
handover           … issue状態変更（open→close等）の履歴・確定記録
                      （truth source。「いつ・なぜ変化したか」を
                      保持する）
current-issues.md  … handoverの記録をDocumentation Checkpoint時点で
                      反映した、open issueの運用一覧
                      （projection。truth sourceそのものではなく、
                      最後にCheckpointでmaterializeされた
                      スナップショット）
```

current-issues.mdは「今この瞬間の完全な真実」ではなく、「直近の
Checkpointまでの変化を反映した一覧」である。あるissueがhandoverで
既にCLOSE記録済みでも、次のCheckpointが来るまではcurrent-issues.md
上にまだ残って見えることがある。これは矛盾ではなく、projectionが
truth sourceに追いつくまでのタイムラグとして許容する（正確な
「今のissue状態」を知りたい場合はhandoverの履歴を辿る）。

「実装した記憶はあるがcurrent-issues.mdが古い」というズレは、
issue closeをhandover作成前（実装時）に行おうとすることから生じる。
closeの確定はChat内の会話記憶に依存せず、必ずhandover作成時に
Deferred Documentationへ記録する。

「いつ実装されたか不明」な既存項目（過去のズレの結果）については、
発見した時点でcloseすれば十分。実装時期の追跡はGit historyに任せ、
current-issues.md側で追跡しない。

### current-issues.md のファイル責務（open issues only）

[FILE SCOPE INVARIANT]
current-issues.md は **open issuesのみ** を保持する。

```
書くべきもの:
  - 未着手
  - 観察中
  - 検討中
  - 意図的保留
  - 将来候補（設計フェーズ未着手のもの）

書くべきでないもの（別ファイルの責務）:
  - 完了済み項目の詳細説明      → phase-status.md / handover_phaseXX.md
  - 実装履歴・「PhaseXXで実装済み」の解説 → phase-status.md
  - 設計知見・教訓              → architecture.md または docs/handover/README.md
  - runtime authority一覧       → architecture.md
  - architecture的解説          → architecture.md
```

[CLOSE BY DELETION]
新規にcloseするissueは「状態: 完了（PhaseXX）」と書き残すのではなく、
**current-issues.mdから削除する**。完了の記録はhandover_phaseXX.mdと
phase-status.mdに既に残るため、current-issues.md側での「完了」表記は
二重管理になる。

[ISSUE NUMBER GAP TOLERANCE]
`Issue #N`形式の番号は、closeされたIssueの番号を欠番のまま許容する
（[CLOSE BY DELETION]により該当項目自体が削除されるため）。
番号の振り直し・再利用は行わない。連番であることよりも、過去の会話や
コミットメッセージで参照した番号が指す対象を将来も変えないことを優先する。

---

## テンプレートの使い分け（軽量版／重量版）

handoverには2種類の形式がある。フェーズの性質によって選ぶ。

| 使う条件 | 形式 |
|---|---|
| 変更が単純（バグ修正1件・機能追加1件など） | 軽量版 |
| 調査プロセスが単純（原因がすぐ分かった） | 軽量版 |
| 複数の仮説を検証しながら原因を特定した | 重量版 |
| 設計判断が複数あり、採用理由を残す必要がある | 重量版 |
| 「今回はやらないこと」を明示する必要がある | 重量版 |

迷った場合は軽量版から書き始めてよい。書いているうちに
Design Decisions や Findings が必要になったら、重量版へ拡張する。

---

## handover の二層構造

### 1. micro-log（作業中メモ）

**位置づけ:** phase handover の下書き（temporary continuity note）

handover_phaseXX.md 内に「## micro-log」セクションを設け、
作業中に随時追記する。フェーズ完了時に整理して本文へ統合し、
micro-log セクション自体は削除してよい。

#### 記録対象の判断基準

以下のいずれかに関わる変更のみ記録する：

- authority / ownership
- invariant
- lifecycle
- canonical/projection boundary
- interaction heuristic
- migration / compatibility
- future extensibility

逆に、typo修正・formatting・trivial rename・
コメントのみの変更などは記録不要。

**判断に迷う場合の基準:**
「数フェーズ後に『なぜこの設計になっているのか』を
説明する必要があるか」で判断する。

#### フォーマット例

```markdown
## micro-log

- relatedTarget guard を tooltip hover に追加
- reason: pointerover/out delegation で
  chord内部移動flickerが発生したため
- invariant: tooltip state は chartState に持たない
```

最低限「reason」と「invariant / authority / ownership のいずれか」
を残す。完璧な文章でなくてよい。

---

### 2. phase handover（正式記録）

**位置づけ:** 設計記録・将来参照用（curated continuity document）

フェーズ完了時に micro-log を見ながら整理する。

#### 重点的に残すもの

- authority / ownership
- invariant
- canonical/projection boundary
- lifecycle / migration state
- compatibility policy
- deferred issue / future risk

#### 優先度が低いもの

- 単純な差分列挙・行数変化
- trivial rename / mechanical refactor detail

---

## handover_phaseXX.md のテンプレート

### 軽量版

```markdown
# 引き継ぎ: PhaseXX完了 — タイトル

## 作業状態
- ブランチ: xxx
- 直前作業: PhaseXX完了

## micro-log
（フェーズ完了時に下記へ整理し、本セクションは削除してよい）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|

## 設計判断（あれば）

```
結論:

理由:
```

## 確定した設計原則

## Out of Scope（あれば）

今回はやらないと決めたこと・その理由。

## 実機確認（あれば）

```
□ ○○ → 期待する結果
```

## Issue状態変更記録（該当issueがある場合）
- 今回closeしたissue: （なければ「なし」）
- 今回新規に積み残したissue: （なければ「なし」）

## 積み残し・保留バグ

## 次フェーズ候補

## Deferred Documentation（棚卸し時に反映する内容）

```
phase-status.md
  -

current-issues.md
  -
```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
```

---

### 重量版

必要に応じて以下のセクションを追加する。
完全なテンプレートは `docs/handover/template-heavy.md` を参照。

- Purpose（目的）
- Scope（今回やったこと）
- Out of Scope（今回はやらないと決めたこと）
- Implementation（実装内容・事実）
- Design Decisions（設計判断・採用理由）
- Findings（判明した知見・調査プロセスの記録）
- Remaining Issues（残課題）
- Next Phase（次フェーズ開始位置）
- Files Changed（変更ファイル一覧）
- Micro Log

---

## AIの役割について

AIは continuity support / review assistant として利用する。
最終判断と ownership は開発者が持つ。

具体的な運用フローは本ファイル末尾の Appendix を参照。

---

## 補足: naming / glossary 運用

`docs/naming-glossary.md` を継続運用する。
命名は semantic boundary の宣言であり、短縮すると設計情報が失われる。

---

## ブランチ運用

- 機能追加: `phaseXX` ブランチ
- バグ修正: `bugfix/xxx` ブランチ
- 1 commit = 1 logical concern（1つの論理的な変更目的）を原則とする
- リファクタリングと機能追加の混在禁止

---

## ドキュメント更新ポリシー（Phase105で確定）

毎フェーズ・棚卸しのどちらで各ドキュメントを更新するかの判断基準。

```
毎フェーズ必須
──────────────
✅ handover
    closeしたissue・新規issue・状態変更したissueは、本文末尾の
    「Deferred Documentation」セクション（固定フォーマット。
    下記参照）へ、current-issues.mdへの正確な変更内容を書いておく。
    current-issues.md自体は棚卸しまで一切触らない。

即時更新（機械的判定・棚卸しを待たない）
──────────────
✅ architecture.md（該当箇所のみ）
    Named Invariant（[XXX]形式のコメント）を
      ・新設
      ・意味変更
      ・廃止
    した場合

✅ docs/handover/README.md
    handover運用ルールそのものを変更した場合のみ

ドキュメント棚卸し（Documentation Checkpoint）
──────────────
・phase-status.md
・current-issues.md
・architecture.md（整合性監査のみ。Named Invariant自体の反映は
  上記「即時更新」で別途完了しているはず。Checkpointの対象は
  反映漏れ・不整合の確認に限る）
    Deferred Documentationの仕組み自体は変わらない。変わるのは
    適用タイミングのみ：固定フェーズ数（旧「5フェーズごと」）は
    廃止し、「強制Checkpoint」（subsystem boundary変更・運用ルール
    変更等・即時）または「計画Checkpoint」（Rough Phase Estimateと
    連動・規模に応じた目安）で適用する。詳細・トリガー一覧は
    本ファイル後方の「ドキュメント棚卸し（Documentation
    Checkpoint）」セクション参照（重複を避けるためここでは要約の
    み）。

    対象handoverから「Deferred Documentation」内の
    current-issues.md部分を、Phase番号順（古い→新しい）に適用し、
    最終状態を機械的に構築する。棚卸し担当者が内容を再判断・
    再構築しない。

    [重要] 各handoverのDeferred Documentationは「最終状態」ではなく
    「現在の正本（current-issues.md）に対する差分」として扱う。
    棚卸しでは対象フェーズを時系列順に処理し、各handoverの
    Deferred Documentationを差分として順次適用する。後続フェーズの
    記録が先行フェーズの状態を上書きする（同一issueに対しADD→
    MODIFY→CLOSEのような複数回の変更履歴がある場合も、順番に
    適用すれば自動的に正しい最終状態になる）。
```
### Deferred Documentationのフォーマット（固定）

handover本文の末尾に、必ず以下の形式で残す。変更がない場合も
セクション自体は省略せず「No changes.」と明記する。

```markdown
## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: ...
  状態: ...
  内容: ...

#### MODIFY
- 見出し: ...
  変更内容: ...

#### CLOSE
- 見出し: ...（closeの理由・対応Phase）

（変更がなければ）
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加: ...
- Major Milestones（該当テーブル）に追加: ...
- Future Candidates の更新: ...

（変更がなければ）
- No changes.
```

自由記述にすると棚卸し時に再び同じ問題（更新漏れ・記憶依存）が
発生するため、フォーマットは固定とする。

### なぜこの基準か

以前は「設計判断が複数あるか」「重大な変更か」といった主観的な基準で
即時更新の要否を判断していたが、判断が人によって・タイミングによって
ぶれやすいという課題があった。

`[XXX]`形式のNamed Invariant（例: `[BOUNDARY INVARIANT]`、
`[PERSISTENCE OWNERSHIP PRINCIPLE]`）は、コード内コメントとして
grepで発見される前提の仕組みである。これがhandoverだけに存在し
architecture.mdへの反映が数フェーズ遅れると、コードを読んだ人が
grepしても正本にたどり着けない期間が生まれる。この「grep→正本」の
導線を途切れさせないことが、即時更新すべきかどうかの唯一の判断基準
である。

一方、実装の詳細（新規関数の追加等、既存の設計原則の範囲内に収まる
変更や、実機確認の結果）は、grepで検索される対象ではなく、かつ
設計原則そのものの変更でもないため、handoverに記録すれば十分で
architectureには波及させない。

### ドキュメントの役割分担（本ポリシーの前提）

```
handover              … フェーズごとの事実・設計判断・実装履歴
architecture.md        … 現在有効な設計原則（Named Invariant）の正本
docs/handover/README.md … handover運用ルールの正本
README.md（ルート）     … プロジェクト利用・開発の入口
phase-status.md /
current-issues.md      … 定期的な棚卸し対象
```

---

## ドキュメント棚卸し（Documentation Checkpoint）

固定フェーズ数（旧「5フェーズごと」）は廃止した。代わりに
「即時反映ルール」「強制Checkpoint」「計画Checkpoint」の3種類で
実施する。

### 0. 即時反映ルール（Checkpointではない・正本の即時更新）

```
Named Invariant（`[XXX]`形式）の新設・意味変更・廃止
    ↓
architecture.mdを即時更新（正本側の更新。Checkpointを待たない）
    ↓
必要に応じて、次のCheckpoint（強制または計画）で
周辺ドキュメント（phase-status.md / current-issues.md）への
反映漏れがないかを確認する
```

architecture.mdへのNamed Invariant反映自体はCheckpointの構成要素
ではない。既存の「Named Invariant即時反映ルール」により正本側で
既に完了しているはずのものであり、Checkpoint側の役割は「反映漏れの
確認」に限られる。

### A. 強制Checkpoint（即時・予定を待たない）

以下のいずれかが発生した場合、計画中のCheckpointを待たず即時に
棚卸しする：

- subsystem boundary・authority・responsibilityの変更
  （例: Session Layer/Command Layerの責務再配置、Authorityの
  所在変更等）
- 運用ルールそのものの変更（本README・handoverテンプレート等）

### B. 計画Checkpoint（Rough Phase Estimateと連動）

Development Process（下記Appendix参照）のRough Phase Estimateで
規模を見積もる際、あわせて大まかなCheckpoint時期も想定する。
固定周期ではなく、開発計画に最初から組み込む「予定された柔軟性」
とする。

| 規模 | Checkpointの目安 |
|---|---|
| XS/S | 通常はhandoverの記録のみで十分。必要に応じて棚卸しする（毎回は強制しない） |
| M | 3〜5 Phase程度のまとまりが完了したタイミング |
| L/XL | 完了時に加え、途中にも1回以上Checkpointを設ける |

これに加え、以下も棚卸しのきっかけとする：

- Product Freezeを経た機能が完了し、正式ドキュメントへ反映する
  価値があると判断した場合（機能完了が自動的に棚卸しを義務付ける
  わけではない）
- 開発者が「そろそろ整理したい」と判断した場合（Phase数・規模に
  関わらず、いつでも起点にしてよい）

XS/Sの「必要に応じて」を「毎回必ず」に変質させない。規模に応じた
目安が新しい固定儀式に育つと、「5フェーズごと」の問題を形を変えて
再生産することになる。

### Checkpoint発生時に更新するもの

- `phase-status.md` に完了フェーズを追記
- `current-issues.md` を、対象handoverのDeferred Documentationを
  時系列順に適用して最新状態へ更新する（バックログの整理・削除・
  追加はこの適用結果として行う。個別に手動で書き換えない）
- `architecture.md` の整合性を監査する。architecture.mdは
  「現在有効な設計原則の正本」であり、Checkpointのたびに
  書き換える対象ではない。Named Invariantの変更は上記「0. 即時
  反映ルール」に従って別途即時更新済みのはずなので、Checkpointで
  行うのは反映漏れ・設計原則との不整合の確認のみとする

### Archive運用（Checkpointとは独立）

Archiveのサブディレクトリ化は、Documentation Checkpointとは別の
トリガーで行う（ファイル数の管理のみが目的で、設計内容の整理では
ないため）。

- Archiveは20〜25フェーズ単位でサブディレクトリ化する。ディレクトリ
  名は phase081-100 のように開始・終了フェーズを表す
- 該当ディレクトリ内のファイル数がこの目安を超えたタイミングで
  実施する。Documentation Checkpointの発生とは無関係に、独立して
  判断してよい

---
---

# Appendix（補助資料・必要時のみ参照）

> 以下は運用補助情報。固定ルールではなく、実験的に調整してよい。

## Development Process（開発プロセス・現行案）

> 新機能・UX変更を伴う開発のための標準フロー。見た目の微調整や軽微な
> バグ修正など、小規模な変更はこのフローを省略し、従来通り
> 「仕様確認 → 提案 → 明示的な実装指示 → 実装 → 動作確認」で進めてよい。
> このセクションは実験的に調整してよい（Appendix全体の位置づけと同じ）。

### 背景

Issueを順番に消化する運用が続くと、「何を作りたいか」より
「次のIssueを片付けること」が目的化しやすい。また、欲しい機能を
思いついても、設計を進めるうちに既存Architectureの都合に引っ張られ、
最終的な成果物が最初の完成イメージと違ってしまうことがある。

この2つに対応するため、「何を作るか（Product Design）」と
「どう作るか（Technical Design）」を明確に分離する。

### この原則が最優先（新しいノルマにしない）

**各段階は規模・内容に応じて統合・省略可能。全段階を毎回律儀に
踏むことを求めるものではない。**

- 小さな機能・軽微な変更 → Idea Input と Product Freeze を1〜2往復で
  済ませてよい（Rough Phase EstimateがXS/S相当なら、Scope Negotiation
  は省略してよい）
- 見た目の微調整・軽微なバグ修正 → 下記「小規模変更の簡易フロー」に
  切り替えてよい（Development Process自体を適用しない）
- 逆に、大きな機能・迷いがある機能ほど各段階を丁寧に踏む

Development Processが「毎回9段階を全部踏まなければならない手続き」
になった時点で、Issue消化ノルマと同じ問題を再生産する。判断に迷う
場合は「これは今、自分が丁寧に決めたいことか？」を基準にする。

### 全体フロー

```
Idea Input（自然言語＋スクショ/スケッチ/Before-After等、自由形式）
       ↓
Product Intent Extraction（AI: 「こう理解した」と返す）
       ↓
UX / Behavior Specification（両者：具体的な操作・結果を整理）
       ↓
Rough Phase Estimate（AI: 概算規模を提示）
       ↓
Scope Negotiation（必要なら：Full版／Minimum版等を再検討）
       ↓
Product Freeze（開発者：「これが欲しい」を確定）
       ↓
Technical Design（Claude：既存構造での実現方法を設計）
       ↓
Product Fidelity Review（ChatGPT：Product Intentから逸れていないか）
＋ Architecture Review（ChatGPT：責務・Invariant監査。従来通り）
       ↓
Technical Design承認（開発者）
       ↓
Implementation（Claude）
       ↓
Acceptance（開発者：実際に欲しかったものか判断）
       ↓
（トリガーに該当すれば）ドキュメント棚卸し
```

### 役割表

| 段階 | 主役 | 役割 |
|---|---|---|
| Product Intent | 開発者 | 欲しいものを決める（自然言語＋スクショ/スケッチ/Before-After等、自由形式） |
| UX / Behavior Specification | 両者 | 具体的な操作・結果を整理 |
| Rough Phase Estimate | AI | 概算規模を提示（下記参照） |
| Scope Negotiation | 開発者 | 見積もりが大きい場合、「どこまで作るか」を再検討 |
| Product Freeze | 開発者 | 「これが欲しい」を確定 |
| Technical Design | Claude | 既存構造での実現方法を設計 |
| Product Fidelity Review | ChatGPT | Product Intentから逸れていないか |
| Architecture Review | ChatGPT | 責務・Invariant監査（従来通り） |
| Implementation | Claude | 実装 |
| Acceptance | 開発者 | 実際に欲しかったものか判断 |

### Product Freezeの範囲

Product Freezeで確定するのは「ユーザーに何を提供するか」
（UX・操作・見た目・期待される挙動）であり、「内部でどう実装するか」
（Authority・Command・データ構造等）ではない。内部実装方式の決定は
Technical Design側の責務である。

この区別を曖昧にすると、Product Freeze段階で実装の詳細まで
確定しようとして工程が重くなったり、逆にTechnical Design段階で
UXが実装都合により変質するリスクが生まれる。

### Product Intent Extractionの進め方

AIは、開発者からIdea Inputを受け取ったら、質問を先行させない。
まず「こういう完成イメージ・意図・操作・期待結果だと理解した」と
自由形式で整理して提示する。

- 開発者はその理解を修正・補足する
- その上で、まだ確定できていない事項があれば、AIは質問してよい
- ただし選択肢（A案/B案等）を提示する場合、それは回答を限定する
  ものではない。開発者は「A/B/Cのどれでもなく、こういうイメージ」
  と自由に答えてよい

理由: 選択肢先行の質問は、開発者が持つ完成イメージが選択肢内に
うまく表現されない、またはイメージがまだ固まっていない段階で
判断を迫られ、後から手戻りが発生するリスクがある。理解を先に
言語化して提示することで、開発者は「近いが違う」を早い段階で
指摘でき、選択肢の枠に押し込められることを避けられる。

### 質問の前提確認ルール

AIは、Product Intentが十分に理解できていない段階で、Technical
Design上の選択肢を質問しない。

1. まず自由形式で理解した内容を提示し、開発者の修正・補足を受ける
2. その後、Product Intent / UX / Behaviorを実現するために本当に
   判断が必要な事項だけを質問する
3. 質問する場合も、選択肢だけを提示して回答を誘導せず、
   「なぜこの判断が必要なのか」を簡潔に説明する

「Product Intentの理解」と「Technical Design上の選択」を混同しない
ことが目的。前者が固まる前に後者の選択肢を提示すると、開発者は
まだ固まっていないイメージを無理に選択肢へ当てはめることになり、
手戻りの原因になる。

### Issueの位置づけ

Issueは「実行待ちのノルマ」ではなく「あとで思い出すための保管庫」。
Phase開始のトリガーはProduct Intent（欲しいもの）であり、Issue番号
ではない。

- 既存Issueを眺めていて「これを今作りたい」と思う → OK
- Issueと無関係に思いついた新機能から始める → OK
- Product Freeze後に、関連する既存Issueがあれば紐付ける（任意）

どちらの入り口も対等であり、「Issueを消化すること」自体はPhase開始の
必須条件にしない。

### Rough Phase Estimate（概算フェーズ見積もり）

UX / Behavior Specificationが固まった段階（Product Freeze前）で、
AIは実装規模を概算する。これは正確なPhase数の予測ではなく、
「これは1日仕事なのか、数Phase級なのか、10Phase級なのか」を最初に
共有するための粗い目安分類である。

| 規模 | 目安 | イメージ |
|---|---|---|
| XS | 1 Phase | CSS修正、単純な表示変更 |
| S | 1〜2 Phase | 小規模なUI＋JS変更 |
| M | 3〜5 Phase | 複数ファイル・既存責務との調整 |
| L | 6〜10 Phase | 新しいCommandやデータフローを伴う機能 |
| XL | 10 Phase以上 | 大規模な設計変更・複数サブシステムに影響 |

Technical Design完了後、見積もりが変わった場合は更新してよい
（例：「初期見積もりM → Technical Design後L。理由: 既存の○○責務を
変更せず実現するには△△層の追加が必要だった」）。

この規模見積もりは、ドキュメント棚卸し（Documentation Checkpoint。
本ファイル前半参照）の計画タイミングとも連動する。見積もり提示時に
「この規模ならこのあたりでCheckpointを置く」という想定も軽く添えて
おくと、後から棚卸し時期を機械的に判断しやすい。

### Scope Negotiation（スコープ調整）

見積もりが大きい場合、実装方法ではなく「どこまで作るか」を
Product側で再検討できる。

例：
```
Full version      8〜12 Phase
Minimum viable    2〜3 Phase
```

見積もりが大きいことを理由にAIが機能を勝手に縮小しない。
どこまで作るかの選択は常に開発者が行う。

### Technical Designの制約ルール

Technical Design段階で、Product Freezeで確定したUXをそのまま
実現できない技術的制約が判明した場合、Claudeは制約と代替案を
提示するのみとし、Product Freezeの内容を独断で変更しない。

変更理由は2種に区別して提示する：

- A. 技術的制約による変更（現在の構造では実現不可能なため）
- B. 製品判断による変更（検討の結果、こちらのUXが良いと判断した）

**AとBのどちらであっても、変更には開発者の承認が必要**。
「技術的に難しいから」という理由だけでUX・機能・操作方法をAIが
独断で縮小・変形しない。

### AIの役割分担

| 役割 | 担当 |
|---|---|
| Product Intent整理・UX具体化の壁打ち | Claude / ChatGPT（両方） |
| Technical Design・実装 | Claude |
| Product Fidelity Review・Architecture Review | ChatGPT |
| Product Intent／Product Freeze／Acceptance | 開発者 |

※ この役割分担は将来変更される可能性がある。変更時は本セクションのみ更新すればよい。

### 小規模変更の簡易フロー

見た目の微調整・軽微なバグ修正など、Product Intentから固める必要が
薄い変更は、以下の簡易フローのままでよい。

1. 仕様確認
2. 提案（設計・図解）
3. 明示的な実装指示
4. 実装
5. 動作確認

---

## handover作成フロー（推奨）

1. Claude: 実装・差分整理・handover draft作成
2. ChatGPT: handover audit・backlog continuity audit・subsystem整合確認
3. 開発者: 最終版handover確定

---

## Handover Review（監査往復の回数上限）

Handoverの監査・修正往復は原則最大2ラウンドとする。

- **Round 1**: 監査者が確定を妨げる問題をまとめて指摘する
- **Round 2**: 修正版を最終監査し、PASSまたは重大な未解決問題を判定する

原則として3ラウンド目以降は行わない。重大な問題が残る場合はユーザー判断とする。
軽微な表現・体裁上の指摘は、確定を妨げない限り無限に往復せず、必要に応じて
次回のDocumentation Checkpoint等へ回す。

目的は品質を下げることではなく、AI同士の無限レビューによる運用コスト・
認知負荷を防ぐことである。

---

## handover監査チェック

### backlog continuity
- current-issuesの関連項目を再掲したか
- 今回触ったsubsystemの未完了事項を書いたか
- 今回触らなかったが関連性の高いissueを書いたか

### architecture continuity
- 設計原則の変化を書いたか
- subsystem boundaryの変更を書いたか
- authority / responsibilityの変更を書いたか

### phase continuity
- 「今回はやらなかった理由」を書いたか
- 次phase候補の優先順位理由を書いたか
- 将来フェーズへ分離した理由を書いたか

---

## 抜けやすいポイント（既知のpitfall）

handoverは「今回変更した内容」だけを書くと、
phaseをまたいだ未完了事項やsubsystem continuityが失われやすい。

特に以下は抜けやすいため監査対象とする：

- transient preview系
- playback authority系
- renderer responsibility系
- mutation authority系
- modal subsystemとeditor coreの境界

---

## 差分適用の実務ルール（Phase66で確立）

- 関数単位で置換する（前後数行だけの部分置換は避ける）
- 適用後は `node --check` と `git diff` で実コード反映を確認する
- 1 commit = 1 logical concern（1目的）に制限する（目安: 20箇所超は分割検討）

---

## Decorator開発運用ルール（Phase102-Bで提案）

> 設計原則そのもの（[DECORATOR VISUAL LANGUAGE PRINCIPLE] /
> [DECORATOR LEGIBILITY PRINCIPLE] 等）は architecture.md §12 が保持する。
> ここに書くのは「実装時・レビュー時にその原則をどう適用するか」という
> 開発プロセスのみ（役割分担はREADME冒頭の運用ルールと同じ考え方）。

### Decorator追加時のフロー

新しいDecoratorを追加する際は、以下の順序で進める。

1. Defaultテーマで設計・実装する（他テーマは一旦考慮しない）
2. Defaultテーマで動作確認する
3. Theme Auditで他テーマへの反映を行う（下記）
4. ドキュメント更新（architecture.md Decorator Inventory等）

UI設計フェーズとテーマ移植フェーズを分離することで、
毎回3テーマ同時に調整するコストを避ける。

### Theme Audit

新規Decorator追加時、または複数テーマにまたがるUI変更が発生した際に、
必要に応じて以下をまとめて行う（フェーズ数は固定しない）。
- 新トークン追加漏れの確認
- 全テーマでのコントラスト・視認性確認（[DECORATOR LEGIBILITY
  PRINCIPLE]に基づく）
- 各テーマ固有の未定義トークン（silverの--color-green-rgb欠落等の
  既知パターン）の再発確認

### Decorator Development Checklist

新規Decorator実装が完了したら、以下を確認する。

```
□ Theme Audit（3テーマでの視認性・トークン欠落確認）
□ 既存Decoratorとの重複確認（architecture.md Decorator Inventory参照）
□ [ONE INTENT, ONE PRIMARY DECORATOR] 準拠確認
  （同じIntentを持つ既存Decoratorが無いか／Primary/Secondaryの区分）
□ Hover / Active / Selected 等の状態別表示確認
□ 編集中限定の機能か？ → [EDITOR RESET AUTHORITY] に従い
  resetAnalysisEditor() へのクリア処理登録を確認
□ handoverへ反映（Design Decisions・Decorator Inventoryの更新要否）
```

このチェックリストは今後Decoratorを追加するたびに使い回す想定。
項目自体の追加・見直しは気づいた時点で本セクションを直接更新してよい。

---

## Named Invariant即時反映ルール（Phase105で確定）

Named Invariant（[XXX]形式）の新設・意味変更・廃止を伴う場合は、
handoverへの記録に加えて、architecture.mdの該当箇所を即時更新する。

詳細（Documentation Checkpointとの関係）は「ドキュメント棚卸し
（Documentation Checkpoint）」セクションの「0. 即時反映ルール」を
正本として参照する（本セクションは、このルールがPhase105で確定した
という経緯の記録として残す）。

