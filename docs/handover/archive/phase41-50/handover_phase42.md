# 引き継ぎ: Phase42完了 — Analysis Persistence Redesign

## 作業状態
- ブランチ: phase42-design
- 直前作業: Phase42完了（Step1〜Step4全完了）+ regression修正

---

## Phase42 の成果

### 完了したもの

| Step | 内容 | ファイル |
|---|---|---|
| Step1 | analysis persistence layer | js/analysisLoader.js / js/app.js / js/project.js / server.py |
| Step2 | degraded mode / warning banner | js/app.js / js/chartmode.js |
| Step3 | スキップ（placeholder UI は将来） | — |
| Step4 | 旧形式 migration / cleanup | js/app.js |
| hotfix | loadChordData regression修正（Issue #48） | js/app.js |

---

## 確定した設計

### project.json（新形式）

```js
{
  id, title, lines, palette,
  hasAnalysis: true   // optional asset の存在期待フラグのみ
                      // ≠「analysis fileが今存在する」
}
```

### analysis/{project.id}.json（.gitignore対象）

```js
{
  version:     1,
  projectId:   "uuid",      // 取り違え検出用（最重要）
  generatedAt: "2026-...",
  raw:         { chords, beats, downbeats, bpm, timeSignature, meta }
}
```

### 3層分離

```
project.json          = source of truth（編集データ）
analysis/{id}.json    = regeneratable artifact（解析データ・.gitignore）
autosave              = editor recovery state（hasAnalysisのみ・rawは含まない）
```

### analysis load フロー

```
loadProj(project.json)
  ↓
hasAnalysis === true ?
  ↓ yes                        ↓ no
loadAnalysisFile(id)           Chart Mode非表示（静かに無効化）
  ↓ 成功        ↓ 失敗
projectId照合  degraded mode
  ↓ 一致        ↓
loadAnalysis() バナー表示:
Chart Mode有効 ⚠ 解析データが見つかりません
               Chart Mode は利用できません
```

### analysis save フロー（import時のみ）

```
chord JSON import
  ↓
loadChordData()
  ↓
loadAnalysis(raw) → project.analysis
  ↓
saveAnalysisFile(project.id, raw)  ← import時に即保存
  ↓
project.hasAnalysis = true
```

### 旧形式 migration（自動）

```
旧形式 project.json（analysis.raw 埋め込み）を開いた時:
  → analysis/{id}.json を自動生成
  → project.hasAnalysis = true
  → 次回 Ctrl+S で新形式に移行完了
  → コンソール: [analysis] migrating embedded analysis to external file
```

### UX方針

```
analysis missing = optional asset missing
  → エラーではない
  → projectは普通に開ける
  → Chart Modeだけ無効
  → バナーは控えめに表示

analysis mismatch（projectId不一致）= missing と同じ扱い
```

---

## 変更ファイル

```
js/analysisLoader.js
  - saveAnalysisFile(projectId, raw)  追加
  - loadAnalysisFile(projectId)       追加
  - version field 確認ロジック追加

js/app.js
  - loadChordData() async化・analysis persistence追加
  - loadChordData() renderPalette()復元（Issue #48）
  - loadProj() hasAnalysis対応・migration対応
  - showAnalysisMissingBanner() 追加
  - updateChartModeAvailability() 追加
  - resetProject() バナークリーンアップ追加

js/chartmode.js
  - openChartMode() に runtime guard追加

js/project.js
  - serializeProject(): analysis → hasAnalysis
  - deserializeProject(): analysis → hasAnalysis

server.py
  - do_OPTIONS() 追加
  - do_POST() 追加
  - _handle_save_analysis() 追加
    - path traversal 防止（UUID形式のみ）
    - analysis/ ディレクトリ自動作成
    - overwrite log
    - 500エラー時 Content-Type 付与

.gitignore
  - analysis/ 追加
```

---

## 既知の問題・保留事項

### Issue #47 — analysis authoritative source 二重化
状態: 意図的保留
内容:
  analysis/{id}.json を削除しても project reload 時に自動再生成される。
  IndexedDB chord asset が analysis.raw を保持しているため
  loadProj() → IndexedDB chord復元 → loadChordData() → saveAnalysisFile() が走る。
現状の authoritative source:
  1. analysis/{id}.json        （Phase42で新設・authoritative）
  2. IndexedDB chord asset内   （旧来のまま残存・legacy cache）
影響: 現時点では動作上の問題なし
対処予定: 将来 analysis versioning / migration 時に整理

### Issue #51 — loadChordData regression（修正済み）
原因: Phase42実装時に renderPalette() / pal-count 更新が脱落
修正: renderPalette() と pal-count 更新を復元
教訓: 大規模関数修正時は部分差分ではなく関数全体置換方式を使う

---

## 次フェーズ方針（Phase43）

### テーマ: Chord editing state stabilization

ChatGPTとの設計打ち合わせで以下が確認された。

**理由:**
- #44 は state contamination 系（undo / transpose / addChord が絡む）
- editor core の整合性問題が未解決のまま Chart Mode を広げると
  「表示だけ立派だが編集系が壊れやすい」状態になる
- カポ移調・chord token・undo・line state・diagram state・chart rendering
  が全部繋がっているため、編集コアの不整合は後で必ず波及する

**対象 issue:**

```
#44 AddChord / transpose / undo state contamination
  症状:
    - 自動登録されたコードが消える場合がある
    - AddChordでコード挿入時、カポ移調がズレた状態で挿入される
    - Undo実行後、カポ表示だけ戻るがtoken state / palette stateが不整合
  疑い箇所:
    preview transpose state
    palette transpose state
    actual inserted chord token
    undo snapshot state
    の責務境界崩壊

#43 N.C. / no chord semantic design
  症状:
    N.C. / NC / no chord 等が isChordLikeInput() に弾かれて入力不可
  推奨設計:
    { type: 'no_chord' } token化（案C）
    理由: token architecture と整合・transpose汚染回避・theory.js衝突なし

Chart Mode カポ反映問題（新規）Issue #48
  症状: Chart Modeにカポ移調が反映されない
  根拠: Editor表示・Diagram・Chart Modeで
        コード表現のsource of truthがズレ始めている兆候
  備考: #44 と根が近い可能性あり
```

**Phase43でやらないもの:**
- app.js 分割 Issue #49
- Chart Mode transport bar
- Chart Mode 歌詞同期
- resource/ ディレクトリ整理 Issue #52
→ 上記は editor core 安定後に対応

**Phase43の本質:**
単なる bugfix ではなく「コード表現レイヤの責務整理」になる可能性が高い。
これは app.js 分割前にやる価値がある。

---

## バックログ（将来検討）

### app.js 分割候補
状態: 検討中
背景: Phase42完了時点で app.js が2000行級に達しており
      大型機能追加のたびに UI更新漏れ・event registration漏れ等が発生しやすい
分割候補:
  projectLifecycle.js    → resetProject / loadProj / saveProject
  fileImport.js          → loadChordData / file-audio / file-chord
  paletteUI.js           → renderPalette / addToPaletteIfNew
  bannerUI.js            → showReloadBanner / showAnalysisMissingBanner
  analysisPersistence.js → saveAnalysisFile / loadAnalysisFile / updateChartModeAvailability
時期: Chart Mode 周辺・editor core 安定後に検討

### resource/ ディレクトリ構造整理 Issue #52
状態: 未着手
方針:
  samples/  → repo管理（バグ再現・fixture用）
  private/  → .gitignore対象（実曲・個人データ）
対象:
  resource/projects/samples/ / resource/projects/private/
  resource/chords/samples/   / resource/chords/private/
優先度: 低（public公開前に対応）

### Chart Mode 再生バー（mini transport）
状態: 未着手
内容: Chart Mode に mini transport（▶ + シークバー）追加
      現在はメイン画面で再生してから開く必要がある

### Chart Mode 歌詞同期
状態: 未着手
内容: onset に lyric fragment を追加

### replacementMap 拡充
状態: 随時
内容: 実曲でテストして不足分を追記

### analysis persistence redesign 残課題
- Issue #47（authoritative source二重化）整理
- [解析データを再インポート] ボタンの実装（Step3）
- analysis versioning / stale detection

---

## 運用ルール（変わらず）

- current-issues.md / phase-status.md / architecture.md / handover は
  Phase44完了時に棚卸し更新
- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- **大きな関数への変更は関数全体置換方式で提示する**
  （20行以上 / 複数条件分岐が絡む場合）
- 1つのファイル内で複数の修正がある場合はファイルごと渡して修正箇所を提示する。
