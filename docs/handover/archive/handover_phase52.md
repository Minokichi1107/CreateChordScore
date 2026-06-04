### 適用条件
- restore対象は `locked === true && chord !== null` の場合のみ
- confirm操作（コード追加・バーライン追加）はすべて commit 扱い
- Phase39-2の「open時にunlockする」方針は維持

### 再利用可能なパターン
将来の Add Simile / Inline Edit / Transpose Preview 等でも
同パターン（退避→commit/rollback）を再利用できる雛形になった。

---

## 積み残し・保留

特になし。Phase52の全修正は完結している。

---

## 次フェーズ候補

### A. 行またぎコード移動（中規模）
先頭コード→前行末尾 / 末尾コード→次行先頭への移動。
`moveChordAcrossLines` として app.js 内に設計済み（Phase38-3）。
editor core の token 操作に踏み込む最初のフェーズ。

### B. Chart Mode 3列/4列切替（中規模・設計フェーズが必要）
`MEASURES_PER_ROW` を定数→引数化。
render関数の引数追加が呼び出し元に波及するため設計フェーズが必要。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照