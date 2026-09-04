# 引き継ぎ: Phase127-F完了 — 既存データのProvenance補完とバックフィル安全化

## 1. 作業状態

- ブランチ: phase127-provenance-status（`git branch --contains 7afdcd6`で実値確認済み。`main`へマージ済み）
- Phase127-F①〜④: **完了**
- Phase127-F② Structure Sync: 実装・レビュー・実機検証完了
- Phase127-F② commit: `7afdcd6 Phase127-F2: Structure Sync backfill + backfill safety hardening`
- Phase127-Fの実装はその後 `main` にマージ済み
- Phase127-E① External Check（🟢）およびE② Provenance Popoverは、F完了後に実施された
- 本handoverはPhase127-Fの完了記録としてarchive対象
- 現在のactive handover / 次工程は、本handoverでは扱わず後続Phaseのhandoverを正とする

> **注意:** Phase127-Fは、後続のE①/E②より先に完了している。
> したがって、本handover内に「次はE②を実装する」など現在時点の作業状態を記載しない。

---

## 2. Phase127-Fの目的

Phase127以前に作成された既存プロジェクトについて、Provenance情報を補完する。

対象は主に以下の2項目。

- 🟡 `hasContentEdit`
  - ChordMini初期出力から現在の分析内容が変更されているかを既存データから判定する
- 🔵 `hasStructureEdit`
  - 現在の `raw.sections` にSection構造が存在するかを反映する

Phase127-Fでは、既存データを対象としたMigration / Sync処理を追加すると同時に、バックフィル処理が通常の編集データを破壊しないことを重要な設計条件とした。

---

## 3. データ構造とPersistence Authority

Phase127-Fで扱う主なデータは以下の3箇所。

### ① IndexedDB `projects` store

プロジェクト本体を保持。

Phase127-Fでは以下を扱う。

- `contentEditBackfill`
- `provenanceSummary`

`provenanceSummary` はLibrary表示用の派生キャッシュ。

### ② IndexedDB `assets` store

以下を保持。

- audio
- `${projectId}:chord`

`${projectId}:chord` は、ChordMini初期出力との比較に使用するsnapshot。

### ③ `analysis/{projectId}.json`

分析データのPersistence Authority。

Phase127-Fでは、

- `raw.provenance`
- `raw.sections`
- chords / beats / downbeats等の分析データ

を含む。

分析ファイルの書き込みは `saveAnalysisFile()` を経由する。

---

## 4. Phase127-F①〜④

### F① Section live check

既存プロジェクトのSection状態を確認し、バックフィル対象データの現状を把握した。

### F② Structure Sync

現在の `raw.sections` を基準に `hasStructureEdit` を同期する処理を追加。

定義は以下。

```text
raw.sections が Array
  ├─ length > 0 → hasStructureEdit = true
  └─ length = 0 → hasStructureEdit = false

raw.sections が Array ではない
  → 既存値を変更しない
```

ここでの `hasStructureEdit` は、

> 「現在Section構造が存在する」

ことを意味し、

> 「ユーザーが手動でSection編集したことの証明」

ではない。

この意味論は意図的に分離した。

### F③ Migration State / Re-import reset

Content Migrationの一回限りの判定状態と、再インポート時の状態リセットを整理した。

Migration対象は、

```text
contentEditBackfill === undefined
```

のプロジェクト。

一度判定されたプロジェクトについては、原則として再評価しない。

### F④ Content comparison

ChordMini snapshotと現在のanalysis rawを比較し、Content変更を判定。

比較対象には以下を含む。

- chords
- chord name
- start / end
- beats
- downbeats

浮動小数点比較には `1e-6` toleranceを使用。

結果は、

- `edited`
- `matched`
- `unavailable`

の3種類。

`unavailable` はanalysis読み込み失敗等による判定不能を意味し、恒久的なMigration完了状態として保存しない。次回実行時に再試行する。

Unit Testは10件実施し、PASS。

---

## 5. Content MigrationとStructure Syncの分離

Phase127-Fでは、🟡と🔵を同じ概念として扱わないことを明確化した。

### 🟡 Content Migration

過去のChordMini初期出力と現在の内容を比較し、

> 「既存データにContent変更があるか」

を一度判定するMigration。

### 🔵 Structure Sync

現在の `raw.sections` を観測し、

> 「現在Section構造が存在するか」

を同期するCurrent-State Derived Flag。

したがって、

- Migration済みでもStructure Syncは独立して実行できる
- Structure Syncの結果はContent Migrationの状態に依存しない
- `inspect` と `save` は同義ではない
- 不要な場合は保存しない

という設計とした。

---

## 6. [BACKFILL NON-DESTRUCTIVE INVARIANT]

Phase127-Fで最重要となった不変条件。

> **Backfillは既存データを観測・補完するだけであり、Provenance以外のデータを変更してはならない。**

### 許可される変更

- `raw.provenance`
- `contentEditBackfill`
- `provenanceSummary`

### 変更してはいけないデータ

- Sections
- chords
- beats
- downbeats
- capo
- key
- tempo
- lines
- title
- audio
- その他の無関係なProject / Analysisデータ

この境界は、単なる実装上の注意ではなくPhase127-Fの設計上のInvariantとする。

---

## 7. Analysis書き込みの安全化

バックフィルによる古いAnalysisの上書きを防ぐため、`generatedAt` を利用したoptimistic concurrency controlを導入した。

### 読み込み

`loadAnalysisFile()` がAnalysisの、

- `raw`
- `generatedAt`

を返す。

### 書き込み

`saveAnalysisFile()` に読み込み時点の `generatedAt` を `baseVersion` として渡す。

書き込み結果は、

- `ok`
- `error`
- `conflict`

を区別する。

### Conflict時

Conflictが発生した場合、

- 🟡 Content Migration
- 🔵 Structure Sync

の両方のバックフィル結果を破棄し、部分的な保存を行わない。

次回実行時に再評価する。

これはPhase127-Fのデータ破壊防止における重要な安全策である。

---

## 8. Project側の安全な更新

`project.js` に `patchProjectFields(projectId, patchFn)` を追加。

最新のIndexedDB Project recordを読み込み、必要なフィールドだけをpatchする。

`_persistContentEditBackfillResult()` では、

- `contentEditBackfill`
- `provenanceSummary`

のみを更新対象とする。

これにより、古いProjectオブジェクト全体を保存して他の変更を上書きすることを避ける。

---

## 9. Section消失問題について

Phase127-Fの作業中、ある既存曲でSectionデータが消失していることが発見された。

当初は、バックフィル処理におけるTOCTOU（Time-of-check to Time-of-use）による古いAnalysisの上書きが原因ではないかと仮説を立てた。

しかし再調査の結果、

- Sectionはバックフィル以前から存在していた
- ChordMini snapshotにはSection情報が存在しない
- バックフィル処理自体は `sections` を操作していない
- Concurrent editがない単独実行でSectionを消す具体的なコードパスは確認できなかった
- 同じ現象を再現できなかった

ため、

> **「Phase127-FのバックフィルがSection消失の原因だった」とする仮説は撤回する。**

現時点では原因不明。

今回導入した`baseVersion`によるoptimistic concurrency controlは、この問題の原因を解決したものではなく、**将来のstale overwriteを防ぐための予防的hardening**として位置付ける。

今後Section消失が再発した場合には、conflict検知等の情報を利用して原因を追跡する。

---

## 10. Validation

### 10.1 実機検証

実機で以下を確認した。

- Migration済みProjectでもStructure Syncを独立して実行できる
- `sections.length > 0` かつ `hasStructureEdit === false` のProjectをバックフィルすると `true` になる
- バックフィル対象Projectに対して実際の処理経路が動作する
- バックフィル時のToast
  - 「セクション構成のみ検出: N件」
    が正常に表示される

### 10.2 Unit / Static validation

- Content comparison Unit Test: 10件 PASS
- `node --check`: PASS
- `git diff --check`: PASS

### 10.3 Code / Design Review

コードレビューおよび設計レビューにより、以下を確認。

- 現在開いているProjectをバックフィル対象から除外する処理
  （`targets = projects.filter(p => p.hasAnalysis && p.id !== project.id)`。
  実装確認時点でコミット履歴・関連ドキュメントに実機での明示的な
  確認記録が見当たらなかったため、実機検証済みではなくコードレビュー
  確認済みとして記載する。ロジック自体は単純なフィルタ条件であり、
  技術的な疑義は低いが、記録の正確性を優先しこの区分とした）
- `sections=[]` → `hasStructureEdit=false`
- `raw.sections` がArrayでない場合は変更しない
- Analysis読み込み失敗時は恒久的なMigration完了状態を保存しない
- Content MigrationとStructure Syncを独立して扱う
- Analysisへの保存は必要時のみ
- Combined writeでは`saveAnalysisFile()`を1回だけ呼ぶ
- Conflict時は🟡/🔵双方を破棄する
- `generatedAt`を`baseVersion`として利用する
- `patchProjectFields()`によるProject側の限定更新
- `[BACKFILL NON-DESTRUCTIVE INVARIANT]`に反する無関係データの書き換えがない

Phase127-F②の実装レビューはPASS。

---

## 11. 設計上の重要な判断

### [判断] Content MigrationとStructure Syncを分離する

```
結論: 🟡 hasContentEdit（一度きりのMigration判定）と、🔵 hasStructureEdit
      （現在状態からのSync）を、別々の仕組みとして扱う。

理由: Content変更の判定は過去のChordMini snapshotとの比較であり、
      Structure状態は現在のraw.sectionsから直接観測できる。両者を
      1つのMigration状態として扱うと、既にMigration済みのProjectに
      ついてStructure状態を更新できなくなる。

変更してはいけないこと:
  ・hasContentEdit と hasStructureEdit の意味を混同しない
  ・Structure SyncをMigration済みProjectから除外しない
```

### [判断] Backfillは非破壊（Non-destructive）である

```
結論: バックフィルはProvenance関連データのみを書き換え、それ以外の
      既存データには一切触れない。

理由: 既存Projectを大量に処理するMigrationでは、通常編集と同等の
      権限でProject / Analysis全体を保存すると、意図しないデータ
      破壊のリスクがある。

変更してはいけないこと:
  ・Provenance以外の既存データをバックフィル目的で変更しない
```

### [判断] Conflict時に部分保存しない

```
結論: baseVersion競合を検出した場合、🟡🔵両方のバックフィル結果を
      破棄し、片方だけを確定させない。

理由: 🟡と🔵を別々に保存すると、同じAnalysisに対して片方だけが
      古いsnapshotを基準に反映される可能性がある。

変更してはいけないこと:
  ・Conflict発生時は両方のDerived Resultを破棄し、次回実行に委ねる
```

### [判断] baseVersionは「原因解決」ではなく安全化として位置づける

```
結論: baseVersionによるoptimistic concurrency controlの導入を、
      「Section消失の原因を特定・修正したもの」とは表現しない。

理由: Section消失の原因がTOCTOUだったことは確認されていない。
      一方、stale overwriteそのものは（原因が何であれ）防止すべき
      リスクであるため、独立した安全策として導入した。

変更してはいけないこと:
  ・baseVersion導入を「Section消失原因を特定・修正した」と表現しない
```

---

## 12. Scope Out

Phase127-Fでは以下を扱わない。

- Section消失の原因究明・復旧
- recovery file等を利用した過去データの復元
- Provenance Popover UI
- 🟢 External Check
- 🟡テーマ・表示色等のUIデザイン変更

これらは別Phase / 別handoverの責務とする。

---

## 13. Files / Authority

主な変更対象・関係箇所：

- `app.js`
  - Backfill orchestration
- `project.js`
  - `patchProjectFields()`
- Analysis persistence layer
  - `loadAnalysisFile()`
  - `saveAnalysisFile()`
- IndexedDB
  - `projects`
  - `assets`
- `analysis/{projectId}.json`
  - `raw.provenance`
  - `raw.sections`

Authority boundaryは既存Architectureを維持する。

特に、

- Analysis → `analysis/{id}.json`
- Project → IndexedDB `projects`

というPersistence Authorityを変更しない。

---

## 14. Phase127-Fの完了判定

Phase127-Fで予定していた、

- 既存ProjectのContent Provenance補完
- Structure Sync
- Migration State管理
- 再インポート時の状態整理
- Content comparison
- Backfill Non-destructive invariantの導入
- Optimistic concurrencyによるstale overwrite防止

を完了。

実装・レビュー・実機検証を完了し、`main`へマージ済み。

**Phase127-F: COMPLETE**

本handoverはPhase127-Fの完了記録としてarchiveする。

---

## Deferred Documentation

### current-issues.md

#### ADD

なし。

#### MODIFY

なし。

#### CLOSE

なし。

### phase-status.md

- Phase127-F①〜④を完了として記録
- Phase127-F② Structure Syncのcommit / merge完了を記録
- Section消失問題については「原因未解決」のまま記録し、Phase127-Fの確定原因・解決済みIssueとして扱わない

### architecture.md

- `[BACKFILL NON-DESTRUCTIVE INVARIANT]` は既存Architecture上のInvariantとして維持
- Phase127-F完了によってPersistence Authority / Authority Boundaryを変更しない

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
