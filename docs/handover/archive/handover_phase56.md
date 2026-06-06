# 引き継ぎ: Phase56完了 — Chart Mode ビート単位フォーカス + capo info theme token

## 作業状態

* ブランチ: main
* commit: `a257382` feat: Phase56 chart beat cursor and capo info theme tokens

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `getBeatPosition(t)` 追加 | 現在時刻 → 0.0〜1.0（小節内の拍位置）を返す timing API | js/timing.js |
| beat cursor DOM生成 | `_renderChartGrid()` で measure ごとに1回だけ生成・`measureEl._beatCursorEl` で参照保持 | js/chartmode.js |
| beat cursor playback sync | `updateChartPlayback()` で `left%` のみ更新（DOM再生成なし） | js/chartmode.js |
| `.chart-beat-cursor` CSS | position:absolute / top:4px / bottom:4px / transform:translateX(-50%) | css/components.css |
| `--chart-beat-cursor` 変数 | 3テーマ分（dark/silver/blue）追加 | css/theme.css |
| `--capo-info-color` 変数 | カポ→実音表示色を `--color-amber` から専用tokenに分離（3テーマ分） | css/theme.css |
| `showCapoInfo()` token切替 | `color: var(--color-amber)` → `color: var(--capo-info-color)` | js/chords.js |

---

## 確定した設計原則

### timing / render authority 境界（Phase56で再確認）

```
timing.js
  getBeatPosition(t) → 0.0〜1.0
  timing interpretation はここで完結する

chartmode.js
  pos * 100 + '%' に変換するだけ
  timing 解釈を renderer 側に持ち込まない
```

### beat cursor の lifecycle

```
render時（1回のみ）:
  cursor div を生成 → measureEl._beatCursorEl に参照保持

playback時（高頻度）:
  style.left = `${pos * 100}%` のみ更新
  DOM再生成しない（layout thrash / GC 回避）

update順序（重要）:
  1. classList.add('chart-measure--active')  ← active class 先
  2. cursor left 更新                         ← その直後
  （逆順だとチラつく可能性がある）
```

### 停止時の cursor 挙動（仕様A）

```
現実装:
  stop時は active class を明示clearしていないため、
  cursor は最後の位置に静止したまま残る
```

### capo info color の分離

```
変更前: color: var(--color-amber)
  → dark前提の値。silver/blue系背景でコントラスト不足

変更後: color: var(--capo-info-color)
  dark:   #ffcc66  明るいアンバー
  silver: #7a4400  濃い茶
  blue:   #f0a030  オレンジ

Phase56が壊したバグではなく、theme token設計の弱点が
DevToolsデバッグで可視化されたもの。
```

---

## 積み残し・保留

### capo info のデバッグ過程で判明した設計知識

今回「Chart Mode でカポ表示が見えない」を起点に調査した結果：
- Chart Mode には元々 capo info 表示機能がない（未実装・regression ではない）
- `showCapoInfo()` は右パネルの `showDiagramPanel()` 内でのみ呼ばれる
- Chart Mode のカポ表示はバックログに追加済み（current-issues.md）

### Chart Mode カポ表示（バックログ）

```
状態: 未着手
実装コスト: 低
  - _getCapo() は既に注入済み
  - --capo-info-color token は Phase56 で追加済み
  - capo projection は chartmode.js で実装済み
方向性: ヘッダーに「カポN → 実音キー」を追加するシンプル案
```

### chart label slot ownership（Phase57候補）

現在の chart chord label は measure projection 方式（応急処置）。

```
現状:
  renderer が slotIndex から left% を計算・補正して配置
  「このC表示は slot0所属か measure所属か」が曖昧

Phase57 目標:
  slot が label を所有する
  slot0 owns "C" → slot0の位置に描画（推測ゼロ）
  measure = slot の入れ物（grouping のみ）
```

ChatGPT確認待ち事項：
1. slot primary ownership の定義
2. carry label の扱い（`expandCarryForward()` の責務変化）
    carry representation model
3. empty slot の DOM 表現
4. projection 責務（capo transpose のタイミング）
5. renderer が参照する単位（measure単位 → slot単位ループへ）

---

## 次フェーズ候補

```
Phase57（推奨・ChatGPT設計レビュー済み後）
  chart label slot ownership model
  └── slot が label を所有する構造へ変更
      slot が source of truth になる
      renderer は slot data を投影するだけ
      measure = grouping のみ
      measure projection由来の left% 補正・overlap補正を削減する
      beat cursor / carry / 並列表示 / bars[] の土台

Phase58〜
  Chart Mode 並列表示（設計フェーズ）
  ※ slot ownership 確立後の方が設計が安定する
```

---

## current-issues.md 変更内容

- Chart Mode ビート単位フォーカス: 未着手 → **完了（Phase56）** に更新
- Chart Mode カポ表示（カポN → 実音: XX）: 新規バックログ追加

---

## commit message

```
feat: Phase56 chart beat cursor and capo info theme tokens
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
