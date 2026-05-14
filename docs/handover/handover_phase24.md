# ChordScore Phase24 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase24（mainへ統合済み）

## 現在の作業ブランチ
phase25-（未定）

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
serve.py（ローカル開発サーバー・no-store設定済み）
```

---

## Phase21〜24で完了した作業

| Phase | 内容 |
|---|---|
| Phase21 | `lookupChord()` を `findChord()` への互換ラッパーに変更（lookup入口統一） |
| Phase22 | storage canonical化（v2→v3 migration）。`CM7`→`Cmaj7`、`B７sus4`→`B7sus4` 等。migration前に `cs_customDiags_backup_v2` を自動保存 |
| Phase23 | import時のcanonical化。`loadChordData()` と `importCustomDiagrams()` で `normalizeChordName()` を適用 |
| Phase24 | `normChord()` 廃止。`parseCSV` の第2引数を `normalizeChordName` に統一 |

### バグ修正（同セッション内）

| 内容 |
|---|
| `custom-add` の `addChordToLine(val)` → `handleAddChordToLine(val)` に修正 |
| ダイアグラム追加モーダルの upsert 挙動を修正（ポジション名一致で上書きされていた問題）→ 常に新規 id で push |

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

---

## 確定した設計方針

### canonicalization layer

```
入力ゆれ → normalizeChordName() → canonical string → CHORD_DB lookup
```

- canonical = `Cmaj7`（`CM7` / `C△7` / `CMaj7` はalias）
- `m7` と `M7` は**別物**（case-sensitive・完全一致）
- enharmonic（`C#` / `Db`）は**統合しない**
- slash chord は canonical string のまま（`G/B`）。storageKey escape（`__SLASH__`）は既存実装踏襲
- displayName分離・ChordToken object化は将来フェーズ

### alias table（_SUFFIX_ALIAS）

```js
const _SUFFIX_ALIAS = {
  'maj7': 'maj7', 'M7': 'maj7', 'Maj7': 'maj7',
  'min': 'm', 'mi': 'm', 'minor': 'm',
  'min7': 'm7', 'mi7': 'm7', 'minor7': 'm7',
};
```

### storage schema（v3）

```js
{ version: 3, chords: { chordKey: [{ id, n, f, b?, _custom }] } }
```

- `chordKey` は canonical key（`__SLASH__` エスケープ済み）
- runtime は storage から完全再構築（merge禁止）

### lookup原則

- `CHORD_DB[name]` 直参照（read）は禁止
- `findChord(raw)` のみ使用
- `CHORD_DB[name]` の write操作（ダイアグラム登録・削除）は対象外

---

## Phase24未実施・継続事項

| 内容 | 状態 |
|---|---|
| legacy id設計見直し | Phase25以降（現状のlegacy idはn・fに依存しており編集後にズレる可能性あり） |
| storage cleanup migration v3の実運用確認 | 継続観測中 |
| import時のcanonical化（csvImporter.js内） | Phase23で `normalizeChordName` 経由に統一済み |

---

## 次フェーズ予定

| フェーズ | 内容 | 優先度 |
|---|---|---|
| Phase25（次） | 演奏モードのヘッダーにカポ番号表示（Phase12相当） | 高 |
| Phase26以降 | 右パネルにプロジェクトDBライブラリタブ追加 | 中 |
| Phase26以降 | base.css導入（body・scrollbarをtheme.cssから分離） | 中 |
| 将来 | legacy id設計見直し | 低 |

---

## バックログ

### バグ

| 内容 | 備考 |
|---|---|
| Blueテーマ演奏モードの閉じるボタン：ホバー時に文字が埋もれる | `--surface-btn-close` 関連の可能性 |

### 機能追加

| 内容 | 状態 |
|---|---|
| コードパレットの移調ボタン | ✅ 完了（Phase18） |
| addChordおよび中央パネルのコード編集：行頭・途中へのコード挿入対応 | ✅ 完了（Phase18） |
| JSONコード自動登録（#12） | ✅ 完了（Phase18） |
| カスタムダイアグラム編集・削除・Undo・export/import（#14） | ✅ 完了（Phase19） |
| コード名正規化パイプライン（normalizeChordName・findChord・builtin cleanup） | ✅ 完了（Phase20） |
| lookup統合・storage canonical化・import canonical化・normChord廃止 | ✅ 完了（Phase21〜24） |
| 演奏モードのヘッダーにカポ番号表示 | 未着手 |
| ダイアグラム戻すボタン改善：Ctrl+Zショートカット化 + 編集タブ内プルダウンメニュー（元に戻す/やり直し）に変更 | 未着手 |
| 左右パネルの折りたたみ（表示/非表示）対応・中央パネル優先レイアウト | 未着手 |
| A4印刷対応 | 未着手 |
| CHORD MINIのJSONファイル取得（Python）をアプリに統合 | 未着手 |
| 通常モードのTAPボタン削除 | 未着手（TAPモードおよびJSON自動読み込みと機能重複のため） |
| addChordモーダルでコードに繰り返し記号を追加できるようにする | 未着手 |
| mp3波形表示 | 未着手 |
| ChordMini Beat/Grid情報対応（#26）：beat/grid情報も取得、grid表示生成またはコード取り込み精度向上に活用 | 調査・設計中 |

### 仕様確定済み・未実装

#### ⑪ プロジェクトライブラリ

- 初回起動時にライブラリフォルダを選択（File System Access API）
- 以降は自動でそのフォルダを参照、設定から変更可能
- フォルダ内の `.json` を自動スキャンして一覧化
- UI：ヘッダーに「📚 ライブラリ」ボタン → フルスクリーンモーダル
- 表示項目：曲名・アーティスト・Key・BPM・拍子・行数・最終保存日時
- 操作：開く・削除・リネーム・複製
- 左パネルにアーティスト名・拍子（beats）入力欄を追加
- JSONへの追加フィールド：`title` / `artist` / `key` / `tempo` / `beats`

#### カスタムダイアグラムid設計の将来課題

- 現状のlegacy idは `n`（label）と `f`（frets）に依存しており、編集後にidと内容がズレる
- 将来的には完全ランダムUUID or コンテンツhashに移行推奨

### 将来課題

| 内容 | 備考 |
|---|---|
| メタリックテーマ描画方式の見直し（#27） | 多段gradient・filter等のGPUコスト増加対策。「単純UI→CSS／複雑質感→テクスチャ」分離を検討。https://github.com/Minokichi1107/CreateChordScore/issues/27 |
| 転回形・inversion自動ダイアグラム生成 | slash chord（Bm/3等）を文字列保持のみ。将来的にparser層・generator層を導入予定。storage・lookup設計には影響を与えない独立拡張領域。Phase C以降。 |

---

## Phase16〜17で確定した設計方針（継続）

**JS Component層のCSS ownership ルール**

| 種類 | 所有 |
|---|---|
| layout / spacing / typography / semantic color / component visual | CSS |
| state-derived geometry / runtime position / 計算値 | JS |

**抽象化判断基準**

- 3箇所以上で再利用
- semantic説明可能
- 「共通化可能」ではなく「共通化圧力が存在する」を基準にする

---

## 現在のinline style残存状況

### 静的HTML側

```
① JS state（残して良い）
   display:none / display:flex（JS制御）

② 意図的残存
   .capo-row margin-top:5px / 3px（2件・値に意味差なし）
   .pbody padding-bottom:5px（1件）
   spacer div flex:1（1件）
```

### JS動的UI側（意図的保留）

| 対象 | 保留理由 |
|---|---|
| modal-input-row gap（6px/8px/14px） | compact/wide variant観測不足 |
| ボタン font-size系（13px等） | modal action hierarchy未定義 |
| modal-surface-area（mac-preview / copy元） | semantic role未確定 |
| reload-banner | 単発・局所 |
| mac-preview-tag-del hover red | runtime interaction state・JS残留 |
| repeat-badge inline style | editor.js内・JS生成 |

---

## theme.css の設計原則（重要）

```
Primitive層  → 値の部品（数値・色）。直書きOK・必須
Semantic層   → 意味を持つ値。テーマで上書き。直書きOK・必須
Component層  → var()だけ使う。直書き禁止
```

### token追加条件（厳守）

以下をすべて満たした時のみtoken化：
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
ローカルサーバー：`python serve.py`（Cache-Control: no-store）

---

このプロンプトを新しいチャットの最初に貼り付けてください。必要に応じて最新の `chords.js` / `app.js` も一緒に添付すると作業をすぐ再開できます。
