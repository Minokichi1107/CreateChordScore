# ChordScore Phase20 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase19（mainへ統合済み）

## 現在の作業ブランチ
phase20-（未定）

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

## Phase19で完了した作業

| 内容 | 詳細 |
|---|---|
| storage schema migration（#14） | 旧format（v/n/f/b）→ v2（version:2, chords, id付き）へ自動変換。load時にclear→rebuild方式で完全再構築 |
| カスタムダイアグラム編集UI | バリアントカードに ✏️ 🗑 ボタン（常時薄表示・_id存在で表示判定） |
| カスタムダイアグラム削除 | 即削除・localStorageへ即保存・バリアント0件でDBからエントリ除去 |
| カスタムダイアグラム編集モーダル | フレット値・ポジション名を編集可能。プレビュー付き。コード名は変更不可 |
| Undo stack | diagPushUndo / diagUndo / diagUndoSize を chords.js に実装。snapshot方式（最大10手）。「戻す」ボタンで実行 |
| export / import | カスタムダイアグラムのみJSONエクスポート・インポート。import衝突はid完全一致でskip |
| refreshDiagrams() 一元化 | loadCustomDiagrams + showDiagramPanel + undoBtn活性更新を1関数に集約 |
| serve.py キャッシュ対策 | Cache-Control: no-store に変更（no-cacheでは304が返りESモジュールが更新されない問題を修正） |
| diag-footer-subボタンレイアウト調整 | 高さ削減（padding 2px・font-size 10px）、戻すボタンmax-width:52px固定、エクスポート/インポートがflex:1で均等分割 |

---

## Phase19で確定した設計方針

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

- runtime直接操作後に再描画なしはバグの元
- merge方式（findIndex+上書き）は廃止済み

### callbacks設計（showDiagramPanel）

```js
showDiagramPanel(chord, capo, { onEdit, onDelete })
```

- callbacksなし（省略時）→ ボタン非表示（既存呼び出し互換）
- `getDiagCallbacks()` でapp.js側から注入
- builtin variantは `_id` なし → ボタン非表示

---

## Phase19で追加・変更したCSS（components.cssへ追記済み）

```css
/* ダイアグラムバリアント 編集・削除ボタン */
.dv-btn-row { display:flex; gap:4px; justify-content:flex-end; padding:2px 4px 4px; }
.dv-btn { background:none; border:1px solid var(--border-ui); border-radius:var(--r-sm);
          color:var(--text-muted); cursor:pointer; font-size:13px; opacity:0.4;
          padding:2px 5px; transition:opacity 0.15s, color 0.15s; }
.dv:hover .dv-btn, .dv-btn:focus { opacity:1; }
.dv-btn-del:hover { color:var(--color-red,#ff5c5c); border-color:var(--color-red,#ff5c5c); }

/* ダイアグラムフッター サブ行 */
#diag-footer-sub {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
#diag-footer-sub button {
  flex: 1;
  padding: 2px 4px;
  font-size: 10px;
  background: var(--surface-overlay);
  border: 1px solid var(--border-ui);
  border-radius: var(--r-md);
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1.4;
  min-width: 0;
}
#btn-diag-undo {
  flex: 0 0 auto;
  max-width: 52px;
}
#diag-footer-sub button:hover {
  color: var(--text-primary);
  border-color: var(--border-focus);
}
```

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

「保留」はすべて理由付き。取りこぼしではない。

---

## 今後のTODO

| フェーズ | 内容 |
|---|---|
| Phase20（次） | コード名正規化パイプライン（normalizeChordName・internalKey設計・migration） |
| 観測継続 | modal-input-row gap variant（compact/wide）の確定 |
| 観測継続 | modal action button hierarchy（font-size系） |

---

## バックログ

気づいたタイミングで追記する。Phaseクローズ時に次Phaseへ上げるか判断する。

### バグ

| 内容 | 備考 |
|---|---|
| Blueテーマ演奏モードの閉じるボタン：ホバー時に文字が埋もれる | `--surface-btn-close` 関連の可能性 |

※「localStorageに保存したコードダイアグラムが表示されない」はPhase19のstorage migration・clear→rebuild方式で解消済み

### 機能追加

| 内容 | 状態 |
|---|---|
| コードパレットの移調ボタン | ✅ 完了（Phase18） |
| addChordおよび中央パネルのコード編集：行頭・途中へのコード挿入対応 | ✅ 完了（Phase18） |
| JSONコード自動登録（#12） | ✅ 完了（Phase18） |
| カスタムダイアグラム編集・削除・Undo・export/import（#14） | ✅ 完了（Phase19） |
| ダイアグラム戻すボタン改善：Ctrl+Zショートカット化 + 編集タブ内プルダウンメニュー（元に戻す/やり直し）に変更 | 未着手 |
| 左右パネルの折りたたみ（表示/非表示）対応・中央パネル優先レイアウト | 未着手 |
| A4印刷対応 | 未着手 |
| CHORD MINIのJSONファイル取得（Python）をアプリに統合 | 未着手 |
| コード名の全角→半角正規化（検索・保存時） | Phase20予定（下記参照） |
| 通常モードのTAPボタン削除 | 未着手（TAPモードおよびJSON自動読み込みと機能重複のため） |
| addChordモーダルでコードに繰り返し記号を追加できるようにする | 未着手 |
| mp3波形表示 | 未着手 |

### #12 JSONコード自動登録 — 将来改善候補

**思想**：#12 は「完成譜面自動生成」ではなく「編集ベースを高速生成する補助機能」として位置づける。シンコペーションや細かなコード位置は人間が修正する前提。

**現状の限界**：chordmini JSONには小節構造・拍位置・コードチェンジ位置の情報がないため、行内のどこでコードが変わるかは再現できない。精度100%より「修正コストを下げる」方向のROIが高い。

| 候補 | 内容 |
|---|---|
| 行内コード移動の軽量化 | ドラッグ並び替え、←→ボタン、前後入替、行跨ぎ移動 |
| 小節線補助 | 自動小節線候補、4拍グリッド表示、拍区切りガイド |
| import後補正UI | 「全体を前へ1行」「全体を後ろへ1行」「コード密度を均す」など |
| chord duration活用 | 次timestampとの差分でコード保持長・拍長推定へ発展（将来） |

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

#### Phase20：コード名正規化パイプライン

**方針**：storage/runtimeのschemaは変更しない。コード名のキー自体を正規化する意味レイヤーを追加。

```
入力ゆれ → normalizeChordName() → internalKey → DB登録
internalKey → displayName() → UI表示
```

**正規化ルール（確定）**

| 変換 | 例 |
|---|---|
| maj7 → M7 | Dmaj7 → DM7 |
| maj → （削除） | Dmaj → D |
| min / minor → m | Bmin → Bm |
| 全角英数字・記号 → 半角 | Ｂ７ → B7 |
| ♭ → b | D♭ → Db |
| / → _SLASH_ | G/B → G_SLASH_B |

**重要な設計制約**
- displayNameはDBキーにしない（絶対条件）
- Phase19のstorage migrationとは独立（コード名キー自体は現状維持のまま導入）
- builtin chord との照合ロジック変更を伴うため慎重に設計する

#### カスタムダイアグラムid設計の将来課題（Phase21以降）

- 現状のlegacy idは `n`（label）と `f`（frets）に依存しており、編集後にidと内容がズレる
- 将来的には完全ランダムUUID or コンテンツhashに移行推奨
- Phase19時点では「編集後のlegacy idズレ」はPhase20以降の課題として保留

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

このプロンプトを新しいチャットの最初に貼り付けてください。最新の `theme.css` も一緒に添付すると作業をすぐ再開できます。
