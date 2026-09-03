# Phase127 進行中スナップショット（チャット引き継ぎ用）

> 位置づけ: 正式なhandover_phase127.mdではない（フェーズ未完了のため）。
> docs/handover/README.mdの「micro-log」と同じ性質の下書きメモ。
> 新しいチャットでこのファイルを渡し、Phase127-D'から続行する。

---

## 完了した作業（127-A〜D）

### 127-A: Product Freeze（データ来歴表示機能）

```
目的: ライブラリの曲について「chordmini解析そのままか／人間が
      修正したか／外部資料と照合済みか」を一目で分かるようにする

UI仕様（確定）:
  進捗インジケーター方式。初期は灰●1個、条件を満たすごとに
  固定順（黄→青→緑）で●が追加される。

  ● 灰 = 何も記録なし
  🟡 = hasContentEdit（コード進行・タイミングの手動修正あり）
  🔵 = hasStructureEdit（セクション構成の手動設定・編集あり）
  🟢 = externalCheck.checked（外部資料と照合済み）

表示場所: Library一覧・Chart Modeヘッダーの両方（共有コンポーネント）
既存曲の扱い: 全て「未確認（灰）」からスタート（127-Fで再検討・後述）
```

### 127-B: Technical Design

```
データモデル:
  analysis.raw.provenance = {
    source: 'chordmini',
    hasContentEdit: boolean,      // 一方向フラグ（false→trueのみ）
    hasStructureEdit: boolean,    // 一方向フラグ
    externalCheck: {
      checked: boolean, reference: string, url: string,
      checkedAt: string|null, memo: string,
    },
  }

  project.provenanceSummary = {   // Library高速表示用の要約（派生データ）
    hasContentEdit, hasStructureEdit, externalCheck: { checked },
  }

Persistence Authority: analysis.raw.provenance（正本）
project.provenanceSummary: 派生データ（[PERSISTENCE OWNERSHIP PRINCIPLE]と
  同じ考え方。hasAnalysisフラグと同じパターンを踏襲）

[PROVENANCE FACT INVARIANT]（確定原則）
  hasContentEdit / hasStructureEditは「Commandがok:trueを返したか」
  ではなく「実際に値が変わったか」を記録する。
  一度trueになったフラグはUndoを含めfalseへ戻さない。
```

### 127-C: 自動検出・データ層（実装済み・ChatGPTレビューPASS）

```
変更ファイル: analysisLoader.js / analysisSession.js /
  analysisCommands.js / app.js / project.js

主な実装:
  normalizeProvenance()（analysisLoader.js） 
    既存曲でprovenance欠損時のデフォルト値付与
  hasContentEdit対象コマンド（値比較が必要な2箇所のみ抜粋）
    updateChordCommand: Object.assign前後の値比較で誤検出防止
    moveBoundary()ラッパー: ドラッグの「クリックのみ・移動なし」を除外
    他は無条件true可（delete/split/add/merge/paste系・shiftAll等）
  hasStructureEdit対象コマンド
    renameSectionCommand / updateSectionBoundaryCommand: 値比較あり
    createSectionCommand / deleteSectionCommand: 無条件true可
  beginAnalysisEdit(): raw.provenanceからのclone-in
  saveAnalysisEdit(): raw.provenanceへの書き戻し + 
    syncProvenanceSummary() + autoSaveLocal()

監査済み: cutSelectionCommand/replaceCurrentMatch等は委譲により
  透過的にカバー済み（個別実装不要と確認済み）
```

### 127-D: ●表示UI（実装済み・実機確認済み）

```
変更ファイル: components.css（共有.provenance-dots）/ library.css
  （library-item-title-row新設・長い曲名でも●が隠れないよう構造分離）/
  app.js（renderProvenanceDots()共通ヘルパー）/ chartmode.js
  （依存注入経由でヘッダーに表示）

実機確認結果:
  ✓ Library一覧の灰●表示
  ✓ Chart Modeヘッダーの灰●表示
  ✓ 長い曲名でも●が見切れない
  ✓ 3テーマでの視認性
  ✗ Tooltipが不安定（真上hoverでも出たり出なかったりする）
    → 9pxへ拡大する応急対応も実施したが根本解決になっていない
```

---

## 未完了（次チャットで着手）

### 127-D': Tooltip独自機構化（次にやること）

```
結論: ネイティブtitle属性は信頼性が低いため廃止し、Chart Mode
  hover chord diagram（architecture.md §9.5・Phase67）と同じ設計
  原則（pointerover/out event delegation・専用tooltip DOM・
  ephemeral state・chartStateにauthorityを持たせない）を流用した
  共有Tooltip機構を新設する。

設計方針: Library・Chart Mode両方の.provenance-dotから使える
  共通部品として設計する（Chart Mode専用コードのコピーにしない）。

未着手。次チャットの最初のタスク。
```

### 127-E: Provenance Popover（外部資料確認UI）

```
ドットクリックで開くポップオーバー。参照元名・URL・確認日・メモの
入力フォーム。実装方針は127-B時点の設計のままだが、詳細UI未着手。
```

### 127-F: 既存データの状態補完（設計方針確定・実装未着手）

```
今回のチャットでの重要な発見（ChatGPTレビュー済み）:

Sectionとコードで、遡及検出の可否が非対称であると判明した。

  hasStructureEdit（Section）
    → raw.sections.length > 0 という事実は確認可能
    → 自動バックフィルは安全に実現できる
    → ただし意味を「Sectionを過去に人間が編集した」ではなく
      「Section構成が設定されている」に変更する
      （事実ベース原則：存在は証明できるが、誰がいつ作ったかは
      過去データから証明できないため）

  hasContentEdit（コード・タイミング）
    → chordmini生出力を保存していないため、どのコードが後から
      修正されたか判定する手段が原理的にない
    → 自動遡及は不可能。手動申告方式も「検出事実」と「自己申告」の
      区別が曖昧になるため一旦保留とした
    → 将来的にchordmini生データと編集後データの両方を保持する
      設計に変更すれば真の意味で追跡可能になるが、大規模な設計変更
      のため今回のPhase127には含めない

未着手。127-Eの後、または並行して着手可能。
```

---

## 今回導入した試験プロセス（Phase127途中導入）

```
User Intent → Exploration → Technical Design → Risk Check
  → Implementation → Validation → Review/Handover

Risk Check判定基準: Named Invariant / Authority / Architecture境界 /
  Product Intent・UX / 設計不確実性 のいずれかに該当する場合のみ
  Review Candidateとする。

今回1件、Review Candidateとして機能した実例:
  「Sectionの遡及バックフィルの意味定義」（Product Intent/UX該当）
  → ChatGPTレビューを経て「編集した」ではなく「設定されている」へ
    意味を修正して決着した

Phase127終了時にProcess Experiment Reviewを行う予定（README正式反映は
  Phase127完了後に判断）。
```

---

## 新チャットでの再開方法

1. このファイルをプロジェクトにアップロード（またはメッセージに添付）
2. 「Phase127-D'から続けてください。スナップショットは添付の通りです」
   のように伝える
3. リポジトリは `bash_tool + git clone` で毎回取得し直す
   （前回チャットのクローンは引き継がれないため）
