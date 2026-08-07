# 引き継ぎ: Phase84完了 — Representation Translation Layer

## 作業状態
- ブランチ: phase84-representation-layer（想定・実際のブランチ名に合わせて読み替え）
- 直前作業: Phase83完了（Chart Mode編集UX改善 + 検索バグ修正）

---

## 1. Purpose（目的）

Phase83で発見した「ChordMini内部表記（度数ベース。例: `Emaj/3`）→ 人間向け表記
（音名ベース。例: `E/G#`）」の変換が、Chart Mode（`sanitizeChords()`経由）にしか
適用されておらず、Analysis Editorの4経路（Footer / Rename / Search / Replace）は
ChordMini生表記のまま露出していた問題を解消する。

Phase82で確立したChord Projection API（Capo変換）とは責務が異なる、独立した
「Representation Translation Layer」として設計・実装する。

---

## 2. Scope（今回やったこと）

```
① chords.jsへRepresentation Translation Layerを新設
   ・loadReplacementMap() / toReadableChord() / fromReadableChord()
② analysisLoader.jsの重複実装を解消
   ・ローカルnormalizeChordName()・fetchReplacementMap()・_replacementMapを削除
   ・toReadableChord()（chords.js）へ委譲する形にsanitizeChords()を縮小
③ app.jsへの適用（5経路）
   ・起動フロー: loadReplacementMap()を1箇所で呼ぶ（Authority集約）
   ・Footer（single/edit-point選択情報表示）
   ・Rename dialog（openChordRenameSelector）
   ・AddChord（addChordAtEditPoint・複数選択panel内Add Chordの2箇所）
   ・Search（検索マッチング・_refreshEditorView内）
④ 単体動作確認
   ・正常系・未ロード時・逆引き衝突・Capo統合の4ケースで動作確認
⑤ 実機確認
   ・Capo=2環境でChart表示・検索欄・ヒット件数の一致を確認
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Replace（置換）の書き込み方向へのfromReadableChord()適用
  → 見送り。理由は「5. Design Decisions」参照（Rename/AddChordと同じ
    書き込み経路のため、Representation逆変換は不要と判断）。

・replacementMapの逆引き衝突（Bbmaj/3 / A#maj/3 → A#/D）の解消
  → 140件中1件、かつ異名同音（enharmonic）による無害な表記揺れと判断。
    先勝ち縮退 + console.warnで許容し、辞書自体の修正は行わない。

・analysisLoader.jsのnormalizeChordName()という名前自体の完全撤去
  → chords.js側のnormalizeChordName()（alias統合。別の関心事）は
    引き続き存在する。同名関数の混同は「analysisLoader.js側のローカル実装を
    削除する」ことで解消済みのため、命名規則自体の変更は不要と判断。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| Representation Layer新設 | `loadReplacementMap()`（順引き・逆引き両方構築）/ `toReadableChord()` / `fromReadableChord()`。未ロード時は素通し（フェイルセーフ） | chords.js |
| sanitizeChords()の委譲化 | ローカルの`normalizeChordName()`/`fetchReplacementMap()`/`_replacementMap`を削除し、`toReadableChord()`（chords.js）を呼ぶだけのorchestrationに縮小 | analysisLoader.js |
| 起動フロー | `loadReplacementMap()`を`restoreLastProjectOnStartup()`の直前に追加（Representation Layerの唯一のロード地点） | app.js |
| Footer表示 | single/edit-pointの選択情報表示に`toReadableChord()`を追加（`toDisplayChord(toReadableChord(chord), capo)`の順） | app.js |
| Rename dialog | `openChordRenameSelector()`の初期表示のみ`toReadableChord()`を追加。書き込み側（`toCanonicalChord(selected.name, capo)`）は変更なし | app.js |
| AddChord | `addChordAtEditPoint()`・複数選択panel内Add Chordの2箇所、初期表示のみ`toReadableChord()`を追加 | app.js |
| Search（検索マッチング） | `_refreshEditorView()`内の変換順序を訂正。`fromReadableChord(toCanonicalChord(normalizeChordInput(query), capo))`（詳細は「6. Findings」参照） | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Representation LayerはCapo Projectionより前に適用する（表示方向）

```
結論:
  Canonical → toReadableChord() → toDisplayChord() の順で適用する。

理由:
  replacementMapは表示名辞書であり、Capoを知らない。
  さらに実装確認の結果、transposeChord()（toDisplayChord/toCanonicalChordの実体）は
  オンコードのベース音が音名（A-G）であることを前提にしており、ChordMini生表記の
  度数ベース（例: "Emaj/3"の"3"）には正しく適用できないことが判明した
  （詳細は「6. Findings」）。そのためCapo変換は必ずRepresentation変換後の
  音名表記文字列に対して行う必要がある。
```

### [判断] 検索方向はtoCanonicalChord()を先、fromReadableChord()を後にする

```
結論:
  正: normalizeChordInput() → toCanonicalChord() → fromReadableChord()
  誤（当初合意・訂正済み）: normalizeChordInput() → fromReadableChord() → toCanonicalChord()

理由:
  表示方向（Canonical → Readable → Displayed）の完全な逆関数として、
  検索方向は逆順（Displayed → Readable → Canonical）でなければならない。
  「6. Findings」で発見したtransposeChord()の性質が、この訂正の直接の根拠となった。
```

### [判断] Replace（置換）の書き込み方向にfromReadableChord()は適用しない

```
結論:
  replaceCurrentAndAdvance() / replaceAllMatches() の書き込み経路は
  toCanonicalChord(normalizeChordInput(replaceText), capo) のまま変更しない。

理由:
  ReplaceはSearchのような「既存bufferとの照合」ではなく、Rename/AddChordと
  同じ「ユーザーが選んだ新しい値をそのままbufferへ書き込む」操作である。
  新しく入力・選択されたコード名はChordMini由来の度数表記に変換する必要がなく、
  音名表記のままcanonical値として書き込んで問題ない（Phase82から一貫する方針）。
  fromReadableChord()が必要なのは「既存の値と一致させる」検索方向のみ。
```

### [判断] replacementMapの逆引き衝突は例外を投げず、先勝ち＋console.warnで縮退させる

```
結論:
  reverseReplacementMap構築時、1対多の衝突（Bbmaj/3 / A#maj/3 → A#/D）が
  見つかった場合、先に登録された方を採用し、console.warnのみ出力する。

理由:
  事前にreplacementMap.jsonを実機データで検証した結果、140件中1件のみで、
  かつ異名同音（Bb = A#）という音楽的に無害な表記揺れであることを確認した。
  データ破壊ではなく検索精度がその1件だけ低下する程度の縮退であり、
  例外を投げてUIをクラッシュさせるコストに見合わない。
```

---

## 6. Findings（判明した知見・調査プロセスの記録・重要）

### transposeChord()はChordMini生表記（度数ベースのオンコード）を正しく移調できない

```
実装確認前の仮定:
  toCanonicalChord() / toDisplayChord()（Capo Projection）は、
  Representation変換の前後どちらの表記にも同じように適用できるはずだと
  暗黙に仮定していた。

実装確認で判明した事実:
  transposeChord()内のオンコード処理は、ベース音の正規表現マッチングに
  /^([A-G][b#♯♭]?)(.*)/ を使っている。これは音名（G#, F#, Bb等）を
  前提としており、ChordMiniの度数表記（"3", "b7"等、数字始まり）には
  マッチしない。マッチしない場合、bassはtransposeされずそのまま
  文字列連結される（無変換で素通り）。

  つまり transposeChord("Emaj/3", 2) を実行しても、ルートのEだけが
  移調され、ベースの"/3"はそのまま残ってしまう。オンコードのCapo変換が
  静かに壊れる。

影響:
  この事実により、「Representation変換はCapo変換より必ず先（表示方向）」
  という設計判断が理論的にも確定した。同時に、検索方向（逆変換）は
  表示方向の完全な逆順でなければならないため、当初合意していた
  「fromReadableChord() → toCanonicalChord()」の順序が誤りであると判明し、
  「toCanonicalChord() → fromReadableChord()」に訂正した。

  もしこの実装確認を行わずに当初の順序のまま実装していた場合、
  Capo使用中のオンコード検索（例: Capo=2で"D/F#"を検索）が、
  buffer上の実際の値（"Emaj/3"）と一致せず、静かに0件ヒットになる
  という気づきにくい不具合になっていた可能性が高い。

発見の経緯:
  ChatGPTレビューで一度「fromReadableChord() → toCanonicalChord()」の順で
  承認されたが、Claude側で実装直前にtransposeChord()の実コードを確認した
  ところ、上記の正規表現の制約に気づき、数式的な逆関数の関係
  （表示 = P(R(x)) ならば 元へ戻す = R⁻¹(P⁻¹(y))）から矛盾を指摘。
  ChatGPTも実装の事実を確認した上で訂正に合意した。
  「レビューだけでは見抜けず、実装を読んだからこそ発見できた」ケースとして記録する。
```

### 実機確認結果（Capo=2環境）

```
確認内容:
  ・Chart表示: 小節29に "C/D"、小節40/48に "D/F#" と表示
  ・検索欄に "C/D" と入力 → 1/2件ヒット
  ・検索欄に "D/F#" と入力 → 1/9件ヒット
  ・buffer上の実際の値はChordMini生表記（"Cmaj/2"や"Emaj/3"相当の度数表記）

結論:
  Chart表示・検索欄がどちらも同じCapo適用後の音名表記で一致しており、
  「表示方向」と「検索方向」の2チェーンが実機で正しく接続されていることを確認した。
  この事実（表示文字列・ヒット件数の対応）は将来のリファクタリング時の
  回帰確認の基準として使える。
```

---

## 7. Remaining Issues（残課題）

```
なし（今回の作業範囲内では全て解消・実機確認済み）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
current-issues.md「5. Future Features」より優先度未定:
  ・Boundary Handleのドラッグ操作
  ・N（無音プレースホルダー）表示モデル不一致の解消
  ・Capo-aware Editing（表示コードでの検索・編集）
    → 本Phase84はその前提となるRepresentation Layer整備であり、
      Capo-aware Editing自体（表示コードのままでの直接編集）は
      引き続き独立フェーズ候補として残る。

設計原則として定着させたいこと:
  ・新しいEditor入力経路を追加する際は、表示方向は
    toReadableChord() → toDisplayChord()、検索/照合方向は
    toCanonicalChord() → fromReadableChord()の順を厳守すること
    （逆にすると本Phase84で発見した不具合が再発する）。
```

---

## 9. Files Changed（変更ファイル一覧）

```
chords.js
  ・loadReplacementMap() / toReadableChord() / fromReadableChord() 新設
  ・[REPRESENTATION BEFORE PROJECTION] 設計コメント追加
  ・理由: Representation Translation Layerの新設

analysisLoader.js
  ・ローカルnormalizeChordName() / fetchReplacementMap() / _replacementMap 削除
  ・sanitizeChords()をtoReadableChord()（chords.js）へ委譲する形に縮小
  ・冒頭のnormalize pipelineコメント更新
  ・理由: Phase83で発覚した同名関数の混同を解消し、責務ごとに1つのAPIへ一本化

app.js
  ・import追加（toReadableChord / fromReadableChord / loadReplacementMap）
  ・起動フローにloadReplacementMap()追加（restoreLastProjectOnStartup()の直前）
  ・Footer表示（single/edit-point）にtoReadableChord()追加
  ・Rename dialog・AddChord（2箇所）の初期表示にtoReadableChord()追加
  ・検索マッチングの変換順序を訂正（toCanonicalChord→fromReadableChordの順）
  ・理由: Representation Translation Layerの5経路への適用
```

---

## 10. Micro Log

- replacementMap.json（140件）を実機データで重複チェックし、逆引き衝突が
  1件（Bbmaj/3 / A#maj/3 → A#/D、異名同音・無害）のみであることを確認してから
  「先勝ち＋console.warn」の縮退方針を確定した
- 設計レビュー中、検索方向の変換順序について一度合意した内容を、
  実装（transposeChord()の正規表現）確認により覆した。逆関数の関係
  （表示=P(R(x)) ⇔ 元へ戻す=R⁻¹(P⁻¹(y))）から矛盾を指摘し、具体的な
  トレース例（Capo=2、Emaj/3→E/G#→D/F#の往復）で実証した
- 実装前にnode --input-type=moduleでの構文チェックを実施
- 単体動作確認（正常系・未ロード時・衝突・Capo統合の4ケース、実質7アサーション）を
  実装直後に実施し、全通過を確認してから最終ファイルを出力した
- 実機確認（Capo=2）でChart表示と検索欄の表記一致・ヒット件数を確認

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし（Phase83のhandoverで「次フェーズ候補」として残した
  「Representation Translation Layer」設計課題は、current-issues.mdへは
  正式追加されていなかったため、close by deletionの対象なし）
- 今回新規に積み残したissue: なし。新しい設計原則（表示⇔検索の逆関数関係）は
  「8. Next Phase」に記録済み。current-issues.mdへの追加は不要と判断
  （設計知見はarchitecture.md/handoverの役割のため）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
