# CreateChordScore 作業議論まとめ（Phase18〜19）

## 概要

本チャットでは以下の作業を進行：

* 行挿入仕様変更
* コード挿入位置指定UI
* コードパレット移調機能 (#13)
* JSONコード自動登録 (#12)
* ダイアグラム編集拡張 (#14) の仕様設計
* 今後のUX・編集補助方向性の整理

---

# Phase18-1 行挿入仕様変更

## 変更内容

### 旧仕様

```js
project.lines.splice(idx, 0, mkLine());
```

選択行の「前」に挿入。

---

### 新仕様

```js
project.lines.splice(idx + 1, 0, mkLine());
```

選択行の「後ろ」に挿入。

---

## 関連確認

以下は変更対象外：

* onLineDelete
* onLyricEnter
* onLyricBackspace

---

## UI修正

editor.js：

```text
↑挿入 → ↓挿入
```

titleも：

```text
下に空行を挿入
```

へ修正。

---

## コミット

```text
fix: insert line after selected row
fix: update line insert button label to ↓挿入
```

---

# Phase18-2 コード挿入位置指定UI

## 背景

従来：

```text
末尾追加のみ
```

だった。

---

## 採用仕様

### A案採用

* openAddChord モーダル内のみ対応
* 通常画面は現状維持

理由：

* global state増加回避
* editor.js汚染回避
* 影響範囲限定

---

## UI

```text
[＋] [Am] [＋] [Em] [＋]
```

方式。

---

## insertAt

```js
let insertAt = null;
```

* null = 末尾
* 数値 = splice位置

modal local state。

---

## 挙動

* insertAt位置へ splice
* 挿入後 insertAt++
* 同位置連続挿入可能
* modal closeで破棄

---

## CSS

```css
.mac-insert-btn
.mac-insert-btn.active
```

追加。

---

## token問題

```css
color: #fff
```

残留。

theme token未存在のため今回は許容。

バックログ：

```text
--text-on-accent token化
```

---

## コミット

```text
feat: support chord insertion at arbitrary position
```

---

# Phase18-3 コードパレット移調 (#13)

## 目的

左下コードパレット専用移調。

---

## 仕様

* project data非変更
* session only
* capo非連動
* slash chord対応
* transposeChord()流用

---

## UI

絞り込み欄右側：

```text
[-] 0 [+]
```

---

## 範囲

初期：

```text
-6 ～ +12
```

後に：

```text
+6 → -6 wrap
```

案へ。

---

## 表示

```text
+2
-1
0
```

形式。

---

## 重要仕様

パレット表示だけでなく：

```text
挿入されるコードも移調後
```

に変更。

理由：
表示だけ変わって挿入元が変わらないと実用性が低いため。

---

## wrap / modulo 議論

### wrap

```text
+6 の次で -6
```

循環。

---

### modulo

音楽理論上：

```text
12半音周期
```

概念。

現時点では深追い不要。

---

## コミット

```text
feat: add palette transpose button (#13)
```

---

# Phase18-4 JSONコード自動登録 (#12)

## 目的

ChordMini解析JSONから：

* timestamp
* chord

を既存譜面へ自動配置。

---

## JSON構造

```js
{
  chords: [],
  times: []
}
```

並列配列。

---

## 基本思想

```text
完成譜面生成
ではなく
編集ベース生成
```

---

## 行timestamp補完

timestamp未設定行：

```text
前timestamp〜次timestamp
```

を線形補間。

---

## 精度

内部float保持。

---

## chord配置

### 判定

```text
current <= t < next
```

---

### 順序

JSON順維持。

sortしない。

---

## overwrite

既存コード存在時：

```text
既存コードを上書きしますか？
```

を1回だけ確認。

---

## parse失敗

未知コード：

```text
そのまま文字列登録
```

rejectしない。

---

## timestampなし

timestamp付き行0件時：

```text
自動登録ボタン disabled
```

---

## UI

JSON読み込み後：

```text
🎵 コードを行に自動登録
```

ボタン表示。

---

## undo

import前snapshot。

Ctrl+Z対応。

---

## 実運用で判明した問題

### 問題

* 行位置ズレ
* 小節感不足
* 拍感不足

---

## 重要知見

```text
timestamp精度
より
拍感・視認性
```

が重要。

---

## 将来改善候補

### 編集補助方向

* 行内コード移動
* 小節線補助
* 4拍グリッド
* 前後送り
* 半自動補正

---

## 結論

完全自動化より：

```text
修正しやすさ
```

重視。

---

## コミット

```text
feat: add JSON chord auto-register with undo (#12)
```

---

# Phase19 #14 ダイアグラム編集・削除拡張

## 基本方針

### builtin

* 編集不可
* 削除不可

---

### custom

* 編集可能
* 削除可能
* localStorage保存

---

## variant構造

```js
{
  id,
  label,
  frets,
  meta?
}
```

---

## meta用途

将来：

* 曲依存フォーム
* perform mode連携
* preferred form

などへ拡張。

---

## fingers

不要。

---

## variant label

自由入力ではなく：

```text
プリセット候補
```

方式希望。

例：

* ロー
* バレー
* 5F
* omit
* spread

---

## 削除

* 確認なし
* 即削除
* undo前提

---

## variant 0件

custom chord削除。

---

## undo

フォーム保存単位。

5〜10手程度。

---

## export/import

### export

```text
custom only
```

---

### import重複

```text
既存保持（skip）
```

---

## hover UI

右上薄表示。

将来的に不要なら削除も検討。

---

## 実装前確認事項

* variant card描画位置
* localStorage schema
* editMode付きフォーム
* export/import UI位置

---

# 音楽ツール設計議論

## DAWとの違い

DAW：

* 時間軸管理強い
* 演奏譜UX弱い

CreateChordScore：

* 演奏譜UX重視
* カポ
* コードフォーム
* 演奏視認性

---

## 市場性議論

結論：

```text
巨大市場ではない
```

が、

```text
深い実務特化ツール
```

として価値あり。

---

## 最終的な方向性

```text
理論的完全性
より
演奏時認知負荷削減
```

を重視。

---

# 現時点の重要方向性

## 特に重要

```text
完全自動生成
ではなく
高速修正可能な譜面制作
```

方向。

---

# 次Phase開始時推奨

1. variant card描画箇所特定
2. localStorage schema確認
3. custom chord DB確認
4. undo stack設計
5. editMode設計
6. export/import UI設計
