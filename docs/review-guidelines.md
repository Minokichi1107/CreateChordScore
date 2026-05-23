# レビュー・設計コミュニケーション ガイドライン

> このファイルは AI との設計レビュー・実装相談時の運用ルールを定める。

---

## 1. 用語説明ルール

専門用語・略称・ローカル関数名は、初出時に簡単な補足説明を付記すること。

**良い例：**
- migration（旧設計から新設計への移行）
- latent bug（潜在化していた既存バグ）
- rbRefresh（replace検索結果を再生成する関数）
- orchestration layer（各 subsystem を接続する制御層）

**避ける例：**
- 「rbRefresh が壊れている」→ 文脈なしで関数名だけ出す
- 「migration が必要」→ 何の migration か不明

略称や内部関数名のみで説明を進めないこと。

---

## 2. 用語の分類

以下を区別して説明すること：

| 分類 | 例 |
|---|---|
| 一般的 CS 用語 | migration、abstraction、refactor |
| 音楽ドメイン用語 | barline、chord、measure、beat |
| CreateChordScore 固有概念 | diagLock、barline canonical、token stream |
| ローカル関数名・略称 | rbRefresh、isSepToken、openAddChord |

---

## 3. レイヤ説明ルール

layer 系用語は役割を補足する：

| 用語 | 意味 |
|---|---|
| render layer | 表示層（editor.js / perform.js） |
| behavior layer | 操作制御層（tapmode.js / replace.js） |
| semantic layer | 意味解釈層（tokens.js / chords.js） |
| orchestration layer | 統合制御層（app.js） |

---

## 4. 設計議論のルール

新しい設計提案・構造変更を議論する際は、以下を含めること。

**必須**
- 平易な言葉での説明
- 図解（ASCII でよい）
- 「誰が何を持つか」（ownership）の明示

**できれば**
- データの流れ（どこから来てどこへ行くか）
- なぜその設計にするのか（理由）
- やってはいけないこと（アンチパターン）

---

## 5. 改善提案のルール

改善提案は後出し・小出し禁止。設計段階でまとめて提示すること。
実装フローは「仕様確認 → 提案 → 明示的な実装指示」の順。
