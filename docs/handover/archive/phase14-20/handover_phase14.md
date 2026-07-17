# ChordScore Phase14 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase13-ui-tweak（削除済み・mainへ統合済み）

## 現在の作業ブランチ
phase14-css-architecture

index.html
css/
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

## Phase13で完了した作業

### CSS設計
- 左パネルタブ化（パレット・歌詞の2タブ）
- dark / silver / blue の3テーマ実装
- スキューモーフィックUI（メタリック質感）
- CSSリファクタリング：5ファイル分割
- **CSS変数3層構造の完成**
  - Primitive / Semantic / Component
- theme.cssに編集ガイドコメント追加（[SAFE]/[STRUCTURE]/[DANGER]）

### 旧Semantic変数の完全除去（Phase13後半）
- 旧変数体系 → 新変数体系への完全移行
- 対象ファイル：index.html / app.js / chords.js / tapmode.js / perform.css
- 残存ゼロをPowerShellチェックで確認済み

**置換対応表（完了済み）**

| 旧変数 | 新変数 |
|---|---|
| `--text` | `--text-primary` |
| `--text2` | `--text-secondary` |
| `--text3` | `--text-muted` |
| `--bg` | `--surface-base` |
| `--bg2` | `--surface-raised` |
| `--bg3` | `--surface-overlay` |
| `--bg4` | `--surface-overlay`（壊れた参照を吸収） |
| `--border` | `--border-ui` |
| `--border2` | `--border-ui-strong` |
| `--accent` | `--text-accent` |
| `--accent2` | `--text-accent2` |
| `--radius` | `--r-md` |
| `--radius2` | `--r-lg` |
| `--mono` | `--font-mono` |
| `--amber` | `--color-amber` |
| `--red` | `--color-red` |
| `--green` | `--color-green` |

### blueテーマ視認性修正
- 演奏モード「× 閉じる」ボタン：`--surface-btn-close-hover` 新設（blue: `#03386c`）
- 演奏モードコード文字：`color:#c8e4ff` 直書き → `var(--text-primary)` に変更（app.js）
- +コード・+/ ボタン：`--border-input-empty` / `--text-input-empty` 新設
  - blue: `rgba(0,28,58,.6)` / `#4a90d9`
  - dark/silver: `--border-ui` / `--text-secondary` と同値
- `#mac-sep-btn`（小節線）：layout.cssに `color: var(--text-primary)` 追加

### 機能修正
- `#diag-toggle` ボタンの幅固定（`width:135px`、左揃え）
- 演奏モードタイトル（`#perform-title`）の色を `--text-perform-title` 変数化

---

## theme.css の設計原則（重要）

```
Primitive層  → 値の部品（数値・色）。直書きOK・必須
Semantic層   → 意味を持つ値。テーマで上書き。直書きOK・必須
Component層  → var()だけ使う。直書き禁止
```

### 編集ガイド（theme.css内にも記載済み）

| タグ | 意味 |
|---|---|
| `[SAFE]` | 値を自由に変えてよい |
| `[STRUCTURE]` | var()構造を維持。プロパティ削除禁止 |
| `[DANGER]` | 依存関係あり。DevTools確認必須 |

---

## Phase13観測で判明した設計負債（Phase14資料）

Phase13後半は実質「設計観測フェーズ」となり、以下の問題構造が露出した。

### ① inline styleの残存
- `index.html` の一部ボタンにinline styleが残っている
- 例：`#btn-perform-close` のstyle属性
- CSSセレクタより優先されるため、Component層の変数が効かない原因になる

### ② テーマ別Componentオーバーライドブロックの存在
- theme.cssに `body[data-theme="blue"] .add-chord-btn { ... }` のような
  Component直接上書きブロックが存在する
- Semanticを経由せずに見た目を変えているため、設計思想と逆行している

### ③ Semantic未完成変数
- 空定義または未定義のまま参照されている変数が存在する
- 例：`--grad-play-btn` / `--grad-input-panel` / `--grad-tabs` 等

### ④ Semantic粒度の不整合
- `--text-perform` / `--text-perform-lyric` / `--text-perform-title` など
  perform系テキスト変数の階層が不統一

### ⑤ border / shadow の過分割
- soft / mid / dark の細分化が多く、コンポーネント単位で爆発気味

---

## Phase14 推奨作業順序

**Phase14は「修正作業」ではなく「移行作業」として扱うこと。**
モグラ叩き方式（見つけたら直す）は設計破綻を招く。

1. **棚卸し**：直書き一覧・overrideブロック一覧・var依存グラフをまず全部出す
2. **分類**：Semantic化 / Component責務 / 削除候補 / 統合候補に振り分け
3. **設計ルール固定**：border系は何段まで・accent系は何種類・hover専用Semanticを許可するか等を先に決める
4. **一括移行**：ルール確定後にまとめて実施

---

## 今後のTODO

| フェーズ | 内容 |
|---|---|
| Phase12終盤 | 演奏モードヘッダーへのカポ番号表示 |
| Phase13以降 | 右パネル下部にプロジェクトDBライブラリタブ追加 |
| Phase14 | CSSアーキテクチャ再設計（Semantic統合・inline style除去・override整理） |
| Phase14 | `base.css` 導入（`body`/`scrollbar`を`theme.css`から分離） |

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
