# UIルール

> 最終更新: Phase32完了時点

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
- `components.css` に残存するテーマ依存色は順次 `theme.css` へ移管する（バックログ参照）
- semantic role を持たない magic number 的装飾値は避ける

---

## 2. テーマ設計

- 色・背景・borderは原則CSS変数経由で定義する
- semantic roleを持たない色の直指定は避ける
- テーマ依存値は `theme.css` に集約する

```css
/* 良い例 */
background: var(--surface-base);
color: var(--text-primary);

/* 避ける例（components.css の .tov-chord-tag が該当・移管対象） */
background: linear-gradient(135deg, #1e3a6e, #162a52);
border: 1.5px solid #4a7fd4;
```

### 主なCSS変数カテゴリ（theme.css定義）
- `--surface-*` : 背景面（base / raised / overlay / chord 等）
- `--text-*` : テキスト色（primary / secondary / muted / accent 等）
- `--border-*` : ボーダー色
- `--color-*` : セマンティックカラー（green / amber / red）
- `--grad-*` : グラデーション定義
- `--shadow-*` : シャドウ定義
- `--r-*` : 角丸（sm / md / lg）
- `--font-*` : フォントファミリー

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
