# ChordScore Phase21 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase20（mainへ統合済み）

## 現在の作業ブランチ
phase21-（未定）

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
  perform.js / replace.js / tapmode.js
serve.py（ローカル開発サーバー・no-store設定済み）
```

---

## Phase20で完了した作業

| 内容 | 詳細 |
|---|---|
| `normalizeChordName(raw)` 追加 | lookup専用。alias table（maj7系・min系）＋Unicode正規化（NFKC・♭→b・♯→#・△→M）。slash chord は `G/B` のまま返す |
| `findChord(raw)` 追加 | CHORD_DB直参照の代替窓口。内部で `normalizeChordName()` 経由でlookup。slash fallback付き |
| builtin重複エントリ削除 | `CM7`/`DM7`/`EM7`/`FM7`/`GM7`/`BM7` を削除（`Xmaj7` に統一）。`Amaj7` は重複なしのためそのまま |

---

## Phase20で確定した設計方針

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

suffix lookupは**完全一致**（case-insensitiveは廃止済み・`m7`/`M7`事故防止のため）

### lookup原則

- `CHORD_DB[name]` 直参照は禁止
- `findChord(raw)` のみ使用（Phase21で既存lookup系を順次移行）

### storage migration

- Phase20時点では**未実施**（lookup layer導入のみ）
- normalize仕様の実運用確認後、Phase22以降でcleanup migration v3を実施予定

---

## Phase20未実施・継続事項

| 内容 | 状態 |
|---|---|
| `lookupChord()` / `CHORD_DB` 直参照の `findChord()` への移行 | **Phase21メイン作業** |
| `normChord()` 廃止 | 使用箇所移行完了後に検討 |
| storage cleanup migration v3 | Phase22以降（normalize仕様安定確認後） |
| import時のcanonical化 | Phase22以降 |

---

## Phase21の作業内容（次フェーズ）

### 目的

Phase20で導入した `findChord()` を実際に全体へ適用し、lookup入口を統一する。

### やること

1. 既存の `lookupChord()` 内部を `findChord()` ベースに変更
2. `app.js` / `editor.js` / `perform.js` 等の `CHORD_DB[name]` 直参照を `findChord()` へ移行
3. `showDiagramPanel()` 系・chord表示系の経路確認
4. slash chord経路確認
5. import時lookup確認

### やらないこと

- storage migration（Phase22以降）
- `normChord()` 廃止（移行完了確認後）
- display style layer（将来フェーズ）
- ChordToken / parser化（将来フェーズ）

---

## Phase19で確定した設計方針（継続）

### storage / runtime 分離

| 層 | schema | 役割 |
|---|---|---|
| storage | `{ version:2, chords: { chordKey: [{ id, n, f, b?, _custom }] } }` | 永続化・Undo対象 |
| runtime | `{ n, f, b?, _custom, _id }` | 描画専用・軽量 |

- `_id`（runtime）= `id`（storage）の対応
- runtime は storage から完全再構築（merge禁止）
- save → loadCustomDiagrams() → render の順を厳守

### id設計

| 種別 | id形式 |
|---|---|
| migration済みlegacyデータ | `legacy-{chordKey}-{n}-{JSON.stringify(f)}` |
| 新規登録 | `crypto.randomUUID()` |

**注意**：legacy idはn・fに依存しているため、編集後にidと内容がズレる可能性がある（Phase21以降でのid設計見直し案件）

### UI再描画ルール

```
操作（add / edit / delete / import）
  → saveCustomDiagrams()
  → refreshDiagrams()
      ├─ loadCustomDiagrams()   ← clear→rebuild
      ├─ showDiagramPanel()     ← DOM完全再生成
      └─ undoBtn活性更新
```

### callbacks設計（showDiagramPanel）

```js
showDiagramPanel(chord, capo, { onEdit, onDelete })
```

- callbacksなし（省略時）→ ボタン非表示（既存呼び出し互換）
- `getDiagCallbacks()` でapp.js側から注入
- builtin variantは `_id` なし → ボタン非表示

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

**container ownership原則**

- typography・color → role class所有
- spacing → container所有（原則）
- ただしfield-label等の局所contextではrole spacing許容

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

## 今後のTODO

| フェーズ | 内容 |
|---|---|
| Phase21（次） | lookup統合（`findChord()` への全面移行） |
| Phase22以降 | storage cleanup migration v3 |
| 観測継続 | modal-input-row gap variant（compact/wide）の確定 |
| 観測継続 | modal action button hierarchy（font-size系） |

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
| ダイアグラム戻すボタン改善：Ctrl+Zショートカット化 + 編集タブ内プルダウンメニュー（元に戻す/やり直し）に変更 | 未着手 |
| 左右パネルの折りたたみ（表示/非表示）対応・中央パネル優先レイアウト | 未着手 |
| A4印刷対応 | 未着手 |
| CHORD MINIのJSONファイル取得（Python）をアプリに統合 | 未着手 |
| 通常モードのTAPボタン削除 | 未着手（TAPモードおよびJSON自動読み込みと機能重複のため） |
| addChordモーダルでコードに繰り返し記号を追加できるようにする | 未着手 |
| mp3波形表示 | 未着手 |
| ChordMini Beat/Grid情報対応（#26）：chordmini_fetch.py を拡張し、beat/grid情報も取得。grid表示生成またはコード取り込み精度向上に活用 | 調査・設計中 |

### #12 JSONコード自動登録 — 将来改善候補

**思想**：#12 は「完成譜面自動生成」ではなく「編集ベースを高速生成する補助機能」として位置づける。シンコペーションや細かなコード位置は人間が修正する前提。

**現状の限界**：chordmini JSONには小節構造・拍位置・コードチェンジ位置の情報がないため、行内のどこでコードが変わるかは再現できない。精度100%より「修正コストを下げる」方向のROIが高い。

| 候補 | 内容 |
|---|---|
| 行内コード移動の軽量化 | ドラッグ並び替え、←→ボタン、前後入替、行跨ぎ移動 |
| 小節線補助 | 自動小節線候補、4拍グリッド表示、拍区切りガイド |
| import後補正UI | 「全体を前へ1行」「全体を後ろへ1行」「コード密度を均す」など |
| chord duration活用 | 次timestampとの差分でコード保持長・拍長推定へ発展（#26と連携予定） |

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

#### カスタムダイアグラムid設計の将来課題（Phase21以降）

- 現状のlegacy idは `n`（label）と `f`（frets）に依存しており、編集後にidと内容がズレる
- 将来的には完全ランダムUUID or コンテンツhashに移行推奨

---

## theme.css の設計原則（重要）

```
Primitive層  → 値の部品（数値・色）。直書きOK・必須
Semantic層   → 意味を持つ値。テーマで上書き。直書きOK・必須
Component層  → var()だけ使う。直書き禁止
```

### 層責務の確定（設計ルール）

| 層 | 責務 | 直書きOK? |
|---|---|---|
| Primitive | 値のみ（px・色） | ✅ |
| Semantic | 意味の定義・テーマ差分 | ✅（値のみ） |
| Component | var()のみで見た目構築 | ❌ |
| Theme override | Semantic差し替えのみ | ❌ |
| Mode override | Semantic差し替えのみ | ❌ |
| Instance | JS一時状態のみ（display/transform等） | ✅ |

### 編集ガイド（theme.css内にも記載済み）

| タグ | 意味 |
|---|---|
| `[SAFE]` | 値を自由に変えてよい |
| `[STRUCTURE]` | var()構造を維持。プロパティ削除禁止 |
| `[DANGER]` | 依存関係あり。DevTools確認必須 |

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

このプロンプトを新しいチャットの最初に貼り付けてください。最新の `chords.js` も一緒に添付すると作業をすぐ再開できます。
