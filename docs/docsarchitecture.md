1. システム概要
1.1 ツール目的

音声ファイルを解析し、コード譜を生成・編集するツール。

主な用途

音声ファイルからコード進行を取得
コード譜編集
ダイアグラム表示
プロジェクト保存 / 読み込み
1.2 使用技術
技術	内容
JavaScript	Vanilla JS
HTML	index.html
CSS	style.css
Python	CSV変換 / 解析補助
Git	バージョン管理
2. ディレクトリ構造

現在の構造

CreateChordScore/

index.html
style.css
server.py

js/
  app.js
  audio.js
  chords.js
  csvImporter.js
  editor.js
  project.js

docs/
  devlog.md
  file_format.md
  ideas.md

resource/
  mp3
  json
  csv
2.1 各ディレクトリの役割
ディレクトリ	役割
js	アプリケーションロジック
docs	開発ドキュメント
resource	音声 / プロジェクトファイル
archive	過去バージョン
backup	開発時のバックアップ
3. モジュール構成

現在のJSモジュール構成

モジュール	役割
app.js	アプリ全体の制御
audio.js	音声再生管理
editor.js	コード譜編集
chords.js	コード情報 / ダイアグラム
project.js	プロジェクト保存
csvImporter.js	CSVインポート
3.1 モジュール依存関係
app.js
 ├ editor.js
 ├ audio.js
 ├ project.js
 ├ chords.js
 └ csvImporter.js

app.js は オーケストレーターとして機能する。

4. 状態管理（State）

アプリケーション状態は主に app.js で管理される。

4.1 Project状態
project = {
  title
  audioFile
  lines[]
  palette[]
}
4.2 UI状態
uiState = {

  focLine
  tapIdx
  diagOn
  rbHits

}
4.3 Audio状態
audioState = {

  currentTime
  duration
  playing

}
5. UI構造

主要UI

index.html

Audio Player
Chord Editor
Palette
Diagram Panel
Import / Export UI
5.1 モーダル
モーダル	役割
time modal	時間編集
chord modal	コード編集
copy modal	行コピー
5.2 操作UI

主要操作

UI	内容
CSV Import	コード読み込み
Project Save	保存
Project Load	読み込み
Diagram Add	ダイアグラム追加
6. 処理フロー
6.1 アプリ起動
DOMContentLoaded
↓
initApp()
↓
setupEventHandlers()
↓
initializeUI()
↓
restoreProjectState()
6.2 編集処理
ユーザー操作
↓
イベント発火
↓
app.js
↓
editor.js 更新
↓
UI再描画
6.3 保存処理
保存ボタン
↓
project.js
↓
JSON生成
↓
ダウンロード
7. イベント管理

イベント登録は

setupEventHandlers()

に集約される。

7.1 イベント分類
種類	内容
File	open save new
UI	button操作
Diagram	ダイアグラム操作
Editor	行編集
Audio	再生操作
8. リファクタリング計画

現在の状況

Phase4
動作検証
今後の予定
フェーズ	内容
Phase5	残イベント整理
Phase6	setupEventHandlers整理
Phase7	初期化整理
Phase8	app.js分割
Phase9	コードクリーンアップ
Phase10	最終確認
9. app.js 分割計画

現在

app.js
約1300行

予定分割

events.js
diagram.js
ui.js
app.js

app.jsは アプリ起動と統括のみ担当。

10. 開発ルール

現在の開発ルール

1イベント変更
↓
動作確認
↓
commit
↓
push
11. Git運用

ブランチ

main

コミット単位

小さい変更単位