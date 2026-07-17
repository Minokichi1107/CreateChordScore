# 引き継ぎ: Phase32へ — base.css / theme.css 分離完了

## 作業状態
- ブランチ: main（phase31完了・merge済み）
- 直前作業: Phase31完了
  - base.css / theme.css の責務分離
  - blueテーマのボタン漏れ修正
  - components.css のテーマ依存色の部分除去

---

## Phase31 完了内容

### base.css
- `body` からテーマ依存色（`background` / `color`）を除去
- スクロールバー構造（`width: 6px; height: 6px; border-radius`）を追加
- 色指定はtheme.cssへ移動済み

### theme.css
- `body[data-theme="dark"]` セレクタを追加（silver/blueと対称化）
- スクロールバーの色指定のみ残す（構造はbase.cssへ）
- silver/blueのボタンセレクタに `#tap-ov-tapbtn` / `#btn-tapmode-close` を追加
- dark/silver/blue 各テーマに `#tap-ov-tapbtn` / `#btn-tapmode-close` の color/background を追加

### components.css
- `#tap-ov-tapbtn` から `background` / `color` を除去（theme.css側へ移管）
- `#btn-tapmode-close` から `background` / `color` を除去（theme.css側へ移管）

---

## 現状の既知の暫定処理

### バックログ #TAPbtn-color
```css
body[data-theme="blue"] #tap-ov-tapbtn {
  background: #2b54af;  ← 直指定（暫定）
  color: var(--text-chord);
}
```
- 原因：blueテーマの `--surface-overlay` と `--text-secondary` のコントラスト不足
- 対応方針：ボタン体系統一・semantic color再設計のタイミングで既存変数に統一
- 対応時期：Phase32以降

---

## CSS責務ルール（確定）

| ファイル | 責務 |
|---|---|
| base.css | reset / normalize / 非テーマ依存構造（body構造・scrollbar構造） |
| theme.css | テーマ差分のみ（color / background / shadow / border-color） |
| layout.css | 配置・構造（colorを含まない） |
| components.css | UI形状（shape / layout）。color/backgroundはtheme.cssへ |
| state.css | 汎用stateクラスのみ |
| perform.css | 演奏モード固有 |

### 重要な判断基準
- `background` / `color` → theme.css の責務
- `border-radius` / `width` / `padding` → components.css の責務
- `border: 1px solid var(--border-ui)` → 両義性あり。構造的意味があればcomponents.css、色だけならtheme.css
- 専用変数の追加は「UIパターンとして独立した意味を持つ場合のみ」

### components.cssの残存課題
- `background: var(--surface-*)` / `color: var(--text-*)` の直書きが他箇所にも残存
- 今回はスコープ外として保留
- Phase32以降でまとめて整理予定

---

## バックログ（Phase32以降の優先順）

1. **Issue #29**: プロジェクトロード時のaudio/chord_source自動復元
2. **Phase13**: 右パネルにプロジェクトDBライブラリタブ
3. **Phase12**: 演奏モードヘッダーにカポ番号表示
4. **TAPボタン色設計**: ボタン体系統一・semantic color再設計（暫定直指定の解消）
5. **components.css整理**: テーマ依存色の残存箇所をtheme.cssへ移管
6. **Issue #27**: メタリックテーマ描画方式の見直し（Phase32〜34級）

---

## 重要な設計ルール（継続）

- 機能追加を依頼された場合、すぐに実装しない。仕様確認→提案→承認後に実装
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- 改善提案は後出し禁止。設計段階でまとめて提示
- uiモジュール間の直接依存禁止（app.js経由）
- project.js は persistence layer に限定
- utils.js / helpers.js は作らない
