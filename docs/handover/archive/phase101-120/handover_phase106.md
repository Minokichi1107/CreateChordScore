# 引き継ぎ: Phase106完了 — Section Boundary Editing UI

> Phase106は「Section境界編集UIの追加」という単純な機能追加として開始したが、
> 実機検証の過程で「画面が意図せず動く」という不具合に何度も遭遇し、原因調査に
> 大半の時間を費やすことになった。最終的な原因はSection境界編集そのものではなく、
> Phase102由来の`renderChartMode()`呼び出し漏れ（デフォルト引数問題）という
> 既存の潜在バグだったことが判明した。本体（新機能）・調査プロセス（複数の
> 仮説とその否定）・発見（既存バグ）が明確に分離された重量版handoverとなっている。

## 作業状態
- ブランチ: phase106-section-boundary-editor
- 直前作業: docs/phase105-followup完了・mainへマージ済み（Phase105の
  即時反映漏れ〔README.md／architecture.md〕の解消。Phase106本体には含まない）

---

## 1. Purpose（目的）

`updateSectionBoundaryCommand()`はPhase104で実装済みだったが、呼び出すUIが
存在せず、実質的に到達不能な状態だった（current-issues.md P2/P3参照）。

Phase106は、Section Bar上の▼メニューへ境界編集UI（ステッパー）を追加し、
既存のCommand Layer・History機構・Preview Decoratorへ接続することで、
「Section作成後に1コードだけ位置がズレていた」という日常的な微調整ニーズを
最小コストで満たすことを目的とした。

```
既存の資産（Phase104で準備済み・未接続）
  analysisCommands.js
    └ updateSectionBoundaryCommand(sectionId, patch)
        ・バリデーション済み
        ・pushHistory() 対応済み
        ・呼び出し元がapp.js側に存在しない

Phase106でやること
  この関数を呼び出すUIを新設する
```

---

## 2. Scope（今回やったこと）

```
・Section▼メニューへ境界ステッパー（「◀ 開始 ▶」「◀ 終了 ▶」）を追加
    ・1クリック = 隣接コード1つ分の移動（長押し連続送りは非対応）
    ・start <= end（交差禁止）に応じてボタンをdisabled表示
・updateSectionBoundaryCommand()への接続（app.js側の薄いラッパー
  _moveSectionBoundary()を新設）
・境界移動時のSection Preview（ゴールドハイライト）追随
    （Phase104 handoverで「将来UI実装時に要確認」と予告されていた懸念が
    実際に発生したため、resolveSectionChordIds()の再計算で解消）
・誤編集防止: ▼メニューを開く操作とSection選択（Preview同期）を連動
    （開いているメニュー ≠ 選択中のSection、という状態を作れないようにする）
・[実機検証で発見・修正] Section境界編集に付随して画面が意図せず動く不具合
    （根本原因はrenderChartMode()の引数省略によるmeasuresPerRowの
    デフォルトリセット。詳細は§6 Findings参照）
・current-issues.md更新（Section UX Epic新設・UI改善1件追加）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Boundary Handle Drag（ドラッグによる境界編集）
    → 発端となった要望（「1コードだけズレを直したい」）は低頻度・小さい移動量
      であり、ステッパーで十分と判断した。ドラッグは将来「Section UX Epic」
      P4（Editing Interaction Modernization）のMouse-first項目として
      current-issues.mdに構想を残した。

・P2 Boundary reassignment（境界コード削除時の隣接コードへの自動付け替え）
    → 既存のcurrent-issues.md P2のまま。今回は境界の「手動編集」のみを
      スコープとし、コード削除に伴う「自動付け替え」は対象外とした。

・Section UX Epic（P1〜P8）の実装
    → 今回の会話で構想として整理し、current-issues.mdへ記録したが、
      実装はいずれも次フェーズ以降の判断とする。

・Section Preview解除UXの改善（× ボタン追加等）
    → 実機検証で「空白クリックでの解除が分かりにくい」ことが判明したが、
      今回は記録（current-issues.md UI改善）のみに留め、実装はしない。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| import追加 | `updateSectionBoundaryCommand`を`analysisCommands.js`からimport | app.js |
| `renderSectionBar()`拡張 | 各Sectionの▼メニュー内に境界ステッパー（4ボタン）を追加。buffer上のindexから4ボタンのdisabled状態を都度計算 | app.js |
| `_moveSectionBoundary()`新設 | 隣接コード1つ分だけ境界を動かし`updateSectionBoundaryCommand()`を呼ぶラッパー。Preview追随・失敗時のtoastを含む | app.js |
| `_previewSection()`新設 | Section選択・Previewハイライト同期のみを行う（画面をスクロールしない）関数 | app.js |
| `_selectSection()`分離 | `_previewSection()`を内部で呼び、Navigation（`scrollToChord()`）はこの関数（チップ**名**クリック用）のみが担当する形へ整理 | app.js |
| `_toggleSectionMenu()`変更 | メニューを**開く**時に`_previewSection()`（Navigateしない版）を呼ぶ。誤編集防止のための選択同期のみ行う | app.js |
| 選択変更側の整合性 | `_previewSection()`内で、選択が別Sectionに変わった際に開いていた別メニューを自動的に閉じる処理を追加 | app.js |
| `renderChartMode()`引数修正（3箇所） | `_previewSection()` / `_syncSectionPreviewVisibility()` / `_clearSectionPreview()`のいずれも`{ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() }`を明示的に渡すよう修正（§6 Findings参照） | app.js |
| `_renderChartGrid()`スクロール保持 | DOM丸ごと再構築（`container.innerHTML = ''`）の前後で`container.scrollTop`を保存・復元する処理を追加 | chartmode.js |
| `scrollToChord()`瞬間移動化 | `behavior: 'smooth'`を廃止しアニメーションを排除 | chartmode.js |
| CSS追加 | `.sec-boundary-row` / `.sec-boundary-btn` / `.sec-boundary-label` / `.sec-chip-menu-divider`。新規token追加なし（既存semantic tokenのみ使用） | analysis-editor.css |

いずれも `node --check` 通過・CRLF全行維持を確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] UIはステッパー形式「◀ 開始 ▶」「◀ 終了 ▶」を採用（4つの文章ボタンは不採用）

```
結論:
  「開始を左へ」「開始を右へ」のような文章4行ではなく、
  「◀ 開始 ▶」「◀ 終了 ▶」という2行×左右ボタンのステッパー形式にした。

理由:
  ・対象（開始／終了）を中央に置き、左右のボタンで動かす方が認知負荷が低い
  ・disabled状態が視覚的に分かりやすい（片側のボタンだけ消える）
  ・将来ドラッグ編集を追加しても「大きく動かす＝ドラッグ」「微調整＝ステッパー」
    という役割分担がしやすい
  ・長押し連続送りは非対応とした（「1クリック=1コード=1Undo」の原則を
    崩さないため。Historyとの対応関係をシンプルに保つ）
```

### [判断] `updateSectionBoundaryCommand()`は変更せず、呼び出し側（app.js）だけを実装する

```
結論:
  Command Layer（analysisCommands.js）・Session Layer（analysisSession.js）は
  一切変更しない。Phase104で実装済みのCommandをそのまま利用する。

理由:
  Phase104時点で既にHistory対応・バリデーション・Result Protocol準拠まで
  完成していた。UIから呼び出す「隣のchordIdを求める」処理はapp.js側の
  責務（bufferへのアクセスはUI側の既存パターンと同じ）であり、Command層に
  持ち込む必要がない。
```

### [判断] `_selectSection()`を`_previewSection()`（選択同期のみ）と
`_selectSection()`（選択同期+Navigation）に分離する

```
結論:
  Section選択の「状態同期（誤編集防止のためのPreview更新）」と
  「Navigation（画面をスクロールする）」を別関数に分離した。

  _previewSection(sectionId)  … 選択状態・Previewハイライト同期のみ
  _selectSection(sectionId)   … _previewSection()を呼んだ上でNavigateする

  ▼メニューを開く操作（_toggleSectionMenu）は_previewSection()のみを呼ぶ。
  チップ名クリック（Phase105由来の明示的なNavigation操作）は
  _selectSection()を呼ぶ。

理由:
  Phase106当初は▼メニューを開く操作にも_selectSection()（Navigation込み）を
  流用していたが、これにより「メニューを開いただけで画面が中央寄せされる」
  という実機フィードバックが繰り返し報告された。

  Phase105時点の設計は「Section選択＝Navigation」という前提だったが、
  Phase106で「▼メニューを開く」という全く別目的の操作が増えたことで、
  この前提が崩れた。選択（状態）とNavigation（画面移動）は本来別の関心事
  であり、今後コンテキストメニュー・複数選択・キーボード操作等が増えるたびに
  同じ問題が再発しないよう、ここで責務を分離しておく判断とした。

  [設計上の位置づけ] この変更は単なるリファクタではなく、状態（State）と
  副作用（Side Effect）の分離である。

    以前: Section選択 → Navigation → Preview（3つが1つの関数に結合）
    以後: Preview（状態同期・_previewSection） / Navigation（画面操作・
          _selectSectionのNavigate部分）を独立させた

  これにより、将来Section UX Epic（current-issues.md）で構想している
  キーボード操作・Context Menu・Performer Mode等の入力経路が増えても、
  「状態を同期したいだけ」なのか「画面も動かしたいのか」を呼び出し側が
  個別に選べる。既存のUI Projection（deriveEditorMode等）と同じ、
  「正本からの導出ロジックはapp.js側・描画層は渡された値を扱うだけ」
  という既存原則の延長線上にある変更でもある。
```

### [判断] Section境界編集自体はNavigateしない（`scrollToChord()`を呼ばない）

```
結論:
  _moveSectionBoundary()はscrollToChord()を一切呼ばない。

理由:
  境界編集は「今見ているSectionの微調整」であり、Navigationではない。
  当初は「画面が飛ぶ」不具合への対処として一時的にscrollToChord()を
  追加したが、実機フィードバックで「既に見えている範囲でも毎回動くのが
  不自然」と判明し撤回した。最終的に真因（§6 Findings）が判明した後も、
  この判断（境界編集はNavigateしない）自体は正しかったため維持している。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### ★ [CRITICAL FINDING] 真因: `renderChartMode()`の引数省略によるレイアウト崩壊（Phase102由来の既存バグ）

```
症状:
  Section境界編集（◀▶クリック）に付随して、画面が意図しない位置へ
  スクロールしたように見える。数値診断（後述）を尽くしても
  「スクロール位置」自体は一切変化していないという矛盾した結果が続いた。

原因:
  renderChartMode({ measuresPerRow = 3, editing = false } = {}) という
  シグネチャに対し、以下3箇所が引数なしで呼び出していた。

    ・_previewSection()（Phase106新設）
    ・_syncSectionPreviewVisibility()（Phase102由来）
    ・_clearSectionPreview()（Phase102由来）

  これらの経路を通るたびに、ユーザーが選択中の列数（例: 4列）を無視して
  一瞬「3列表示」（デフォルト値）で描画され、直後に正しい列数へ戻る
  別の再描画（_refreshEditorView()経由。こちらは正しく
  { measuresPerRow: chartMeasuresPerRow } を渡していた）が発生していた。

  3列と4列では1行に収まる小節数が異なるため、コンテンツの総高さ
  （scrollHeight）が大きく変動する（実測: 3243px → 2427px）。
  scrollTop自体は不変のまま、表示される内容だけが総高さの変化に応じて
  入れ替わるため、「スクロールしていないのに画面が動いて見える」という
  矛盾した現象が発生していた。

発見に至った経緯:
  当初は「スクロール位置」を疑い、以下を順に検証したが、いずれも
  数値上は原因ではなかった（すべて否定された）:

    1. scrollToChord()のsmooth animation
       → behavior:'smooth'を廃止しても症状変わらず
    2. _renderChartGrid()内でのscrollTop保存・復元タイミング
       → 保存・復元前後で完全に一致（一度も原因ではなかった）
    3. CSSのscroll-behavior
       → getComputedStyle()で確認、'auto'（無関係）
    4. updateChartPlayback()のB4自動スクロール（rAFループ）
       → 40フレーム連続計測してもqMeasureは0のまま・一度も発火せず
    5. #chart-grid以外の要素（#section-bar・#chart-header・
       #chart-overlay・window/document/body）のスクロール・位置
       → 境界クリック前後で完全一致

  上記5つがことごとく否定されたことで、「動いているのはスクロール位置
  ではない」という確信に至った。最終的に`scrollHeight`を計測項目に
  追加したことで、境界クリック前後でscrollHeightだけが大きく変化して
  いることを発見し、そこから`measuresPerRow`のデフォルト値問題に
  たどり着いた。

  また、調査の途中で「▼メニューを開いた時点で画面が動いた」という
  実機報告により、疑うべき箇所がSection境界編集本体（_moveSectionBoundary）
  ではなく、メニューを開く操作（当時は_selectSection()経由でNavigateして
  いた）側にあると判明したことも、原因の絞り込みに直結する重要な転換点
  だった。

対応:
  3箇所すべてに{ measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() }
  を明示的に渡すよう修正。

設計上の気づき:
  renderChartMode()はデフォルト引数を持つが、そのデフォルト値が
  「ユーザーの現在の選択状態」と一致する保証はない。以後、
  renderChartMode()を新規に呼び出す箇所を追加する際は、必ず
  { measuresPerRow: chartMeasuresPerRow, editing: isAnalysisEditing() }
  を明示的に渡すことをレビュー観点として明示しておく価値がある
  （EDITOR RESET AUTHORITYのように、チェックリスト化を検討してもよい）。
  この呼び出し規約は再発防止の価値が高いと判断し、
  [RENDER CONTEXT INVARIANT] としてarchitecture.md §9へ即時反映した
  （Phase105で確立した「Named Invariant即時反映ルール」に従う）。

[補足] `_renderChartGrid()`のscrollTop保存・復元（§4 Implementation・
chartmode.js）は、この真因の発見前に「スクロール仮説」への対処として
追加したものであり、今回の不具合の原因ではなかった。DOM再構築時に
スクロール位置を保持するという目的自体は独立して妥当なため、
真因修正とは別の改善として維持している（§4のFiles Changedコメントも
この位置付けに合わせて修正済み）。
```

### 数値診断が「スクロールではない」ことの証明に使えた

```
今回の調査プロセスで、scrollTop・getBoundingClientRect()・scrollHeight・
document.activeElement・window/document/bodyのスクロール位置を横断的に
計測したことで、「視覚的には動いて見えるが、JSで測定可能な"スクロール"
関連の値は一切変化していない」という一見矛盾する状態を数値で証明できた。

この「否定の証拠」の積み重ねが、最終的に「スクロールではなくレイアウト
（コンテンツの総量）が原因である」という正しい仮説へ導いた。
原因不明のレンダリング不具合を調査する際、対象を絞り込む前に
まず候補を広く計測し、外れた仮説を確実に捨てていくアプローチが
有効だった一例として記録する。
```

---

## 7. Remaining Issues（残課題）

```
（current-issues.mdへ反映済み・詳細はそちらを参照）

P2  Boundary reassignment（§4.3ケースB・Phase100-Aより継続）
    境界コード削除時の「隣接コードへの自動付け替え」は未実装。

Section UX Epic（P1〜P8・Phase106で新規構想として記録）
    Section機能をAnalysis Editor専用から全モード共通の楽曲構造レイヤーへ
    発展させる構想。P1（全モードNavigation）〜P8（Section Quick Actions）
    まで整理済み。実装はいずれも未着手。

Section Previewの解除方法が分かりにくい（Phase106発見・UI改善）
    Escapeキーまたは空白クリックのみで解除可能だが、空白クリックは
    視覚的な手がかりがなく気づきにくい。

（Phase93より継続）Boundary Handle Dragのpointercancel経路が未検証
  状態: 未対応（Section作業とは無関係の既存の積み残し。継続保持）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
候補（優先順位は次回セッション開始時に相談）:
  ・Section UX Epic P1（Section Navigation Across Modes）
      Chart Mode限定のNavigationを演奏モード・Analysis Editorへ拡張。
      Section Authority Scope（現在Analysis Editor Session限定）の
      範囲拡張判断を伴う可能性が高く、着手前に設計フェーズが必要。
  ・P2 Boundary reassignment
  ・Section Preview解除UXの改善（× ボタン追加等）
  ・current-issuesの他の軽量課題

5フェーズ棚卸しについて:
  前回の棚卸しはPhase99〜103（phase-status.md記載）。Phase104〜106が
  未反映のまま蓄積している。Phase108前後で棚卸しのタイミングとなる見込み。
  current-issues.mdの「Section Data Layer」項目内、P3（Section Selection
  State）の記述はPhase105で実装済みだが未反映のまま残っている
  （棚卸し時に解消予定）。
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・import追加: updateSectionBoundaryCommand
  ・renderSectionBar(): 境界ステッパーHTML生成・イベントリスナー追加
  ・_moveSectionBoundary() 新設
  ・_previewSection() 新設（選択同期のみ・Navigateしない）
  ・_selectSection() 変更（_previewSection()経由に整理・Navigation専任化）
  ・_toggleSectionMenu() 変更（_previewSection()を呼ぶよう変更）
  ・_syncSectionPreviewVisibility() 修正（renderChartMode()の引数追加）
  ・_clearSectionPreview() 修正（renderChartMode()の引数追加）
    理由: いずれも§4 Implementation・§6 Findings参照

js/chartmode.js
  ・_renderChartGrid(): スクロール位置の保存・復元処理を追加
      （DOM再構築時にスクロール位置を保持する目的の改善であり、
      今回の画面移動バグ（真因は§6参照）とは独立した改善として維持する）
  ・scrollToChord(): behavior:'smooth'を廃止（瞬間移動化）
    理由: §4 Implementation参照

css/analysis-editor.css
  ・.sec-boundary-row / .sec-boundary-btn / .sec-boundary-label /
    .sec-chip-menu-divider を追加
    理由: 境界ステッパーのスタイル。新規token追加なし

docs/current-issues.md
  ・「3. UI改善」へ Section Preview解除の分かりにくさ を追加
  ・「5. Future Features」へ Section UX Epic（P1〜P8）を新設
      Section Data Layerとの親子関係（基盤/活用機能）を明記
      Creator UX（Keyboard-first・PC）/ Performer UX（Touch-first・
      PC/タブレット/スマホ）の設計思想を明記
      P4を「Editing Interaction Modernization」へ改名・Input Modality
      （Mouse-first/Keyboard-first/Touch-first）で整理
      Song Structure Layerの将来architecture.md昇格候補である旨を記載
      P8 Section Quick Actions を追加

いずれもnode --check通過・CRLF全行維持を確認済み。
実機確認: Section作成→境界◀▶で移動・disabled表示・Preview追随・
Undo/Redo・誤編集防止（別Section選択でメニュー自動クローズ）・
画面が動かないこと、をいずれも確認済み。
```

---

## 10. Micro Log

- 当初「スクロールが原因」という前提でscrollTop保存・復元・smooth廃止と
  対処を重ねたが改善せず、途中で調査方針を転換し、scroll以外
  （focus / transform / layout）の可能性へ切り替えた。この方針転換が
  最終的な原因特定に直結した
- 「▼メニューを開いた時点で動いた」という実機報告が、調査対象を
  _moveSectionBoundary()から_toggleSectionMenu()（当時_selectSection()を
  Navigation込みで呼んでいた）へ切り替える決定的な手がかりになった
- scrollHeightを計測項目に追加したことで、3243→2427という激変を発見。
  これが`measuresPerRow`引数省略問題の発見に直結した
- 発見された3箇所のうち2つ（_syncSectionPreviewVisibility /
  _clearSectionPreview）はPhase102由来の既存バグであり、Phase106の
  境界編集がなければ表面化しなかった可能性がある潜在不具合だった
- 一時デバッグログ（[TEMP DEBUG][Phase106]・[TEMP DEBUG][Phase106-B]）は
  複数ラウンドにわたり追加・拡張・削除を繰り返した。最終的に全て削除済み
  （node --check・grep双方で残存なしを確認済み）
- Phase106終了後、ChatGPTとの議論からSection機能の将来構想
  （Section UX Epic）が自然発生的に生まれ、current-issues.mdへ記録した。
  Creator UX/Performer UXという設計思想の明文化は、今後のLAN配信モード
  構想とも接続する重要な整理になった

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: なし（P2/P3はSection Data Layer項目の残課題として継続）
- 今回新規に積み残したissue:
  - Section Previewの解除方法が分かりにくい（UI改善）
  - Section UX Epic（P1〜P8。Future Features）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
