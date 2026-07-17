# 引き継ぎ: Phase31 — base.css / theme.css 分離

## 作業状態
- ブランチ: main（phase30完了・merge済み）
- 直前作業: Phase30/30a/30b完了
  - フォルダ構成整理・開発資産の責務分離
  - docs/architecture/ に設計ルール文書を追加
  - resource/ を audio/projects/lyrics/icons に分離
  - tools/ scripts/ testdata/ 新設
  - .gitignore 再整備（著作権音源除外・backup/archive除外）

---

## Phase31 作業内容

**base.css と theme.css の責務を正しく分離する**

### 方針
- 既存CSSの破壊禁止。段階的変更のみ
- 1ファイルずつ確認・修正する
- 動作確認しながら進める

---

## 現状の問題

### theme.css に混入しているもの
```bash
grep -n "body\|scrollbar\|:root" css/theme.css
```
- `body` スタイルがtheme.cssに存在している
- `scrollbar` スタイルがtheme.cssに存在している
- これらは本来 base.css の責務

### base.css に混入している可能性があるもの
```bash
grep -n "color\|background\|border-color\|box-shadow" css/base.css
```
- テーマ依存の色・影がbase.cssに混入している可能性

---

## Phase31でやること

### 1. 現状確認（grepで問題箇所を特定）

```bash
grep -n "body\|scrollbar" css/theme.css
grep -n "body\|scrollbar" css/base.css
grep -n "color\|background" css/base.css
```

### 2. base.css の責務確定

**含めるもの（非テーマ依存）:**
- リセット系スタイル
- `body` の基本構造（font-family, margin, padding等）
- `scrollbar` のサイズ・構造
- フォントサイズ基準

**含めないもの:**
- `color` `background-color`（テーマ依存）
- `box-shadow`（テーマ依存）
- `:root` 変数（theme.cssへ）

### 3. theme.css の責務確定

**含めるもの（テーマ差分のみ）:**
- `:root` 変数の上書き
- テーマ固有の色・影・装飾
- `body` の背景色・文字色
- `scrollbar` の色

**含めないもの:**
- レイアウト（widthやpaddingの構造値）
- フォントサイズ基準

### 4. layout.css からテーマ依存部分を抜き出す

```bash
grep -n "color\|background\|border-color\|box-shadow" css/layout.css
```
- color系がlayout.cssに混入していれば theme.css へ移動

---

## CSS責務ルール（docs/architecture/css-layer-rule.md 参照）

| ファイル | 責務 |
|---|---|
| base.css | 非テーマ依存の基本構造 |
| theme.css | テーマ差分のみ |
| layout.css | 配置・構造（colorを含まない） |
| components.css | 再利用部品 |
| state.css | 汎用stateクラスのみ |
| perform.css | 演奏モード固有 |

---

## バックログ（Phase31以降の優先順）

1. **Phase31**（次）: base.css分離
2. **Issue #29**: プロジェクトロード時のaudio/chord_source自動復元
3. **Phase13**: 右パネルにプロジェクトDBライブラリタブ
4. **Phase12**: 演奏モードヘッダーにカポ番号表示

---

## 重要な設計ルール（継続）

- 機能追加を依頼された場合、すぐに実装しない。仕様確認→提案→承認後に実装
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- 改善提案は後出し禁止。設計段階でまとめて提示
- ui モジュール間の直接依存禁止（app.js経由）
- project.js は persistence layer に限定
- utils.js / helpers.js は作らない
