# 引き継ぎ: Phase79 Sprint2-2完了 — Boundary Handle + EditPoint Marker統一描画

## 作業状態
- 直前作業: Phase79 Sprint2-1完了（Selection Highlight実装 + Forward Wall Model最終化）
- ブランチ: phase79-sprint2-2-decorator-layer（想定・実際のブランチ名に合わせて読み替え）

---

## 1. Purpose（目的）

Phase79 Sprint2（Decorator Layer）の残り2項目、Boundary Handle（個別移動の左端ハンドル）と
EditPoint Marker（挿入位置マーカー）の統一描画を実装する。Sprint2-1で確立した
「Selectionと同じ場所（`_renderChartGrid()`のslotループ内）でその場実装する」方針を踏襲し、
Decorator Layer（Selection Highlight / Boundary Handle / EditPoint Marker）を完成させる。

---

## 2. Scope（今回やったこと）

```
① Boundary Handle 新規実装
   ・chartState.boundaryHandleChordId / setBoundaryHandleTarget() 新設
   ・_getBoundaryHandleChordId()（selectionからの純粋な導出）
   ・requestBoundaryShift()（矢印キー・ボタン・将来のドラッグの入口一本化）
   ・色: 当初--color-selection流用 → 実機フィードバックにより--color-amberへ変更

② EditPoint Marker 統一描画
   ・_applyEditPointMarker()（post-hoc DOM query patch・Phase77由来の暫定実装）を廃止
   ・_renderChartGrid()のslotループへ統合（Selection Highlight・Boundary Handleと同方式に統一）
   ・見た目をB案（縦線+▼）へ変更。縦線はテキストカーソル風にゆっくりフェード点滅
     （1.2秒周期・ease-in-out・高速ON/OFFではない）
   ・prefers-reduced-motion環境では点滅を止める
   ・silverテーマの--color-edit-pointをコントラスト改善のため再調整

③ Enterキーでのeditpoint挿入
   ・editPoint中にEnterキー → addChordAtEditPoint()（Add Here）を起動
   ・addChordAtEditPoint()自体は確認ダイアログを開くだけのため
     [CANCEL INVARIANT]は維持される

④ 副次調査（Sprint2-2の範囲外だが今回発見）
   ・「曲頭で線が出る」報告 → buffer実データ確認により、Boundary Handleは
     正しく動作していることを確認（Nバグと同種の「見た目の誤解」）
   ・上記調査から、Chart Modeの表示モデル（buildGridViewModel）がN/空文字コードを
     除外しているため、Analysis Editor上は実在するのにクリック選択できない
     という別レイヤーの設計ギャップを発見・記録
   ・「緑の棒」バグの調査（原因未特定のまま既知Issueとして記録）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Boundary Handleのドラッグ操作
  → requestBoundaryShift()という入口だけ用意し、実装は将来に持ち越し。

・「N（無音）がChart Modeで選択できない」問題の修正
  → buildGridViewModel()の設計に関わり、通常表示にも影響しうるため、
    Boundary Handleより明らかにスコープが大きい。設計フェーズが必要。
    Known Design Gapとして記録のみ行った。

・「緑の棒」バグの修正
  → 原因未特定（endAnalysisEdit() / saveAnalysisEdit()の状態クリア〜
    再描画の順序は静的コード確認で問題なしと確認済みだが、報告された
    見た目（細い線）と.chart-slot--selectedの実装（セル全面塗り）が
    一致せず、当て推量での修正は避けた）。次回発生時にDevTools
    コンソールでの実測を行う方針とした。

・Phase80（検索・置換 / Search Engine）
  → 設計方針のみ合意（本ドキュメント末尾参照）。実装は次フェーズ。

・主要ドキュメント（README / architecture.md等）の棚卸し
  → Phase81まで意図的に延期することを合意（理由は「9. Next Phase」参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `chartState.boundaryHandleChordId` 新設 | Boundary Handleの表示対象chordId（描画用ローカル状態。正本はapp.js側のselection） | chartmode.js |
| `setBoundaryHandleTarget()` 新設 | boundaryHandleChordIdの唯一の更新窓口（setEditPointMarkerと同じパターン） | chartmode.js |
| onsetスロット描画時の判定追加 | `slot.id === chartState.boundaryHandleChordId` で`.chart-slot--boundary-handle`付与 | chartmode.js |
| `_getBoundaryHandleChordId()` 新設 | 単一選択かつboundaryIndex確定時のみchordIds[0]を返す純粋関数 | app.js |
| `requestBoundaryShift()` 新設 | shiftSelectedBoundary()への薄い委譲（イベント入口の一本化・詳細はDesign Decisions参照） | app.js |
| `_refreshEditorView()`拡張 | `setBoundaryHandleTarget(_getBoundaryHandleChordId())`を追加 | app.js |
| `.chart-slot--boundary-handle::before` 新設 | 6px幅の当たり判定枠内に2px可視の縦線（グラデーション表現）。pointer-events: none（クリック/ドラッグは将来対応） | components.css |
| `_applyEditPointMarker()` 削除 | post-hoc DOM query patchを廃止 | chartmode.js |
| editPoint marker判定をslotループへ統合 | Selection Highlightブロック直後で`marker.measureIndex === mi && marker.slotIndex === slot.beatIndex`を判定 | chartmode.js |
| `renderChartMode()`から`_applyEditPointMarker()`呼び出しを削除 | 上記統合に伴い不要化 | chartmode.js |
| `.chart-slot--edit-point`スタイル全面変更 | 破線枠+背景塗り（旧実装）→ 縦線（フェード点滅）+▼（静止）のB案へ | components.css |
| `@keyframes chart-edit-point-blink` 新設 | opacity 1→0.15→1、1.2秒、ease-in-out | components.css |
| `prefers-reduced-motion`対応 | 点滅アニメーションを無効化する分岐を追加 | components.css |
| silverテーマ`--color-edit-point`調整 | `#8B3FD1` → `#6B1FB8`（明るい背景に対するコントラスト改善） | theme.css |
| Enterキーハンドラ追加 | editPoint中・モーダル非表示・非INPUT/TEXTAREA時にaddChordAtEditPoint()を起動 | app.js |
| デバッグexport追加 | `requestBoundaryShift`を`window.__analysisEditorDebug`に追加 | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Boundary Handleの色：Selection色の流用 → amberへ変更

```
経緯:
  当初の設計（ChatGPTレビュー含む）では「Boundary Handleは選択の延長」という
  意味的な近さから--color-selection（緑）を流用する方針だった。
  しかし実機テストで、Selection Highlightの緑背景の上に同系色の線が乗ると
  視認しづらいという実機フィードバックがあった。

結論:
  --color-amber へ変更した。amberはSelection Highlight・EditPointの両方が
  検討の末に不採用とした色（Sprint2-1で確立された経緯）であり、
  現在どちらの用途とも衝突しない空きトークンのため、新規token追加なしで
  流用できた。

教訓:
  「意味的に近いから同じ色」という設計上の判断は、実際にレンダリングして
  背景との重なりを見るまで問題が顕在化しないことがある。Sprint2-1の
  EditPoint色調整（暗い黄色は茶色化する）と同種の「実機で見て初めて
  分かる」パターン。
```

### [判断] EditPoint Markerの統一：形も変える（B案）

```
結論:
  Boundary Handleと全く同じ「細い縦線」ではなく、縦線+▼（テキストカーソル
  メタファー）を採用した。縦線はゆっくりフェード点滅させる。

理由（ChatGPTレビューで確定）:
  Boundary Handle＝「動かせる境界」とEditPoint＝「挿入位置」は意味が
  異なる。色だけで区別させるのは初心者に厳しいという懸念があり、
  形にも違いを持たせることにした。
  点滅を高速ON/OFFではなく1.2秒ease-in-outの緩やかなフェードにしたのは、
  「編集中の視認性」と「目の疲れにくさ」のバランスを取るため
  （VS Code/Wordのテキストカーソルの点滅速度を参考にした）。

視覚言語の整理（Sprint2を通して確立）:
  Selection Highlight = 面（背景色）
  Boundary Handle     = 線のみ（静止・amber）
  EditPoint Marker    = 線+記号（点滅・紫）
```

### [判断] EditPoint Marker実装方式の統一：post-hoc DOM patch廃止

```
結論:
  _applyEditPointMarker()（renderChartMode()の最後にdocument.querySelectorAll()
  でDOM全体を検索してクラス付け外しする方式）を廃止し、_renderChartGrid()の
  slotループ内で他のDecoratorと同じ場所で判定する方式に統一した。

理由:
  Selection Highlight・Boundary Handleと実装方式を揃えることで、
  「Decoratorはすべてslotループ内でその場判定する」という一貫した
  設計原則ができた。副次効果として、毎回の全DOM走査（querySelectorAll）
  が不要になった。
```

### [判断] Enterキー追加は安全（[CANCEL INVARIANT]維持）

```
結論:
  addChordAtEditPoint()自体はshowChordSelector()（確認ダイアログ）を
  開くだけで、この時点でbuffer/editPointは一切変化しない
  （Phase77で確立した[CANCEL INVARIANT]）。そのためEnter一発で
  呼んでも「うっかり確定」のリスクはない。
  モーダルが開いている間はEnterハンドラを素通りさせ、モーダル自身の
  Enter処理（コード名確定）と衝突しないようにした（Escapeキーの
  既存分岐と同じ判断基準）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 「曲の最初で線が出る」報告の調査 → Boundary Handleは正常だった

```
現象:
  単一選択（Bm）でBoundary Handleが表示された際、「Bmが曲の最初の
  コードに見えるのに線が出ている」という報告があった。

調査:
  window.__analysisEditorDebug.state.buffer を確認した結果、
  buffer[0]が chord:"N"（無音プレースホルダー、0.000〜2.485秒）であり、
  Bmはbuffer[1]であることが判明。Nは画面上ラベルが表示されないため、
  人間から見るとBmが「曲の最初」に見えるが、データ上はNという
  実在する左隣が存在する。

  _getBoundaryHandleChordId()のboundaryIndex===nullチェックは
  buffer（正本）を見ており、正しく「Nが左隣にいる＝nullではない」と
  判定していた。つまりBoundary Handleの実装は完全に正しく、
  「見た目と内部データの認識のズレ」が原因だった。

  これはPhase76の「Nバグ」（削除時の吸収方向）と全く同じ構造の問題。
```

### Chart Modeの表示モデルからNが完全に除外されていることを発見（詳細は8.5参照）

```
上記調査の過程で、「Nの領域をクリックしても選択できず、
必ずeditPointへ直行する」という別の現象が見つかった。
原因の技術的詳細・設計上の位置づけは「6.5 Known Design Gap」にまとめる。
```

### 「緑の棒」バグ：原因未特定（既知Issueとして記録）

```
現象:
  編集終了・保存後、または編集中の状態から別プロジェクトへ
  切り替えた際に、画面上に緑の細い縦線が残ることがある。
  少なくとも2回、目視で確認されている（詳細な再現手順は不明）。

調査結果:
  endAnalysisEdit() / saveAnalysisEdit() の状態クリア（setSelectedChordIds([])）
  〜再描画（renderChartMode() / _refreshEditorView()）の順序を
  静的コード確認したが、どちらも正しい順序だった。
  _renderChartGrid()は毎回container.innerHTML=''から作り直すため、
  「古いDOMが残る」ことは構造上あり得ないことも確認した。

  一方、報告された見た目（細い一本の縦線）は、.chart-slot--selectedの
  実装（セル全面を背景色+上下ボーダーで塗る）とは一致しない。
  そのため、静的解析だけでは原因を断定できなかった。

対応方針（ChatGPTレビューで確定）:
  「原因未特定の既知Issue」として記録し、当て推量での修正は行わない。
  次回発生時にwindow.__CS_DEBUG__.chart / 
  window.__analysisEditorDebug.state.selectionをコンソールで取得し、
  事実ベースで原因を切り分ける方針とした。
```

---

## 6.5 Known Design Gap（新規発見・記録のみ・対応は将来）

```
Root Cause:
  Analysis Editorの正本（analysisEditor.buffer）は、Nを含むすべての
  buffer要素を「実在する編集対象」として扱う。
  一方Chart Modeの表示モデル（buildGridViewModel）は、Nを「表示上の
  ノイズ」として生成前に除外する。
  つまり「編集モデル」と「表示モデル」が、何を編集対象と見なすかについて
  一致していない。Nクリック問題（下記）は、この不一致から生じる
  副作用の一つに過ぎない。

現象（副作用の一例）: Nの領域（無音プレースホルダー）をクリックしても
      選択できず、必ずeditPointへ直行する。

技術的経緯:
  buildGridViewModel()内で
    const validChords = (chords || []).filter(c =>
      c.chord && c.chord !== 'N' && c.chord.length > 0
    );
  という除外処理があり、Nはquantize（onset化）される前に完全に除外される。
  そのため、measure内でNが占める領域はtype:'empty'（"まだコードが
  現れていない空白"）として描画され、data-chord-idを持たない。
  Phase77の「空セルクリック＝即editPoint」ルールに該当するため、
  Nの領域はクリックで選択できない。

位置づけ:
  Boundary Handleの不具合ではなく、Analysis EditorとChart Mode
  ViewModelの間のモデル不一致という、より根本的な設計課題。
  「Nだけ個別対応する」のではなく、両モデルの整合を取る設計として
  将来検討する必要がある。

影響範囲: buildGridViewModel() / 空セルクリック判定 / 通常表示（非編集時含む）
優先度: 低（個別移動ボタン経由で境界調整自体は可能なため実害は小さい）
```

---

## 7. Validation（動作確認結果）

すべて実機テストで確認済み。

| 項目 | 結果 |
|---|---|
| Boundary Handle: 単一選択時に左端に表示 | ✅ |
| Boundary Handle: `boundaryIndex == null` のコードでは非表示 | ✅（データ上「左境界を持たないコード」の場合。「曲の最初に見えるコード」とは必ずしも一致しない点はFindings参照） |
| Boundary Handle: 複数選択時は非表示 | ✅ |
| Boundary Handle: 矢印キー・ボタンどちらでも位置が追従 | ✅ |
| Boundary Handle: 継続セルを含むコードでも先頭にのみ表示 | ✅ |
| Boundary Handle: 3テーマでの視認性 | ✅ |
| EditPoint Marker: 正しい位置に表示 | ✅ |
| EditPoint Marker: 点滅の速さ | ✅（「いい感じ」との評価） |
| EditPoint Marker: 3テーマでの視認性 | ✅（silverはコントラスト再調整後） |
| EditPoint Marker: あらゆる操作後に残らず消える | ✅ |
| EditPoint Marker: 3列/4列切り替え後も位置が正しい | ✅ |
| EditPoint Marker: 継続セル上でも正しく表示 | ✅ |
| prefers-reduced-motion時に点滅が止まる | ✅ |
| Enterキーでダイアログが開く | ✅ |
| ダイアログ内Enterでの確定（二重発火なし） | ✅ |
| idle/選択中にEnterを押しても無反応 | ✅ |

---

## 8. Remaining Issues（残課題）

```
・Boundary Handleのドラッグ操作
  状態: 未着手（意図的な保留）。requestBoundaryShift()という入口のみ用意済み。

・「N（無音）がChart Modeで選択できない」問題
  状態: 未着手。Known Design Gapとして記録（詳細はFindings参照）。
  影響範囲がBoundary Handleより大きいため、別途設計フェーズが必要。

・「緑の棒」バグ
  状態: 原因未特定。次回発生時にwindow.__CS_DEBUG__.chart /
  window.__analysisEditorDebug.state.selection を取得すること。

・--color-edit-point-bg が現在未使用
  状態: 意図的保留。EditPoint MarkerがB案（線+▼）になったことで
  背景塗り用のこのトークンを参照するCSSがなくなった。実害はないが、
  将来的な整理候補として記録。
```

---

## 9. Next Phase（次フェーズ候補）

Sprint2-2完了時点では次フェーズを1つに断定せず、以下を候補として記録する
（本handover作成後の会話で新たに「編集選択とシーク同期」が候補に加わったため、
断定を避け柔軟にしておく）。

```
候補①: Search Engine（検索基盤）
候補②: コード選択時の再生シーク同期
候補③: Boundary Handleのドラッグ操作
候補④: Known Design Gap（Analysis EditorとChart Mode ViewModelの
        モデル不一致・詳細は6.5参照）の解消
```

このうち①②について、現時点で合意している設計方針・論点を以下に記録する
（実際にどれから着手するか、複数を1フェーズにまとめるかは、次フェーズ開始時に
改めて決定する）。

### 候補①: Search Engine（検索基盤）

単なる「検索・置換機能」ではなく「コード進行を扱える検索基盤」として設計する
（ChatGPTレビューで確定）。着手時に踏襲する決定済みの設計方針は以下の3点。

```
・検索対象: analysisEditor.bufferの正本（chord文字列）。表示名は考慮しない
・検索結果: ChordIdの配列のみを保持する（selectionとは別のstateとして分離。
  「今編集中のコード」と「検索でヒットしたコード」は意味が違うため、
  同じ色で表現すると混乱する）
・ハイライト色: 検索専用の新規色（薄い青系を検討）を追加し、
  Selection=濃い緑／Search=薄い青／Boundary=amber／EditPoint=紫、
  という役割分担でPhase79までの視覚言語を崩さない

実装の優先順位・一致判定の詳細（前方一致・同義語対応等）は、
着手時の設計フェーズ冒頭で仕様確認から改めて詰める。
```

### 候補②: コード選択時の再生シーク同期

```
内容: Chart Mode編集中にコードを選択すると、そのコードのstart時刻へ
      audio再生位置も移動する（クリック1回で試聴できるようにする）。

設計方針（ChatGPTレビューで合意した論点）:
  ・デフォルトON（DAWのリージョンクリックと同様の操作感）
  ・通常クリックのみシークする。Shift+クリック（範囲選択）・Ctrl+クリック・
    editPoint選択はシークしない（範囲選択中に毎回再生位置が飛ぶと
    操作感が悪化するため）
  ・実装は_refreshEditorView()の流れに1ステップ追加する程度で済む見込み
    （新しい状態管理はほぼ不要）
```

### Phase81: ドキュメント大棚卸し

```
上記の次フェーズ候補が完了した後にまとめて実施する（今回意図的に延期・ChatGPTレビューで確定）。

延期の理由:
  ① 編集UIがまだ進化中（Sprint2だけでもForward Wall Model・Selection
     Highlight・Boundary Handle・EditPoint Marker・Enterキー対応と
     大量の変更があった。次フェーズでさらに検索・置換等が加わる見込み）
  ② ドキュメントは「安定した仕様」を書く場所であり、UIが成熟してから
     書く方が品質が高い
  ③ 実装の勢いが続いている今は実装を優先する方が効率的

対象:
  README / architecture.md / current-issues.md / phase-status.md を一括更新。
  次フェーズの成果まで含めたAnalysis Editorの完成形を一度だけ整理する。

例外:
  利用者向けの重大な誤り（README のセットアップ手順の誤り等）があれば、
  Phase81を待たずに先に修正する。

handoverについては従来通り毎フェーズ作成する（今回のような軽量〜重量の
使い分けは維持）。
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/chartmode.js
  ・chartState.boundaryHandleChordId 追加
  ・setBoundaryHandleTarget() 新設
  ・onsetスロット描画時にBoundary Handle判定を追加
  ・_applyEditPointMarker() 削除
  ・editPoint marker判定をslotループへ統合（Selection Highlightブロック直後）
  ・renderChartMode()から_applyEditPointMarker()呼び出しを削除

js/app.js
  ・setBoundaryHandleTargetのimportを追加
  ・_getBoundaryHandleChordId() 新設
  ・requestBoundaryShift() 新設
  ・_refreshEditorView()にsetBoundaryHandleTarget()呼び出しを追加
  ・_bindShiftControls('aep-bnd', ...)の呼び出し先をrequestBoundaryShiftへ変更
  ・矢印キーハンドラの呼び出し先をrequestBoundaryShiftへ変更
  ・Enterキーハンドラ追加（editPoint中のaddChordAtEditPoint()起動）
  ・window.__analysisEditorDebugにrequestBoundaryShiftを追加

css/components.css
  ・.chart-slot--boundary-handle::before 新設（当初--color-selection→
    実機フィードバックで--color-amberへ変更）
  ・.chart-slot--edit-point 全面変更（破線枠+背景塗り → 縦線+▼のB案）
  ・@keyframes chart-edit-point-blink 新設
  ・prefers-reduced-motion対応

css/theme.css
  ・silverテーマの--color-edit-pointを#8B3FD1→#6B1FB8へ調整
    （コントラスト改善）
```

---

## 11. current-issues.md更新（該当があれば）

```
今回closeした項目:
  ・Boundary Handle統一描画（Sprint2-1 handoverで積み残されていたもの）→ 完了
  ・EditPoint Marker統一描画（同上）→ 完了

今回新規に積み残した項目:
  ・Known Design Gap: Chart ModeがN（無音）を表示モデルから除外しており、
    Analysis Editor上は実在するのに選択できない（優先度低）
  ・原因未特定の既知Issue: 編集終了/保存後・プロジェクト切り替え後に
    緑の縦線が残ることがある（次回発生時にDevToolsで実測すること）
  ・--color-edit-point-bg が現在未使用（優先度低・将来整理候補）
```

---

## 12. Micro Log

- Boundary Handleの色を当初--color-selection流用で実装したが、実機
  レビューで空きトークンだった--color-amberへ変更（詳細はDesign
  Decisions参照）
- EditPoint Markerの統一方針について、ChatGPTレビューで「色だけでなく
  形も変えるべき」という指摘があり、B案（線+▼、テキストカーソル風の
  緩やかなフェード点滅）を採用。Visualizerで3案を比較してから決定
- 「曲の最初で線が出る」報告を調査した結果、Boundary Handle自体は
  正しく、buffer[0]が無音（N）であることが人間の認識とズレていた
  だけと判明（Phase76のNバグと同種の構造）
- 上記調査から、Chart ModeがNを表示モデルから完全に除外しており、
  Analysis Editor上は実在するのに選択できないという、Boundary Handle
  より大きいスコープの設計ギャップを新規発見。Known Design Gapとして
  記録に留めた
- 「緑の棒」バグについて、当初loadProj()が原因と推測したが、ChatGPT
  レビューで「同じ曲のまま保存直後にも見た」という追加情報があり、
  断定を撤回。静的コード確認では原因を特定できず、「原因未特定の
  既知Issue」として次回実測待ちの方針に変更
- Phase80（検索基盤）・Phase81（ドキュメント棚卸し）の切り出しと
  順序について、ChatGPTとの議論を経て合意形成

---

## 13. Architecture Impact（このSprintでアーキテクチャ的に完成したこと）

```
Decorator Layer完成（Selection Highlight・Boundary Handle・EditPoint Marker）

Sprint2-1〜2-2を通して、Chart Mode上の装飾系UI（選択・境界・挿入位置の
可視化）はすべて _renderChartGrid() のslotループ内でその場判定する、
という単一の実装方式に統一された。post-hoc DOM patch（Phase77由来の
_applyEditPointMarker）はこれで完全に姿を消した。

視覚言語も統一された:
  Selection Highlight = 面（緑・背景色）
  Boundary Handle     = 線のみ（amber・静止）
  EditPoint Marker    = 線+記号（紫・点滅）

将来Search Highlight等のDecoratorが追加される場合も、この同じ設計
（slotループ内判定・専用state・専用色）を踏襲すればよい状態になっている。

[DECORATOR ADDITION RULE]（今回確立）
Chart Mode上に新しい装飾（Decorator）を追加する場合、以下のパターンに従う:
  1. 対象を表すローカル状態をchartStateに追加する（例: boundaryHandleChordId）
  2. その状態を更新する専用setter関数を新設する（例: setBoundaryHandleTarget）
  3. 判定は_renderChartGrid()のslotループ内で行う（post-render DOM
     patchは今後導入しない）
  4. 正本（selectionやeditPoint等）からの導出ロジックはapp.js側に置き、
     chartmode.js側は「渡された値を表示するだけ」の責務に留める
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
