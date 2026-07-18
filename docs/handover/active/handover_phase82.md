## Phase82 handover（軽量版）

現在の変更規模・調査プロセスを踏まえると、単純な機能追加1件というより「設計判断＋原因調査」の要素が強いので、重量版寄りの内容も一部含めます。ただ設計判断自体は当初から一貫していたので、軽量版ベースでまとめます。

---

```markdown
# 引き継ぎ: Phase82完了 — Analysis Editor Chord Projection Boundary

## 作業状態
- ブランチ: phase82-capo-aware-editor
- 直前作業: Phase81完了（ドキュメント棚卸し）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Chord Projection API新設 | `toDisplayChord(chord, capo)` / `toCanonicalChord(chord, capo)`。既存`transposeChord()`を1段ラップ。capo=0は早期リターン | chords.js |
| Footer表示 | 選択情報表示を`transposeChord()`直書きから`toDisplayChord()`利用へ | app.js |
| Rename dialog | `openChordRenameSelector()`の初期値・保存値をProjection API経由に | app.js |
| AddChord | `addChordAtEditPoint()`・複数選択panel内Add Chordの2箇所を同様に修正 | app.js |
| Search | `search.query`は表示名のまま保持し、`searchChords()`呼び出し直前（`_refreshEditorView()`内）で変換する設計に統一 | app.js |
| Replace | `search.replaceText`も同様。`replaceCurrentAndAdvance()`・全置換ボタンで変換 | app.js |
| バグ修正 | `openChordRenameSelector`/`addChordAtEditPoint`に`capo`のローカル取得(`getCapo()`)が漏れており、未宣言`capo`がグローバル（`<input id="capo">`のNamed Access）にフォールバックしていた。両関数に`const capo = getCapo();`を追加 | app.js |

## 確定した設計原則

```
Editor UIはCanonical Chord（raw）を直接扱ってはならない。
Canonicalとの変換は toDisplayChord() / toCanonicalChord() の2関数のみを経由する。

Chord Projection APIはchords.jsに新設。Analysis Editor専用ではなく、
将来Library / Diagram / Exportからも利用できるChordドメイン共通APIとして位置づける。

このAPIはコード名（chord文字列）のProjectionのみを担当する。
id / duration / timing等を含むChordオブジェクト全体の変換は行わない。

showChordSelector()自体はcapoを知らない汎用UI部品のまま維持する。
変換は呼び出し元（Analysis Editor側）が担う。

input欄（search.query/replaceText）は表示名のまま保持し、
変換は「実行の瞬間」（searchChords呼び出し・置換実行）に一元化する。
入力イベントの都度変換すると、変換結果がinput表示へ再度反映されて
ループするバグを生む（Phase82で実際に発生・修正済み）。
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし（current-issues.mdに本件の記載なし。たかっちの直接要望として着手したフェーズ）
- 今回新規に積み残したissue: なし。ただしProjection Boundaryは「今回ユーザーが実際に触る5経路」のみ対応。将来Copy/Paste・新規モーダル等の入力経路が増えた場合は、その追加時にProjection APIを経由させること（下記「次フェーズ候補」参照）

## 積み残し・保留バグ
なし（今回の作業範囲内では全て解消）

## 次フェーズ候補
- 新しいEditor入力経路（Copy/Paste表示、Bulk操作、新規モーダル等）を追加する際は、Chord Projection API（`toDisplayChord`/`toCanonicalChord`）を経由すること（設計原則として定着させる）
- architecture.md §8「カポ設計の移行状態」の更新（Analysis Editorも新方式=Projection modelへ移行完了した旨を反映）は次回棚卸し時に実施

## 運用ルール（変わらず）
→ docs/handover/README.md 参照