# 引き継ぎ: Phase44進行中 — semantic/state stabilization

## 作業状態
- ブランチ: phase42-design（継続）
- 直前作業: Phase44 Step1〜Step2.5 完了

---

## Phase44 の成果

### Step1: undo / contamination audit（完了）

| 対象 | 内容 |
|---|---|
| app.js importUndoStack | DESIGN CONSTRAINT コメント追加（capo destructive model との制約・analysis.raw 保護確認） |
| app.js offset:0 | NOTE [LEGACY-RESIDUE] コメント追加（Issue #26 との関連を記録） |
| architecture.md §8 | カポ設計の移行状態を文書化（旧方式/新方式/既知の制約/移行方針） |

**確立した事実:**
- `analysis.raw` は全経路で実音canonical として保護されている ✅
- editor 側はまだ destructive capo model（設計移行途中・debt として記録）

---

### Step2: N.C. token semantic化（完了）

#### 確定した設計

```
入力:  N / NC / N.C. / (N.C) / (N.C.) → 正規化して判定
  ↓ chordEntry.js の isNoChordInput() で変換
store: { type: 'no_chord' }  （文字列保存禁止）
  ↓ tokenToText() で変換
render: 'N.C.'
```

#### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| tokens.js | isNoChordToken() 追加 / tokenToText() に N.C. 対応追加 |
| chordEntry.js | normalizeNoChordInput() / isNoChordInput() helper 追加 / addChord() no_chord 分岐 / renderModalPreview() tokenToText 経由 / input preview guard |
| app.js | isNoChordToken import / loadChordData() パレットフィルタ（(N.C)も吸収） / importChordsFromJson() no_chord token 化 / capo change に isNoChordToken guard / loadProj() TOKEN MIGRATION 追加 / loadProj() 末尾 autoSaveLocal() / resetProject() で _prevCapo=0 リセット |
| perform.js | isNoChordToken/isChordToken/tokenToText import 追加 / renderPerformLines() no_chord・isChordToken 対応 |
| tapmode.js | isNoChordToken/tokenToText import 追加 / renderTovLines() tokenToText 経由に統一 |

#### 修正したバグ

1. **モーダル内で N.C. が表示されない** → renderModalPreview() の c.chord 直参照を tokenToText() に修正
2. **(N.C) がカポ移調される** → isNoChordToken guard 追加 + import時のnormalize強化（括弧対応）
3. **LocalStorage復元で旧形式 (N.C) が残存** → loadProj() に TOKEN MIGRATION 追加
4. **復元後カポ変更でコードが崩れる** → resetProject() で _prevCapo=0 リセット漏れを修正

---

### Step2.5: c.chord 直参照 audit（完了）

#### Audit 結果

```
tokens.js      ✅ 問題なし
chordEntry.js  ✅ 問題なし（normalizeNoChordInput で統一済み）
tapmode.js     ✅ 修正済み（tokenToText 経由）
perform.js     ✅ 修正済み（isChordToken 判定に変更）
app.js         ✅ migration 内は意図的参照 / capo guard 済み
modals.js      ✅ c.chord 直参照なし
chords.js      ✅ 引数の string 比較（token と無関係）
replace.js     ✅ 検索比較は仕様上正しい（no_chord は undefined で不一致になる）

editor.js      ⚠️ 以下2箇所が残存（意図的）:
  onChordDblClick(idx, ci, c.chord)  → lookup key として渡す（app.js側でguard）
  onChordHover(c.chord, tag)         → lookup key として渡す（app.js側でguard）
  insertSep.title → tokenToText(c) に修正済み ✅
```

#### 確立した責務分離原則

```
semantic      用途                    使用値
──────────────────────────────────────────────────
display       DOM表示                 tokenToText(c)
lookup        CHORD_DB 検索           c.chord（raw）
transpose     移調対象判定            isChordToken(c) で判定してから c.chord
serialize     保存                    token object そのまま
```

#### 残っている既知の debt

```
editor.js の onChordDblClick / onChordHover が c.chord を渡している
→ app.js 側の lockDiag / updateDiagRight が if(!chord)return で guard されているため現在は安全
→ 将来: isChordToken(c) ? c.chord : null で渡す方が明示的
→ Step3 token taxonomy audit 時に再検討
```

---

## Token taxonomy 確定（Step2完了時点）

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

---

## Phase44 残タスク

### Step3: token taxonomy audit（次チャット）

ChatGPTの推奨内容に基づく作業スコープ:

```
1. tokens.js ヘッダーコメントに各 token の semantic 定義表を追加
   - display semantic
   - lookup semantic
   - transpose semantic
   - serialize semantic

2. architecture.md に「display / lookup / transpose / serialize 責務分離」を追記

3. c.chord 直参照が残っている箇所に
   用途コメントを統一（lookup key として意図的に使っている箇所）

4. editor.js の onChordHover / onChordDblClick に
   app.js 側での isChordToken guard の必要性をコメントで明記
```

**実装変更は最小限（コメント・ドキュメント中心）**
token schema の構造変更はしない方針。

### Step4: projection responsibility comment 整備

```
editor.js / perform.js / chartmode.js の3箇所に分散している
capo display projection の NOTE コメントを統一整備する。

「今 helper 化しない理由」も明文化:
  Nashville / Roman numeral / slash bass / simile 等
  projection semantic がまだ増える段階なので
  今 helper 化すると abstraction が早すぎる
```

---

## 次チャット開始時に渡すファイル

- handover_phase44.md（このファイル）
- tokens.js（最新版）
- editor.js（最新版 ← アップロードされたもの。Step2.5の修正を適用する必要あり）
- app.js（最新版）
- architecture.md（最新版）
- プロジェクトファイル群（phase-status.md / current-issues.md 等）

**注意: editor.js は次チャットで Step2.5 の修正を適用してから Step3 に入ること**
（insertSep.title の tokenToText 化・コメント追加）

---

## 運用ルール（変わらず）

- 通常はファイル出力不要。変更内容とdiffのみ提示
- 変更後の関数全体を必ず出すこと（diffだけ避ける）
- ファイル出力は明示があった時のみ
- Phase完了時に commit message 案をまとめる
- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
