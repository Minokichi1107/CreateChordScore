ChordScore Phase5 作業指示書（残イベント整理）
■フェーズ目的

app.jsに残っているイベントを安全にsetupEventHandlersへ統合し、
Phase8（分割）に耐えられる状態にする。

■開始条件（必須チェック）
① 状態アクセサ追加（必須）

app.jsに追加：

function getProject() {
  return project;
}

function getUiState() {
  return uiState;
}

function getAudioState() {
  return audioState;
}

※ setterは追加しない（過剰設計防止）

② Phase4動作確認OK前提

以下がすべてOKであること

ファイル読み込み
保存 / 読み込み
ダイアグラム
TAPモード
再生

1つでも不安ならPhase5に進まない

③ モーダルDOM確認

index.htmlに以下が存在することを確認

time modal
chord modal
copy modal

※ JS生成なら先に構造確認必須

■Phase5実施対象

残イベントのみ：

capo change
TAPモード関連
モーダルイベント
■絶対ルール（重要）
ルール①

👉 1イベント = 1単位作業

移動
↓
動作確認
↓
commit
↓
push
ルール②

👉 まとめて移動禁止

（TAPとmodal同時移動は事故原因）

ルール③

👉 既存ロジックは一切リファクタしない

やるのは「移動のみ」

■実行順序（固定）
Step 1：capo change（最優先・低リスク）
作業
現在のcapoイベント場所を特定
setupEventHandlersへ移動
注意点
project.linesの変更が発生する可能性あり
必ず再描画関数を確認
動作確認
capo変更でコード反映されるか
再生中に変更しても崩れないか
Step 2：モーダルイベント（中リスク）

対象：

time modal
chord modal
copy modal
作業手順（各モーダル共通）
元の登録場所特定
setupEventHandlersへ移動
DOM null確認
動作確認
commit
注意ポイント
modal DOMが動的生成なら順序確認
event登録タイミングがDOM後であること
Step 3：TAPモード（最重要・最後）
事前チェック（必須）
tapIdx検索（grep）
TAP ON/OFFの入口特定
uiState.tapIdx使用箇所確認
作業順
3-1 TAP ON/OFF切替
単純移動
commit
3-2 TAP入力処理
tapIdx増加処理
モーダル連携確認
commit
3-3 その他TAP関連
個別に移動
commit
注意（重要）

TAPは以下の3つが絡む

uiState.tapIdx（UI状態）
project.lines（データ）
modal / editor（表示）

👉 1箇所でもズレるとバグる

■終了条件

Phase5完了は以下で判断：

capoイベントがsetupEventHandlers内に存在
modalイベントが全て移動済み
TAPイベントが全て移動済み
DOMContentLoadedにイベント残存なし
■危険ポイントまとめ（重要）
① TAPモードが最大リスク

→ 最後にやる

② modal DOM生成タイミング

→ nullエラーの原因No.1

③ capo変更時の再描画漏れ

→ 表示ズレバグ

■コミット戦略
capo移動 → commit
modal1 → commit
modal2 → commit
modal3 → commit
TAP ON/OFF → commit
TAP input → commit
■補助ルール（推奨）
1作業後は必ずブラウザリロード確認
consoleエラー確認
1回でも違和感あれば戻す（git restore）
■Phase5の成功条件

以下が成立すれば成功：

イベントが完全に1箇所に集約
DOMContentLoadedがスッキリしている
TAP/Modal/capoが分離された状態
■補足（重要な現実判断）

このPhase5は実は

👉 「Phase8を安全にするための準備フェーズ」

です。

つまり本番はPhase8なので
ここで雑にやると後で壊れます。