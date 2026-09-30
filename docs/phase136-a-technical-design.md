# Phase136-A Technical Design — Continuous Chord Position（連続コード位置表示）

> ステータス: **Technical Design確定版 v2（ChatGPT監査反映済み・実装前Design Freeze）**
> 対象: `editing=false`（通常Chart Mode表示）のみ
> 参照コード: `chartmode.js` / `timing.js`（Phase135完了時点）

---

## 0. 結論（先出し）

```
[結論] Phase136-Aは、以下2点を新設するだけで成立する。

  1. timing.js に getContinuousMeasurePosition(time) を追加
     （quantizeTime() を経由しない、Measure特定のみの軽量版）

  2. chartmode.js に Continuous Chord Projection（Slotを介さない
     Chord→表示位置の変換）を新設し、editing=false 時のみ使う

既存の Slot Model（editing=true・Analysis Editor側）は一切変更しない。
```

---

## 1. Current Architecture（現状）

```
raw.chords
    ↓
buildGridViewModel()          [chartmode.js]
    ↓ 各chordに対し model.quantize(c.start) を呼ぶ
    ↓ → { measure, beat, slot, confidence }
measure.slots[].onsets[]      ← 同一slotに複数onsetが載ると衝突
    ↓
expandToSlots()                onset/carry/empty に展開
    ↓
resolveCollision()              同一slot内で1件だけ選ぶ（他は表示から消える）
    ↓
_renderChartGrid()               .chart-slot として描画
```

**現在のCollision（Slot Collision）の発生源はここ**：`model.quantize()` が
Chordの開始時刻をSlot（Beatを2分割した固定グリッド）へ丸め込むため、
実時間では別々のChordでも同じSlotに落ちることがある。

`renderChartMode({ measuresPerRow, editing })` は現状 `editing` を
`_renderChartHeader()`（ヘッダーの編集中バッジ表示）にしか渡しておらず、
**Grid描画そのものはeditingで分岐していない**（`_renderChartGrid(vm, analysis, { measuresPerRow })`）。

---

## 2. Phase136-A Proposed Architecture（提案）

```
                          raw.chords
                              │
                    Timing Model（既存・無変更）
                              │
               ┌──────────────┴──────────────┐
               │                              │
         editing=false                  editing=true
               │                              │
               ▼                              ▼
  Continuous Chord Projection         Existing Slot Projection
     （新設・chartmode.js）              （既存・無変更）
               │                              │
               ▼                              ▼
     Continuous Renderer              Existing Slot Renderer
```

- Timing Model（Beat/Downbeat/Measureの構築）は**一切変更しない**
- `buildGridViewModel()`（既存のSlot変換）は**そのまま維持**し、新しい
  `buildContinuousChordProjection()`（仮称）を**兄弟関数として追加**する
- `renderChartMode()` に `editing` をGrid描画へも渡すよう変更し、
  ここで初めて描画経路を分岐させる（現状は未分岐）

---

## 3. Data Model

### 3-1. Beat/Measure特定（timing.js・新設）

```
getContinuousMeasurePosition(time)
  → { measureIndex, position }   // position: 0.0〜1.0

内部実装は quantizeTime() の一部（measures[].startTime/endTime による
線形走査。343〜355行目相当）だけを再利用する。
slotTimings（Beatグリッド）・resolutionPerBeatには一切触れない。
```

### 3-2. Continuous Display Segment（chartmode.js・新設）

**[監査反映・修正1]** 「1 Chord = 1 Projection」ではなく、
**「1 Chordは、またがるMeasureの数だけ Display Segment を持ちうる」**
という形に修正する。Chord自体は`raw.chords`上ではあくまで1件のままで、
Segmentは表示専用の一時的な分割である。

```
Chord（1件・raw.chords）
    │
    ├─ またがるMeasureが1つだけ → Display Segment 1個
    └─ Measureをまたぐ         → Display Segment 複数個
                                  （各MeasureにつきSegment 1個）
```

```javascript
// Display Segment（Continuous Rendererが描画する最小単位）
{
  chordId,        // raw.chords[]._id をそのまま継承（下記3-4参照）
  chord,          // コード名
  measureIndex,   // このSegmentが属するMeasure
  leftPercent,    // (visibleStart - measure.startTime) / measure長
  widthPercent,   // (visibleEnd - visibleStart) / measure長
}
```

- 1つのChordから複数Segmentが生成される場合も、`chordId` は
  全Segmentで同一の値を持つ（Search等はこの`chordId`で判定するため、
  同じChordの複数Segmentが同時にハイライトされても問題ない）

### 3-3. Cross-Measure Chord（小節をまたぐChord）のSegment生成方針

**[監査反映・修正2]** `getContinuousMeasurePosition(time)` は
「時刻1点をMeasure位置に変換する」だけの関数であり、
**Chord全体（start〜end）の位置をまとめて計算する関数にはしない**
（Named Riskとして明記）。Cross-Measure Chordの分割は、呼び出し側
（`buildContinuousChordProjection()`）が以下の手順で行う。

```
1. getContinuousMeasurePosition(chord.start) → 開始Measureを特定
2. getContinuousMeasurePosition(chord.end)   → 終了Measureを特定
3. 開始〜終了の各Measureについて、以下でSegmentを1個ずつ生成する

   visibleStart = max(chord.start, measure.startTime)
   visibleEnd   = min(chord.end,   measure.endTime)
```

```
chord.start ──────────────────── chord.end
Measure 10  |------------------|
                                 Measure 11 |------------------|

→ Segment A: measureIndex=10, 末尾までのwidth
→ Segment B: measureIndex=11, 先頭からのwidth
```

- **Chord本体（raw.chords）は変更しない**。あくまで表示専用の分割
- 通常（1 Measure内で完結する）Chordは、Segmentが1個だけ生成される
  特殊ケースとして自然に扱える（分岐を増やさない）

**この方式は今回提案として決定するが、実データ（§8）で見た目を確認してから
最終確定とする。**

### 3-4. Identity（識別子）の表記統一

**[監査反映・修正3]** 表記のゆれを解消する。

```
raw.chords[]._id            … Chordの正本Identity（既存・変更なし）
        │
        │ そのままコピー
        ▼
Display Segment.chordId     … Continuous Projection側の識別子
```

Search Highlight・Section Preview・Mutation Feedbackは、いずれも
`chordId === 対象chordId` の一致判定だけで動くため、`raw.chords[]._id`
をそのまま`chordId`として引き継げば追加の変換は不要。

---

## 3.5 Beat Grid / Continuous Playhead（設計の明文化）

**[監査反映] 確定版から抜けていたため、ここで明記する。**

### Beat Grid（拍グリッド＝定規）

```
[原則] BeatはChordの配置単位ではなく、Ruler / Guide（定規・目安）である。

raw.beats
    ↓
各Beat時刻について、そのBeatが属するMeasure内での位置を求める
    ↓
beatPosition = (beatTime - measure.startTime) / (measure.endTime - measure.startTime)
```

- **`quantizeTime()` は使わない**（§3-1と同じ理由。Beat Gridは
  「量子化された結果」ではなく「実際のBeatの時刻そのもの」を描くため）
- Chordの配置（Display Segment）をBeat Gridへ丸めることはしない
  （両者は独立した2つのレイヤーとして重ねて表示する）

### Continuous Playhead（連続再生位置）

```
[原則] editing=false の通常表示では、再生位置もMeasure内の連続値として扱う。

position = getContinuousMeasurePosition(currentTime)
```

- 既存の `getBeatPosition()`（Slotベース・離散値）は
  `editing=true` 側でそのまま維持する。**置き換えない**
- Active Slot（再生中Slotのハイライト）はPhase136-Aの必須成果物では
  ない。通常表示に依存関係があると判明した場合のみ扱う

---

## 4. Code Change Candidates

| ファイル | 変更 | 内容 |
|---|---|---|
| `js/timing.js` | 小 | `getContinuousMeasurePosition(time)` 追加 |
| `js/chartmode.js` | 主要 | `buildContinuousChordProjection()` 新設・Continuous Renderer新設・`renderChartMode()` の分岐追加 |
| `js/app.js` | 小 | `editing` をGrid描画へも渡す（現状ヘッダーのみ） |
| `index.html` | 小 | measuresPerRowに「2列」ボタン追加 |
| `css/chart.css` | 主要 | Continuous Chord用のposition/width指定 |

**変更しない**: `analysisSession.js` / `analysisCommands.js` / `analysisLoader.js` /
`quantizeTime()` / `resolutionPerBeat` / `resolveCollision()` / `expandToSlots()`

---

## 5. Existing Feature Impact

| 機能 | 判定 | 備考 |
|---|---|---|
| Selection / Boundary / EditPoint | **移行不要** | `editing=true` 専用（コードで確認済み） |
| Search Highlight | **要接続** | `chord.id` があれば既存stateをそのまま使える |
| Section Preview | **要接続** | 同上 |
| Mutation Feedback | **要接続** | 同上 |
| Collision Indicator | **Out of Scope** | 新方式ではCollisionの意味自体が変わるため対象外 |
| Pickup Measure | **無変更** | 既存Projectionを保護。Continuous側への接続方法のみ別途確認 |
| measuresPerRow（2/3/4列） | **UI追加のみ** | 既存CSS（`flex`）がそのまま使える。新Layout不要 |

---

## 6. Temporary Coexistence（暫定共存）

`editing=false`（Continuous）と `editing=true`（既存Slot）の2経路が
一時的に併存する。これはPhase136-Aの意図的なスコープ縮小であり、
Analysis Editor側は今回一切触らない。将来的に統合するかどうかは
Phase137以降で判断する（今回は決めない）。

---

## 7. Known Risks / Unknowns

| Risk | 状態 | 判断 |
|---|---|---|
| Slot丸めによるCollision（Type A） | **解消対象** | Continuous Projectionで回避 |
| Cross-Measure Chord | **要実装確認** | §3-3のSegment方式でclip。実データで見た目確認（§8） |
| 実時間Overlap（Type B・`446ae9d9`） | **意図的に残す** | Visual Checkのみ。自動解決ルールは作らない |
| Decorator接続 / Identity | **解消済み** | `raw.chords[]._id` を`chordId`として継承（§3-4） |
| Beat Grid / Playhead | **仕様明文化済み** | §3.5参照。実時間ベース、quantizeTime()非依存 |
| `.chart-measure` のCSS実測値 | **実装後に確認** | 2/3/4列切替時のChord名可読性 |

### UX Invariant（今回追加）

```
[CHORD READABILITY NOT REGRESSED]
  Continuous Position / measuresPerRow変更のいずれによっても、
  Chord名の視認性は現状のUIより悪化させない。
```

---

## 8. Visual Design Check Candidates

| ケース | 目的 |
|---|---|
| 通常の1Beat=1Chord進行 | 基本動作確認 |
| 現在Slot Collisionが起きている曲 | Continuous化で自然に分離されるか |
| 短いChord | 削除されず存在維持できるか（削除ルールは導入しない） |
| **446ae9d9**（実Overlap） | Type B Collisionの見え方を確認（解決はしない） |
| 同一曲を2/3/4列で比較 | Chord名の可読性が現状より悪化しないか |

---

## 9. Explicit Out of Scope

```
Analysis Editor全体の移行 / Selection・Boundary・EditPoint移行
Type B Collisionの自動解決ルール
Collision Indicatorの再設計
Pickup Measure内部構造の変更
Copy/Paste・Undo/Redoの変更
Slot Model / quantizeTime() / resolutionPerBeat の削除
```

---

## 10. Implementation Readiness

```
[判定] 実装に進める状態。

残っている不確実性は「設計判断」ではなく「実装して見た目を
確認しないと分からない細部」（§7の実装前確認事項）のみ。
```

### 守るべきNamed Invariant（今回新設する場合の候補）

```
[RAW CHORD/BEAT AUTHORITY]
  raw.chords / raw.beats は変更しない

[CONTINUOUS PROJECTION NON-DESTRUCTIVE]
  Continuous Display Segmentは表示専用の導出値であり、永続化しない

[SLOT MODEL PRESERVATION]
  editing=true のSlot Modelは無変更のまま維持する

[CHORD READABILITY NOT REGRESSED]
  §7参照。Chord名の視認性を現状より悪化させない
```
