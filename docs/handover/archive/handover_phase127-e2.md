# 引き継ぎ: Phase127-E②完了 — Provenance Popover本体の実装

## 作業状態
- ブランチ: phase127-e-provenance-popover
- 直前作業: Phase127-E①完了（External Check〈🟢 外部資料確認〉機能）

---

## 1. Purpose（目的）

`raw.provenance`（🟡 hasContentEdit / 🔵 hasStructureEdit / 🟢 externalCheck）の
状態・詳細を、右クリックひとつでその場で確認できる参照UI（Provenance Popover）
を新設する。Phase127-D'（Tooltip基盤）・Phase127-E①（External Check編集機能）
に続く、Provenance機能シリーズの仕上げにあたる。

---

## 2. Scope（今回やったこと）

- Provenance Popover本体（`showProvenancePopover()`）の設計・実装
  - 操作導線の設計を複数往復で検討し、「右クリック→詳細Popover（一次確認UI）→
    『確認情報を編集する』→既存Modal（二次編集UI）」の一本道に確定
  - Context Menuを挟む案（見る/編集の2択メニュー）を検討したが不採用
- Library・Chart Modeの右クリックを、旧`.library-context-menu`（Phase127-E①）
  から新Popoverへ完全に置き換え
- hover Tooltip（textTooltip.js経由・Phase127-D'）を廃止し、Popoverへ一本化
  （`[TOOLTIP CONSOLIDATION]`。5節参照）
- Popover表示時の体感の詰まり（強制同期リフロー）を回避するため
  requestAnimationFrame化
- Windows環境（CRLFファイルへのpatch適用）での実装トラブルシューティング

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **Context Menuを挟む案**：「見る／編集」を選択させる中間ステップは、
  Popover自体が既に十分な情報量を持つため不要と判断し採用しなかった（5節）
- **Library / Chart Modeでの右クリック当たり判定の統一**：Library＝行全体、
  Chart Mode＝dotグループ限定、という既存の非対称は維持した（5節）
- **表示のカクつきに対する追加対応**：実機確認の結果「今開いている曲＝同期
  即時表示」「それ以外の曲＝非同期『読み込み中…』→差し替え」という設計通りの
  挙動であると判明し、Issueとして扱わないことで合意した（6節）
- **textTooltip.jsモジュール自体の削除**：Provenance専用実装ではなく「1行
  テキストの汎用tooltip」として設計された独立サブシステム（Phase127-D'）の
  ため、呼び出し元が無くなった（orphaned）状態のまま残置した（7節）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| Provenance Popover本体新設 | `showProvenancePopover()` / `_renderProvenancePopoverBody()` / `_positionProvenancePopover()` / `_bindProvenancePopoverEditButton()` / `_hideProvenancePopover()` / `_setupProvenancePopoverEvents()` | app.js |
| Library右クリック接続 | `_setupLibraryContextMenu()`を旧Context Menu実装からPopover呼び出しへ置き換え | app.js |
| Chart Mode右クリック接続 | `onExternalCheckRequested`コールバックのシグネチャを`()`→`(clientX, clientY)`へ変更 | chartmode.js / app.js |
| hover Tooltip廃止 | `renderProvenanceDots()`から`data-tooltip`属性生成を削除。Library側のhover/tapイベント配線、Chart Mode側の`_setupProvenanceTooltipEvents()`を全撤去 | app.js / chartmode.js |
| textTooltip配線撤去 | `import * as textTooltip`・`textTooltip.init()`・`initChartMode()`への`showTextTooltip`/`hideTextTooltip`注入を削除 | app.js / chartmode.js |
| Popover用CSS新設 | `.provenance-popover`系スタイル（Library/Chart Mode共有） | components.css |
| 旧Context Menu CSS削除 | `.library-context-menu` / `.library-context-item` | library.css |
| dotのcursor変更 | `default` → `context-menu`（hover Tooltip廃止に伴うaffordance補完） | components.css |
| パフォーマンス修正 | `_positionProvenancePopover()`内の`getBoundingClientRect()`呼び出しを`requestAnimationFrame`で次フレームへ遅延（強制同期リフロー回避） | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Context Menuを挟まずPopoverを直接開く

```
結論: 右クリック → 詳細Popover（一次確認UI）→「確認情報を編集する」→
      既存Modal（二次編集UI）の一本道とする。中間のContext Menu選択肢は設けない。

理由: 検討の初期段階では「見る／編集」の2択メニューを挟む案（Context Menu
      経由）を提示したが、議論の結果、Popover自体が🟡🔵🟢すべての状態と
      詳細情報を一括表示する以上、これ自体が独立した価値（現在の編集・確認
      状態を確認すること）を持つと判断した。中間選択を挟むと常に1操作
      多くなり、Popoverの情報量を考えれば「まず見せる」方が自然だった。

      なお、E①で実機確認済みだった「右クリック→即座に編集モーダル」という
      UXの入口（右クリック）自体は変更していない。直後に出るUIを
      Context MenuからPopoverへ差し替えただけ、という理解。
```

### [判断] Library / Chart Modeで右クリックの当たり判定を統一しない

```
結論: Library=行全体が右クリック対象、Chart Mode=.provenance-dots限定、
      という既存の非対称のまま維持する。

理由: 「操作体系（右クリック→Popover→編集）」の統一と「当たり判定の範囲」
      の統一は別の関心事である。Libraryは元々「行のどこを右クリックしても
      その曲に対する操作ができる」という既存の一般原則があり、Provenance
      専用に狭める理由がない。Chart Modeはヘッダー全体に他の右クリック機能
      （小節頭補正メニュー）が既に存在するため、dotグループへの限定が必然。
```

### [判断・確立] `[TOOLTIP CONSOLIDATION]`（hover Tooltipの廃止）

```
結論: hover Tooltip（textTooltip.js経由・Phase127-D'）は廃止し、dotの
      情報表示を右クリックPopoverへ一本化する。

理由: Popoverが🟡🔵🟢すべての状態と詳細（参照元/URL/確認日/メモ）を
      まとめて表示するため、Tooltipの「1行説明」はPopoverの表示内容に
      完全に包含される（情報として重複するだけで、Tooltip独自の価値がない）。

      加えて実装調査で、dotをhoverした直後に右クリックするとTooltipを
      閉じる処理がどこにも無く、Tooltip残留とPopoverの座標重なり（両者とも
      z-index:9999・ほぼ同一座標）が構造的に起こることが判明した。個別に
      hideを都度追加する対症療法ではなく、表示経路自体を1つに絞ることで
      再発を防ぐ設計とした。

      textTooltip.js（モジュール本体）は削除しない。Provenance専用実装
      ではなく「1行テキストの汎用tooltip」として設計された独立サブシステム
      であり、別用途での再利用に備えて残す（現時点では呼び出し元が無く
      orphanedの状態。7節・current-issues.md参照）。
```

### [判断] Popoverの位置補正をrequestAnimationFrameで遅延

```
結論: _positionProvenancePopover()内のgetBoundingClientRect()呼び出しを、
      appendChild()直後の同期実行からrequestAnimationFrame()による次フレーム
      実行へ変更した。

理由: appendChild()直後にgetBoundingClientRect()を呼ぶと、ブラウザは
      ページ全体の未処理レイアウトを同期的に強制完了させてから値を返す
      （forced synchronous reflow）。Library一覧のように行数が多いDOMでは
      これがメインスレッドを一瞬ブロックし、「枠だけ先に描画され、少し
      遅れて中身が確定する」ように見える体感の詰まりを引き起こしうる。

      [結果的な位置づけ] 実機確認の結果、報告された「カクつき」の実体は
      この強制リフローではなく、非同期取得（他の曲のPopover）の意図された
      「読み込み中…」表示だったと判明した（6節）。そのため本修正は
      「発生していたバグの修正」ではなく「副作用のないパフォーマンス改善」
      という位置づけに変わったが、実害のない改善のため実装は維持した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 「カクつき」報告の実体は非同期取得の正常挙動だった

```
実機確認で「編集・確認の状態から下の表示がカクつく」という報告を受け、
当初はPopover自体のレンダリング不具合（forced reflow等）を疑い調査・
修正を行った。

しかし詳細確認の結果、以下の通り整理できた:

  今開いている曲    : project.analysis.raw.provenance を同期参照 → 即時全体表示
  それ以外の曲      : loadAnalysisFile()による非同期取得が必要
                      → 「読み込み中…」枠を先に表示 → 完了後に差し替え

「読み込み中→詳細表示」という体感は、非同期経路（他の曲）でのみ発生する
設計通りの挙動であり、バグではないと結論づけた。requestAnimationFrame化
（5節）自体は無害な改善のため維持したが、これが今回の報告の直接的な
解決策だったわけではない。

教訓: UIの「詰まり」を報告された際、症状の再現条件（今回で言えば
「今開いている曲か・別の曲か」）を先に切り分けることが、不要な調査・
修正を避ける近道になる。
```

### Windows環境でのCRLFファイルへのpatch適用トラブル

```
chartmode.js（CRLF形式）へ変更を加える際、当初はファイル全体を
一括でCRLF正規化する実装を行った。これによりdiffが実際の変更行数
（数行）に対して不自然に肥大化し（3093行中ほぼ全行が変更対象になった）、
Windows環境でのgit apply時に改行コード変換が二重にかかってファイルが
破損した（ブラウザ上で"Unexpected end of input"エラー）。

対応: ファイル全体の書き換えを避け、Pythonで行単位に分割し、実際に
変更する行だけをCRLFのまま置換する方式に変更した。これによりdiffは
実際の変更量（十数行程度）に縮小し、patch適用も安定した。

教訓: CRLFファイルへの機械的な一括変換（全体正規化）は、diffの
肥大化とクロスプラットフォームでの適用リスクを生む。既存のCRLF
ファイルを編集する際は、変更対象の行だけを厳密にCRLFへ合わせる
方式を徹底する。
```

### コード内コメントのフェーズラベル不整合（「Phase127-E③」表記）

```
実装時、js/app.js・js/chartmode.js内のコメントで、hover Tooltip廃止
（[TOOLTIP CONSOLIDATION]）部分を「[Phase127-E③]」という内部ラベルで
記述していたことに、本handover作成・ChatGPT監査の過程で気づいた。

事実関係: 「Phase127-E③」という独立フェーズは正式に開始されておらず、
Tooltip廃止はPopover本体実装と同じPhase127-E②のスコープ内で行った
作業である。本handoverは全体を一貫してE②として記録している。

対応: 本handover文書内は全てE②表記に統一済み（上記current-issues.md
記載の「Phase127-E③で発見」もE②へ修正済み）。コード内コメントの
「[Phase127-E③]」表記自体は今回のhandover作成では修正していない
（コード変更を伴うため、次回何らかの理由でこれらの行に触れる際に
ついでに修正する程度の優先度と判断。実害はなく、grep時に多少の
違和感が生じる程度）。
```


---

## 7. Remaining Issues（残課題）

> [Documentation状態の注記] 以下2件は本handoverのDeferred Documentation
> （10節）へADDとして記録済みだが、current-issues.md自体への反映は
> 次回のDocumentation Checkpoint（棚卸し）まで未実施である
> （docs/handover/README.mdの運用ルール通り）。「記録した」ことと
> 「current-issues.mdへ反映済み」であることを混同しないよう、次回
> Checkpoint実施時にこのhandoverのDeferred Documentationが正しく
> 適用されたか確認すること。

### textTooltip.jsがorphaned module（呼び出し元なし）になった

```
状態: 未対応・優先度低（Phase127-E②で発見）
内容: hover Tooltipの廃止（[TOOLTIP CONSOLIDATION]）に伴い、app.js・
chartmode.jsのどちらからもtextTooltip.jsを呼び出す箇所が無くなった。
モジュール自体は「1行テキストの汎用tooltip」として設計された独立
サブシステム（Phase127-D'）であり、Provenance専用実装ではないため、
削除はせず残置している。将来の別用途（何らかのhover説明UI等）で
再利用されるか、一定期間経っても使われなければ削除を検討する。
splitChord()の扱い（Phase121で発見・現在current-issues.mdに記録済みの
デッドコード候補）と同種の扱いとする。
```

### Naming debt（命名と実装意味の不整合）

```
状態: 未対応・優先度低（ChatGPT Review・handover監査で指摘）
内容: `_setupLibraryContextMenu()`（Popover呼び出しへ変更済み）・
`onExternalCheckRequested`（現在はPopover表示のための座標通知に使用）
は、いずれも旧UI設計（Context Menu / 直接編集モーダル）時代の名称の
まま残っている。E②では機能上問題ないためリネームせず、将来のコード
整理候補として記録する。「なぜPopoverなのにContextMenuという名前
なのか」という将来の読み手（AI・人間問わず）の疑問を未然に防ぐための
記録。
```


---

## 8. Next Phase（次フェーズ開始位置）

現時点で明確な次点候補は定めていない。Phase127-Eシリーズ（Provenance機能）
としては、D'（Tooltip基盤）→E①（External Check編集）→E②（Popover本体）
が一巡し、実用レベルに到達した。

参考（現在残っている関連候補）:
- Phase127-F（既存データの状態補完）は既にcommit-ready状態（別スナップショット参照）
- 開発プロセス簡素化のREADME正式反映（Phase127-Process-Review、6節「正式採用に向けた論点」が未決）
- textTooltip.jsの取り扱い（7節）

次のIntentは、README.md記載のDevelopment Processの考え方（「Issueを先に
決めて着手する」のではなく、新しい要望・発見事項ベースで選定する）に
従い、次回チャットで改めて選定する。

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・showProvenancePopover() / _renderProvenancePopoverBody() /
    _positionProvenancePopover() / _bindProvenancePopoverEditButton() /
    _hideProvenancePopover() / _setupProvenancePopoverEvents() 新設
    理由: Provenance Popover本体。Library/Chart Mode共通の入口として集約
  ・_setupLibraryContextMenu() を旧Context Menu実装からPopover呼び出しへ置き換え
    理由: [判断] Context Menuを挟まずPopoverを直接開く（5節）
  ・renderProvenanceDots() から data-tooltip 属性生成を削除
  ・Library側のhover/tap tooltipイベント配線を全撤去
  ・textTooltip の import・init()呼び出し・initChartMode()への注入を削除
    理由: [TOOLTIP CONSOLIDATION]（5節）
  ・_positionProvenancePopover() の位置補正をrequestAnimationFrameへ変更
    理由: 強制同期リフロー回避（5節）

js/chartmode.js
  ・onExternalCheckRequested コールバックのシグネチャを (clientX, clientY) へ拡張
    理由: Popoverの表示位置に右クリック座標が必要なため
  ・_setupProvenanceTooltipEvents() ・関連する変数宣言・呼び出しを全撤去
    理由: [TOOLTIP CONSOLIDATION]（5節）
  ・initChartMode() のパラメータから showTextTooltip/hideTextTooltip を削除

css/components.css
  ・.provenance-popover 系スタイル新設（Library/Chart Mode共有）
  ・.provenance-dot の cursor を default → context-menu へ変更
    理由: hover Tooltip廃止に伴うaffordance補完

css/library.css
  ・.library-context-menu / .library-context-item を削除
    理由: Popoverへの置き換えにより不要化
```

---

## 10. Micro Log

（フェーズ完了につき本文へ整理済み。本セクションは削除）

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - textTooltip.jsがorphaned module（呼び出し元なし）になった（7節）
  - Naming debt: `_setupLibraryContextMenu()` / `onExternalCheckRequested`
    に旧UI設計由来の名称が残っている（7節）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: textTooltip.jsがorphaned module（呼び出し元なし）
  状態: 未対応・優先度低（Phase127-E②で発見）
  内容: hover Tooltip廃止（[TOOLTIP CONSOLIDATION]）に伴い、app.js・
  chartmode.jsのどちらからもtextTooltip.jsの呼び出し箇所が無くなった。
  モジュール自体は「1行テキストの汎用tooltip」として設計された独立
  サブシステム（Phase127-D'）であり、Provenance専用実装ではないため
  削除せず残置している。splitChord()（Phase121発見のデッドコード候補）
  と同種の扱いとする。将来の別用途での再利用が無ければ削除を検討する。

- 見出し: Naming debt（`_setupLibraryContextMenu()` / `onExternalCheckRequested`）
  状態: 未対応・優先度低（Phase127-E②・ChatGPT Review監査で発見）
  内容: `_setupLibraryContextMenu()`（実装は既にPopover呼び出しへ変更済み）・
  `onExternalCheckRequested`（現在はPopover表示のための座標通知に使用）は、
  いずれも旧UI設計（Context Menu / 直接編集モーダル）時代の名称のまま残って
  いる。機能上の問題はないためE②ではリネームせず、将来のコード整理候補
  として記録する。

#### MODIFY
- No changes.

#### CLOSE
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Provenance Popover本体（Phase127-E②・右クリック→詳細Popover
    （一次確認UI）→「確認情報を編集する」→既存Modal（二次編集UI）の
    一本道を実装。Library/Chart Mode共通の`showProvenancePopover()`へ
    集約。hover Tooltip（Phase127-D'）は`[TOOLTIP CONSOLIDATION]`の
    判断により廃止しPopoverへ一本化した）

- Major Milestones（Analysis Editor関連・新規テーブル行として追加候補）:
  | 127-E② | Provenance Popover本体（右クリックで🟡🔵🟢の状態・外部資料
    詳細を一括表示する参照UIを新設。Context Menuを挟まず直接開く設計を
    採用。hover Tooltipを廃止しPopoverへ情報表示を一本化
    （`[TOOLTIP CONSOLIDATION]`確立）。位置補正のforced reflowを
    回避するためrequestAnimationFrame化） | app.js / chartmode.js / components.css / library.css |

- Future Candidates: 以下を追加
  - textTooltip.jsの取り扱い検討（orphaned module。7節）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
