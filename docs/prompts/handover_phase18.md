# ChordScore Phase18 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase17（mainへ統合済み）

## 現在の作業ブランチ
phase18-（未定）

index.html
css/
  base.css      ← Phase17で新規追加
  theme.css
  layout.css
  components.css
  perform.css
  state.css
js/
  app.js / editor.js / chords.js / audio.js
  perform.js / replace.js / tapmode.js
```

---

## Phase17で完了した作業

- `base.css` 導入（`*` / `html` / `body` を theme.css から分離）
- `openAddDiagramModal` 注意書き文言修正（「ブラウザを閉じるまで」→「ブラウザのローカルストレージに保存されます」）

### CSS ロード順（確定）

```html
base.css → theme.css → layout.css → components.css → perform.css → state.css
```

### base.css 責務（確定）

| ファイル | 内容 |
|---|---|
| base.css | `*` reset / `html` / `body` のみ。var()不使用が理想だが、CSSカスタムプロパティはcomputed-value時に解決されるため現状のvar()参照は実害なし |
| theme.css | scrollbar含むすべてのthemed visual surface |

---

## Phase16で確定した設計方針（継続）

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

「保留」はすべて理由付き。取りこぼしではない。

---

## 今後のTODO

| フェーズ | 内容 |
|---|---|

| 観測継続 | modal-input-row gap variant（compact/wide）の確定 |
| 観測継続 | modal action button hierarchy（font-size系） |

---

## バックログ

気づいたタイミングで追記する。Phaseクローズ時に次Phaseへ上げるか判断する。

### バグ

| 内容 | 備考 |
|---|---|
| localStorageに保存したコードダイアグラムが表示されない | 再現条件不明 |
| Blueテーマ演奏モードの閉じるボタン：ホバー時に文字が埋もれる | `--surface-btn-close` 関連の可能性 |

### 機能追加

| 内容 | 状態 |
|---|---|
| コードパレットの移調ボタン | 未着手 |
| A4印刷対応 | 未着手 |
| CHORD MINIのJSONファイル取得（Python）をアプリに統合 | 未着手 |
| コード名の全角→半角正規化（検索・保存時） | 仕様確定済み（下記参照） |
| 通常モードのTAPボタン削除 | 未着手（TAPモードおよびJSON自動読み込みと機能重複のため） |
| addChordおよび中央パネルのコード編集：行頭・途中へのコード挿入対応 | 未着手（現状は行末追加のみ） |
| mp3波形表示 | 未着手 |

### 仕様確定済み・未実装

#### ⑫ コードダイアグラム拡張

- 編集・削除対象：既存バリアント（ロー・バレー等）もカスタム登録も両方対象
- UI：バリアントカードにホバーで右上に ✏️ 🗑 ボタン
  - ✏️ → 手動登録と同じ入力フォームでフレット値を編集
  - 🗑 → 確認なしで即削除（バリアントが0になったらDBから除去）
- 変更はlocalStorageに自動保存（既存の永続化の仕組みを使う）
- カスタムダイアグラムのJSONエクスポート・インポート機能

#### ⑭ JSONタイムスタンプからコード自動登録

- 次の行のタイムスタンプまでの間のコードをその行に並べる
- タイムスタンプなし行は全行均等割りで時刻を自動計算して割り当て
- 既存コードがある行は上書き確認ダイアログ（一括で「上書きしますか？」）

#### ⑪ プロジェクトライブラリ

- 初回起動時にライブラリフォルダを選択（File System Access API）
- 以降は自動でそのフォルダを参照、設定から変更可能
- フォルダ内の `.json` を自動スキャンして一覧化
- UI：ヘッダーに「📚 ライブラリ」ボタン → フルスクリーンモーダル
- 表示項目：曲名・アーティスト・Key・BPM・拍子・行数・最終保存日時
- 操作：開く・削除・リネーム・複製
- 左パネルにアーティスト名・拍子（beats）入力欄を追加
- JSONへの追加フィールド：`title` / `artist` / `key` / `tempo` / `beats`

#### コード名正規化仕様

- 検索前・保存時にコード名を正規化する
- 正規化内容：全角英数字→半角 / 全角＃→# / 全角♭→b / 前後空白削除
- chord_dbのキーは半角前提のまま変更なし
- 既存のコード表示・ダイアグラム取得処理に影響を出さない

### リポジトリ整理

フォルダ構造の重複問題（優先度低・混乱防止のため記録）

| 問題 | 内容 |
|---|---|
| backup が2箇所 | `backup/` と `resource/backup/` |
| screenshot が2箇所 | `backup/スクリーンショット/` と `resource/screenshot/` |
| `tmp` と `archive` の役割が曖昧 | 用途を明文化するか統合する |

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

---

## 開発環境

Windows / Python 3.11 / VSCode / GitHub Pages（`github.com/Minokichi1107/CreateChordScore`）

---

このプロンプトを新しいチャットの最初に貼り付けてください。最新の `theme.css` も一緒に添付すると作業をすぐ再開できます。
