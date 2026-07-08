# 引き継ぎ: Phase73-A完了 — Project DB Architecture（設計フェーズ）

## 作業状態
- ブランチ: (未定・設計フェーズのため実コード変更なし)
- 直前作業: Phase72-C完了（Correction UI 仕上げ）

---

## 背景

Chart Modeがpickup対応・hover diagram・active highlight・timing diagnostics・
repairRule・correction UIまで揃い、「開発フェーズ」から「運用フェーズ」へ
移行しつつあるという認識のもと、次のsubsystemとして Project DB
（複数プロジェクトの永続管理・ライブラリ化）の検討に着手した。

`current-issues.md` には以前から「プロジェクトDBライブラリタブ追加」が
未着手項目として存在しており、今回はその実装ではなく**設計のみ**を
固めるフェーズとした（Phase72-Aで Correction Authority を設計のみで
確定させたのと同じ進め方）。

たかっちさん・Claude・ChatGPTの三者往復で設計を進めた。

---

## スコープが収束した経緯

当初は「Project DBをどう作るか」を、索引型（カタログのみ）・フルストア型
（IndexedDBが正本）・ハイブリッド型の3モデルで検討していた。

しかし実コード監査の結果、以下が判明した。

```
audio / chord_source 実体   → 既に idb.js が project.id ベースで管理済み（Phase32〜）
analysis（raw/repairRule）  → 既に analysis/{id}.json が正本として確立済み（Phase42, 72）
customDiagrams              → 既にグローバル（project非依存）。実コード確認済み
```

未解決なのは **project core data（lines / title / artist / capo / key / tempo）
の正本がどこにもない**（FSAファイルとlocalStorage単一スロットautosaveの
二重管理になっている）という1点だけだった。

この発見により、「Project DB全体を設計する」という当初のテーマは
「**Project Core Authorityを決める**」という、はるかに小さく明確な
テーマへ縮小した。これにより、既に安定しているaudio/analysis/identityの
authorityを一切壊さずに済む設計が可能になった。

---

## 確定した設計原則

### [PROJECT CORE AUTHORITY]

```
Project DBは project core data の canonical source（正本）である。

対象（project core data）:
  id（主キー / keyPath）
  schemaVersion
  title, artist
  lines[]
  capo, key, tempo
  audioFileName, chordSourceFileName
  hasAnalysis
  createdAt, updatedAt

対象外（既存authorityのまま・Project DBは関与しない）:
  audio実体        → idb.js（既存・Phase32〜）
  chord_source実体  → idb.js（既存・Phase32〜）
  analysis実体      → analysis/{id}.json（既存・Phase42, 72）
  customDiagrams    → localStorage（既存・project非依存・確認済み）
  UI preference     → localStorage（既存・project非依存）

主キー:
  project.id をそのまま keyPath とする
  （idb.jsの既存asset key・Phase62 identity semanticsを再利用）

schemaVersion:
  最初から保持する（Phase72 repairRuleパターンを踏襲。
  tags/favorites/links等を将来追加する際、無破壊migrationの保険になる）

createdAt / updatedAt:
  最初から保持する（後付けより、ライブラリ管理の基本情報として
  最初から持つ方が自然なため）

レコード形状の互換方針（ChatGPT指摘により追加・Phase73-Aで解決）:
  projects object storeに保存するレコードの形は、
  既存の serializeProject(project, uiState) の出力と同一とする。
  新しい形状は発明しない。

  [背景] メモリ上の project オブジェクトは capo は保持するが
  key/tempo は保持しない（uiState＝DOM入力欄からしか得られない）。
  そのため project をそのままIndexedDBに保存すると key/tempo が
  欠落する。serializeProject(project, uiState) の出力をそのまま
  正本の形とすることで、この欠落を防ぐと同時に、FSA Export
  （既存saveProject()）とProject DB保存が同一の形状を共有することも
  自動的に保証される。

  saveProjectToDB() の実体:
    saveProjectToDB(project, uiState)
      → const record = serializeProject(project, uiState)
      → idb put(record)

  getProject(id) の戻り値:
    既存の deserializeProject() がそのまま消費できる形で返す
    （loadProj()側の処理を変えずに済む）

Repository関数の命名（ChatGPT指摘により確定・Phase73-Aで解決）:
  Repository側の保存関数は saveProjectToDB() とする。
  単に saveProject() とすると、app.jsに既存のFSA保存
  オーケストレーター saveProject(forceNew) と名前が衝突する
  （別責務・別シグネチャの関数が同名になる）。

  既存の project.js 命名パターン（saveProjectToFile / 
  saveToLocalStorage）をそのまま延長し、保存先を名前に含める形に
  統一する。app.js側の saveProject(forceNew)（Ctrl+S / 保存ボタン
  起点・FSA専用）は変更しない。autosaveは今後 saveProjectToDB() を
  自動実行する形になり、「手動保存＝FSA」「自動保存＝DB」という
  独立した2つのトリガーが、同じ serializeProject() の出力を
  それぞれ別の保存先へ書き込む構図になる。

Repository:
  project.js を拡張する形で実装する
  （listProjects / getProject / saveProjectToDB / deleteProject）
  新規モジュールへの切り出しは「実際に肥大化してから」行う
  （chordEntry.js / modals.js の前例を踏襲。
   「将来大きくなるかもしれないから先に分ける」は
   このプロジェクトの一貫したやり方ではない）

autosave:
  saveProjectToDB() を自動実行する仕組みであり、
  独自の保存領域・独自の正本を持たない
  （Phase72-B repairRule事故 — 古いスナップショットが
   正しい状態を上書きした教訓 — を踏まえる）

FSA手動保存（project.jsonへの書き出し）:
  廃止しない。Project DB → Export という位置付けで残す。
  （Git/handover/バックアップ運用との相性を保つため）

FSA Export方式（Phase73-A時点で確定）:
  既存の saveProject()（メモリ上のproject + uiStateをそのまま使う）を
  継続利用する。Project DBレコードを経由しない。

  「一覧画面から、開いていない曲を直接エクスポートする」機能は
  Phase73-Aのスコープ外。Phase73-Cのライブラリ一覧UIが存在して
  初めて意味を持つユースケースのため、必要になった時点で
  exportProjectFromDB(id) のような別関数として検討する
  （Repository層の責務拡張として扱う）。
```

### [ASSET RESOLUTION]（既存実装で確認済み・新規設計は不要）

```
audio / chord_source / analysis の実体解決は
project.id のみを鍵として行う（実コード確認済み）。

  audio:    loadAsset(project.id, 'audio')   → idb.js
  chord:    loadAsset(project.id, 'chord')   → idb.js
  analysis: loadAnalysisFile(project.id)      → analysisLoader.js

audioFileNameは表示ラベル / 再選択バナー判定のsentinel値としてのみ使う。
chordSourceFileNameは上記に加え、現状はパース方式（CSV/JSON）の判定にも
使われている。この用途（CSV/JSON判定）はCSVインポート機能の
Deprecated化（後述）に伴って将来的に不要になる可能性がある分岐であり、
Asset Resolutionの恒久的な仕様としては扱わない。CSVインポートの削除が
実施された場合、この分岐自体が消滅する。

Project DBは asset の実体を保持しない。
Project DBが保持するのは project.id と表示用メタデータのみ。

[結論] Project DBから曲を開いても、project.idさえ取得できれば
既存のidb.js / analysisLoader.jsの仕組みにそのまま乗るため、
Chart Mode・演奏モードは現状通り動作する。
```

### [PROJECT SWITCH LIFECYCLE]

```
最後に開始された project load request のみが、
現在の project state に対する書き込み権限（authority）を持つ。

非同期処理の完了順序に依存してはならない。
途中で新しい load request が開始された場合、
古い request はその時点で書き込み権限を失い、
それ以降のすべての結果を破棄しなければならない。

この原則は以下を含む、project restoreに関わる
すべての処理に適用される（個別の関数名を列挙すると将来の
実装変更のたびに文書修正が必要になるため、抽象度を保つ）:
  - project state mutation
  - asset restoration
  - UI / DOM update

実現方法（generation counter / token / AbortController等）は
原則そのものではなく実装選択に属する。

参考実装（Phase73時点）: monotonic generation counter
  let _loadGeneration = 0;

  async function loadProj(id) {
    const myGeneration = ++_loadGeneration;  // ← 関数の最初の同期処理として採番する
                                              //   （getProject(id)を含む、いかなるawaitより前）
    resetProject();

    const data = await getProject(id);       // ← Authority変更で新たに増える非同期境界。
    if (myGeneration !== _loadGeneration) return;  // ← これも保護対象に含める
    ...
  }
  // 以降の各 await 直後でも同様に myGeneration !== _loadGeneration なら中断

  理由: 同一project.idへの連続load要求（同じ曲の連続クリック等）でも
  正しく「最後の1つだけが勝つ」ことを保証できる。
  project.idそのものをトークンにする方式は、同一プロジェクトへの
  再読込が連続した場合に区別がつかず保護が効かないため不採用。

  [採番位置の原則・ChatGPT指摘により明記]
  generation番号は「関数が呼ばれた瞬間」に同期的に確定させる。
  await getProject(id) の後で採番すると、load A が先に開始しても
  load B が先に完了した場合に保護が効かない
  （A: 採番が遅れる → B: 採番済みで先に完了 → A: 後から採番・上書き、
   という事故が起こり得る）。
  「リクエスト開始 = 採番」を同時に行うことが原則であり、
  Phase73-B実装時の確認ポイントとする。

loadChordData()への世代トークン伝播（コード追跡により解決）:
  不要と確定。loadProj()のasset restore IIFEからは常に
  isRestore=true で呼ばれ、Phase72-Bのhotfixにより
  isRestore=true経路の内部にはawaitが1つも存在しない
  （analysis関連のawaitはすべて if(!isRestore) でスキップされる）。
  そのため loadChordData() 呼び出し自体に割り込みの隙間はなく、
  呼び出し直前（loadAsset()のawait直後）の世代チェック1箇所のみで
  保護として完結する。loadChordData()内部に世代の概念を
  持ち込む必要はない。
```

---

## 発見した潜在リスク（実コード監査・未修正）

設計議論の過程で、現状の `loadProj()` に実際に存在する競合リスクを
2種類発見した。いずれも**現状のUIでは発生しない**（ネイティブファイル
ダイアログ・`confirm()`による同期ブロックが偶然レースを防いでいる）が、
Project DBの一覧UIが「摩擦なく高速切り替えできること」を目的としている
以上、この偶然の防御がなくなった瞬間に顕在化する。

```
① asset restore race（audio/chord）
   曲Aの非同期復元処理が、曲Bへの切り替え後に遅れて完了し、
   曲Bの画面に曲Aのaudio/assetStateを上書きする。

② project.analysis mutation race（①より深刻）
   project変数（モジュール共有の単一変数）が指す先が
   await中に差し替わるため、曲Aの解析結果が曲Bのオブジェクトに
   書き込まれる可能性がある。表示・再生のズレに留まらず、
   project state そのものを汚染する。
```

[PROJECT SWITCH LIFECYCLE] はこの2つを解消するために確定した原則であり、
Phase73-Bの実装で対応する。

---

## 検討して保留・不採用にした案（記録）

| 案 | 内容 | 不採用/保留の理由 |
|---|---|---|
| モデルA（カタログ型のみ） | IndexedDBは索引のみ、実体はFSAファイル | 「数百曲ライブラリ・瞬時切替」という目標と相性が悪い |
| モデルB（フルストア型・全データ移行） | audio/analysisも含め全てIndexedDBへ | audio/analysisは既に正しいauthorityを持っており、動かす理由がない |
| project.idをload tokenにする | 識別子をproject.idそのものにする | 同一project.idへの連続loadを区別できない |
| localStorageを「最後の保険」として残す | IndexedDB破損時の退避先 | localStorage/IndexedDBは同一オリジンの運命共同体であり堅牢性根拠として弱い。本当に必要なのはクラッシュ対策としてのautosaveであり、保存先は問わない |
| Repositoryを新規モジュールとして先に分離 | projectRepository.js等を最初から新設 | 「将来肥大化するかもしれないから先に分ける」はこのプロジェクトの前例（chordEntry.js/modals.js）と逆方向 |
| resetProject()のタイミングを原則で規定 | Lifecycle原則にタイミングまで明記 | 安全性の問題ではなくUXの問題。実装後のフィードバックを見てから決める方が自由度を保てる。\[補足\] resetProject()自体は同期処理であり、generation counterの保護対象ではない（再入による競合が起きるのは、その後に続く非同期復元処理の側）。将来resetProject()の実行タイミングを変更する場合も、この同期/非同期の境界を意識すること。タイミング自体の決定はUX実装フェーズへ委ねる |

---

## current-issues.md更新

- 今回closeしたissue: なし（設計フェーズのため実装上のcloseはなし）
- 今回更新が必要な既存issue:
  - 「プロジェクトDBライブラリタブ追加」: 状態を「未着手」→
    「設計完了（Phase73-A）・実装未着手」に更新
- 今回新規に積み残したissue:
  - **CSVコードファイルインポート機能の削除検討**（新規・状態: Deprecated候補）
    Sonic Visualiser解析結果のCSV取り込みを想定していたが、精度が
    実用レベルに達せず形骸化している。`csvImporter.js` / chord-btnの
    CSV分岐 / file picker accept設定の削除を将来検討する。
    優先度は低く、Project DB系列のフェーズが一段落してから着手する。
  - **FSA保存ファイルのProject DBへの取り込み導線**（新規・状態: 未設計・Phase73-B非ブロッキング）
    過去に手動保存したproject.jsonファイル群を、どうやってカタログに
    登録するか。自動スキャンはFSA APIの制約上困難なため、「開いた時に
    自動登録される」程度の現実的な着地になる見込み。Repository層
    （listProjects/getProject/saveProject/deleteProject）や
    generation counterの実装には依存しない独立した機能のため、
    Phase73-Cで個別に扱う。

- 今回Phase73-A内で追加解決した項目（当初「未確定」としていたもの）:
  - **loadChordData()への世代トークン伝播要否** → 不要と確定。
    isRestore=true経路に内部awaitが存在しないことをコード追跡で確認
    （詳細は[PROJECT SWITCH LIFECYCLE]参照）
  - **project.json互換方針** → serializeProject(project, uiState)の
    出力をそのままprojects storeのレコード形状として再利用することで解決
    （詳細は[PROJECT CORE AUTHORITY]参照・ChatGPT指摘により発覚）

---

## 次フェーズ候補

ChatGPTレビューで「73-Aで本当に設計が終わったと言えるか」という指摘を
受け、未解決だった3点（loadChordData世代伝播・project.json互換方針・
Repository関数の命名衝突）を本フェーズ内で追加解決した（上記参照）。
残るFSA取り込み導線・resetProject()タイミングは、いずれもRepository層・
generation counterの実装そのものをブロックしない独立した項目と判断し、
別フェーズ（73-C）へ明示的に切り出した。この整理に基づき、専用の
「詳細設計フェーズ」は挟まず、Phase72-A→Bと同じ進め方
（Architecture確定 → 実装）を踏襲する。

```
Phase73-B（実装フェーズ）:
  - idb.js拡張: "projects" object store追加・DB_VERSIONインクリメント
  - project.js拡張: listProjects() / getProject(id) /
    saveProjectToDB(project, uiState) / deleteProject(id)
    （レコード形状は serializeProject() 出力を再利用。
     既存のFSA保存 saveProject(forceNew)（app.js）とは別名・別責務）
  - loadProj()への generation counter 実装
    （project.analysis mutation race / asset restore race の解消。
     loadChordData()自体への伝播は不要）
  - autosave書き込み先をlocalStorageから saveProjectToDB() へ切替

Phase73-C（UI・後回し）:
  - ライブラリ一覧UI（右パネル、current-issues.md既存案）
  - FSAファイルの取り込み導線
  - resetProject()タイミングの実装後フィードバックに基づく調整
```

設計細部（一覧UIの見た目・ソート/検索の有無等）は実装しながら判断する
方が合理的なため、Phase73-Aでは意図的に詰めていない。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
