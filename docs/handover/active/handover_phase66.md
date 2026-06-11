# 引き継ぎ: Phase66完了 — debug observability consolidation

## 作業状態
- ブランチ: main
- commit: ffb283b
- 直前作業: Phase65完了（restore-aware asset authority normalization）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Phase65 実コード適用 | assetState / setAudioLoaded / setChordLoaded / _evaluateBannerState / restoreSettled guard を実コードへ適用（Phase65はhandoverのみで実コード未適用だった） | js/app.js |
| checkReloadBannerDone() 削除 | DOM-as-authority アンチパターンを排除。_evaluateBannerState() に完全移行 | js/app.js |
| TEMP REPAIR ブロック削除 | window.__CS_TRANSPOSE__ / __CS_REFRESH__ / __CS_PROJECT__ / __CS_CHARTSTATE__ / __CS_REPAIR__ を削除 | js/app.js |
| autosave 復元条件修正 | lines.length > 0 → id && (lines>0 \|\| title \|\| artist \|\| audio \|\| chord_source) | js/app.js |
| window.__CS_DEBUG__ 実装 | getter projection による runtime observability layer の確立 | js/app.js |
| window.__TIMING_DEBUG__ 削除 | chartmode.js の書き込みを廃止。timing 情報は __CS_DEBUG__.timing getter で取得 | js/chartmode.js |
| ヘッダーコメント更新 | chartmode.js の __TIMING_DEBUG__ 参照を __CS_DEBUG__.timing getter 参照に変更 | js/chartmode.js |

---

## 確定した設計原則

### debug layer は state を所有しない

```
runtime state
    ↓ getter projection
__CS_DEBUG__
    ↓
DevTools observer
```

**正しい設計:**
```javascript
// runtime state は各モジュールが持つ
let _perfState = { lastRAFDelta: 0, longFrames: 0 };

// debug layer は getter projection のみ
get perf() { return { ..._perfState }; }
```

**禁止パターン:**
```javascript
// debug object が state を所有する（DOM-as-authority と同じ誤り）
window.__CS_DEBUG__.perf.lastRAFDelta = dt;  // ← 書き込み禁止
```

これは Phase65 の「DOM は authority ではなく projection」と同じ思想。

### getter projection の必須条件

- `project` / `assetState` / `chartState` は mutable runtime state → **getter 必須**
- `assetState` は **shallow clone** で返す（DevTools からの mutation 防止）
- `dumpInvariants()` は **snapshot を return** する（二次解析のため）
- timing object は **replace 禁止**（object 自体の再代入は getter 構造を破壊する）

### __CS_DEBUG__ の構造

```javascript
window.__CS_DEBUG__ = {
  get timing()  { /* project.analysis から直接読む */ },
  get project() { /* project + assetState shallow clone */ },
  get chart()   { /* chartState + chartMeasuresPerRow */ },
  perf: { ... }, // [暫定] 将来 getter projection に移行予定
  dumpInvariants() { /* snapshot生成 + console出力 + return snapshot */ },
};
```

### テスト運用ルール（Phase66で確立）

```
通常テスト:
  UI操作のみ（新規作成・読み込み・保存・リロード）
  正常ユーザー操作だけで再現できるシナリオのみ

耐障害テスト（別カテゴリ）:
  IndexedDB 直接操作・asset 欠損・localStorage 破損 等
  「fault injection test」として明示的に実施する場合のみ
  通常テストと混在させない

理由:
  IndexedDB 等の persistence 系は「人工的に壊した状態」が
  そのまま残り、後の検証を汚染する。
  今回まさに IndexedDB の chord 削除が原因で
  「バグ」と「テスト起因の異常」が混線した。
```

---

## __CS_DEBUG__ の実際の使用例（Phase66動作確認より）

```javascript
// バナー誤表示の診断
window.__CS_DEBUG__.dumpInvariants()
// → chordLoaded: false / restoreSettled: true / linesCount: 45
// → 「コード譜は表示されているが chordLoaded が false」を即特定
// → IndexedDB に chord エントリなし → バナー表示は正常動作と確定

// project state の確認
window.__CS_DEBUG__.project.assetState
// → { audioLoaded: true, chordLoaded: false, restoreSettled: true }

// timing 診断
window.__CS_DEBUG__.timing.diagnostics
// → { medianBeatInterval, estimatedBPM, beatsPerMeasure, ... }
```

---

## 積み残し・保留

### perf instrumentation（Phase66-B）

```
現状:
  __CS_DEBUG__.perf は暫定実装。
  debug object が state を直接持っている（設計原則違反）。

正しい設計（未実装）:
  chartmode.js に _perfState を持たせ、
  getPerfState() を export して app.js に注入。
  app.js の perf を getter projection に変更。

実装しない理由:
  _rafLoop は hot path。
  restore / asset lifecycle が完全安定してから触る。
  instrumentation 自体が jitter を生む可能性がある。

時期: Phase66-B として独立フェーズで実施。
```

### Phase65 handover との乖離問題（教訓）

```
Phase65 は handover に記録されていたが実コードに未適用だった。
Phase66 でまとめて適用することになり、
「Phase66（debug整理）」のはずが大規模 migration になった。

対策:
  フェーズ完了時に必ず node --check と git diff で
  実コード適用を確認してから handover を確定させる。

  node --check js/app.js
  git diff -- js/app.js

特に漏れやすい:
  フラグ追加の呼び出し側への適用
  API 移行の全経路への適用
  生成側のフィールド追加
```

### 差分適用ルール（Phase66で確立）

```
【原則】
  関数単位で置換する。
  前後数行だけの部分置換を避ける。

  理由: brace / scope 崩壊が起きやすいため。
  今回: });が重複してSyntaxErrorが発生した。

【適用後の必須確認】
  node --check js/app.js      ← SyntaxError を即検知
  git diff -- js/app.js       ← 実コードへの反映を確認
  Select-String -Path js/app.js -Pattern "追加したシンボル名"
                              ← 存在確認

【「完了」と言う前に】
  実ファイル検索で存在を確認する。
  今回: __CS_DEBUG__ を「追加した」と報告していたが
        実ファイルには存在しなかった（app.js未出力）。
  → git diff / grep が authority。AI報告は参考情報。

【差分サイズの制限】
  1 commit = 1 logical concern に制限する。
  今回: 46箇所適用は Phase66 の作業単位として大きすぎた。
  目安: 20箇所を超える差分は分割を検討する。
```

---

## 次フェーズ候補

### A. Phase67: Chart Mode hover chord diagram（推奨）

```
内容:
  Chart Mode でコード名にホバーすると
  小型コードダイアグラムがツールチップ表示される。
  表示メニューから ON/OFF 可能。

設計方針（ChatGPT推奨）:
  single tooltip instance（毎 hover で DOM 生成しない）
  desktop only から開始（スマホは hover なし）
  ephemeral UI（chartState に authority を持たせない）
  既存 chord renderer 再利用
  viewport overflow 対応（右端で左側表示に切替）

priority: 中（UX改善・rollback容易・isolated feature）
```

### B. Phase66-B: perf instrumentation

```
内容:
  chartmode.js に _perfState を追加
  _rafLoop で lastRAFDelta / longFrames を計測
  getPerfState() export → app.js getter projection

priority: 低（beat cursor stall 調査用・runtime安定後に実施）
```

---

## 今回の進行で発生したインシデント

| インシデント | 原因 | 対策 |
|---|---|---|
| SyntaxError（余分な `}`） | DOMContentLoaded 外への差分適用ミス | 関数単位での置換・node --check |
| __CS_DEBUG__ 未定義 | app.js未出力のまま「完了」と判断 | 出力前に git diff で実ファイル確認 |
| バナー誤検知 | IndexedDB を手動削除したテスト起因 | テスト運用ルール確立（UI操作のみ） |
| Phase65未適用発覚 | handover記録と実コードの乖離 | フェーズ完了時の実コード audit 徹底 |

---

## commit message

```
Phase66: unify debug observability under __CS_DEBUG__

app.js:
- apply Phase65 changes (assetState, setAudioLoaded, setChordLoaded,
  _evaluateBannerState, restoreSettled guard)
- remove checkReloadBannerDone() (DOM-as-authority antipattern)
- remove TEMP REPAIR block (__CS_TRANSPOSE__, __CS_REFRESH__,
  __CS_PROJECT__, __CS_CHARTSTATE__, __CS_REPAIR__)
- fix autosave restore eligibility (lines=[] with metadata now restores)
- add window.__CS_DEBUG__ with getter projection pattern
  (timing / project / chart / perf / dumpInvariants)

chartmode.js:
- remove window.__TIMING_DEBUG__ write
  (now available via __CS_DEBUG__.timing getter)
- update header comment to reference __CS_DEBUG__.timing

[DEBUG LAYER INVARIANT]
  debug layer does not own state.
  runtime state → getter projection → DevTools
  timing object replace forbidden (breaks getter structure)
  assetState returned as shallow clone (mutation prevention)
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
