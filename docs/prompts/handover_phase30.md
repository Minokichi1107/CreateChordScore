# 引き継ぎ: Phase30 — フォルダ構成整理

## 作業状態
- ブランチ: main（phase29完了・merge済み）
- 直前作業: Phase29完了
  - ヘッダーUIをプルダウンメニュー化（3レーン構造）
  - ファイル▼ / 編集▼ / 表示▼ / プロジェクト▼ / ツール▼ / 設定▼ を実装
  - diag-toggleを表示▼に移動

---

## Phase30 作業内容

**フォルダ構成の責務分類を確定する（大移動なし・ルール決定が主目的）**

### 方針
- 「理想論フォルダ構成」はやらない
- 増築可能な最低限の責務分離を目的とする
- 大規模なファイル移動はしない（import破壊リスク回避）
- 新規ファイルの配置ルールを先に固定する

---

## 現在のフォルダ構成（主要部分）

```
CreateChordScore/
├─ index.html
├─ server.py
├─ css/
│   ├─ base.css        ← 現状: body・scrollbar等が混在
│   ├─ components.css  ← TAPオーバーレイ・モーダル等
│   ├─ layout.css      ← ヘッダー・パネル・3レーン構造
│   ├─ perform.css     ← 演奏モード
│   ├─ state.css       ← 状態系スタイル
│   └─ theme.css       ← テーマ差分（現状: body・scrollbar混在）
├─ js/
│   ├─ app.js          ← メイン統合・イベント・State管理
│   ├─ audio.js        ← 再生エンジン
│   ├─ chords.js       ← コードDB・ダイアグラム・移調
│   ├─ csvImporter.js  ← CSV取り込み
│   ├─ editor.js       ← 行描画・ハイライト
│   ├─ perform.js      ← 演奏モード
│   ├─ project.js      ← 保存・読み込み・シリアライズ
│   ├─ replace.js      ← 置換バー
│   └─ tapmode.js      ← TAPモード
├─ images/             ← logo.png・screenshot群
├─ resource/           ← 音声・プロジェクトJSON・コードJSON（開発用データ）
├─ docs/               ← 設計書・引き継ぎ・devlog
├─ archive/            ← 旧バージョン（触らない）
├─ backup/             ← バックアップ（触らない）
└─ tmp/                ← 一時ファイル
```

---

## Phase30でやること

### 1. 責務分類の確定（ドキュメント化）

以下の分類軸を `docs/` に文書化する：

| 分類 | 対象 | 将来の置き場 |
|---|---|---|
| core | app.js（統合・State・イベント） | js/core/ |
| ui | editor.js・perform.js・replace.js・tapmode.js | js/ui/ |
| services | audio.js・project.js・chords.js・csvImporter.js | js/services/ |
| styles/base | リセット・body・scrollbar | css/base.css（整理後） |
| styles/layout | ヘッダー・パネル・3レーン | css/layout.css |
| styles/components | モーダル・TAPオーバーレイ等 | css/components.css |
| styles/theme | テーマ差分のみ | css/theme.css（整理後） |

### 2. base.css / theme.css の問題箇所特定

**現状の問題:**
- `theme.css` に `body` や `scrollbar` のスタイルが混在している
- `base.css` にテーマ依存のスタイルが混入している可能性

**確認コマンド:**
```bash
grep -n "body\|scrollbar\|:root" css/base.css
grep -n "body\|scrollbar\|:root" css/theme.css
```

### 3. resource/ フォルダの整理方針確定

現状の `resource/` は開発用テストデータ（音声・JSON）が混在。
`.gitignore` への追加候補を確認する。

---

## Phase31への準備（base.css分離）

Phase30完了後、Phase31で実施：
- `base.css` = body・scrollbar・リセットのみ
- `theme.css` = テーマ差分のみ（`:root` 変数上書きと要素差分）
- `layout.css` からテーマ依存部分を抜き出す

---

## バックログ（Phase30以降の優先順）

1. **Phase30**（次）: フォルダ構成整理・責務分類確定
2. **Phase31**: base.css分離（theme.cssをテーマ差分のみに）
3. **Issue #29**: プロジェクトロード時のaudio/chord_source自動復元
4. **Phase13**: 右パネルにプロジェクトDBライブラリタブ
5. **Phase12**: 演奏モードヘッダーにカポ番号表示

---

## 重要な設計ルール（継続）

- 機能追加を依頼された場合、すぐに実装しない。仕様確認→提案→承認後に実装
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- 改善提案は後出し禁止。設計段階でまとめて提示
