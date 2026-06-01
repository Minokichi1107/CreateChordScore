# 引き継ぎ: Phase44完了 — Token Semantic Stabilization

## 作業状態
- ブランチ: phase42-design
- 直前作業: Phase44 全Step完了（Step1〜Step4）

---

## Phase44 の成果

### 完了したもの

| Step | 内容 | 主な変更ファイル |
|---|---|---|
| Step1 | undo / contamination audit | app.js / architecture.md |
| Step2 | no_chord token semantic 化 | tokens.js / chordEntry.js / app.js / perform.js / tapmode.js |
| Step2.5 | c.chord 直参照 audit | editor.js / perform.js / tapmode.js |
| Step3 | token taxonomy audit（コメント） | tokens.js / editor.js / app.js |
| Step4 | projection responsibility audit（コメント） | perform.js / editor.js |
| hotfix | perform.js isChordToken import 漏れ修正 | perform.js |

---

## 確定した設計原則

### Token Semantic 責務分離

| 用途 | 使用値 | 理由 |
|---|---|---|
| display（DOM表示） | `tokenToText(c)` | no_chord / simile も安全に変換できる |
| lookup（DB検索） | `c.chord`（raw） | CHORD_DB のキーは raw 文字列 |
| transpose（移調） | `isChordToken(c)` 判定後に `c.chord` | no_chord / barline を誤って移調しない |
| serialize（保存） | token object そのまま | 変換しない。復元時の互換性を保つ |

### display projection は非可逆

`tokenToText()` は「表示用の投影（projection）」であり、
元の token semantic を復元できない一方向変換である。

```
{ type: 'no_chord' }        →  'N.C.'
{ type: 'simile', bars: 2 } →  '𝄋' または 'sim.2'（将来実装例）
逆方向（表示文字列 → token）は tokenToText() では不可能
```

**display projection ≠ persisted semantic**

- serialize は必ず token object をそのまま保存する
- import / migration は raw 文字列から token を生成する（逆引き禁止）
- 表示文字列を DB lookup key や比較に使ってはならない

### renderer 分類（Phase44-Step4 確定）

| renderer | projection | 方式 |
|---|---|---|
| chartmode.js | あり | render 時に `transposeChord(chord, -capo)` で変換 |
| perform.js | なし（mutated state renderer） | app.js の destructive model で変換済みの c.chord をそのまま render |
| editor.js | なし（mutated state renderer） | 同上 |

### Token taxonomy

```
token種別       内部表現                    isXxx関数        tokenToText
────────────────────────────────────────────────────────────────────────
chord          { chord: 'Am7' }           isChordToken     → 'Am7'
barline        { type: 'barline' }        isSepToken       → '/'
barline legacy { type: 'sep' }            isSepToken       → '/'（互換）
barline legacy { chord: '/' }             isSepToken       → '/'（互換）
simile         { type: 'simile', ... }    isSimileToken    → 'sim.'（未実装）
no_chord       { type: 'no_chord' }       isNoChordToken   → 'N.C.'
```

### editor.js の意図的 c.chord 直参照

```js
onChordDblClick(idx, ci, c.chord)  // [LOOKUP-KEY] lookup identifier として渡す
onChordHover(c.chord, tag)         // [LOOKUP-KEY] lookup identifier として渡す
```

app.js 側で `if(!chord)return` guard 済みのため no_chord でも安全。
`tokenToText()` に置換すると lookup が壊れる。Do not replace。

---

## 教訓

### import 漏れによる潜伏バグ（perform.js isChordToken）
Step2 で perform.js に `isChordToken` を使う変更を入れたが import 追加が漏れ、
perform mode 全消失バグとして Step3 動作確認時に発覚。即 hotfix。
**対策: token 関数追加時は参照ファイル全体の import を同時に確認する。**

---

## 次フェーズ候補

### 軽量UI改善系（比較的独立・実装しやすい）
- 挿入ボタン ↑↓ 両方向対応
- 行またぎコード移動（token array boundary mutation）
- フロートメニュー位置改善（lyric baseline anchor）
- アーティスト名 / 曲名フィールド分離

### Chart Mode 拡張系
- 並列表示（設計フェーズが必要）
- mini transport（audio controls）追加
- ビート単位フォーカス（playback engine 拡張）

### 大規模設計系
- Issue #26: bars[] 構造移行
- keyboard-first chord entry（insertion model 再設計）
- capo projection 統合（destructive model → projection model 移行）
- app.js 分割（Issue #49）

---

## 運用ルール（変わらず）

- 通常はファイル出力不要。変更内容と diff のみ提示
- 変更後の関数全体を必ず出すこと（diff だけ避ける）
- ファイル出力は明示があった時のみ
- Phase完了時に commit message 案をまとめる
- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 大きな関数への変更は関数全体置換方式
- バグ修正は bugfix ブランチを切って作業
