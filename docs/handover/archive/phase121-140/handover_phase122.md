# 引き継ぎ: Phase122完了 — Debug Session Recorder Diagnostic Timeline設計固定

## 作業状態
- 直前作業: Phase121完了（Debug Session Recorder — Mutation Recording基盤）
- 本フェーズはコード変更を伴わない設計フェーズ（Design Freeze）。

---

## 1. Purpose（目的）

Phase121の実機検証で、「Mutationが起きたこと」と「ユーザーがどう操作して
そこに至ったか」は別の情報であることが判明した。Phase122では、Recorderの
最終目的（Reproducible Diagnostic Session）を「操作記録の精密化」ではなく
「ユーザー操作を起点とした内部イベント・状態遷移の因果関係を時系列で
追跡できること（Diagnostic Timeline）」として再定義し、仕様を固定した。

---

## 2. Scope（今回やったこと）

- 現行コード（app.js/chartmode.js/analysisSession.js/analysisCommands.js/
  debugSessionRecorder.js）を対象に、Semantic Interaction候補の網羅調査
- Boundary操作のmethod付与案（3案比較）の検討 → 過去バグ逆算の結果、
  「Mutation Event詳細化」だけでは不十分と判明
- 過去の実バグ（current-issues.md／docs/handover/記録済み）を逆算し、
  記録すべき項目をLevel 1〜3に分類
- `record()`の意味論調査（失敗イベント対応の実現可能性を実コードで検証）
- render呼び出し9箇所の実地棚卸し（「意図的な特殊経路」と「暗黙の前提
  頼み」の分類）
- `docs/debug-recorder-design.md` を新設し、設計を確定

---

## 3. Out of Scope（今回はやらないと決めたこと）

- **Replay機能**（記録された操作列の自動再実行）。Diagnostic Timelineは
  「再現時の証拠」であり「再現操作そのもの」ではないと明確に区別した
  （`[TIMELINE NOT REPLAY]`）
- **JSON Export**（Phase121に続き見送り）
- **全クリック・キー入力・座標等の操作記録**（Privacy Boundaryにより
  恒久的にスコープ外）
- **render経路の全面統合**。複数経路の存在自体は設計ミスとは限らない
  （Section Preview切替等、意図的な部分再描画が実在する）と実地調査で
  確認したため、統合ではなく「経路を識別可能にすること」のみを要件とした
- **実装（record()シグネチャ変更・呼び出し箇所改修・render経路ラベル
  設計等）**。すべてPhase123以降へ持ち越す

---

## 4. Named Invariants

Phase122で以下を確立した（`docs/debug-recorder-design.md` §10）。

- `[DIAGNOSTIC TIMELINE AUTHORITY]` — 単一時系列（既存`_events`）を維持する
- `[TIMELINE NOT REPLAY]` — Replay機能と混同しない
- `[STATE TRANSITION OVER STATE VALUE]` — 現在値ではなく変化そのものを
  追跡可能にする
- `[MUTATION ATTEMPT RECORDING]` — 「ユーザー操作」と「Mutation attempt」
  を区別した上で、Mutation attemptは失敗・キャンセルも記録対象に含める
- `[RENDER PATH VISIBILITY]` — 経路・参照元の識別可能性のみを要件とし、
  実装方法は規定しない
- `[RECORDING ADOPTION CRITERIA]` — 新規記録項目追加の歯止め（過去の実
  バグまたは複数診断課題への具体的必要性を根拠とする）

これらはPhase123以降の実装・レビュー時の判断基準とする。Phase122では
実装を伴っていないため、architecture.mdへのNamed Invariant反映はまだ
行わない（8.参照）。

---

## 5. Phase121からの更新

Phase121のhandoverで「Phase122で必ず解決する」と明示されていた以下は、
Phase122で**設計レベルで**解決した（実装はPhase123）。

- Section境界移動のReportに意味的な操作情報が不足している問題
  → `[MUTATION ATTEMPT RECORDING]`・Boundary操作のmethod（drag/keyboard/
    button）記録という形で設計に組み込んだ
- Semantic Interaction Eventの記録不足
  → 「操作ログとして記録する」設計ではなく、「Mutation attemptと内部
    イベント（reconcile・render・session lifecycle）の因果関係を追う」
    設計として再定義した

Phase121の「Mutation Recording基盤」（`debugSessionRecorder.js`の
`record()`/`buildReport()`等）は、構造を変更せずPhase123以降も実装基盤
として引き継ぐ。Phase121のhandover自体は書き換えない（起票時点の事実
として正確なため。設計が進化した経緯はPhase122側の記録として残す）。

---

## 6. Phase123 Starting Point（次フェーズ開始位置）

Phase123着手時、まずコードを書く前に以下を設計する。

1. `debug-recorder-design.md` §4 Level 1〜2を実装単位へ分割する
   （「1フィーチャー1コミット」原則に従い、複数フェーズへさらに分割してよい）
2. **Timeline Eventの粒度**を決定する（本設計書が意図的に未確定の
   まま残した主要な実装設計論点。他にも§11に列挙した論点が残っている
   が、実装着手時に最初に判断が必要になるのはこの粒度である）
   - 例: 1 Mutation attempt = 1 Event + diagnostic fields（reconcile
     結果・render経路等を同一イベントに同梱）とするか
   - 例: 1 Mutation attempt = 複数の独立したEvent（`mutation`/`reconcile`/
     `render`を別行にする）に分解するか
   - 実コードとの整合性（呼び出し箇所の自然さ・Report可読性）を確認した
     上で決定する
3. render経路の実装上の識別方法を設計する（`[RENDER PATH VISIBILITY]`
   の要件を満たす具体的な実装。ラベル文字列／ヘルパー関数の要否等）
4. Mutation attemptの`record()`呼び出し位置を確定する（早期returnの前へ
   移動する必要がある箇所の洗い出し）
5. 実装後、`docs/debug-recorder-design.md` §11のスコープ外リストと
   照らして逸脱がないか確認する

---

## 7. Documentation（Phase123完了時に行うこと）

- `architecture.md` §5.5へ`docs/debug-recorder-design.md`の参照を追加
  （section-model.mdと同じ運用パターン。§8参照）
- `phase-status.md`へPhase122完了・Phase123完了を反映
- 本handoverを`archive/`へ移動

---

## 8. architecture.mdへの反映タイミングについて

`docs/handover/README.md`の「Named Invariant即時反映ルール」は実装を
伴う設計変更を対象とした運用である。Phase122は設計固定のみでコード
変更を伴わないため、この通常のドキュメント更新プロセスがまだ発生する
段階に至っていない、という扱いとする（ルールの例外を作るものではない。
section-model.mdがPhase98仕様固定時点ではarchitecture.md未反映で、
Phase99実装着手時に反映されたのと同じ扱い）。

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
  （Phase121が引き継いだ「Section境界移動の意味情報不足」は設計レベルで
  解決したが、実装（Phase123）が完了するまで実際の挙動は変わらないため、
  ここではcloseしない。なお当該課題はPhase121時点でcurrent-issues.mdへの
  ADDは行われておらず、handoverチェーン内でのみ引き継がれている項目）
- 今回新規に積み残したissue: なし

---

## 9. Next Phase

**Phase123: Diagnostic Timeline Implementation**

詳細設計は `docs/debug-recorder-design.md` を参照。

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
