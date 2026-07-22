# ドキュメント用語対応表

> 対象: phase-status.md / current-issues.md / handover
> architecture.md は英語主体（初出時のみ日本語併記）のため対象外。
> コードの関数名・変数名は対象外（英語のまま）。

---

## 運用ルール

```
コード（関数名・変数名・クラス名）  → 英語（変更しない）
architecture.md                    → 英語主体＋初出時のみ日本語併記
phase-status.md                    → 日本語主体（進捗確認資料）
current-issues.md                  → 日本語主体（課題管理資料）
handover                           → 日本語主体（既にそうなっている）
```

日本語主体のドキュメントで英語の設計概念を使う場合は、
「日本語（English term）」の形式で書く。英語だけの見出し・説明文は避ける。

---

## 用語対応表

| 英語 | ドキュメント表記 |
|---|---|
| Authority | 管理主体（Authority） |
| Projection | 表示変換（Projection） |
| Runtime Cache | 実行時キャッシュ（Runtime Cache） |
| Persistence | 永続化（Persistence） |
| Rehydration | 再構築・復元（Rehydration） |
| Migration | 移行（Migration） |
| Schema | データ構造（Schema） |
| Boundary | 境界（Boundary） |
| Rendering | 描画（Rendering） |
| ViewModel | 表示モデル（ViewModel） |
| Invariant | 不変条件（Invariant） |
| Derived Cache | 派生キャッシュ（Derived Cache） |
| Single Writer | 唯一の更新窓口（Single Writer） |
| Ownership | 所有権・責務（Ownership） |
| Lifecycle | 生存期間・ライフサイクル（Lifecycle） |
| Session Layer | セッション層（Session Layer） |
| Command Layer | コマンド層（Command Layer） |
| Tie-break | タイブレーク（Tie-break） |

---

## 名前付き設計概念の表記ルール

`[BOUNDARY UPDATE AUTHORITY]` のような、コード内コメントで使う
大文字スネークケースの名前付きInvariant/Authorityを、handover等の
日本語ドキュメントで見出しとして使う場合は、次の形式に統一する。

```
【日本語名】（English Name）
```

**例:**
```
【境界更新の唯一の窓口】（Boundary Update Authority）
【選択状態の派生キャッシュ】（Selection Derived Cache）
【キー入力の責務分離】（Key Ownership Guard）
```

理由:
- 日本語だけで内容が一目で分かる
- 英語名を併記するため、コード内コメント（`[BOUNDARY UPDATE AUTHORITY]`等）や
  grep検索との対応が失われない

この形式は主に handover の見出しで使う。architecture.md 内のコードコメントや
インラインの `[INVARIANT_NAME]` 表記自体は変更しない（コードコメントは英語のまま）。

---

## 使い方（例）

**Before（英語のみ・避ける）:**
```
timing model rehydration schema contract（schema versioning / migration layer）
```

**After（日本語主体）:**
```
保存データ復元の仕組み（timing model rehydration schema contract）
```

---

## この表の更新方針

新しい概念が出てきたら、その概念を最初にドキュメント化するタイミングで
この表に追記する。architecture.mdへの追加時も、この表を先に確認し、
既存の日本語表記があれば流用する（同じ概念に複数の訳語を作らない）。
