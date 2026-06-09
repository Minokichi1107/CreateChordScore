# 引き継ぎ: Phase63完了 — playback UX stabilization + restore lifecycle fix

## 作業状態

* ブランチ: main
* 直前作業: Phase62完了（project identity semantics / 新規プロジェクトとして保存）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `loadChordData()` に `isRestore` フラグ追加 | IndexedDB 自動復元経路での capo reset を防ぐ | js/app.js |
| IndexedDB chord restore に `isRestore=true` を渡す | 1行修正。restore 経路と manual ingest 経路を分離 | js/app.js |
| `timeupdate → updateChartPlayback` 削除 | rAF に visual update authority を移譲 | js/app.js |
| `pause` / `seeked` / `ended` 単発更新追加 | 停止・シーク後の最終位置を正確に反映 | js/app.js |
| rAF 変数・3関数追加 | `_rafId` / `_rafRunning` / `_startRafLoop()` / `_stopRafLoop()` / `_rafLoop()` | js/chartmode.js |
| `openChartMode()` に `_startRafLoop()` 追加 | Chart Mode open 時に rAF ループ開始 | js/chartmode.js |
| `closeChartMode()` に `_stopRafLoop()` 追加 | Chart Mode close 時に rAF ループ停止 | js/chartmode.js |
| `initChartMode` に `seekTo` 追加（hotfix） | Phase60 から `_seekTo = null` のまま放置されていた既存バグ修正 | js/app.js |

---

## 確定した設計原則

### playback authority 3層分離（Phase63で確立）

```
authority layer:
  audio engine (aEl.currentTime) = source of truth
  chartmode.js は aEl に直接触らない（seekTo 経由のみ）

notification layer:
  timeupdate → line highlight / perform sync / tapmode（今まで通り）
  timeupdate は低頻度 notification/event sync 用。
  visual playback rendering の responsibility は持たない。
  （timeupdate からの updateChartPlayback は削除済み・rAF に移譲）

visual update layer（Chart Mode open 中のみ）:
  requestAnimationFrame ループ
    └→ 毎フレーム _getAudioEl().currentTime を読んで updateChartPlayback()
    └→ interpolation / 補間なし（authority = audio engine のまま）

単発更新:
  pause / seeked / ended → app.js が updateChartPlayback() を1回呼ぶ
  （rAF 停止後も最終位置を正確に表示するため）
```

### rAF ループ lifecycle ルール

```
openChartMode()  → _startRafLoop()
closeChartMode() → _stopRafLoop()   ← chartState.active = false の前に止める

多重起動ガード:
  _startRafLoop() 冒頭で if (_rafRunning) return
  cancelAnimationFrame(_rafId) で既存 ID もキャンセル（念のため）

loop 本体:
  function _rafLoop() {
    if (!_rafRunning) return;               // 停止フラグ確認
    updateChartPlayback(_getAudioEl().currentTime);  // injected authority のみ使う
    _rafId = requestAnimationFrame(_rafLoop);
  }

  ※ chartmode.js は aEl に直接アクセスしない。
     loop 内でも注入された _getAudioEl() 経由で currentTime を取得する。
     これにより audio element の ownership は app.js に保持される。

background tab throttling:
  rAF は background tab で throttle されるが
  authority = aEl.currentTime のため補間 drift は発生しない。
  復帰時に即同期される（現設計は background throttling に対して健全）。
```

### isRestore semantics（Phase63で確立）

```
loadChordData(data, filename, isRestore = false)

isRestore = false（default）: manual ingest 経路
  - _prevCapo 分を逆算して lines を canonical に戻す
  - capo を 0 にリセット（project.capo / UI / _prevCapo の3点セット）

isRestore = true: IndexedDB 自動復元経路
  - capo reset をスキップ
  - loadProj() が uiState.capo で設定済みの _prevCapo を保持する

根拠:
  loadProj() は deserializeProject() → _prevCapo = uiState.capo の順で
  capo を正しく復元している。
  ここで loadChordData() が capo を 0 に上書きすると
  保存済み capo 値が失われる（Phase62 handover で原因特定済み）。
```

### seekTo 注入ルール（Phase60確立・Phase63で修正）

```
chartmode.js は aEl に直接触らない。
seek は必ず seekTo(time) コールバック経由で行う。

initChartMode({
  ...
  seekTo: (time) => { aEl.currentTime = time; },  // app.js が authority を持つ
});

_seekTo = null のまま渡さないと click seek が無音でスルーされる。
（Phase63 hotfix: initChartMode 呼び出しへの追加漏れを修正）
```

---

## 動作確認結果

| チェック項目 | 結果 |
|---|---|
| capo=3 で保存したプロジェクトを開いた時、カポ値が 3 のまま | OK |
| Chart Mode 再生中に beat cursor が滑らかに動く | OK（リズムよく移動） |
| pause 直後の cursor 位置ズレなし | OK |
| seek 直後の cursor 位置ズレなし | OK |
| Chart Mode open/close 繰り返しで CPU 使用率が安定 | OK（上昇なし） |
| Chart Mode の小節クリックで再生位置がシーク | OK（hotfix 後） |

---

## 積み残し・保留

### timing model rehydration（Phase61 hotfix で発覚・Phase63 未着手）

```
現状:
  project.analysis.raw のみ persist する方針は正しい。
  しかし「load 後に何をどの順序で再構築するか」の contract が未定義。

必要なもの:
  - runtime timing schema contract の定義
  - schema versioning / migration layer
  - normalize step の明文化
  - invariant validation（endTime 等の必須フィールド保証）
  - restore ordering invariant の contract 化

今回の capo bug はこの restore 順序依存が原因だった。
isRestore フラグで止血済みだが、根本設計は未解決。
```

### restored asset state synchronization（Phase62から継続）

```
現象:
  project restore 後、audio/chord は復元済みだが
  「〇〇を読み込んでください」バナーが表示されることがある。

本質:
  manual ingest と IndexedDB restore が別 state 扱いになっている。
  runtime loaded flags が manual ingest path でしか更新されていない。
```

### beat cursor smoothing の観察継続

```
今回の rAF 化で 250ms → ~60fps に改善済み。
ただし i5-6500（4コア・統合GPU）環境での長時間再生での
CPU 使用率推移は引き続き観察する。

今回の CPU グラフ（タスクマネージャー）:
  Chart Mode open 中（rAF 稼働）: 21〜25%（変動あり）
  スパイクは rAF とは無関係の可能性が高い
  （他プロセスの割り込み・ネットワーク通信等）

注意: この数値は以下の要因に依存するため rAF との因果関係は未確定。
  - ブラウザ・タブ数・DevTools 開閉状態
  - GPU compositing の有無（統合GPU vs 独立GPU）
  - OS のバックグラウンドプロセス状態
  rAF 負荷の評価は単一環境の数値ではなく
  open/close 前後の差分で判断すること。
```

### バグ: バックアップ中の音声停止問題（低優先度・継続）

```
beforeunload / visibilitychange で aEl.pause() が呼ばれていない。
限定的な場面のみ発生。
```

---

## 次フェーズ候補

### A. timing model rehydration redesign（推奨・技術的負債解消）

```
Phase61 hotfix の根本解決。
load 後に createTimingModel() を再実行する設計への移行。
derived state を persist しない contract の確立。
```

### B. restored asset state synchronization（UX改善）

```
restore 後のバナー誤表示を解消する。
ingest / restore state 統合。
```

### C. debug API 整理（運用改善・実装コスト小）

```
window.__CS_DEBUG__ 統合。
TEMP REPAIR タグの残留コード削除。
docs/ デバッグガイド作成。
```

---

## backlog continuity

### Chart Mode 系

- beat cursor 滑らか化（rAF 化）: **完了（Phase63）**
- Chart Mode click seek 復活: **完了（Phase63 hotfix）**
- Chart Mode pickup measure alignment: 将来候補
- Chart Mode 並列表示: 設計フェーズが必要
- Issue #45 Type A/C: A案（手動修正UI）大規模・将来

### restore lifecycle 系

- capo restore バグ: **完了（Phase63）**
- timing model rehydration: 将来候補（Phase63未着手）
- restored asset state synchronization: 将来候補

### その他

- バックアップ中の音声停止: 低優先度
- debug API 整理: 将来候補

---

## commit message

```
feat: Phase63 playback UX stabilization + restore lifecycle fix

capo restore fix:
- add isRestore param to loadChordData() (default false)
- IndexedDB chord restore passes isRestore=true to skip capo reset
- fixes capo value reset to 0 when loading saved project with capo != 0

rAF playback loop:
- add _rafId / _rafRunning / _startRafLoop() / _stopRafLoop() / _rafLoop() to chartmode.js
- startRafLoop() on openChartMode(), stopRafLoop() on closeChartMode()
- remove timeupdate -> updateChartPlayback (rAF is now visual update authority)
- add pause/seeked/ended single-shot updateChartPlayback for final position sync
- no interpolation: authority = aEl.currentTime (safe against seek/rate/throttle)

hotfix:
- add seekTo callback to initChartMode() call in app.js
- fixes chart-grid click seek silently doing nothing since Phase60
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
