# 引き継ぎ: Phase29 — ヘッダーUIプルダウンメニュー化

## 作業状態
- ブランチ: phase29（phase28からブランチ）
- 直前作業: Phase28完了・mainにmerge済み
  - ヘッダーボタン見切れバグ修正
  - `#diag-toggle`, `#btn-tapmode`, `#btn-perform-mode`, `.hdr-btn`, `#btn-settings` に `flex-shrink:0` 追加
  - `#project-title` を `flex:1 1 auto` に変更

## 作業ファイル
- `css/layout.css`（ヘッダー定義）
- `index.html`（ヘッダーDOM構造）
- `js/app.js`（ヘッダーイベントハンドラ）

---

## Phase29 作業内容

**ヘッダーUIをプルダウンメニュー構成に変更する**

### 確定設計

| 表示 | 内容 |
|------|------|
| 常時表示 | ロゴ / タイトル入力 / 🎸 演奏 / 🎵 TAPモード |
| ファイル ▼ | 開く / 上書保存 (Ctrl+S) / 別名保存 / 新規 (Alt+N) |
| 編集 ▼ | 置換 (Ctrl+H) / 元に戻す（将来）/ やり直し（将来） |
| 設定 ▼ | ダイアグラムホバー ON/OFF（暫定・将来削除）/ テーマ切替 |

### 削除・移動対象の現行要素
- `#diag-toggle` → 設定▼に移動
- `#btn-replace-open` → 編集▼に移動
- `#btn-open`, `#btn-save`, `#btn-saveas`, `#btn-new` → ファイル▼に移動
- `#btn-settings` → 設定▼ボタン化（現在の設定パネルを開く機能は統合）

---

## 実装方針（未確定・次Chatで整理）

- プルダウンはCSS+JSで実装（外部ライブラリ不使用）
- キーボードショートカットは既存のまま維持
- 設定パネル（`#settings-panel`）との統合方法は要検討
  - 案A: 設定▼クリックで既存パネルを開く（最小変更）
  - 案B: 設定▼をドロップダウン化してパネル廃止（将来向き）

---

## Phase29以降のバックログ（優先順）

1. **Phase29**（次）: ヘッダーUIプルダウンメニュー化 ← 今ここ
2. **Phase14**: base.css 分離
3. **Issue #29**: プロジェクトロード時のaudio/chord_source自動復元
4. **Phase13**: 右パネルにプロジェクトDBライブラリタブ追加
5. **Phase12**: 演奏モードヘッダーにカポ番号表示
