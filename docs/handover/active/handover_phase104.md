# 引き継ぎ: Phase104完了 — Section History Integration

## 作業状態
- ブランチ: phase104-section-history-integration
- 直前作業: Phase103完了（Section永続化 + 実機検証で発見した2件のバグ修正）

---

## 1. Purpose（目的）

Section系4コマンド（create/rename/updateBoundary/delete）は、Phase100-A時点で
意図的にpushHistory()を呼ばない設計（[SECTION HISTORY INTEGRATION]・Undo非対応）
になっていた。理由は、既存History機構がbuffer専用のsnapshotであり、Section変更を
そのまま乗せてもUndo/Redoが機能しないためである。

Phase98〜103でSection機能がSpecification→Session→UI→Preview→Persistenceまで
一巡し実用可能になった現在、最後に残った主要な未完了事項がこのHistory非対応
だった。Phase104はHistory機構自体をSection対応へ拡張し、この欠落を解消する。

```
S. Section Specification（仕様固定）        ── Phase98完了
A. Section Data Layer（Session Layer実装）  ── Phase100-A完了
B. Section Editor（UI）                     ── Phase101完了
   Section Preview Decorator                ── Phase102・102-B完了
   Section永続化                            ── Phase103完了
   Section History Integration              ← 本フェーズ（Phase104）
```

---

## 2. Scope（今回やったこと）

```
・history/futureのスナップショット形状を buffer単体 から { buffer, sections } へ拡張
    ・_snapshotSession() 新設（buffer・sectionsをそれぞれ独立clone）
    ・pushHistory() / undoBuffer() / redoBuffer() を新形状へ対応
・Section系4コマンド（create/rename/updateBoundary/delete）へ pushHistory() を追加
    ・呼び出し位置は既存Command（deleteChordCommand等）と完全に同じ規則
      （バリデーション通過後・実際の変更の直前）に統一
・Phase103で個別追加していた state.dirty = true（Section系4コマンド分）を削除
    ・pushHistory()内の session.dirty = true への一本化
・app.js側への影響確認（コード変更なし。既存の仕組みで対応済みと判明）
・current-issues.md / section-model.md / architecture.md の更新
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Section Selection State（selectedSectionId等）
    → History（過去へ戻す）とNavigation（今どこを見るか）は責務が異なるため、
      Phase105候補として分離した。

・チップクリック時の自動スクロール（Section Navigation）
    → 上記と同じ理由でPhase105候補。ChatGPTとの事前レビューで、
      Historyフェーズに混在させると「Undoがおかしいのかスクロールが
      おかしいのか」の切り分けが難しくなる、という指摘を反映した。

・Boundary reassignment（境界コード削除時の隣接コードへの自動付け替え）
    → 既存の current-issues.md P2 のまま。Phase104のスコープ外。

・updateSectionBoundaryCommand() のUI実装
    → 境界編集UI自体が未着手（current-issues.md P2/P3）。本フェーズでは
      History対応のみ行い、UI実装は行わない（下記4参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| スナップショット拡張 | `_snapshotSession(session)` 新設。`{ buffer: structuredClone(...), sections: structuredClone(...) }` を返す内部ヘルパー | analysisSession.js |
| pushHistory() | `history.push(_snapshotSession(session))` へ変更（従来は `structuredClone(session.buffer)` のみ） | analysisSession.js |
| undoBuffer() / redoBuffer() | push/pop対象を `_snapshotSession()` の形状に合わせ、`session.buffer` と `session.sections` の両方を入れ替えるよう変更 | analysisSession.js |
| createSectionCommand | バリデーション通過後・`state.sections.push()`直前に `pushHistory(state)` を追加。既存の `state.dirty = true` を削除 | analysisCommands.js |
| renameSectionCommand | section存在確認後・name/type書き換え直前に `pushHistory(state)` を追加。既存の `state.dirty = true` を削除 | analysisCommands.js |
| updateSectionBoundaryCommand | バリデーション通過後・startChordId/endChordId書き換え直前に `pushHistory(state)` を追加。既存の `state.dirty = true` を削除 | analysisCommands.js |
| deleteSectionCommand | section存在確認後・`sections.splice()`直前に `pushHistory(state)` を追加。既存の `state.dirty = true` を削除 | analysisCommands.js |

`app.js`（`undoEdit()` / `redoEdit()` / `_refreshEditorView()` / `renderSectionBar()` /
`_syncSectionPreviewVisibility()` / `_syncSectionMenuVisibility()`）はいずれも無変更。
既存の仕組みがそのままPhase104の要件を満たしていたため（詳細は§6 Findings参照）。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] History snapshotをA案（buffer+sections複合スナップショット）で統一する

```
結論:
  history[n] / future[n] は { buffer, sections } という1つの複合
  スナップショットとする。buffer historyとsection historyを別々に
  持つB案（履歴分離）は採用しない。

理由:
  このプロジェクトの一貫した原則である「ユーザー操作1回 = Undo1回」
  （[UNDO TRANSACTION INVARIANT]）と最も自然に整合する。B案（履歴分離）
  だと「コードだけ戻る」「Sectionだけ戻る」という操作が理論上可能になり、
  Undoの意味論自体が曖昧になる。

  A案であれば、コード編集・Section編集のどちらの操作後にUndoしても、
  「その操作の直前の状態（buffer・sections両方）」へ確実に戻るという、
  ユーザーにとって直感的な唯一の挙動になる。

  この判断はChatGPTとのレビューで事前に確認済み（本フェーズ開始前の
  会話で合意）。
```

### [判断] pushHistory()の呼び出し位置を既存コマンドと完全一致させる

```
結論:
  Section系4コマンドのpushHistory()呼び出し位置は、既存コマンド
  （deleteChordCommand等）と完全に同じ規則
  「バリデーションを全て通過した直後・実際の変更に取りかかる直前」
  に統一する。

理由:
  実コード監査（deleteChordCommand / pasteSelectionCommand /
  mergeSelectionCommand等）の結果、既存コマンドは全てこのタイミングで
  一致していた。moveBoundaryCommand()のみ例外だが、これはhistory自体を
  持たない低レベルprimitiveとして最初から設計されており、比較対象では
  ない。

  Sectionだけ異なるタイミング（例: 変更後に積む）にすると、複数操作を
  跨いだUndo/Redoで「どの操作の後にpushしたか」がコマンドの種類によって
  変わってしまい、Undo/Redoの一貫性が壊れるリスクがある。この確認は
  実装前にChatGPTから明示的に指摘された懸念点であり、実コードを確認した
  上で解消したことを本handoverで記録する。

  結果として「バリデーション失敗時はpushHistory()を呼ばない（無駄な
  History積み増しを防ぐ）」という既存コマンドの副次的な性質も、Section
  系コマンドへ自然に踏襲された。
```

### [判断] Phase103の個別dirty設定を削除し、pushHistory()内へ一本化する

```
結論:
  Phase103でSection系4コマンドへ個別追加していた state.dirty = true は
  削除する。dirtyの更新はpushHistory()内のsession.dirty = trueのみに
  統一する。

理由:
  Phase103時点ではSection系コマンドがpushHistory()を呼ばない設計だった
  ため、「未保存変更の検知」のためだけにdirty更新を個別に持たせる必要が
  あった。Phase104でpushHistory()を呼ぶようになった今、この個別設定は
  二重管理になる。「Historyに積まれた＝未保存変更がある」という、
  Phase100以前の全コマンドに共通する既存原則へ回帰させることで、
  dirty管理の経路を1つに戻した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### app.js側は無変更で要件を満たしていた

Phase104着手前に想定していた「undo/redo後、Section Bar/Section Previewの
再描画が漏れるのでは」という懸念は、実コード確認の結果、既存の仕組みで
既に解消されていることが判明した。

```
undoEdit() / redoEdit()
    ↓
_refreshEditorView()          ← 無条件に呼ばれる（既存フロー）
    ↓
renderSectionBar()            ← 無条件に呼ばれる（既存フロー・Phase101-1）
    ↓
_syncSectionPreviewVisibility()  ← Previewしていたsectionが消えていれば自動解除
_syncSectionMenuVisibility()     ← ▼メニューが開いていたsectionが消えていれば自動で閉じる
```

`_syncSectionPreviewVisibility()`（Phase102）は「_previewSectionIdが指すSectionが
再描画後も存在するか」をチェックし、消えていればPreviewを自動解除する設計に
既になっていた。これはPhase102時点でRename/Delete操作向けに実装されたガードだが、
undo/redoによるSection消滅・復活にも同じロジックがそのまま機能する。
`_syncSectionMenuVisibility()`（Phase101-3）もDOM存在チェック方式のため同様。

結果として、Phase104はanalysisSession.js / analysisCommands.jsの2ファイルの
変更のみで完結し、app.jsへの変更は一切不要だった。

### updateSectionBoundaryCommand()の現在の到達可能性

`grep`による実コード確認で、`updateSectionBoundaryCommand()`をapp.js側から
呼び出す経路が現時点で存在しないことを確認した（境界編集UI自体が
current-issues.md P2/P3として未着手のため）。そのため「Section Previewが
有効な状態でUndo/Redoにより境界だけが変わる」というシナリオは、現状の
実装では発生し得ない。ご指示に基づき、この関数はHistory対応済みの実装として
削除・簡略化せず維持し、将来の境界編集UI実装時に再確認すべき事項として
section-model.md §10・architecture.md §12へ申し送りを残した。

---

## 7. Remaining Issues（残課題）

```
P2  Boundary reassignment（§4.3ケースB・Phase100-Aより継続）
    境界コード削除時の「隣接コードへの自動付け替え」は未実装
    （reconcile()は常にSection自体を削除するケースC相当のみ）。

P3  Section Selection State（Phase100-A・101-3より継続）
    selectedSectionId等。Phase105でNavigation機能（チップクリックでの
    自動スクロール）とセットで設計する方針。

P4  チップ本体クリック時の挙動拡張（Phase101-4以降候補）
    現状は「Preview表示/解除のトグル」のみ。

（将来対応・P2/P3着手時に確認）
    updateSectionBoundaryCommand()のUI実装時、Section Previewが有効な
    状態で境界がUndo/Redoされた場合にPreview側のchordIds（Derived Cache）
    が追随して再計算されるかを別途確認する必要がある（現状は経路自体が
    存在しないため実害なし）。

（Phase93より継続）Boundary Handle Dragのpointercancel経路が未検証
  状態: 未対応（Section作業とは無関係の既存の積み残し。継続保持）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
候補（優先順位は次回セッション開始時に相談）:
  ・Phase105: Section Navigation
      Section Selection State（selectedSectionId）
      チップクリック時の自動スクロール／ジャンプ
      Section Focus
  ・P2 Boundary reassignment
  ・current-issuesの他の軽量課題

Phase104でSection機能の「作れる・表示できる・保存できる・元に戻せる」が
一通り完成した。次はNavigation（今どこを見ているか）の領域が自然な流れ。
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/analysisSession.js
  ・_snapshotSession(session) を新設
      { buffer: structuredClone(session.buffer),
        sections: structuredClone(session.sections) }
      を返す内部ヘルパー
      理由: buffer・sectionsを1組のスナップショットとして扱うための
      共通処理を1箇所に集約（push/undo/redoの3箇所で重複させない）

  ・pushHistory(session)
      history.push(_snapshotSession(session)) へ変更
      理由: Phase104本体（スナップショット形状拡張）

  ・undoBuffer(session) / redoBuffer(session)
      push/pop対象を_snapshotSession()形状に統一し、
      session.buffer と session.sections の両方を入れ替えるよう変更
      理由: 同上

js/analysisCommands.js
  ・ヘッダーコメント（SECTION COMMANDSブロック冒頭）
      [SECTION HISTORY INTEGRATION] の記述を「解消済み」の内容へ更新
      理由: ドキュメントとしての正確性維持

  ・createSectionCommand() / renameSectionCommand() /
    updateSectionBoundaryCommand() / deleteSectionCommand()
      各コマンドのバリデーション通過後・実際の変更の直前に
      pushHistory(state) を追加（4箇所）
      既存の state.dirty = true は削除（4箇所）
      理由: §4 Implementation・§5 Design Decisions参照

いずれも node --check 通過・CRLF全行維持を確認済み。
（実機での動作確認は未実施。次回起動時に以下を確認予定:
  Section作成→Undo→Section消滅、Rename→Undo→名前復元、
  Delete→Undo→Section復活、の3パターン）
```

### ドキュメント変更

```
docs/current-issues.md
  ・P1（Section History Integration）を削除
  ・Section Data Layerの進捗記述を更新（Phase104まで反映）

docs/section-model.md
  ・冒頭ステータスを「Phase104完了時点」へ更新
  ・§6 Update に [Phase104補足]（Command Layer側の明示的更新と
    reconcile側の暗黙更新は別経路であることの明記）を追加
  ・§7 ロードマップのA項目にHistory完了を反映
  ・§9 経緯ログへPhase104のエントリ（15〜19）を追加
  ・§10 チェックリストを更新（完了項目のcheck・Phase105/P2向けの
    新規項目を追加）

docs/architecture.md
  ・§12 [SECTION HISTORY INTEGRATION] を「Phase104で解消」の内容へ更新
    （対応方法・app.js側への影響確認・既知の制約を記載）
  ・実装の対応関係テーブルへ「History Integration」行を追加
  ・analysisSession.jsのモジュール説明にHistory snapshot形状拡張を追記
```

---

## 10. Micro Log

- ChatGPTとの事前レビューで、Phase104のスコープを「History Integrationのみ」
  に絞り、Section Navigation（チップクリックでのジャンプ）はPhase105へ
  分離する方針を確定してから実装に着手した
- pushHistory()のタイミングについて「既存コマンドと完全に揃えること」という
  指摘を受け、実装前にanalysisCommands.jsの既存コマンドを実コード監査した。
  結果、全コマンドが「バリデーション通過後・変更直前」で一致しており、
  Section系もそのまま同じ位置に挿入すればよいことを確認できた
- 実装後、app.js側の影響を懸念して確認したところ、Phase102・101-3で
  既に確立されていたガード（_syncSectionPreviewVisibility /
  _syncSectionMenuVisibility）がundo/redoにも自動的に機能することが判明し、
  app.js側の変更は一切不要だった
- dirtyの二重管理（Phase103の個別設定とpushHistory()内の設定）は、
  pushHistory()統合に伴い自然に解消した

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: P1 Section History Integration（Section Subsystem
  Progressの残課題リストから削除。History行としてphase-status.md /
  architecture.mdへ反映済み）
- 今回新規に積み残したissue: なし
  （P2〜P4はいずれもPhase100-Aから継続保留の既存項目であり、新規ではない）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
