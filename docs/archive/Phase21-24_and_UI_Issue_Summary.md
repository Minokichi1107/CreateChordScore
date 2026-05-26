# CreateChordScore 作業まとめ（Phase21〜24 + UI課題）

## 概要

このセッションでは主に以下を実施：

- lookup系 canonical化完成
- storage migration v3
- import canonical化
- `normChord()` 廃止
- custom diagram追加バグ修正
- split view時の中央パネル縮小問題の調査開始

---

# Phase21 — lookup統合

## 目的

lookup入口を `findChord()` に統一し、
normalize layer を全lookup経路へ適用する。

---

## 実装

### `lookupChord()` を互換ラッパー化

変更前：

```js
export function lookupChord(name){
  if(!name||name==='N')return null;
  if(CHORD_DB[name])return{name,data:CHORD_DB[name]};
  ...
}