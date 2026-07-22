# 引き継ぎ: Phase91-92完了 — Chart Mode Collision Indicator（P1 v1）

> Phase91は調査フェーズ（修正コミットなし）。Phase92でその結果を実装した。
> 密接に連続しているため1つのhandoverにまとめる。
> ChatGPTレビュー済み（architecture.md/phase-status.md/current-issues.mdの
> 用語規約・記述精度について複数の修正提案を受け、反映済み）。

## 作業状態
- ブランチ: phase92-collision-indicator（想定。実ブランチ名は運用に合わせて読み替え）
- 直前作業: Phase90完了（Search Navigation Session層抽出）

---

## 1. Purpose（目的）

Phase89で発見された「個別移動ボタンで極小durationにしたコードをaep-add分割すると、
新規コードが隣接コードの描画に隠れて見えなくなる」現象を調査し（Phase91）、
その原因に対する最小実装を行う（Phase92）。

当初は「Chart Modeのslot幅計算バグではないか」という仮説だったが、実測により
「Rendering層の既存tie-break仕様が働いた結果」であることが判明し、調査ゴールが
「原因調査」から「対処位置の設計判断」へ移った。

---

## 2. Scope（今回やったこと）

```
Phase91（調査・修正コミットなし）
  ・chartmode.js / timing.js の実コード確認
    （buildGridViewModel / quantizeTime / expandToSlots / resolveCollision）
  ・一時ログ（[TEMP DEBUG][Phase91]）をexpandToSlots()の
    pickup/normal両経路に追加 → 実機再現 → ログ取得 → 削除
  ・実測により resolveCollision() のタイブレーク（tie-break）規則
    （confidence → duration → time＝後発優先）を確定

Phase92（実装）
  ・expandToSlots()のnormal pathをonsetMap: slotIndex → { chosen, hiddenCount }
    の形へ拡張
  ・Rendererに.chart-slot-collision（Amber系ドット・title属性のみ）を追加
  ・chart.cssへ新規CSSルール1件追加（ユーザー側で追加・確認済み）
  ・実機確認（スクリーンショットでAmberドット表示を確認）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・pickup measureへのCollision Indicator適用（P1 v2）
  → remapPickupOnsetMap()には一切触れていない。pickup measureには
    「同一量子化スロット（quantized slot）衝突」（Stage1）とは意味論が異なる「視覚圧縮による
    合流衝突」（Stage2）が別途存在し、安易に合算すると原因の異なる現象を
    1つのメトリクスに潰してしまうため、意図的にスコープ外とした
    （詳細は§5参照）。

・addChordCommand側での事前バリデーション（P2案）
  → Command LayerがChart Runtimeの量子化解像度を知る必要が生じ、既存の
    [BOUNDARY INVARIANT]（Phase87）と衝突するため不採用。

・hiddenIdsのViewModelへの追加
  → 現在のUI要件（ドット表示・件数表示のみ）には不要。GridViewModelの
    責務を「描画に必要な情報」に限定するため、今回は追加しなかった。
    将来「隠れたコードをクリックで選択」する機能が必要になった時点で
    追加を検討する。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| onsetMap拡張 | `resolveCollision(s.onsets)`のみだった値を`{ chosen, hiddenCount }`へ変更。`hiddenCount = s.onsets.length - 1` | chartmode.js（`expandToSlots()` normal path） |
| slotData拡張 | onset caseの`slotData`オブジェクトに`hiddenCount`フィールドを追加。`onset.chord`/`onset.id`参照は`projected.chosen.chord`/`.id`経由に変更 | chartmode.js（同上） |
| Renderer追加 | `slot.hiddenCount > 0`の場合、`.chart-slot-collision`（`title`属性に`"+N hidden chord(s)"`）を追加 | chartmode.js（onset caseのDOM構築部分） |
| CSS追加 | `.chart-slot-collision`（Amber系・4pxドット・絶対配置） | chart.css（ユーザー側で追加） |

pickup path（`actualOnsetMap`構築・`remapPickupOnsetMap()`）には一切変更を加えておらず、
Collision Indicator（`hiddenCount`）はpickup measureでは生成されない。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 「同一slot衝突をCommand層で弾く（P2）」ではなく「Rendering層で可視化する（P1）」を採用

```
結論:
  addChordCommand側での事前バリデーション（P2）を見送り、Chart Mode側
  （Rendering層）でhiddenCountを可視化する方式（P1）を採用した。

理由:
  同一slotになるかどうかはquantizeTime()の解像度（resolutionPerBeat）
  依存の値であり、将来グリッド解像度が変わりうる（ズーム依存slot・
  可変グリッド・tuplets対応等）以上、「編集として不正」と決めつけて
  Command層で弾くのは責務が重すぎる。architecture.mdのAuthority→
  Projection→Renderingの原則にも、Rendering層の問題をRendering層で
  解決する方が整合する。

  副次的な利点として、P1は「このバグ専用UI」ではなく、GridViewModelに
  hidden onsetが存在することを可視化する一般機構になる（将来の
  半テンポ解析密集・手動タイミング編集・tuplets対応等でも同じ仕組みを
  再利用できる）。
```

### [PICKUP COLLISION SCOPE INVARIANT]（今回確立・architecture.md §9.5反映済み）

```
Collision Indicator（P1 v1）はnormal path（expandToSlots()の通常経路）
のみを対象とする。pickup measure（mode==='full'かつ小節0）では
remapPickupOnsetMap()が視覚圧縮による別種の衝突（Stage2 collision：
複数actual slotが同一visual slotへ合流する際の衝突）を内部で解決して
おり、意味論が異なるためhiddenCountを合算しない。

理由:
  Stage1（同一量子化スロット（quantized slot）衝突）とStage2（視覚圧縮による合流衝突）は
  「原因」が異なる。前者は「編集で生成された極小durationイベント」に
  起因し、後者は「pickup小節を表示するための座標圧縮」に起因する。
  同じhiddenCountという数値に両方を混ぜると、原因究明の手がかりが
  失われる（「一般機構に見えて、実際には異なる現象を1つのメトリクスに
  潰している状態」というChatGPTレビューでの指摘に基づく）。

  pickup measureでのCollision Indicatorは将来のP1 v2として別途
  スコープ化する（現状は表示されない＝既知の制約。current-issues.md
  「Future Features」参照）。
```

### [判断] hiddenIdsを持たせず、hiddenCountのみをViewModelへ追加

```
結論:
  GridViewModelのonsetMapには{ chosen, hiddenCount }のみを持たせ、
  隠れたonsetのID配列（hiddenIds）は追加しなかった。

理由:
  現在のUI要件（ドット表示・title属性での件数表示）にはIDは不要。
  IDは編集・選択のための情報であり、Rendering専用ViewModelに持ち込むと
  責務が広がる（Command Layer分離（Phase86-2〜89）で確立した
  「stateとorchestrationの分離」と同種の判断基準をViewModel設計にも
  適用した形）。将来「隠れたコードをクリックで選択」する機能が
  必要になった時点で、その時に初めてID配列を追加すればよい。
```

### [判断] hover表示はtitle属性のみとし、既存tooltip機構（Chart Mode hover chord diagram）は流用しない

```
結論:
  ドットのhover表示はブラウザ標準のtitle属性のみとした。Phase67の
  hover chord diagram（コード図tooltip）は流用していない。

理由:
  P1の目的は「このslotには表示されていないコードが存在する」ことを
  知らせる診断インジケータであり、コードダイアグラムを見せることでは
  ない。既存tooltipはhitbox・carry-forward判定・hover遷移・
  relatedTarget guard・touch長押し・lock状態など、P1が必要としない
  文脈を多く持っている。title属性はchartmode.js内で完結し、新しい
  state・tooltip lifecycle・pointer event調整が一切不要なため、
  診断インジケータとして必要十分と判断した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### resolveCollision()のtie-breakは実測でしか確定できなかった

```
理論上は「0.013秒の差は1slot幅（約0.145秒）に対して遥かに小さいため、
同一slotに量子化されるのはほぼ不可避」と実装前に推測できたが、
「どちらが勝つか」（tie-break）は実測ログを取るまで確定できなかった。
実測の結果、confidence/durationが両方tieになり、time（後発優先）で
決着することが確認できた。中間点分割は必ず2つのonsetが同一duration
になるため、この現象は条件が揃えば必ず・決定的に再現する
（「たまに起きるバグ」ではなく「常に起きる」）。
```

### remapPickupOnsetMap()内に第2の衝突解決が存在することを実装直前に発見

```
当初は「pickup経路にも同じ_projectSlot()を通せばリスクは下がる」という
想定だったが、実装直前にremapPickupOnsetMap()の中身を確認したところ、
視覚圧縮（複数actual slotが同一visual slotへ合流する処理）の際にも
独自にresolveCollision()を呼んでいることが判明した。この発見が
なければ、{chosen, hiddenCount}形状のオブジェクトをそのままStage2の
resolveCollision()に渡してしまい、内部で.confidence/.duration/.time
を読めず壊れるところだった。「実装ルール：grep/viewで実際のコードを
確認してから実装」を徹底した結果、この潜在バグを実装前に回避できた。
```

### Phase89で発見された現象は、Phase91で調査した現象と同一だった

```
Phase89の実機検証で発見された「個別移動ボタン→極小duration→aep-add分割で
隣接コードの描画に隠れる」現象は、当初「原因未特定・Chart Mode側の
slot幅計算に問題があると推測」とされていたが、Phase91の調査で
resolveCollision()のtie-break（同一slot衝突）が原因と確定した。
両者は別々のバグではなく同一現象であり、Phase92のCollision Indicator
実装によって解消（可視化）された。このため、current-issues.mdでは
別バグとしてのWatch List登録は行わず、Collision Indicatorの既知制約
として統合した。
```

---

## 7. Remaining Issues（残課題）

```
・Pickup-aware Collision Indicator（P1 v2）
  状態: 未着手（次フェーズ候補）
  内容: pickup measureのremapPickupOnsetMap()内のStage2 collisionは
  未可視化のまま。対応する場合はStage1/Stage2のhiddenCountを単純合算
  せず、別概念として設計すること（architecture.md §9.5参照）。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
次フェーズの優先順位は明確には確定していない（current-issues.md
「Future Features」「ロードマップ」参照）。

Pickup-aware Collision Indicator（P1 v2）に着手する場合の注意点:
  ・remapPickupOnsetMap()の視覚圧縮ロジック（Stage2）を先に実コードで
    再確認してからスコープを確定すること（Phase92と同じ手順）
  ・Stage1/Stage2のhiddenCountを単純合算しない設計にすること
    （[PICKUP COLLISION SCOPE INVARIANT]参照）
```

---

## 9. Files Changed（変更ファイル一覧）

```
chartmode.js
  ・expandToSlots()のnormal pathをhiddenCount付きの形へ拡張
  ・onset caseのslotData構築・Renderer（.chart-slot-collision追加）
  ・理由: Collision Indicator（P1 v1）の実装（本フェーズの主目的）
  ・触っていない箇所: remapPickupOnsetMap() / pickup分岐 /
    resolveCollision() / timing.js / app.js / analysisCommands.js /
    analysisSession.js

chart.css
  ・.chart-slot-collision（Amber系ドット）を新規追加（ユーザー側で追加）

【5フェーズ棚卸し（Phase87〜92分・本セッションで同時実施）】
architecture.md
  ・§2/§3にanalysisSession.js/analysisCommands.js追加
  ・§12をSession Layer/Command Layer分離後の実態へ全面改訂
    （[BOUNDARY INVARIANT]・[UNDO TRANSACTION INVARIANT]等追加）
  ・§9.5にCollision Indicator（[PICKUP COLLISION SCOPE INVARIANT]含む）新設
  ・§13.1にhiddenCount追加、§14にPhase90のSession層抽出を反映

phase-status.md
  ・Phase86-2〜92の詳細をAppendixへ追加、Current Status更新
  ・Future Candidates整理（Sprint B完了を反映・新規候補追加）
  ・副産物: 既存ファイルにあった</details>タグの数え間違いを発見・修正

current-issues.md
  ・極小duration衝突issueを「normal path対応済み・pickup measureは
    visual compression collisionの意味論整理待ちのため適用対象外」に更新
  ・clipboard永続化・置換Ctrl+Z・__analysisEditorDebug等の新規項目を追加

keybindings.md
  ・app.js実コード確認により全項目を検証。「予定」だったL/Escapeが
    実装済みと判明。Ctrl+Shift+S/Ctrl+F/Ctrl+C/Ctrl+X/Delete/
    Backspace/矢印キー各種/Shift+[/Shift+]/Shift+D等、未記載だった
    キーバインドを新規追加

doc-glossary.md
  ・Session Layer / Command Layer / Tie-breakを新規追加
```

---

## 10. Micro Log

- Phase91調査開始時、当初「slot幅計算バグ」という仮説だったが、
  timing.jsのquantizeTime()実装確認（nearest slot方式）により
  「量子化自体は正常」という方向へゴールを修正した
- 一時ログ（[TEMP DEBUG][Phase91]）はexpandToSlots()のpickup/normal
  両経路に追加し、実機再現で[COLLISION]ログを取得（このケースでは1回で
再現した）。取得後は
  node --check・CRLF確認・原本との完全一致（diff）を確認した上で
  Phase90完了時点の内容へ完全復元した
- Phase92実装直前、remapPickupOnsetMap()の内部でStage2 collision
  （視覚圧縮による合流衝突）が独自に発生していることを発見し、
  当初のスコープ（両経路に同じprojectSlot()を通す）を「normal path
  限定」へ変更した。この判断はChatGPTレビューでも支持された
- 実装後、chartmode.js側の差分を`node --check`・CRLF維持・原本との
  diff（5ブロックのみ）で確認。chart.css追加後、実機（スクリーンショット）
  でAmberドットの表示・title属性のhover動作を確認した
- 5フェーズ棚卸し（architecture.md/phase-status.md/current-issues.md/
  keybindings.md/doc-glossary.md）を同一セッション内で実施。途中、
  Pythonのtext-mode読み書きにより一度CRLFが全崩壊する事故が発生したが、
  直前の正しい出力から復元し、以降はバイナリセーフな方法に切り替えて
  対応した。ChatGPTによる3ファイルの監査を受け、指摘事項（用語規約・
  記述精度）をすべて反映した。keybindings.mdはapp.jsの実コード確認により
  「要確認」だった全項目を解消した

---

## current-issues.md更新（該当issueがある場合）

> 本handoverの反映は5フェーズ棚卸し（本セッション）で既に実施済み。

- 今回closeしたissue: なし（極小duration衝突issueは「解決」ではなく
  「normal path対応済み・pickup除外」という状態更新のため、削除ではなく
  内容更新とした）
- 今回新規に積み残したissue: Pickup-aware Collision Indicator（P1 v2）
  をcurrent-issues.md「Future Features」へ追加済み

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
