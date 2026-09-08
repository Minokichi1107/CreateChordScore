# 引き継ぎ: Phase128前半完了 — Chart Modeからのコードダイアグラム登録機能

## 作業状態
- ブランチ（想定）: `phase128-chart-diagram-registration`
- 直前作業: Phase127完了（main）
- 対象Issue: GitHub Issue #93 のうち **B（Chart Modeからの登録）** のみ
- Issue #93のもう一方（A: 部分バレー表現の拡張）は本フェーズの対象外。次フェーズ（Phase128後半）でExplorationから改めて着手する

---

## 1. Purpose（目的）

Chart Modeを離れずに、コードダイアグラムの登録・編集ができるようにする。
既存の通常画面の登録モーダルを再利用し、新規UIは作らない方針で進めた。

---

## 2. Scope（今回やったこと）

- Chart Modeのコードセル（onsetのみ）を右クリックすると、既存の小節頭補正メニューに
  「🎸 コードダイアグラムを登録／編集する」項目が追加されるようにした
- 既登録コードは編集モーダル（既存frets/barreを復元）、未登録コードは新規登録モーダルを開く
- 通常画面の`openAddDiagramModal()` / `openEditDiagramModal()`をそのまま再利用（新規モーダルは作っていない）

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **部分バレー（Partial Barre）表現の拡張**：Issue #93のA。データモデル・描画ロジックの
  両方に関わる大きめの作業のため、Phase128後半として完全に別のExplorationから着手する
- **Chart Mode専用の簡略登録UI**：既存モーダルの再利用で要件を満たせたため見送り
- **carryセルからの登録**：onsetセルのみを対象とする設計判断（誤操作防止。§5参照）
- **複数variantの選択UI**：1つのコード名に複数のカスタムvariantが登録されている場合、
  Chart Mode側には選ぶUIがなく、最初に見つかったカスタムvariantを編集対象にする
  （§6 Remaining Issues参照）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| 右クリック検知拡張 | `.chart-slot`右クリック時、そのセルがonsetかどうかを座標ベースで判定し、コード名を取得 | chartmode.js |
| メニュー項目追加 | 既存の`_showContextMenu()`に、onset時のみ「コードダイアグラムを登録／編集する」項目を追加 | chartmode.js |
| コールバック新設 | `initChartMode()`に`onDiagramRegisterRequested`を追加。chartmode.jsは通知のみ行い、モーダルは開かない | chartmode.js |
| 登録／編集の呼び分け | コード名から`_id`を持つカスタムvariantを検索し、あれば`openEditDiagramModal()`、なければ`openAddDiagramModal()`を呼ぶ | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] ダイアグラム登録の対象はonsetセルのみ・carryセルは対象外

```
結論: 右クリックの当たり判定自体は.chart-slot全体のまま。ただし
      メニュー項目を表示するのはonsetセルのみ。carryセル・emptyセルは
      従来通り（小節頭補正メニューのみ、または何も出ない）。

理由: carryまで対象にすると、同一コードの継続表示領域全体がダイアグラム
      操作対象になり、既存のセル単位操作（小節頭補正）との意図が混ざって
      誤操作を誘発しうる。onset限定にすることで「そのコードを代表する
      操作地点」を1箇所に固定する（実装コスト回避が理由ではない）。
```

### [判断] 新しい右クリックイベントリスナーは作らず、既存メニューに項目を追加する

```
結論: 既存の.chart-slot右クリック（小節頭補正メニュー）に項目を1つ
      追加するだけにとどめ、別の右クリックハンドラは新設しない。

理由: .chart-chord-name（コード名ラベル）は.chart-slot（セル）の
      子要素であり、既存の右クリック処理は既にコード名の上でも発火する
      構造だった。別ハンドラを作ると当たり判定の競合・優先順位の問題が
      生じるため、既存メニューを拡張する形に統一した。
```

### [判断] 既登録／未登録で呼び出す関数を分ける

```
結論: コード名から`_id`を持つカスタムvariantを検索し、
      見つかれば openEditDiagramModal()、なければ openAddDiagramModal()。

理由: 当初「登録／編集する」という中立的な文言で openAddDiagramModal()
      のみを呼ぶ設計にしていたが、実機検証で「既登録コードを開いても
      空のモーダルになる」バグとして発覚した。openAddDiagramModal()は
      常に空欄から始まる関数であり、既存内容の復元はopenEditDiagramModal()
      の役目だったため、呼び分けが必要だった。

      編集対象にできるのは_idを持つカスタムvariantのみ（プリセット
      内蔵variantは_idを持たず編集不可。通常画面の✏️ボタンと同じ判定
      条件をそのまま踏襲）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### `scrollWidth`は「文字の幅」ではなく「箱の幅」を返すことがある（重要）

```
実機検証で「コード表記がない（空白）部分を右クリックしてもメニュー項目が
出てしまう」バグが発覚した。

原因: 当初、hover tooltipの実装（Phase67）を参考に、.chart-chord-name
（コード名ラベル）のscrollWidthを使って「文字が実際に表示されている
範囲」を判定しようとした。しかしscrollWidthは、要素の中身が要素の幅より
狭い（＝はみ出していない）場合、はみ出し量ではなく「要素自体の幅
（clientWidth相当）」を返してしまうというブラウザの仕様がある。

「D」のように短いコード名が複数スロット分の広い箱（carry-forward表示用に
CSSで幅が広げられている）に入っている場合、文字自体は狭いのに箱は広い
→ scrollWidthは「広い箱の幅」を返してしまい、文字の右側の空白部分まで
「文字が表示されている範囲」と誤判定していた。

対応: DOM階層（closest()）に頼らず、document.elementsFromPoint(x, y)で
その座標に実際に重なっている全要素を取得し、その中から本当の
.chart-slot[data-visual-slot-index]を直接特定する方式に変更した。
これによりラベルの見た目の広さに影響されず、正確な判定ができるように
なった。

[注記] hover tooltip（Phase67）自体は、この問題があっても実用上は
「同じコードの継続表示領域内でその同じコードのtooltipが出る」という
挙動になるだけで、ユーザーには目立つ不具合として現れなかったと推測される
（今回は明示的なメニュー項目という「出る/出ない」がはっきり分かる機能
だったため顕在化した）。hover tooltip側の同種の潜在課題については
本フェーズのスコープ外とし、current-issues.mdへ記録する（§8参照）。
```

### プリセット（内蔵）コードは編集できない仕様は通常画面と同一

```
既存のCHORD_DBには、プリセット（_idを持たない）とユーザー登録
カスタム（_idを持つ）が混在する。通常画面の右パネルでも、編集
（✏️）ボタンはカスタムvariantにのみ表示され、プリセットは編集
対象外という既存仕様がある。

今回のChart Mode連携もこの既存の判定条件（_idの有無）をそのまま
踏襲した。実機検証で「プリセットのコードを右クリック→編集しても
復元されない」という報告があったが、これは通常画面と一致した
既存仕様どおりの動作であり、新規バグではない（開発者に確認済み・
現状のままで問題ないとの回答）。
```

---

## 7. 実機確認

たかっちさんによる実機確認を実施。全項目PASS。

```
□ Chart Modeでコードがあるセル（onset）を右クリック
  → 「ここを小節頭にする」と「コードダイアグラムを登録／編集する」の
    両方がメニューに表示される                                    → OK
□ 未登録のコード名で登録 → 保存 → 右パネル・ライブラリ双方に反映される → OK
□ 既登録のコード名（カスタムvariant）で開く → 既存内容が復元される     → OK
  （プリセットは非対応・通常画面と同一仕様のため許容。§6参照）
□ 継続表示セル（carry）を右クリック → ダイアグラム項目が出ない        → OK
  （「D」等の短いコード名でも、文字の右側の空白部分で正しく判定される）
□ 空セルを右クリック → 従来通りの表示のまま                        → OK
□ 登録モーダルがChart Modeの上に正しく重なって表示される            → OK
□ モーダルをキャンセル／保存で閉じる → Chart Modeの表示が維持される  → OK
□ Analysis Editor編集中（保存前）でも同様に開いて登録できる          → OK
□ 3テーマ（dark/silver/blue）でメニュー項目の見た目に問題がない      → OK
□ hoverツールチップ表示中に右クリック → ツールチップが消えてメニューのみ表示 → OK
```

---

## 8. current-issues.mdへの反映（該当issueがある場合）

- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - hover tooltip（Phase67）にも、今回発見したscrollWidthの仕様上の
    落とし穴（短いコード名が複数スロット分広い箱に入っている場合の
    判定不正確さ）が理論上は存在する可能性がある。ただし実害の報告は
    なく、優先度低として記録のみ行う（§6参照）
  - 複数のカスタムvariantが同一コード名に存在する場合、Chart Modeの
    右クリック経由では最初に見つかったものが編集対象になり、選択UIが
    ない（意図的な現状の割り切り。§3 Out of Scope参照）

---

## 9. 次フェーズ候補

**Phase128後半（Issue #93のA: 部分バレー表現の拡張）** に着手する。

新Chatで、以下をExplorationから改めて着手すること（本Handoverの前半実装を
引きずらず、独立した設計判断として進める）。

```
現在のデータモデル: { f: [フレット配列], b: バレーフレット番号（単数） }

検討が必要な論点（Phase128 Exploration Reportより）:
  ・バレーする弦の範囲をどう表現するか（現在は自動算出のみ）
  ・複数バレーを許容するか
  ・バレーより低いフレットの単独運指をどう描画するか（現状 sf=barre 固定）
  ・ミュート弦がバレー範囲の途中にある場合、バレー帯を分断できるか
  ・既存データ（b: 単数）との後方互換性
  ・登録UI（buildDiagramForm）側の入力項目拡張
```

---

## Files Changed（変更ファイル一覧）

```
js/chartmode.js
  ・_onDiagramRegisterRequested コールバック変数を新設
  ・initChartMode() のパラメータに onDiagramRegisterRequested を追加
  ・_showContextMenu() のシグネチャに diagramChordName を追加し、
    onset時のみメニュー項目を条件付き追加
  ・_setupContextMenu() のcontextmenuハンドラ内で、
    document.elementsFromPoint()を使った座標ベースのonset判定を追加
  ・右クリック時にhover tooltipを閉じる処理（_hideTooltip()）を追加

js/app.js
  ・initChartMode() 呼び出しに onDiagramRegisterRequested を追加
    （既存カスタムvariantの有無で openEditDiagramModal / 
    openAddDiagramModal を呼び分け）
```

---

## Micro Log

（フェーズ完了につき本文へ整理済み。本セクションは削除）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: Chart Mode hover tooltipのscrollWidth判定に理論上の不正確さがある可能性
  状態: 未確認・優先度低（Phase128前半で発見）
  内容: Phase128前半の実装調査で、`.chart-chord-name`のscrollWidthが
  「文字の実際の幅」ではなく「要素自体の幅（carry-forward表示用に広げた
  箱の幅）」を返すケースがあることが判明した（短いコード名が複数スロット
  分の広い箱に入っている場合）。Phase128前半の新規コンテキストメニュー
  機能ではこの問題を座標ベース判定（`elementsFromPoint()`）に置き換えて
  解消したが、既存のhover tooltip（Phase67）自体は依然としてscrollWidthを
  使用したままであり、理論上は同じ不正確さを持つ可能性がある。ただし
  実害の報告は無く、hoverの場合は「同じコードの継続表示領域内で同じ
  コードのtooltipが出る」だけで目立つ不具合にはなりにくいと推測される。
  優先度低として記録のみ行う。

- 見出し: Chart Modeからのダイアグラム登録は複数カスタムvariantの選択に非対応
  状態: 未対応・優先度低（Phase128前半・意図的な現状の割り切り）
  内容: 1つのコード名に複数のカスタムvariant（_idを持つ登録）が既に
  存在する場合、Chart Modeの右クリック経由では最初に見つかったものが
  編集対象になる。Chart Mode側にはvariantを選択するUIがないため。
  通常画面の右パネルでは複数variantを一覧・個別編集できるため、
  必要であれば通常画面側から編集する。将来variant選択UIが必要になれば
  別途検討する。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Chart Modeからのコードダイアグラム登録機能（Phase128前半・
    GitHub Issue #93のB。onsetセルの右クリックメニューへ項目を追加し、
    既存のopenAddDiagramModal() / openEditDiagramModal()を再利用。
    document.elementsFromPoint()による座標ベースのonset/carry判定を
    確立。既登録／未登録の呼び分けは既存の_id判定基準をそのまま踏襲）

- Future Candidates: 以下を追加
  - Phase128後半（GitHub Issue #93のA: 部分バレー表現の拡張）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
