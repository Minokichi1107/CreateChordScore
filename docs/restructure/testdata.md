````md
# テストコード・テストデータの一般的な管理構成

一般的には「テストコード」と「テスト用データ」は分けて管理します。  
そして「Gitで追跡するもの」と「追跡しないもの」も分けます。

よくある構成はこんな感じです。

```text
project-root/
├─ src/              ← 本体コード
├─ tests/            ← テストコード
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/      ← 小さな固定テストデータ
│  └─ helpers/
├─ testdata/         ← 大きめのサンプルデータ（プロジェクト次第）
├─ scripts/          ← 開発補助スクリプト
├─ tmp/              ← 一時生成物（Git管理しない）
├─ dist/             ← ビルド成果物（Git管理しない）
└─ .gitignore
````

---

# 1. テストコードは通常 `tests/`

これはかなり共通文化です。

例：

```text
tests/
├─ parser.test.js
├─ chord.test.js
└─ ui/
```

Pythonなら：

```text
tests/test_parser.py
```

Rustなら：

```text
tests/integration_test.rs
```

---

# 2. テスト用データは `fixtures` が定番

「入力 → 出力が固定」の確認に使うデータです。

例：

```text
tests/fixtures/
├─ input/
│  └─ sample.txt
└─ expected/
   └─ sample.json
```

これは普通Git管理します。

## 理由

* 再現性が必要
* CIで同じ結果を出したい
* バグ再現に必要

---

# 3. 巨大データはGitに入れないことが多い

例えば：

* 数百MBの画像
* 動画
* 学習データ
* DB dump

これはGitと相性が悪いです。

## 理由

* cloneが重くなる
* 履歴が肥大化する
* Gitは巨大バイナリ管理が苦手

なので：

```gitignore
testdata/generated/
*.db
*.sqlite
```

のように除外することが多いです。

代わりに：

* ダウンロードスクリプト
* 生成スクリプト
* サンプル縮小版

をGit管理します。

---

# 4. 「生成されるテスト結果」はGit管理しない

例えば：

```text
coverage/
screenshots/
tmp/
logs/
```

は普通 `.gitignore` に入れます。

例：

```gitignore
coverage/
tmp/
*.log
```

## 理由

* 毎回変わる
* 差分ノイズになる
* 再生成可能

---

# 5. 例外：スナップショットテスト

フロントエンドでは：

```text
tests/__snapshots__/
```

みたいに「期待出力」をGit管理する文化があります。

例：

* React snapshot
* HTML snapshot
* SVG snapshot

これは「UIが意図せず変わっていないか」を確認するためです。

---

# 6. ChordScore系プロジェクトで自然な構成例

```text
CreateChordScore/
├─ src/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  │  ├─ chordpro/
│  │  ├─ json/
│  │  └─ malformed/
│  └─ snapshots/
├─ scripts/
├─ tmp/
└─ .gitignore
```

特に以下があるプロジェクトでは fixture 管理の価値が高いです。

* パーサ
* 正規化
* コード変換
* UI生成

例えば：

```text
fixtures/
├─ valid/
├─ invalid/
├─ edge-cases/
└─ regressions/
```

を作ると、

* 過去に壊れたケース
* バグ再現ケース
* 境界値ケース

が資産になります。

---

# 7. Git管理の判断基準

| 種類          | Git管理 |
| ----------- | ----- |
| テストコード      | 基本する  |
| 小さい固定テストデータ | 基本する  |
| バグ再現データ     | 基本する  |
| 一時ファイル      | しない   |
| ビルド成果物      | しない   |
| 巨大バイナリ      | 基本しない |
| 自動生成可能なもの   | 基本しない |

特に重要なのは：

> 「再現に必要か？」

です。

再現性に必要ならGit管理する価値が高いです。

```
```
