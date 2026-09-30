# Phase136-B 引き継ぎメモ

> ステータス: **実装・実機確認完了**
> 対象: `editing=false`（Continuous Chord Projection／連続実時間表示経路）に対する追加機能
> 次の作業: Documentation Checkpoint → Git差分確認 → push → 次PhaseのProduct Intent確認

---

## 0. Phase136-Bの目的

Phase136-Aで成立した **Continuous Chord Projection（連続実時間投影）** を、通常のChart Modeで実際に使える品質まで仕上げる。

Phase136-Bでは次の3項目を扱った。

1. **Cross-Measure Label Placement（小節をまたぐコード名の配置）**
2. **Continuous Playhead（実時間に追従する再生位置表示）**
3. **`measuresPerRow` UI（1～4小節／行の切り替えUI）**

---

## 1. Phase136-BのScope

### 実施した項目

| 項目 | 状態 | 内容 |
|---|---|---|
| Cross-Measure Label Placement（小節跨ぎラベル配置） | 完了 | 小節をまたぐコードのラベルを表示可能なSegmentへ配置 |
| Continuous Playhead（連続再生位置表示） | 完了 | Continuous経路でも再生位置を実時間で滑らかに表示 |
| Bar-line Snap（小節線スナップ） | 完了 | 小節線近傍のコード境界を表示上のみ小節線へ寄せる |
| `measuresPerRow` UI（1～4列） | 完了 | Chart Modeの列数選択肢を1～4列へ拡張 |

### Phase136-Bの対象外

以下は今回も変更していない。

- Root Color
- Measure / Beat / Chord hierarchy再設計
- Slot Allocation
- Slot Model再設計
- Downbeat Model再設計
- Measure Model再設計
- 6/8等のcompound meter対応
- Collisionの新しい自動解決方式
- 0.4 Beat等を利用したChord自動非表示・自動削除の製品仕様化
- `quantize()` / `anticipationWindow` をContinuous再生位置計算へ持ち込む変更

---

## 2. 実装結果

### 2.1 Cross-Measure Label Placement

実装済み。

判定の基本方針はTechnical Designで確定した内容を維持している。

```text
neededPx = 実測文字幅 + 4px

1. 最初のSegmentがneededPx以上なら、最初のSegmentに表示
2. そうでなければ、全Segment中で最も幅の大きいSegmentへ表示
3. 選ばれなかったSegmentのラベル文字だけを消す
   （Segment自体、dataset.chord、dataset.chordId、色付き帯は保持）
```

- 単一Measureで完結するChordは従来通り表示。
- `raw.chords` 等の元データは変更しない。
- 3Measure以上にまたがるChordで、発音開始位置とラベル位置が一致しない場合は仕様として許容。

### 2.2 Continuous Playhead

実装済み。

Continuous経路では `getContinuousMeasurePosition(currentTime)` を利用し、再生位置を連続値として表示する。

Editing Mode（`editing=true`）では既存Slot経路を維持している。

重要な責務境界：

```text
Playback Authority
  → currentTime（最終的にはaEl.currentTime）

Continuous表示位置
  → getContinuousMeasurePosition(currentTime)

Slot配置
  → quantize() / anticipationWindow
```

Continuous再生位置の計算に `quantize()` や `anticipationWindow` を流用していない。

### 2.3 Bar-line Snap

実装済み。

- `BAR_LINE_SNAP_BEATS = 0.25`
- 表示用のコード境界だけを小節線近傍でスナップする。
- `raw.chords` / `raw.beats` は変更しない。
- `quantize()` の責務も変更しない。

### 2.4 `measuresPerRow` UI

実装済み。

Chart Modeの列数選択肢を、

```text
1列
2列
3列
4列
```

へ拡張した。

既存の `chartMeasuresPerRow`、localStorage保存、Renderer側の汎用的な行折り返し処理は変更していない。

確認した設計上の事実：

- Rendererはもともと任意の `measuresPerRow` 値を行折り返し数として扱える。
- 今回はUI側の選択肢を1～4列に拡張しただけ。
- 既存の3列・4列の挙動を変更していない。
- デフォルト3列を維持している。
- 既存のlocalStorage値はそのまま利用できる。

---

## 3. 実機確認

Phase136-Bの①～③について実機確認を完了した。

### Cross-Measure Label Placement

- 小節をまたぐChordのラベル配置を確認。
- Continuous表示での表示位置を確認。
- 既存のSlot経路への影響がないことを確認。

### Continuous Playhead

- Continuous経路で再生位置が滑らかに移動することを確認。
- 小節境界でのActive Measure切り替えを確認。
- Editing Modeへ切り替えた場合の既存Slot表示を確認。
- Editing Modeから通常表示へ戻る動作を確認。
- コンソールエラーなし。

### Bar-line Snap

以下を確認済み。

1. 小節線直前のChordが適切にスナップする。
2. 小節線直後のChordが意図せず潰れない。
3. 小節線から離れたChordはContinuous表示のまま。
4. 小節をまたぐ表示が破綻しない。
5. 1 Beatの短いMeasureでも破綻しない。
6. Continuous Playheadの基本位置計算はスナップ導入前と変わらない。

### `measuresPerRow`

1～4列の実画面表示を確認済み。

---

## 4. 保留事項

### Issue #120 — 右端小節のContinuous Playhead描画乱れ

GitHub Issue #120として保留。

症状：

- 3列・4列いずれでも、行の右端小節でContinuous Playheadが一時的にぎくつく／細く見えることがある。
- `scrollIntoView()`を無効化しても改善しなかった。
- Paint flashingでは右端だけに特有の再描画は確認できなかった。
- 右端小節専用の特別処理や、行をまたいでChordを接続する専用コードは確認されていない。
- `.chart-measure--active` の毎フレーム更新は確認されているが、これが原因であるとは未確認。
- Performance TraceではRendering / Painting負荷が観測されたが、原因との因果関係は未確定。
- DevTools上で明確なopacity変更は確認されていない。

したがって、**原因未特定のまま保留**とする。

今後調査する場合は、実測されたボトルネックに基づいて、

- Active Measure更新方法
- Playheadの描画方法
- Performance Trace

などを個別に確認する。

今回のPhase136-Bで無理に修正しない。

---

## 5. server.py 不安定化について

Phase136-Bの作業中、ローカル `server.py` が不安定になる現象が観測された。

現時点で確認できていること：

- Phase136-Bの3つの実装commitは `server.py` を変更していない。
- JavaScript / HTML側の変更とPythonプロセス側の不安定化について、直接の因果関係は確認されていない。
- 長時間のChart Mode再生確認、DevTools調査、頻繁なリロード、Git操作などが重なった状況証拠はある。
- ただし、これだけでは原因を断定できない。

したがって、これは**Phase136-Bのコード原因として扱わず、「観測事項・原因未確定」として引き継ぐ**。

次回発生した場合は、`server.py`を実行しているターミナルの状態やエラーメッセージを確認して切り分ける。

実務上は、

- `server.py`用ターミナルとGit等の作業用ターミナルを分ける。
- 長時間の検証後に必要ならサーバーを再起動する。

程度を当面の対策とする。

---

## 6. 軽微な技術的負債

`_renderChartGridContinuous()` のdocstringに、Phase136-A時点の古い記述が1箇所残っている。

現在の実装ではPlayhead位置更新の責務が更新されているため、次回このファイルを触る機会にdocstringを更新する。

これはPhase136-Bの動作不具合ではなく、軽微なDocumentation Debt（文書と実装のずれ）として扱う。

---

## 7. Git状態

実機環境で確認された現在のGit状態：

```text
On branch feature/chart-slot-assignment
Your branch is ahead of 'origin/feature/chart-slot-assignment' by 3 commits.

Untracked files:
  docs/handover/active/phase136-b-handover.md
  tools/measure-barline-offsets.mjs
```

直近のcommit：

```text
ab8e308  feat: add 1-column and 2-column options to Chart Mode column switcher
bf57089  feat: add bar-line snap for continuous chord display
fb3e4e2  feat: add continuous chart playhead
59a2010  docs: update handover documentation writing rules
85a9e49  feat: add continuous chord projection
```

`ab8e308` が現在のHEAD。

Phase136-Bの3つの実装commitはまだ `origin/feature/chart-slot-assignment` へpushしていない。

> 注意：以前のClaude報告に記載されたcommit hashとは異なる。引き継ぎ資料では、実機で確認した上記のGit状態を正とする。

---

## 8. 未追跡ファイルの扱い

### `docs/handover/active/phase136-b-handover.md`

この資料自体をPhase136-Bの正式な引き継ぎ資料として更新した。

Documentation Checkpointで内容を確認した後、Git管理対象にする。

### `tools/measure-barline-offsets.mjs`

Phase136の調査用スクリプトとして未追跡状態。

現時点では内容を確認できていないため、**この資料ではcommit対象・削除のいずれとも決定しない**。

次にローカル環境で内容と再利用性を確認し、

- 継続利用する開発ツールならGit管理
- Phase136限りの一時調査ファイルなら削除

のどちらかを判断する。

---

## 9. Phase136-Bで維持されたArchitecture Boundary（アーキテクチャ上の責務境界）

```text
analysis.chords
    ↓
Continuous Chord Projection
    ↓
Chart Mode Rendering

Playback Authority
    ↓
currentTime / aEl.currentTime
    ↓
Continuous Playhead

Slot placement
    ↓
quantize() / anticipationWindow
```

重要な不変条件：

- `raw.chords` / `raw.beats` は変更しない。
- Continuous Projectionは表示専用の非破壊Projection（投影）として扱う。
- `editing=true` の既存Slot経路は変更しない。
- `quantize()` / `anticipationWindow` はSlot配置の責務として維持する。
- Continuous再生位置計算へSlot配置用の量子化を持ち込まない。
- Slot Model / Downbeat Model / Measure Modelの再設計はPhase136-Bの対象外。

---

## 10. Phase136-Bの完了判定

```text
① Cross-Measure Label Placement    ✅
② Continuous Playhead              ✅
   └─ Bar-line Snap                 ✅
③ measuresPerRow UI                ✅

Issue #120                           ⏸ 保留
server.py不安定化                   ⏸ 原因未確定の観測事項
docstringの古い記述                 ⏸ 軽微な技術的負債
```

**Phase136-Bの実装・実機確認は完了。**

ここからは新しい実装を追加せず、Documentation CheckpointとGit整理を行ってPhase136-Bを閉じる。

---

## 11. 次の作業

1. この引き継ぎ資料を最終確認する。
2. `tools/measure-barline-offsets.mjs` の扱いを決める。
3. `git status` / `git diff` / `git log` を確認する。
4. 引き継ぎ資料をcommitする。
5. Phase136-B関連commitをpushする。
6. push後のbranch状態を確認する。
7. 次PhaseのProduct Intent（製品として次に何を実現するか）を改めて確認する。

次Phaseでは、Phase136-BでScope外としたSlot Model、Downbeat / Measure、Collision等を、未解決課題の優先度に従って別途扱う。
