# CreateChordScore Documentation

このディレクトリは CreateChordScore の設計・運用・開発資料を管理する。

初めて参照する場合は、本READMEを起点に必要なドキュメントを参照すること。

---

## ドキュメントの読み始め

現在の状況を把握する場合は、次の順で参照することを推奨する。

1. `phase-status.md` — これまでの開発の流れ
2. `current-issues.md` — 現在の課題・バックログ
3. `handover/active/` — 直前フェーズで何が決まったか
4. `architecture/architecture.md` — 現在のアーキテクチャ（設計の正本）

---

## ドキュメント運用

CreateChordScoreのドキュメントは、以下の区分で管理する。

- **正式ドキュメント** — `docs/` 配下で管理する。プロジェクトの現在の状態・仕様・ルールを表す唯一の情報源。区分は下記「ドキュメント分類」を参照。
- **handover** — `docs/handover/` に置く。フェーズごとの引き継ぎ資料。`active/` は進行中フェーズ、`archive/` は完了済みフェーズを10フェーズ帯単位で格納する。
- **legacy** — `docs/legacy/` に置く。役目を終えた設計資料・作業メモのうち、後から参照する価値があるもの。

### 一時作業ファイルの扱い

リポジトリの正式なドキュメント構成には含めない。作業中はプロジェクトルートやローカルで `phaseNN-notes.md` 等として自由に作成してよいが、**フェーズ終了時に必ず次のいずれかを行う**。

- 正式ドキュメントへ統合する
- `docs/legacy/` へ保存する
- 削除する

---

## ドキュメント分類

`docs/` 直下のファイルは、以下の論理分類で参照する（物理配置は下記「ディレクトリ構成」を参照）。

- **コアドキュメント**（プロジェクトの現在地。常に最新化）
  `README.md` / `architecture/architecture.md` / `phase-status.md` / `current-issues.md`
- **リファレンス**（用語・仕様の定義集）
  `naming-glossary.md` / `doc-glossary.md` / `file_format.md` / `keybindings.md`
- **ガイドライン**（作業の進め方）
  `project_instructions.md` / `review-guidelines.md`
- **セットアップ**（環境構築）
  `起動方法.txt` / `開発環境メモ.md`
- **handover** — `handover/`
- **legacy** — `legacy/`

（`devlog.md` は当面現状維持。追記が肥大化した場合は将来的に分割を検討する）

---

## ディレクトリ構成
docs/
├── README.md
├── architecture/
│   ├── architecture.md
│   ├── ui-rules.md
│   └── archive/
├── handover/
│   ├── README.md
│   ├── template-heavy.md
│   ├── active/
│   └── archive/
│       ├── phase01-13/
│       ├── phase14-20/
│       ├── phase21-30/
│       ├── phase31-40/
│       ├── phase41-50/
│       ├── phase51-60/
│       ├── phase61-70/
│       └── phase71-80/
├── legacy/
│   ├── design/
│   ├── testing/
│   └── その他の過去資料・設計メモ
├── current-issues.md
├── phase-status.md
├── naming-glossary.md
├── doc-glossary.md
├── file_format.md
├── keybindings.md
├── project_instructions.md
├── review-guidelines.md
├── devlog.md
├── 起動方法.txt
└── 開発環境メモ.md

## 開発メモ

`docs/devlog.md` を参照