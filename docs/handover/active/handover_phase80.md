# 引き継ぎ: Phase80完了 — Search Engine（検索・置換）実装

## 作業状態
- 直前作業: Phase79 Sprint2-2完了（Decorator Layer完成：Selection Highlight・
  Boundary Handle・EditPoint Marker）
- ブランチ: phase80-search-engine

---

## 1. Purpose（目的）

Analysis Editorに、コード進行に対する検索・置換機能（Search Engine）を追加する。
目的は「特定のコードが曲のどこに出てくるか」を素早く見つけ、必要なら一括で
修正できるようにすること。

---

## 2. Scope（今回やったこと）

```
・Search Engine本体（searchChords() ・ pure function）の新設
・Engine（見つける）とUI層（選択+シークする）の分離
・analysisEditor.search state新設（query/replaceText/matches/activeIndex/open）
・検索バーUI（🔍トグル・Ctrl+Fで開閉・Escで閉じる）
・置換UI（当初はモーダル方式 → 実機フィードバックにより常設インライン欄へ変更）
・単体置換（replaceCurrentMatch）・一括置換（replaceAllMatches・Undo単位1回）
・「置換して次/前へ」（replaceCurrentAndAdvance）
・キーボード操作一式（Enter/Shift+Enterの文脈依存の意味づけ・F3/Shift+F3）
・Search Highlight（Decorator）の新設 → 実機フィードバックにより3回のイテレーションを経て
  「専用色を持たない・Selectionの色を濃淡で流用する」設計へ収束
・[DECORATOR VISUAL LANGUAGE PRINCIPLE]の発見（ChatGPTレビューとの議論で確立）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・置換欄の入力検証（isChordLikeInput等）
  → chordEntry.jsが今回のセッションにアップロードされておらず、
    validation関数を安全に再利用できなかったため。検索欄（query）と
    同様に無検証の自由入力とした。Undoが正式な復旧手段（既存方針を踏襲）。

・通常のChart Modeクリック全体への「選択+シーク」の一般化
  → Sprint2-2 handoverの次フェーズ候補②「コード選択時の再生シーク同期」の
    一部のみを、検索結果クリック限定で先行実装した。通常のクリック全体への
    一般化は意図的に見送った（詳細は「9. Next Phase」参照）。

・Boundary Handle / Playheadの表示条件の見直し
  → 検索実装中に「画面の色数が多く落ち着かない」という指摘を受けて
    Decorator Layer全体の視覚言語を見直したが、表示条件（検索モード中は
    Boundary Handleを隠す等）の変更は「アイデア段階」に留め、今回は
    実装しない（ChatGPTレビューで「まだ実装するには理由が弱い」との
    判断・詳細は「6. Findings」参照）。

・capo変換後の表示コードでの検索・編集（Capo-aware Editing）
  → buffer（実音）のみを検索・編集対象とする既存方針を維持した。
    表示コードでの編集は、設計インパクトの大きさから独立フェーズとして
    切り出した（詳細は「9. Next Phase」参照。具体的なフェーズ番号は
    Phase81の進行状況次第で変わりうるため、ここでは固定しない）。

・ドキュメント棚卸し（README / architecture.md / current-issues.md /
  phase-status.md）
  → Phase81へ。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `analysisEditor.search` state新設 | `{ open, query, replaceText, matches, activeIndex, focusRequested }`。ownershipはanalysisEditor配下（ChatGPTレビューで確定：通常Editor検索・ライブラリ検索等が将来追加されても衝突しない構造） | app.js |
| `searchChords(buffer, query)` 新設 | Search Engine本体（pure function）。完全一致・大文字小文字は区別しない。buffer（実音・正本）のみを対象とし、capo変換後の表示名は対象外 | app.js |
| `openSearchBar()` / `closeSearchBar()` 新設 | 検索バーの開閉。開いた直後だけ自動フォーカスする仕組み（`focusRequested`）を持つ | app.js |
| `_activateSearchMatch(index)` 新設 | 検索結果を選択+シークする（UI層）。既存のselection authorityとseek機構（`aEl.currentTime`直接設定）にそのまま乗せる。ラップアラウンド対応 | app.js |
| `searchGoToNext()` / `searchGoToPrev()` 新設 | `_activateSearchMatch()`の薄いラッパー | app.js |
| `replaceCurrentMatch(newName)` 新設 | 単体置換。既存の`updateChord()`をそのまま呼ぶ（buffer authorityへの唯一の書き込み窓口を重複させない） | app.js |
| `replaceCurrentAndAdvance(direction)` 新設 | 「置換して次/前へ」の本体。置換欄のEnter/Shift+Enter、および「置換」ボタンから呼ばれる | app.js |
| `replaceAllMatches(newName)` 新設 | 一括置換。`_pushHistory()`を1回だけ呼び、bufferへ直接書き込む（Undo単位1回・commitPastePlan()と同じパターン） | app.js |
| `_refreshEditorView()` 拡張 | search.open時にmatchesを再計算・activeIndexをクランプ。Boundary Handle/EditPointMarkerと同じ「唯一の再描画経路で同期する」パターンを踏襲 | app.js |
| 検索バーUI | 🔍トグル（Selection行に常設・mode非依存）・検索欄・置換欄（常設インライン）・件数表示・◀▶・置換・全置換・✕ | app.js |
| キーボード | `Ctrl+F`（開く）・`Escape`（閉じる・最優先）・検索欄`Enter/Shift+Enter`（次/前へ）・置換欄`Enter/Shift+Enter`（置換して次/前へ）・`F3/Shift+F3`（次/前へ・フォーカス位置に関わらず動作・ヒット0件時はブラウザ標準に譲る） | app.js |
| `chartState.searchMatchIds` / `setSearchMatches()` 新設 | Search Highlightの表示対象（Decorator）。[DECORATOR ADDITION RULE]（Sprint2-2確立）に準拠 | chartmode.js |
| `_renderChartGrid()` 拡張 | Selection Highlightと同じownerId判定ロジックを共有し、Search Highlightを追加 | chartmode.js |
| `.chart-slot--search-match(-start/-end)` | 最終的に`--color-selection-rgb`を薄い alpha・細い枠（1px）で流用。専用色トークンは持たない | components.css |
| `--color-search`系トークン | 新設 → 3回の色調整（azure→マゼンタ→**削除**）を経て、最終的に廃止 | theme.css |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Search EngineとUIの分離（ChatGPTレビューで確定）

```
searchChords(buffer, query) は「見つける」だけ（pure function・matchIds配列を返す）。
選択+シークという「移動する」責務はUI層（analysisEditorの操作関数群）に置く。
将来、歌詞検索・ライブラリ検索等が同じ「buffer→matchIds」の考え方を
再利用しやすくなる。
```

### [判断] 置換の単体操作は`updateChord()`を再利用、全置換だけ直接buffer操作

```
単体置換（replaceCurrentMatch）: updateChord()をそのまま呼ぶ。
  理由: updateChord()は既にbuffer authorityへの唯一の書き込み窓口
  （_pushHistory→Object.assign→_refreshEditorView）として確立済みのため、
  置換専用の別ロジックを重複させる必要がない。

全置換（replaceAllMatches）: bufferへ直接書き込み、_pushHistory()は1回だけ。
  理由: updateChord()をヒット件数分ループ呼びすると、その件数分Undo履歴が
  積まれてしまい、Paste/Merge等で確立した「一括操作はUndo1回」という
  既存原則（[UNDO INVARIANT]）に反するため。
```

### [判断] 置換欄はモーダルではなく常設インライン欄（実機フィードバックによる変更）

```
経緯:
  当初は「置換」ボタン→showChordSelector()（モーダル）→入力→OK、という
  設計だった。実機で「17件を1件ずつモーダルで確認しながら置換するのは
  操作量が多すぎる」との指摘があり、ChatGPTレビューを経て
  常設インライン欄（🔍[query] → [replaceText]）へ変更した。

トレードオフ:
  常設欄はchordEntry.js側のisChordLikeInput検証を経由しないため、
  無検証の自由入力になる（「4. Out of Scope」参照）。誤入力時はUndoで
  復旧する前提とした。
```

### [判断] キー割り当て：フォーカス位置でEnterの意味を変える（ChatGPTレビューで確定）

```
検索欄フォーカス中: Enter → 次へ／Shift+Enter → 前へ
置換欄フォーカス中: Enter → 置換して次へ／Shift+Enter → 置換して前へ
Tabは通常のフォーカス移動のまま変更しない（「次の入力欄へ移る」という
強い慣習を壊さないため）。
F3/Shift+F3はフォーカス位置に関わらず動作する独立ショートカットとして追加
（Windows標準の検索UIとの一貫性）。ヒット0件の場合はブラウザ標準の
F3に譲る（検索バーが開いているというだけで奪う理由がないため）。
```

### [判断] Search Highlightは専用色を持たず、Selectionの濃淡で表現する（3回のイテレーションの末に確定）

```
経緯（実機フィードバックの反復）:
  ラウンド1: azure系（青系）を採用
    → 実機で「シルバー/ブルーテーマでSelection（緑）と青緑が混ざって
      見分けづらい」との指摘。
  ラウンド2: 色相をさらに青方向へ調整（Cornflower Blue寄り）
    → それでも改善せず、同じ指摘が継続。
  ラウンド3: マゼンタ／ピンク系へ変更（既存の緑・amber・紫・赤・青の
    いずれとも被らない色相として）
    → 視認性は改善したが、実際の画面では「小節フォーカス（青）・検索中の
      現在地（緑）・検索候補（マゼンタ）」の3色が同時に競合し、
      視覚的ノイズが大きいとの指摘。
  最終: 新しい色を増やす方針自体を撤回。Search候補は「Selectionの薄い版」
    として、--color-selection-rgbを流用（背景alpha .16・枠1px）で表現する
    ことに決定。検索でアクティブ化されたコードはselectionにも入るため、
    自動的に濃い緑・太枠（既存のSelection Highlightそのまま）が重なり、
    「濃い＝今ここ」「薄い＝他の候補」という強弱だけの階層になる。

この一連の試行錯誤から、Search固有ではなくDecorator Layer全体に適用される
設計原則（[DECORATOR VISUAL LANGUAGE PRINCIPLE]）を確立した。
詳細は「7. Architecture Impact」を参照。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 色調整の反復から得られた教訓

```
「専用色を1つ増やす」という解決策は、一見シンプルに見えて、実際には
画面全体の色数を増やし続けてしまう（Sprint2-1のEditPoint色調整でも
似た反復があったが、今回はさらに一歩進んで「そもそも増やさない」という
方針転換にまで至った）。色を変える前に「本当に別の色が必要か、
既存の色の濃淡で表現できないか」を疑う視点が今後のDecorator追加でも
重要になる。
```

### 検索結果クリック時にBoundary Handleも同時に表示される件（バグではない）

```
検索の「次へ/前へ」は既存のselection機構にそのまま乗る設計にしたため、
単一選択時に常に表示されるBoundary Handle（amber縦線）も、検索結果を
選んだ際に自動的に表示される。これは「検索で選んだコードも通常のクリック
選択と同じく編集可能である」という設計上は一貫した挙動であり、バグではない。
ただし実機では「青（Playback）・amber（Boundary）」が同時に見えて
やや賑やかとの指摘があった（詳細は次項）。
```

### Decorator同時表示に関する今後の検討方向（実装は見送り）

```
ChatGPTレビューでの結論:
  ① 検索モード中のBoundary Handle非表示/減光
     → 「検索で選択されたコードも実際に編集できる」という一貫性がある
       ため、隠すなら明確なUX上の理由が必要。現時点では「賑やか」以上の
       理由がなく、優先度は高くないと判断。
  ② 再生停止中のPlayhead減光
     → Playheadは「最後にここまで再生した」という重要な情報でもあるため、
       半透明化・非表示は音楽編集時の使い勝手に影響しうる。実際の利用で
       「邪魔だと感じる頻度」を観察してから判断すべきとした。
  → いずれも「改善アイデア」の段階に留め、Phase80では実装しない。
```

---

## 7. Architecture Impact（このフェーズでアーキテクチャ的に確立したこと）

```
[DECORATOR VISUAL LANGUAGE PRINCIPLE]（Phase79〜80を通して確立）

これはSearch Engine固有の知見ではなく、Decorator Layer全体
（Selection Highlight・Boundary Handle・EditPoint Marker・Search Highlight・
Playback）に適用される設計原則である。将来Bookmark・Warning表示等、
新しいDecoratorを追加する人はこの原則を先に確認すること。

原則:
  ・Decoratorは新しい機能ごとに新しい色を追加しない
  ・まず既存の視覚言語（色相・濃淡・線幅・形状・表示条件）で区別できないか
    を検討する
  ・同一概念（編集対象の階層等）は同系色で階層化し、異なる概念
    （Playback=時間軸／EditPoint=挿入位置等）のみ別色を使う
  ・視認性に課題がある場合、新しい色を追加する前に表示条件・重なり・
    形状の見直しを優先する

この原則に至った経緯（3回の色調整イテレーション）は「6. Findings」を参照。

現在のDecorator視覚言語一覧（Phase80時点）:
| 要素 | 色 | 形 | 意味 |
|---|---|---|---|
| Playback | 青 | 面（進行） | 再生状態 |
| Selection | 緑（濃） | 面 | 編集対象 |
| Search候補 | 緑（薄・同一トークン流用） | 面（薄い） | 候補 |
| Boundary Handle | Amber | 左線 | 動かせる境界 |
| EditPoint | 紫 | 縦カーソル（点滅） | 挿入位置 |

青（Playback＝時間軸）だけは他の4つ（Analysis Editorの編集状態）とは
完全に別の世界であるため、消せない・薄めるにも慎重な検討が必要
（「6. Findings」の②参照）。

→ Phase81のドキュメント棚卸しで、この原則をarchitecture.mdの正式な
セクションとして昇格させること（§12 Analysis Editor Architecture配下、
または独立の§として新設）。
```

---

## 8. Remaining Issues（残課題）

```
・通常のChart Modeクリック全体への「選択+シーク」の一般化（Sprint2-2
  次フェーズ候補②の一部が未実装のまま持ち越し）
  状態: 未着手。検索結果クリックのみ実装済み。
  設計方針（Sprint2-2 handoverで既に合意済み）:
    ・デフォルトON
    ・通常クリックのみシークする。Shift+クリック（範囲選択）・editPoint選択は
      シークしない
  次のアクション: Phase81以降で改めて着手判断。

・[Known Limitation（意図的な簡略化）] replaceCurrentAndAdvance()のbackward方向
  状態: バグではなく、意図的に採用した仕様上の制約（未完成ではない）。
  内容: 置換によりコード名がqueryと一致しなくなると、matches配列は1つ前に
  詰まる。forward方向（Enter）はこの詰まりにより自然に正しく動作するが、
  backward方向（Shift+Enter）で置換した場合、詰まった分だけ1件飛ばす
  可能性がある。
  判断根拠: 利用頻度（個人用ツール）と、削除前のindex集合を保持する
  厳密な補正を実装するコストを比較し、現段階では仕様として許容した。
  → 将来Claude・別のAIがこのコードを読んだ際に「バグだから直す」と
  誤解しないよう、ここに明記する。実害が出るようなら再検討。

・Boundary Handle / Playheadの表示条件見直し
  状態: アイデア段階（「6. Findings」参照）。優先度は高くない。

・置換欄の入力検証なし
  状態: 意図的な簡略化（chordEntry.jsが未アップロードだったため）。
  次のアクション: 必要であればchordEntry.js側にisChordLikeInput等の
  exportを追加し、置換欄にも同じ検証をかける。

・Capo-aware Editing（表示コードでの検索・編集）
  状態: 設計議論のみ。Search Engine完了後の独立フェーズとして
  実施予定（詳細は次項。フェーズ番号はドキュメント棚卸し（Phase81）の
  進行状況次第で変わるため、ここでは固定しない）。
```

---

## 9. Next Phase（次フェーズ開始位置）

```
Phase81: ドキュメント棚卸し + UI仕上げ
  ・README / architecture.md / current-issues.md / phase-status.md の一括更新
  ・[DECORATOR VISUAL LANGUAGE PRINCIPLE]をarchitecture.mdへ正式反映
  ・Search Engine関連セクションの新設（§12 Analysis Editor Architectureへの統合、
    または新設セクションとして§14等）
  ・必要なら軽微なUI調整

Capo-aware Editing（表示コードでの編集）
  → ドキュメント棚卸し（Phase81）完了後の独立フェーズ候補
  目的:
    現在は「画面にはCapo変換後のコード（例: D）が見えているのに、
    編集入力はbuffer側の実音（例: C）で行う必要がある」という認知負荷が
    ある。表示コードのままで編集・検索できるようにする。

  設計上の論点（着手時に検討）:
    ・表示コード → 逆transpose → buffer保存、という変換経路の設計
    ・検索・置換の対象を「buffer（実音）」のままにするか、
      「表示コード」に変更するか（オプション化するかも含めて再設計）
    ・Undo/Redoへの影響確認
    ・Search Engineが「buffer正本・pure functionでの変換」という設計を
      既に確立しているため、その経験（Engine/UI分離・Derived Cacheの
      考え方）がそのまま参考になる見込み

  位置づけ: 単なるUI改善ではなく、Analysis Editorの編集モデルの完成に
  関わる機能。Search Engineより設計インパクトが大きいため、独立したフェーズ
  として着手前に仕様確認フェーズを必ず挟むこと。

候補（優先順位未定・Phase81以降のどこかで検討）:
  ・Boundary Handle表示条件の見直し（検索モード中の減光/非表示）
  ・Playbackの淡色化（再生停止中）
  ・通常クリック全体への「選択+シーク」一般化（Sprint2-2候補②の残り）
```

---

## 10. current-issues.md 更新（該当があれば）

```
今回closeした項目:
  ・Search Engine（検索基盤）→ 完了（Phase80）

今回新規に積み残した項目:
  ・通常のChart Modeクリック全体への「選択+シーク」一般化
    （Sprint2-2候補②の残り。検索結果クリック限定分のみPhase80で実装済み）
  ・[Known Limitation] replaceCurrentAndAdvance()のbackward方向の簡略化
    （バグではなく意図的な仕様。詳細は「8. Remaining Issues」参照）
  ・置換欄の入力検証なし（chordEntry.js未連携。必要になれば対応）
  ・Boundary Handle / Playheadの表示条件見直し（アイデア段階・優先度低）
  ・Capo-aware Editing → Search Engine完了後の独立フェーズ候補として記録
    （フェーズ番号は未確定）
```

---

## 11. Files Changed（変更ファイル一覧）

```
js/app.js
  ・analysisEditor.search state新設（open/query/replaceText/matches/
    activeIndex/focusRequested）
  ・resetAnalysisEditor() / beginAnalysisEdit() にsearchリセット追加
  ・searchChords() / openSearchBar() / closeSearchBar() /
    _activateSearchMatch() / searchGoToNext() / searchGoToPrev() /
    replaceCurrentMatch() / replaceCurrentAndAdvance() / replaceAllMatches()
    新設
  ・_refreshEditorView() にsearch matches再計算・クランプを追加
  ・renderAnalysisEditorPanel() に検索バーUI（🔍トグル・検索欄・置換欄・
    件数・◀▶・置換・全置換・✕）を追加。フォーカス復元ロジック
    （searchWasFocused）を実装
  ・グローバルキーボードハンドラにCtrl+F・Escape分岐・F3/Shift+F3を追加
  ・window.__analysisEditorDebug にSearch関連関数を追加
  ・chartmode.jsからのimportにsetSearchMatchesを追加

js/chartmode.js
  ・chartState.searchMatchIds 新設
  ・setSearchMatches() 新設（[DECORATOR ADDITION RULE]準拠）
  ・_renderChartGrid() のSelection Highlightブロックを拡張し、
    Search Highlightを統合（prev/next判定を共有）

css/components.css
  ・.chart-slot--search-match(-start/-end) 新設
    → 最終的に--color-selection-rgbを薄いalpha・細枠で流用する形に変更
    （専用色トークンは持たない）

css/theme.css
  ・--color-search系トークンを新設 → 3回の色調整を経て最終的に削除
    （3テーマとも）
```

---

## 12. Micro Log

- ChatGPTレビューで「searchはanalysisEditor配下に置く」「query≠Derived
  Cache」「Engine/UI分離」「Replace AllのUndo1回」の4点を確定してから実装開始
- 実装前にchordEntry.jsが未アップロードであることに気づき、置換欄の検証は
  「検索欄と同じ無検証の自由入力」に統一する判断をした
- 実機フィードバックで「置換をモーダルで毎回入力するのは大変」との指摘を受け、
  常設インライン欄へ設計変更（ChatGPTレビューでも支持）
- キー割り当てについて「Tabを検索ナビゲーションにする」案が出たが、
  ChatGPTレビューで「Tabの強い慣習を壊す」との理由で不採用、
  フォーカス位置依存のEnter/Shift+EnterとF3の組み合わせに決着
- Search Highlightの色は3回のイテレーション（azure→マゼンタ→
  Selectionの濃淡流用）を経た。最終的に「新しい色を増やさない」という
  方針そのものを見直すきっかけになり、[DECORATOR VISUAL LANGUAGE
  PRINCIPLE]という設計原則の発見につながった
- 検索結果クリック時にBoundary Handleも同時表示される点について、
  「バグではなく設計上一貫した挙動」であることを確認。表示条件の
  見直しは実装せず、アイデア段階として記録に留めた
- Capo-aware Editing（表示コードでの編集）の要望が出て、設計インパクトの
  大きさから独立フェーズとして切り出す判断をした（フェーズ番号は未確定）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
