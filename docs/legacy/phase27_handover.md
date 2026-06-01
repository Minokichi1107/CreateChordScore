# ChordScore Phase27 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase26（mainへ統合済み）

## 現在の作業ブランチ
phase27

index.html
css/
  base.css
  theme.css
  layout.css
  components.css
  perform.css
  state.css
js/
  app.js / editor.js / chords.js / audio.js
  perform.js / replace.js / tapmode.js / csvImporter.js
server.py（ローカル開発サーバー・no-store設定済み・ポート8767）
```

---

## Phase21〜26で完了した作業

| Phase | 内容 |
|---|---|
| Phase21 | `lookupChord()` を `findChord()` への互換ラッパーに変更（lookup入口統一） |
| Phase22 | storage canonical化（v2→v3 migration）。`CM7`→`Cmaj7`、`B７sus4`→`B7sus4` 等。migration前に `cs_customDiags_backup_v2` を自動保存 |
| Phase23 | import時のcanonical化。`loadChordData()` と `importCustomDiagrams()` で `normalizeChordName()` を適用 |
| Phase24 | `normChord()` 廃止。`parseCSV` の第2引数を `normalizeChordName` に統一 |
| Phase25 | 左パネル折りたたみ（VSCode型アイコンバー）・右パネルレスポンシブ非表示（900px以下） |
| Phase26 | CHORD_DB access layer導入。`lookupChord()`を`findChord()`ラッパーに統一（26-A）。`getChordEntry` / `ensureChordEntry` / `addCustomDiagram` / `removeCustomDiagram` / `updateCustomDiagram` を `chords.js` に追加（26-B）。`app.js` の `CHORD_DB[]` 直参照ゼロ化（26-C） |

### バグ修正（Phase21〜26セッション内）

| 内容 |
|---|
| `custom-add` の `addChordToLine(val)` → `handleAddChordToLine(val)` に修正 |
| ダイアグラム追加モーダルの upsert 挙動を修正（常に新規 id で push） |

---

## 現在の canonical 化レイヤー構成（重要）

```
入力（raw）        CM7 / C△7 / Ｂ♭ｍ７ 等
        ↓
normalizeChordName()   唯一の正規化ルート
        ↓
canonical key      Cmaj7 / Bbm7 等
        ↓
findChord()        CHORD_DB lookup
        ↓
storage v3         canonical keyで保存
```

- **rawはUIレイヤーで保持**（プロジェクトファイルのコード名は変換しない）
- **storage・lookup・importはすべてcanonical経由**
- `normChord()` は廃止済み（Phase24）
- `app.js → CHORD_DB 直参照ゼロ`（Phase26）

---

## CHORD DB access layer 構成（Phase26追加）

```js
// Read API（chords.js）
getChordEntry(name)      // canonical化→CHORD_DB参照→{name, data} | null
ensureChordEntry(name)   // なければ空entry { v:[] } を作成して返す

// Mutation API（chords.js）
addCustomDiagram(name, variant)
removeCustomDiagram(name, id)
updateCustomDiagram(name, id, patch)
```

- `CHORD_DB` への直参照はこの層のみに限定
- `getChordEntry()` は read-only（mutation禁止）
- `ensureChordEntry()` は existence guarantee のみ（save・merge・補完なし）

---

## Phase27 タスク：canonical invariant 修復

### 背景・audit結果

Phase26完了後のauditで以下3経路にnormalize未適用が判明：

| 経路 | 問題 |
|---|---|
| `loadCustomDiagrams()` | `diagKeyDecode` 後に `normalizeChordName` 未通過 |
| `migrateCustomDiagrams()` | v1→v2 migration時にkey未normalize |
| `importCustomDiagrams()` | JSONのkeyを直接localStorageに書き込み |

### 実装方針

**merge dedup条件**
```
同一とみなす = _id一致 OR fingerprint一致
fingerprint = `${n}|${f.join(',')}|${b ?? ''}`
```

**loadCustomDiagrams の修正内容**
```
storage読み込み
↓
key を diagKeyDecode → normalizeChordName
↓
canonical keyへ統合（dedup適用）
↓
CHORD_DB再構築
↓
repairedフラグがtrueの時のみ saveCustomDiagrams()
```

repaired = true になる条件：
- key変更（canonical化）が発生
- merge発生
- dedup発生

**migrateCustomDiagrams の修正内容**
rawK に `normalizeChordName(diagKeyDecode(rawK))` を適用

**importCustomDiagrams の修正内容**
JSONのkey normalize・dedup適用

### まだやらない
- variation schema変更
- slash chord policy
- storage version bump

---

## Phase25 レイアウト設計

### パネル構成

| 状態 | 左パネル | 中央 | 右パネル |
|---|---|---|---|
| 通常 | minmax(200px,260px) | minmax(200px,1fr) | minmax(0,261px) |
| 折りたたみ時 | 32px | minmax(200px,1fr) | minmax(0,261px) |
| 幅900px以下 | 通常 or 折りたたみ | 1fr | 非表示 |

---

## バックログ

### バグ

| 内容 | 備考 |
|---|---|
| 左パネル折りたたみ時にヘッダーのボタンが見切れる | grid列が32pxに縮んだ際にheader側のflex幅計算がずれている可能性。Phase25関連。要修正 |
| Blueテーマ演奏モードの閉じるボタン：ホバー時に文字が埋もれる | `--surface-btn-close` 関連の可能性 |
| プロジェクトロード時に audio / chord_source が自動復元されない（#29） | リロードバナーからの手動再読み込みが必要。chord_source未読込時はダイアグラム欠落（Am7/D, G/D, Bm/F#で確認）。https://github.com/Minokichi1107/CreateChordScore/issues/29 |

### 機能追加

| 内容 | 状態 |
|---|---|
| コードパレットの移調ボタン | ✅ 完了（Phase18） |
| addChordおよび中央パネルのコード編集：行頭・途中へのコード挿入対応 | ✅ 完了（Phase18） |
| JSONコード自動登録（#12） | ✅ 完了（Phase18） |
| カスタムダイアグラム編集・削除・Undo・export/import（#14） | ✅ 完了（Phase19） |
| コード名正規化パイプライン（normalizeChordName・findChord・builtin cleanup） | ✅ 完了（Phase20） |
| lookup統合・storage canonical化・import canonical化・normChord廃止・CHORD_DB access layer導入 | ✅ 完了（Phase21〜26） |
| 左パネル折りたたみ・右パネルレスポンシブ非表示 | ✅ 完了（Phase25） |
| 演奏モードのヘッダーにカポ番号表示 | 未着手 |
| ダイアグラム戻すボタン改善：Ctrl+Zショートカット化 + 編集タブ内プルダウンメニュー | 未着手 |
| A4印刷対応 | 未着手 |
| CHORD MINIのJSONファイル取得（Python）をアプリに統合 | 未着手 |
| 通常モードのTAPボタン削除 | 未着手 |
| addChordモーダルでコードに繰り返し記号を追加できるようにする | 未着手 |
| mp3波形表示 | 未着手 |
| ChordMini Beat/Grid情報対応（#26） | 調査・設計中 |
| キー入力機能追加 | 未着手 |
| プロジェクトファイルロード時にオーディオファイルも同時に読み込む | 未着手 |
| ヘッダーボタンの整理・プルダウンにまとめる | 未着手 |

### 仕様確定済み・未実装

#### ⑪ プロジェクトライブラリ

- 初回起動時にライブラリフォルダを選択（File System Access API）
- フォルダ内の `.json` を自動スキャンして一覧化
- UI：ヘッダーに「📚 ライブラリ」ボタン → フルスクリーンモーダル
- 表示項目：曲名・アーティスト・Key・BPM・拍子・行数・最終保存日時
- 操作：開く・削除・リネーム・複製
- 左パネルにアーティスト名・拍子（beats）入力欄を追加
- JSONへの追加フィールド：`title` / `artist` / `key` / `tempo` / `beats`

### メンテナンス

| 内容 | 状態 |
|---|---|
| リポジトリ構成整理（不要ファイル削除・`.gitignore`見直し） | 未着手 |

### 将来課題

| 内容 | 備考 |
|---|---|
| メタリックテーマ描画方式の見直し（#27） | 多段gradient・filter等のGPUコスト増加対策。「単純UI→CSS／複雑質感→テクスチャ」分離を検討。https://github.com/Minokichi1107/CreateChordScore/issues/27 |
| 転回形・inversion自動ダイアグラム生成 | slash chord（Bm/3等）を文字列保持のみ。将来的にparser層・generator層を導入予定。storage・lookup設計には影響を与えない独立拡張領域。Phase C以降。 |
| legacy id設計見直し | 現状のlegacy idはn・fに依存しており編集後にズレる可能性あり |
| 外部resource再接続設計 | project保存時はaudio/chord_sourceの参照情報のみ保持。reopen後にruntime状態が完全復元されない。将来的にfile handle保持・再接続UI・missing resource表示・custom DBとexternal DBの区別UI等を検討 |

---

## 確定した設計方針

### canonicalization layer

- canonical = `Cmaj7`（`CM7` / `C△7` / `CMaj7` はalias）
- `m7` と `M7` は**別物**（case-sensitive）
- enharmonic（`C#` / `Db`）は**統合しない**
- slash chord は canonical string のまま（`G/B`）
- `diagKeyDecode()` は storage encoding reversal のみ（canonicalize責務を持たない）
- decode → canonicalize → merge/write の順を固定

### storage schema（v3）

```js
{ version: 3, chords: { chordKey: [{ id, n, f, b?, _custom }] } }
```

### lookup原則

- `CHORD_DB[name]` 直参照（read）は禁止
- `findChord(raw)` のみ使用
- `app.js → CHORD_DB 直参照ゼロ`（Phase26達成）

### collision policy（Phase27確定）

- A（統合）: 両方のvariantを canonical keyにマージ
- dedup: `_id` 一致 OR fingerprint（`n|f|b`）一致でスキップ
- resave: 「実際にcanonical repairが発生した時のみ」実行

---

## theme.css の設計原則（重要）

```
Primitive層  → 値の部品（数値・色）。直書きOK・必須
Semantic層   → 意味を持つ値。テーマで上書き。直書きOK・必須
Component層  → var()だけ使う。直書き禁止
```

### token追加条件（厳守）

- 3箇所以上で再利用
- theme差分が存在、またはsemantic説明が可能
- 「共通化圧力が存在する」（共通化可能、ではない）

---

## 開発方針（厳守）

- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止
- 改善提案は後出し小出し禁止。設計段階でまとめて提示
- **アップロードされた古いファイルをベースに作業する際は、過去フェーズの修正が失われていないか冒頭で必ず確認する**

---

## 開発環境

Windows / Python 3.11 / VSCode / GitHub Pages（`github.com/Minokichi1107/CreateChordScore`）
ローカルサーバー：`python server.py`（Cache-Control: no-store・ポート8767）

---

このプロンプトを新しいチャットの最初に貼り付けてください。必要に応じて最新の `chords.js` / `app.js` も一緒に添付すると作業をすぐ再開できます。
