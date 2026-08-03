# 引き継ぎ: Phase103完了 — Section永続化 + 実機検証で発見した2件のバグ修正

> Phase103は「Sectionの永続化」を目的とした軽量な実装フェーズとして開始したが、
> 実機検証の過程でPhase100-A・Phase102それぞれに由来する設計上の抜けを2件発見・
> 修正した。結果として、本体（新機能）と発見（既存フェーズの積み残し）が明確に
> 分離された重量版handoverとなっている。

## 作業状態
- ブランチ: phase103-section-persistence
- 直前作業: Phase102-B完了（Section Preview 視覚言語の独立化）

---

## 1. Purpose（目的）

Sectionは現状 Analysis Editor Session限定（section-model.md §5）で、編集セッション
終了とともに消える。これをanalysis.jsonへ永続化し、プロジェクトを閉じて再度開いても
Sectionが保持されるようにする。

Phase98〜102でSectionの仕様・Session Layer・Editor UI・Preview Decoratorまで
完成したことで、Section機能の唯一の欠落が「永続化」である状態になっていた。
Phase103はその欠落を埋め、Section機能を初めて実用可能な状態へ到達させる
フェーズである。

```
S. Section Specification（仕様固定）        ── Phase98完了
A. Section Data Layer（Session Layer実装）  ── Phase100-A完了
B. Section Editor（UI）                     ── Phase101完了
   Section Preview Decorator                ── Phase102・102-B完了
   Section永続化                            ← 本フェーズ（Phase103）
```

---

## 2. Scope（今回やったこと）

```
・analysis.raw.sections への永続化
    ・beginAnalysisEdit()でSessionへ読み込み
    ・saveAnalysisEdit()でSessionから書き戻し
・analysisLoader.js冒頭コメントへのownership明記
    （sectionsはChordMini由来の解析データではなくユーザー定義メタデータ）
・[実機検証で発見・修正] dirtyフラグがSection操作で立たないバグ（Phase100-A由来）
・[実機検証で発見・修正] Section Previewが編集終了後も残留するバグ（Phase102由来）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Section操作のUndo/Redo対応（History Integration）
    → Phase100-Aの[SECTION HISTORY INTEGRATION]方針を継続。
      今回の2件のバグ修正はいずれも「未保存フラグ（dirty）」と
      「表示状態のリセット」の話であり、Undo対応（history配列への統合）
      とは別の関心事。Section Undoは引き続きDeferred（§7参照）。

・analysis.jsonのバージョン管理・マイグレーション機構
    → 既存のrepairRuleと同じく、schema versioningは別フェーズの課題として
      現状維持（current-issues.md「保存データ復元のschema versioning未実装」
      に既に記載済みの既知の技術的負債と同一）。

・Section UIの追加機能・Chart Mode側のSection利用拡張
    → 永続化のみに範囲を限定。Section Selection State・チップ本体クリック時の
      挙動拡張等はPhase101-4以降の既存の積み残しのまま。
```

---

## 4. Implementation（実装内容・事実）

> このセクションはPhase103として**意図して実装した内容のみ**を記載する。
> 実機検証中に発見した2件のバグの詳細は §6 Findings を参照（ChatGPTレビュー
> 反映：新機能と発見事項を分離して記載）。

| 変更 | 内容 | ファイル |
|---|---|---|
| ownershipコメント追加 | `analysis.raw.sections`はChordMini由来ではなくユーザー定義の構造メタデータである旨を明記 | analysisLoader.js（冒頭コメント） |
| 読み込み | `beginAnalysisEdit()`で `analysisEditor.sections = structuredClone(project.analysis.raw.sections ?? [])` を追加（buffer/historyと同じ初期化パターン） | app.js |
| 保存 | `saveAnalysisEdit()`で `project.analysis.raw.sections = structuredClone(getSections(analysisEditor))` を、既存の`saveAnalysisFile()`呼び出し直前に追加 | app.js |

`saveAnalysisFile()` / `loadAnalysis()` / `loadAnalysisFile()` / `onSetRepairRule()` /
`onClearRepairRule()` はいずれも無変更。`raw`オブジェクトが参照透過（同一インスタンスが
読み込みから保存まで一貫して使われる）であるため、`sections`を`raw`の兄弟フィールドとして
独立引数化する必要がなく、影響範囲を最小限に抑えられた（詳細は §5 Design Decisions）。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] `sections` の保存場所は `analysis.raw.sections`（rawの兄弟フィールドにしない）

```
結論:
  sections は raw オブジェクトの直下（raw.sections）に保存する。
  repairRule のような「rawと同階層の独立フィールド」にはしない。

理由:
  【ownership ≠ storage location】
  Sectionはユーザー定義の構造メタデータであり、ChordMini由来の解析データ
  （raw.chords/beats/downbeats）とは生成元（ownership）が異なる。
  しかし保存場所（storage location）は必ずしもownershipと一致させる
  必要はない。既存のanalysis.json永続化スキーマ（raw丸ごとをPOSTする
  1回の保存経路）との一貫性を優先し、raw.sectionsとして保存することで、

    ・saveAnalysisFile()のシグネチャ変更が不要
    ・onSetRepairRule() / onClearRepairRule() への影響がゼロ
    ・loadAnalysis() / loadAnalysisFile() の変更も不要

  という、実装コストと将来のmigration考慮点の両方を最小化できた。
  ownershipの違いはコード変更ではなく、analysisLoader.js冒頭の
  [OWNERSHIP]コメントで明文化することで十分に伝わる（ChatGPTレビュー
  反映）。

  raw
    ├ chords       ← ChordMini（generation: ChordMini）
    ├ beats        ← ChordMini（generation: ChordMini）
    ├ downbeats    ← ChordMini（generation: ChordMini）
    └ sections     ← User（generation: User／保存場所のみraw）

  この判断は、将来ユーザー定義メタデータが増えた場合にも参照される
  判断基準になる：「新しいメタデータをどこに保存するか」は、生成元では
  なく既存の永続化スキーマとの一貫性・実装コストで決めてよい。

  [PERSISTENCE OWNERSHIP PRINCIPLE]（Phase103で明文化・ChatGPTレビュー反映）
    ownership（生成元）と storage location（保存場所）は
    必ずしも一致させる必要はない。
    保存場所は、永続化スキーマとの整合性・既存APIとの互換性・
    変更範囲の最小化を優先して決定する。ownershipの違いは
    コード変更ではなく、ドキュメントコメント（[OWNERSHIP]）で
    明文化すれば十分に伝わる。

    将来 lyrics / bookmarks / annotations / AI metadata 等が
    追加される際、「Phase103の原則に従う」という形で一言参照できる。
    architecture.mdへの正式反映は次回5フェーズ棚卸し時に検討する。
```

### [判断] `raw`オブジェクトの参照透過性に頼り、`saveAnalysisFile()`のAPIを変更しない

```
結論:
  当初検討した「saveAnalysisFile(projectId, raw, repairRule, sections)という
  第4引数追加」案は採用しなかった。

理由:
  project.analysis.raw は loadAnalysis() から一貫して同一のオブジェクト
  参照が保たれている（コピーされない）。saveAnalysisEdit()で
  `project.analysis.raw.sections = ...` と代入した時点で、以降その raw を
  渡すすべての呼び出し（onSetRepairRule/onClearRepairRule等）が自然に
  最新のsectionsを含んだ状態でPOSTされる。

  当初「sectionsを独立引数にしてデフォルト値[]にすると、repairRule
  トグル時にsectionsが空配列で上書きされ消失する」という懸念があったが、
  これは独立引数化する設計そのものが生む副作用であり、raw.sections方式
  ではそもそも発生しない（引数を追加しないため、消し忘れる対象が存在
  しない）。「バグを未然に防ぐ設計」ではなく「バグの発生条件自体を
  なくす設計」を選んだ形になる。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

> 以下2件はPhase103のスコープ外（それぞれPhase100-A・Phase102由来）だが、
> Phase103の実機検証中に発見し、その場で修正した。ChatGPTレビューに従い、
> 「何を新規実装したか」（§4）と区別して記録する。

### ① [Phase100-A由来] dirtyフラグがSection操作で立たず、保存ボタンが恒久的にdisabledになるバグ

```
症状:
  Sectionを作成しただけの状態（コード編集を1件も挟まない）だと、
  「保存して閉じる」ボタンが常にdisabledのまま押せない。

原因:
  「保存して閉じる」ボタンの活性化条件は analysisEditor.dirty === true。
  dirty が true になる経路は pushHistory() 内の1箇所のみ
  （session.dirty = true）。

  Section系4コマンド（createSectionCommand / renameSectionCommand /
  updateSectionBoundaryCommand / deleteSectionCommand）はPhase100-Aの
  [SECTION HISTORY INTEGRATION]方針（Undo非対応）により、意図的に
  pushHistory()を呼ばない設計になっている。

  この結果、「dirtyは未保存変更の有無を表すフラグである」という
  本来の意味と、「dirtyはpushHistory()が呼ばれたかどうかの副作用である」
  という実装が、Phase100まではChord編集がすべてpushHistory()を経由する
  ため一致していたが、Section編集（pushHistory()を呼ばない初めての
  ケース）によって初めてズレが露呈した。

修正:
  Section系4コマンドの成功時に state.dirty = true を個別に追加した
  （analysisCommands.js）。pushHistory()は呼ばない（Undo非対応の方針は
  維持）ため、[UNDO TRANSACTION INVARIANT]・[SECTION HISTORY INTEGRATION]
  とは矛盾しない。

設計上の気づき:
  dirty（未保存変更の有無）とhistory（Undoできる変更の記録）は、本来
  独立した責務である。Phase100までは両者がpushHistory()経由で同時に
  更新されていたため区別が表面化しなかった。Section機能の追加により、
  「Historyに積まない変更」が初めて存在するようになったことで、この
  区別が顕在化した。
```

### ② [Phase102由来] 編集終了後もSection Previewのゴールド背景が残留するバグ

```
症状:
  編集中にSectionチップをクリックしてPreview表示 → 編集終了 →
  非編集のChart Mode表示に戻っても、Preview対象だった範囲のゴールド
  背景が消えずに残り続ける。

原因:
  resetAnalysisEditor()は「Cancel / Save成功 / Project切替 / Chart Mode
  終了、すべてこの関数で統一する」という唯一のリセット窓口
  （関数自身のドキュメントコメントに明記）。Selection（_refreshSelection([])）
  とSearch（setSearchMatches([])）はここで正しくクリアされているが、
  Phase102で追加された_previewSectionId（Section Previewの正本・app.js
  ephemeral state）だけがこの窓口に組み込まれていなかった。

  chartmode.js側はSelection/Search/Section Previewのいずれについても
  「渡された状態をただ描画するだけ」という統一設計（[DECORATOR ADDITION
  RULE]準拠）であり、「編集中かどうか」を自律的に判定するロジックを
  持たない。そのためapp.js側が状態のクリアを怠ると、そのまま描画され
  続ける。

修正:
  resetAnalysisEditor()へ以下を追加した。

    _previewSectionId = null;
    setSectionPreview([]);

  setSectionPreview()はsetSearchMatches()と同型の「状態を更新するだけの
  純粋な関数」（renderは呼び出し側の責務）であるため、既存の2行と全く
  同じパターンで自然に揃う。

設計上の気づき:
  「編集中限定の機能」を新設する際は、対応する状態を必ず
  resetAnalysisEditor()（唯一のリセット窓口）へ登録することを、
  実装チェックリストとして明示的に残す価値がある（今回のように
  実機検証まで気づかれないまま残るリスクがあるため）。

  [EDITOR RESET AUTHORITY]（Phase103で明文化・ChatGPTレビュー反映）
    Analysis Editor終了時に破棄すべきephemeral stateは、
    必ず resetAnalysisEditor() に集約する。
    編集中限定の新機能（selection/search/Section Preview等）を
    追加した場合、対応するreset処理を同時にここへ登録すること。

    resetAnalysisEditor()自身のドキュメントコメントには元々
    「Cancel / Save成功 / Project切替 / Chart Mode終了、すべてこの
    関数で統一する」と明記されていたが、実装時にこの原則へ従うことを
    強制する仕組み（チェックリスト等）が無かったために今回の漏れが
    発生した。次にephemeral stateを持つ機能を追加する際は、この
    Invariantをレビュー観点として明示的に確認する。
```

---

## 7. Remaining Issues（残課題）

```
P1  [SECTION HISTORY INTEGRATION]（Phase100-Aより継続）
    Section CommandsのUndo/Redo対応方針の設計。
    今回のdirty修正により「未保存管理」と「Undo」は完全に切り離された
    （dirtyはSection編集を正しく検知するが、Undoは依然非対応のまま）。
    History機構の拡張方法は、SectionがEditor Coreへ本格統合される段階で
    再検討する。

P2  Boundary reassignment（§4.3ケースB・Phase100-Aより継続）
    境界コード削除時の「隣接コードへの自動付け替え」は未実装
    （reconcile()は常にSection自体を削除するケースC相当のみ）。

P3  Section Selection State（Phase100-A・101-3より継続）
    selectedSectionId等。UI着手時に、History（P1）との関係も含めて
    まとめて設計する方針は変わらず。

P4  チップ本体クリック時の挙動拡張（Phase101-4以降候補）
    現状は「Preview表示/解除のトグル」のみ。

（Phase93より継続）Boundary Handle Dragのpointercancel経路が未検証
  状態: 未対応（Section作業とは無関係の既存の積み残し。継続保持）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
現時点では特定の候補へ絞り込んでいない。

候補（優先順位は次回セッション開始時に相談）:
  ・P1 History Integration
  ・P2 Boundary reassignment
  ・current-issuesの他の軽量課題
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/analysisLoader.js
  ・冒頭コメントへ [OWNERSHIP] を追加
    （sectionsはChordMini由来ではなくユーザー定義メタデータである旨）
  ・機能変更なし

js/app.js
  ・beginAnalysisEdit()
      analysisEditor.sections = structuredClone(project.analysis.raw.sections ?? []);
      を追加
      理由: Phase103本体（Session読み込み）

  ・saveAnalysisEdit()
      project.analysis.raw.sections = structuredClone(getSections(analysisEditor));
      を追加
      理由: Phase103本体（Session書き戻し）

  ・resetAnalysisEditor()
      _previewSectionId = null;
      setSectionPreview([]);
      を追加
      理由: §6 Findings②（Phase102由来のSection Preview残留バグ修正）

  ・openSectionModal() / openSectionRenameModal() / openSectionDeleteConfirm()
      renderSectionBar() → _refreshEditorView() へ統一（3箇所）
      理由: §6 Findings①（Phase100-A由来のdirtyバグ修正の一部。
      dirtyがtrueになっても保存ボタンを含むフッターパネルが再描画
      されないと画面に反映されないため）

js/analysisCommands.js
  ・createSectionCommand() / renameSectionCommand() /
    updateSectionBoundaryCommand() / deleteSectionCommand()
      各コマンド成功時に state.dirty = true; を追加（4箇所）
      理由: §6 Findings①本体（dirtyバグ修正）

いずれも node --check 通過・CRLF全行維持・実機確認済み
（Section作成→保存ボタン活性化→保存→編集終了→再度開く→Section保持を確認、
Section Preview→編集終了→非編集表示でゴールド背景が消えることを確認）。
```

---

## 10. Micro Log

- 当初「sectionsをraw.sectionsに保存するか、独立引数化するか」でClaude・ChatGPT間の
  見解が分かれたが、実装コード（saveAnalysisFile()がrawを丸ごとPOSTする構造・
  rawが参照透過であること）を実際に読み直した結果、raw.sections方式の方が
  変更範囲・データ消失リスクの両面で優れていることが判明し、当初のClaude案
  （独立引数化）を撤回した
- 「ownership ≠ storage location」という整理はChatGPTの指摘によるもの。
  保存場所の判断は生成元の一致ではなく、既存の永続化スキーマとの一貫性を
  優先してよい、という一般原則として今回言葉にした（新しい仕組みを
  追加したわけではなく、既存の実装判断を整理して名前を付けた形）
- Section機能単体のテストでは問題が起きず、「実際に保存→編集終了→再読込」という
  一連の実機フローを踏んで初めて2件のバグ（dirty・Section Preview残留）が
  顕在化した。単体の動作確認だけでなく、フルサイクルの実機検証が積み残しの
  発見に直結した典型例
- 3回にわたる実機確認（スクリーンショット）を経て、最終的に全項目パス。
  node --check・CRLF維持は変更のたびに都度確認済み

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: なし（current-issues.mdに個別issueとして記載されていた項目はなし。
  Section Data Layerの進捗表記があれば、Phase103完了を追記する）
- 今回新規に積み残したissue: なし
  （P1〜P4はいずれもPhase100-Aから継続保留の既存項目であり、新規ではない）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
