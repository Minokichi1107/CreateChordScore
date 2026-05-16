````markdown
# CreateChordScore - Phase10〜11 作業議論まとめ

## 概要

本チャットでは主に以下を実施。

- Performance Mode 改善
- 小節線 `/` 実装と不具合修正
- 演奏UI圧縮
- 横並びレイアウト導入
- compact-mode導入
- CSS構造検討
- Git運用整理
- 次フェーズへの引き継ぎ設計

---

# 1. 小節線 `/` 表示問題

## 症状

エディタでは `/` が存在するが、
Performance Mode で表示されない。

---

## 原因分析

### editor.js 側

```js
{ type: "sep" }
````

として保存していた。

---

### renderPerformLines() 側

```js
if (c.chord === '/')
```

を期待していた。

---

## 根本原因

データ構造不一致。

```js
type: "sep"
```

と

```js
chord: "/"
```

が混在。

---

## 修正方針

互換実装を採用。

```js
if (c.type === 'sep' || c.chord === '/')
```

---

## 設計結論

### 現在方式

```js
{ type: "sep" }
```

の方が適切。

理由:

* 型が明示的
* chord文字列に意味を持たせない
* 将来拡張しやすい

---

# 2. Performance Mode UI改善

---

## 問題

Performance Mode の1行高さが大きく、
一画面に数行しか表示できない。

---

## 初期構造

```text
Chord
Diagram
Lyric
```

縦積み。

---

## 検討案

### ① 複数列レイアウト

### ② 全曲俯瞰モード

### ③ コード横並び

結果:

### コード横並び案を採用。

---

# 3. 横並びレイアウト導入

---

## 目的

表示密度改善。

---

## 実装

```css
.perform-chord-col {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
```

---

## 効果

### Before

```text
Chord
Diagram
```

### After

```text
Chord [Diagram]
```

---

## 結果

行高さ 約46%削減。

---

# 4. flex-wrap導入

---

## 問題

コード数が多いと横オーバーフロー。

---

## 対応

```css
.perform-line .chords {
  flex-wrap: wrap;
}
```

---

## 効果

* 小画面対応
* 長コード列対応
* 安全な折り返し

---

# 5. 左寄せ変更

---

## 問題

中央寄せだと折り返し時に視線移動が大きい。

---

## 修正

```css
justify-content: flex-start;
```

---

## 効果

* 演奏中視線安定
* コード追跡改善

---

# 6. compact-mode 導入

---

## 目的

ダイアグラムOFF時に
さらに表示密度向上。

---

## 実装

```css
#perform-overlay.compact-mode .perform-chord-diagram {
  display: none;
}
```

---

## 結果

表示行数大幅増加。

---

# 7. 行間最適化

---

## 修正内容

### Before

```css
.perform-line {
  margin: 10px 0;
}

.perform-line .chords {
  margin-bottom: 6px;
}

.perform-line .lyric {
  min-height: 18px;
}
```

---

### After

```css
.perform-line {
  margin: 6px 0;
}

.perform-line .chords {
  margin-bottom: 2px;
}

.perform-line .lyric {
  min-height: 14px;
}
```

---

## 効果

約16px/行 削減。

---

# 8. Header圧縮

---

## 目的

コンテンツ表示領域拡大。

---

## 修正

```css
padding: 16px → 8px
```

等。

---

## 効果

Performance Mode 表示量増加。

---

# 9. drag操作改善

---

## 修正対象

Performance Mode。

---

## 改善内容

* drag navigation 修正
* dragスクロール改善
* repeat表示修正

---

# 10. CSS運用方針議論

---

## 問題

Claude が
「style.css末尾へ追加」
を提案。

ユーザーは:

> 重複して見づらくならないか

を懸念。

---

## 結論

### 一時的には末尾overrideでOK

理由:

* 安全
* rollback容易
* diff明確

---

### 後で正式整理

将来的に:

```text
performance.css
```

分離検討。

---

# 11. Git運用議論

---

## 状況

Phase10終了後、
mergeせず継続開発。

---

## branch

```text
phase10
```

↓

```text
phase10-11
```

へ変更。

---

## 評価

妥協案として合理的。

---

# 12. Gitログ確認

```bash
git log --oneline -5
```

結果:

```text
111ef4e feat: Performance Mode layout optimization (Phase11)
744fa35 fix: separator display and compact header (Phase11)
ca4fd23 fix: Performance Mode repeat display and drag navigation
5d4d09b fix: Performance Mode drag and display issues
a091259 feat: Performance Mode improvements (Phase11)
```

---

## 評価

履歴は健全。

* 機能追加
* 修正
* UI改善

が段階的。

---

# 13. app.js肥大化問題

---

## 現状

```text
js/app.js
約2000行
```

---

## 評価

危険域。

---

## 推奨分割案

```text
js/
 ├ app.js
 ├ perform.js
 ├ chord-diagram.js
 ├ chord-parser.js
 └ ui.js
```

---

## ただし

Phase11直後は分割しない。

理由:

* 安定状態を壊す
* diff巨大化
* 問題切り分け困難

---

# 14. 推奨フロー

```text
① Phase11 merge
② Phase12 branch作成
③ app.js分割設計
```

---

# 15. 現在のディレクトリ構造

```text
CreateChordScore
├ archive
├ backup
│ ├ js
│ └ スクリーンショット
├ docs
│ ├ draft
│ ├ finished
│ │ └ refactoring
│ ├ prompts
│ └ test
├ js
├ resource
│ ├ backup
│ ├ lyric
│ ├ sample
│ └ screenshot
└ tmp
```

---

# 16. Phase11 総括

## 技術的成果

* separator対応
* compact-mode
* 横並びレイアウト
* 表示密度大幅改善
* drag改善
* repeat表示修正

---

## UX成果

Performance Mode が
「実用レベル」に近づいた。

特に:

* スクロール頻度削減
* 演奏追従性改善

の効果が大きい。

---

# 17. 次フェーズ課題

## Phase12候補

### app.js分割

### Performance Mode改善

候補:

* 全曲俯瞰
* フォントスケール
* 自動スクロール
* diagram最適化

### CSS整理

style.css責務分離。

---

# 18. 最終状態

## branch

```text
phase10-11
```

---

## 状態

安定。

merge可能。

---

## 推奨

```bash
git checkout main
git merge phase10-11
git push
```

その後:

```bash
git checkout -b phase12
```

```
```
