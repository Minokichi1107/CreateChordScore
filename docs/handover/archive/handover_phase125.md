# 引き継ぎ: Phase125完了 — ブルーテーマ演奏モード「✕ 閉じる」ボタン視認性修正

## 作業状態
- ブランチ: phase125
- 直前作業: Phase124完了（Render Context Invariant Compliance）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Component alias token追加 | `--text-btn-close`をdefault/silver/blueの3テーマへ新設 | theme.css |
| `#btn-perform-close`通常時 | `color: var(--text-secondary)` → `color: var(--text-btn-close)` | perform.css |
| `#btn-perform-close:hover` | `color: var(--text-secondary)`を明示追加 | perform.css |

## 設計判断

```
結論: 通常時とhover時で異なるforegroundトークンを使い分ける。

  通常時: --surface-btn-close（背景）+ --text-btn-close（文字）
  hover時: --surface-raised（背景）+ --text-secondary（文字）

理由: #btn-perform-closeは背景が状態（state）によって切り替わる
  （通常時=--surface-btn-close／hover時=--surface-raised）。
  blueテーマにおいて、この2つの背景は明度が逆（通常時=暗／hover時=明）
  のため、単一のforegroundトークンでは両状態を同時に満たせない。

  当初--text-btn-close（通常時=暗背景用に新設した明色）のみで
  修正したところ、hover時（明背景）で明色×明色となり新規の
  視認性リグレッションが実機確認で発覚した。既存--text-secondary
  （「明るい背景上で使う前提」の設計・blueテーマのtheme.css内
  コメント参照）がhover時の背景（--surface-raised）と正しく
  対応することを確認し、hover時のみ明示的にこれへ戻す形で解決した。
```

## Findings（今後のTheme Audit向けの知見）

```
今回、Component tokenの背景/文字ペア設計について新しい知見を得た。

「1つのComponentは1組のsurface/textペアを持つ」という前提
（--surface-chord / --text-chordのような単純なペア）は、
背景がstateによって変化しないComponentでは十分に機能する。

しかし#btn-perform-closeのようにstate（通常/hover）ごとに
背景が入れ替わるComponentでは、ペアもstate単位で考える必要がある。

  btn-close / 通常時: surface-btn-close ↔ text-btn-close
  btn-close / hover時: surface-raised   ↔ text-secondary

将来的にTheme Token Pair Contrast Checker（current-issues.md
Future Features参照）を実装する際は、「Component単位」ではなく
「Component × state単位」でペアを定義する設計が必要になる。
今回はこの知見を記録するに留め、仕組みへの反映は行わない
（[RECORDING ADOPTION CRITERIA]と同種の「机上の追加はしない」
判断。実際にChecker実装に着手する時点で設計材料として使う）。
```

## Out of Scope

- 「復帰 〇〇秒」プルダウンのデザイン不調和（GitHub Issue #86として
  別途登録済み。Perform Mode全体のデザイン調整はPhase125のScope外）
- Theme Token Pair Contrast Checkerの実装（Future Features候補のまま。
  今回はFindingsとして知見のみ記録）
- theme.css / perform.css の全面的なトークン棚卸し（Theme Audit時に
  別途実施）

## 実機確認

たかっちさんによる実機確認を実施。全項目PASS。

```
□ default テーマ: #btn-perform-close 通常時の文字色に変化なし（回帰なし） → OK
□ silver  テーマ: 同上（回帰なし）                                        → OK
□ blue    テーマ: 通常時、文字がはっきり読める（改善確認）                → OK
□ blue    テーマ: hover時、文字がはっきり読める（追加修正の確認）         → OK
□ default / silver テーマ: hover時も含めて回帰なし                        → OK
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - 「ブルーテーマの演奏モード「✕ 閉じる」ボタンが視認できない」
    （Phase121で発見・Phase125で解消。原因は`--surface-btn-close`
    （Component alias・暗色）と`--text-secondary`（明背景想定）の
    組み合わせ破綻。通常時/hover時それぞれに適したforeground
    トークンを対応させることで解消）
- 今回新規に積み残したissue:
  - なし（current-issues.md上は）。ただし関連する新規課題を
    GitHub Issue #86として別途登録（「Perform Mode：「復帰 〇〇秒」
    プルダウンのデザイン不調和」）。今回のPhase125作業中に
    たかっちさんが発見し、current-issues.mdではなくGitHub Issue
    として記録する運用を初めて採用した（下記Findings参照）。

### 運用上の補足（GitHub Issue初併用について・Phase125限定の暫定扱い）

```
[注記] 以下はPhase125時点でのその場限りの暫定運用判断であり、
プロジェクトの正式ルールとして確定・変更したものではない。
GitHub Issue自体の状態管理ルール（open/close運用等）も今回は
一切変更していない。正式なルール化を行うかどうかは、次回の
運用棚卸し（README.md参照）でたかっちさんが判断する。

今回、current-issues.md（ファイルベースのバックログ）に加えて、
GitHub Issue #86という形式でも課題を記録した。これは本プロジェクトで
初めての事例であり、[FILE SCOPE INVARIANT]（current-issues.mdは
open issuesのみを保持する）との役割分担が今後論点になりうる、
という「気づき」の記録に留める。

Phase125限定でClaudeが便宜的に採用した整理（正式ルールではない）:
  current-issues.md … 引き続きバックログの正本（truth source）
  GitHub Issue      … 実装着手時のタスク管理・PR紐付け用の補助的な記録

今回はcurrent-issues.md「3. UI改善」セクションにも同一内容を追記し
（GitHub Issue #86の番号を併記）、Phase125時点では正本が二重化
しない状態にした。ただし、これを恒久的な運用として継続するかは
未決定であり、次回棚卸し時に改めてREADME.mdへの反映要否を判断する。
```

## 積み残し・保留バグ

Phase125のスコープ内での積み残し：なし。

## 次フェーズ候補

- GitHub Issue #86（「復帰 〇〇秒」プルダウンのデザイン不調和）への着手
  （着手時にPerform Mode CSSを再確認し、既存token活用か新規Component
  token追加かを設計フェーズから判断する）
- Theme Token Pair Contrast Checker（Future Features候補。着手条件は
  Theme Audit実施のタイミングと合わせて判断）

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- ブルーテーマの演奏モード「✕ 閉じる」ボタンが視認できない
  （Phase121で発見・Phase125で解消。詳細は上記参照）

#### ADD
- 見出し: 演奏モード「復帰」プルダウンのデザイン不調和（GitHub Issue #86）
  状態: 未対応
  内容: `#perform-controls`付近の「復帰 5秒▼」のプルダウンが、周囲のUI
  （ダイアグラム/文字サイズ/CAPO表示等）と見た目が調和していない。
  具体的な方向性（既存token活用か新規デザインか）は着手時に検討する。
  GitHub Issue #86で追跡。

- 見出し: Theme Token Pair Contrast Checker（Phase125で発見・提案）
  状態: 未着手・優先度低
  内容: Component tokenのbackground/foregroundペア（例:
  --surface-btn-close / --text-btn-close、--surface-chord / --text-chord）
  について、3テーマ分のWCAGコントラスト比を一括計算する簡易Node.js
  スクリプトの導入案。Phase125のFindingsにより、Component単位ではなく
  「Component × state（通常/hover等）」単位でペアを定義する必要が
  あると判明。CIには組み込まず、手動実行のみを想定。Theme Audit実施時に
  あわせて検討する。

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ ブルーテーマ演奏モード「✕ 閉じる」ボタン視認性修正（Phase125・
    `--text-btn-close`をComponent aliasとして3テーマへ新設。通常時/
    hover時で背景の明暗が逆転するテーマ（blue）に対応するため、
    hover時のみ`--text-secondary`へ戻す設計を採用。「Component単位」
    ではなく「Component×state単位」でforeground/backgroundペアを
    考える必要があるという知見を獲得（Theme Token Pair Contrast
    Checker設計へ反映予定））

- Major Milestones（Perform Mode関連。新規テーブル行として追加候補）:
  | 125 | ブルーテーマ演奏モード閉じるボタン視認性修正（`--text-btn-close`
    新設・通常時/hover時のforeground/backgroundペアをstate単位で整理。
    GitHub Issue #86を新規発見事項として分離登録） | theme.css / perform.css |

- Future Candidates: Theme Token Pair Contrast CheckerをFindings付きで
  更新（「Component×state単位」の設計が必要という条件を追記）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
