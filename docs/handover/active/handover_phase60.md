# 引き継ぎ: Phase60完了 — Chart Mode click seek

## 作業状態

* ブランチ: main（または phase60）
* 直前作業: Phase59完了（timing diagnostics / normalized pipeline）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `_seekTo` 変数追加 | app.js から seekTo コールバックを受け取る注入口 | js/chartmode.js |
| `_gridClickSeekBound` フラグ追加 | リスナー重複登録防止（hot reload / re-init 対策） | js/chartmode.js |
| `initChartMode` 拡張 | `seekTo` 引数追加・代入・JSDoc更新・`_setupGridClickSeek()` 呼び出し追加 | js/chartmode.js |
| `_setupGridClickSeek()` 追加 | chart-grid への click イベント委譲登録。measure クリック → startTime → seekTo | js/chartmode.js |
| `seekTo` 注入 | `aEl.currentTime = time` を app.js 側で実行。playback authority を維持 | js/app.js |
| `cursor: pointer` 追加 | `.chart-measure` に pointer カーソルを追加（Chart Mode セクション） | css/components.css |

---

## 確定した設計原則

### seek authority（Phase60で確立）

```
chartmode.js は raw downbeats を直接参照しない。
createTimingModel() が生成した normalized measure model の
startTime のみを seek 基準とする。

timing source
    ↓
createTimingModel()
    ↓
normalized measure model（startTime）  ← seek authority
    ↓
_seekTo(startTime)
    ↓
app.js: aEl.currentTime = time  ← playback authority（transport mutation）
```

authority は pipeline 自体ではなく createTimingModel() が生成した normalized measure model にある。
これにより将来の repair projection / override projection / alternate numbering が
seek 動作に自動的に反映される。

### seekTo = transport mutation boundary（Phase60で確立）

```
seekTo は transport mutation の境界。
chartmode.js は transport state を持たない。
aEl.currentTime の書き換えは app.js のみが行う。

将来の parallel editor / playback coordination でも
この boundary を越えないこと。
```

### click target ルール（Phase60で確立）

```
e.target.closest('.chart-measure') に固定する。
measureIndex は data-measure-index 属性のみから取得する。

chart-slot / chart-chord-name / playhead overlay など
内部構造の変更に依存しない設計。

simile token / empty slot / overlay layer 追加時も
click ownership が崩れない。
```

### リスナー重複防止パターン

```
_gridClickSeekBound フラグで initChartMode の再呼び出し時も
click listener の増殖を防ぐ。

event delegation のため listener 1個で全 measure DOM に追従する。
将来の analytics hook / telemetry でも同パターンを採用すること。
```

### playback authority（Phase50以降継続）

```
chartmode.js は aEl に直接触らない。
再生制御はすべて app.js が持つ。
seekTo / playback の2段階を厳守する。
```

---

## 積み残し・保留

### seek 動作: シークのみ（自動再生なし）

```
現在: クリック → シークのみ
      再生中なら継続、停止中なら停止のまま

将来の変更候補:
  - クリック時に自動再生開始（opt-in オプション）
  - seekTo コールバックの引数に { autoPlay: boolean } を追加するだけで対応可能
```

### slot 単位 seek（将来課題）

```
現在: measure 単位（小節頭にシーク）
将来: slot 単位（コード開始拍にシーク）

slot 比率計算は等間隔 slot 前提の暫定式になるため
triplet / swing / variable subdivision 対応時に
beat-aware seek mapping への移行が必要。
```

### Issue #45 継続

```
Type B（pickup measure）: Phase61 候補
Type A/C（beat tracking 異常）: A案（手動修正UI）が必要・大規模
Type D（drift）: 発生ケース収集中
```

---

## 次フェーズ候補

### Phase61（推奨）: pickup measure 表示補正（Type B）

Phase60 で measure.startTime authority が確立した。
次は pickup-aware measure numbering semantics の補正に自然につながる。

```
pickup-aware measure numbering
↓
display correction
↓
seek / cursor / numbering の一貫性確保
```

実装方針（Phase61 設計済み）:
- `detectPickupMeasure()` を `chartmode.js` 内に追加
- 判定条件: 2条件 AND
  - 条件A: measures[0] の長さ < **normalized median measure length × 0.75**
  - 条件B: measures[1〜3] の長さが中央値の ±30% 以内（正常範囲の確認）
  - ※ measures[1] を基準にすると intro drift / early jitter で false positive が増えるため median 基準を採用
- pickup と判定した場合: 小節0 → "0"、以降 1, 2, 3 ...
- `timing.js` は変更しない（chartmode.js に閉じる）

---

## backlog continuity（今回触った subsystem の未完了事項）

### Chart Mode 系

- Chart Mode pickup measure 表示補正（Type B）: Phase61 候補
- Chart Mode 並列表示（設計フェーズが必要）
- Chart Mode click seek（再生位置クリック）: **Phase60 で完了**
- Issue #45 Type A/C: A案（手動修正UI）設計フェーズ（大規模・将来）
- Issue #45 Type D: 発生ケース収集中

### timing pipeline 系（Phase59 continuity）

- Type B: pickup measure 自動検出・表示補正（Phase61 候補）
- Type D: 発生ケース収集後に repair: true で効果検証
- Type A/C: A案（手動修正UI）設計フェーズ（大規模・将来）
- 末尾 rit. の扱い（Phase59 保留・観測継続）

---

## commit message

```
feat: Phase60 Chart Mode click seek

- add _seekTo injection to initChartMode (seekTo: (time) => void)
- add _gridClickSeekBound flag to prevent listener duplication on re-init
- add _setupGridClickSeek() with event delegation on chart-grid
- seek authority: normalized measure model startTime only (raw downbeats 禁止)
- click target fixed to .chart-measure via closest() (internal DOM changes safe)
- NaN guard for degraded/partial analysis states
- add cursor: pointer to .chart-measure in components.css (Chart Mode section)
- playback authority remains in app.js (chartmode.js does not touch aEl directly)
```

---

## 棚卸し時の docs 更新差分（5フェーズ棚卸し時に適用）

### phase-status.md

① ヘッダー更新:
```
> 最終更新: Phase59完了時点
→ > 最終更新: Phase60完了時点
```

② 完了フェーズ一覧に Phase60 セクションを追加（Phase59 の次に新規追加）:
```markdown
### Phase60 — Chart Mode click seek
- `_seekTo` コールバック注入（app.js が aEl.currentTime を設定・playback authority 維持）
- `_setupGridClickSeek()` 追加（chart-grid への click event delegation）
- seek authority 確立: createTimingModel() が生成した normalized measure model の startTime のみを参照（raw downbeats 禁止）
- seekTo = transport mutation boundary（chartmode.js は transport state を持たない）
- click target を `.chart-measure` 全域に固定（内部DOM構造変更耐性）
- `_gridClickSeekBound` フラグでリスナー重複防止
- NaN ガード（degraded / partial analysis 対策）
- `.chart-measure { cursor: pointer; }` 追加（Chart Mode CSS セクション）
```

③「現在地」セクション更新:
```
- Phase59完了（Phase55〜59 の棚卸し対象）
→ - Phase60完了
```

④「次フェーズ候補」から削除（完了済み）:
```
- Chart Mode click seek（normalized timing pipeline が前提整備済み）  ← 削除
```

---

### current-issues.md

① ヘッダー更新:
```
> 最終更新: Phase59完了時点
→ > 最終更新: Phase60完了時点
```

② Chart Mode click seek の状態更新:
```
#### Chart Mode click seek（再生位置クリック）
状態: 未着手
→ 状態: **完了（Phase60）**
内容: measure クリック → normalized measure model の startTime → app.js seekTo 経由でシーク。
seek authority は normalized measure model に限定（raw downbeats 禁止）。
playback authority は app.js が持つ（chartmode.js は aEl に直接触らない）。
event delegation により将来の renderer 変更に対して耐性がある。
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
