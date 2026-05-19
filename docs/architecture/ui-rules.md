# UIルール

> 最終更新: Phase35完了時点

---

## 1. CSSファイル責務

| ファイル | 責務 |
|---|---|
| base.css | reset / normalize / 非テーマ依存の構造定義 |
| theme.css | テーマ差分のみ（color / background / shadow / border-color） |
| layout.css | 配置・構造（colorを含まない） |
| components.css | UI形状（shape / layout）。color / background は theme.css へ |
| state.css | 汎用stateクラスのみ |
| perform.css | 演奏モード固有スタイル |

### ルール
- `theme.css` 以外のファイルにテーマ依存色を書かない
- `components.css` のテーマ依存色は role確認の上 token参照へ整理する
- semantic role を持たない magic number 的装飾値は避ける

---

## 2. テーマ設計

- 色・背景・borderは原則CSS変数経由で定義する
- semantic roleを持たない色の直指定は避ける
- テーマ依存値は `theme.css` に集約する

```css
/* 良い例 */
background: var(--surface-selected);
color: var(--text-primary);

/* 避ける例 */
background: rgba(255,184,64,.10);   /* magic number */
border: 1.5px solid #4a7fd4;        /* 直指定 */
```

### 主なCSS変数カテゴリ（theme.css定義）
- `--surface-*` : 背景面（base / raised / overlay / selected / hover / playing 等）
- `--text-*` : テキスト色（primary / secondary / muted / accent 等）
- `--border-*` : ボーダー色（ui / selected / focus 等）
- `--color-*` : UI roleを持たない基礎色定義（green / amber / red）
- `--color-*-rgb` : alpha合成用RGB値（直接使用禁止）
- `--grad-*` : グラデーション定義
- `--shadow-*` : シャドウ定義
- `--r-*` : 角丸（sm / md / lg）
- `--font-*` : フォントファミリー
- `--tap-*` : TAP subsystem専用alias

### 例外
- canvas描画・外部ライブラリ由来の値はこの限りではない
- `[SAFE]` コメントが付いた直指定は意図的な例外として許容

---

## 3. 命名規則

- IDはケバブケース（例: `#perform-capo-display`）
- CSSクラスはケバブケース（例: `.perform-line`, `.tov-chord-tag`）
- CSS変数は `--` プレフィックス + ケバブケース（例: `--color-red`, `--surface-base`）

---

## 4. 禁止事項

- `theme.css` 以外へのテーマ依存色の記述
- CSS変数を経由しない色の直指定（原則）
- `layout.css` / `components.css` への color / background の記述

---

## 5. Token階層ルール

token は以下の3層構造とする。

| 層 | 変数カテゴリ | 役割 |
|---|---|---|
| Primitive | `--color-*` | UI role を持たない基礎色定義 |
| Semantic | `--surface-*` `--text-*` `--border-*` `--shadow-*` `--grad-*` | UI上の役割を表す。Primitive を参照してよい |
| Component alias | `--tap-*` 等 | component 固有の意味がある時のみ。原則禁止 |

ルール：
- component は原則 Semantic 層を経由する
- Primitive 直参照は alpha 調整等、明確な理由がある場合のみ許可
- Component alias は Semantic で表現できない場合のみ許可
- 新規 token 追加時はまずどの層か確認する

---

## 6. alpha値の扱い

`--color-amber-rgb: 255,184,64` のように RGB値のみ持つ変数を定義し、
alpha は呼び出し側で指定する。

```css
/* 良い例 */
background: rgba(var(--color-amber-rgb), .10);

/* 避ける例 */
background: rgba(255,184,64,.10);          /* magic number */
--tap-selected-bg: rgba(255,184,64,.10);   /* alpha込みtoken */
```

---

## 7. Component token 許容条件

以下をすべて満たす場合のみ Component alias token を許可する：

- Semantic 層で表現できない固有の意味がある
- 複数箇所で参照される
- テーマ間で値が異なる可能性がある
