# 引き継ぎ: Phase117完了 — isChordLikeInput() 末尾検証強化

## 作業状態
- ブランチ: phase117-chordlike-suffix-validation
- 直前作業: Phase116完了（__analysisEditorDebugの正式化整理）

## micro-log
（フェーズ完了につき本文へ整理済み。本セクションは削除）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `isChordLikeInput()` 末尾検証追加 | 先頭（Root A-G + 臨時記号）のみ検証していた正規表現に、末尾までの文字クラス検証（`$`アンカー）を追加 | chordEntry.js |

```diff
- return /^[A-G](#|♯|b|♭)?/.test(v.trim());
+ return /^[A-G](#|♯|b|♭)?[A-Za-z0-9#♯b♭/+\-]*$/.test(v.trim());
```

## 設計判断

```
結論: isChordLikeInput()の責務は「コード入力として最低限の構文を満たすか」
      の判定に限定する。実在するコードとしての意味論的妥当性
      （例: C/////、C+++が実在するコードかどうか）は、既存の
      normalizeChordName() / findChord() に委ねる（今回は無変更）。

理由: CHORD_DBの全サフィックス（m7/maj7/sus4/add9/dim/aug...）を正規表現に
      列挙する方式は、将来CHORD_DB側に新表記が追加されるたびに同期修正が
      必要になり、今回の目的（「Cほげ」のような明らかな異常入力を弾く）に
      対して過剰。文字クラスのホワイトリスト方式（案A）を採用した。
```

## 確定した設計原則

新規Named Invariantの追加・変更なし。既存の責務分離
（構文検証 = isChordLikeInput() ／ 意味論検証 = normalizeChordName()・
findChord()）を、末尾検証の追加によって明確化しただけ。

## Out of Scope（あれば）

- CHORD_DB全サフィックスの列挙によるホワイトリスト方式（保守コスト過大のため不採用）
- `normalizeChordName()` / `findChord()` の変更（意味論判定は既存のまま）
- 呼び出し側3箇所（addChord / AddChordモーダルプレビュー / showChordSelector）の変更

## 実機確認

```
□ AddChord正常系（C / Cm7 / D♭ / F#sus4 / Am7/D）→ 追加できる → OK
□ AddChord異常系（Cほげ / hello / あ）→ 受理されない → OK
□ 既存の正常なコード入力の回帰（#, ♯, b, ♭, / を含む表記）→ 従来通り動作 → OK
□ node --check（単独実行・$LASTEXITCODE確認）→ 0 → OK
□ 単体境界値テスト18ケース → 全PASS → OK
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - `isChordLikeInput` の末尾検証強化（4. 既知の技術的負債に記載・Phase117で解消。
    正規表現へ末尾アンカー（`$`）と文字クラスのホワイトリストを追加し、
    「Cほげ」のようなA-G以外の文字が混入した入力を弾けるようにした。
    構文検証（isChordLikeInput）と意味論検証（normalizeChordName/findChord）
    の責務分離は維持したまま、構文側の判定精度のみを強化した）
- 今回新規に積み残したissue: なし

## 積み残し・保留バグ
なし

## 次フェーズ候補

Phase115 handoverの優先順位より：
```
新規: Undo/Redo後の変更箇所ナビゲーションUX（Future・構想段階）
```

現時点で明確な「次点候補」は積み残しておらず、次フェーズは新規の要望・発見事項ベースで選定する。

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- `isChordLikeInput` の末尾検証強化（Phase117で解消。正規表現を
  `/^[A-G](#|♯|b|♭)?[A-Za-z0-9#♯b♭\/+\-]*$/` へ変更し、末尾までの
  文字クラス検証を追加。「Cほげ」等のA-G以外の文字混入を弾けるように
  なった。意味論判定（実在するコードかどうか）は引き続き
  normalizeChordName()/findChord()側の責務のまま変更していない）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ `isChordLikeInput()` 末尾検証強化（Phase117・正規表現へ末尾アンカーと
    文字クラスのホワイトリストを追加。構文検証／意味論検証の責務分離を
    維持したまま構文側の判定精度のみ強化）

- Major Milestones（Analysis Editorテーブル。※ chordEntry.jsはAnalysis
  Editor Add Chord / Chord Selectorの共通入力検証のため、便宜上同テーブルに
  記載）に追加:
  | 117 | `isChordLikeInput()` 末尾検証強化（先頭ルートのみ検証していた
    正規表現に末尾までの文字クラス検証を追加。CHORD_DB全サフィックス列挙
    ではなくホワイトリスト方式を採用し、将来のCHORD_DB拡張との同期保守を
    回避） | chordEntry.js |

- Future Candidates: 変更なし（次候補は構想段階のUndo/Redoナビゲーション。着手条件未確定）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
