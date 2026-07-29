# 引き継ぎ: Phase96-97完了 — Decorator Inventory整理 / Selection Hit-Test統一 / Search Enharmonic対応

> Phase96（Decorator整理）とPhase97（Hit-Test修正・Searchバグ修正）は密接に連続しており、
> 実機検証の過程で相互に発見が連鎖したため1つのhandoverにまとめる。
> ChatGPTレビュー済み（Decorator Budget原則の文言・Active Measureの実装値切り分け・
> Selection Hit-Test再現手順の切り分け等、複数回のレビューを反映済み）。

> [前提] Boundary Hover自体の設計・実装経緯（hover駆動での境界ドラッグ・
> chordId起点のdrag state・当たり判定の縮小等）は`handover_phase95-A2.md`を
> 参照。本書は、その後に着手したUI整理（Decorator Inventory・Visual
> Hierarchy）と、実機検証で見つかった副作用修正のみを扱う。

## 作業状態
- ブランチ: phase96-97-decorator-hit-test（想定。実ブランチ名は運用に合わせて読み替え）
- 直前作業: Phase95-A2完了（Boundary Handle Hover + Direct Drag）

---

## 1. Purpose（目的）

Phase95-A2の実機フィードバックから、「Chart Modeの視覚装飾（Decorator）が多すぎて、
開発者本人でも何を表しているか分からない」という、UI設計レベルの課題が提起された。
これを受け、CSSの微調整ではなく、Chart Mode全体のDecorator設計を人間の認知を基準に
再整理する（Phase96）。その過程で発見された「セル上部クリックでeditPointになる」
というHit-Test不具合と、「検索が置換を繰り返すと0件になる」という報告を、
実機デバッグで原因確定の上
修正する（Phase97）。

---

## 2. Scope（今回やったこと）

```
Phase96: Decorator Inventory整理
  ・実コード（chart.css）から全Decorator（.chart-slot--*/.chart-measure--*等）を
    洗い出し、Intent（伝えたい意味）・Layer・Primary/Secondary・Exclusiveで整理
  ・[ONE INTENT, ONE PRIMARY DECORATOR][VISUAL HIERARCHY]原則を確立
  ・Boundary Handle選択版を削除（hover版へ統合）
    - app.js: _getBoundaryHandleChordId()削除・setBoundaryHandleTarget呼び出し削除
    - chartmode.js: chartState.boundaryHandleChordId削除・setBoundaryHandleTarget()削除・
      クラス付与ロジック削除・pointerdown当たり判定簡素化
    - chart.css: .chart-slot--boundary-handleをセレクタから除去
  ・Selectionの水玉テクスチャを試作 → 複数の問題（小節またぎの継ぎ目・テーマ依存色・
    重なり順）が解決しきれず最終的に撤回
  ・Active Slot / Active Measureの視覚強度をPlayheadより弱く調整

Phase97: Selection Hit-Test統一 + Search Enharmonic対応
  ・onsetセル自身にdata-chord-idを付与（従来はラベルのみ）
  ・.chart-measure-numをposition:absolute + pointer-events:noneへ変更
    （小節幅いっぱいの帯としてクリックを横取りしていた不具合を修正）
  ・setPointerCapture()の呼び出しをドラッグ確定時まで遅延
  ・searchChords()の比較にnormalizeEnharmonic()を導入（chords.js新設・
    検索マッチング専用。findChord/表示/保存には影響しない）
  ・theme.css: silverテーマの.chart-measure--active専用オーバーライドに
    残っていた独立したbackground定義を削除（[THEME LAYER RESPONSIBILITY]原則）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Selectionの水玉テクスチャの本格実装
  → 小節またぎでの継ぎ目・テーマ依存色（--color-selection-rgb等）・
    z-index重なり順という3つの問題が同時に出ており、UI整理を優先するため撤回。
    current-issues.mdのFuture Featuresへ再検討候補として記録。

・実音（canonical）そのものでの検索モード
  → 検索欄は「画面表示名（capo適用後）」で検索する設計を維持。
    実音直接検索は別機能として将来検討（current-issues.md参照）。

・Correction Badgeの開発者情報トグルUI
  → Decorator Inventoryで「開発者寄り」と位置づけを明確化したのみ。
    実際のトグルUI実装は見送り。

・Active Measureの視覚強度のさらなる調整（色のコントラスト変更等）
  → 実機トークン値（--border-ui / --text-accent）を確認した結果、
    既存の暗いテーマでは十分なコントラストが既にあり、実機評価でも
    「違和感がなくなった」との確認を得たため、これ以上の調整は見送り。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| Boundary Handle統合 | 選択版クラス付与・setBoundaryHandleTarget()・chartState.boundaryHandleChordIdを削除。hover版（.chart-slot--boundary-hover）のみ残置 | app.js / chartmode.js / chart.css |
| Active Slot弱体化 | outline alpha .55→.22、background .06→.02（削除ではなく低alpha化） | chart.css |
| Active Measure弱体化 | background塗りを削除、border-widthも通常枠(1px)から変えない方針へ | chart.css / theme.css（silver専用オーバーライド） |
| Selection水玉（試作→撤回） | 追加→撤回。最終的にbackground-colorのみのシンプルな塗り+枠に戻した | chart.css / chartmode.js |
| 拍頭（downbeat）強調 | slot.beatIndex===0の時 .chart-slot--downbeat を付与 | chartmode.js / chart.css |
| onsetセルのHit-Test修正 | slotEl.dataset.chordId = slot.id を追加（従来はchordEl子要素のみ） | chartmode.js |
| 小節番号Hit-Test修正 | .chart-measure-numをposition:absolute + pointer-events:noneへ | chart.css |
| Pointer Capture遅延 | setPointerCapture()の呼び出しを_onGridPointerDownから_onGridPointerMove（ドラッグ確定時）へ移動 | chartmode.js |
| Search Enharmonic対応 | normalizeEnharmonic()新設。searchChords()の比較に適用（報告された0件現象の直接原因はcapo変更・仕様通りの挙動。調査過程で見つかった独立の潜在バグへの対応） | chords.js / app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Decorator Inventoryに「Intent」列を追加する（ChatGPTレビュー反映）

```
結論:
  Decorator一覧を「存在するDecorator一覧」ではなく、「ユーザーが知覚する
  情報（Intent）」を軸に組み直した。Decorator/Layer/Priorityだけでなく、
  Intent列を必須項目とした。

理由:
  今回の課題（「棒や枠がいっぱいあるけど何を表しているのか分からない」）は、
  実装ミスではなく「同じIntentを複数のDecoratorが同程度の強さで
  同時に表現していた」ことが原因だった。Intent列があることで、新規
  Decorator追加時に「このIntentは既に誰かが担当していないか」を
  必ず確認できるようになる。
```

### [判断] Active Measureは「削除」ではなく「視覚強度を下げる」を選ぶ

```
結論:
  Active Slotは演奏者にとって最重要な情報（今の拍が瞬時に分かる）として
  維持を決定。Active Measureは背景塗りを廃止し、通常枠と同じ太さの
  枠色変更のみに簡素化した（削除はしない）。

理由:
  ChatGPTレビューで「削除ではなく一旦弱める方が、比較評価ができて安全」
  という指摘を受け採用。また実機で演奏を試した結果、「Active Slotの方が
  演奏に必要」という実体験に基づくフィードバックを得たため、開発者視点の
  重複整理だけでなく演奏者視点を優先する判断に修正した。
```

### [判断] Boundary Handleは選択版を削除し、hover版のみへ統合する

```
結論:
  Phase93で確立した「選択中コードにだけ常時表示されるハンドル」を廃止し、
  Phase95-A2のhover駆動ハンドルのみを残す。

理由:
  Phase95-A2の時点で「選択しなくても境界編集できる」が実現していたため、
  「選択したから常時ハンドルが出る」という設計の存在意義は既に薄れていた。
  ユーザーから見ても、選択版とhover版は見た目が同じで「ここ動かせる」
  という同一のIntentしか伝えておらず、2つの入口を維持する理由がなかった。
```

### [判断] Selectionの水玉テクスチャは撤回する

```
結論:
  「和紙のような質感」を目指して水玉テクスチャを試作したが、最終的に
  撤回し、単色の塗り+枠のみに戻した。

理由:
  実装過程で以下3つの問題が同時に発生し、いずれも簡単には解決できな
  かった:
  1. 小節をまたぐコードで、水玉オーバーレイが小節の外まで伸びられず
     継ぎ目でパターンが途切れる（DOM構造上の制約）
  2. --color-selection-rgbのようなalpha合成用トークンが、テーマに
     よって定義漏れ・別のトーンになる場合がある
  3. 他のDecorator（Active Measure等）との重なり順・z-index競合

  ちょうど並行してDecorator Inventory整理（Phase96本体）を進めていた
  ため、「見た目の作り込み」より「情報設計の整理」を優先すべきと判断し、
  一旦シンプルな表現に戻した。将来再挑戦する場合は、carryセルへ跨る
  継ぎ目問題を根本的に解決する設計（コード全体を1つの連続した要素として
  扱う等）から着手すること。
```

### [判断] theme.cssは色のみを持ち、状態表現はchart.cssに集約する

```
結論:
  [THEME LAYER RESPONSIBILITY]原則を新設。theme.cssにはborder-color等の
  色トークンの値のみを許可し、background/outline/box-shadow等の状態表現
  そのものはchart.css側の責務とする。

理由:
  Active Measureの背景塗りをchart.css側で撤回したにも関わらず、
  シルバーテーマだけ旧デザイン（塗り）が復活して見える不具合が発生した。
  原因はtheme.css内のテーマ専用オーバーライドに、独立した古い
  background定義が残っていたため。「chart.cssを直せば必ず全テーマへ
  反映される」という前提を保証するため、責務分離を明文化した。
```

### [判断] Search Engineの検索マッチング系比較をenharmonic許容にする（潜在バグの独立修正）

```
結論:
  normalizeEnharmonic()（chords.js新設）を、検索マッチング系の比較処理へ
  適用する（現時点ではsearchChords()が対象。将来replaceMatches()等、
  同じ比較ロジックを必要とする箇所が増えた場合も同様に適用してよい）。
  findChord()（CHORD_DB lookup）・表示・保存ロジックには一切変更を
  加えない。

[ChatGPTレビュー反映] この節を読む上での注意:
  今回ユーザーから報告された「置換を繰り返すと検索が0件になる」という
  現象そのものの直接原因は、セッション途中でCapoを変更したことによる
  仕様通りの挙動だった（§6 Findings参照。バグではない）。
  一方、その調査過程で「Capoが変わっていなくても、画面表示名（例: 'B'）で
  検索すると、buffer側の綴り（例: 'Eb'）と一致せず0件になる」という
  *潜在バグ*が調査過程で別件として見つかった。本節の修正はこの潜在バグに対する
  ものであり、「今回報告された現象の直接原因を直した」わけではない。
  両者を混同しないこと。

理由:
  project_instructions.mdの既存方針「enharmonic（C#/Db）は統合しない」を
  維持しつつ、検索という「同じ音を見つけたい」という目的にだけ限定して
  例外を設けた。Capo往復変換の一連の処理（画面入力→toCanonicalChord()→
  transposeChord()→transposeRoot()という経路）の結果、bufferの実際の
  綴りと異なるシャープ/フラット表記になるケースがあり（表記の選択が
  入力文字列のb/#有無に依存するtransposeRoot()の仕様に起因する）、
  音は同じでも綴りが違うだけで検索が機能しなくなっていた。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 「セル上部クリックでeditPointになる」原因は2つ独立して存在した

```
1つ目（Phase95-A2の副作用として一度発見・修正済みだったもの）:
  onsetセルのdata-chord-idがラベル（.chart-chord-name、セル下部のみに
  配置）にしかなく、セル自身には無かった。セル上部をクリックすると
  e.target.closest('[data-chord-id]')が失敗し、editPointへ落ちていた。

2つ目（Phase96のDecorator整理中に別件として新たに発見したもの）:
  .chart-measure-num（小節番号）がposition指定の無い通常ブロック要素
  だったため、見た目は右上の小さい数字だけでも、実際のDOM要素は小節の
  横幅いっぱいの帯としてレイアウト上の場所を占有し、chart-slotsより
  前面でクリックを横取りしていた。

1つ目を修正した後も再現が続いたため、「別の原因が新たに割り込んで
いる」と推測し、DevToolsの要素ピッカーで実際にカーソル位置の要素を
特定したところ、2つ目が発覚した。1つ目の修正が無駄だったわけではなく、
2つの不具合が同じ症状（editPointになる）として重畳して存在していた。
```

### 「青い棒」調査は3段階の誤認を経て正体が判明した

```
1段階目: chart-measure--active（Active Measure）の背景塗りだと推測
  → theme.css側の独立したオーバーライド（silver専用）が原因と判明・修正

2段階目: 修正後も「棒」が見える → 再度chart-measure--activeを疑ったが、
  DevToolsのComputedタブで確認したところ、実際は.chart-measureベースの
  正当な背景色（全小節共通、Active関係ない）であり、Active Measure自体の
  修正は正しく効いていることが判明

3段階目: 要素ピッカーで直接特定した結果、実際は.chart-playhead
  （現在再生位置を示す、幅2px・両端丸の細い線）だった。Active Measureの
  塗りを撤回したことで、今まで太い背景に埋もれて目立たなかった
  Playheadの線が初めて明瞭に見えるようになっただけで、これはバグではなく
  意図した動作だった。

推測だけで「背景塗りが怪しい」と決め打ちせず、DevToolsの要素ピッカーで
実際にカーソル位置の要素を特定する、という手順を踏んだことで、最終的に
正しい原因（Active Slot=.chart-slot--active、水色の四角い枠）にも
同じ手法でたどり着けた。
```

### 「置換を繰り返すと検索が0件になる」の真因はcapo変更だった

```
ChatGPTレビューで「状態遷移がある症状（最初は成功、後で失敗）は
enharmonicの問題だけでは説明できない。Search Sessionの状態管理を
疑うべき」という指摘を受け、window.__analysisEditorDebug /
window.__CS_DEBUG__ で実際の内部状態を実測した。

結果、bufferには確かにchord:'Eb'が28件存在し、search.queryも正しく
'Eb'を保持しているにも関わらずmatchesが0件という、状態管理としては
矛盾の無い（＝壊れていない）状況が確認できた。capo=4を実測した上で
toCanonicalChord('Eb',4)='G'・toCanonicalChord('B',4)='D#'（共に
bufferの'Eb'と不一致）と計算で証明し、最後にユーザー本人へ「昨夜
capoを変更したか」を確認したところ、実際にセッション途中でcapoを
変更していたことが判明した。「壊れた」のではなく「capoが変わったから
結果も正しく変わった」だけであり、Search Session自体には問題が
無かったことが実測で確定した。
```

---

## 7. Remaining Issues（残課題）

```
・Selectionの水玉テクスチャ（撤回済み・将来再挑戦の余地あり）
  状態: 保留（current-issues.md Future Features参照）

・実音（canonical）そのものでの検索モード
  状態: 未着手（current-issues.md Future Features参照）

・Correction Badgeの開発者情報トグルUI
  状態: 未着手（current-issues.md Future Features参照）

・検索欄の入力仕様（画面表示名ベース）が直感的でない可能性
  状態: 観察中（current-issues.md 技術的負債参照）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
次フェーズの内容は未確定。候補は2系統:

系統1: Phase95-A1手前で見送ったB1/B3/A（クリック挙動統一の設計セッション）
  Phase93〜97で実機感覚が十分溜まった時点で着手を検討。

系統2: Section Data Layer の「S. Section Specification」フェーズ
  section-model.md §9の未解決事項に回答してから独立フェーズとして着手。

優先順位は次回セッション開始時に相談して決める。
```

---

## 9. Files Changed（変更ファイル一覧）

```
app.js
  ・_getBoundaryHandleChordId()削除・setBoundaryHandleTarget呼び出し/import削除
  ・_getChordBufferIndex()新設（Phase95-A2由来・継続使用）
  ・_boundaryDragState導入（selection非依存のドラッグ状態管理）
  ・searchChords()の比較をnormalizeEnharmonic()経由へ変更
  ・normalizeEnharmonicのimportを追加

chartmode.js
  ・chartState.boundaryHandleChordId削除・setBoundaryHandleTarget()削除
  ・選択版Boundary Handleのクラス付与ロジック削除
  ・pointerdown当たり判定を.chart-slot--boundary-hoverのみへ簡素化
  ・setPointerCapture()呼び出しを_onGridPointerMove（ドラッグ確定時）へ移動
  ・slotEl.dataset.chordId = slot.id を追加（onsetセル自身へのHit-Test修正）
  ・slot.beatIndex===0の時 .chart-slot--downbeat を付与
  ・_getChordIndex accessor受け取り（Phase95-A2由来）
  ・_setupBoundaryHoverEvents()新設（Phase95-A2由来・継続使用）

chart.css
  ・.chart-slot--boundary-handleをセレクタから除去
  ・.chart-slot--active / .chart-measure--active の視覚強度を弱体化
  ・.chart-measure-numをposition:absolute + pointer-events:noneへ変更
  ・.chart-slot--downbeat新設
  ・.chart-selection-dots（水玉オーバーレイ）は追加後に撤回・削除

theme.css
  ・body[data-theme="silver"] .chart-measure--active のbackground定義を削除
    （border-colorのみ残す）

chords.js
  ・normalizeEnharmonic()新設（検索マッチング専用のenharmonic正規化）

architecture.md / current-issues.md / phase-status.md
  ・本handover末尾のAppendix A/B/Cの内容を、各ドキュメントへ手動で反映すること
```

---

## 10. Micro Log

- Decorator整理の発端は、Phase95-A2の実機フィードバックで「境界ハンドル・
  選択枠・再生位置表示が同じような場所に何個も出て、開発者本人でも
  意味が分からない」という指摘だった。CSSの微調整ではなくUI設計の
  問題として扱うべき、という認識をChatGPTと共有した上で着手した
- Decorator Inventoryは当初「Decorator/Layer/Priority」の3列で組んだが、
  ChatGPTレビューで「Intent列が無いと、将来同じ問題を繰り返す」との
  指摘を受け、Intent列を追加して確定させた
- Active Measure/Active Slotの視覚強度調整は、一度「Active Slot削除」を
  検討する提案をしたが、たかっちさんの「演奏中はActive Slotの方が重要」
  という実体験ベースのフィードバックにより、削除ではなく視覚強度を
  弱めるだけの方針へ転換した（開発者視点の重複整理より演奏者視点を
  優先した判断）
- 「青い棒」の正体調査は、DevToolsの要素ピッカーを使った実測を
  3回繰り返し、最終的にActive Measureではなくchart-playheadだと判明した。
  推測だけで「背景塗りが怪しい」と決め打ちしなかったことが、正しい
  結論（Active Slot=水色の四角い枠、という別の発見）にもつながった
  好例だった
- Search Engineのバグは、当初「異名同音の問題」と断定しかけたが、
  ChatGPTレビューで「状態遷移がある症状はそれだけでは説明できない」
  との指摘を受け、window.__analysisEditorDebug / window.__CS_DEBUG__を
  使った実測に切り替えた。最終的にはenharmonicの問題自体は実測で
  証明できたが、「なぜ最初は動いていたか」はユーザー本人への確認
  （capo変更の事実）で初めて完全に説明がついた。実装ロジックの正しさと、
  実際の再現手順の正しい理解は、別々に検証する必要があるという教訓
- 全ての修正について、node --check・CRLF維持・diff最小化を徹底し、
  修正のたびにファイルを提示して実機検証→フィードバックのサイクルを
  繰り返した

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: なし（既存issueの直接closeではなく、Decorator
  Inventory整理・Hit-Test修正・Searchバグ修正という新規作業のため）
- 今回新規に積み残したissue: 本handover末尾のAppendix B参照
  （実音検索モード・Correction Badgeトグル化・検索欄の入力仕様表示）

---

# Appendix A: architecture.md 反映内容

> 挿入位置: §12 Analysis Editor Architecture の Decorator Layer 節の後、
> または独立した「§12.x Decorator Design Principles」として新設。

---

## Decorator Inventory（Phase96で確立）

Chart Mode上に同時に存在しうる視覚装飾（Decorator）の一覧。
新規Decorator追加時は、まずこの表と照合し、既存Intentとの重複が無いか確認すること。

| Decorator | Intent（何を伝えたいか） | Layer | Primary/Secondary | 表示条件 | Exclusive（排他） |
|---|---|---|---|---|---|
| Playhead | 今どこを演奏しているか | Overlay | Primary | 再生中 | 共存可 |
| Active Slot | 今の拍を把握する（Playheadの補助） | Overlay | Secondary | 再生中 かつ 対象slot | 共存可 |
| Active Measure | 小節を見失わない（Playheadの補助） | Background | Secondary | 再生中 かつ 対象小節 | 共存可 |
| 拍線／拍頭 | 拍・小節の区切りを常に示す | Background | Primary | 常時 | 共存可 |
| Selection | 編集対象を示す | Background | Primary | 選択中 | **EditPointと排他** |
| Boundary Handle | 編集可能な境界を示す | Overlay | Primary | 編集中 AND hover AND 左境界あり（曲頭でない） | Selectionと共存可 |
| EditPoint | 挿入位置を示す | Overlay | Primary | selection.editPoint確定時 | **Selectionと排他** |
| Search候補（未アクティブ） | 検索結果の存在を示す | Background | Secondary | 検索中のみ | Selectionが視覚的に勝つ（共存可） |
| Search候補（現在の検索位置） | 今どの検索結果を見ているかを示す | Background | Primary（検索中のみ） | 検索中 かつ 現在地 | Selectionと事実上同一表現（共存可） |
| Collision Indicator | 隠れているコードの存在を警告する | Overlay | Secondary | 衝突時のみ | 共存可 |
| Correction Badge | 解析タイミング補正の状態を示す | Overlay | Secondary（開発者寄り） | 補正時のみ | 共存可 |

**[運用ルール] Decorator Usability Audit**
新規Decoratorを追加・変更する際は、Decorator Inventory表への追加に加えて
以下を確認する（Phase96のUIレビューで最も価値があったのは「表示を減らす」
ことではなく「ユーザーが意味を理解できないDecoratorを減らす」ことだった、
という教訓に基づく。表を作った後も形骸化させないための継続運用ルール）:
  ・目的（Intent）は何か
  ・対象ユーザーは誰か（演奏者向け／編集者向け／開発者向け）
  ・初見のユーザーが5秒以内に意味を理解できるか

---

## [ONE INTENT, ONE PRIMARY DECORATOR]（Phase96で確立）

```
同じIntent（伝えたい意味）を持つDecoratorが複数存在する場合、
そのうち1つだけをPrimaryとし、視覚強度を最大にする。
残りはSecondaryとして、Primaryより明確に弱い表現に留める。

[注記] Primaryは「Chart Mode全体で1つ」ではなく「Intent単位で1つ」。
Intentが異なれば、それぞれが独立してPrimaryを持ってよい
（例: Playhead=「再生位置」のPrimary、Selection=「編集対象」のPrimary、
EditPoint=「挿入位置」のPrimaryは、互いに競合しない別々のIntent）。

新規Decorator追加時は、Decorator Inventoryの「Intent」列を確認し、
既存Decoratorと同じIntentを持っていないか必ず評価すること。
同じIntentが既にPrimaryとして存在する場合、新規Decoratorは
Secondary（弱い表現）として追加するか、既存Decoratorへ統合することを検討する。

例（現在の再生位置という1つのIntentに対して）:
  Playhead       — Primary（唯一の強い表現）
  Active Slot    — Secondary（拍の把握を助けるだけ）
  Active Measure — Secondary（小節を見失わない程度）
```

背景（経緯）: Chart Modeの視覚装飾は個々には正しい役割を持っていたが、
「今どこを演奏しているか」という1つの意味を複数のDecorator（Playhead・
Active Slot・Active Measure）が同時に、かつ同程度の視覚強度で表現していたため、
実際に使う側からは「意味は複数あるはずなのに、知覚上は1種類にしか見えない」
という状態になっていた（Semantic は複数でも Visual が近すぎる、という
UI設計上よくある問題）。個々のDecoratorの実装は誤っていなかったが、
「主役が決まっていない」ことが根本原因だった。

---

## [VISUAL HIERARCHY]（Phase96で確立）

```
Decoratorは実装上の重要度ではなく、ユーザーが最初に知覚してほしい順番で
視覚強度を決める。視覚強度は Primary > Secondary を維持すること。

architecture.mdには視覚強度の設計意図（Primary/Secondaryの区分）のみを書き、
具体的な実装値（outline alpha値・border-width等）はchart.css側の
コメントに留める（WHAT/HOWの分離。THEME LAYER RESPONSIBILITYと同じ考え方）。

[Search Highlightの事例（Phase97〜98の試行錯誤を経て確立）]
候補が多数同時に表示されるDecorator（Search候補等）では、VSCodeの検索
ウィジェットと同じ「候補は同じ形のまま低い強度・現在地は同じ形のまま
高い強度」という設計に倣う。試行錯誤の過程で、一度は形状（ドット等の
追加装飾）による区別を試みたが、装飾が増えることでかえって画面が
うるさくなり効果も薄かった。最終的には形状を増やさず、候補の強度を
大きく下げることと、その強度値をテーマごとに調整すること
（THEME LAYER RESPONSIBILITY参照）の組み合わせで解決した。
教訓: 強弱だけの区別が機能しない場合、まず装飾を足す前に「弱い方の
強度が本当に十分弱いか」「テーマごとの基準色に対して強度が適切か」を
先に見直すこと。
```

---

## [THEME LAYER RESPONSIBILITY]（Phase97で確立・Phase98で精緻化）

```
theme.cssは色トークン（color / border-color等の値。alphaを含む
rgba()形式の色トークンも対象）を持つ。
Decoratorの状態表現そのもの（あるDecoratorにbackground/outline/
box-shadowを適用するかどうかという判断）はchart.css（Decoratorの
実装側）が責務を持つ。theme.cssで「chart.css側が定義していない
状態表現を追加する」形の上書きは行わない。

[明確化] これは「theme.cssにbackgroundプロパティの値を一切書けない」
という意味ではない。例えば--color-search-candidate-bgのように、
「この色トークンの強さ（alpha）をテーマごとに変える」ことは色
トークンの定義そのものであり許容される。禁止しているのは、
chart.css側の対象Decoratorに存在しない状態表現をtheme.css側だけで
独自に追加・復活させることである。
```

背景（経緯）: chart.css側でActive Measureの背景塗りを廃止したにも関わらず、
theme.cssのsilverテーマ専用オーバーライド（`body[data-theme="silver"] .chart-measure--active`）
に古い`background`定義が独立して残っており、シルバーテーマだけ旧デザインが
復活して見える不具合が発生した（実機検証で発見・修正済み）。原則として、
chart.cssを直せば全テーマへ反映される、という前提を保つための原則。

---

## Boundary Handle統合（Phase96で確立）

```
Boundary Handleは「選択版」（常時表示・selection.boundaryIndex駆動）と
「hover版」（Phase95-A2・hover駆動）の2種類が存在していたが、選択版を廃止し
hover版へ一本化した。理由: Phase95-A2でhoverだけでも境界編集できるように
なった時点で、「選択したから常時ハンドルが出る」という設計の存在意義が
薄れていた（Decorator Inventory棚卸しで発見）。

ドラッグ確定時に渡すchordIdは、selection経由ではなくbufferから直接
boundaryIndexを導出する（app.js: _boundaryDragState。selectionとは
独立したephemeral state）。これにより「選択中とは別のコードの境界を
hoverから直接ドラッグする」ケースにも対応している。
```

---

## Selection Hit-Test統一（Phase97で確立）

```
[HIT-TEST INVARIANT]
コードを表すslot（onset・carry。empty/projectionEmptyは対象外）は、
いずれも自分自身（slotEl）にdata-chord-idを持つ。従来はonsetセルのみ
ラベル（chart-chord-name、セル下部にのみ配置）にdata-chord-idがあり、
セル自身には無かったため、セル上部をクリックするとclosest('[data-chord-id]')
が失敗し、意図せずeditPointへ落ちる不具合があった（実機で発見・修正済み）。

[MEASURE NUMBER HIT-TEST INVARIANT]
.chart-measure-numはposition:absolute + pointer-events:noneとする。
position指定の無い通常ブロック要素のままだと、見た目は右上の小さい
数字だけでも、実際のDOM要素は小節の横幅いっぱいの帯としてレイアウト上の
場所を占有し、chart-slotsより前面でクリック・ホバーを横取りしてしまう
（実機で発見・修正済み）。装飾目的の要素はpointer-events:none等で
クリックを素通りさせることを、今後の新規Decorator追加時にも徹底する。

[POINTER CAPTURE INVARIANT]
setPointerCapture()は「ドラッグが確定した瞬間」まで呼び出しを遅らせる。
pointerdown時点で無条件にcaptureすると、ドラッグしないプレーンな
クリックでも後続clickイベントのe.targetが捕捉元要素に固定され、
data-chord-idを持つ子要素を正しく解決できなくなる（実機で発見・修正済み）。
```

---

## Search Engine: Enharmonic対応（Phase97で確立）

```
[SEARCH ENHARMONIC INVARIANT]
searchChords()の比較はnormalizeEnharmonic()（chords.js）を通した
正規化キー同士で行う。findChord()（CHORD_DB lookup）・表示・保存には
一切使わない（enharmonicを統合しないという既存方針は変えない。
検索マッチングという1箇所のみの例外）。

背景: Capo往復変換（画面表示 → toCanonicalChord()）の結果、
transposeRoot()の出力表記（シャープ/フラットどちらで返すか）は
「入力文字列にb/#が付いているか」に依存するため、bufferの実際の綴りと
異なる表記になるケースがあった（例: buffer='Eb', capo適用後の画面表示
'B'を検索語として入力 → toCanonicalChord('B',+4)='D#' となり、
'D#' !== 'Eb' で一致しない）。音は同じでも綴りが違うだけで検索が
機能しなくなる、異名同音特有の不具合だった（実機・実データで確認済み）。

[既知の制約] 検索欄は「画面に表示されている名前」で検索する設計であり、
実音（canonical）そのものを直接入力すると、capo分の変換がもう一度
適用されて別の音になる（バグではなく設計上の入力仕様）。実音そのもので
検索したいという需要があれば、将来的な機能拡張として別途検討する
（current-issues.md Future Features参照）。
```

---

# Appendix B: current-issues.md 反映内容

## 削除する項目（CLOSE BY DELETION・Phase96〜97で解決済み）

以下はcurrent-issues.mdから完了として削除する（「完了」表記は残さず削除のみ）。

- 「通常のChart Modeクリック全体への『選択+シーク』一般化」
  → 既にPhase95-A1で完了・current-issues.mdからは削除済みのはず（未削除なら削除）

- Boundary Handle 2種類の見た目重複に関する記述（もし既に何か書かれていれば）
  → Phase96で選択版廃止・hover版へ統合済み

---

## 新規追加（Future Features）

### 実音（canonical）そのものでの検索
状態: 未着手・優先度低
内容: 現在の検索欄は「画面に表示されている名前（capo適用後）」で検索する
設計。実音そのもの（capo適用前の値）を直接入力して検索したいという
ニーズがあれば、検索モード切替（表示名検索／実音検索）のようなUIを
将来検討する。今回は「画面表示名で検索する」という既存仕様に対する
バグ（enharmonic不一致）の修正のみを行った。

### Correction Badge の開発者情報トグル化
状態: 未着手・優先度低（Phase96 Decorator Inventory整理で再確認）
内容: 小節補正バッジ（`.chart-measure--estimated`等）は解析アルゴリズム
調整時のみ有用な情報であり、通常編集時は不要という位置づけが
Decorator Inventoryで明確になった。「開発者情報を表示」のような
表示設定トグルを将来追加し、デフォルトでは非表示にすることを検討する。

---

## 更新する項目（内容修正）

### Chart Mode: 極小durationコード衝突の可視化（Collision Indicator）
状態: 変更なし（Decorator Inventoryにて「Secondary・条件付き表示のため
実害小」と再確認済み。削除・簡素化の対象外と結論）

---

## 技術的負債（既存の技術的負債セクションへの追記候補）

- 検索欄の入力仕様（画面表示名ベース）が直感的でない可能性
  状態: 観察中・優先度低
  内容: capo適用中に実音（canonical）をそのまま検索欄へ入力すると、
  意図と異なる結果になる（バグではなく仕様）。案内方法の具体案
  （プレースホルダー等）は着手時に改めて検討する。

---

# Appendix C: phase-status.md 反映内容

## 1. Current Status（更新）

```
Completed（完了済み）に追加:
✓ Chart Mode Decorator Inventory棚卸し・Visual Hierarchy確立（Phase96）
✓ Chart Mode Boundary Handle統合（選択版廃止・hover版へ一本化。Phase96）
✓ Chart Mode Selection Hit-Test統一（Phase97）
✓ Search Engine Enharmonic対応（Phase97）
```

---

## 2. Major Milestones（Analysis Editor表への追加）

| Phase | 内容 |
|---|---|
| 95-A2 | Boundary Handle Hover + Direct Drag（selection非依存の境界編集） |
| 96 | Decorator Inventory棚卸し・Visual Hierarchy確立（[ONE INTENT, ONE PRIMARY DECORATOR]・[VISUAL HIERARCHY]原則確立。Boundary Handle選択版廃止・Active Slot/Active Measure視覚強度調整・Selection水玉テクスチャ撤回） |
| 97 | Selection Hit-Test統一（onsetセルへのdata-chord-id付与・chart-measure-num絶対配置化・setPointerCapture遅延化）・Search Engine Enharmonic対応・[THEME LAYER RESPONSIBILITY]原則確立 |

---

## 3. Future Candidates（更新）

```
削除する項目:
・「Boundary Handleのドラッグ操作」→ Phase93で実装済み（既に削除されているはず）
・「通常のChart Modeクリック全体への『選択+シーク』一般化」→ Phase95-A1で実装済み

新規追加:
・実音（canonical）そのものでの検索モード（current-issues.md参照）
・Correction Badgeの開発者情報トグル化（current-issues.md参照）
```

---

## Appendix: Phase Timeline 追加分

<details>
<summary>Phase93-97 を展開</summary>

#### Phase93 — Boundary Handle Drag Editing
- ドラッグ検出・座標→時刻変換・click握りつぶし・Undo制御を実装

#### Phase94 — Playback-aware Editing UX + Header Visual Language整理
- B4 Scroll Recovery・C1 Selection Measure Span・ヘッダー視覚言語整理（Green=編集ワークフロー系／Amber=編集補助系）

#### Phase95-A1 — Chart Modeクリックの「選択+シーク」一般化
- 通常クリックも検索結果クリックと同じ「選択+シーク」に統一

#### Phase95-A2 — Boundary Handle Hover + Direct Drag
- selection非依存でのhover→境界ドラッグを実装。chordId起点でboundaryIndexを導出（`_getChordBufferIndex`アクセサ経由）
- 実装過程で2件の副作用バグを発見・修正: (1) 誤ドラッグ多発（当たり判定をセル全体→左端10pxへ限定）、(2) setPointerCaptureによるクリック誤判定（capture発火をドラッグ確定時まで遅延）

#### Phase96 — Decorator Inventory棚卸し・Visual Hierarchy確立
- 発端: Chart Modeの視覚装飾（拍線・選択・境界ハンドル・再生位置表示等）が増えすぎ、
  「一つ一つは正しいが全体として分かりにくい」という設計課題が浮上
- 実コードから全Decoratorを洗い出し、Intent（伝えたい意味）・Layer・Primary/Secondary・
  Exclusive（排他）で整理したDecorator Inventoryを確立
- [ONE INTENT, ONE PRIMARY DECORATOR]原則を新設: 同じ意図を伝えるDecoratorが複数ある場合、
  1つをPrimary、残りをSecondaryとして視覚強度を明確に差別化する
- [VISUAL HIERARCHY]原則を新設: 視覚強度はユーザーが最初に知覚してほしい順で決める
- 具体的な調整: Boundary Handle選択版を廃止しhover版へ統合／Active Slot・Active Measureを
  Playheadより弱い表現へ調整／Selectionの水玉テクスチャは小節またぎの継ぎ目問題等が
  解決できず撤回
- Findings: Active Measureの背景塗り撤回がsilverテーマだけ反映されない不具合を発見。
  原因はtheme.css側の独立したオーバーライドで、chart.css単体の修正では波及しない
  ことが判明（[THEME LAYER RESPONSIBILITY]原則制定のきっかけ）

#### Phase97 — Selection Hit-Test統一・Search Engine Enharmonic対応
- 「セル上部をクリックするとeditPointになる」不具合を実機DOM検証で追跡し、
  同じ症状の裏に重畳していた2つの原因を発見・修正:
  1. onsetセルのdata-chord-idがラベル（セル下部のみ）にしか無く、セル自身に無かった
  2. `.chart-measure-num`がposition指定の無い通常ブロックのため、見た目以上に
     広い当たり判定（小節幅いっぱいの帯）を持ちクリックを横取りしていた
- 副次的にPointer Captureのタイミング起因のクリック誤判定も発見・修正
  （captureをドラッグ確定時まで遅延）
- Search Engineの「置換を繰り返すと検索が0件になる」報告を実機デバッグAPI
  （`window.__analysisEditorDebug` / `window.__CS_DEBUG__`）で実測調査。
  報告された現象自体の直接原因は、セッション途中でのCapo変更（仕様通りの
  挙動）だったことがユーザー本人への確認で判明。その調査過程で、Capoが
  変わらなくても画面表示名で検索するとbufferの綴りと不一致になりうる、
  独立した潜在バグ（capo往復変換における異名同音Eb/D#等の表記不一致）を
  別途発見。`normalizeEnharmonic()`を新設し、この潜在バグの方を修正した
  （findChord/表示/保存には影響しない）

</details>

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
