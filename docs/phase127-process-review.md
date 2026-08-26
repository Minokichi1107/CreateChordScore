# Phase127 Process Review — 新開発プロセスの評価と正式採用候補整理

> 位置づけ: 本ファイルはPhase127-D'完了を受けて、Phase127で試行した新しい
> 開発プロセスを評価するためのReview文書である。
> **本ファイル自体が「新プロセスを正式採用した」ことを意味しない。**
> 正式採用の可否・調整点を整理し、次のChatセッションで判断材料として使う
> ことを目的とする。README.mdへの正式反映は、本Reviewを踏まえて別途行う。

---

## 0. Review対象

```
Intent → Exploration → Technical Design → Risk Check
→ Implementation → Validation → Review/Handover
```

Phase127-D'（Provenance Tooltip機構の刷新）を通じてこのプロセスを実際に
運用し、その記録（handover_phase127-D-prime.md・会話履歴）を根拠に評価する。

---

## 1. 各段階で実際に何が起きたか

| 段階 | Phase127-D'での実例 |
|---|---|
| Intent | 「tooltipが不安定」→ 途中で「表示ON/OFFも欲しい」というIntentが追加された |
| Exploration | 実コード調査（既存tooltip機構・title属性・依存注入構造）を都度実施 |
| Technical Design | Design Bは2周した（既存拡張/完全重複の二択 → textTooltip.js独立モジュール） |
| Risk Check | ①UX不確実性 ②Authority/Invariant変更 ③画面・挙動の未確定、の3項目で判定 |
| Implementation | textTooltip.js新設・app.js/chartmode.js接続・title削除の3段階に分割実施 |
| Validation | hover/3テーマ/ON-OFF連動はPC実機確認済み、tap挙動は未検証のまま記録 |
| Review/Handover | handoverが3回の監査往復を経てApprove |

---

## 2. 良かった点（Processとして機能した箇所）

- **Design二択の罠をRisk Checkが検知した**（Design B 1周目）。
  「Architecture的には問題ないが、Product Intent的には未熟な設計」という
  ケースを、Authority/Invariant変更の有無だけでは検知できなかったはず。
  ①（UX不確実性）の項目があったことで拾えた。
- 「推測」と「検証済み事実」を分ける姿勢が、tap未検証の記録から
  current-issues.mdまで一貫して保たれた。
- GitHub Issue監査という当初のスコープ外の作業が割り込んだ際も、
  current-issues.md（バックログ正本）とhandover（次作業者への文脈）の
  役割分担を保ったまま吸収できた。

---

## 3. Process failure と Execution quality failure の区別

今回のReviewで最も重要な整理。**「プロセスの型が悪かったのか」と
「型は正しいが実行が粗かったのか」を混同しない。**

### Process failure（プロセス設計自体の欠陥）

```
定義: 段階の「考え方」「判断基準」自体が不十分で、
      正しく実行してもリスクを見逃す構造だった場合

Phase127-D'での実例:
  Design B 1周目が「既存拡張 vs 完全重複」の二択に最初から閉じていた
  → Technical Design段階に「選択肢を狭めすぎていないか」を
    自己点検する視点が欠けていた
  → これはRisk Check（Review Candidate化）によって外部からカバーされたが、
    Technical Design段階自体にこの視点があればもっと早く気づけた
    （5節でTechnical Designの完了基準へこの自己点検項目を追加済み）
```

### Execution quality failure（プロセスは正しいが実行が粗かった）

```
定義: 段階の「型」自体は正しいが、その型を埋める作業（文言・記録・
      ファイル管理等）の精度が足りなかった場合

Phase127-D'での実例:
  ・Risk Check③の文言が論理反転していた（「合意できているか」→
    本来は「未確定な点があるか」であるべきだった）
  ・handover本文への反映漏れが複数回発生した（#52・Phase127-Fの理由）
  ・出力ファイルの版管理が曖昧で、たかっちさんが「最新か古いか」を
    都度確認する必要があった
```

### この区別がなぜ重要か

```
Process failureへの対処 → プロセスの段階定義・判断基準を修正する
Execution quality failureへの対処 → プロセスの中に「確認の仕組み
  （Process Guard）」を追加する

両者を混同すると、
  Execution qualityの問題なのにプロセス自体を疑って複雑化させる
  （＝今回避けたかった「プロセスのためのプロセス」の再発）
または逆に
  Process failureなのに「今回はたまたま実行が粗かっただけ」と
  片付けてしまい、同じ構造的リスクを繰り返す
という両方向の誤りが起きる。
```

**Phase127-D'の往復の多さは、大部分がExecution quality failureだった。**
ただし、これを「Claude個人の注意力の問題」として完全に切り離さず、
プロセス側に検出の仕組み（Process Guard）を設けることで再発を防ぐ、
という方針を採用する（4節参照）。

---

## 4. Process Guard の導入（Review/Handover段階への追加）

Execution quality failureは、個々の注意力に依存させず、**段階の完了条件
そのものに「照合チェック」を組み込むことで検出可能**にする。

**[重要] Process Guardは新しい独立工程ではない。**

```
誤った理解:
  Review/Handover
        ↓
  Process Guardという新しい書類を作成
        ↓
  Process Guardをレビュー
        ↓
  完了

正しい理解:
  Review/Handover
        ↓
  Process Guard（＝Review/Handoverの完了条件チェック。
                  それ自体は工程でも成果物でもない）
        ↓
  完了
```

新しい工程を1つ追加することが目的ではなく、既存のReview/Handover工程が
「完了したとみなせるか」を判定する**完了条件**として組み込む。これを
律儀に毎回文章化・レビュー対象にすると、以前避けたかった「プロセスの
ためのプロセス」を再生産することになるため、あくまで軽量なセルフ
チェックの位置づけとする。

### [Review/Handover Process Guard]（新設・提案）

```
Review/Handoverを完了とみなす前に、以下を機械的に照合する：

□ 今回新たに確定した事項が、handover本文に実際に反映されているか
  （「反映しました」という発言と、本文の実テキストを突き合わせる）
□ 未解決事項（Validation未完了・未検証項目）が明記されているか
□ 既存Issue（current-issues.md）への影響（CLOSE/ADD/MODIFY）が
  handoverとcurrent-issues.mdの両方で一致しているか
□ 次フェーズ候補が「必須の次アクション」ではなく「候補」として
  記載されているか（Intentを固定していないか）
□ 出力ファイルが最新版であることを、内容の一部を引用して確認したか
  （ファイル名・タイムスタンプだけでなく中身の該当箇所を照合する）

このチェックは監査者（ChatGPT）だけでなく、Claude自身が
「本文を貼る前」に一度セルフチェックとして行う。
```

Phase127-D'では、この照合が「監査で指摘されて気づく」形になっていた
（#52記載漏れ、ファイル版の齟齬など）。Process Guardとして先に定義して
おけば、監査に頼らず自己検出できた可能性が高い。

---

## 5. 各段階の完了基準（整理）

Process Reviewの目的の一つである「何を確認したら完了とみなすか」を
段階ごとに整理する。

| 段階 | 完了基準 |
|---|---|
| **Intent** | 「何が欲しいか」が自然言語で表現され、途中で変化してもよい前提で次段階へ進めること |
| **Exploration** | 実コード・実データを確認し、「事実」と「推測」を分けて提示できていること。未確認事項が残る場合は明示されていること |
| **Technical Design** | 「最低2案」という固定数のノルマにはしない。代わりに以下を満たすこと：<br>□ 採用案が明確である<br>□ 主要な代替案を検討したか、単一案の場合はなぜ他の選択肢を検討しなかったかを説明できる<br>□ 採用しなかった代替案があれば、棄却理由を説明できる<br>□ 選択肢を最初から狭く（例: 二択に）定義していないか自己点検した |
| **Risk Check** | ①UX不確実性 ②Authority/Responsibility/Named Invariant変更 ③画面・挙動の未確定、の3項目すべてに明示的な判定（Yes/No＋根拠）が付いていること |
| **Implementation** | 変更範囲が小さい単位に分割され、各単位でconstruct-check（構文確認等）が通っていること |
| **Validation** | 「検証済み」と「未検証（ロジックの妥当性のみ）」が明確に区別されて記録されていること |
| **Review/Handover** | 4節の[Review/Handover Process Guard]の照合項目をすべて満たすこと（Process Guardは独立工程ではなく、この段階の完了条件そのものである点に注意） |

---

## 6. 正式採用に向けた論点（次のChatで判断すべきこと）

```
1. Risk Check 3項目・Process Guardチェックリストを、正式にREADME.mdへ
   反映するか
2. 「Intent → Exploration → Technical Design → Risk Check →
   Implementation → Validation → Review/Handover」を、既存の
   Development Process（README.md記載の9段階フロー）と統合するか、
   完全に置き換えるか
3. Technical Design段階に「選択肢を狭めすぎていないか」の自己点検を
   明文化するか（3節のProcess failure事例への対処）
4. Process Guardをどの程度厳密に運用するか（毎回律儀にチェックリストを
   書き出すのか、意識するだけでよいのか）
```

**本Reviewの結論として、上記1〜4は次のChatセッションで改めて判断する。
現時点では「Phase127で試行したプロセスは概ね有効だったが、Process Guard
の追加が必要」という評価に留め、正式採用の確定は行わない。**

---

## 7. 次のIntentについて

Phase127-E（Provenance Popover）・Phase127-F（既存データの状態補完）は、
「次に必ずやる作業」ではなく、**現時点で残っている候補**として扱う。

次のChatセッションでは、まず本Reviewの6節（正式採用に向けた論点）を
先に判断し、そのうえで新しいIntentを決定する順序を推奨する
（旧来の「次フェーズを先に決めて設計書を作る」運用には戻さない）。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
