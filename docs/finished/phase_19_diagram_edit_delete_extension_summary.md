# Phase19 作業まとめ — ダイアグラム編集・削除拡張

## 概要

Phase19では issue #14 を中心として、カスタムダイアグラム管理機能の大幅拡張を行った。

主な目的：

- custom diagram の編集
- custom diagram の削除
- Undo
- export / import
- storage schema migration
- variant id導入
- UI改善

また、作業中にコード名正規化問題が顕在化し、Phase20以降で扱うべき課題として整理された。

---

# 1. 仕様整理

## builtin と custom の扱い

### builtin

- `chords.js` の固定定義
- 編集不可
- 削除不可

理由：

- 初期DB破壊防止
- 更新整合性維持
- runtime安定性確保

---

### custom

- localStorage保存
- 編集可能
- 削除可能

---

# 2. variant構造

runtime側（互換維持のため旧構造を継続）：

```js
{
  n,
  f,
  b?,
  _custom?,
  _id?
}
```

---

## storage側（v2）

```js
{
  version: 2,
  chords: {
    "CM7": [
      {
        id,
        n,
        f,
        b?,
        _custom: true
      }
    ]
  }
}
```

---

# 3. localStorage現状確認

実データ確認により以下が判明。

## 表記ゆれ

- `Cmaj7` と `CM7`
- `B７sus4` と `B7sus4`
- `min` と `m`
- `♭` と `b`

などが混在。

---

## slash chord形式

```text
__SLASH__
```

エンコード形式を使用。

例：

```text
G__SLASH__D
```

---

# 4. migration実装

## 旧schema

```js
{
  chordKey: {
    v: [{ n, f, b }]
  }
}
```

---

## 新schema（v2）

```js
{
  version: 2,
  chords: {
    chordKey: [
      {
        id,
        n,
        f,
        b
      }
    ]
  }
}
```

---

## migration方針

- runtime側は変更しない
- storageのみ構造変更
- load時自動migration
- migration後は即保存

---

## id生成

新規追加：

```js
crypto.randomUUID()
```

旧データmigration：

```js
stableId(rawK, n, f)
```

を使用。

---

# 5. runtime / storage分離

## 結論

Phase19では runtime刷新は行わない。

理由：

- 影響範囲が大きい
- `n/f/b` を直接参照している箇所が多い
- フェーズスコープ超過

---

## 現在の状態

| 層 | schema |
|---|---|
| runtime | `n/f/b` |
| storage | `id/n/f/b` |

---

## runtime追加フィールド

```js
_id
```

storage側の `id` を runtimeに展開。

---

# 6. Undo実装

## 方針

snapshot方式。

理由：

- データ量が小さい
- diff方式は複雑
- 復元信頼性優先

---

## 実装

```js
const _diagUndoStack = [];
```

localStorage文字列をそのまま保持。

---

## Undo設計重要点

最終的に以下へ整理。

### diagUndo

状態復元のみ。

```text
localStorageを書き戻すだけ
```

---

### refreshDiagrams

UI更新責務。

```text
loadCustomDiagrams()
showDiagramPanel()
```

---

## 重要学び

```text
状態更新とUI再描画を分離
```

しないと競合しやすい。

---

# 7. loadCustomDiagrams問題

## 発生した問題

複数variantが表示されない。

原因：

```text
load時にruntimeクリアせずpushし続けていた
```

---

## 修正

```js
clearCustomFromRuntime()
```

を導入。

load前に custom runtime を破壊的再構築。

---

## 現在の注意点

現在の `loadCustomDiagrams()` は：

```text
destructive rebuild
```

方式。

将来的に：

- reactive UI
- perform cache
- 差分更新

導入時に問題化可能性あり。

---

# 8. 編集・削除UI

## showDiagramPanel改修

custom variant のみ：

- ✏️ 編集
- 🗑 削除

を表示。

条件：

```js
vr._custom && vr._id
```

---

## builtinには表示しない

理由：

```text
builtin = 読み取り専用
```

---

## ボタンUI

- 常時薄表示
- hover/focusで強調

touch環境考慮。

---

# 9. 編集モーダル

## 方針

既存手動登録フォーム再利用。

---

## editMode追加

- 新規追加
- 編集

を同一フォームで処理。

---

# 10. export / import

## export

- custom only
- builtin除外

出力ファイル：

```text
chordscore_diagrams.json
```

---

## import

- JSON読み込み
- 同一id存在時：skip
- 上書きUIなし

---

## UI配置

ダイアグラムパネル下部。

```text
＋ダイアグラムを手動登録
```

の横。

---

# 11. export/import周辺での議論

## Blob URL

export動作確認中に：

- appendChild要否
- Cache-Control
- GitHub Pages cache

などを検討。

---

## 結論

304自体は正常動作。

```text
no-cache = 毎回確認
```

であり問題ではない。

---

## 実際の問題

Console貼り付けコードによる SyntaxError 混入。

---

# 12. 正規化問題（Phase20案件）

## 判明した問題

コード名が統一されていない。

例：

| 入力 | 問題 |
|---|---|
| Cmaj7 | CM7と別キー |
| B７sus4 | 全角7 |
| Amin | Amと別 |
| Gmin | Gmと別 |

---

## 重要結論

Phase19では：

```text
コードキー自体は変更しない
```

---

## 理由

builtin lookup 全体に波及するため。

---

## 次フェーズ方針

### normalizeDisplayName

表示正規化。

---

### normalizeChordKey

内部DBキー統一。

---

## 推奨方向

```js
{
  raw,
  normalized,
  display
}
```

の分離。

---

# 13. 設計思想

重要：

このDBは：

```text
単なるコード辞書ではない
```

目的：

```text
演奏運用DB
```

---

## 想定用途

- ロー
- バレー
- omit
- spread
- 曲専用フォーム
- セッション簡略

などの蓄積。

---

# 14. 懸念点

## 1. runtime再構築方式

現在：

```text
clear → full rebuild
```

将来：

```text
差分更新
```

必要可能性。

---

## 2. runtime schema旧式維持

現在：

```js
n/f/b
```

短縮キー継続。

---

## 3. Undo競合可能性

将来：

- project undo
- editor undo
- diagram undo

統合必要可能性。

---

## 4. silent catch

現在：

```js
catch(e) {}
```

残存箇所あり。

デバッグ困難化リスク。

---

# 15. バックログ

## Undo UI改善

未着手：

- Ctrl+Z
- Redo
- 編集メニュー統合

---

## 将来候補

- variant並び替え
- favorite variant
- perform mode連携
- 曲依存フォーム
- preferred fingering
- 差分更新runtime

---

# 16. Phase20推奨開始タスク

1. normalize仕様策定
2. internalKey設計
3. display/