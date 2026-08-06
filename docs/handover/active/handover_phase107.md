# 引き継ぎ: Phase107完了 — Section Preview UX Polish（トグル方式復活）

## 作業状態
- ブランチ: phase107-section-preview-ux
- 直前作業: Phase106完了（Section Boundary Editing UI）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Preview中チップの押し込み表現 | `.sec-chip--previewing`クラスを追加。既存の`.aep-group--primary`と同じtoken組（`--surface-selected` / `--border-selected`）を転用。新規token追加なし | app.js（`renderSectionBar()`）/ analysis-editor.css |
| `_selectSection()` をトグル方式へ変更 | 同じSectionの再クリックで`_clearSectionPreview()`を呼び解除する。別Section・未Previewの場合は従来通りNavigate+Preview | app.js |
| `_previewSection()` / `_clearSectionPreview()` の再描画漏れ修正 | 両関数とも`renderChartMode()`のみでSection Bar自体（`renderSectionBar()`）を呼んでおらず、チップの見た目が反映されないバグがあった。両関数末尾へ`renderSectionBar()`呼び出しを追加 | app.js |

---

## 設計判断

### [判断] Preview解除ボタンを実装後に撤回し、チップの再クリックによるトグル方式へ戻す

```
結論:
  一度実装した専用「Preview解除」ボタン（Section Bar右端・Preview中のみ
  DOM生成）は撤回し、Phase102時点のトグル方式（同じチップの再クリックで
  解除）へ戻した。

理由:
  Phase105では「チップ＝Navigationの入口」という意味付けに伴い、トグルOFF
  を意図的に廃止していた。しかし実機検証で「Preview解除ボタンの位置が
  分かりにくい」というフィードバックを受け、代替案を検討した結果、
  トグル方式（Toggle Button / Selected Tab / Filter Chipで広く使われる
  操作感）の方がユーザーの期待と一致すると判断した。

  これはPhase105の判断が誤りだったという意味ではない。Phase105時点の
  「チップ＝Navigation・解除＝別操作」という責務分離は当時の設計として
  筋が通っていたが、実際に使ってみて初めて「解除のためだけに別UIを
  追加すると、かえって分かりづらい」という知見が得られた。設計ミスの
  修正ではなく、実使用評価に基づく仕様の見直しとして扱う。

  結果として、専用の解除ボタンという要素を1つ削れたため、UI引き算の
  方針にも合致する。
```

### [判断] `[CONTEXTUAL ACTION VISIBILITY]`はNamed Invariantとして採用しない

```
結論:
  Preview解除ボタンの実装時に検討していた新規原則
  [CONTEXTUAL ACTION VISIBILITY]は、architecture.mdへは追加しない。

理由:
  この原則はPreview解除ボタン（「Preview中のみDOM生成される」という
  contextual visibilityの実例）を根拠に提案されたものだった。ボタン自体を
  撤回したことで、Phase107時点でこの原則を裏付ける具体的な実装が
  存在しなくなった。実装に紐づかない抽象原則を先回りしてarchitecture.md
  へ追加することは避け、将来同種のUIパターン（Preview中のみ表示される
  操作等）が実際に必要になった時点で改めて検討する。
```

### [判断] `_previewSection()`（▼メニュー開閉時の内部同期用）はトグルさせない

```
結論:
  トグル方式は_selectSection()（チップ名クリック）のみに適用する。
  _previewSection()自体（▼メニューを開く際の内部同期。Phase106参照）は
  従来通り「常にそのSectionをPreviewする」動作のまま変更しない。

理由:
  ▼メニューを開く操作は「誤編集防止のための選択同期」が目的であり
  （Phase106 [判断]参照）、Navigationの入口としてのUX方針とは別の関心事。
  ここにトグルを持ち込むと「メニューを開いたら、状況によってはPreviewが
  外れる」という予測しづらい挙動になるため、意図的に対象外とした。
```

---

## Out of Scope（今回はやらないと決めたこと）

```
・architecture.md [NAVIGATION OWNERSHIP] の即時更新
    → 本handoverでは変更内容を記録するに留め、architecture.md本文への
      反映はセクション末尾「Deferred Documentation」に案として残す
      （ドキュメント側の編集可能ファイルが手元に無いため、次回反映時に
      適用する形とした）。
```

---

## 実機確認

```
□ チップ（例: Chorus）クリック → 押し込み表現になりChart Mode側もPreview表示
□ 同じチップを再クリック → 解除される（Chart Mode・チップ双方とも元に戻る）
□ 別のチップをクリック → 前のPreviewから正しく切り替わる
□ Escape → 解除される（既存動作維持）
□ Section Bar空白クリック → 解除される（既存動作維持）
□ ▼メニューを開く → Previewされるが、メニューを再度閉じてもPreviewは維持される
  （トグル対象外であることを確認）
```

---

## 次フェーズ候補

```
・P2 Boundary reassignment（境界コード削除時の隣接コードへの自動付け替え）
・Section UX Epic（P1〜P8・Phase106で構想化）
・5フェーズ棚卸し（前回はPhase99〜103。Phase104〜107が未反映のまま蓄積）
```

---

## Deferred Documentation（次回反映時に適用）

```
architecture.md
  §12 [NAVIGATION OWNERSHIP] の記述を現行仕様のみに更新する。
  「トグルOFFはPhase105で廃止した」という歴史的記述を削除し、
  以下のような現行仕様の記述へ置き換える（案）:

    Section chips serve as the primary navigation entry point.
    Re-clicking the currently previewed chip clears the preview.
    This toggle behavior is intentionally adopted to avoid a
    dedicated "clear" control, keeping a single interaction surface
    per chip (subtractive UI design).

  変更の経緯（Phase105で廃止→Phase107で復活）はarchitecture.mdには
  書かず、本handoverとhandover_phase105.mdに委ねる
  （architecture.mdは「現在有効な設計原則の正本」であり、経過は
  handoverの責務・README.md運用ルールに従う）。

  §12 Section Subsystem「実装の対応関係」表へ以下の行を追加:
    | UX Polish | Preview解除方式の見直し（ボタン→トグル） | 107 | app.js |

phase-status.md
  Phase105〜107の完了を追記（次回5フェーズ棚卸しでまとめて反映）

current-issues.md
  「3. UI改善」の以下issueをclose（Phase107で解消）:
    - Section Previewの解除方法が分かりにくい（Phase106発見）
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
