# フォルダ構成・ファイル配置ガイド

## 全体構成

```
CreateChordScore/
├─ index.html          ← アプリ本体エントリ
├─ server.py           ← 開発用サーバ
├─ README.md           ← プロジェクト説明
├─ .gitignore
│
├─ css/                ← スタイルシート（アプリ本体）
├─ js/                 ← JavaScriptモジュール（アプリ本体）
├─ images/             ← README・UI用画像（Git管理）
│
├─ resource/           ← アプリが参照するリソース
│   ├─ audio/          ← 音声ファイル（.gitignore対象）
│   ├─ chords/         ← コードDBのJSON
│   ├─ icons/          ← favicon等
│   ├─ lyrics/         ← 歌詞テキスト
│   ├─ projects/       ← プロジェクトJSON（保存データ）
│   └─ sample/         ← デザイン検討用素材
│
├─ tools/              ← 現役の開発補助ツール
├─ scripts/            ← 起動・運用スクリプト
├─ testdata/           ← 検証用データ
│   ├─ projects/       ← テスト用プロジェクトJSON
│   └─ debug/          ← デバッグ出力（.gitignore対象）
│
├─ docs/               ← 開発ドキュメント
│   ├─ architecture/   ← 設計ルール・責務定義
│   │   └─ archive/    ← 旧設計文書
│   ├─ handover/       ← AI引き継ぎ文書
│   ├─ prompts/        ← 再利用プロンプト
│   ├─ testing/        ← 手動確認手順書
│   ├─ finished/       ← 完了済み設計文書
│   └─ draft/          ← 草稿（.gitignore対象）
│
├─ archive/            ← 廃止済み・履歴保存
│   ├─ ui-history/     ← 開発履歴スクリーンショット
│   └─ obsolete-data/  ← 不要になったデータ
│
├─ backup/             ← 手動退避・復旧用
│   └─ runtime-recovery/ ← resource/backup から移動分
│
└─ tmp/                ← 一時ファイル（.gitignore対象）
```

---

## フォルダ別・何を置くか

### `css/`
- アプリのスタイルシートのみ
- 新規CSSファイルはここに置く

### `js/`
- アプリのJavaScriptモジュールのみ
- 新規JSモジュールはここに置く

### `images/`
- README.mdから参照するスクリーンショット
- アプリUIで使うロゴ等
- **置かないもの**: 音声・JSON・開発用素材

### `resource/audio/`
- アプリで再生する音声ファイル（mp3/flac等）
- **Git管理対象外**（著作権保護）

### `resource/chords/`
- コード名・ダイアグラム定義のJSON
- ファイル形式: `*_chords.json`

### `resource/icons/`
- favicon.ico / favicon-*.png

### `resource/lyrics/`
- 歌詞テキストファイル（.txt/.png）

### `resource/projects/`
- ユーザーが保存したプロジェクトJSON
- ファイル形式: `*_project.json`
- テスト用途のものは `testdata/projects/` へ

### `resource/sample/`
- デザイン検討・ロゴ案等の素材画像
- AI生成画像・試作ロゴ等

### `tools/`
- 現役の開発補助Pythonスクリプト
- 将来ブラウザGUI統合予定のCLIツール
- 例: `chordmini_fetch.py`, `convert_csv_v3.py`
- **置かないもの**: アプリ本体コード、廃止済みツール

### `scripts/`
- 起動・環境セットアップ用スクリプト
- 例: `ChordScoreを起動.bat`

### `testdata/projects/`
- テスト・バグ再現用のプロジェクトJSON
- 例: `test_project.json`

### `testdata/debug/`
- APIレスポンスのデバッグ出力等
- **Git管理対象外**（一時生成物）

### `docs/architecture/`
- モジュール責務定義
- CSSレイヤールール
- リソース分類方針
- **新しい設計ルールはここに追加**

### `docs/handover/`
- AI（Claude等）への引き継ぎ文書
- ファイル形式: `handover_phaseNN.md`

### `docs/prompts/`
- 再利用するプロンプトテンプレート
- バグ修正・機能追加・設計レビュー用

### `docs/testing/`
- 手動動作確認の手順書・チェックリスト
- 自動テストコードではなく人間向け確認メモ

### `archive/ui-history/`
- 開発途中のUIスクリーンショット
- 変遷の記録として保管。基本触らない

### `archive/obsolete-data/`
- 役割が不明になった・不要になったデータ
- 削除前の一時置き場としても使用可

### `backup/`
- 手動で退避したファイル群
- `runtime-recovery/`: resource/backup からの移行分

### `tmp/`
- 作業中の一時ファイル
- **Git管理対象外**。削除しても問題ないもの

---

## 迷ったときの判断基準

| 迷うケース | 置き場所 |
|---|---|
| アプリが直接読み込むJSON | `resource/chords/` または `resource/projects/` |
| ユーザーが保存したプロジェクト | `resource/projects/` |
| バグ再現用のプロジェクト | `testdata/projects/` |
| 開発中に使うPythonスクリプト | `tools/` |
| 起動・環境構築用バッチ | `scripts/` |
| AI引き継ぎ文書 | `docs/handover/` |
| 設計ルール・責務定義 | `docs/architecture/` |
| 動作確認の手順メモ | `docs/testing/` |
| 将来使うかもしれないもの | `archive/obsolete-data/` |
| 完全に不要 | 削除 |
