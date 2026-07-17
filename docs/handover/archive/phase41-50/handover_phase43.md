# 引き継ぎ: Phase43完了 — Chart Mode カポ反映（Issue #48）

## 作業状態
- ブランチ: phase42-design（継続）
- 直前作業: Phase43完了（Issue #48 修正）

---

## Phase43 の成果

### 完了したもの

| 対象 | 内容 | ファイル |
|---|---|---|
| Issue #48 | Chart Mode にカポ移調を反映 | js/chartmode.js / js/app.js |

---

## 確定した設計原則

### 実音 vs フォーム音（最重要）

```
analysis.raw.chords = 実音（actual pitch）
  → ChordMini が解析した生データ
  → canonical として不変・保存対象
  → 例: Eb, F, Gm（Gキーの曲をカポ3で演奏する場合）

editor / perform / chart 表示 = フォーム音（chord form）
  → カポを考慮した「ギターで押さえる形」
  → 表示時のみ変換・保存禁止
  → 例: C, D, Em（カポ3フレット時のフォーム）
```

### 変換方向

```
実音 → フォーム音:  transposeChord(chord, -capo)
フォーム音 → 実音:  transposeChord(chord, +capo)

カポが増える = 実音が上がる = フォームは下がる
カポ3の場合: 実音 Eb(-3半音) → フォーム C
```

### app.js の capo change との対称性

```js
// app.js（既存・capo change時）
const semitones = -diff;  // カポ増 = フォームを下げる

// chartmode.js（今回追加・render時）
_transposeChord(chord, -capo)  // 実音 → フォーム音
```

同じ方向性で統一されている。

---

## 変更内容

### chartmode.js

**変更1: モジュールヘッダーに display projection NOTE 追加**

```js
// NOTE: chord display projection (capo transpose) is currently performed
// per-renderer. Future phases may centralize this into a shared display layer
// when N.C. / simile / slash bass / Roman numeral 等が加わる段階で統合を検討する。
```

**変更2: 注入依存に getCapo / transposeChord 追加**

```js
let _getCapo        = null;  // () => number（カポ値）
let _transposeChord = null;  // (chord, semitones) => string

export function initChartMode({
  getAnalysis, getAudioEl, getAudioDuration,
  getCapo, transposeChord   // ← 追加
}) {
  ...
  _getCapo        = getCapo;
  _transposeChord = transposeChord;
}
```

**変更3: _renderChartGrid の chord 表示**

```js
// display projection: 実音 → フォーム音変換（-capo）
// analysis.raw / GridViewModel の chord は実音 canonical のまま保持
const capo = _getCapo?.() ?? 0;
chordEl.textContent = (capo !== 0 && _transposeChord)
  ? _transposeChord(cell.chord, -capo)   // ← -capo が正しい方向
  : cell.chord;
```

**変更4: _renderFallbackGrid の chord 表示**

```js
const capo = _getCapo?.() ?? 0;
el.textContent = (capo !== 0 && _transposeChord)
  ? _transposeChord(c.chord, -capo)      // ← -capo が正しい方向
  : c.chord;
```

### app.js

**変更1: import に chartState / renderChartMode 追加**

```js
import {
  initChartMode, openChartMode, closeChartMode,
  updateChartPlayback,
  chartState,      // ← 追加
  renderChartMode, // ← 追加
} from './chartmode.js';
```

**変更2: initChartMode に getCapo / transposeChord 追加**

```js
initChartMode({
  getAnalysis:      () => project.analysis,
  getAudioEl:       () => aEl,
  getAudioDuration: () => aEl.duration,
  getCapo:          getCapo,          // ← 追加
  transposeChord:   transposeChord,   // ← 追加
});
```

**変更3: capo change イベントに Chart Mode 再描画追加**

```js
// capo change イベント末尾に追加
// TODO: future optimization: separate chord label refresh from full chart rerender
if (chartState.active) renderChartMode();
```

---

## デバッグ過程で確立した知見

### projection sign の確認方法

```
ログ出力:
  raw= Eb   capo= 3   result= A#   → +capo（間違い）
  raw= Eb   capo= 3   result= C    → -capo（正しい）

判定基準:
  editor表示のコードと一致するか
  例: カポ3でEditorにCが見えるなら、Chartも C であるべき
```

### render logic が動いているかの確認パターン

```
ログに raw / capo / result が出ている
  → injection 成功
  → render path 正常
  → あとは projection direction だけの問題

この段階で「キャッシュ問題」等の外部要因を疑う必要はない
```

---

## 先送りした課題（変更なし）

| Issue | 理由 |
|---|---|
| #43 N.C. token | 将来のキーボード入力設計時に一緒に実装 |
| #44 state contamination | 再現性なし・監視継続 |
| undo拡張 | app.js 分割後に実装 |

---

## display projection 重複について

現在 editor.js / perform.js / chartmode.js の3箇所で
個別に capo 移調（display projection）を行っている。

```
// NOTE（各ファイルに記載済み）:
// chord display projection (capo transpose) is currently performed per-renderer.
// Future phases may centralize this into a shared display layer.
```

統合の時期: N.C. / simile / slash bass / Nashville 等が加わった段階で検討。
現時点では分散で問題なし。

---

## 次フェーズ候補

直近優先度（高）:
- Chart Mode 再生バー（mini transport）
- replacementMap 拡充（実曲テスト）

中期:
- Chart Mode 歌詞同期
- app.js 分割（Issue #49）
- analysis persistence 残課題（Issue #47）

---

## 運用ルール（変わらず）

- current-issues.md / phase-status.md / architecture.md / handover は
  Phase44完了時に棚卸し更新
- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 大きな関数への変更は関数全体置換方式で提示する
- 1つのファイル内で複数の修正がある場合はファイルごと渡して修正箇所を提示する
