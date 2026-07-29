# Section Model 設計メモ

> **位置づけ**: Phase94完了直後の議論で「育てていく設計メモ」として起票し、
> Phase98で仕様固定（Design Freeze）を行った。
> `current-issues.md` のロードマップ「Chart Modeと通常モードのシステム統合」
> と密接に関連するため、本格的な範囲拡張の判断はそちらとセットで行うこと。
>
> ステータス: **仕様確定済み（Phase98・Design Freeze）。実装未着手（Phase99以降）。**
> 最終更新: Phase98完了時点

---

## [DOCUMENT AUTHORITY]

```
本ファイルはSectionサブシステムの設計判断を集約する設計ドキュメントである。

Sectionに関するデータモデル、Authority Scope、ライフサイクル等の
詳細設計は本ファイルで管理する。

architecture.md・phase-status.md・current-issues.mdには
必要最小限の概要または参照のみを記載し、設計内容を重複して保持しない。
```

役割分担のイメージ：

```
architecture.md      … システム全体構造（Sectionが他サブシステムと
                        どう繋がるか）
section-model.md      … Sectionサブシステムの詳細設計（本ファイル）
```

---

## 0. これは何か（1行で）

コード単位編集の上に、Verse / Chorus のような「Section」（曲構造の単位）レイヤーを
追加する構想。当初は「演奏モードでコードの長さを視覚化したい」という要望から
出発したが、議論の結果「曲を頭の中で考えている単位（Verse/Chorus）と、
ソフトが扱う単位（コード）が一致していない」という、より本質的な課題に
行き着いた。

---

## 1. 動機（なぜ欲しいか）

- 今のCreateChordScoreは「コードを編集するソフト」。目指す先は
  「曲の構造を編集するソフト」。
- 実際の編集作業（「Verseをもう一回」「最後のChorusを2倍」等）は、
  コード単位の範囲選択・貼り付けの繰り返しになりがちで、DAWの
  リージョン複製のような操作感には至っていない。
- 演奏中に「あとN小節でChorus」が分かると、譜面から視線を
  外さずに済む時間が増える（このプロジェクトの一貫した目標＝
  「譜面から視線を外さずに済むツール」に合致する）。

---

## 2. 本体とおまけの切り分け

```
本体（価値の9割はここ・優先）
  Section層の追加
    ├─ データモデル
    ├─ 永続化
    ├─ Chart Modeでのセクション表示・操作（作成・複製・並べ替え・削除）
    └─ 既存Authority Indexへの新規Authority登録

おまけ（後回しでも成立する・任意）
  自動セクション検出
    ├─ コード進行の一致による候補生成（現実的）
    ├─ ビート情報による境界補正（土台あり・現実的）
    └─ 音響特徴量（クロマ/MFCC等）による類似検出（研究寄り・非現実的候補）
```

「手動でSectionを作れて、Section単位で編集できる」だけで、
発端となった不満（構造が見える・複製が楽）はほぼ解決する。
自動検出は前提条件ではなく、後から追加できる拡張。

---

## 3. Sectionの責務

実装先（projectか analysis か）や参照方式が変わっても、
この責務定義だけはぶれないようにする。

```
Sectionが持つもの:
  ・曲構造の表現
  ・コード範囲のグルーピング
  ・名前（name）
  ・種類（type: verse / chorus / bridge 等）
  ・編集単位としての性質

Sectionが持たないもの:
  ・コード本体の保持（コードの正本はSectionではない）
  ・時間の管理（絶対時刻を直接持たない）
  ・小節の管理
  ・再生位置の管理
```

Sectionが絶対時間を持ってしまうと、Boundaryドラッグ・Add Here・Split・
Deleteのたびに「Sectionの時間更新」という新しい責務が発生し、
Sectionが実質的な「時間管理者」になってしまう。これは
Forward Wall Model（範囲シフトの責務分離）の設計思想と衝突するため、
明確に避ける。

---

## 4. データモデル（Phase98で確定）

### 4.1 形状

```javascript
Section = {
  id,             // UUID（Section Identity。rename/move/duplicateを
                  // 経ても維持される、Sectionそのものの同一性）
  type,           // 'verse' | 'chorus' | 'bridge' 等
  name,           // 表示名（ユーザー編集可能）
  startChordId,   // 開始コードの_id
  endChordId,     // 終了コードの_id
}
```

`id`は`project.id`や`chord._id`と同じく、このプロジェクトが一貫して
重視している「Identity」を表す。名前を変えても、範囲（start/end）を
動かしても、複製しても、`id`が同じであれば「同じSection」である。

### 4.2 参照方式: IDペア方式（確定）

```
悪い例（時刻ベース）:
  { id, type, name, start: 128, end: 160 }
  → Boundaryドラッグ等で時刻がズレるたびに全Sectionの座標を
    再計算し続ける必要がある。Forward Wall Model
    （「2箇所だけ可変」という前提）と相性が悪い。

採用（コード参照ベース）:
  { id, type, name, startChordId, endChordId }
  → 実際の描画時（Rendering層）にのみ、参照先chordの現在の
    start/endを引いて座標を導出する。
    Authority → Projection → Rendering の原則そのもの。
```

**IDペア方式を採用した理由：**

このプロジェクトには既に「indexやcountを正本にせず、IDから都度導出する」
という設計実績が複数ある（`selection.chordIds`、`boundaryHandleChordId`、
`editPoint`）。architecture.md §12にも、`selection.boundaryIndex`を
配列indexそのものではなくchordIdsから導出するDerived Cacheとして扱う、
という教訓が明文化されている。

一般原則として言い換えるなら：
**本プロジェクトでは「意味のある実体はIDで保持し、位置・順序はProjectionで
導出する」という設計原則を採用している。Sectionもこれに従う。**

### 4.3 境界コード増減時のルール（Phase98で確定）

```
[SECTION BOUNDARY UPDATE RULE]

ケースA: Section内部にコードを追加
  例: [C, Am, F, G] というSectionの途中に Em を挿入
      → [C, Am, Em, F, G]
  挙動: 自動的にSectionへ含まれる（何もしない）。
  理由: Sectionは startChordId〜endChordId の「区間」を表すため、
        「その間に存在するコードはすべてSection」という定義が
        シンプルで例外がない。

ケースB: 境界コード自体が削除される
  startChordIdが削除された場合
    → 削除後に隣接する（削除位置の次にあった）コードへ自動的に
      付け替える
  endChordIdが削除された場合
    → 削除後に隣接する（削除位置の前にあった）コードへ自動的に
      付け替える
  理由: 既存のeditPoint / boundaryHandleChordIdの「削除時の隣接
        再割り当てパターン」と同じ思想を転用し、一貫性を保つ。

ケースC: Section内が0コードになった場合
  （startとendの間にコードが1つも残らなくなった場合）
    → Sectionごと自動削除する（空のSectionを残さない）
```

### 4.4 Section Invariants（Phase98で確定）

```
[SECTION INVARIANTS]

Sectionは常に次の条件を満たす。

・startChordId と endChordId は必ず存在するコードを参照する
  （どちらか一方でも参照先が消えたSectionは、次のCommand実行時までに
  §4.3のルールで解消されるか、削除されなければならない）
・startChordId は endChordId より時間的に後方を指してはならない
・Section内のコード列は常に連続区間である（歯抜けを許さない）
・Sectionはコード本体を所有しない（§3参照。コードのAuthorityは
  あくまでanalysisEditor.buffer側にある）
```

将来Command（Section関連のCreate/Update/Delete、あるいはコード側の
delete/split/merge等）を実装する際、この4条件を壊していないかが
判断基準になる。既存の[BOUNDARY INVARIANT]・[UNDO TRANSACTION
INVARIANT]と同じ役割を、Sectionサブシステムに対して果たす。

---

## 5. Authority Scope（Phase98で確定）

```
[SECTION AUTHORITY SCOPE]

Sectionは Phase98時点では Analysis Editor Session内のみ有効である。

SectionのAuthorityは analysisEditor編集セッションに限定される
（「buffer」という実装詳細ではなく、「編集セッション」という
スコープに紐づく）。

これは試作スコープであり、Project Repositoryへの統合は
将来フェーズで再検討する。
```

**この表現にした理由（Phase98の議論より）：**

「`analysisEditor.buffer` が正本」と書いてしまうと、実装詳細（buffer
というJS変数）にAuthorityを固定してしまい、将来 `project.lines` へ
移す判断のたびに文書の書き直しが発生する。「編集セッションに限定される
Authority」という理由付けにしておけば、スコープが変わる（Project
Repositoryへ広がる）だけで、Authorityの所在の説明ロジック自体は
変える必要がない。

イメージ：

```
現在（Phase98〜試作期間）
  Analysis Session
    ├ buffer.chords
    └ sectionSession（Sectionの実体はここに置く）

将来（統合判断後）
  Section Session
        ↓（差し替え）
  Project Repository
```

---

## 6. ライフサイクル（Phase98で確定）

### 生成（Create）

```
入力: type, name, startChordId, endChordId
条件: startChordIdはendChordIdより時間的に前（または同じ）であること
```

- 範囲が重複する既存Sectionがあっても、データ層ではブロックしない
  （重複禁止はUI側の懸念であり、データモデル自体は許容する。将来
  「意図的な重複」＝セクションのネスト表現等を禁止しないため）

### 更新（Update）

```
境界の変更 = startChordId / endChordId の付け替え
名前・種類の変更 = name / type の書き換え
```

- 境界コードの増減（§4.3）は「更新」の自動発生ケースとして扱う。
  ユーザー操作ではなく、他のCommand（削除・追加）の副作用として
  起きる点に注意
- **責務の所在（確定）**：Sectionの更新はSession Layer（historyを
  積まないstate primitive）が責務を持つ。理由は、境界コード増減による
  Section更新はユーザーが「1回の操作」と認識するコード側のCommand
  （例: deleteSelectionCommand）に付随して起きる副作用であり、それ自体が
  独立したUndo単位にはならないため（既存の[UNDO TRANSACTION INVARIANT]
  と同じ考え方）。
- **API設計（Phase99で決定）**：具体的にどの関数が・どのタイミングで
  Session Layer側のSection更新を呼び出すか（各Commandの内部で呼ぶのか、
  app.js側のラッパーが呼ぶのか等）は実装フェーズで設計する。
  「責務」と「API設計」を分けて考え、責務のみをここで確定する。

### 削除（Delete）

```
明示的な削除 = ユーザーがSectionを削除操作する
暗黙の削除   = Section内の全コードが無くなった時（§4.3 ケースC）
```

- 明示的な削除はCommand Layerの操作（1操作＝1 pushHistory）
- 暗黙の削除は、その削除を引き起こした親コマンド（例:
  deleteSelectionCommand）のUndoトランザクションに含める
  （[UNDO TRANSACTION INVARIANT]と同じ考え方。Section消滅だけを
  理由に余分なhistoryを積まない）

---

## 7. ロードマップ（段階案）

```
S. Section Specification（仕様固定）── Phase98で完了
    ・責務の最終確定（§3）
    ・境界ルールの確定（§4.3）
    ・データモデルの確定（§4）
    ・Authorityの所在確定（§5）
    ・ライフサイクル確定（§6）

A. Section Data Layer（Phase99以降）
    ・モデル定義（実装）
    ・永続化（試作スコープ内。Analysis Editor Session内）
    ・Undo対応

B. Section Editor
    ・作成・リネーム・複製・並べ替え・削除

C. Timeline Playback
    ・セクション表示・オートスクロール・現在Section表示
      （演奏モードのB4改善とも関連が深い領域）

D. Section Analysis（自動検出・任意）
    Phase1: コード進行の一致による候補生成（現実的・依存追加なし）
    Phase2: ビート情報（timing.js既存資産）による境界補正（現実的）
    Phase3: 音響特徴量（クロマ/MFCC等）による類似検出
      → ブラウザ内Vanilla JSでは非現実的。実施する場合は
        tools/配下に新しいPython解析ステップを追加する必要があり、
        ChordMini APIとは別の依存が増える。着手優先度は最も低い。
```

S → A → B が完了した時点で、当初の不満（構造が見える・複製が楽）は
ほぼ解消される想定。C・Dは価値を積み増す拡張という位置づけ。

---

## 8. アーキテクチャへの影響範囲（見積もり・実装時に反映）

着手する場合、以下に影響が及ぶ規模であることを認識しておく。
architecture.mdへの実際の反映はPhase99（実装）着手時に行う
（Phase98時点では洗い出しのみ・architecture.md自体は更新対象外）。

```
architecture.md
  §3  JSモジュール構成（新規モジュールが必要になる可能性）
  §4  状態管理（Analysis Editor Session構造の拡張）
  §9  Chart Mode timing pipeline（Sectionの描画層の追加）
  §11 Project Repository Architecture（将来の永続化スキーマ拡張。
       Phase98時点ではAuthority Scope外のため影響なし）
  §12 Analysis Editor Architecture（Sectionとselectionの関係整理）
  §13 Authority Index（Sectionの新規Authority登録。§5のScope表現に従う）
```

---

## 9. 経緯・議論ログ（要約）

```
発端: 演奏モードのオートスクロール改善（Phase94 B4）についての
      雑談から、「コードの長さを視覚化したい」という話に発展

議論の流れ:
  1. 「セクション単位で編集できたら楽」という着想
  2. 波形/音響解析による自動セクション化の技術的検討
     （ChatGPT: 可能だが完全自動は難しい、候補生成は現実的）
  3. Claude: 本体（Section層）とおまけ（自動検出）の切り分けを提案
  4. ChatGPT: Sectionは「データモデル」であるべき、
     時刻参照ではなくchordId参照にすべきと指摘
  5. Claude: chordId参照が正しい技術的根拠を補強
     （既存のselection.chordIds設計との一貫性）
  6. ChatGPTとの往復で「責務の先行定義」「count vs IDペア」
     「境界コード増減ルール」が論点として浮上
  7. 「正本問題（project.lines vs analysisEditor.buffer）」は
     既存ロードマップ最上位の「Chart Modeと通常モードのシステム統合」
     と同一の論点であることが判明
  8. たかっち: 一度に全部決めず、専用ファイルを作って
     少しずつ詰めていく方針に決定（本ファイル起票）

Phase98（仕様固定フェーズ）:
  9. 境界コード増減ルールを確定（内部追加は自動包含／境界削除は
     隣接コードへ付け替え／0コードでSection自体を削除）
  10. Authority Scopeの表現をChatGPTが再検討: 「bufferが正本」では
      なく「Analysis Editor Sessionに限定されるAuthority」という
      理由付けにすることで、将来Project Repositoryへ昇格する際の
      文書の書き直しコストを下げる、という判断に至った
  11. ライフサイクル仕様（生成・更新・削除、暗黙削除のUndo扱い）を確定
  12. 「Section設計の正本（document authority）をsection-model.mdへ
      集約する」という運用方針を確立。ただし「唯一の参照先」とまでは
      書かず、「設計判断を集約する設計ドキュメント」という表現に調整
      （architecture.mdとの役割分担を壊さないため）
  13. Phase98終了後のドキュメント影響確認を実施
      （README不要／architecture.md対象外／phase-status・
      current-issues.md更新。詳細はhandover_phase98.md参照）
  14. ChatGPTの最終レビューを反映: (a) [SECTION INVARIANTS]を新設
      （既存の[BOUNDARY INVARIANT]等と同じ役割）、(b) `id`フィールドに
      「Section Identity」という意味を明記（project.id/chord._idと
      同じIdentity思想の踏襲）、(c) §6 Updateの記述を「責務は確定・
      具体的なAPI設計はPhase99」という形まで踏み込んで整理
```

---

## 10. 次にこのメモを開く時にやること

- [ ] Phase99着手時、§8の影響範囲を実際にarchitecture.mdへ反映する
- [ ] Section Session Layerの実装方針（historyの扱い・Command Layer
      との関係）を§6「更新」の未確定部分に沿って設計する
- [ ] B（Section Editor）着手前に、UI設計（作成・リネーム・複製・
      並べ替え・削除の操作フロー）を別途詰める
