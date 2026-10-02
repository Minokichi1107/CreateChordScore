# 引き継ぎ: Phase139完了 — Issue #118 Analysisファイル名の人間可読化

## 作業状態
- ブランチ: `main`（基準コミット `5515957`＝Phase138 handover）
- 直前作業: Phase139完了（実装・実機確認・既存ファイルの移行まで完了）
- **コミット: 未実施**（差分パッチ3本を手元に適用した状態。Claudeはcommitしていない）
- Issue #118 のGitHub上のclose: **未反映**（コミット・push後に行う）
- 配置時の運用: `docs/handover/active/` の `handover_phase138.md` を `archive/` へ `git mv` してから本ファイルを置く

---

## 1. 目的と結果

- [x] 新規Analysisを `{artist}-{title}_{projectId}.json` で保存する
- [x] 曲名・アーティストを後から入力・変更しても、ファイル名が追随する
- [x] 既存265件（実機では分析時点で270件）のUUID名を、一度限りの移行で整理する
- [x] Analysis JSONのschema・`generatedAt`・`baseVersion` の意味は変更しない

---

## 2. 実装内容（差分パッチ3本。1→2→3の順に適用）

| パッチ | 内容 | 変更ファイル |
|---|---|---|
| `phase139-issue118.patch` | ファイル解決の一本化、新規時の名前生成、load時のID照合 | server.py / analysisLoader.js / app.js / architecture.md |
| `phase139-issue118-rename.patch` | 入力確定時の改名（`/rename-analysis`） | server.py / analysisLoader.js / app.js / architecture.md |
| `phase139-issue118-migrate.patch` | `dryRun` と一度限りの移行スクリプト | server.py / analysisLoader.js / tools/migrate-analysis-filenames.js（新規） / architecture.md |

### server.py
- `resolve_analysis_file(projectId)`（既存の実ファイルを特定）: `{id}.json` と、UUID形式のIDのみ `*_{id}.json` を探す。結果は `none` / 1件 / `multiple`
- `build_analysis_filename(projectId, nameHint)`（新規作成時だけ名前を生成する純粋関数）
- `do_GET`: `/analysis/{id}.json` のみ解決結果の実ファイルを返す（200 / 404 / 重複時409）。他のURLは従来の静的配信
- `/save-analysis`: `nameHint` を除去して書込み（JSONに保存しない）。既存ファイルがあればそのファイル、なければ新規名。複数一致は409 `duplicate`
- `/rename-analysis`（新設）: 現在の `artist/title` に合わせて `os.replace` で改名。`dryRun: true` なら判定のみ

### js/analysisLoader.js
- `saveAnalysisFile(..., nameHint)`: 5番目の任意引数を追加。payloadへ `nameHint` を含める
- `loadAnalysisFile()`: JSON内 `projectId` が要求IDと一致しなければ `null`（`console.warn`）
- `renameAnalysisFile(projectId, nameHint, { dryRun })`（新設）

### js/app.js
- `_analysisNameHint(p)`（artist/titleを取り出す）を新設。現在の曲を保存する6か所に適用（`loadChordData()` の取り込み保存を含む）
- 曲名欄・アーティスト欄の `change` で `renameAnalysisFile()` を呼ぶ（`hasAnalysis` の曲のみ）
- 別曲を操作する保存2か所（外部確認・バックフィル）は無変更

### tools/migrate-analysis-filenames.js（新規・開発者向け）
- アプリ本体は import せず、UIもない。ConsoleからES moduleとして実行する
  ```
  const m = await import('/tools/migrate-analysis-filenames.js')
  await m.dryRun()   // 内訳のみ。ファイルは変更しない
  await m.run()      // 確認ダイアログのあと実行
  ```
- 対象はLibrary（IndexedDB）の `hasAnalysis === true` の曲のみ。`analysis/` は走査しない
- 直列実行・1件失敗しても継続。`run()` は `dryRun()` の結果を引き継がず、毎回server側で再判定

### ファイル名の仕様
- `{artist}-{title}_{projectId}.json`。片方のみなら使える方だけ、両方空なら `{projectId}.json`
- 禁止文字 `\ / : * ? " < > |` と制御文字は `_` に置換。先頭・末尾の空白と `.` は除去。artist+title部は約60文字（判別用の上限で、識別は末尾のIDが担う）
- 日本語・長音「ー」・全角記号はそのまま（`project.js` の保存用sanitizeとは別規則）。実例: `樋口了一-1_6の夢旅人2002_…json`（タイトルの `/` が `_` になっている）
- 名前付き形式の探索・生成はUUID形式のIDのみ

---

## 3. 確定した設計原則（Named Invariant）

architecture.md へ即時反映済み（§9のANALYSIS AUTHORITY INVARIANTの直後。§13 Authority Indexの該当行も更新）。

### 【Analysisファイル解決】（ANALYSIS FILE RESOLUTION）
- `projectId` がAnalysisの唯一の論理キー。ファイル名は人間向けのProjection（導出表示）で、Authority（正本）ではない
- 実体の特定はserverの `resolve_analysis_file()` のみが行う。同一IDの実ファイルが複数ある場合は推測せずConflict（GET・保存・改名とも409）
- load / save / `baseVersion` の比較は、同じ1つの実ファイルを対象とする
- `artist/title` はファイル名生成にのみ使い、Analysis JSONには保存しない
- 保存処理（`/save-analysis`）は既存ファイルを改名しない。改名は入力確定時の `/rename-analysis` だけが行う
- 改名は名前の変更のみ（JSONの中身・`generatedAt` は不変）。同名・改名先が既存・両方空・該当なしは何もしない

### 【dry-runの不変条件】（DRY-RUN INVARIANT）
- `dryRun=true` は判定のみで、ファイルを一切変更しない（改名する場合の `renamed` だけ返す）
- dry-runの結果を実行の許可証にしない。実行時も毎回 `resolve_analysis_file()` から再判定する

### 【一度限りの移行】
- 既存ファイルの移行は開発者がConsoleから実行する。アプリ本体にはUIを置かない（architecture.mdに記載済み）

---

## 4. 設計判断の経緯

```
結論: 「入力確定時に追随して改名する」（案1）を採用。当初の「既存ファイルは改名しない（Plan 1）」を改訂

理由:
  実機確認で、新規登録したAnalysisが `{projectId}.json` のままになった。
  Networkのsave-analysisのPayloadで nameHint が空文字（artist:"" / title:""）と確認。
  コード譜JSON（ChordMini出力）には曲名がなく、`loadChordData()` は取り込み時に保存するため、
  曲名・アーティストの入力より先にコード譜を読み込むと、空のhintで名前が確定していた。
  入力順序を利用者に強制しないため、入力確定時（change）に改名する方式にした。
  サーバー未再起動の可能性は、複数曲で同じ結果だったため除外。

確認事項:
  設計検討の段階では「artist/titleが保存時点で存在する」と暗黙に仮定しており、実コードで確認していなかった。
```

- 保存処理側で毎回追随改名する案は採らなかった（2ファイルが同時に存在する状態と `baseVersion` の比較対象の揺れを避けるため）
- 一括移行は、メニュー追加案を撤回し、開発者向けスクリプトにした（一度しか行わない操作のため）

---

## 5. テスト・実機確認

### 一時環境（server.pyを一時ディレクトリで起動して検証）
- パッチ1: 13項目（既存GET/保存、新規名生成、`nameHint` 非保存、`baseVersion`、重複409、他の静的配信、不正ID、60文字切り詰め 等）
- パッチ2: 12項目（改名・同名・片方のみ・両方空・重複・該当なし・不正ID・改名後の保存とGET・JSON内容の不変 等）
- パッチ3: Nodeハーネス（スクリプト本体のimport先のみスタブ）で、dryRun前後のファイル一覧・ハッシュ同一、キャンセル、実行、2回目（冪等）、孤児・`hasAnalysis=false`・重複の不変、不正IDがあっても継続

### 実機（ブラウザ・実データ）
- [x] 新規曲を登録し、曲名・アーティスト入力後に名前付きになる（`斉藤由貴-悲しみよこんにちは_…`、`相川七瀬-バイバイ。_…`）
- [x] 曲名を変更すると、新しい名前に追随する
- [x] 解析を編集・保存してもファイル数は増えず、同じファイルが更新される（270件→270件）
- [x] 移行 `dryRun()` → `run()`: 対象231件、改名229件・変更なし2件
- [x] 再度 `dryRun()`: `{"renamed":0,"unchanged":231,"skipped":0,"none":0,"conflict":0,"error":0}`

### 未確認
- 外部確認・バックフィル（別曲の操作）で409が不当に出ないかの個別確認（移行・保存の実機確認の範囲外）
- 禁止文字・長いタイトルの極端なケースの実機確認（一時環境では確認済み）

---

## 6. 孤児Analysisファイル39件

- 移行後もUUID名のまま残った39件は、Library（IndexedDB）に存在しない曲のファイルだった
  - 確認結果: `total:39 / notInLibrary:39 / inLibraryHasAnalysisTrue:0 / inLibraryHasAnalysisFalse:0`
- 原因（コード確認済み）: Libraryから曲を削除しても、Analysis JSONは削除されない（既存仕様）
- 推測（未確認）: 同サイズのファイルが並んでいたため、同じ曲の登録し直しの残りの可能性が高い
- 移行スクリプトの対象外（Libraryを起点にするため）。曲名が不明なファイルは推測で名前を付けない
- 扱い: 削除ではなく `analysis_orphans` への移動を案内した。利用者より「analysisフォルダがきれいに整理された」と報告あり（移動後の件数・退避先の内容の再確認は未記録）
- [ ] `analysis_orphans` は、しばらく使って問題がなければ削除する

---

## 7. 積み残し・保留

- [ ] 曲を削除しても残る孤児Analysis（別Issue化は開発者判断）
- [ ] 保存の書込みが直接 `open('w')`（一時ファイル＋`os.replace` ではない）。途中失敗で破損しうる既存リスク。今回は対象外と決定
- [ ] 重複（複数ファイル）と「ファイルなし」が、画面上は同じ扱い（`null`）。区別はserverログのみ
- [ ] `project.js` のsanitize切り出し（既存TODO）は未対応。Analysis側は別規則のまま
- [ ] ドキュメント上の記述のずれ（Documentation Debt）: architecture.md §2・§11が `analysis/` の場所を `resource/analysis/` と読める形で記載しているが、実際の保存先は `analysis/`（リポジトリ直下、server.pyの `ANALYSIS_DIR`）。今回のパッチでは未修正
- [ ] 運用メモ: 調査・実装のためにGitHubアクセストークンがチャットに貼られた。使用後は失効が必要（失効状況は未確認）

---

## 8. Out of Scope（今回やらないと決めたこと）

- Analysis JSON schemaの変更
- 保存のたびの追随改名（入力確定時の改名のみ）
- 孤児ファイルの自動整理・Projectとの逆引き
- 一括整理のメニュー・UI
- 書込みのatomic化

---

## 9. Issue状態変更記録
- 今回完了したissue: #118（実装・実機確認・移行まで完了。GitHub上のcloseは未反映）
- 今回新規に積み残した項目: 上記「7. 積み残し・保留」（GitHub Issue化は開発者判断）

## 10. 次フェーズ候補
- 新しいProduct Intentから開始する（Issue消化を目的にしない）
- 候補: Phase138の積み残し（Readable表記の混在）、Phase136の保留事項、Slot / Beat / Measure Model

## 提案コミット（1コミット1目的）
```
feat(analysis): resolve analysis files by projectId and name new files readably (#118)
feat(analysis): rename analysis file on title/artist change (#118)
chore(tools): add one-time analysis filename migration script (#118)
```
（architecture.mdの変更は、各パッチの目的に対応する分に分けるか、まとめて1コミットにするかを開発者が判断）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- No changes.（新規の積み残しは、Phase137の方針どおりGitHub Issueへの記録を開発者が判断する）

#### MODIFY
- No changes.

#### CLOSE
- No changes.（#118 は `current-issues.md` に掲載されていない）

### phase-status.md

- Current Status（完了済みリスト）に追加: 「Phase139 — Issue #118 Analysisファイル名の人間可読化。projectIdを唯一の論理キーとし、serverの `resolve_analysis_file()` でファイルを特定。新規保存は `{artist}-{title}_{projectId}.json`、曲名・アーティストの入力確定時に改名、既存231件は開発者向けスクリプトで一度限りの移行（改名229件・変更なし2件）。孤児ファイル39件を確認。実機確認済み。」
- Major Milestones（Project Repository / Persistence表）に追加: `139 | Analysisファイル名の人間可読化（[ANALYSIS FILE RESOLUTION]・[DRY-RUN INVARIANT]確立。Analysis JSON schemaは不変） | server.py / analysisLoader.js / app.js / tools/migrate-analysis-filenames.js`
- Future Candidates の更新: Technical Debtへ、孤児Analysisファイルの扱いと、書込みのatomic化を追記するか検討

### architecture.md
- Named Invariantの反映は各パッチで即時更新済み。棚卸し時は整合性確認のみ（上記の `resource/analysis/` 記述のずれの確認を含む）

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
