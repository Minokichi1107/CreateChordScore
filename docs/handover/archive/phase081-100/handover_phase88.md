# 引き継ぎ: Phase88完了 — Analysis Editor Command Layer拡張（updateChord / splitChord / moveBoundary）

> ChatGPT監査済み（Factual precision: 1件修正）。§3・§6・Micro Logの置換Undo
> 関連記述を「確定した事実」と「未検証の解釈」を分離する形へ修正済み。

## 作業状態
- ブランチ: phase88-command-layer-extension（想定。実ブランチ名は運用に合わせて読み替え）
- 直前作業: Phase87完了（Command Layer抽出：copy/cut/delete/paste/merge）

---

## 1. Purpose（目的）

Phase87で確立したCommand Layer（analysisCommands.js）を、残る3つのEditing Command
（updateChord / splitChord / moveBoundary）へ拡張する。

この3関数はPhase87対象（copy/cut/delete/paste/merge）と性質が異なり、
「app.js内の単一ラッパーからのみ呼ばれる」のではなく「app.js内の複数箇所から
直接呼ばれる共有部品」である点を実コード監査で確認した上で着手した。

---

## 2. Scope（今回やったこと）

```
Sprint A: moveBoundaryCommand抽出
  ・境界（隣接コード間の時刻）を書き換える唯一の窓口をanalysisCommands.jsへ移設
  ・元々DOM/history/toastに一切触れない低レベルprimitiveだったため、
    ロジック変更なしでそのまま移設
  ・app.js側のmoveBoundary()を1行委譲のラッパーに変換

Sprint B: updateChordCommand / splitChordCommand抽出
  ・state mutation（history push・buffer書き換え）をanalysisCommands.jsへ移設
  ・DOM再描画（_refreshEditorView()）はapp.js側のラッパーに残置
  ・呼び出し側6箇所（replaceCurrentMatch / addChordAtEditPoint /
    openChordRenameSelector / aep-addボタン×2 / const newId = splitChord×1）は
    シグネチャ・戻り値を完全維持したため無修正
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Add Here / aep-addの「分割+リネーム」を1つのUndo単位にまとめる修正
  → 実機検証で発見した既存バグ（Issue #46・詳細は§6/§7）。
    Phase88の目的（境界抽出）とは別軸の挙動変更にあたるため、
    ChatGPTレビューの判断に従い別issueとして切り出した。

・置換（replaceCurrentMatch）のUndoに関する調査
  → 実機検証で「Undoが効かない」との報告があった。「入力欄にフォーカスを
    残したままCtrl+Zを押した場合にundoEdit()が発火しない」ことは既存の
    意図的なガード（inTextInput）で説明でき、「元に戻す」ボタンでは
    正常にUndoできることを実機確認した。ただし「ユーザーが感じた
    置換Undoのストレス」自体がこの仕様だけで完全に説明できるかは
    追加のUX検証が必要であり、断定はしていない（詳細は§6）。
    コード不具合は再現できていないためIssue化は行わず、将来的な
    ショートカットUX改善候補として扱う。

・Result Protocol（{ok, reason}）のmoveBoundaryCommandへの適用
  → 意図的に対象外とした（§5参照）。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `moveBoundaryCommand`新設 | 既存`moveBoundary()`のロジックをそのまま移植。戻り値`number\|null`を維持し、Result Protocol対象外の例外として明記 | analysisCommands.js |
| `updateChordCommand`新設 | `pushHistory`→`Object.assign`のstate mutationのみ抽出。`{ok, reason}`を返す | analysisCommands.js |
| `splitChordCommand`新設 | `pushHistory`→分割→`refreshSelection`のstate mutationのみ抽出。`{ok, newId}`を返す | analysisCommands.js |
| import追加 | `moveBoundaryCommand` / `updateChordCommand` / `splitChordCommand`の3件 | app.js |
| `moveBoundary()`薄いラッパー化 | Command呼び出しへの1行委譲。シグネチャ・戻り値は不変 | app.js |
| `updateChord()`薄いラッパー化 | Command呼び出し＋`_refreshEditorView()`。シグネチャ・戻り値は不変 | app.js |
| `splitChord()`薄いラッパー化 | Command呼び出し＋`_refreshEditorView()`。シグネチャ・戻り値は不変 | app.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] moveBoundaryCommandはResult Protocol（`{ok, reason}`）の対象外とする

```
結論:
  moveBoundaryCommand()は他のCommandと異なり{ok, reason}を返さず、
  従来通りnumber|nullを返す。

理由:
  Phase87のResult Protocolは「ユーザー操作1回」の粒度を対象にしていた。
  moveBoundaryは
    ・historyを積まない（呼び出し側のshiftSelectedBoundary()/
      shiftSelectionRange()がユーザー操作1回分としてpushHistory()を呼ぶ）
    ・将来ドラッグ操作等で1操作中に連続呼び出しされる可能性がある
  という点で「ユーザー操作」ではなく低レベルprimitiveである。
  これはbuildPastePlan（純粋なplanning helper・専用shape）と同じ前例に基づく。
```

### [判断] updateChord/splitChordはDOM再描画をapp.js側に残し、呼び出し側を無修正にする

```
結論:
  analysisCommands.js側はstate mutationとResult返却のみ。
  _refreshEditorView()はapp.js側の薄いラッパー内で1回だけ呼ぶ。
  呼び出し側6箇所（replaceCurrentMatch等）は一切変更しない。

理由:
  Phase87対象（copy/cut/delete等）と異なり、updateChord/splitChordは
  app.js内の複数箇所から直接呼ばれる共有部品だった。関数内から
  _refreshEditorView()を追い出すと、呼び出し側6箇所すべてに追記が
  必要になり影響範囲が拡大する。関数名・シグネチャ・「呼べば画面まで
  更新される」という既存の呼び出し契約を維持することを優先した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### Issue #46 — Add Here / aep-addのUndoが2段階になる（Phase88起票・Phase75由来の既存バグ）

```
実機検証で発見。「コードを追加」操作（splitChord→updateChordの組み合わせ）は
ユーザーからは1回の操作に見えるが、それぞれが独立してpushHistory()を呼ぶため、
内部的にはUndo単位が2回に分かれていた。

Undo 1回目: リネームのみ取り消し（分割は残ったまま、分割元と同じ名前に戻る）
Undo 2回目: 分割自体が取り消される

実コード確認の結果、この二重pushは元のコード（Phase75由来、Phase88の
Sprint A/B以前）から存在していた。Phase88のCommand抽出では
pushHistoryの呼び出し回数・順序を一切変更していないため、
今回の抽出が原因ではなく、今回の実機検証で初めて可視化された
潜在バグと判断した（ChatGPTレビューでも同じ結論）。

対応方針: Phase88の目的（境界抽出）と挙動変更を混ぜないため、
今回は修正せずIssue #46として切り出した。将来的な修正案としては
「分割+リネームをpushHistory 1回にまとめるtransactional Command
（commitPastePlanと同型のパターン）」を候補とする。
```

### 置換（replaceCurrentMatch）のUndoが効かないという報告 → 事実と解釈の分離（ChatGPT監査で指摘・修正）

```
実機検証で「置換後にCtrl+Zを押してもUndoされない」との報告があった。
updateChordCommand / pushHistory / undoBufferの実コードを確認したが
ロジックに問題は見つからなかったため、キーボードショートカット周りを
調査したところ、以下のガードを発見した。

  const inTextInput = tag === 'INPUT' || tag === 'TEXTAREA';
  if (!inTextInput && e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    undoEdit();
  }

[確定した事実]
・「入力欄にフォーカスを残したままCtrl+Zを押した場合」にundoEdit()が
  発火しないことは、このinTextInputガード（ブラウザ標準のテキスト入力
  Undoと衝突させないための意図的な設計）で説明できる。
・Footer UIの「元に戻す」ボタン（aep-undo、クリックハンドラはフォーカス
  状態に依存しない）で実機確認したところUndoは正常に機能した。

[断定していないこと]
・「ユーザーが感じた置換Undoのストレス」自体が、この仕様だけで完全に
  説明できるかどうかは追加のUX検証が必要であり、断定していない。
  コード不具合としては再現できていないため、今回はIssue化せず、
  将来的なショートカットUX改善候補として扱う（案: Escapeで
  フォーカスを外してからCtrl+Zする／置換直後は文脈依存でアプリUndoを
  優先する等。詳細検討はPhase89以降）。
```

---

## 7. Remaining Issues（残課題）

```
・Issue #46 — Add Here / aep-addのUndoが2段階になる
  状態: 発見済み・未対応（Phase88では意図的に見送り）
  内容: splitChord()とupdateChord()がそれぞれ独立してpushHistory()を
  呼ぶため、「コード追加」1操作のUndoが2段階に分かれる。
  次のアクション候補: split+renameを1回のUndo単位にまとめる
  transactional Command（commitPastePlanと同型）の設計検討。
  影響確認が必要な範囲: selection / editPoint / search match /
  chart decoratorとの同期。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase89候補: Issue #46の対応（Add Here Undo統合）
対象:
  ・addChordAtEditPoint() / aep-addボタンハンドラが個別に呼んでいる
    splitChord() → updateChord() を、1回のpushHistory()で完結する
    addChordCommand(state, ownerId, splitTime, newChordName)へ統合する
  ・[AE-6]（一括操作はUndo単位1回）をこのフローにも適用する

着手前に確認すべきこと:
  ・selection / editPoint / search match / chart decoratorへの
    影響範囲を実コードで再確認してから設計を確定する
    （Phase87の教訓：設計を先に決めず実コードを見てから対象範囲を確定する）
  ・呼び出し側2箇所（addChordAtEditPoint / aep-addボタン）の
    影響を個別に洗い出す

その他の将来候補（phase-status.md「Future Candidates」より）:
  ・updateChord/splitChordの二重再描画（呼び出し側が独自に
    _refreshEditorView()を追加で呼んでいる箇所）の最適化
    → Phase88では意図的に対応せず、挙動変更を混ぜない方針を維持した
```

---

## 9. Files Changed（変更ファイル一覧）

```
analysisCommands.js
  ・moveBoundaryCommand / updateChordCommand / splitChordCommand を実装
  ・理由: Analysis Editor Command Layerの拡張（本フェーズの主目的）

app.js
  ・analysisCommands.jsからのimportを3件追加
  ・moveBoundary() / updateChord() / splitChord() を薄いラッパー化
  ・理由: 上記と同じ。DOM再描画（_refreshEditorView）はこちらに残置
```

---

## 10. Micro Log

- Sprint A着手前にchartmode.jsをgrepし、moveBoundary/updateChord/splitChordの
  いずれも直接参照していないことを確認（chartmode.js側の変更は不要と判断）
- Sprint A実装前にmoveBoundary()の全呼び出し元（shiftSelectedBoundary/
  shiftSelectionRange）を確認し、既にhistory pushをここで行っていない
  低レベルprimitiveであることを確認してから抽出方針を確定した
- Sprint B着手前にupdateChord/splitChordの全呼び出し元を実コードでgrepし、
  4箇所+2箇所が関数内の_refreshEditorView()に依存していることを確認。
  この依存を壊さないため「シグネチャ完全維持のラッパー」方針とした
- 各Sprint後にnode --check・CRLF維持・呼び出し側の無修正確認（grep）を実施
- 実機検証（Undo/Redo）でSprint A・Bとも境界移動・分割・リネーム自体は
  正常動作を確認。ただし検証の過程で以下2件が判明:
  1. Add Here/aep-addのUndoが2段階になる現象を発見。実コード確認により
     Phase88のCommand抽出が原因ではなく、Phase75由来の既存バグと判定。
     ChatGPTレビューでも「境界抽出とUX修正を混ぜない」方針に基づき
     別issue化が妥当と判断され、Issue #46として起票することにした
  2. 置換のUndoが効かないという報告があった。「入力欄にフォーカス中の
     Ctrl+ZがundoEdit()を発火しない」ことはinTextInputガードで説明でき、
     「元に戻す」ボタンでは正常にUndoできることを実機確認したが、
     ユーザーが感じたUX上のストレス自体が仕様だけで完全に説明できるかは
     断定せず、将来のショートカットUX改善候補として保留した
     （ChatGPT監査でこの区別を明確にするよう指摘・修正）

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - Issue #46 — Add Here / aep-addのUndoが2段階になる
    （splitChord+updateChordが個別にhistoryを積むため。Phase75由来・
    Phase88の実機検証で発見。修正はPhase89以降の候補とする）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
