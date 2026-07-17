# 引き継ぎ: Phase77完了 — 位置編集（Position Editing）の導入

> Position Editing は editPoint を基盤とする挿入系編集モデルであり、
> 今後の Paste Insert・休符挿入・Boundary Decorator・位置基準編集の
> 共通基盤となる。

## 作業状態
- 直前作業: Phase76完了（複数コード編集：範囲選択・Copy/Cut/Paste/Merge）
- ブランチ: phase77-position-editing（想定・実際のブランチ名に合わせて読み替え）

---

## 1. Purpose（目的）

当初はUI/UXブラッシュアップ（継続セルのクリック改善・個別移動の違和感解消・
フッターのスタイリッシュ化）として開始したが、途中で「空白セルをクリック
して直接コードを挿入したい」という要望を掘り下げる過程でeditPointという
概念が必要になり、「コードを編集するツール」から「位置を編集するツール」
への拡張フェーズとなった。

---

## 2. Scope（今回やったこと）

```
① 継続セルのクリック改善
   小節をまたぐ継続セルが選択できなかったバグを修正（expandToSlots/data-chord-id伝播）

② 個別移動UXの見直し
   ・境界編集の対象を「選択中コードの右側」→「左側」へ変更（メンタルモデルの是正）
   ・単一/複数選択で「個別移動」「範囲シフト」を出し分け
   ・右側の境界移動機能は冗長と判断し撤去

③ editPoint基盤
   selection.editPointを新設。二段階クリックモデル（1回目=選択・2回目=editPoint）と
   空セル直接クリックの両方に対応。視覚マーカー（暫定実装）も追加

④ Add Here
   editPointの位置へ、既存のsplitChord()を再利用して新規コードを1件挿入する機能

⑤ 最低限のフッター表示
   editPointモード専用の最小UI（編集位置表示＋Add Here＋キャンセル）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Paste Insert（貼り付け挿入）
  → editPointへ挿入する形の貼り付けコマンドは未実装。Phase78で対応。

・Boundary Decorator（境界・editPointマーカーの統一描画システム）
  → 現状は個別移動ハンドル・editPointマーカーともに暫定CSS実装。
    Phase78でフッター全面リデザインと合わせて統合設計する。

・Footer全面リデザイン
  → 個別移動・範囲シフト・編集（Copy/Cut/Merge等）・Add Hereが並存し、
    ボタン数が増えている状態は認識済み。状態遷移型UI（今どの編集モードかで
    表示を完全に切り替える）への刷新はPhase78で行う。

・矢印キーの範囲シフト対応
  → 矢印キーは個別移動（左側境界）のみ。範囲シフトはボタン操作のみ。

・複数選択時の個別移動
  → 「選択範囲の先頭コードだけ動く」という違和感が実機確認で発覚したため、
    単一選択専用に限定した（範囲シフトで代替）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `expandToSlots()` | carryスロットに`sourceChordId`を追加（小節またぎのid伝播） | chartmode.js |
| `_renderChartGrid()` | carryスロットのDOMに`data-chord-id`を付与 | chartmode.js |
| クリックハンドラ | 対象を`[data-chord-id]`全体に一本化。二段階クリックモデル・空セルクリックに対応 | chartmode.js |
| `_getExactTimeFromSlot()` / `getTimeForGridPosition()` | サブビート精度のグリッド座標→実時刻変換（新設・export） | chartmode.js |
| `chartState.editPointMarker` / `setEditPointMarker()` | editPointの視覚マーカー用状態（暫定実装） | chartmode.js |
| `_applyEditPointMarker()` | 再描画のたびにマーカーDOMを反映 | chartmode.js |
| `selection.boundaryIndex` | 「選択範囲の右側」→「左側」の境界を指すよう変更 | app.js |
| `shiftSelectedBoundary()` | 単一選択専用に限定（複数選択時はガードでtoast） | app.js |
| `shiftSelectionRange()` | 新設。選択範囲全体を中身の長さを保ったまま平行移動 | app.js |
| `selection.editPoint` | 新設。`{ ownerId, measureIndex, slotIndex }` | app.js |
| `setEditPoint()` / `clearEditPoint()` | editPointの確定・解除（chordIdsとの排他制御を含む） | app.js |
| `addChordAtEditPoint()` | Add Here本体。`splitChord()`+`updateChord()`を再利用 | app.js |
| `renderAnalysisEditorPanel()` | editPointモード時は専用の最小パネルへ早期分岐 | app.js |
| `.chart-slot--edit-point` / `.chart-chord-name--selected::before` | マーカー・ハンドルの暫定CSS | components.css |
| `.aep-btn--primary` | Add Here用の強調ボタン | components.css |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 個別移動の対象を「右側境界」から「左側境界」へ変更

```
背景:
  Phase74-Eの個別移動は選択中コードの右側境界が対象だったが、実際に
  使うと「選択したコードの左端を編集している」というメンタルモデルの
  方が直感的だった（DAWのクリップ端ドラッグと同じ考え方）。

採用した設計（[BOUNDARY EDIT AUTHORITY]としてコードに明記済み）:
  個別移動は「境界そのもの」を編集する。選択は「どの境界が対象か」を
  決めるだけであり、境界を動かすと両側が対等に更新される
  （どちらか一方が「主」でどちらかが「従」という関係ではない）。
  UI上はこの境界を「選択中コードの左端」として提示する
  （あくまで見せ方であり、データ構造上の非対称性ではない）。

実装:
  boundaryIndex = 選択範囲の最初のコードのindexを firstIdx とした時、
  firstIdx > 0 ? firstIdx - 1 : null
  moveBoundary()自体はロジック変更なし（境界を挟む2要素の汎用処理のまま）。
```

### [判断] 右側の境界移動を撤去し、範囲シフトを新設

```
背景:
  当初「左側」「右側」両方の境界移動を対称に実装したが、
  実際に使ってみると「右側移動」はユーザー視点で冗長だった。
  一方で複数選択時、「選択範囲全体を、中身の長さを保ったまま
  平行移動したい」という要望が別途あることが判明した。

判断:
  右側の境界移動（トリム）は撤去。
  「範囲シフト（shiftSelectionRange）」を新設し、
  個別移動＝単一選択専用／範囲シフト＝複数選択専用、と役割を分離した。

教訓:
  「左右対称に作れるから作る」ではなく、実際に触って感じた違和感を
  優先したことで、最終的にシンプルな設計に収束できた。
  設計だけを見ると美しい対称性が、実際のUXでは不要な自由度になる
  ことがある。
```

### [判断] editPointを「位置編集」の唯一のAuthorityとする

```
[EDIT POINT AUTHORITY]
selection.editPoint は「挿入系コマンドの対象位置」を表す唯一の状態である。
editPoint は ownerId と visual グリッド座標 (measureIndex, slotIndex) のみを
保持する。実時刻（splitTime）は保持せず、コマンド実行時に
getTimeForGridPosition()（chartmode.js）経由でTimingModelから都度算出する。
これにより、pickup projection・TimingModel更新後もeditPointが
古い時刻を保持することを防ぐ。

[EDIT POINT LIFETIME]
editPoint は永続化されない一時的なUI状態（ephemeral UI state）である。
選択（chordIds）が変化した時・project切替・Chart Mode再構築のいずれかで
必ずクリアされる。コマンドはeditPointを消費してよいが、
シリアライズ（保存・Undo履歴のスナップショット等）の対象にしてはならない。

意義:
  「コードを選ぶ」と「位置を選ぶ」を別の状態として分離したことで、
  既存の選択系コマンド（Copy/Cut/Merge等）を一切変更せずに
  挿入系コマンドの土台を追加できた。将来のPaste Insert・分割・
  休符挿入も同じeditPointの上に構築できる。
```

### [判断] 二段階クリックモデルの採用

```
背景:
  継続セルのクリックは既にPhase77前半で「コード選択」に割り当て済みだった
  （複数選択・Copy/Cut/Merge対象を広げるための改修）。
  editPoint導入にあたり、同じクリックに別の意味（位置指定）を
  持たせる必要が生じ、衝突が発生した。

検討した代替案:
  ・右クリックメニュー: 既存の実装パターン（Phase72）を流用できるが、
    「ワンテンポ遅れる」「譜面を直接触る体験から離れる」という欠点が
    実機を想定した議論で浮上し不採用。
  ・ホバーで+ボタン表示: タッチ操作（将来のスマホ対応）と相性が悪く不採用。

採用案:
  「1回目のクリック=選択、既に単独選択中の同じコードへの2回目のクリック=
  editPoint」という、PowerPoint等の「選択→再クリックで編集モード」と
  同種の挙動を採用。空セル（data-chord-idを持たないセル）は選択という
  概念が無いため、1回のクリックで直接editPointへ入る。
  既存の「継続セルクリック→選択」という挙動を一切変更せずに済んだ。
```

### [判断] Add Hereはsplitチェーンの再利用のみで実装

```
splitChord(ownerId, splitTime) は Phase75時点で既に任意の時刻を
受け取れる汎用関数として設計されていた。Add Hereは
「分割位置がクリック位置になっただけ」であり、新しい分割ロジックは
一切追加していない。追加ダイアログのキャンセル時は
splitChord()自体に到達しないため、editPointも含め状態は一切
変化しない（[CANCEL INVARIANT]）。
```

---

## 5.5 Design Principles（設計哲学）

今回のPhase77で得られた教訓は、個別の設計判断（5.節）を超えて、
今後のPhase78以降でも判断基準として使える設計哲学に整理できる。

```
・実装上の対称性よりUXを優先する
  （左右対称・on/off対称に「作れるから作る」のではなく、
   実際に触って感じた違和感を優先する。右側境界移動の撤去が好例）

・状態（state）を切り替えることでUIを単純化する
  （ボタンを並べて出し分けるのではなく、「今どの編集モードか」で
   表示そのものを切り替える。Phase78のFooter Interaction Modelの土台）

・編集対象（コード）と編集位置（editPoint）は分離する
  （selection.chordIdsとselection.editPointは排他。
   「何を選んでいるか」と「どこを編集しているか」を別の状態として持つ）

・編集コマンドはAuthorityを経由してのみ状態変更を行う
  （moveBoundary()・splitChord()等、唯一の更新窓口を通す。
   新しいコマンド（Add Here等）も新しい更新経路を作らず、
   既存Authorityの呼び出し順序を組むだけで実現する）
```

この4点は、Paste Insert・Boundary Decorator・将来の位置基準編集
（分割・休符挿入等）を設計する際の判断基準として、Phase78以降も
継続的に参照する。

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 「時間が足りません」は境界ぎりぎりの位置選択による正常なガード

実機テストで、Add Here実行時に「この位置には追加できません（時間が足りません）」というトーストが出た。
原因調査の結果、クリックした位置がonsetのごく近く（対象コードの開始時刻とほぼ同時刻）であり、`splitChord()`の「duration 0のコードを作らない」というガード（Phase75由来）が正しく機能した結果だった。バグではなく、境界ギリギリのスロットを選ぶと発生しうる想定内の挙動として記録する。

### 曲頭（pickup相当に見えた領域）のeditPointは正常に機能していた

実機確認で「Bmより前の空白部分が選択できない」という報告があったが、これは再生位置ハイライト（青色）とeditPoint機能の見た目上の混同だった。実際にクリックしたところ、曲頭の空白部分でもeditPointは正しく生成され、Add Hereも成功した。pickup小節の`projectionEmpty`によるクリック不可の懸念は、今回のケースでは該当しなかった（この曲がpickupを含まないためと推定。実際にpickupを含む曲での検証は引き続き未実施＝既存のOpen Itemのまま）。

### DevToolsコンソールでの状態確認は、視覚的フィードバックが無いと分かりにくい

editPoint機能の初期実装（Step①）を`window.__analysisEditorDebug.state.selection`のみで検証しようとしたところ、クリック操作とコンソール確認のタイミングが合わず、結果の解釈に混乱が生じた。この経験を踏まえ、実装順序を「データモデル→視覚マーカー→UI→機能」の順に組み直し、Step②（マーカー表示）を先に実装したことで、以降の実機確認が大幅にスムーズになった。

---

## 7. Remaining Issues（残課題）

Phase78へ持ち越す項目は「9. Open Items」参照。

### 実装済みだが暫定扱いのもの

```
・個別移動ハンドル（選択中コード左端のアンバー縦棒）
・editPointマーカー（破線枠+薄い背景）
  → いずれも[BOUNDARY DECORATOR]として統合予定（Phase78）
```

---

## 8. Next Phase（次フェーズ開始位置）

Phase78を「Analysis Editor UI/UX 統合リデザインフェーズ」として開始する。
以下は実装順（Sprint単位）。優先順位ではなく、この順で着手する
（Footer設計が固まらないとDecoratorの見た目が決められず、
Decoratorが無いとPaste Insertの視覚フィードバックが作れないため）。

```
Phase78 Sprint1: Footer Interaction Model
  状態遷移型UIへの刷新。State（未選択/単一選択/複数選択/editPoint）を
  ボタンの並べ替えではなく状態そのものの切り替えとして設計する。
       ↓
Phase78 Sprint2: Boundary Decorator
  境界ハンドル・editPointマーカーの統一描画システム。
  Sprint1で確定したFooterのビジュアル言語に合わせる。
       ↓
Phase78 Sprint3: Paste Insert
  editPointへの貼り付け挿入。Sprint1のFooterにボタンを追加する形で実装。
       ↓
Phase78 Sprint4: Visual Polish
  全体的なビジュアルブラッシュアップ（配色・アイコン・アニメーション等）。
```

---

## 9. Open Items for Phase78

```
- Footer Interaction Model
  - 「今どの編集モードか」が一目で分かるUIへ再設計
    （未選択／単一選択／複数選択／editPointで表示ボタンを完全に切り替える）
  - 「全体シフト」等の低頻度操作は「その他▼」等へ格納し、常設ボタンを減らす
  - 削除ボタンの赤色が周囲に対して強すぎる問題の見直し

- Boundary Decorator
  - 個別移動ハンドル・editPointマーカーの統一描画
  - アニメーション・Hover演出
  - Footer UIリデザインとの統合

- Paste Insert
  - editPointへのクリップボード挿入コマンド
  - 既存のcopySelection()のクリップボード形式（{version, chords:[{chord,ratio}]}）
    を再利用予定

- 矢印キーの範囲シフト対応（優先度低）
- 複数選択時の個別移動（優先度低・意図的に見送り。再要望があれば再検討）
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/chartmode.js
  ・expandToSlots(): carryスロットへのsourceChordId伝播（通常経路・pickup経路両方）
  ・_renderChartGrid(): carryスロットへのdata-chord-id付与
  ・クリックハンドラ: [data-chord-id]全体への一本化・二段階クリックモデル・
    空セルクリック対応
  ・_getExactTimeFromSlot() / getTimeForGridPosition() 新設
  ・chartState.editPointMarker / setEditPointMarker() 新設
  ・_applyEditPointMarker() 新設・renderChartMode()から呼び出し
  ・onEditPointRequestedコールバック新設（initChartMode注入パラメータに追加）

js/app.js
  ・selection.boundaryIndex: 対象を右側→左側へ変更
  ・shiftSelectedBoundary(): 単一選択専用ガード追加
  ・shiftSelectionRange() 新設
  ・selection.editPoint 新設
  ・setEditPoint() / clearEditPoint() / addChordAtEditPoint() 新設
  ・renderAnalysisEditorPanel(): editPointモード分岐（早期return）
  ・Escapeキー処理にeditPoint解除を追加
  ・[BOUNDARY EDIT AUTHORITY] / [EDIT POINT AUTHORITY] / [EDIT POINT LIFETIME] /
    [RANGE SHIFT AUTHORITY] / [SELECTION EDIT TARGETS] をコードに明記
  ・window.__analysisEditorDebugにsetEditPoint/clearEditPoint/
    addChordAtEditPoint/shiftSelectionRangeを追加

css/components.css
  ・.chart-chord-name--selected::before（個別移動ハンドル・暫定）
  ・.chart-slot--edit-point（editPointマーカー・暫定）
  ・.aep-btn--primary（Add Here用強調ボタン）
```

---

## 11. Micro Log

- 継続セルクリック改善（①）の実機確認完了後、当初の3項目予定
  （継続セル・editPoint・Add Here）から「個別移動UXの違和感」相談が入り、
  スコープが拡大
- 個別移動の対象を右側→左側へ変更する際、既存ロジック（moveBoundary/
  shiftSelectedBoundary）が「境界を挟む2要素」の汎用処理だったため、
  _refreshSelection()側のboundaryIndex算出１箇所の変更で対応できた
- 複数選択時の個別移動で「先頭コードだけ動く」違和感が実機確認で発覚し、
  個別移動を単一選択専用に限定・範囲シフトを新設して役割分離
- editPoint基盤の実装順序を「データモデル→視覚マーカー→UI→機能」に
  組み直した（詳細はFindings参照）
- Add Here実機テストで「時間が足りません」表示が発生したが、
  境界ギリギリの位置選択による正常なガードと判明（バグではない）
- 「曲頭が選択できない」という報告は、再生位置ハイライトとeditPoint
  マーカーの見た目上の混同と判明（実際は正常に機能していた）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
