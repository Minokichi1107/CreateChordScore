# Phase12 作業議論まとめ

## 概要

ChordScore Editor の Phase12 において、Perform Mode / TAP Mode / replace機能のモジュール分離、UI改善、スクロール制御、ダイアグラム表示改善、Git履歴整理などを実施した。

---

# Phase12 全体テーマ

## 主目的

- app.js の肥大化解消
- Perform Mode / TAP Mode のUI改善
- モジュール分離
- 演奏支援機能の改善
- 将来的な設計整理の準備

---

# Step1〜3: Perform Mode 改善

## 実施内容

### perform.js 分離

- Perform Mode関連処理を app.js から分離
- スクロール・描画・フォーカス制御を perform.js に移動

### スクロール改善

#### 問題

- scrollIntoView が過剰に発火
- 手動スクロールと競合
- カクつきが発生

#### 対応

- scrollIntoView 廃止
- scrollTo + offset 制御へ変更
- スクロールロック導入
- follow/static モード分離

---

# ダイアグラム改善

## 横向き化

### chords.js 修正

- SVGレイアウト変更
- 上下反転
- 横向き表示

## サイズ問題

### 現象

SVGが親要素からはみ出す。

### 原因

`.perform-line .chords` に以下が存在：

- `min-height: 20px`
- 古いルールと新しいルールが重複

SVG高さ（約87px）が親制約を超過していた。

### 修正

- 古い `.perform-line .chords` 削除
- `min-height` 削除
- `align-items:center` 追加

---

# Repeat表示修正

## 変更前

```html
<div class="lyric">歌詞 ×2</div>
```

## 変更後

- repeat表示をコード列右側へ移動
- 歌詞行から分離

---

# Step4: フォントスケール

## 実装

### HTML

```html
<input type="range" id="perform-font-scale">
```

### CSS

```css
:root {
  --perform-font-scale: 1;
}
```

### 適用対象

- 歌詞
- コード名
- フォーカス行
- ダイアグラム

---

## ダイアグラムスケール設計議論

### A案

CSS transform scale

#### 問題

- レイアウトサイズが変わらない
- 余白ズレ

### B案（採用）

drawDiagram(scale) 追加

#### 利点

- レイアウト追従
- SVG実寸変更
- Perform専用制御可能

---

# Step5: staticモードページング修正

## 問題点

### 1

`window.innerHeight` 使用

#### 問題

スクロール対象は perform-lines。

### 修正

```js
container.clientHeight
```

---

### 2

スワイプ誤発火

#### 修正

縦移動判定追加。

---

### 3

focusIdx リセット不足

#### 修正

static切替時にフォーカス初期化。

---

# Step6-1: replace.js 分離

## 新規作成

### replace.js

#### 管理対象

- rbHits
- rbCurr
- rbSnapshot

#### 実装

- initReplace
- rbRefresh
- rbHighlightAll
- rbScrollToCurrent
- _setupEvents

---

## app.js 削減

### Before

1865行

### After

1711行

### 削減量

154行

---

# Step6-2: tapmode.js 分離

## tapmode.js 新規作成

### 管理対象

- tovFocusIdx
- tovSeeking
- tovTapBtn

### 実装内容

- openTapMode
- closeTapMode
- syncTovPlayer
- updateTovTime
- renderTovLines
- _updateTovStatus
- _setupEvents

---

## app.js 削減

### Before

1711行

### After

1492行

### 削減量

219行

---

# TAP Mode 不具合修正

## timeupdate バグ

### 原因

初期化順序。

```text
setupEventHandlers
↓
initTapMode
```

timeupdate登録時点で callbacks が空。

### 修正

```text
initTapMode
↓
timeupdate登録
```

---

# TAP Mode UX改善

## スクロール制御

### 問題

自動追尾が手動スクロールを妨害。

### 修正

- tovScrollLock 導入
- TAP後のみ1秒追尾
- 通常時は自由スクロール

---

## 選択UI改善

### 操作体系

| 操作 | 内容 |
|---|---|
| click | フォーカス |
| Ctrl+click | 選択トグル |
| Shift+click | 範囲選択 |
| Esc | 選択解除 |

---

## 一括操作追加

### 追加機能

- 選択削除
- 全削除
- 選択解除

---

## CSS追加

### クラス

```css
.tov-focus
.tov-selected
```

---

# Perform Mode 静止表示問題

## 問題

staticモードでも暗転。

### 原因

```css
opacity: 0.3
```

が static にも適用。

### 修正方針

followモード限定に条件分離。

---

# Tailwind / Next.js 議論

## Tailwind

### 結論

Vanilla JS でも導入可能。

### ただし

- 途中導入は設計崩壊リスクあり
- style.css と混在しやすい
- クラス責務が二重化しやすい

### 現状判断

Phase12完了後に検討。

---

## Next.js 議論

### 結論

現プロジェクトでは必須ではない。

### 理由

- サーバ機能不要
- SPA寄り
- 個人ツール用途
- DB/認証不要

### ただし

大規模化・公開サービス化なら有力。

---

# 公開 vs 個人用 議論

## 個人用の利点

- DB設計を自分専用化可能
- 著作権問題を軽減
- UIを自分最適化できる
- データ構造を自由に変更可能

## 公開時の課題

- 歌詞著作権
- インポート形式互換
- ユーザー管理
- サーバ維持
- データ保護

---

# Git / 履歴削除 作業

## 問題

歌詞ファイルをGitに含めてしまった。

対象例：

- resource/lyric/
- resource/lyric2/

---

## 実施内容

### 1

tracking解除

```bash
git rm -r --cached resource/lyric/
```

---

### 2

git-filter-repo 実行

```bash
git filter-repo --force --path resource/lyric --path resource/lyric/ --path resource/lyrics --path resource/lyric2 --invert-paths
```

---

### 3

origin 再設定

```bash
git remote add origin https://github.com/minokichi1107/CreateChordScore.git
```

---

### 4

force push

```bash
git push --force origin main
```

---

## 学習したGit用語

### origin

リモートリポジトリの別名。

---

### upstream

追跡先ブランチ。

```bash
git push --set-upstream origin main
```

---

### git filter-repo

履歴そのものを書き換えるツール。

---

### git log --all

全ブランチ含め履歴確認。

---

### git remote add

remote登録。

---

# 現在の状態

## 完了済み

- perform.js 分離
- replace.js 分離
- tapmode.js 分離
- TAP UI改善
- static/follow