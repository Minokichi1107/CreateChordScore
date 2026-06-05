# 引き継ぎ: Phase57完了 — Chart Mode slot-semantic renderer

## 作業状態

* ブランチ: main
* commit: `28f459d` feat: Phase57 slot-semantic chart renderer

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `expandToSlots()` 新設 | onset \| carry \| empty discriminated union による slot semantic 配列生成 | js/chartmode.js |
| `expandCarryForward()` deprecated化 | Phase57で `expandToSlots()` に置き換え完了。旧renderer互換のため残置 | js/chartmode.js |
| DOM lookup invariant を全slot DOM生成方式で再保証 | Phase57で「全slot DOM生成」に戻したことで
DOM lookup invariant を再保証。span方式を撤回 | js/chartmode.js |
| `--duration-slots` CSS変数導入 | onset slot が変数を設定し、chord label が visual expansion のみで幅を制御 | js/chartmode.js / css/components.css |
| `_beatCursorEl` → `_playheadEl` 改名 | measure直下 continuous overlay として分離 | js/chartmode.js |
| `.chart-chord-name` position: absolute 復活 | `--duration-slots` 幅で右へ広がる（static からの再変更） | css/components.css |
| `.chart-slots` display: grid 維持 | `grid-template-columns: repeat(slotsPerMeasure, 1fr)` でJS上書き | css/components.css |
| `.chart-slot--carry` opacity削除 | label継承問題回避のため class のみ（opacity: 0.35 を廃止） | css/components.css |
| ファイル先頭コメントに slot DOM invariant ルール追記 | semantic slot / visual DOM slot の分離原則を明文化 | js/chartmode.js |

---

## 確定した設計原則

### timing / layout / presentation の3層分離

```
層               責務
─────────────────────────────────────────────────
semantic slot    timing unit（expandToSlots の結果）
                 onset | carry | empty の discriminated union
                 chord は canonical のまま（capo変換しない）
                 durationSlots = onset含む継続slot数（1以上）

slot DOM         fixed grid（semantic slot と同数・常に生成）
                 visual DOM slot は renderer都合で変形可だが
                 semantic slot count は常に invariant

chord label      visual presentation のみ
                 --duration-slots CSS変数で幅を制御
                 timing authority を持たない

playhead         measure直下 continuous overlay
                 slot の子ではない
                 getBeatPosition() → left% 変換のみ

CSS Grid         layout authority（位置・幅の決定権）
                 slot が left% 等の位置情報を持たない
                 timing → renderer → grid flow
measure          grouping container + stacking context のみ
```

Phase54以前:
  renderer が left% を直接計算

Phase57:
  semantic slot sequence を CSS Grid flow に投影

### slot DOM invariant（Phase57で確立）

```
semantic slot:
  常に固定（expandToSlots の結果）

DOM lookup invariant:
  semantic beatIndex から安定して DOM を逆引きできること。

Phase57 renderer では
「全slot DOM を生成する」ことでこれを保証している。

将来の click seek / hover / keyboard nav / selection は
semantic beatIndex から DOM を逆引きする。
```

### duration を layout authority にしない（最重要）

```
NG（Phase57途中で撤回）:
  grid-column: span durationSlots
  → Grid折り返しが発生し timeline 2行化

OK（採用）:
  --duration-slots CSS変数で label の visual expansion のみ制御
  slot DOM は grid-column: span を持たない
```

音楽UIでは以下を混ぜると破綻しやすい：

| 概念 | 分離対象 |
|---|---|
| timing | invariant |
| visual sustain | presentation |
| grouping | layout |
| playback | continuous state |

### expandToSlots() の slot型定義

```js
onset: {
  type: 'onset',
  measureIndex: number,
  beatIndex: number,
  chord: string,           // canonical（capo変換しない）
  durationSlots: number,   // onset含む継続slot数（1以上）
}

carry: {
  type: 'carry',
  measureIndex: number,
  beatIndex: number,
  sourceSlotIndex: number, // measure local index（cross-measureは将来拡張）
}

empty: {
  type: 'empty',
  measureIndex: number,
  beatIndex: number,
}
```

**durationSlots の定義：** 「このonsetを含めて何slot継続するか」。carry count ではない（0始まりではない）。

durationSlots は sustain presentation 用であり、
timing progression 自体は beatIndex sequence に従う。

**sourceSlotIndex：** measure local index（0始まり）。cross-measure sustainは将来 `sourceMeasureIndex` を追加予定。

### active highlight のフォールバック（Phase57途中で廃止・記録用）

Phase57途中で「carry DOM省略 + onset fallback逆引き」方式を試みたが、
Grid折り返し問題の発覚とともに **slot DOM invariant復活** に方針転換。
結果、active highlight は carry DOM が直接ヒットするようになりフォールバックは不要になった。

```
廃止した方式（記録用）:
  carry DOM なし → beatIndex を遡ってonset slot を逆引きしてhighlight

採用した方式:
  carry DOM あり → q.slot が直接 [data-slot-index] にヒットする
```

---

## 積み残し・保留

### expandCarryForward() の削除

状態: 意図的残置（@deprecated）  
内容: `_renderChartGrid` が Phase57 で `expandToSlots()` に切り替え完了。
`expandCarryForward()` は export 維持のまま deprecated コメントのみ。
外部参照がないことを確認後、次フェーズ以降で削除可。

### chart-slot--carry の視覚表現

状態: 意図的未実装  
内容: carry slot はクラスのみ付与（opacity 廃止）。視覚的には onset label が上に重なるため問題ない。
将来 sustain line / tied chord 等の notation が入った場合にスタイル追加を検討。

### durationSlots の cross-measure 拡張

状態: 設計予約のみ  
内容: 現在 durationSlots は measure 内で完結する。
小節またぎ sustain が必要になった場合は `sourceMeasureIndex` を carry slot に追加して対応予定。

### chart-slot の overflow: visible

状態: 意図的  
内容: chord label が `--duration-slots * 100%` で carry 領域へはみ出すため、
`.chart-slot` の `overflow` は `visible`（hidden にしない）。
将来 slot 境界で clip が必要になった場合は label 幅の計算方法を見直すこと。

注意:
  chord label は carry slot 上へ視覚的にオーバーラップする。
  将来 hover / selection / drag overlay を導入する場合、
  pointer-events と stacking order の再設計が必要になる可能性あり。

---

## 次フェーズ候補

### A. Chart Mode カポ表示（推奨・実装コスト低）

```
状態: 未着手
実装コスト: 低
  - _getCapo() は既に注入済み
  - --capo-info-color token は Phase56 で追加済み
  - display projection は chartmode.js に実装済み
方向性: ヘッダーに「カポN → 実音: XX」を追加
  例: CHART  BPM: 136 | 4/4 | カポ4 → E
```

Phase57 で canonical / projection 分離が安定したため、
実装難度はかなり低い。

### B. セクションラベル表示

```
状態: 設計前
内容: analysis.raw にセクション情報があれば小節上部に表示
  例: │ Aメロ │ ... │ Bメロ │
必要: analysis loader のセクション情報サポート確認
```

### C. 再生位置クリック seek

```
状態: 設計前
内容: 小節 / slot クリック → その位置から再生開始
根拠: carry DOM 復活で slot 全域がイベント受信可能になった
難度: 中（timing model との接続が必要）
```

### D. Chart Mode 並列表示

```
状態: 設計フェーズ必要
内容: Chart Mode を全画面ではなくエディター横に並列表示
根拠: slot DOM invariant 確立でレイアウト設計が安定
難度: 高（editor renderer との single source of truth 設計が必要）
```

### E. moveChordAcrossLines（ChatGPT注意喚起あり）

```
状態: 未着手（設計済み Phase38-3）
注意: editor line model と timing model の境界に触る。
      undo / cursor restore / selection state への波及に注意。
難度: 見た目より高い可能性あり。Chart Mode 完成後の方が安全。
```

---

## current-issues.md 変更内容

以下を追加予定（棚卸し時）：

- Chart Mode カポ表示（ヘッダーに「カポN → 実音キー」）: 新規バックログ追加
- Chart Mode ビート単位フォーカス: **完了（Phase56）** → 確認済み
- slot DOM invariant 設計原則: architecture.md §6（Chart Mode）への追記

---

## commit message

```
feat: Phase57 slot-semantic chart renderer

- expandToSlots(): onset|carry|empty discriminated union
- restore slot DOM invariant (all slots rendered)
- replace span layout with duration-based label expansion
- chord labels use --duration-slots CSS variable
- rename _beatCursorEl to _playheadEl
- deprecate expandCarryForward()
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
