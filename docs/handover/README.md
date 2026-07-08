# Handover 運用ルール

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

## 確定した設計原則

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: （なければ「なし」）
- 今回新規に積み残したissue: （なければ「なし」）

## 積み残し・保留バグ

## 次フェーズ候補

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

## 5フェーズごと（棚卸し）

以下をまとめて更新する：

- `phase-status.md` に完了フェーズを追記
- `architecture.md` を現状に合わせて更新
- `current-issues.md` のバックログを整理・削除・追加

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
