# 引き継ぎ: Phase115完了 — 置換直後のCtrl+Z UX改善

## 作業状態
- ブランチ: phase115-replace-undo-ux
- 直前作業: Phase114完了（merge実行時のSection削除確認UX）

---

## 1. Purpose（目的）

置換欄（`replaceInput`）でEnter/Shift+Enterによりコードを置換した直後、
フォーカスが置換欄に残ったままCtrl+Zを押すと、既存の`inTextInput`ガード
（ブラウザ標準のテキストUndoとアプリUndoを衝突させないための意図的設計）
により`undoEdit()`が発火せず、ブラウザの入力欄Undoに処理が渡ってしまい、
コード置換自体をUndoできない問題があった（Phase88で発見・
current-issues.md「置換直後のCtrl+Zがブラウザ標準Undoと衝突しやすい」）。

本フェーズでは、既存の`inTextInput`ガードの設計思想（テキスト編集中は
ブラウザ標準Undoを優先する）を壊さずに、「置換直後」という文脈でのみ
Ctrl+Zをアプリ側Undoとして扱えるようにする。

---

## 2. Scope（今回やったこと）

- `analysisEditor.search`へ`replaceUndoPending`フラグを追加
- 置換成功時（`replaceCurrentMatch()`）にフラグをtrue化
- 置換欄への手動入力時（`input`イベント）にフラグをfalse化
- グローバルCtrl+Zハンドラへ、フラグ ∧ フォーカスが置換欄にあることを
  条件とする例外分岐を追加（`inTextInput`ガードの通常ロジックは無変更）
- `beginAnalysisEdit()` / `closeSearchBar()`の両方でsearch状態初期化時に
  フラグを明示的にfalseへ初期化

---

## 3. Out of Scope（今回はやらないと決めたこと）

- 置換欄以外の入力欄（AddChord・Rename等）でのCtrl+Z UX改善
  （常設フィールドである置換欄特有の問題であり、他の入力欄はモーダル形式で
  確定後にフォーカスが自然に外れるため、同じ問題が発生しない）
- Undo実行時のフラグ消費（「イ」案）は不採用。「ロ」案
  （フォーカスが置換欄にある限りCtrl+Z連打で多段Undoを継続）を採用
  （詳細は5. Design Decisions参照）
- Undo/Redo実行後、画面が変更箇所へ自動的に遷移する機能
  （実機検証中にたかっちが指摘した新規要望。Phase115のスコープ外として
  Future Issueへ分離。7. Remaining Issues参照）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| search状態初期化（2箇所） | `analysisEditor.search`オブジェクトへ`replaceUndoPending: false`を追加（`beginAnalysisEdit()`・`closeSearchBar()`の両方） | app.js |
| `replaceCurrentMatch()` | `updateChord()`呼び出し成功後に`replaceUndoPending = true` | app.js |
| `replaceInput`の`input`イベント | 手動入力時に`replaceUndoPending = false` | app.js |
| グローバルCtrl+Zハンドラ | `replaceUndoException`（フラグ ∧ `activeElement.id==='aep-search-replace-input'`）を`inTextInput`ガードの例外条件としてOR追加 | app.js |

変更行数: +13行（5箇所）。既存ロジックの削除・書き換えなし（追加のみ）。
`node --check`構文チェック・CRLF維持確認済み。

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Undo実行時にフラグを消費しない（「ロ」案採用）

```
結論: フラグは「置換欄への手動入力」でのみクリアする。Undo実行時には
      クリアしない。これにより、フォーカスが置換欄にある限りCtrl+Z連打で
      複数件の置換を1件ずつ多段Undoできる。

理由: Ctrl+Zは「1回押したら1段階戻る」という一般的な操作感を持つ。
      「最初の1回だけ特殊で、2回目からブラウザUndoに切り替わる」（イ案）は
      直感に反する。「置換欄を編集しない限りアプリUndoを継続する」という
      境界のほうが、ユーザーにとって一貫性がある（たかっち・ChatGPT双方の
      合意により決定）。
```

### [判断] 判定条件にフォーカス位置を含める

```
結論: フラグ単独ではなく「フラグ ∧ document.activeElement.idが
      置換欄と一致」を条件とする。

理由: フラグのみで判定すると、置換後に別のUI要素（Chart Grid・別の
      入力欄等）へフォーカスを移した場合でも、そのUIの標準Undoを誤って
      奪ってしまう（ChatGPTレビューで指摘）。フォーカス条件を加えることで、
      フォーカスが置換欄から外れた瞬間に例外が自動的に無効化され、
      別途blurイベントでのフラグクリア処理が不要になった。
```

### [判断] `replaceInput`変数ではなくID文字列で参照

```
結論: document.activeElement.id === 'aep-search-replace-input' という
      ID比較を採用。

理由: replaceInput変数はrenderAnalysisEditorPanel()関数内のローカル
      変数であり、グローバルCtrl+Zハンドラはsetup EventHandlers()内の
      別関数スコープに存在する。変数を直接参照できないため、DOM要素IDでの
      比較とした（ChatGPTから「直接参照できるなら優先、スコープ上無理なら
      現行案で可」との確認を受け、実コード確認の上でID比較を確定）。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

- **`replaceAllMatches()`（全て置換ボタン）は`replaceCurrentMatch()`を
  経由しない**独自実装（buffer直接書き換え + `_pushHistory()`を1回）
  だったため、今回のフラグ機構とは無関係。仮に直前の1件置換で
  フラグが残っていても、ボタンクリックでフォーカスが
  `aep-search-replace-all`ボタンへ移るため、フォーカス条件により
  自動的に無効化される（誤発動のリスクなし・実機確認済み）。
- **`closeSearchBar()`にも`beginAnalysisEdit()`と同一のsearch初期化
  パターンが存在**していたため、当初想定の4箇所ではなく実質5箇所の
  変更となった（[grep/view before assert]の実践により発見）。
- 実機検証（ケースE：置換後に別要素へフォーカス移動してCtrl+Z）で
  「直前の置換がUndoされた」という結果が出たが、これは**今回追加した
  例外条件の誤発動ではない**。フォーカスが置換欄から外れた時点で
  例外条件は不成立となり、既存の`inTextInput`ガードの通常ロジック
  （非input要素なら元々`undoEdit()`が呼ばれる）がそのまま正常に
  機能した結果である。誤解を避けるため明記しておく。

---

## 7. Remaining Issues（残課題）

Phase115のスコープ内に残課題なし。

以下は実機検証中にたかっちが指摘した**新規の気づき**であり、Phase115とは
別テーマとしてFuture Issueへ分離した。

```
新規Issue: Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX
状態: 未着手・構想段階
内容: 現在undoEdit()/redoEdit()はbuffer/画面の再描画のみを行い、
どのコードが変更されたか分かる位置へのスクロールは行わない。
「変更箇所」の定義は操作の種類（delete/move/split/merge/paste/
Section boundary mutation等）によって異なりうるため、対象位置の
特定方法を含めた設計が先に必要（実装方式は現時点で限定しない）。
関連: Section Navigationで確立した scrollToChord() /
[NAVIGATION OWNERSHIP]（責務分離パターン）が参考になる可能性がある。
```

---

## 8. Next Phase（次フェーズ開始位置）

たかっちの優先順位（Phase114 handoverより・Phase115実施済みのため更新）:

```
Phase116候補（優先）
  ④ __analysisEditorDebugの正式化整理
     観測専用（state/editorModeのみ）へ縮小し__CS_DEBUG__へ統合。
     コマンド直接公開（22関数）は撤去（Phase115合意時点の私の提案C）

Phase117以降候補
  ① isChordLikeInputの末尾検証強化
  新規: Undo/Redo後の変更箇所ナビゲーションUX（Future・構想段階）
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・beginAnalysisEdit() / closeSearchBar()のsearch初期化に
    replaceUndoPending: false を追加
    理由: 新規編集セッション・検索バー再オープン時に確実にfalseへ戻すため
  ・replaceCurrentMatch()に replaceUndoPending = true を追加
    理由: 置換が実際に成功した場合のみフラグを立てるため
  ・replaceInputのinputイベントに replaceUndoPending = false を追加
    理由: 置換欄を手動編集した時点で「置換直後」の文脈ではなくなるため
  ・グローバルCtrl+ZハンドラにreplaceイベントreplaceUndoException分岐を追加
    理由: inTextInputガードの通常ロジックを変更せず、例外条件をORで
    追加するだけに留めるため（既存コードへの影響を最小化）
```

---

## 10. Micro Log

- 事実確認: Ctrl+Zの経路（グローバルハンドラのinTextInputガード）と
  置換欄keydownリスナー（Enterのみ処理）を実コードで確認
- ChatGPTレビュー1回目: フラグ単独判定だと「別UIへフォーカス移動時に
  誤って奪う」懸念を指摘 → フォーカス条件をAND追加する設計へ修正
- 8ケースの意味論表を作成し、修正後の設計で全ケースが成立することを確認
- ChatGPTレビュー2回目（たかっち経由）: 「イ／ロ」（Undo時にフラグを
  消費するか）の選択を提示。たかっちが実例（3回連続置換の巻き戻し）で
  理解した上で「ロ」を選択
- 置換の全mutation入口（replaceCurrentAndAdvance・ボタン2種）を実コードで
  洗い出し、ボタン経由はフォーカス移動により元々対象外であることを確認
- ChatGPTレビュー3回目: replaceInput変数の直接参照可否・
  replaceAllMatches()との非干渉を確認するよう指摘 → スコープ確認の結果
  ID比較を採用、非干渉も実コードで確認
- 実装（app.js 5箇所）→ node --check + CRLF確認 → diff確認
- 実機検証8パターン実施（A〜H）。全て期待通り。Eの結果について
  「誤発動ではなく既存ロジックの正常動作」と解釈をたかっちへ説明
- 実機検証中、たかっちより新規要望（Undo後の画面遷移）を受領 →
  Phase115スコープ外と判断し、Future Issueとして分離

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue:
  - 置換直後のCtrl+Zがブラウザ標準Undoと衝突しやすい（Phase88で発見・
    Phase115で解消。`replaceUndoPending`フラグ + フォーカス条件により、
    置換欄にフォーカスが残ったままのCtrl+Zはアプリ側Undoとして扱われる
    ようになった。既存の`inTextInput`ガードの通常ロジック自体は無変更）
- 今回新規に積み残したissue:
  - Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX
    （未着手・構想段階。7. Remaining Issues参照）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### CLOSE
- 置換直後のCtrl+Zがブラウザ標準Undoと衝突しやすい（Phase88で発見・
  Phase115で解消。`analysisEditor.search.replaceUndoPending`フラグと
  フォーカス位置判定の組み合わせにより、置換欄にフォーカスが残ったままの
  Ctrl+Zをアプリ側`undoEdit()`として扱うようにした。置換欄を手動編集した
  時点でフラグは自動的にクリアされ、既存のブラウザ標準Undoに戻る。
  `inTextInput`ガードの既存ロジック自体は変更していない）

#### ADD
- 見出し: Undo/Redo後、変更箇所を確認しやすくするナビゲーションUX
  状態: 未着手・構想段階
  内容: undoEdit()/redoEdit()は現在buffer/画面の再描画のみを行い、
  変更箇所へのスクロール等は行わない。操作種別（delete/move/split/
  merge/paste/Section boundary mutation等）によって「変更箇所」の
  定義が異なるため、対象位置の特定方法を含めた設計が必要
  （Phase115実機検証中にたかっちが指摘。5. Future Featuresへ分類）

#### MODIFY
- 見出し: `__analysisEditorDebug`の正式な扱い未確定（Phase87で発見）
  変更内容: 未解決のまま（Phase116でこれから対応する）。ただしPhase115の
  Ctrl+Z UX改善に着手する過程で、たかっちの選定経緯（当初④を選択→
  ChatGPT提案で③を先行→④はPhase116へ）と合わせてPhase116の対応方針が
  内定した：「観測専用（`state`/`editorMode`のみ）へ縮小し`__CS_DEBUG__`へ
  統合、コマンド直接公開（22関数）は撤去」という方向（[DEBUG LAYER
  INVARIANT]・[BOUNDARY INVARIANT]との整合を理由とする）。
  **状態は引き続き「未着手」のまま変更しない**。「設計方針内定」を
  追記するのみで、解決済み扱いにはしない（Phase116実施後に正式CLOSE）。

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ 置換直後のCtrl+Z UX改善（Phase115・`replaceUndoPending`フラグと
    フォーカス条件により、置換欄にフォーカスが残ったままのCtrl+Zを
    アプリ側Undoとして扱えるようにした。既存`inTextInput`ガードの
    通常ロジックは無変更）

- Major Milestones（Analysis Editorテーブル）に追加:
  | 115 | 置換直後のCtrl+Z UX改善（`analysisEditor.search.replaceUndoPending`
    新設。フラグ単独ではなくフォーカス位置とのAND条件とすることで、
    別UIへのフォーカス移動時に誤ってUndoを奪う問題を回避。Undo実行時に
    フラグを消費しない設計により、置換欄にフォーカスがある限りCtrl+Z連打で
    多段Undoが可能） | app.js |

- Future Candidates: 次候補を更新
  ```
  Phase116候補: ④ __analysisEditorDebugの正式化整理
  Phase117以降候補: ① isChordLikeInput末尾検証強化
  新規Future: Undo/Redo後の変更箇所ナビゲーションUX（構想段階）
  ```

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
