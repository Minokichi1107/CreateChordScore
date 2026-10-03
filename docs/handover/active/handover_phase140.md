# 引き継ぎ: Phase140完了 — Section UX（#95 並べ替え / #104 日本語プリセット / #96 名前連動）

## 作業状態
- ブランチ: `feature/phase140-section-ux`
- 直前作業: Phase140完了（3 Issueとも実装・実機確認済み）
- **コミット**: #104 実施済み / #96 実施済み（または直前） / #95 と本handoverは未実施。Claudeはcommitしていない
- GitHub上の #95 / #96 / #104 のclose: **未反映**（コミット・push後に行う）
- 配置時の運用: `docs/handover/active/` の `handover_phase139.md` を `archive/` へ `git mv` してから本ファイルを置く

---

## 1. 目的と結果
- [x] #104 Section種類に日本式プリセット（イントロ〜アウトロ12種）を追加。既存の英語種類は維持
- [x] #96 種類を変えたとき、Section名が自動名のままなら追従
- [x] #95 `#section-bar` のSectionチップをドラッグで並べ替え（Undo/Redo対象）
- [x] 保存形式の変更なし・移行なし

## 2. 実装内容（差分パッチ3本。104→96→95の順）
| パッチ | 内容 | 変更ファイル |
|---|---|---|
| `phase140-issue104.patch` | 種類のグループ切替（日本式/English）＋プルダウン | js/app.js / css/analysis-editor.css |
| `phase140-issue96.patch` | 種類変更時の名前連動 | js/app.js |
| `phase140-issue95.patch` | Section並べ替え | js/analysisCommands.js / js/app.js / css/analysis-editor.css |

### #104
- `SECTION_TYPES` を `{value,label,group}` 化。日本式は `jp-` 接頭辞のキー（jp-intro, jp-a-melo, jp-b-melo, jp-sabi, jp-ato-sabi, jp-kanso, jp-c-melo, jp-solo, jp-break, jp-ochi-sabi, jp-dai-sabi, jp-outro）
- `DEFAULT_SECTION_TYPE = 'verse'`（初回表示は English グループ）
- 補助関数: `_sectionTypeGroupOf` / `_loadSectionTypeGroup` / `_saveSectionTypeGroup` / `_defaultTypeForGroup` / `_renderSectionTypePicker` / `_bindSectionTypePicker`
- 作成モーダル: 最後に使ったグループを localStorage `cs.sectionTypeGroup` に記憶。変更モーダル: 現在の種類のグループで開く（記憶しない）

### #96
- `_isAutoSectionName(name, type)`（自動名か判定: 「ラベル」or「ラベル 数字」）
- 作成モーダル: 種類を選び直すと常に名前を上書き
- 変更モーダル: 名前が「前の種類の自動名」のままなら追従。元の種類に戻したら元の名前に復元
- 連番の詰め直しは決めていない（未実装）

### #95
- `reorderSectionCommand(state, sectionId, toIndex)`（Command Layer。Result `{ok, reason?}`。`pushHistory` 1回。reason: section-not-found / invalid-index / same-position）
- app.js: Pointer Eventsドラッグ（閾値8px、確定後のみ setPointerCapture、直後のclick抑止、pointercancel/Escapeで中止、ドラッグ中は再描画しない、浮きチップ＋破線の挿入位置）
- 確定は `_commitSectionReorder` → `_recRecord('reorderSection', …)` → `_refreshEditorView('reorderSection')`
- 後始末: `renderSectionBar()` 冒頭と `resetAnalysisEditor()` で `_teardownSectionDrag()`（[EDITOR RESET AUTHORITY] 準拠）

## 3. 確定した設計原則（Named Invariant）
### 【Section表示順は位置と独立】（SECTION ORDER INDEPENDENCE）— 採用決定（ChatGPT確認済み）
- 並べ替えは `session.sections` の配列順のみを変える
- `startChordId/endChordId`、Chart範囲、Preview、スクロールは変えない
- 別の displayOrder モデルは持たない
- architecture.md への追記は、Windows側のコミット・Phase棚卸しのタイミングで行う（現時点は未反映）

## 4. 設計判断の経緯
- #104: 長い optgroup 付き select は縦に長すぎ不採用 → グループ切替トグル＋短いプルダウン（覚え方は localStorage 記憶＝案C）
- #96: 作成モーダル＝常に上書き / 変更モーダル＝前の自動名のままなら追従 / 連番詰め直し＝保留
- 英語キーと `jp-*` は別の種類（Verse ≠ Aメロ）。対応づけは将来の Section Identity / コード連動設計で扱う
- 却下: 切替時に近い種類へ連動、「名前を種類に合わせる」ボタン、プルダウン角丸（ネイティブ描画のため断念）

## 5. テスト・実機確認
- 単体: 並べ替えコマンド12 / ドラッグ模擬(jsdom)21 / #96 17 / #104 12 項目PASS、構文チェック済み
- 実機: #104 全項目OK、#96 全項目OK、#95 12項目すべてOK（4テーマで浮きチップ・枠の視認性も確認）

## 6. 積み残し・保留
- [ ] Verse⇄Aメロ等の対応づけ（Section Identity / コード連動）— **Issue化推奨**（「Verse=Aメロと決める」ではなく「関係を将来どう扱うか検討する」Issue）
- [ ] 連番の詰め直し（未決定）
- [ ] 保存済み `type` が選択肢にない場合、変更モーダルで先頭が選ばれる（#125 のTechnical Designでまとめて扱う）
- [ ] 名前欄 `value="${section.name}"` の `"` エスケープ漏れ（明確な不具合。軽微Issueとして別立て）
- [ ] 削除確認文言「この操作はUndoできません」が実態と不一致（#103候補）
- [x] 初回起動時の既定グループは English のまま（決定。#104の目的は選択肢の追加で、既定値の変更ではないため）
- [ ] 運用メモ（緊急ではない）: チャットに貼ったGitHubトークンは、publicリポジトリのread-onlyであれば緊急失効は不要。他のprivate repo等への権限がないことだけ確認する。今後はトークンを貼らない運用を検討

## 7. Out of Scope
- ユーザー管理プリセット（→ #125）
- 保存形式の変更、displayOrder の導入、Sectionの型の同値判定

## 8. Issue状態変更記録
- 完了: #95 / #96 / #104（GitHub closeは未反映）
- 次フェーズ候補: #125（Sectionプリセット管理）、#103、Section拡張（コード連動）

## 提案コミット（1コミット1目的）
```
feat(section): 日本式Section種類プリセットを追加 (#104)
feat(section): 種類変更時にSection名を連動 (#96)
feat(section): Sectionチップのドラッグ並べ替え (#95)
docs(handover): Phase140 handover
```

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md
#### ADD
- No changes.（積み残しはGitHub Issue化を開発者が判断）
#### MODIFY / CLOSE
- No changes.

### phase-status.md
- Current Status に追加: 「Phase140 — Section UX。#104 日本式種類プリセット（`jp-*`）、#96 種類変更時の名前連動、#95 Sectionチップのドラッグ並べ替え（`reorderSectionCommand`）。保存形式不変。実機確認済み。」
- Major Milestones に追加: `140 | Section UX（並べ替え・日本式プリセット・名前連動） | analysisCommands.js / app.js / analysis-editor.css`
- ※ phase-status.md は Phase137 で止まっているため、Phase138/139 も合わせて棚卸しが必要

### architecture.md
- 【Section表示順は位置と独立】を追記（採用決定済み。表記例: SECTION ORDER INDEPENDENCE）。Command Layer の Section Commands 一覧に `reorderSectionCommand` を追加
- section-model.md §4.1: `jp-` 接頭辞の種類キーの注記

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
