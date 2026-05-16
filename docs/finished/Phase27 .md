# ChordScore / ChordMini 統合作業ログ（Phase27完了〜次フェーズ検討）

## Phase27 概要

custom diagram storage における canonical invariant 崩壊問題を修正。

目的：

```txt
storage / runtime / import
すべて同一canonical identity
```

---

# Phase27 audit

## write path 調査結果

| 経路 | normalize適用 | 状態 |
|---|---|---|
| addCustomDiagram() | ✅ | 正常 |
| saveCustomDiagrams() | ❌ | 要注意 |
| loadCustomDiagrams() | ❌ | 問題あり |
| migrateCustomDiagrams() | ❌ | 問題あり |
| importCustomDiagrams() | ❌ | 問題あり |
| CSV import | ✅ | 正常 |

---

## 問題構造

```txt
runtimeではcanonical
↓
storage/load/importでlegacy key再流入
```

---

## 代表例

```txt
CM7
Cmaj7

B７sus4
B7sus4
```

が混在。

---

# Phase27 設計方針

## canonical collision policy

採用：

```txt
A）統合
```

---

## dedup条件

```txt
_id一致
OR
fingerprint一致
```

---

## fingerprint

```txt
${n}|${f.join(',')}|${b ?? ''}
```

---

# 実装内容

## 1. migrateCustomDiagrams()

### 修正前

```js
const key = rawK;
```

---

### 修正後

```js
const key = normalizeChordName(diagKeyDecode(rawK));
chords[diagKey(key)] = variants;
```

---

## 2. loadCustomDiagrams()

### 追加内容

- decode → normalize
- canonical merge
- dedup
- repair-resave

---

### repaired=true 条件

- key canonical化
- merge発生
- dedup発生

---

### repair-resave

```js
if (repaired) {
  saveCustomDiagrams();
}
```

---

## 3. importCustomDiagrams()

### 修正内容

```js
diagKey(
  normalizeChordName(
    diagKeyDecode(k)
  )
)
```

---

### dedup拡張

旧：

```txt
id一致のみ
```

新：

```txt
_id一致
OR
fingerprint一致
```

---

# 動作テスト

| テスト | 結果 |
|---|---|
| legacy key repair | ✅ |
| canonical merge dedup | ✅ |
| import repair | ✅ |
| reload persistence | ✅ |
| empty cleanup integrity | ✅ |
| fingerprint型揺れ | ✅ |

---

# fingerprint型揺れ検証

## テスト

```js
[0,1,2].join(',')
['0','1','2'].join(',')
```

---

## 結果

同値。

---

## 結論

追加normalize不要。

```txt
Phase28 fingerprint normalize
```

はスキップ。

---

# localStorage テストメモ

## 実storage schema

```json
{
  "version": 2,
  "chords": {
    ...
  }
}
```

---

## 間違えたテスト

```json
{
  "CM7": [...]
}
```

のみを直接保存。

---

## 結果

```json
{
  "version": 2,
  "chords": {}
}
```

へ初期化。

原因：

```txt
schema不一致
```

---

# Git作業

## commit

```txt
fix: canonicalize custom diagram storage and repair legacy keys
```

---

## push

```bash
git push --set-upstream origin phase27
```

成功。

---

## merge

```txt
main fast-forward merge
```

完了。

---

# PowerShell PSReadLine エラー

## 発生内容

長い multi-line commit message 入力時：

```txt
System.ArgumentOutOfRangeException
```

---

## 原因

```txt
PSReadLine cursor rendering bug
```

---

## 重要点

```txt
Git commit自体は正常
```

repository破損なし。

---

# 次フェーズ検討

## Issue #29 と左パネル問題は別

---

## 1. 左パネル折りたたみ問題

分類：

```txt
layout invariant 問題
```

---

### 現象

- ヘッダーボタン見切れ
- 中央パネル縮小不整合
- grid/flex幅崩れ

---

## 2. Issue #29

分類：

```txt
runtime resource reconnect 問題
```

---

### 内容

project reopen後：

- audio
- chord_source
- external JSON

がruntimeへ復元されない。

---

# 次フェーズ優先順位

1.

```txt
左パネル折りたたみ/UI崩れ修正
```

2.

```txt
base.css分離
```

3.

```txt
Issue #29
resource reconnect
```

4.

```txt
DBライブラリタブ
```

5.

```txt
カポ表示
```

---

# Claude の GitHub アクセス不可問題

## 原因

repository visibilityではなく：

```txt
Claude側セッションのHTTP fetch権限不足
```

---

## 状態

public repoでも：

```txt
GitHub fetch不可
```

になる。

---

# レイアウト問題の分析

## Claude の仮説

### 提案

- overflow:hidden
- overflow-x:auto
- project-title制限

---

## 問題点

### overflow:hidden

```txt
見切れを隠すだけ
```

根本解決ではない。

---

### overflow-x:auto

desktop headerとして操作性が悪い。

---

# 有力原因

## flex/grid shrink問題

特に：

```css
#project-title {
  flex: 1;
}
```

系。

---

## 重要ポイント

flex/gridでは：

```txt
min-width:auto
```

がデフォルト。

そのため：

```txt
内容幅以下に縮まない
```

問題が発生しやすい。

---

# 推奨修正

## 第一候補

```css
#project-title {
  min-width: 0;
}
```

---

## 第二候補

```css
#project-title {
  flex: 1 1 auto;
  min-width: 0;
}

#header-actions {
  flex-shrink: 0;
}
```

---

# 非推奨

```css
overflow: hidden;
```

理由：

```txt
根本原因を隠すだけ
```

---

# 現在状態

## branch

```txt
main
```

---

## Phase27

```txt
完了
```