# 引き継ぎ: Phase78完了 — Footer UI刷新 + クリック/位置計算バグ修正

## 作業状態
- 直前作業: Phase77完了（Position Editingの導入）
- ブランチ: phase78-ui-polish（Sprint1・Phase78.1・Phase78.2を含む）

---

## 1. Purpose（目的）

Analysis Editorのフッター（編集パネル）を、Phase74〜77で機能追加を重ねた結果
「ボタンを横に継ぎ足した」状態から、`selection`から導出される`deriveEditorMode()`に
基づく4 Groups構成へ整理する。

作業を進める過程で、実機フィードバックにより「UIの好みの問題」ではなく
「クリック位置の判定・計算そのものが間違っている」バグが2件見つかり、
Hotfixとして本フェーズ内で修正した。

---

## 2. Scope（今回やったこと）

```
Sprint1: Footer UI刷新
  ・deriveEditorMode()新設（selectionからのUI Projection）
  ・4 Groups構成（Selection / Navigation / Primary Action / Workspace）
  ・Action Registry（getGroup3Actions）によるボタン群のデータ駆動化
  ・editPoint専用パネル（早期return）を廃止し、4 Groups構造に統合
  ・Capo表示バグ修正（Selection Header / EditPoint Header の2箇所）
  ・--color-amber-rgb のテーマ非依存バグ修正（silver/blue追加）
  ・アクセシビリティ対応（title / aria-label をアイコンボタン全てに付与）
  ・その他▼メニュー新設（低頻度コマンドの格納・将来の拡張ポイント）
  ・選択解除ボタン新設（editPoint/選択どちらも同じ操作として統一）

実機フィードバックによる追加調整（Sprint1範囲内）
  ・全体シフトのボタンを個別移動/範囲シフトより大きく・amber強調にして区別
  ・Primary ActionとWorkspaceを1行に統合（4行→2行に圧縮）
  ・「編集終了」「保存して閉じる」を他ボタンと視覚的に差別化

Phase78.1 Hotfix: 継続セルでの誤editPoint化を修正
  ・chartState._lastClickedSlot（UI Interaction Cache）を新設
  ・「同じchordId」だけでなく「同じslotIndex/measureIndex」への
    2回目クリックである場合のみeditPointへ進むよう変更

Phase78.2 Hotfix: 同一小節内での位置計算バグを修正
  ・slotIndexの算出方法をDOM祖先(closest)からクリック座標ベースへ変更
  ・projectionEmpty slotの除外（既存invariant）は維持
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Decorator Layer統合（境界ハンドル・editPointマーカーの統一描画）
  → Sprint2として計画していたが、Phase79へ統合して再設計する
    （下記「8. Next Phase」参照）

・Paste Insert
  → Phase79へ

・全体移動・個別移動・範囲移動のUI統合（ボタンを1種類にする案）
  → 議論はしたが、Sprint1で合意した設計（3種類を別ボタンとして保つ）を
    実装途中で覆さないため、今回は見送りPhase79の検討事項とした

・コードパレットのCapo表示統一（Add Chord時、パレットだけ実音表示のまま）
  → 発見された重要な設計課題だが、chordEntry.js/findChord()の
    lookup方式に関わる大きめの変更のため、Phase79へ

・「1クリック＝選択、ダブルクリック＝editPoint」への操作体系変更
  → Phase78.1は既存の二段階クリックモデルを維持したままの最小修正。
    操作体系自体を変える場合は_lastClickedSlotロジックごと
    置き換える前提でPhase79にて検討する
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| `deriveEditorMode(selection)` 新設 | selectionから'idle'/'single'/'multi'/'edit-point'を導出する純粋関数。UI Projectionであり、business logicの分岐条件に使わないことをコメントで明記 | app.js |
| `getGroup3Actions(mode, ctx)` 新設 | Action Registry。Primary Actionのボタン群をmode別に宣言的に定義。将来のコマンド追加はここへの追加のみで済む | app.js |
| `renderAnalysisEditorPanel()` 全面書き換え | editPoint専用の早期returnを廃止し、4 Groups構造（Selection+Navigation統合行／Primary+Workspace統合行）へ | app.js |
| `clearCurrentSelection()` 新設 | 「選択解除」の唯一の窓口。editPoint/通常選択の違いをユーザーに見せない | app.js |
| Capo表示バグ修正 | `chord.chord`/`owner.chord`を`transposeChord(●, -getCapo())`経由に変更（2箇所） | app.js |
| `--color-amber-rgb` 追加 | silver（168,100,0）・blue（160,96,0）を追加。dark基準値のまま固定されていた | theme.css |
| `.aep-group--primary` 等 新設 | 4 Groups・その他▼メニュー・選択解除ボタン・シフトボタンのキャプション/サイズ差分のCSS | components.css |
| `chartState._lastClickedSlot` 新設 | [UI Interaction Cache]。直前クリックのchordId/slotIndex/measureIndexを記録し、「同じセルへの2回目クリックか」を判定する | chartmode.js |
| クリックハンドラのslotIndex算出方式変更 | `closest('.chart-slot[data-visual-slot-index]')`によるDOM祖先ベースから、クリック座標（`e.clientX`と`measureEl`の`getBoundingClientRect()`）ベースの計算へ変更 | chartmode.js |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Group3を「対象固有操作」ではなく「Primary Action Group」と呼ぶ

```
結論: Add Here / 削除 / 編集 / 結合など、そのmodeで「今一番やってほしい操作」は
すべてPrimary Actionとして統一的に扱う。Group4は「Secondary Action」ではなく
「Workspace」と呼ぶ（Undo/Redo/保存/編集終了は編集操作ではなくセッション制御のため）。

理由: ChatGPTレビューにより、優先度の違いではなく操作のカテゴリの違いとして
命名した方が今後の判断基準になりやすいと判断した。
```

### [判断] editPointをFooterの別モードとして見せない

```
結論: editPoint専用パネル（早期return）を廃止し、通常の4 Groups構造の中で
Group1（選択情報）・Group3（Primary Action）の中身だけが変わる形に統合した。

理由: 「編集対象がコードか位置かはユーザーには関係ない実装の都合」という
方針（設計原則2: UIは内部実装ではなくユーザーの意図を表現する）に基づく。
これにより、Group4（Undo/Redo/保存/編集終了）がeditPoint中も常に使えるように
なった（従来はeditPoint中にこれらの操作ができなかった）。
```

### [判断] 既存Semantic tokenを転用し、新規token追加を最小限にする

```
結論: Primary Action Groupの強調にはsurface-selected/border-selected
（既存のamber系semantic token）を転用し、保存ボタンにはcolor-green
（既存token）を転用した。新規に追加したtokenは--color-amber-rgb
（silver/blue）のみ（これは既存のcolor-amberに対応するRGB値の欠落を
埋めるバグ修正であり、新規の意味付けではない）。

理由: ui-rules.md §7の「Component alias許容条件」に従い、
既存Semantic層で表現できる場合は新規token追加を避ける方針を優先した。
```

### [判断] Phase78.1は既存の二段階クリックモデルを維持したまま最小修正する

```
[Bug]
継続セル（同一chordIdが複数小節にまたがる）で、選択中のコードの
別の位置をクリックしただけなのに「同じコードへの2回目のクリック」と
誤判定され、意図せずeditPointへ入ってしまっていた
（判定基準がchordIdのみで、slotIndex/measureIndexを見ていなかったため）。

[Fix]
「1クリック＝選択、2クリック目＝editPoint」という設計自体は変えず、
判定条件に「直前クリックと同じslotIndex/measureIndexであること」を追加した。
そのための状態はchartState._lastClickedSlotという
[UI Interaction Cache]（selectionのようなAuthorityではなく、
クリック判定専用のローカルキャッシュ）として新設した。

操作体系そのものの変更候補（ダブルクリック方式等）はPhase79で改めて検討する。
```

### [判断] slotIndexの算出をDOM祖先ベースから座標ベースへ変更する

```
[Bug]
DOM祖先ベース（closest('.chart-slot[...]')）では、onsetのコード名ラベル
(.chart-chord-name)がCSSで--duration-slots分だけposition:absoluteで
右へ視覚的に伸びる一方、DOM構造上は常にonset自身のslot（通常beatIndex=0）
の子要素のままであるため、視覚的に離れた拍をクリックしても
必ずonset自身のslotIndexが計算されてしまっていた（誤った位置計算）。

[Fix]
クリック位置(e.clientX)と小節要素の幅から直接slotIndexを計算する
座標ベースの方式に変更した。Phase60のクリックシーク機能で既に
座標ベースの計算が使われており、既存パターンと整合する形にした。

[PROJECTION INVARIANT維持] projectionEmpty slot（pickup小節の空白）は
クリック座標がその領域に入った場合、従来通りslotIndexをnullのまま扱い、
architecture.md §9.5の不可侵性を維持している。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### Phase78.1・78.2の発見経緯

```
実機テストで「コードを選んでから別のコードを選択すると
いきなりedit pointになることがある」という報告があり、
当初は「クリック判定バグ」と「同期ズレ（Phase75と同種）」の
どちらが原因か仮説が分かれていた。

chartmode.jsを確認した結果、chartState.selectedChordIdsと
analysisEditor.selectionの同期ズレではなく、
「継続セル（同一chordId）のどこをクリックしても
chordIdが同一になる」という、二段階クリックモデルの
判定基準（chordIdのみ）の甘さが原因と判明した（Phase78.1）。

続けて「同一小節内でのAdd Hereが『時間が足りません』に
なりやすい」という報告があり、これは表示（Decorator）の
問題かクリック位置計算の問題か切り分けが必要だった。

_applyEditPointMarker()自体のロジックは正しく見えたため、
onsetのコード名ラベル(.chart-chord-name)がposition:absoluteで
複数slot分の幅まで視覚的に伸びる一方、DOM構造上は
onset自身のslotの子要素のままであることを確認し、
slotIndexの算出方式（DOM祖先ベース）自体にバグがあると
特定した（Phase78.2）。

いずれも「UIの好みの問題」ではなく、クリック位置の
判定・計算そのものが間違っていたバグだったことが
確認できた。
```

### ホバーツールチップとの依存関係を確認した

```
.chart-chord-nameにpointer-events: noneを設定する案も検討したが、
Phase67のホバーツールチップがe.target.closest('.chart-chord-name[data-chord]')
に直接依存しているため、この案は採用しなかった（ツールチップが
壊れるため）。代わりにslotIndexの算出方式自体を変更する方針にした。
```

### 総括

```
今回の実機レビューにより、「UIの違和感」と認識していた問題の一部は、
実際にはクリック位置判定・slot計算の不具合であることが判明した。
Analysis Editorは今後も実機検証を前提に改善を進める。
```

---

## 7. Remaining Issues（残課題）

現時点で未解決なのは「範囲シフトが選択範囲外へ影響する疑い」のみ。

```
実機報告（再現詳細）:
  範囲シフト実行時、選択していない後続コード（E）の位置が
  同一小節内で1拍目→5拍目相当まで移動していた
  （測定小節をまたいだ移動ではなく、同一小節内での開始時刻の変化）。

状態: 原因未特定。
次のアクション: shiftSelectionRange()の実装を確認し、
  現行仕様（選択範囲内のコードのみが動き、範囲外は影響を受けない）
  通りに動作しているか、実装バグかを切り分ける。
  Phase79着手時に最優先で調査する（詳細はNext Phase参照）。
```

---

## 8. Next Phase（次フェーズ開始位置）

### Phase79候補: Editing Interaction Redesign

```
目的:
セルベース編集への移行を検討する。詳細なUI思想・優先順位はPhase79の
設計フェーズで確定する（本handoverでは検討事項の列挙に留める）。

検討事項:
  ・セル単位編集モデルへの転換
    （「時間が足りません」等、内部の時間ベースモデルがユーザーに
     露出する場面をなくす）
  ・Capo表示の完全統一
    （現状: チャート表示・選択情報・editPointラベルはフォーム音、
     コードパレット（Add Chord時）だけ実音のまま）
  ・Paste Insertの再設計（editPointへの挿入貼り付け。セル基準で）
  ・Add Here UXの改善（現状は均等2分割のみ。カーソル/クリック位置分割の検討）
  ・「Add Here」の名称変更
    （「追加」ではなく「挿入」の方が操作の実態（既存コードの間に
     割り込ませる）に合っている、という指摘あり）
  ・全体シフト／個別移動／範囲シフトのUI統合
    （「選択状態が対象を決める」という考え方に一本化できないか。
     deriveEditorMode()の思想を移動ボタンにも適用する案）
  ・範囲シフトが選択範囲外のコードにも影響している疑い（要調査・最優先候補）
    （実機報告: 範囲シフト実行時、選択していない後続コード（E）の
     位置が、同一小節内で1拍目→5拍目相当まで変化していた
     （小節をまたいだ移動ではなく同一小節内での開始時刻の変化）。
     shiftSelectionRange()の実装を確認し、現行仕様
     （選択範囲内のコードのみが動き、範囲外は影響を受けない。
     ぶつかったら「これ以上移動できません」とトースト表示）
     通りに動作しているか、実装バグかをまず切り分ける。
     「選択範囲外は動かさない」は現時点の想定であり、
     確定した仕様変更の指示ではない）
  ・Decorator Layer完成
    （境界ハンドル・editPointマーカーの統一描画。
     「コード選択はセル全体を背景色でハイライトする」
     「継続コードは継続範囲全体を1つの選択領域として表現する」等、
     Phase78のスクリーンショットレビューで確定した原則を実装に落とす）
  ・二段階クリックモデルの見直し
    （「1クリック＝選択、ダブルクリックまたは明示操作＝editPoint」
     への変更を候補として検討。Phase78.1は既存モデルを維持したままの
     最小修正だったため、モデル自体を作り直す場合はこの領域も含む）

優先順位:
  開発者自身が「毎日ストレスを受ける」箇所（Phase78.1/78.2で見つかった
  ような、放置コストの高いもの。特に上記「範囲シフトが選択範囲外に
  影響する疑い」は同種の可能性があるため優先度高）を優先し、
  その後UI設計としての磨き込み（移動UI統合・Decorator）に進む想定。
  詳細な順序はPhase79設計フェーズの冒頭で確定する。

進め方:
  Phase78と同様、実機で数日使ってから優先順位・詳細仕様を
  ChatGPTレビューを交えて確定してから実装に入る。
```

---

## 9. Files Changed（変更ファイル一覧）

```
js/app.js
  ・deriveEditorMode() / getGroup3Actions() / clearCurrentSelection() 新設
  ・renderAnalysisEditorPanel() 全面書き換え（4 Groups構成）
  ・Capo表示バグ修正（Selection Header / EditPoint Header）
  ・window.__analysisEditorDebug に editorMode getter を追加

css/theme.css
  ・--color-amber-rgb をsilver/blueテーマに追加

css/components.css
  ・.aep-group--primary / .aep-group--workspace / .aep-overflow* /
    .aep-btn--clear / .aep-btn--shift-lg / .aep-btn--save / .aep-btn--end
    等、Phase78で新設したクラスを追加

js/chartmode.js
  ・chartState._lastClickedSlot 新設（UI Interaction Cache）
  ・クリックハンドラのslotIndex算出方式を座標ベースへ変更（Phase78.2）
```

---

## 10. Micro Log

- UI改善を実機レビューで複数回実施（シフトボタンの見た目・行数圧縮・
  ボタン差別化）
- Hotfix2件（Phase78.1/78.2）はいずれも実機起点で発見・特定・修正
- silver/blueテーマでの--color-amber-rgb修正効果を、開発者が
  ブラウザコンソールで実測し確認済み
- 範囲シフトが選択範囲外のコードに影響している疑いを新たに発見
  （Phase79候補として記録・要再調査）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
