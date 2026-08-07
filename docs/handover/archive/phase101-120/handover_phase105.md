# 引き継ぎ: Phase105完了 — Section Navigation

## 作業状態
- ブランチ: phase105-section-navigation
- 直前作業: Phase104完了（Section History Integration）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Navigation API新設 | `scrollToChord(chordId)` — 指定chordIdの位置までDOMスクロールするだけの関数 | chartmode.js |
| クリック挙動変更 | `_setSectionPreview()`（トグル式）→ `_selectSection()`（常に選択+スクロール+Preview）へ置き換え | app.js |
| 意味拡張 | `_previewSectionId` を「Previewの対象」から「現在選択中のSection（Navigation Target）」へ意味拡張。変数は増やさず1つのまま | app.js |

---

## 確定した設計原則

### [NAVIGATION OWNERSHIP]

```
scrollToChord() は「指定されたchordIdを表示位置へスクロールする」
だけを責務とする。Section/Playback/Preview/Selectionを一切知らない。
Navigationの判断はapp.jsが行い、chartmode.jsは
Rendering / DOM Navigationのみ担当する。
```

### Design Note（意味変更の経緯）

```
Phase102ではSection Previewが主目的だったが、Phase105以降は
Section Navigationを主目的とする。_previewSectionIdは現在の
Navigation Targetを表すephemeral UI stateとして扱い、その結果として
Previewが表示される（変数名は歴史的経緯でそのまま）。
```

---

## Out of Scope（今回はやらないと決めたこと）

```
・音声のseek
    → 再生位置は移動させない。スクロールのみに限定した。
      理由: Navigation（今どこを見ているか）とPlayback（今どこを
      聴いているか）を結合させないため（実装前レビューで確定した方針）。

・B4 Scroll Recoveryとの干渉回避コード
    → 実装前は干渉の可能性を想定したが、実機確認では干渉は確認
      されなかったため、追加の回避コードは実装しなかった。

・Escape優先順位の変更
    → 当初「新規⑤として追加」する想定だったが、実コード確認の結果、
      Phase102時点で既に優先順位③として実装済みだった。ドキュメント
      （keybindings.md）側が実態より古かっただけで、コード変更は不要
      だった。
```

---

## 設計判断（簡潔に）

### [判断] 新規stateを追加せず、既存`_previewSectionId`の意味を拡張する

```
結論:
  selectedSectionId という新規変数は作らず、_previewSectionIdを
  「選択+Preview」両方の意味を持つ状態として扱う。

理由:
  Navigation TargetとPreview TargetがPhase105では常に一致するため、
  状態を分離せず1つのephemeral stateで管理する。新規state追加は
  「2つの状態をどう同期させ続けるか」という新しい問題を生むため、
  一致する2つの意味をわざわざ2つの変数で表現する必要はないと判断した。
```

### [判断] トグルOFFを廃止する

```
結論:
  同じSectionチップの再クリックは何も起きない（従来はPreview解除）。
  解除はEscape/空白クリックのみに一本化する。

理由:
  Navigationが主目的になった以上、「もう一度押したら解除される」は
  移動操作として不自然（フォルダを開き直したら閉じる、という挙動に近い
  違和感）。実際の心理は「そこへ行きたい」であって「ハイライトしたい」
  ではない、という整理に基づく。
```

---

## 実機確認

```
✅ Section クリック → 正しい位置へスクロール
✅ Section クリック直後の再生 → B4 Scroll Recovery正常動作
   （実装前は干渉の可能性を想定したが、実機確認では干渉は確認されな
   かった）
✅ 同じチップ2回クリック → 何も壊れない
✅ Escape → 選択/Preview解除（既存優先順位のまま動作）
✅ 別Sectionクリック → 前の状態から正しく切り替わる
```

node --check・CRLF維持は変更のたびに都度確認済み。

---

## 次フェーズ候補

```
・P2 Boundary reassignment
    境界コード削除時の隣接コードへの自動付け替え（section-model.md §4.3
    ケースB）。現状reconcile()は常にSection自体を削除する仕様。

・Section Navigation UXの拡張
    ・Section選択状態の視覚表現改善（チップの見た目に選択中を反映する等）
    ・追加のNavigation支援機能
    具体的な実装方式（selectedSectionIdの新設要否を含む）は着手時に
    改めて設計する。Phase105時点では方式を先取りしない。

・current-issuesの他の軽量課題
```

---

## Deferred Documentation（棚卸し時に反映）

```
phase-status.md
  - Phase105完了を追記
  - Section Subsystem Progress表にNavigation行を追加
  - Major Milestones（Analysis Editor）テーブルへ Phase105行を追加

current-issues.md
  - P3（Section Selection State）をNavigation完了として更新。
    残る拡張余地は「Section Navigation UXの拡張」として
    Future Features側へ書き直す（本handoverの「次フェーズ候補」参照）

README.md（プロジェクトルート）
  - 変更不要（内部実装のみのため、利用者向けの変更なし）

section-model.md
  - §10チェックリストのPhase105該当項目にチェック
  - §9経緯ログへPhase105のエントリを追加（次回棚卸し時でも可）

architecture.md
  - Decorator Inventory表・§13.1 Runtime Projection表の該当行の
    説明文言を更新（下記「即時反映」の内容が本体で、これは表現の
    微調整のみ・Named Invariant自体には影響しない）
```

---

## ドキュメント更新ポリシー（Phase105で確定・運用ルール変更）

`docs/handover/README.md` へ以下のセクションを新設する
（`## ブランチ運用` の直後・`## 5フェーズごと（棚卸し）` の直前に挿入）。
このルール変更自体が「運用ルールそのものの変更」に当たるため、
`docs/handover/README.md` は本フェーズで即時反映する。

`docs/handover/README.md`の冒頭に下記の文を追記する
handoverはフェーズ時点の設計判断・実装経緯・検証結果を記録する履歴であり、architecture.mdの代替ではない。Named Invariantの正本はarchitecture.mdとする。

`docs/handover/README.md`の最後に下記の文を追記する
Named Invariant（[XXX]形式）の新設・意味変更・廃止を伴う場合は、
handoverへの記録に加えて、architecture.mdの該当箇所を即時更新する。

```markdown
## ドキュメント更新ポリシー（Phase105で確定）

毎フェーズ・棚卸しのどちらで各ドキュメントを更新するかの判断基準。

```
毎フェーズ必須
──────────────
✅ handover

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
・README.md（プロジェクトルート）
・architecture.mdの全体整合性チェック
```

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
```

軽量版テンプレート（`### 軽量版`セクション）にも、今回のhandoverで
有用だった項目を正式項目として追加する（設計判断・Out of Scope・
実機確認は必須ではなく、該当する内容がなければ省略してよい）。

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

## architecture.md §12への追記（Named Invariant新設のため即時反映）

`### [DECORATOR ADDITION RULE]` セクションの直後に、新規セクションとして
以下を挿入する（実機確認の結果等の実装事実は含めず、設計原則のみに
限定している）。

```markdown
### Section Navigation（Phase105で確立）

Section Barのチップクリックは、Preview表示（Phase102）に加えて
Navigation（現在選択中のSectionへ移動する）を兼ねる。

```
チップクリック
    ↓
_previewSectionId 更新（Navigation Target）
    ↓
scrollToChord(section.startChordId)   ← chartmode.js（DOM Navigation）
    ↓
setSectionPreview(...)                ← 結果としてのPreview表示
```

**[NAVIGATION OWNERSHIP]**

```
scrollToChord() は「指定されたchordIdを表示位置へスクロールする」
だけを責務とする。Section/Playback/Preview/Selectionを一切知らない。
Navigationの判断はapp.jsが行い、chartmode.jsは
Rendering / DOM Navigationのみ担当する（[DECORATOR ADDITION RULE]と
同じ「正本の導出はapp.js・chartmode.jsは渡された値を扱うだけ」という
既存原則をNavigation（スクロール）にも適用したもの）。

NavigationとPlayback（updateChartPlayback()内のscrollIntoView・
chartState.lastScrolledMeasure）は完全に独立しており、互いのstateに
触れない。
```

**_previewSectionIdの意味拡張（Phase102→Phase105）**

```
Phase102: Previewの対象のみを意味した
Phase105: 「現在選択中のSection（Navigation Target）」の意味を兼ねる
          ようになった。Navigation TargetとPreview TargetがPhase105
          では常に一致するため、状態を分離せず1つのephemeral state
          （変数）のまま意味だけを拡張している。

同じSectionの再クリックによるトグルOFFはPhase105で廃止した。
解除はEscape/空白クリック（_clearSectionPreview）経由のみ。
```
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
