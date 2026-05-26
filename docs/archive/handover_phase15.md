# ChordScore Phase15 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase14-css-architecture（mainへ統合予定）

## 現在の作業ブランチ
phase15-（未定）

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

## Phase14で完了した作業

### 層責務の確定（設計ルール）

| 層 | 責務 | 直書きOK? |
|---|---|---|
| Primitive | 値のみ（px・色） | ✅ |
| Semantic | 意味の定義・テーマ差分 | ✅（値のみ） |
| Component | var()のみで見た目構築 | ❌ |
| Theme override | Semantic差し替えのみ | ❌ |
| Mode override | Semantic差し替えのみ | ❌ |
| Instance | JS一時状態のみ（display/transform等） | ✅ |

### C-1：`#proj-key` / `#proj-bpm` inline style除去
- index.htmlのinline styleを削除
- layout.cssに `.capo-row input` として共通化
- `#proj-key { flex:1 }` / `#proj-bpm { width:60px; text-align:center }` を個別追加
- darkテーマでの消失を事前検出して対処

### C-2：`#btn-perform-close` Component層移動
- index.htmlのinline styleを削除
- perform.cssに `#btn-perform-close` / `#btn-perform-close:hover` を追加
- 通常背景：`var(--surface-btn-close-hover)`（視認性優先）
- hover背景：`var(--surface-raised)`
- perform UI全体ルール（hover時text color変化なし）に統一

### C-3：perform opacity Semantic変数化（三軸混在1段解体）
- `--opacity-perform-line` / `--opacity-perform-line-near` を3テーマに追加
  - dark: 0.3 / 0.6、silver・blue: 0.62 / 0.82
- perform.cssのopacity直書き → var()参照に変更
- theme.cssのPERFORM overrideブロックからopacity行を削除
- `focused` は全テーマ共通opacity:1のため変数化せず（差分のみSemantic化）

### C-4：小物inline style整理
- グループA（色系）：`#btn-new` / `#btn-clearall` / capo span / `#pal-count` / replace-bar span → layout.css
- グループB（accent-color）：ブロック単位セレクタで一括化（全input指定は回避）
  ```css
  #replace-bar input[type=radio], #replace-bar input[type=range],
  #perform-options input[type=radio], #perform-options input[type=checkbox],
  #perform-controls input[type=range], #tap-ov-ctrl input[type=range] { accent-color: var(--text-accent) }
  ```
- `#rb-close { margin-left:4px }` も layout.css へ

### C-5：ボタンフル指定のComponent層移動
- tap-overlay系（`#btn-tapmode-close` / `#tov-clear-all` / `#tov-clear-selected` / `#tov-deselect` / `#tov-speed-label`）→ components.css
- icon button系（`#speed-reset` / `#vol-btn`）→ layout.css
- perform系（`#vol-btn-perform` / `#perform-speed-label`）→ perform.css
- `#chord-pal`内プレースホルダーdivに `id="chord-pal-empty"` を付与してCSS化

### 別件機能修正（perform scale）
- `.perform-chord-diagram svg` の width を `calc(80px * var(--perform-font-scale))` に変更
- focused行も `calc(110px * var(--perform-font-scale))`（強調率1.375倍維持）
- スライダー `min="0.8"` → `min="0.7"`（面積約1/2）

---

## Phase14完了後のバグ修正（同フェーズ内）

### テーマ視認性バグ修正

**JS内dark前提色の除去（chords.js）**
- `const C='#e2e6f0'`（弦線・ナット色直書き）→ `getComputedStyle(document.body).getPropertyValue('--diag-stroke')` で取得
- フレット番号 `fill="#dde2ee"` → `fill="${C}"` に統一
- `getComputedStyle` の対象は `document.documentElement` ではなく `document.body`（`data-theme` が `body` に設定されているため）
- `--diag-stroke` を3テーマに追加：dark `#e2e6f0` / silver `#2a3a5a` / blue `#c8e0f8`

**×ボタン文字色（app.js）**
- `color:rgba(160,180,210,.5)`（dark前提）→ `color:var(--text-muted)`

**TAPモードのテーマ対応（theme.css）**
- `#tap-overlay` / `#tap-ov-header` / `#tap-ov-ctrl` を silver/blue overrideブロックに追加
- 演奏モードと同じ `--grad-perform-overlay` / `--grad-perform-header` を適用

**ダイアグラム表示の整理（layout.css / chords.js）**
- `#diag-title`：非表示（inputフィールドと重複していたため）
- `.dv-label`：非表示
- `#popup` 背景：`var(--grad-dv-surface)` に統一（右パネル `.dv` と同じ背景）
- 右パネルを最初の1バリアントのみ表示に変更（`r.data.v[0]` のみ）

**ダイアグラムSVGの調整（chords.js）**
- 開放弦の○を非表示
- セーハバーの太さを2/3に（`barW: 14*scale → 9*scale`）
- セーハと重なるドットを非表示

**演奏モードのスケール修正（perform.css / index.html）**
- ダイアグラムSVGを `calc(80px * var(--perform-font-scale))` でスケール連動
- スライダー `min="0.8"` → `min="0.7"`



### グループD：spacing系・form系（設計決定が先）

| 残件 | 性質 | 理由 |
|---|---|---|
| `style="margin-top:5px"` 等 | layout構造 | utility class化 vs component化を先に決める |
| `style="flex:1"` spacer div | flex/gap設計 | gap統一方針が未定 |
| `label style="display:flex..."` 群 | form system | form-row component化検討が必要 |

これらは「責務移動」ではなく「設計再編」が必要なため分離。

### Semantic命名整備（設計ルール確定が先）

| 変数 | 現状 | 問題 |
|---|---|---|
| `--surface-btn-close-hover` | 通常背景として使用中 | hover変数なのに常時適用 |

→ `--surface-btn-close` へのリネームはhover専用変数の許可ルールを決めてから行う。

### JSテンプレート内inline style
- `app.js` 等の `c.innerHTML = '<div style="...">'` 系
- 動的生成UIのためHTML静的構造とは別設計が必要
- Phase15以降で「JS Component層」の設計として扱う

---

## 現在のinline style残存状況

```
git grep 'style="' で残っているものの分類：

① JS state（残して良い）
   display:none / display:flex（JS制御）

② グループD（意図的後回し）
   margin-top / padding-bottom / flex:1 / spacing系

③ label群（form system候補）
   display:flex;align-items:center;gap:... 系

④ JSテンプレート内（Phase15以降）
   innerHTML内のstyle属性
```

「inline styleが残っている＝混沌」ではなく、**残っているものはすべて分類済み**の状態。

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

## 今後のTODO

| フェーズ | 内容 |
|---|---|
| Phase12終盤 | 演奏モードヘッダーへのカポ番号表示 |
| Phase13以降 | 右パネル下部にプロジェクトDBライブラリタブ追加 |
| Phase15前半 | グループD整理（spacing / form / spacer div） |
| Phase15前半 | `--surface-btn-close-hover` リネーム（命名規則確定後） |
| Phase15以降 | JSテンプレート内inline style整理（JS Component層設計） |
| Phase15以降 | `base.css` 導入（`body`/`scrollbar`を`theme.css`から分離） |

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
