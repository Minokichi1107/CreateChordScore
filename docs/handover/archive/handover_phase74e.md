# 引き継ぎ: Phase74-E完了 — 個別コード境界移動機能 + 矢印キー競合修正

## 作業状態
- 直前作業: Phase74-D完了（確認フェーズ・個別移動機能の設計質問①②③）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `moveBoundary()` 新設 | 境界（隣接2コード間の時刻）を書き換える唯一の窓口。純粋な代入のみ、範囲チェックは持たない | app.js |
| `shiftSelectedBoundary()` 新設 | ボタン/矢印キー入力を受け、範囲チェック後に`moveBoundary()`を呼ぶUIコマンド層 | app.js |
| `_refreshSelection()` 新設 | selection（chordIds/boundaryIndex）の唯一の同期窓口 | app.js |
| 個別移動UI追加 | 編集パネルに「個別移動（選択中コードの右側の境界）」欄・ボタン4種を追加 | app.js |
| 矢印キー対応 | ←→キーで境界移動（Shift併用で0.5秒刻み） | app.js |
| `audioCallbacks.isEditingAnalysis` 追加 | 解析編集中かどうかをaudio.jsへ伝える依存注入 | app.js |
| audio.js矢印キーガード | 解析編集中は±5秒シークをスキップ | audio.js |

---

## 確定した設計原則

### 【境界更新の唯一の窓口】（BOUNDARY UPDATE AUTHORITY）
```
moveBoundary(boundaryIndex, newTime) が境界更新の唯一の窓口。
Invariant: left.end と right.start は常に同じ値になるよう更新する。
範囲チェックはこの関数の責務ではない（呼び出し側=shiftSelectedBoundary()が判断する）。
将来のドラッグ編集・波形スナップも、最終的にはこの関数を呼ぶだけで済む設計。
```

### 【選択状態の派生キャッシュ】（SELECTION DERIVED CACHE）
```
selection.boundaryIndex は chordIds から buffer を検索して導いた派生キャッシュ。
_refreshSelection() 以外の場所で直接書き換えてはならない。

buffer が入れ替わる5経路（reset/begin/delete/undo/redo）すべてで
_refreshSelection() を呼ぶことを確認済み（grep audit実施）。

Undo/Redo後は、選択中のコードがbufferに残っていれば選択を維持し、
消えていた場合のみ選択解除する（単純にnullを代入するより体験がよい）。
```

### 【キー入力の責務分離】（KEY OWNERSHIP GUARD）
```
グローバルショートカット同士の競合は、stopImmediatePropagation()による
イベント順序への依存ではなく、「今は自分が処理すべきでない」と各モジュールが
自発的に判断する依存注入パターンで解決する（chartmode.jsのisEditingAnalysisと統一）。

audio.js / tapmode.js は app.js を直接importしない（依存の向きを守る）。
今回はaudio.jsのみ修正。tapmode.jsは実害がないため見送り
（tap-overlayが開いている時のみ発火する既存ガードがあるため）。
```

---

## 発見した誤解（記録）

実機テストで「境界を動かしても別のコードが動いた」という報告があったが、
これはバグではなく仕様通りの挙動だった。空白の小節は「前のコードが継続中」
であることを示す表示であり、選択コードの右境界＝次に違うコードが始まる位置、
という対応関係が正しく動いていた。

また「矢印キーで小節フォーカスが動く」という報告も、当初は競合を疑ったが、
実際には「音声が一時停止されていなかった」ことによる自然な再生位置の
進行だった（後の再テストで確定）。真の競合（audio.js ±5秒シーク）は
その後、一時停止した状態での再テストで確認された。

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| コード選択→ボタン/矢印キーで境界移動 | ✅ |
| 境界を限界まで動かす→トースト表示 | ✅ |
| 移動後にUndo/Redo | ✅ |
| 保存して閉じる→再度開く | ✅ |
| Chart Mode編集中の矢印キー→再生位置が変化しない | ✅ |
| Chart Modeを閉じた通常時の矢印キー→±5秒シークが今まで通り動く | ✅ |

---

## current-issues.md更新
- 今回closeしたissue:
  - 個別コード境界移動機能（新規追加即完了）
  - 矢印キー競合（audio.js）
- 今回新規に積み残したissue:
  - Analysis Editor（1エントリとして継続管理・チェックリスト形式）
  - ライブラリ：曲を開くと同じアーティスト内で一番上に移動する（退行の疑い）

---

## Phase74完了後の棚卸しについて

Phase70〜74がProject DB（保存系）とAnalysis Editor（編集系）という
2つの大きな設計の節目になったため、当初「Analysis Editor完成後にまとめて
整理」の予定だったドキュメント棚卸しを、Phase74完了時点で前倒しして実施した
（内容は本チャット内でChatGPTの監査を経て確定済み。実際のリポジトリへの
適用・マージはこの後、開発者が行う）。

棚卸し対象:
- current-issues.md（Phase73-B〜Fの反映漏れ含めて整理）
- phase-status.md（Phase70〜74の履歴を正式反映）
- architecture.md（§11 Project Repository Architecture / §12 Analysis Editor
  Architecture / §13 Authority Index を新設）
- docs/handover/README.md（軽量版/重量版のテンプレート使い分けを追記）
- docs/handover/template-heavy.md（新設・重量版テンプレート本体）
- docs/doc-glossary.md（新設・ドキュメント用語対応表）

プロジェクトルートのREADME.mdは今回見送り。理由はAnalysis Editorに限らず、
UX改善・Issue対応など主要機能が一通り揃った段階で作成する方針としたため。

---

## 次フェーズ候補

区切りの基準: `selection.chordIds` が単数か複数か。

```
単一コード編集: コード追加 / 削除 / コード名編集 / 境界調整の仕上げ /
                削除後の自動選択
複数コード編集: 範囲選択 / Copy・Cut・Paste / 複数削除 / 分割・結合
```

フェーズ番号は固定しない（作業粒度により75A/75B等に分裂する可能性があるため）。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
