# 引き継ぎ: Phase58完了 — capo lifecycle stabilization + Chart header capo info

## 作業状態

* branch: main
* status: committed

---

## Phase58 の本質

Phase58 revealed that chord asset restoration and UI state restoration
were competing authority paths for capo lifecycle state.

単なる「capo reset バグ」ではなく、
`loadChordData()` が import path / restore path の両方から呼ばれていたことで
authority collision が発生していた。

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `loadChordData()` に `isRestore` フラグ追加 | IndexedDB restore経路での capo reset 副作用を排除 | js/app.js |
| IndexedDB restore呼び出しを `{ isRestore: true }` に変更 | `loadProj()` 内の chord restore が capo を上書きしなくなった | js/app.js |
| `_renderChartHeader()` に capo info 追加 | Chart header に `Capo N → Concert: X` を表示 | js/chartmode.js |
| `.chart-header-capo` スタイル追加 | `--capo-info-color` token 適用（Phase56追加済み） | css/components.css |

---

## 確定した設計原則

### loadChordData() の呼び出し経路分離（Phase58で確立）

```
手動 import 経路（isRestore = false, デフォルト）:
  capo reset を実行する
  → import normalization のために必要
    （import時の destructive transpose normalization）

IndexedDB restore 経路（isRestore = true）:
  capo reset をスキップする
  → capo lifecycle は loadProj() が uiState.capo で管理する

// NOTE [isRestore = true]:
// IDB restore path provides already-restored persisted chord data
// (NOT true canonical — destructive transpose has been applied at save time).
// Capo lifecycle is restored separately by loadProj() via uiState.capo.
// Therefore restore flow must NOT execute destructive capo rollback/reset.
```

将来 `loadChordData()` の呼び出しが増えた場合、
restore 経路かどうかを `isRestore` で明示すること。

### project.capo は正式 schema field（Phase58で確認）

Phase58 監査で `normalizeProject()` に以下が確認された：

```js
capo:
  typeof raw.capo === 'number'
    ? raw.capo
    : 0,
```

以前の「project.capo は schema 未定義」という前提は誤りだった。
ただし、**project.capo が表すのは "last destructive transpose state" であり、
projection-only capo model ではない**。

正確な現状：

```
capo persistence:   project schema 管理（normalizeProject / serialize / deserialize）
                    ただし保存値 = capo 適用後のコード列に対応する state
                    （true canonical ≠ current capo state）
capo UI authority:  DOM state (#capo) + _prevCapo
capo mutation:      destructive transpose model（architecture debt）
```

### Chart header capo info の表示ルール

```
capo = 0:           非表示（ノイズ回避）
capo > 0, key あり: Capo N → Concert: X  （transposeChord(key, capo) で実音キー算出）
capo > 0, key なし: Capo N               （キー不明のため矢印なし）
```

---

## 監査で判明した重要事項

### loadChordData() の二重経路問題（Phase55 → Phase58 で解決）

Phase55 handover に「loadChordData() の呼び出し経路整理が必要」として積み残されていた問題。

```
旧状態（Phase55〜57）:
  loadProj()
    → resetProject()               → capo = 0, _prevCapo = 0
    → uiState.capo を DOM + _prevCapo に反映  ← 正しく復元
    → IndexedDB chord restore
       → loadChordData()
          → capo = 0, _prevCapo = 0  ← ★上書きバグ（authority collision）

修正後（Phase58）:
  loadProj()
    → resetProject()
    → uiState.capo を DOM + _prevCapo に反映
    → IndexedDB chord restore
       → loadChordData(..., { isRestore: true })
          → capo reset スキップ  ← 修正済み
```

### initModals の getCapo authority 不整合（projection migration 前に統一必須）

```js
getCapo: () => project.capo ?? 0,
```

`project.capo` を直接参照している。
`getCapo()`（DOM読み取り）と authority が分裂している状態。

これは単なる「将来整理」ではなく、
capo projection 統合前に必ず統一すべき問題。
現在は `project.capo` と DOM が同期している前提で動いているが、
将来の projection model 移行時に破綻する可能性が高い。

---

## 積み残し・保留

### capo projection 統合（大規模・将来フェーズ）

現在の destructive mutation model から projection-only model への移行は未着手。
architecture.md §8 に記録済み。

```
現状:
  capo change → c.chord を直接書き換える
  project.json には capo 適用後のコード文字列が保存される（canonical ではない）

将来:
  capo change → 表示時のみ変換（projection model）
  project.json には canonical コード文字列を保存
```

### initModals の getCapo authority 不整合

上記「重要事項」参照。projection migration フェーズで統一すること。

### Chart Mode カポ表示（ヘッダー機能拡張）

現在は key が空の場合「Capo N」のみ。
将来 key フィールドを必須化または analysis から自動推定できれば
常に「Concert: X」表示が可能になる。

---

## 次フェーズ候補

### A. moveChordAcrossLines（editor core mutation）
先頭コード→前行末尾 / 末尾コード→次行先頭への移動。
注意: modal subsystem boundary・undo scope・cursor restore への波及に加え、
Phase57 の slot-semantic 化後は **slot semantic / measure ownership / carry propagation**
にも影響する可能性がある。以前より影響範囲が大きい。

### B. Chart Mode 再生位置クリック seek
slot DOM invariant 確立済み（Phase57）のため実装可能。
timing model との接続が必要。

### C. Chart Mode 並列表示（設計フェーズ）
editor renderer / chart renderer の single source of truth 設計が必要。
slot ownership 確立後の方が安定。

### D. isChordLikeInput 末尾検証強化（軽量）
現行は先頭のみ検証。`Cほげ` 等が通ってしまう。
`/^[A-G](#|♯|b|♭)?[a-zA-Z0-9()+\-susmajdimaugM♭♯#/]*$/` への強化。

---

## current-issues.md 変更内容

以下を更新予定（棚卸し時）：

- `カポ状態が新規プロジェクト読み込み時に引き継がれるバグ` → **完了（Phase58）**
- `loadChordData() 呼び出し経路整理` → **完了（Phase58）**

---

## commit message

```
feat: Phase58 capo lifecycle stabilization and chart header capo info

- add isRestore flag to loadChordData() to prevent capo reset on IDB restore
- fix IDB chord restore overwriting restored capo state
- add capo info to chart header: "Capo N → Concert: X" when key is set
- add .chart-header-capo style using --capo-info-color token
- confirm project.capo is official schema field (normalizeProject)
- note: project.capo represents last destructive transpose state, not canonical
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
