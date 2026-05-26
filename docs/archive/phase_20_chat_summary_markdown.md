# Phase20 コード名正規化パイプライン 議論まとめ

## 概要

Phase20では、コード名の表記ゆれ問題を解決するために、

```text
入力文字列 ≠ DBキー
```

という設計へ移行し、canonical lookup layer を導入した。

主目的は：

```text
コード名の「探し方」を統一する
```

であり、storage migration や parser刷新ではない。

---

# Phase20 開始時点の問題

## 表記ゆれ

| 入力 | 現状 |
|---|---|
| `Cmaj7` | 別キー |
| `CM7` | 別キー |
| `B７sus4` | 別キー |
| `B7sus4` | 別キー |
| `Amin` | `Am` と別 |
| `Gmin` | `Gm` と別 |

---

## slash chord 問題

内部で：

```text
__SLASH__
```

escape が既に存在していた。

当初 `_SLASH_` 案も出たが、既存互換性を優先し：

```text
G/B
→ canonical

G__SLASH__B
→ storage detail
```

へ整理した。

重要：

```text
__SLASH__ は canonical chord notation ではない
```

---

# A案 vs B案 議論

## A案

オンザフライ normalize。

```text
保存データは書き換えず
lookup 時だけ normalize
```

---

## B案

migration により storage cleanup。

```text
既存データを canonical key へ変換
```

---

## 結論

Phase20では：

```text
A案採用
```

理由：

```text
normalize仕様がまだ安定確認前
```

そのため：

- lookup layer のみ導入
- migration は後回し
- storage cleanup は Phase21以降

となった。

---

# builtin audit 結果

Claude による監査で：

```text
Cmaj7 と CM7 が完全重複
```

していることが判明。

例：

```js
'Cmaj7': {...}
'CM7':   {...}
```

同様に：

- DM7
- EM7
- FM7
- GM7
- BM7

も存在。

Amaj7 のみ AM7 が存在しなかった。

---

# canonical spec 決定

## canonical

```text
Cmaj7
```

を正式名に決定。

理由：

- 一般的表記
- 可読性
- export/import 互換
- M7 より誤読が少ない

---

## alias

以下は alias 扱い：

| alias | canonical |
|---|---|
| `CM7` | `Cmaj7` |
| `C△7` | `Cmaj7` |
| `CMaj7` | `Cmaj7` |

---

# normalize設計

## normalizeChordName(raw)

lookup 専用 normalize。

重要：

```text
表示・保存には使わない
```

---

## normalize仕様

### Unicode normalize

```js
str.normalize('NFKC')
```

適用。

追加変換：

| 入力 | 変換 |
|---|---|
| `♭` | `b` |
| `♯` | `#` |

---

### minor 系

| 入力 | canonical |
|---|---|
| `Cmin` | `Cm` |
| `Cmi` | `Cm` |
| `Cmin7` | `Cm7` |
| `Cmi7` | `Cm7` |

---

### enharmonic

未対応：

```text
C# ≠ Db
```

統合しない。

---

# normalize設計で議論になった点

## `maj -> ''` 問題

当初：

```js
'maj': '',
'M': ''
```

案が存在した。

しかし：

```text
CM → C
```

へ潰れる危険があり削除。

---

## `△ -> maj` 問題

単純置換だと：

```text
C△ → C
```

化ける危険が判明。

そのため normalize は慎重化。

---

# findChord(raw)

導入：

```js
findChord(raw)
```

役割：

```text
normalize → canonical lookup
```

戻り値：

```js
{
  name,
  data
}
```

形式。

---

# Phase20 実装方針

## 採用された方針

### 新設

```js
normalizeChordName()
findChord()
```

---

### 維持

```js
normChord()
```

はまだ残す。

理由：

```text
既存依存箇所未調査
```

---

## lookup統合は未実施

重要：

```text
findChord() は導入済みだが
既存 lookupChord() は未移行
```

そのため：

```text
直 CHORD_DB lookup がまだ残る可能性
```

あり。

---

# builtin cleanup

削除済み：

```text
CM7
DM7
EM7
FM7
GM7
BM7
```

canonical：

```text
Xmaj7
```

へ統一。

Amaj7 はそのまま残存。

---

# テスト内容

確認済み：

```js
['CM7','DM7','EM7','FM7','GM7','BM7']
```

全て：

```text
Xmaj7
```

へ normalize。

さらに：

- `C△7`
- `Cmin7`
- `Ｂ♭ｍ７`
- `G/B`

なども正常動作確認。

---

# slash chord 設計整理

重要な整理：

```text
slash chord は本来構造情報
```

ただし Phase20 では object 化しない。

つまり：

```text
G/B
```

を canonical string として扱う。

内部保存のみ：

```text
G__SLASH__B
```

へ escape。

---

# やらなかったこと

## storage migration

未実施。

理由：

```text
normalize仕様安定確認待ち
```

---

## ChordToken object化

未実施。

理由：

```text
スコープ拡大回避
```

---

## enharmonic統合

未実施。

理由：

```text
音楽理論エンジン化を避けるため
```

---

## display preference

未実施。

例：

- CM7派
- C△7派

切替など。

---

# 設計上の重要転換

Phase20以前：

```text
入力文字列 = DBキー
```

---

Phase20以後：

```text
raw input
↓
normalizeChordName()
↓
canonical key
↓
findChord()
↓
CHORD_DB
```

という lookup layer が導入された。

---

# 次フェーズ候補（Phase21）

## lookup統合フェーズ

推奨。

内容：

- `lookupChord()` 調査
- `CHORD_DB[name]` 直参照監査
- `findChord()` へ段階移行
- perform mode 確認
- import/export lookup 確認

重要：

```text
一気置換しない
```

段階移行。

---

# 現在の懸念点

## 1. lookup経路混在