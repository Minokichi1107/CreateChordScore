jsファイルの分割化　指示書

JSファイル分割計画

目的
app.js(1600行)を責務ごとに分離する。

設計原則
・モジュールは単一責務
・依存は一方向
・UIとデータを分離

フェーズ2
project.js
saveProject
loadProject
autoSave

フェーズ3
audio.js
再生エンジン

フェーズ4
editor.js
エディタUI

フェーズ5
io/csvImporter.js
parseCSV

フェーズ6
app.js整理
起動処理のみ残す

実装ルール
0 現在の責務を説明
1 移動する関数一覧
2 依存関係を確認
3 コード移動
4 import/export追加
5 動作確認

制約
一度の回答で大量コードを書かない
最大500行

将来拡張
・エディタ機能拡張
・コードダイアグラム拡張
・譜面操作
・UI改善
・JSONタイムスタンプからコード登録
・プロジェクトライブラリ

