# 引き継ぎ: Phase116完了 — __analysisEditorDebug の正式化整理

## 作業状態
- ブランチ: main
- 直前作業: Phase115完了（置換直後のCtrl+Z UX改善）

## micro-log
（フェーズ完了につき本文へ整理済み。本セクションは削除）

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `window.__analysisEditorDebug` 撤去 | mutation系35関数（updateChord/deleteSelection/undoEdit等）の直接公開を全撤去 | app.js |
| `window.__CS_DEBUG__.analysisEditor` 新設 | Debug Layer自身がmutation APIを提供しない観測API。`state`（analysisEditorのlive reference）／`editorMode`を公開 | app.js |

## 設計判断

```
結論: __CS_DEBUG__.analysisEditor.state は analysisEditor を直接返す（structuredCloneしない）。

理由: 実コード確認の結果、既存の __CS_DEBUG__.timing getter が
      raw / normalized をすでにlive referenceのまま返しており
      （clone方針が全getterで統一されていなかった）、これに合わせた。
      analysisEditorはbuffer/history/futureを含む比較的大きいobjectであり、
      アクセスの都度cloneするコストは見合わない。
      Debug用途としては「今のbufferそのもの」を参照できる利便性を優先した。

      Debug Layer全体を完全なimmutable観測層にする設計変更は今回のスコープ外
      （[DEBUG LAYER INVARIANT]は「debug layerがstateを所有しない」ことを
      定めるものであり、「返り値経由の間接mutationを防ぐ」ことまでは
      保証しない。この前提を崩さない）。
```

## 確定した設計原則

新規Named Invariantの追加・変更なし。既存の`[DEBUG LAYER INVARIANT]`
（architecture.md §5.5）の運用実態を、今回の実装判断で明確化しただけ。

## Out of Scope（あれば）

- `[TEMP REPAIR] Phase55`（`__CS_TRANSPOSE__` / `__CS_REFRESH__` /
  `__CS_PROJECT__` / `__CS_CHARTSTATE__` / `__CS_REPAIR__`）は別世代の
  debug/repair APIであり、今回は対象外。将来別Phaseで棚卸しを検討。
- `dumpInvariants()` への `analysisEditor` 追加は、今回の設計合意（state/
  editorModeの移設のみ）の範囲外のため見送り。必要であれば別途相談。

## 実機確認

```
□ 通常のAnalysis Editor編集（追加・削除・Undo等）が従来通り動作する（回帰なし） → OK
□ __CS_DEBUG__.analysisEditor.state → analysisEditorオブジェクトが見える → OK
□ __CS_DEBUG__.analysisEditor.editorMode → 'single'等が見える → OK
□ window.__analysisEditorDebug → undefined（撤去確認） → OK
□ 他のgetter（timing/project/chart/perf）が従来通り動作する（回帰なし） → OK
```

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - `__analysisEditorDebug`の正式な扱い未確定（Phase87で発見・Phase116で解消。
    mutation系35関数を全撤去し、観測用の state/editorMode のみ
    `window.__CS_DEBUG__.analysisEditor` へ統合した）
- 今回新規に積み残したissue: なし

## 積み残し・保留バグ
なし

## 次フェーズ候補

たかっちの優先順位（Phase115 handoverより）:
```
① isChordLikeInputの末尾検証強化
新規: Undo/Redo後の変更箇所ナビゲーションUX（Future・構想段階）
```

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- `__analysisEditorDebug`の正式な扱い未確定（Phase87で発見・Phase116で解消。
  実コード確認の結果、公開項目は記録されていた22関数ではなく35関数＋2getter
  （計37項目）だった。Debug Layer自身がmutation APIを提供しない観測API
  として`state`/`editorMode`の2項目のみを`window.__CS_DEBUG__.analysisEditor`
  へ移設し、mutation系35関数（updateChord/deleteSelection/undoEdit等）は
  全撤去した。DevToolsからCommand Layerを直接操作する経路が廃止され、
  ユーザー操作による編集は通常のUI経路を通るようになった）

#### ADD
- No changes.

#### MODIFY
- No changes.

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ `__analysisEditorDebug`の正式化整理（Phase116・mutation系35関数を
    全撤去し、観測専用のstate/editorModeのみ`__CS_DEBUG__.analysisEditor`
    へ統合。DevTools経由でのCommand Layer直接操作経路を廃止）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 116 | `__analysisEditorDebug`の正式化整理（Phase74-Cから残置されていた
    mutation系35関数の直接公開を撤去。観測専用の`state`/`editorMode`のみ
    `__CS_DEBUG__.analysisEditor`へ統合。`timing.raw`/`normalized`の
    既存live reference方針に揃え、cloneはしない設計判断） | app.js |

- Future Candidates: 変更なし（次候補は①isChordLikeInput末尾検証強化）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
