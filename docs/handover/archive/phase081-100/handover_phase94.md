# 引き継ぎ: Phase94完了 — Playback-aware Editing UX + Header Visual Language整理

## 作業状態
- ブランチ: phase94-playback-aware-editing（想定。実ブランチ名は運用に合わせて読み替え）
- 直前作業: Phase93完了（Boundary Handle Drag Editing）

---

## 1. Purpose（目的）

「演奏モードでコードの長さを視覚化したい」という雑談から出発し、ChatGPTとの
議論の末に3機能へ収束したテーマ「Playback-aware Editing UX」を実装する。
加えて、実装過程の実機フィードバックから派生したChart Modeヘッダーの
視覚言語整理（独立コミット）も本フェーズ内で行った。

なお、この議論はさらに派生して「Section Data Layer」という長期構想の
議論にまで発展したが、これは本フェーズのスコープ外とし、別文書
（`section-model.md`）へ切り出した（§7参照）。

---

## 2. Scope（今回やったこと）

```
Phase94-1: B4 Scroll Recovery
  手動スクロール後、一定時間（設定可能・デフォルト5秒）は
  演奏モードの自動追従を抑止する。ただし再生中の行が画面内に
  戻ってくれば、猶予時間を待たずに即座に自動追従を再開する。

Phase94-2: C1 Selection Measure Span
  Analysis Editorで選択中の範囲が何小節分（または何拍分）かを
  フッターに表示する。

独立コミット: Header Visual Language整理
  Chart Modeヘッダーの「編集中」表示が「小節補正中」バッジと
  色（Amber）が衝突していた問題を、視覚言語の整理によって解消。
  「編集ワークフロー系」（編集中・編集ボタン・保存して閉じる）は
  Green、「編集補助系」（小節補正・Boundary Handle等）はAmber、
  という役割分担を新たに確立した。
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・B1（現在行を常に中央維持）/ B3（小節境界での滑らかな移動）
  → ChatGPTレビューにより、Boundary Drag（Phase93）直後の実機感覚が
    固まってからの方が安全と判断し見送り。

・C3（duration数値入力）
  → 既存のドラッグ・ボタン操作で概ね直感的に足りているため優先度を下げた。

・A（クリック挙動統一の設計セッション）
  → 同上の理由（Phase93直後の実測を優先）で見送り。

・Section Data Layer（曲構造編集）構想全体
  → 議論の規模がPhase単位を大きく超えるため、実装はおろか設計フェーズにも
    今回は入らないと決定。`section-model.md`として別文書に切り出し、
    「育てていく設計メモ」として今後少しずつ詰める運用にした。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| B4ロジック本体 | `_manualScrollSuspendUntil` / `_isFocusedLineVisible()` / `_getAutoScrollGraceMs()` を新設。`scrollToLine()`の実スクロール直前にガードを追加。`setupPerformSwipe()`のclone済み`fresh`要素へscrollリスナーを相乗り追加 | perform.js |
| B4設定配線 | `perform-scroll-grace`（select要素）の初期値読み込み・change時のlocalStorage書き込みを追加（既存要素が無くても起動エラーにならないよう`if`ガード付き） | app.js |
| B4設定UI | `perform-font-scale`の並びに`<select id="perform-scroll-grace">`（2/3/5/8秒）を追加 | index.html |
| C1計算ロジック | `_computeSelectionMeasureSpan()`を新設。selection.chordIds→buffer検索→first.start〜last.endの時間差をbpm・timeSignature.numeratorから小節数へ変換。0.25小節（1拍）単位で丸める | app.js |
| C1表示配線 | `renderAnalysisEditorPanel()`のsingle/multi分岐に`aep-chord-span`表示を追加（フッター表示。ヘッダー表示案は実機フィードバックにより撤回・§6参照） | app.js |
| ヘッダー編集中表示 | テンプレートをアイコンspanとテキストへ分離 | chartmode.js |
| ヘッダー編集中スタイル | `.chart-header-edit-badge`をAmberバッジ形状からGreenの文字色＋太字（バッジ形状なし）へ変更 | chart.css |
| 編集ボタンactive色 | `.chart-edit-btn:hover` / `.chart-edit-btn--active`をAmber系からGreen系へ変更（`.aep-btn--save`の配色パターンを流用） | chart.css |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] B4: 手動スクロール検知は「visible判定」による即時復帰と、タイマーによる猶予復帰の2経路を持つ

```
結論:
  _manualScrollSuspendUntilに「猶予終了時刻」を持たせ、scrollToLine()の
  実行直前でチェックする。ユーザーが自分で再生行を視界に戻した場合は
  即座に0へリセットし、猶予を待たない。

理由:
  「戻ってくるまで待たせ続ける」のはUXとして不自然（ChatGPT・たかっち
  双方の合意）。一方タイマーなしで即時判定のみだと、離れたまま待つ
  ケースで自動追従が永久に止まったままになる。両方の経路を持たせる
  ことで両立させた。

確認事項:
  実機ログ（[TEMP DEBUG][Phase94]、実装後削除済み）により、
  タイマー経由の復帰・即時復帰の両方が意図通り動作することを
  タイムスタンプ差分で確認済み（§6参照）。
```

### [判断] C1: chartmode.js経由のヘッダー表示ではなく、app.js所有のフッター表示に変更

```
結論:
  当初はChart Modeヘッダー（chartmode.js所有）に表示する設計で
  実装したが、実機フィードバックにより撤回。最終的にはapp.js所有の
  Analysis Editor Footer（renderAnalysisEditorPanel）内に表示する
  形へ作り直した。

理由:
  実際に画面で見比べたところ、フッターの選択サマリー欄
  （「Dコード 4.435秒〜5.828秒」等）の方が視認性が高いという
  実機フィードバックを得た。またフッター側に実装する方が、
  chartState経由のProjection配線（setSelectionMeasureSpan等）が
  不要になり、実装がapp.js側で完結してシンプルになるという
  副次的な利点もあった。

確認事項:
  chartmode.jsは最終的に無変更（C1に関しては）。一度追加した
  chartState.selectionMeasureSpan / setSelectionMeasureSpan /
  ヘッダー描画変更はすべて撤回済み。
```

### [判断] ヘッダー「編集中」表示を、Amber系ではなくGreen系に変更

```
結論:
  「編集中」（編集ワークフロー全体の状態）と「小節補正中」（編集補助・
  一時的なサブ状態）は概念として別カテゴリであり、同じAmberを使うこと
  自体が不自然、という整理に至った。「編集中」は既存の「保存して閉じる」
  ボタン（Green）が表す編集ワークフロー系に属すると位置づけ、Greenへ
  統一した。編集ボタン（`.chart-edit-btn--active`）のactive色も
  同様にGreenへ変更した。

理由:
  複数回の試行錯誤（塗りつぶし→フラット→バッジ復活→Green）を経て、
  「色を工夫する」より「意味のカテゴリを分ける」方が本質的な解決だと
  分かった（ChatGPT指摘）。これにより以下の役割分担が確立した:
    Green: 編集ワークフロー系（編集中・編集ボタン・保存して閉じる）
    Amber: 編集補助系（小節補正・Boundary Handle等）
    Selection Color: 選択状態（既存）
    Blue: Playback（既存）

  この役割分担は単なる今回限りのUI調整ではなく、architecture.md または
  ui-rules.mdへ「Visual Language Rule（色の意味）」として正式に昇格させる
  候補である（ChatGPT指摘）。5フェーズ棚卸しのタイミングで昇格を検討すること。

確認事項:
  silverテーマで`--color-green-rgb`が未定義という既知の技術的負債
  （current-issues.md記載）があるため、rgba()によるalpha合成を
  用いない設計にした（`.aep-btn--save`のhoverと同じ「塗りつぶし＋
  surface-base文字」パターンを踏襲）。3テーマ（base/blue/silver）で
  実機確認済み。
```

### [判断] Section Data Layer構想は、current-issues.mdではなく専用ファイルへ切り出す

```
結論:
  「演奏モード改善」の雑談から派生した「曲構造編集（Section）」構想は、
  current-issues.mdへ直接書き込まず、`section-model.md`という
  独立した「育てていく設計メモ」として新規作成した。current-issues.md
  側には、ロードマップ「Chart Modeと通常モードのシステム統合」の近くに
  参照を一言添えるだけに留める。

理由:
  この構想はPhase単位を大きく超える規模（責務定義・データモデル・
  正本問題・4段階のロードマップ）であり、current-issues.mdの
  ロードマップ欄にそのまま書くと肥大化する。README.mdの運用ルール
  にある「5フェーズごとの棚卸し」の対象にもなじまない性質
  （随時育てていくメモ）のため、別ファイルへの切り出しが適切と判断した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### B4の「押し戻し」の真因は、想定していたスクロールリスナーではなくtimeupdateだった

```
実コード確認前は「手動スクロールを検知するリスナーが誤発火している」
という仮説だったが、実際には手動スクロール検知リスナー自体が
どこにも存在せず、`aEl`の`timeupdate`イベントで呼ばれる
`updatePerformFocus()`が、再生行（focusIdx）が切り替わるたびに
問答無用で`scrollToLine()`を呼んでいたことが真因だった。
「スクロールした直後」ではなく「次の行に進んだ瞬間」に引き戻される、
という正確な理解に至ったことで、ガードの実装位置を正しく決定できた。
```

### B4の動作確認は、ログのタイムスタンプ差分でしか確定できなかった

```
「猶予時間経過での復帰」と「即時復帰」は、体感だけでは区別が
つかなかった（本人談「いまいち分からない」）。一時ログ
（[TEMP DEBUG][Phase94]、確認後削除済み）を追加し、実際のログの
タイムスタンプを比較することで、以下を数値的に確認した:
  ・タイマー経由の復帰は、最後の手動スクロールから約5秒後に発生
  ・即時復帰は、猶予期限まで約5秒残っている状態でも、
    再生行が視界に戻った直後に発生
Phase91の「実測でしか確定できなかった」パターンと同種の教訓。
```

### Chart Modeヘッダーの「編集中」バッジは、そもそもスタイル定義が存在しなかった

```
たかっちが最初に「編集中の部分を明るくしたい」と依頼した時点で、
`.chart-header-edit-badge`にはCSSルールが一切なく、ヘッダーの
地色をそのまま継承していただけだった（目立たなかった直接の原因）。
一方`.chart-header-repair-badge`（小節補正中）には既にAmberの
バッジスタイルが定義されていたため、両者を同じ見た目に揃えようと
した結果、今回の「Amber同士の衝突」問題が生じた。
```

### ヘッダー配色の試行錯誤（4段階）

```
① Amber塗りつぶし・濃色文字（最初の実装）
   → 「小節補正中」と両方重く見えると指摘
② Amberアイコンのみ・フラットテキスト（バッジ解除）
   → 軽くなりすぎて「編集中である感」が消えたと指摘
③ Amber・枠線＋太字（バッジ復活・強度で差別化）
   → 依然として「小節補正中」と色が衝突していると指摘
④ Green（編集ワークフロー系）へ色相そのものを変更（最終案）
   → 3テーマで視認性・役割分担ともに解決を確認
このジグザグ自体が「色の強弱で解決しようとしていたが、
実際は概念（カテゴリ）が違う2つを同じ色で表現しようとしていたこと」
が根本原因だったことを示している（§5参照）。

実機比較: base / blue / silver 全テーマで最終案（④）の視認性を
確認済み（スクリーンショットによる実機フィードバックベース）。
```

---

## 7. Remaining Issues（残課題）

```
・Section Data Layer構想（曲構造編集・長期ロードマップ候補）
  状態: 設計メモとして起票済み（section-model.md）・実装未着手
  内容: 「Verse/Chorus等のセクション単位で編集したい」という構想。
  Sectionはコード境界への参照（startChordId/endChordId）として
  持たせる方向で暫定合意しているが、以下が未解決:
    ・Sectionの正本をproject.linesとanalysisEditor.bufferの
      どちらにするか（既存ロードマップ「Chart Modeと通常モードの
      システム統合」と同一の論点）
    ・境界コードの増減時のルール（内部への挿入・境界コード自体の削除）
  詳細は section-model.md 参照。次に開く時のTODOも同ファイル末尾に記載済み。

・（Phase93より継続）pointercancel経路の未検証
  Boundary Handle Dragの`pointercancel`経路は実機で未踏のまま
  （handover_phase93.md記載の内容を継続保持）。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
次フェーズの内容は未確定。候補は2系統:

系統1: 見送ったB1/B3/A（クリック挙動統一）
  Phase93〜94の実機感覚が十分溜まった時点で着手を検討。

系統2: Section Data Layer の「S. Section Specification」フェーズ
  section-model.md §9の「次にこのメモを開く時にやること」を
  先に済ませてから、独立した設計フェーズとして着手するかを判断する。

優先順位は次回セッション開始時にたかっちと相談して決める。
```

---

## 9. Files Changed（変更ファイル一覧）

```
perform.js
  ・_manualScrollSuspendUntil / _isFocusedLineVisible() /
    _getAutoScrollGraceMs() 新設
  ・scrollToLine() に猶予チェックガードを追加
  ・setupPerformSwipe() のclone済み要素へscrollリスナーを追加
  ・理由: B4（手動スクロール後の自動追従復帰タイミング調整）

app.js
  ・perform-scroll-grace の設定配線（localStorage読み書き）を追加
  ・理由: B4の設定UI（プルダウン）バックエンド
  ・_computeSelectionMeasureSpan() 新設
  ・renderAnalysisEditorPanel() のsingle/multi分岐にspan表示を追加
  ・理由: C1（選択範囲の小節数表示）。当初chartmode.js経由の
    ヘッダー表示だったが、フッター表示へ作り直したため
    chartmode.js側の変更はすべて撤回されている

index.html
  ・<select id="perform-scroll-grace"> を.perform-options内に追加
  ・理由: B4の設定UI本体

chartmode.js
  ・編集中バッジのテンプレートをアイコンspanとテキストへ分離
  ・理由: ヘッダー視覚言語整理（アイコンとテキストの色を分けて
    制御できるようにするため）
  ・触っていない箇所: C1関連の変更は全て撤回済み（chartState/
    setSelectionMeasureSpan等はchartmode.jsには存在しない）

chart.css
  ・.chart-header-edit-badge をAmberバッジからGreenの文字色＋
    太字へ変更（バッジ形状の背景・枠は撤去）
  ・.chart-edit-btn:hover / .chart-edit-btn--active をAmberから
    Greenへ変更（.aep-btn--saveの配色パターンを流用）
  ・理由: ヘッダー視覚言語整理（編集ワークフロー系=Green、
    編集補助系=Amberの役割分担確立）

section-model.md（新規ファイル）
  ・Section Data Layer構想の設計メモ
  ・理由: 議論の規模がcurrent-issues.mdの直接編集になじまないため、
    独立した「育てていく設計メモ」として切り出し
```

---

## 10. Micro Log

- B4実装前、実コード（app.js/perform.js/chartmode.js）を確認した結果、
  ChatGPTレビューが前提としていた「二重rAFによるフラグ解除」ではなく、
  既存の`_isScrolling`＋600ms setTimeoutパターンをそのまま流用する
  方針に変更した（実コードの既存パターンを尊重する判断）
- B4の動作確認は体感では区別できず、一時ログ追加→実測→タイムスタンプ
  比較→削除、という手順を踏んだ（Phase91と同じ調査パターン）
- C1は当初chartmode.js側にchartState.selectionMeasureSpanを追加する
  設計で実装・検証まで完了させたが、実機スクリーンショットによる
  フィードバックで「フッターの方が見やすい」と判明し、chartmode.js側の
  変更を完全に巻き戻してapp.js側（フッター）のみの実装へ作り直した
  （diffの後戻り作業が発生したフェーズ）
- ヘッダー「編集中」の配色は、Amber塗りつぶし→フラット→バッジ復活
  （太字）→Green、と4段階の試行錯誤を経た。3段階目まではすべて
  「Amberという色相を維持したまま強弱で解決しよう」という前提が
  誤りだったことが、4段階目（Green化）で判明した
- silverテーマの`--color-green-rgb`未定義という既知の技術的負債
  （current-issues.md記載）を踏まえ、rgba合成に依存しない配色設計
  （塗りつぶし＋surface-base文字）を採用し、この負債の影響範囲を
  広げないよう配慮した
- Section Data Layer構想は、たかっちとChatGPTの複数往復の議論
  （responsibility定義・参照方式・正本問題）を経て、「一度に全部
  決めない」という判断のもとsection-model.mdへ切り出した

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - Section Data Layer構想（`section-model.md`参照）。
    **current-issues.md側の対応作業**として、ロードマップ
    「Chart Modeと通常モードのシステム統合」の項目の近くに、
    以下の一言を追記すること（このチャットからは直接編集できない
    ため、次回current-issues.mdを開いた際に手動で追記する）:

    ```
    #### Section Data Layer（曲構造編集・長期構想）
    内容: Verse/Chorus等のセクション単位で編集できるようにする構想。
    詳細な設計メモは `section-model.md` を参照。「Chart Modeと通常
    モードのシステム統合」と正本問題（project.lines vs
    analysisEditor.buffer）を共有するため、着手判断はセットで行うこと。
    ```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
