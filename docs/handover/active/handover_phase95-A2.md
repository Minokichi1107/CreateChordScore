# 引き継ぎ: Phase95-A2完了 — Boundary Handle Hover + Direct Drag

> [作成漏れの補完] 本来Phase95-A2完了時点で作成すべきhandoverが、
> 実装後すぐにPhase96（Decorator整理）へ進んだため作成されないまま
> 欠落していた。たかっちさんの指摘により、Phase96-97 handover作成後に
> 遡って作成する。時系列上はPhase95-A1とPhase96の間に位置する。

## 作業状態
- ブランチ: phase95-a2-boundary-hover-drag（想定）
- 直前作業: Phase95-A1完了（Chart Modeクリックの「選択+シーク」一般化）

---

## 1. Purpose（目的）

Phase93で実装した Boundary Handle（境界を動かすドラッグ操作）は、
「対象コードを選択している間だけ」ハンドルが表示される仕様だった。
これを、選択操作を経由せず、hoverするだけでどのコードの境界も
直接ドラッグできるようにする。

---

## 2. Scope（今回やったこと）

```
・chordIdからbuffer上のindexを返すaccessor（_getChordBufferIndex）を
  app.js に新設し、chartmode.jsへ注入（getAnalysis/getNormalizedと
  同じ依存注入パターン）
・chartmode.js: hover専用の当たり判定クラス（.chart-slot--boundary-hover）
  を、pointerover/pointerout委譲リスナーで動的に付与
・chartmode.js: pointerdownの当たり判定を
  .chart-slot--boundary-handle（選択駆動・既存）と
  .chart-slot--boundary-hover（今回追加）の両方に対応
・app.js: _onBoundaryDragStart(chordId) にchordIdを引数として渡すよう
  シグネチャ変更。selection.boundaryIndexへの依存を廃止し、
  chordIdからその場でboundaryIndexを導出する
  （_boundaryDragState { chordId, boundaryIndex } という
  selectionとは独立したephemeral stateを新設）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・タッチデバイスでのhover代替
  → hoverが存在しないタッチでは、従来通り「選択→常時ハンドル→ドラッグ」
    のみ対応。意図的な非対称として許容。

・hoverゾーンの幅を左端の狭い帯に限定する案（設計段階で検討→不採用）
  → Phase93で確立済みの「選択済みチョードのセル全体が当たり判定」という
    既存パターンをそのまま流用する方針で当初は進めた
    （後にこの判断が誤りだったと実機検証で判明。§6 Findings参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| chordId→index accessor | `_getChordBufferIndex(chordId)`新設。`initChartMode()`へ`getChordIndex`として注入 | app.js / chartmode.js |
| hover検知 | pointerover/pointerout委譲リスナーを新設。曲頭（buffer index===0）のコードは対象外 | chartmode.js |
| ドラッグ入口の拡張 | pointerdownの`closest()`セレクタに`.chart-slot--boundary-hover`を追加 | chartmode.js |
| ドラッグ状態管理の刷新 | `_boundaryDragState`新設。selection.boundaryIndexへの依存を廃止し、chordId起点でboundaryIndexをその場で算出 | app.js |
| **[実装後に発見・修正]** 誤ドラッグ多発 | 当たり判定を「セル全体」→「セル左端10px」へ限定 | chartmode.js |
| **[実装後に発見・修正]** クリック選択の破壊 | `setPointerCapture()`をpointerdown時点の無条件呼び出しから、ドラッグ確定時（8pxしきい値超え）まで遅延 | chartmode.js |
| **[実装後に発見・修正]** onsetセル上部クリックでeditPoint化 | onsetセルのラベル（`.chart-chord-name`）だけでなく、セル自身（`slotEl`）にも`data-chord-id`を付与 | chartmode.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 「セル全体を当たり判定にする」既存パターンの流用は誤りだった

```
結論:
  Phase93の「選択済みコードのセル全体がドラッグの当たり判定」という
  パターンを、hover版にもそのまま適用したが、実機検証で「ほとんどの
  クリックがドラッグ扱いになり、コード選択ができなくなる」という
  重大な不具合を引き起こした。最終的に当たり判定をセル左端10pxへ
  縮小して解決した。

理由:
  Phase93時点では、この「セル全体」判定は選択済みの1コードにしか
  適用されなかったため、誤発火の機会が少なく問題が表面化していな
  かった。今回hoverによって「ほぼ全てのコード」が同時にこの判定の
  対象になったことで、通常クリックの数px程度の手ブレまでドラッグと
  誤認されるようになり、初めて問題が顕在化した。既存パターンの
  「そのまま流用できるはず」という前提が、適用範囲の変化によって
  崩れた事例。
```

### [判断] setPointerCaptureはドラッグ確定時まで遅延させる

```
結論:
  pointerdown時点でcaptureを取得する実装から、実際にドラッグが確定
  した瞬間（8pxしきい値超え）まで遅延させる実装へ変更した。

理由:
  captureは後続のclickイベントのe.targetを捕捉元要素へ固定する
  副作用があり、プレーンなクリック（ドラッグに至らない操作）でも
  この固定が発生すると、data-chord-idを持つ子要素をclosest()で
  正しく解決できなくなっていた。ドラッグしないクリックでは
  captureする理由が無いため、確定後に遅延させることで実害を
  完全に無くせる。
```

### [判断] onsetセルへdata-chord-idを直接付与する

```
結論:
  従来onsetセルは、ラベル（.chart-chord-name、セル下部にのみ配置）
  にだけdata-chord-idを持たせていたが、セル自身（slotEl）にも
  同じ値を付与するよう変更した。carryセルは元々セル自身に
  data-chord-idを持たせるパターンだったため、これに統一した形になる。

理由:
  ラベルはセル下部の一部にしか配置されないため、セル上部をクリック
  すると、closest('[data-chord-id]')がラベルという子要素を発見でき
  ず、「data-chord-idなし＝空セル」と誤判定されeditPointへ落ちて
  いた。当たり判定はセル本体（親）が持つべき、という原則をここで
  確立した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 実装は3段階の実機検証を経て初めて安定した

```
1段階目（初期実装）:
  「セル全体が当たり判定」のまま実装 → 「ほとんどのクリックが
  ドラッグ扱いになる」という致命的な不具合が判明

2段階目（当たり判定を左端10pxへ限定）:
  誤ドラッグは解消したが、「未選択のコードを初回クリックすると
  いきなりeditPointになる」という別の不具合が新たに顕在化
  （1段階目では隠れていた問題）

3段階目（setPointerCapture遅延化）:
  2段階目の不具合を、captureタイミングの問題として特定・修正。
  ただし修正後も一部再現が続き、DOM実測の結果、実際には
  onsetセルのdata-chord-id欠落という別の独立した原因も同時に
  存在していたことが判明（Phase97 Findings参照。当初「1つの
  原因のはず」と決め打ちせず、実測を重ねたことで両方を発見できた）。
```

この段階的な発見プロセスは、「1つ直したら完全に直ったはず」と
早期に断定せず、都度実機で再検証する、というこのプロジェクトの
基本姿勢を象徴する事例になった。

---

## 7. Remaining Issues（残課題）

```
・pointercancel経路の未検証（Phase93から継続）
  Boundary Handle Dragのpointercancel経路は実機で未踏のまま。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase96: Decorator Inventory 設計専用フェーズへ進んだ
（当初の「Section Data Layer」候補より、実機フィードバックで
浮上したDecorator整理の優先度が高いと判断したため）。
```

---

## 9. Files Changed（変更ファイル一覧）

```
app.js
  ・_getChordBufferIndex() 新設
  ・_boundaryDragState 新設（selection非依存のephemeral state）
  ・_handleBoundaryDragStart/Move/End をchordId起点へ差し替え

chartmode.js
  ・_getChordIndex accessor受け取り
  ・_boundaryHoverEl 新設（ephemeral hover state）
  ・_setupBoundaryHoverEvents() 新設
  ・pointerdown当たり判定の拡張・後に左端10pxへ縮小
  ・setPointerCapture()呼び出しをpointermove（ドラッグ確定時）へ移動
  ・onsetセルのslotElへdata-chord-id付与
```

---

## 10. Micro Log

- 当初「セル全体」判定で実装 → 実機検証で「クリック選択がほぼ機能
  しなくなった」と報告を受け、原因を特定して左端10pxへ縮小
- 縮小後も「editPointになる」報告が続き、まずsetPointerCaptureの
  タイミング問題を疑い修正。この時点では「これで直ったはず」と
  考えていたが、後続の実機検証で別の独立した原因（onsetセルの
  data-chord-id欠落）が並行して存在することが判明し、そちらも修正
- 「1つ直せば全部直るはず」という前提を持たず、都度DOM実測で
  再検証する姿勢が、結果的に複数の独立した原因を取りこぼさずに
  発見することにつながった

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue: なし（pointercancel経路の件はPhase93から継続の既知事項）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
