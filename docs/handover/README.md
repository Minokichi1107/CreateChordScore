# Handover 運用ルール

> handoverはフェーズ時点の設計判断・実装経緯・検証結果を記録する履歴であり、
> architecture.mdの代替ではない。Named Invariantの正本はarchitecture.mdとする。

## このディレクトリの役割

各フェーズ完了時の引き継ぎ情報を集約する。
設計判断・積み残し・次フェーズ候補はここに書く。

正式ドキュメント（phase-status.md / architecture.md 等）への
反映は5フェーズごとの棚卸し時にまとめて行う。

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

issue の open/close は **handover作成時に確定する**。
実装中は current-issues.md を触らない。

```
実装中
  └ current-issues.mdは触らない（コード内コメント・micro-logのみでよい）
        ↓
handover作成時
  └ 「今回closeしたissue」「今回新規に積み残したissue」を整理し、
    current-issues.mdをそこから更新する
        ↓
5フェーズ棚卸し
  └ current-issues.mdのstale項目確認・責務整理
```

[ISSUE TRUTH SOURCE INVARIANT]
issueの状態（open/close）のtruth sourceはhandoverであり、
Chat内の会話記憶に依存してはいけない。
「実装した記憶はあるがcurrent-issues.mdが古い」というズレは、
issue closeを実装時に行おうとすることから生じる。
closeはphase単位（handover作成時）でまとめて確定する。

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
  - 設計知見・教訓              → architecture.md または README.md
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

## current-issues.md更新（該当issueがある場合）
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

README.md
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
- 1フィーチャー1コミット
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

棚卸し（5フェーズごと）
──────────────
・phase-status.md
・current-issues.md
    対象5フェーズ分のhandoverから「Deferred Documentation」内の
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
・README.md（プロジェクトルート）
・architecture.mdの全体整合性チェック
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

## 5フェーズごと（棚卸し）

以下をまとめて更新する：

- `phase-status.md` に完了フェーズを追記
- `architecture.md` を現状に合わせて更新
- `current-issues.md` のバックログを整理・削除・追加

- Archiveは20〜25フェーズ単位でサブディレクトリ化する。ディレクトリ名は phase081-100 のように開始・終了フェーズを表す。

---
---

# Appendix（補助資料・必要時のみ参照）

> 以下は運用補助情報。固定ルールではなく、実験的に調整してよい。

## AIレビュー運用（参考例）

| 役割 | 担当 |
|---|---|
| 設計書・整理・長文構造化 | Claude |
| 境界条件・将来破綻・責務監査 | ChatGPT |
| 違和感・UX・優先順位判断 | 開発者 |

### 実装フロー

1. 仕様確認
2. 提案（設計・図解）
3. 明示的な実装指示
4. 実装
5. 動作確認

※ この役割分担は将来変更される可能性がある。変更時は本セクションのみ更新すればよい。

---

## handover作成フロー（推奨）

1. Claude: 実装・差分整理・handover draft作成
2. ChatGPT: handover audit・backlog continuity audit・subsystem整合確認
3. 開発者: 最終版handover確定

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

5〜10フェーズごと、または新規Decorator追加時に、以下をまとめて行う:
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

