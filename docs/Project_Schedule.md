CreateChordScore
app.js 構造整理プロジェクト 作業工程予定表
フェーズ0（完了）
Git管理導入と開発環境整理
実施内容
Gitリポジトリ運用開始
GitHub連携
ブランチ運用開始
現在の状態
main
 
実施済み
git add
git commit
git push
.gitignore管理
フォルダ整理
フェーズ1（完了）
イベント整理 第一段階
目的

イベント登録の分散を整理する

実施

app.js内のイベントを確認

例

file-chord
file-audio
pal-filter
custom-add
custom-in
btn-import
btn-append
btn-clearall
add-line-btn
移動先
setupEventHandlers()
成果

イベント管理の一元化開始

フェーズ2（完了）
UIイベント整理
目的

UI操作イベントを setupEventHandlers() に集約する

移動イベント
btn-save
btn-saveas
btn-open
btn-new
file-project
成果
UIイベント整理完了
イベント登録場所の統一開始
フェーズ3（完了）
ダイアグラムイベント整理
移動イベント
btn-new
diagToggleBtn
diag-in
btn-add-diag
実施内容
setupEventHandlers()へ移動
DOM参照修正
スコープ問題修正
修正内容

例：

diagToggleBtn参照修正
DOM取得位置修正
イベント登録確認
状態
正常動作
フェーズ4（現在）
全体動作検証
確認項目
機能	状態
ファイル読み込み	OK
パレット操作	OK
ダイアグラム入力	OK
ダイアグラム追加	OK
ON/OFF切替	OK
プロジェクト保存	OK
プロジェクト読み込み	OK
目的
リファクタによる副作用確認
フェーズ5（次工程）
残イベント整理
残イベント
capo change
TAPモード関連
モーダルイベント
方針

副作用が出やすいため

1イベントずつ移動
↓
動作確認
↓
コミット
フェーズ6
setupEventHandlers最終整理
目的

イベント登録の完全一元化

整理内容
setupEventHandlers()

内部を整理

例

Fileイベント
UIイベント
Diagramイベント
Editorイベント
フェーズ7
初期化処理整理

現在

DOMContentLoaded

に混在している

UI初期化
状態復元
イベント登録

を整理

目標構造
initApp()

↓
setupEventHandlers()

↓
initializeUI()

↓
restoreProjectState()
フェーズ8
app.js 分割設計

現在

app.js 約1300行

分割案

events.js
diagram.js
project.js
editor.js
ui.js
フェーズ9
コードクリーンアップ

削除対象

未使用関数
重複ロジック
古いイベント登録
フェーズ10
最終動作確認

確認項目

新規作成
保存
読み込み
ダイアグラム
TAPモード
パレット操作
CSVインポート
現在の開発状態
Phase4
動作検証
現在のブランチ
main
現在の最優先タスク
残イベント整理
開発運用ルール

今後の作業単位

1イベント移動
↓
動作確認
↓
commit
↓
push
プロジェクト最終目標
app.jsの構造整理
保守性向上
コード可読性向上