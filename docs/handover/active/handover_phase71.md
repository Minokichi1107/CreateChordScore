# 引き継ぎ: Phase71-A完了 — speed authority統一 + reset trigger追加

## 作業状態
- ブランチ: (未定・複数ファイルへの差分適用済み)
- 直前作業: Phase70完了（`__CS_DEBUG__.perf` projection化 + Chart Mode speed同期修正）

---

## 背景

Phase70-Aで「Chart Mode → 通常モード」へのspeed同期は修正されたが、
演奏モード（`#perform-speed`）だけが`setSpeed()`を経由しない独立実装のまま
残っていた（authority bypass）。この状態を解消し、speed mutationの
唯一の正式入口を確立するのがPhase71-Aの目的。

作業中、ユーザーから「reset機能を演奏モード・TAPモード・Chart Modeにも
追加してほしい」という依頼があり、これも本フェーズに統合して対応した。

---

## 完了したこと

### 1. speed authority統一（演奏モードのbypass解消）

| 変更 | 内容 | ファイル |
|---|---|---|
| `setSpeed()`拡張 | `#perform-speed` / `#perform-speed-label`のprojectionを追加 | audio.js |
| `audioElements`拡張 | `performSpeed` / `performSpeedLabel`をDOM参照として追加 | app.js |
| `#perform-speed`ハンドラ置換 | `aEl.playbackRate`直接代入 → `setSpeed(pct)`経由に統一 | app.js |

```javascript
// 変更前（app.js）
document.getElementById('perform-speed').addEventListener('input', e => {
  const speed = parseInt(e.target.value) / 100;
  aEl.playbackRate = speed;
  document.getElementById('perform-speed-label').textContent = `${e.target.value}%`;
});

// 変更後
document.getElementById('perform-speed').addEventListener('input', e => {
  setSpeed(parseInt(e.target.value));
});
```

### 2. reset trigger追加（4UI統一）

| 変更 | 内容 | ファイル |
|---|---|---|
| TAP reset追加 | `#tov-speed-reset`（↺）追加。label/button分離 | index.html, tapmode.js |
| 演奏 reset追加 | `#perform-speed-reset`（↺）追加。label/button分離 | index.html, app.js |
| Chart reset追加 | `#chart-speed-reset`（↺）追加。`type="button"`明示 | chartmode.js |
| CSS追加 | `.speed-reset-btn`（TAP/Perform共通） / `.chart-speed-reset` | components.css |

設計原則：
- reset triggerは全て`setSpeed(100)`のみを呼ぶ（mode独自のreset authorityを作らない）
- label（projection）とbutton（mutation trigger）を役割分離
  （既存`#speed-reset`のみ「label兼button」の兼用構造のまま・無変更で維持）

### 3. Chart Mode projection completeness修正（最重要・最終発見）

reset button追加後の実機テストで、「Chart Modeの↺をクリックしても
Chart自身の表示（スライダー位置・%表示）だけ変化しない」という不具合が発覚。
調査の末、**`setSpeed()`がそもそもChart Mode自身のDOM
（`#chart-speed-sel` / `#chart-speed-label`）を一度もprojection対象に
含めていなかった**ことが根本原因と判明（Chart→mainの一方向同期のみ
存在し、main→Chartの逆方向同期が存在しなかった）。

```javascript
// audio.js: setSpeed()に追加
// Chart Mode は開いている時だけDOMが存在する動的UIのため、
// _elements への固定登録ではなく毎回 getElementById で存在確認する。
const chartSpeedSel   = document.getElementById('chart-speed-sel');
const chartSpeedLabel = document.getElementById('chart-speed-label');
if (chartSpeedSel) {
  if (pct < Number(chartSpeedSel.min)) chartSpeedSel.min = pct;
  if (pct > Number(chartSpeedSel.max)) chartSpeedSel.max = pct;
  chartSpeedSel.value = pct;
}
if (chartSpeedLabel) chartSpeedLabel.textContent = pct + '%';
```

これにより、Chart Modeも他3UIと完全に双方向projectionされる構造が完成した。

### 4. [KNOWN PROJECTION RANGE MISMATCH]の解消

Chart Mode speed slider（`min=50 max=150`）とcanonical speed authority
（`setSpeed`は`25-300`を受け付ける）のレンジ差異により、通常モードで
150%超の値にしてからChart Modeを開くと、スライダーがclampされ
「表示と実際のplaybackRateが食い違う」現象が発生していた
（実際は244%再生中なのに表示が150%になる等）。

`setSpeed()`内・および`_setupTransportEvents`の初期化処理の両方に、
range外の値が来た場合はmin/maxを動的拡張してからvalueを代入する
ガードを追加して解消した。

```javascript
// chartmode.js: _setupTransportEvents 初期化部分
// [RANGE MISMATCH GUARD] 通常使用時（50-150の範囲内）はこのガードは
// 発火せず、既存の見た目のまま。
if (mainSpeedSel) {
  const currentPct = Math.round(parseFloat(mainSpeedSel.value));
  if (Number.isFinite(currentPct)) {
    if (currentPct > Number(speedSel.max)) speedSel.max = currentPct;
    if (currentPct < Number(speedSel.min)) speedSel.min = currentPct;
    speedSel.value = currentPct;
  }
}
```

---

## 確定した設計原則

```
[SPEED AUTHORITY]
speed mutation authority = setSpeed()（audio.js）に一本化。
通常モード / TAPモード / 演奏モード / Chart Mode の4UI全てが
setSpeed()のprojectionとして双方向同期する
（どのUIから変更しても残り3UIに反映される）。

[PROGRAMMATIC ASSIGNMENT NOTE]
setSpeed()内のUI .value代入はprogrammatic assignmentであり、
'input'イベントを再発火させない（ブラウザ標準挙動）。
そのためsetSpeed()呼び出しが自己再帰することはない。
将来custom dispatch / reactive wrapper等を導入する場合は
この前提が崩れる可能性があるため、再帰防止策を別途検討すること。

[RANGE MISMATCH GUARD]
Chart Mode speed sliderの通常レンジ（50-150）とcanonical authority
（25-300）の差異は、setSpeed()内でのmin/max動的拡張により
実害なく解消。通常使用（50-150範囲内）の見た目は変更なし。
```

---

## 調査過程で得た教訓（重要・再発防止用）

「Chart Modeのresetボタンが効かない」という報告に対する切り分けは、
以下の順で進めたが、最終的に「イベント層」ではなく
「projection completeness（網羅性）」の問題だった。

```
切り分けの経緯:
  1. dispatchEvent(click) → 正常動作（コード自体は健全と判明）
  2. mousedown/mouseup/click 全てfiredを確認（イベント阻害なしと判明）
  3. playbackRate直接監視 → 実際は正しく更新されていた
  4. 最終的に判明した実態:
     reset自体（setSpeed(100)呼び出し）は機能していたが、
     「呼び出し元UI自身（Chart Mode）への書き戻し」が
     一度も実装されていなかった
```

教訓：「UIが反応していないように見える」系のバグは、
イベント発火確認（mousedown/mouseup/click fired）が全て正常でも、
「mutation authorityが呼び出し元自身を含む全projection対象を
カバーしているか」を次に疑うべきである。今回はイベント層の調査が
完全に白だったため、原因特定まで複数往復した。

また、初期表示時のrange clamp（[KNOWN PROJECTION RANGE MISMATCH]）が
「ボタンをクリックしても変化しない」という見た目を生んでいたケースもあり、
「ボタン自体は正常動作・別の操作（reset）は無関係に正常・
初期表示だけが壊れていた」という、原因が分散した事例だった。

---

## current-issues.md更新

- 今回closeしたissue: 「speed authority fragmented」（完全クローズ）
- 今回新規に積み残したissue: なし

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| 通常モード変更 → TAP/演奏/Chart全て同期 | ✅ |
| 演奏モード変更 → 通常/TAP/Chart全て同期 | ✅（ハードリロード必須・キャッシュ注意） |
| Chart Mode変更 → 演奏モードlabel追従 | ✅ |
| 通常#speed-reset → 全UI同期 | ✅ |
| TAP/演奏/Chart各↺ → 全UI 100%リセット | ✅ |
| 通常244%設定 → Chart Mode開く → "244%"表示（拡張成功） | ✅ |
| 244%状態でChart Mode↺ → 全UI（Chart自身含む）100%同期 | ✅ |
| 通常スライダー操作 → Chart Mode開いた状態でリアルタイム追従 | ✅（新規に解消された逆方向同期） |

---

## 積み残し・将来課題（Phase70-Aからの継続）

### speed authority fragmented（演奏モード部分は解消・残課題は別軸）
本フェーズで演奏モードのauthority bypassは解消済み。
今後新たに別系統のspeed UIを追加する場合は、必ず`setSpeed()`経由で
実装すること（本フェーズで確立したパターンに従う）。

### beat cursor stall（Phase65から継続・観察データ取得中）
Phase70-Aで導入したperf instrumentation（`__CS_DEBUG__.perf`）の
観察は継続中。本フェーズでは直接の進展なし。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
