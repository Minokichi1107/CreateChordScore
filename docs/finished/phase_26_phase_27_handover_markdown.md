# ChordScore / ChordMini 統合プロジェクト

## 概要

本チャットでは主に以下を実施した。

- Phase26（CHORD_DB access layer整理）
- custom chord / canonical key 問題の調査
- external chord resource の再接続問題整理
- 次フェーズ（Phase27）の設計方針整理

---

# 現在のブランチ状態

```txt
main      : Phase26マージ済み
phase27   : 次フェーズ開始ブランチ
phase26   : local/remote削除済み
```

---

# Phase26 実施内容

## 目的

CHORD_DB への直接アクセスを排除し、
lookup / mutation / UI の責務境界を明確化する。

---

# Phase26-A

## lookupChord() 廃止整理

### 実施内容

- `lookupChord()` を `findChord()` の薄いラッパーへ変更
- `app.js` 側の `lookupChord()` 呼び出し除去
- lookup責務を `findChord()` に統一

---

## 変更内容

### chords.js

```js
lookupChord(name) {
  return findChord(name);
}
```

---

### app.js

```js
lookupChord(chord)
```

↓

```js
findChord(chord)
```

---

## Phase26-A 動作確認

### OK

- ダイアグラムパネル表示
- hover popup
- chord lookup

---

# 一時的に発生した誤認

## 症状

以下が表示されないように見えた。

```txt
Am7/D
G/D
Bm/F#
```

---

## 当初の誤認

「custom chord DB が消えた」と判断。

---

## 実際の原因

これらは custom DB ではなく：

```txt
idontknow_chords.json
```

由来の external chord DB。

---

## 本当の原因

project reopen 後、
`chord_source` JSON が自動再読み込みされない。

そのため external DB が未接続状態だった。

---

## 結論

Phase26-A は無関係。

問題は：

```txt
external resource reconnect
```

設計側。

---

# Phase26-B

## mutation API 導入

### chords.js に追加

```js
getChordEntry(name)
ensureChordEntry(name)

addCustomDiagram(name, variant)
removeCustomDiagram(name, id)
updateCustomDiagram(name, id, patch)
```

---

## 設計方針

### read-only

```js
getChordEntry()
ensureChordEntry()
```

---

### mutation-only

```js
addCustomDiagram()
removeCustomDiagram()
updateCustomDiagram()
```

---

## Chord Entry Shape（現行維持）

```js
{
  v: [ { _id, n, f, b?, _custom? } ]
}
```

※ schema変更なし

---

# Phase26-C

## app.js の CHORD_DB[] 直参照ゼロ化

---

## add処理

### 変更前

```js
if(!CHORD_DB[name])CHORD_DB[name]={v:[]};
CHORD_DB[name].v.push(variant);
```

---

### 変更後

```js
addCustomDiagram(name, variant)
```

---

## delete処理

### 変更前

```js
CHORD_DB[chord].v = CHORD_DB[chord].v.filter(...)
```

---

### 変更後

```js
removeCustomDiagram(chord, id)
```

---

## edit処理

### 変更前

```js
CHORD_DB[chord].v.find(...)
CHORD_DB[chord].v[ei] = {...}
```

---

### 変更後

```js
getChordEntry()
updateCustomDiagram()
```

---

# Phase26 完了状態

## 達成ゴール

```txt
app.js → mutation/lookup API → CHORD_DB
```

```txt
app.js → CHORD_DB 直参照 = 0
```

---

# cleanup regression test

## テスト目的

`removeCustomDiagram()` 実行後、
空 entry が正常削除されるか確認。

---

## テスト方法

### 1.

存在しない chord を作る。

例：

```txt
TestCleanupChord
```

---

### 2.

custom diagram を1個追加。

---

### 3.

追加した唯一の diagram を削除。

---

### 4.

localStorage export を確認。

```js
JSON.parse(localStorage.getItem('cs_customDiags'))
```

---

## 結果

```txt
TestCleanupChord
```

entry は localStorage に残存していなかった。

cleanup 正常動作確認済み。

---

# saveCustomDiagrams / loadCustomDiagrams

会話中で確認された点：

- export/import 機能に対応
- localStorage persist にも関与

---

# localStorage dump で判明した問題

## canonical invariant 崩壊

storage 内に以下が混在：

```txt
CM7
Cmaj7
A#M7
D♭M7
B７sus4
B7sus4
```

---

## 意味

normalize/canonical policy が
全 write path に適用されていない可能性。

---

# Phase27 候補

# canonical identity audit

## 目的

canonical invariant が
どこで破れているかを完全把握する。

---

## 調査対象

### write path

- addCustomDiagram
- importCustomDiagrams
- migration
- external JSON merge
- project load

---

### read path

- findChord
- getChordEntry
- variation lookup

---

## 特に確認するもの

### normalize後保存されているか

例：

```txt
CM7 → Cmaj7
B７sus4 → B7sus4
D♭M7 → policy統一
```

---

## ゴール

```txt
storage / runtime / import
すべて同一canonical
```

---

# まだ触らない領域

- inversion generator
- slash chord semantic redesign
- structured variation id
- storage v4
- legacy id全面刷新

---

# バグ / バックログ

## project load 時に external resource が自動復元されない

### 現状

project reopen 後：

- audio
- chord_source

は runtime 復元されない。

---

## 結果

external JSON chord DB が欠落して見える。

確認例：

```txt
Am7/D
G/D
Bm/F#
```

---

## 現在の仕様

リロードバナーから手動再読込。

---

## 将来候補

- file handle保持
- reconnect UI
- missing resource表示
- custom DB / external DB 区別UI

---

# Git 作業ログ

## commit

```txt
refactor: Phase26 - CHORD_DB access layer 導入
```

---

## branch 操作

### 実施済み

```bash
git push --set-upstream origin phase26
```

```bash
git checkout main
```

```bash
git checkout -b phase27
```

```bash
git branch --delete phase26
```

```bash
git