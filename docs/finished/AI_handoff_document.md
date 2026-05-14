# CreateChordScore

## AI開発引き継ぎ設計書（AI HANDOFF DOCUMENT）

---

# 【この会話のルール】

あなたの役割：

* 作業工程表に“従うだけ”
* 未指示の改善提案は禁止
* フェーズ外の提案は禁止

あなたの出力内容：

* 現在フェーズの範囲内のみ
* 指示された作業の実行のみ

やってはいけないこと：

* UX改善の追加提案
* 構造変更の提案
* 将来フェーズの先回り提案

---

# 【STRICT EXECUTION MODE】

あなたはこの会話中、以下のルールを厳守すること。

---

## ■ 基本方針

* ユーザーの指示された範囲のみを実行する
* 指示されていない改善・提案・設計変更は禁止
* 工程表・既存設計の変更提案は禁止

---

## ■ 出力制約

* 回答は要求された作業のみに限定する
* 追加情報の提示は禁止
* 仕様が決まり実装してくださいの合図を得ずに実装開始

---

## ■ 禁止事項（重要）

以下の表現は禁止

* 「改善できます」
* 「おすすめは」
* 「設計としては」

---

## ■ 優先順位

1. ユーザーの明示指示
2. 現在の工程表
3. 既存コード・状態

それ以外の判断は禁止

---

## ■ 振る舞い

* 不足情報があっても推測で補完しない
* 必要なら「不足情報のみ質問」することは許可

---

## ■ 目的

* 作業の逸脱防止
* 工程表ベースの厳密な実行
* ユーザー主導の開発維持

---

# 1. プロジェクト概要

## ツール名

CreateChordScore

## 目的

音声ファイルからコード進行を解析し
**コード譜の生成・編集を行うツール**

主用途

* 音声からコード進行取得
* コード譜編集
* コードダイアグラム表示
* プロジェクト保存 / 読み込み

---

# 2. 技術構成

| 技術         | 内容         |
| ---------- | ---------- |
| JavaScript | Vanilla JS |
| HTML       | index.html |
| CSS        | style.css  |
| Python     | CSV解析補助    |
| Git        | バージョン管理    |

フレームワークは使用しない
**シンプルなクライアント構成**

---

# 3. ディレクトリ構造

```
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
```

---

# 4. モジュール構成

| モジュール          | 役割        |
| -------------- | --------- |
| app.js         | アプリ統括     |
| audio.js       | 音声再生      |
| editor.js      | 譜面編集      |
| chords.js      | コード定義     |
| project.js     | 保存 / 読み込み |
| csvImporter.js | CSV読み込み   |

---

# 5. モジュール依存関係

```
app.js
 ├ editor.js
 ├ audio.js
 ├ project.js
 ├ chords.js
 └ csvImporter.js
```

app.js は **オーケストレーター**

---

# 6. 状態管理

状態は主に **app.js**

---

## Project状態

```
project = {

  title
  artist
  beats
  audioFile
  lines[]
  palette[]

}
```

---

## UI状態

```
uiState = {

  focLine
  tapIdx
  diagOn
  rbHits

}
```

---

## Audio状態

```
audioState = {

  currentTime
  duration
  playing

}
```

---

# 7. UI構造

主要UI

```
Audio Player
Chord Editor
Palette
Diagram Panel
Import / Export UI
```

---

# 8. モーダル

| モーダル        | 役割    |
| ----------- | ----- |
| time modal  | 時刻編集  |
| chord modal | コード編集 |
| copy modal  | 行コピー  |

---

# 9. 処理フロー

## 起動

```
DOMContentLoaded
↓
initApp()
↓
setupEventHandlers()
↓
initializeUI()
↓
restoreProjectState()
```

---

## 編集

```
ユーザー操作
↓
イベント
↓
app.js
↓
editor.js
↓
UI更新
```

---

## 保存

```
Save
↓
project.js
↓
JSON生成
↓
Download
```

---

# 10. イベント管理

イベント登録

```
setupEventHandlers()
```

---

## イベント分類

| 種類      | 内容            |
| ------- | ------------- |
| File    | open save new |
| UI      | ボタン           |
| Diagram | ダイアグラム        |
| Editor  | 編集            |
| Audio   | 再生            |

---

# 11. 開発工程

---

# Phase10

Quick Win

1 シングル画面モード
2 左パネル追加
3 置換履歴

---

# Phase11

JSON連携

* chordmini.me JSON解析
* タイムスタンプ自動設定

---

# Phase12

中級機能

* コードパレット移調
* TAP時刻編集

---

# Phase13

Beat & Chord Grid

* 拍子グリッド表示
* 再生同期
* クリックシーク

---

# 12. 将来モジュール分離

現在

```
app.js
```

将来

```
app.js
events.js
ui.js
diagram.js
```

---

# 13. Git運用

ブランチ

```
main
```

コミット方針

* 小さい変更単位
* 機能単位コミット

---

# 14. 開発フロー

```
変更
↓
動作確認
↓
commit
↓
push
```

---

# 15. AI作業ルール

AIは以下に従う

* 工程表に従う
* フェーズ外作業禁止
* 改善提案禁止
* 設計変更禁止

---

# 16. AI作業開始時の前提

AIは以下を前提として動作する

1. この設計書
2. GitHubリポジトリ
3. ユーザーの指示

それ以外は参照しない。

---