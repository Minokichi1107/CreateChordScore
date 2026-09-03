# 引き継ぎ: Phase127-E①完了 — External Check（🟢 外部資料確認）機能

## 作業状態
- ブランチ: phase127-e-provenance-popover
- 直前作業: Phase127-D'完了（Provenance Tooltip機構の刷新）

> [Phase継続性メモ] Phase127-F（①〜④・F② Structure Sync）は本handoverより
> 前に完了・commit-ready済み（`phase127-f_snapshot.md`参照）。本handoverは
> Phase127-E系列（D' → E①）の続きであり、Fの内容を再検討・変更しない。

---

## 1. Purpose（目的）

`raw.provenance.externalCheck`（データモデルはPhase127-Bで設計済みだが書き込み
経路が存在しなかった）を、実際にユーザーが操作して記録できる状態にする。
当初計画では「Provenance Popover」を先に作る予定だったが、たかっちさんの判断で
「Popoverより先に🟢そのものを使える状態にする」という順序へ変更した
（詳細な経緯はチャット履歴参照。本ファイルは実装確定後の正式記録）。

---

## 2. Scope（今回やったこと）

- `externalCheck`（checked / reference / url / checkedAt / memo）の
  唯一の書き込み窓口 `writeExternalCheck()` を新設
- 編集用モーダル（`openExternalCheckModalFor()` / `_openExternalCheckModal()`）を新設
- Library一覧: 行の右クリックでコンテキストメニューを表示し、そこから編集
- Chart Modeヘッダー: 🟠🔵ドットの右クリックで直接モーダルを開く
  （実装途中でLibrary/Chart Modeの操作方法を統一する方が優れていると判明し、
  当初案の「ファイル▼メニュー」から変更した。§6 Findings参照）

---

## 3. Out of Scope（今回はやらないと決めたこと）

- Provenance Popover本体（127-E②として別途実装）
- 🟡（hasContentEdit）がsilver/blueテーマで茶色寄りに見える件の色調整
  （Phase78由来の既存`--color-amber-rgb`の値そのものが原因であり、今回の
  変更とは無関係。current-issues.md Issue #28へ追記予定。§7参照）
- Library一覧から曲を開かずに複数曲を一括でExternal Check登録する機能

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `writeExternalCheck()` | externalCheckの唯一の書き込み窓口。対象が今開いているプロジェクトか否かで書き込み方式を自動分岐 | app.js |
| `openExternalCheckModalFor()` / `_openExternalCheckModal()` | モーダルの起動・本体。既存の`openModal()`基盤を再利用 | app.js |
| `_setupLibraryContextMenu()` 等 | Library行の右クリックメニュー。`chartmode.js`の`_setupContextMenu()`（Phase72）と同一の実装パターンを踏襲 | app.js |
| `.library-context-menu` / `.library-context-item` | 右クリックメニューのスタイル。`chart.css`の`.chart-context-menu`と同一の視覚言語 | library.css |
| `renderProvenanceDots()` | tooltip文言へ「右クリックで外部資料確認を編集」のヒントを常時追記するよう変更 | app.js |
| `_onExternalCheckRequested`コールバック | Chart Modeヘッダーの`.provenance-dots`右クリックをapp.jsへ通知する注入コールバック | chartmode.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] checkedAtの更新条件

```
結論: checkedがfalse→trueに変わった瞬間のみ現在時刻を記録する。
      true→trueのまま参照元/URL/メモだけを変更しても更新しない。

理由: 「この内容について外部資料と照合した時刻」という意味を保つため。
      メモを直しただけで確認日時が更新されると、あたかも再照合したかの
      ように見えてしまう（ChatGPT Reviewでの指摘）。
```

### [判断] チェック解除時の情報保持

```
結論: checked=falseで保存しても、reference/url/memo/checkedAtは
      すべて保持する。全消去は「確認情報をクリア」ボタンでフォーム入力
      を空にしてから保存した場合のみ発生する（本関数自体は保持と消去を
      区別しない。渡されたpatchをそのまま反映するだけ）。

理由: 「一旦未確認に戻したが、以前どの資料を見ていたか」を後から
      参照できる方が実用的（たかっちさんの要望）。
```

### [判断] Analysis Editor編集中でも操作可能にする（無効化しない）

```
結論: 「今開いているプロジェクト」への書き込みは、Analysis Editorの
      編集セッション状態（active/dirty）に関わらず常に許可する。

理由: 既存コード調査（backfillContentEditProvenance()が現在開いている
      プロジェクトを対象外にしている実装）から、「今開いているプロジェクト」
      の場合はproject.analysis.raw（メモリ上の生きた正本）を直接書き換えて
      保存すればよいと判明した。

      External Checkの書き込みはanalysisEditor.buffer（Analysis Editorの
      未保存編集領域）を一切変更しない。External Checkが変更するのは
      raw.provenance.externalCheckのみである。そのため、External Check
      操作自体が未保存bufferの内容を直接上書き・破壊する競合にはならない
      （bufferとraw.provenance.externalCheckは別フィールドであり、
      Analysis Editorが後からsaveAnalysisEdit()でbufferをraw.chordsへ
      書き戻す際も、External Checkが既に更新済みのraw.provenance
      .externalCheckフィールド自体には触れないため、この操作順序に
      おいて情報が失われることはない）。

      これにより、当初検討していた「編集中は無効化する」という制約
      （Authority競合を懸念したChatGPTの提案）が不要になった。
```

### [判断] Chart Modeの操作導線をファイル▼メニューから右クリックへ変更

```
結論: 当初案（ファイル▼メニューに項目追加）は撤回。ヘッダーの
      🟠🔵ドットを右クリックすると直接モーダルが開く方式へ変更した。

理由: 実機確認で、Chart Modeが全画面オーバーレイであり通常のヘッダー
      （ファイル▼含む）を完全に覆っていることが判明。ファイル▼自体に
      到達できないという設計上の見落としだった（§6 Findings参照）。

      修正にあたり、Library一覧と同じ「右クリックで開く」という
      一貫した操作方法に統一した。Chart Modeは対象が常に「今開いている
      曲」1つしかないため、Library一覧のような複数項目メニューは不要と
      判断し、右クリックで直接モーダルを開く設計にした（メニューを
      経由しない分、たかっちさんの実機確認でも「ワンアクション少なく
      速い」と好評だった）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- **Chart Modeが全画面オーバーレイでヘッダーを覆う**: Technical Design段階の
  想定不足。「ファイル▼から操作できる」という前提は実機確認で誤りと判明した。
  今後Chart Mode表示中に通常ヘッダーの機能を使わせたい場合は、同様の見落としが
  起こりうるため要注意（Chart Modeヘッダー自身に機能を追加する設計を優先すべき）。
- **backfillContentEditProvenance()の`p.id !== project.id`除外**が、今回の
  「今開いているプロジェクト/それ以外」の書き込み方式分岐の設計根拠になった。
  既存コードに答えがあった好例。
- **`renderProvenanceDots()`のヒント文言**は当初「Library限定」で実装したが、
  Chart Mode側も右クリック対応した結果、区別が不要になり削除した
  （実装が先行し、後から仕様がシンプルになった一例）。

---

## 7. 積み残し・保留

- 🟡（hasContentEdit）がsilver/blueテーマで茶色寄りに見える件
  （`--color-amber-rgb`がPhase78から意図的に暗色定義されているため。
  今回のPhase127-E①の変更とは無関係。current-issues.md「Issue #28 —
  Decorator視認性優先原則の既存Decoratorへの適用確認」の対象候補へ追記予定）
- Provenance Popover本体（127-E②）

---

## 8. 実機確認

たかっちさんによる実機確認を実施。全項目PASS（🟡の色は既知の別issueとして分離）。

```
□ Library一覧の行を右クリック → メニューが出る                              → OK
□ メニューから「外部資料確認を記録」→ モーダルが開く                         → OK
□ チェックON＋参照元/URL/メモ入力 → 保存 → 🟢が付く                         → OK
□ 再度開く → 入力内容が復元される                                           → OK
□ チェックを外して保存 → reference/url/memoが残っている                     → OK
□ 「確認情報をクリア」→ フォーム上のみ即時クリア。キャンセルで復元           → OK
□ Chart Modeヘッダーのドット右クリック → モーダルが開く                     → OK
□ Analysis Editor編集中（保存前）でも同様に開いて保存できる                  → OK
□ Library一覧クリック（通常）で曲が開く挙動に変化がない（右クリックとの衝突なし）→ OK
△ 3テーマでの見た目（🟡がsilver/blueで茶色寄り）                            → 既知・別issue化
```

---

## 9. 次フェーズ候補

- Phase127-E②（Provenance Popover）: 🟡🔵🟢すべての詳細を1つの詳細UIへ
  統合する構想（Phase127-B時点の想定）。今回のExternal Check編集UI
  （右クリックモーダル）をそのまま流用・発展させる形が自然。
- Issue #28への🟡色問題の追記（軽微・別途対応）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- No changes.

#### MODIFY
- 見出し: Issue #28 — Decorator視認性優先原則の既存Decoratorへの適用確認
  変更内容: 対象候補へ以下を追加する。
  「provenance-dot--content（🟡）が、silver/blueテーマで--color-amber-rgb
  （Phase78由来の暗色定義）を継承しているため、暗めの茶色に見える
  （Phase127-E①の実機確認で発見）。実害は軽微（識別は可能）だが、
  次回Theme Audit時に確認候補とする。」

#### CLOSE
- No changes.
  （External Check自体はPhase127-B時点で「未実装のダミーフィールド」として
  current-issues.mdに明示的なOpen Issue項目があったわけではないため、
  CLOSE対象なし）

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ External Check（🟢 外部資料確認）機能（Phase127-E①・raw.provenance
    .externalCheckの書き込み経路を新設。Library一覧（行の右クリック）・
    Chart Modeヘッダー（ドット右クリック）の両方から編集可能。
    checkedAtはfalse→true遷移時のみ更新。チェック解除時もreference/url/
    memoは保持し、「確認情報をクリア」操作でのみ全消去する設計）

- Future Candidates: 以下を追加
  - Phase127-E②（Provenance Popover本体。🟡🔵🟢を1つの詳細UIへ統合）
  - Issue #28への🟡色問題の追記（軽微・別途対応）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
