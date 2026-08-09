# 現在の課題・バックログ

> 最終更新: Phase109完了時点（Phase109を反映）
> 本ファイルは現在認識している未解決課題（Current Issues・Technical Debt・UI改善）を管理する。
> 将来の新機能・構想は「5. Future Features」で管理する（README `[FILE SCOPE INVARIANT]` に準拠）。

---

## 1. バックログ（優先順）

### Issue #27 — メタリックテーマ描画方式の見直し
状態: 検討中
目的:
- 描画負荷低減
- CSS複雑化抑制
- モバイル安定化
- テーマ拡張性向上

方向性:
- CSS + テクスチャのハイブリッド方式
- filter / backdrop-filter 依存削減
- semantic token体系は維持

備考: 本格化した場合は `docs/theme-rendering-architecture.md` へ昇格

---

### Issue #28 — Decorator視認性優先原則の既存Decoratorへの適用確認（Phase102-Bで発見）
状態: 検討中
目的:
- [DECORATOR LEGIBILITY PRINCIPLE]（architecture.md §12・Phase102-Bで採用）を、
  Section Preview以外の既存Decoratorにも適用すべきか判断する
- 「テーマとの調和」を主眼に設計された可能性のある既存色（Selection /
  Search Highlight等）が、実際の編集作業で視認性の課題を抱えていないか棚卸しする

対象候補:
- Selection Highlight / Search Highlight（同系色の濃淡による表現）
- EditPoint / Collision Indicator / Correction Badge

方向性:
- 単独では優先度が低いため、次回のTheme Audit（README.md運用ルール参照）と
  合わせて実施する

---

## 2. Current Issues（未解決の問題・バグ・既知の設計ギャップ）

### Chart Mode 系

#### 編集中に小節頭補正を変更すると表示が編集前の状態に戻る（要調査）
状態: 観察中・原因未特定（Phase103棚卸し時に報告）
内容: Analysis Editorで解析編集モード中に小節頭補正（repairRule・Correction
Authority）を変更すると、Chart Modeの表示が編集の修正前の状態に戻って
しまう。Undoを行うと表示が戻る。データ（analysisEditor.buffer）自体が
失われているのか、表示（Chart Mode projection）のみの問題かは未切り分け。
次回発生時、`window.__CS_DEBUG__.timing`（repairRule/normalized）と
`window.__analysisEditorDebug`（buffer状態）を突き合わせて事実ベースで
原因を特定する方針（[FEATURE REGRESSION POLICY]・実装漏れと断定しない）。

#### Pickup Measure（表示補正・実曲検証待ち）
状態: 実装済み・実曲検証未実施
内容: pickup measureの表示補正（番号・位置調整）は実装済み（architecture.md §9.5参照）。
synthetic testでは動作確認済みだが、手元の楽曲が全てpickupなしのため実曲での
最終確認が未実施。次フェーズ候補の優先項目。

#### Issue #45 — Chart Mode 小節頭ズレ（timing failure taxonomy）
状態: Type B対応済み・Type A/C/D未対応

| Type | 原因 | 対処状況 |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats 完全一致） | 未着手（手動修正UIが必要） |
| Type C | beats 半テンポ / 粒度異常 | 未着手（手動修正UIのみ） |
| Type D | 局所 drift → 全体伝播 | 発生ケース収集中（現状未発生） |

次のアクション候補:
- Type D: 発生ケース収集後に repair: true で効果検証
- Type A/C: 手動修正UI設計フェーズ（大規模・将来）

#### Pickup Measure（Collision可視化・Phase91-92で対応・pickup measureは未対応）
状態: normal path対応済み（Phase92・Collision Indicator P1 v1）・pickup measureは
visual compression collisionの意味論整理待ちのため適用対象外
内容: 個別移動ボタンでコードの幅を極端に狭めた（duration≈0だが0ではない）状態で
aep-add（中間点分割）を実行すると、生成された2つのonsetがChart Modeの量子化グリッド
（1slot幅）より遥かに短い間隔にあるため、buildGridViewModel()で同一slotIndexへ
量子化される。render直前のresolveCollision()がこの衝突を1件に絞り込む際、
confidence→duration→time（後発優先）の順で片方を選ぶ（chartmode.js内の既存仕様）。
中間点分割は必ず2つのonsetが同一durationになるため、time タイブレーク（tie-break）により
「後発onset」が常に採用され、条件が揃えば必ず・決定的に再現する
（Phase91実測ログで確認済み）。データはanalysisEditor.buffer上には正しく存在しており、
消えるのはChart Mode描画（GridViewModel projection）上のみ。
対応（Phase92）: normal pathの衝突slotに`hiddenCount`をGridViewModelへ持たせ、
Rendererが`.chart-slot-collision`（Amber系ドット・title属性「+N hidden chord(s)」）を
表示するようにした（[DECORATOR VISUAL LANGUAGE PRINCIPLE]準拠・新色追加なし）。
hiddenCountはnormal pathのslot projection時のみ付与される（pickup measureでは
付与されない）。これにより「無言で消える」問題は解消し、「表示は1つだが他に隠れているコードが
あると分かる」状態になった。
残課題: pickup measure（`mode==='full'`かつ小節0）は対象外。`remapPickupOnsetMap()`
による視覚圧縮衝突（Stage2 collision）は同一slot衝突（Stage1）と意味論が異なるため、
今回は意図的にスコープ外とした（architecture.md §9.5
「PICKUP COLLISION SCOPE INVARIANT」参照）。P1 v2として将来対応候補
（phase-status.md「Future Candidates」参照）。

#### Known Design Gap — N（無音プレースホルダー）の表示モデル不一致
状態: 未着手・優先度低
内容: Analysis Editorの正本（buffer）は無音プレースホルダー（chord:'N'）を実在する
編集対象として扱うが、Chart Modeの表示モデル（buildGridViewModel）はNを表示前に除外する。
この不一致により、Nの領域はクリックで選択できず、必ずeditPointへ直行する。
個別移動ボタン経由で境界調整自体は可能なため実害は小さい。
（architecture.md §12「Known Design Gap」に設計上の位置づけを記載）

#### 原因未特定の「緑の棒」バグ
状態: 観察中（原因未特定）
内容: 編集終了・保存後、または編集中に別プロジェクトへ切り替えた際、画面上に緑の細い
縦線が残ることがある。静的コード確認では原因を特定できなかった。次回発生時に
`window.__CS_DEBUG__.chart` / `window.__analysisEditorDebug.state.selection` を
コンソールで取得し、事実ベースで原因を切り分ける方針。

#### Boundary Handle Dragのpointercancel経路が未検証
状態: 未検証（Phase93で発見・Phase95-A2まで継続保留）
内容: 実機検証は「通常クリック」「8px以上ドラッグ＋Undo」「ドラッグ後click握りつぶし」
のみ実施済み。`pointercancel`（ウィンドウ外へのドラッグ・OSジェスチャ介入等での発火）は
実機で一度も踏んでいない経路。`_endGridBoundaryDrag()`は`pointerup`と共通処理のため
理論上は問題ないはずだが、未検証である旨を明記しておく。

### Analysis Editor 系

#### [Known Limitation] replaceCurrentAndAdvance()のbackward方向の簡略化
状態: 意図的な仕様（バグではない）
内容: 置換によりコード名がqueryと一致しなくなると、matches配列は1つ前に詰まる。
forward方向（Enter）は自然に正しく動作するが、backward方向（Shift+Enter）では
詰まった分だけ1件飛ばす可能性がある。利用頻度と補正実装コストを比較し、現段階では
仕様として許容した。実害が出るようなら再検討する。

#### clipboardのセッションスコープ未検討
状態: 未対応（実害なし・Phase86-2/87で発見）
内容: analysisEditor.clipboardは`beginAnalysisEdit()`/`resetAnalysisEditor()`の
どちらでもクリアされず、編集セッションをまたいで保持される（「アプリ内
クリップボード」に近い挙動）。意図的な仕様か検討の余地あり。

#### 置換直後のCtrl+Zがブラウザ標準Undoと衝突しやすい
状態: 仕様として説明可能・UX改善は未検討（Phase88で発見）
内容: 置換直後、入力欄にフォーカスが残った状態でCtrl+Zを押すと、既存の
`inTextInput`ガード（ブラウザ標準のテキストUndoと衝突させないための意図的設計）
によりアプリ側のUndoが発火しない。「元に戻す」ボタンでは正常に動作する。
コード不具合としては再現できていないため、断定はしていない。ショートカットUXの
改善候補（例: Escapeでフォーカスを外してからCtrl+Zする案等）として保留。

#### Section境界編集ステッパーが動作しない（Phase109実機テストで発見）
状態: 未調査
内容: Section▼メニューの境界ステッパー（◀開始 ▶ ◀終了 ▶）を操作しても
反映されない。Phase109のreconcile()引数拡張との因果関係は現時点では
確認されていない（getSections()の無引数呼び出し経路自体はPhase108までと
同一のまま、という限定的な確認は取れている）。Phase109以前から
存在していた可能性もあるため、次回updateSectionBoundaryCommand()の
呼び出し経路を実機で再調査する（[FEATURE REGRESSION POLICY]・
実装漏れと断定しない）。

#### merge実行でSectionが削除される場合の確認UX未実装（Phase109で発見）
状態: 意図的に先送り（使用頻度が低いと判断）
内容: [SECTION EXTENT GUARD]（architecture.md §12）によりSection外を
巻き込んだmergeはSection削除となる仕様（正しい動作・バグではない）。
現在は警告なしに実行されるため、意図せずSectionを削除してしまう可能性が
ある。将来merge実行前の確認ダイアログを検討する。

#### Ctrl+V（そのまま貼り付け）がSection境界reconciliationに未対応（Phase110で発見）
状態: 未対応・優先度高（次フェーズ最優先候補）
内容: buildPastePlan()/commitPastePlan()（Ctrl+V経路）はreconcile()を
一切呼ばない。実機検証の結果、Section境界コードを含む範囲へCtrl+Vで
貼り付けると、削除された旧IDをSectionが参照したまま残り、後続の
getSections()呼び出し時にvalidateSectionInvariants()が「参照先が
見つからない」と判定し、結果的にSectionが削除されることを確認した。
Ctrl+Shift+V（範囲に合わせて貼り付け・pasteSelectionCommand）は
正しくremapされる（Phase110で対応済み）。対応候補は、
buildPastePlan()/commitPastePlan()側にもreconciliation対応を
拡張するか、Section境界を巻き込む場合に警告UIを出すか。設計方針は
次フェーズ開始時に検討する。

### restore lifecycle 系

#### beat cursorが一瞬停止して数ビートジャンプする
状態: 観察中（原因未特定）
内容: 再生中、beat cursorが一瞬停止した後、数ビート先へジャンプすることがある。
audio playback自体は正常（カーソル描画のみの問題）。毎回同じ位置で再現しない。
仮説候補: main thread blockage（autosave serialize / layout reflow）またはframe
scheduling delay。現時点は現象記録フェーズ（診断には「5. Future Features」の
`__CS_DEBUG__` perf instrumentation が前提となる）。

### Library / Environment 系

#### localhost:8767 が読み込み中のまま開かないことがある
状態: 再現性確認中
内容: 読み込みを中止して再度読み込むと比較的早く開く。再現条件の特定が必要

---

## 3. UI改善

### 演奏モードの繰り返し表示
状態: 未対応
内容: 繰り返しが行の下に表示されて見づらく、「×N回」表記も削除操作との視覚的衝突がある。Simile記号（𝄋）の使用を検討

### 演奏モード復帰のプルダウンメニューのデザイン改善
状態: 未対応
内容: 演奏モードからの復帰（曲選択等）に使うプルダウンメニューの見た目が
簡素なため、もう少しスタイリッシュなデザインへ修正する。具体的な方向性
（既存token活用か新規デザインか）は着手時に検討する。

---

## 4. 既知の技術的負債

- `chord-entry.css`（Phase86でcomponents.cssから分離）の `.mac-insert-btn.active` 系（`--color-accent` 未定義問題と紐付き・意図的保留）
- `idb.js` は最低構成（GC・schema migration・compression なし）。asset種類追加時は
  key形式 `${projectId}:${type}` に新typeを追加。schema変更時は `DB_VERSION` を
  インクリメントして `onupgradeneeded` を更新すること
- `isSepToken` の旧形式互換（`c.chord === '/'` / `type:'sep'`）は barline migration 完了後に削除判断
- `isChordLikeInput` の末尾検証強化
  状態: 未着手
  内容: 現行の `/^[A-G](#|♯|b|♭)?/` は先頭のみ検証するため、`Cほげ` のような
  入力が通ってしまう。優先度は低（誤入力されてもnormalizeChordNameで処理される）。
- barline storage migration（意図的保留・Issue #26 の bars[] 設計フェーズ前後に実施検討）
- `grid-template-columns` の分散管理（`#app` の定義が4箇所に分散。パネルレイアウト
  再設計フェーズで統合を検討）
- 左パネル collapse / hide の概念整理（現在の「◧ 左パネル」トグルは完全非表示ではなく
  collapse。概念とラベルを整理する。パネルレイアウト再設計フェーズで対応）
- hover hitbox分離（Chart Mode hover chord diagramは現在scrollWidth guardで
  carry-forward領域の誤hoverを抑制している暫定実装。将来layout span
  （`.chart-chord-name`）とinteraction span（`.chart-chord-hit`）をDOMレベルで
  分離することで、zoom/font変更耐性・touch long-press対応が見込める）
- 置換欄の入力検証なし（Search Engineの置換欄は `isChordLikeInput()` 等の検証を
  経由しない自由入力。chordEntry.jsが実装時に未連携だったため。誤入力時はUndoで
  復旧する前提。必要であればchordEntry.js側にvalidation関数のexportを追加する）
- 保存データ復元のschema versioning未実装（restore ordering contractは確立済み
  だが、schema versioning / migration layerは未定義のまま。isRestoreフラグ・
  endTime付与で止血済み。正式なinvariant validationは今後の課題）
- `.library-sort-select`（HTML上のclass属性）にCSSルールが存在しない
  （Phase86棚卸しで発見）。実際のスタイルは `.library-toolbar select`
  という子孫セレクタから効いているため実害なし。低優先度。
- `__analysisEditorDebug`の正式な扱い未確定（Phase87で発見）
  コード内コメントで「[TEMP DEBUG] 実装完了後に削除すること」と書かれているが、
  Phase74から現在までDevTools経由の実質的な公開インターフェースとして
  使われ続けている。削除するか、正式なdebug APIとしてarchitecture.md §5.5に
  昇格させるか要検討。
- Result型（CommandResult）が共有typedefファイルとして独立していない
  （Phase87）。現状はanalysisCommands.js冒頭のコメントに型定義があるのみ。
  優先度低。
- 検索欄の入力仕様（画面表示名ベース）が直感的でない可能性（Phase97発見）
  capo適用中に実音（canonical）をそのまま検索欄へ入力すると、意図と
  異なる結果になる（バグではなく仕様。検索欄は画面表示名で検索する設計）。
  案内方法の具体案（プレースホルダー等）は着手時に改めて検討する。
- merge操作の意味論見直し（Phase109で発見・保留）
  mergeSelectionCommandは選択範囲全体を削除し、新規UUID・confidence
  固定値1で置き換える実装（先頭コードのUUIDを引き継いでいるわけでは
  ない）。先頭コードのUUID維持へ変更するかどうかは、Compound Mutation
  とは独立した設計判断として保留。

---

## 5. Future Features（将来機能・将来構想）

新機能の要望・UX改善案・長期構想。バグでも設計上の問題でもなく、
「まだ作られていない新しい能力」に分類されるものをここに置く。

### 新機能候補（次フェーズ以降の着手候補）

#### 行またぎコード移動
内容: 先頭コード→前行末尾 / 末尾コード→次行先頭へのコード移動。
`moveChordAcrossLines` として設計済み（Phase38-3）。行またぎ**カーソル navigation**は
実装済み（Phase53）だが、**コードそのものの移動**は別問題として未着手。
Chart 関連作業の後に実装予定。

#### interaction hierarchy 改修（残り）
内容: 既存tokenのキーボード削除・小節線のキーボード挿入。
insertion cursor化・行またぎnavigation・hover-only削除ボタンは対応済み（Phase53, 70-B）。
残りは本格的なkeyboard-first redesignの一部として設計フェーズで扱う。

#### simile token 挿入UI / renderTokenNode 層
内容: AddChordモーダルから simile token（`{type:'simile', bars:1|2}`）を挿入できるUIと、
そのSVG描画（performSimileStyle='svg'対応）。Phase38-2で設計済み。

#### Issue #26 — ChordMini Beat/Grid情報対応
内容: 将来の `bars[]` 構造への移行・grid表示・beat alignment対応。
`isSepToken()` access layer確立済み（Phase39-3/4）のため土台はできている。

#### Chart Mode 並列表示（編集しながら Chart を参照）
内容: Chart Mode を全画面モードではなく、エディター画面と並列表示できるようにする。
4層 architecture contract確立済みのため設計着手可能な段階だが、projection layerの
boundaryはまだ新しく、着手前に設計フェーズを必ず挟むこと。

#### Pickup-aware Collision Indicator（P1 v2）
内容: Phase92のCollision Indicator（`hiddenCount`可視化）はnormal path限定。
pickup measureでは`remapPickupOnsetMap()`による視覚圧縮衝突（Stage2 collision）
が別途存在し、意味論が同一slot衝突（Stage1）と異なるため今回は意図的にスコープ外
とした。将来対応する場合は、Stage1/Stage2のhiddenCountを単純合算せず、
別概念として設計すること（architecture.md §9.5参照）。

#### 二段階クリックモデルの見直し
内容: 「1クリック＝選択、2回目クリック＝editPoint」という現行モデルから、
「ダブルクリックまたは明示操作＝editPoint」への変更を候補として検討する。

#### 複数選択時の個別移動
状態: 意図的に見送り中
内容: 「選択範囲の先頭コードだけ動く」という違和感が実機確認で発覚したため、
単一選択専用に限定した（範囲シフトで代替）。再要望があれば再検討する。

#### Boundary Handle / Playhead の表示条件見直し
内容: 検索モード中のBoundary Handle非表示/減光、再生停止中のPlayhead淡色化などの案。
現時点では「改善アイデア」の段階。

#### 実音（canonical）そのものでの検索モード（Phase97発見）
状態: 未着手・優先度低
内容: 現在の検索欄は「画面に表示されている名前（capo適用後）」で検索する
設計。実音そのもの（capo適用前の値）を直接入力して検索したいという
ニーズがあれば、検索モード切替（表示名検索／実音検索）のようなUIを
将来検討する。Phase97では「画面表示名で検索する」という既存仕様に対する
バグ（enharmonic不一致）の修正のみを行った。

#### Correction Badge の開発者情報トグル化（Phase96発見）
状態: 未着手・優先度低
内容: 小節補正バッジ（`.chart-measure--estimated`等）は解析アルゴリズム
調整時のみ有用な情報であり、通常編集時は不要という位置づけがDecorator
Inventory整理（Phase96）で明確になった。「開発者情報を表示」のような
表示設定トグルを将来追加し、デフォルトでは非表示にすることを検討する。

#### Selectionの水玉テクスチャ（Phase96で試作→撤回）
状態: 保留・再挑戦の余地あり
内容: 「和紙のような質感」を目指して試作したが、(1)小節をまたぐコードで
継ぎ目が途切れる、(2)alpha合成用トークンのテーマ欠落、(3)他Decoratorとの
z-index競合、という3つの問題が同時発生し撤回した。再挑戦する場合は、
carryセルへ跨る継ぎ目問題を根本的に解決する設計（コード全体を1つの
連続した要素として扱う等）から着手すること。

#### Section境界の共有（同一chordIdを複数Sectionのstart/endが指す）の正式サポート
状態: 未着手・価値のある拡張候補（Phase109の設計討議で判明）
内容: 現在データモデル上は境界共有を禁止していないが、UI側で
「明確にSectionを分けられず共有させたいコードがあった」という実際の
ニーズが確認された。ただしUI・作成フロー・Boundary Editor・Preview・
Navigationすべてに影響する規模のため、独立したEpicとして着手すること
（Compound Mutation対応とは別スコープ）。

#### Section UX Epic — Section機能をアプリ全体の楽曲構造レイヤーへ拡張（Phase106発見）
状態: 未着手・構想段階
内容: 現在のSectionはAnalysis Editor限定の「編集時の補助機能（Previewハイライト）」
に留まっている。これをAnalysis Editor専用機能から、Chart Mode・演奏モードを含む
アプリ全体で共有する「楽曲構造（Song Structure）」レイヤーへ発展させる構想。
Phase98〜108でデータ層（Specification→Session→UI→Preview→Persistence→
History→Navigation→Boundary Editing→UX Polish→Boundary Reassignment）が
一巡し安定したことを受けて浮上した、次の発展方向。

設計思想（Creator UX / Performer UX）:
```
編集（Creator UX・PC主体）はKeyboard-firstを重視し、
演奏（Performer UX・PC/タブレット/スマホ）はTouch-firstを重視する。
Sectionは両者を繋ぐSong Structure Layerとして機能する。

Editor   Keyboard First
Chart    Keyboard + Mouse
Perform  Touch First
```
この役割分担は、既存Future Featuresの「Keyboard-first UI」（Creator UX寄り・
下記参照）・「LAN配信モード」（Performer UX寄り・PCサーバー→スマホブラウザ
構想・下記参照）とも一致する。同じデータ（Section＝楽曲構造）を、
編集端末（PC）と演奏端末（PC/タブレット/スマホ）それぞれに最適なUIで
提供する、という考え方が両構想を繋ぐ。

[Future候補] `Song Structure Layer` という概念は、Section機能の発展次第で
将来architecture.mdへ独立した章として昇格する可能性がある
（Project → Song Structure → Section/Marker/Repeat/Navigation/Playlist、
というような構造が将来像として想定される）。現時点ではFuture Features内の
構想に留め、実装フェーズへ入るタイミングで判断する。

投資対効果順（優先度目安）:

```
P1  Section Navigation Across Modes
    Chart Mode限定のSection Navigationを、演奏モード・Analysis Editorでも
    共通利用できるようにする。演奏モードでは「前のSection／次のSectionへ
    ジャンプ」だけでもコードを探してスクロールする手間が大きく減る。

P2  Section Header Rendering
    Chart Mode内にSection名の区切り（見出し）を常時表示する。スクロール中も
    「今どのSectionにいるか」が一目で分かる。

P3  Section Length Mismatch Detection（旧称: Section Metrics・Phase108後の
    設計議論で具体化・[ChatGPT未レビュー]）
    動機: 1番と2番のように同じtype（verse/chorus等）のSectionを人力で
    複数作成する際、コピペの起点となる範囲選択がズレて小節数が揃わない
    ことがある。「単なる長さの表示」ではなく「不一致の検知」まで行う
    ことで、この不安に直接対処する。

    設計方針（たかっちとの相談で確定済み・詳細設計は未着手）:
      グルーピング: 名前ではなくtype（種類）ベース。リネームに強く、
        1曲に1回しか出てこないtype（Intro/Outro等）は同type1件のため
        自動的に比較対象から除外される（特別扱いのコード不要）
      比較単位: 小節数のみで判定する。拍数は「小節数×8」（4/4拍子前提の
        簡易計算）でhover時の参考表示にのみ使い、判定自体には使わない
      基準の決め方（複合ルール）:
        同typeが3つ以上 かつ 明確な多数派がある
          → 多数派を基準にし、外れたものだけ警告
        同typeが2つだけ、または多数派が無い場合
          → 「どちらが正しいか」は判定せず、関係する全員に中立な警告を出す
            （AIが一方を誤りと決めつけない設計）
      警告UI: チップにはアイコンのみ表示、hoverで両者の長さを見せる
        （常時数字表示は情報過多と判断）

    データ設計の見込み: 新規の永続化は不要（Runtime Projectionとして
    実装可能）。Section.startChordId/endChordIdの時間範囲をChart Mode
    タイミンググリッドに当てはめて小節数を算出する。

    着手条件: Compound Mutation対応・Section UX Epicの他項目の進捗を
    見た上で、詳細設計（実装箇所・API形状）に着手する。

P4  Editing Interaction Modernization（旧称: Direct Section Manipulation）
    Section編集のインタラクション全般を、メニュー操作依存から
    「入力手段（Input Modality）ごとに最適な形」へ拡張する。

    Input Modality:
      Mouse-first（Creator UX・PC編集時の補助）:
        Boundaryドラッグ・Headerドラッグ（既存のBoundary Handle Drag・
        コード側Phase93と同じ設計パターンを転用できる可能性がある）・
        Shift+ドラッグでの新規Section作成・ダブルクリックでの編集
      Keyboard-first（Creator UX・PC編集の主力）:
        次/前Sectionへのジャンプ・Section作成/名前変更/削除の
        ショートカット・境界の微調整（コード側の個別移動と同じ思想）
      Touch-first（Performer UX・演奏時。詳細設計は将来のLAN配信モード
      着手時に本格化する想定。ここでは方向性のみ記載）:
        タップでSection移動・スワイプで前後Sectionへ・長押しでメニュー
    その他:
      Context Menu簡略化・操作方法のDiscoverability向上

    [責務分離] 本項目はSection固有の編集体験に限定する。アプリ全体の
    操作体系（モード切替・タブ切替・再生操作・検索等）は既存の
    「Keyboard-first UI」（本ファイル内Future Features）が別途管理する。
    両者は同じ思想（キーボードだけでも快適に操作できるUI）を共有するが、
    対象範囲が異なるため項目としては分離したまま、実装時に設計を
    揃えることを意識する。
```

Future Features寄り（自動化・解析要素を含むため、上記P1〜P4より優先度低）:

```
P5  Section Pattern Matching（同一パターン検出による提案）
    同じコード進行の繰り返し（例: 1番と2番のVerse）を検出し、
    「同じパターンが3か所見つかりました。適用しますか？」という形で
    Section設定を提案する。自動適用はせず、必ずユーザー確認を挟む
    （コード進行が同じでも曲構成上は別Sectionというケースがあるため）。

P6  Section Templates
    ユーザーが「これは同じVerseだ」と明示的に宣言し、1箇所の編集を
    同種の全Sectionへ反映できるようにする。P5（パターン検出＝機械が
    「似ている」を判定）とは異なり、こちらはユーザー主導の宣言的な
    紐付け。ライブ用途・楽譜編集での活用を想定。

P7  Automatic Section Generation
    コードパターン・小節数・リズム・Downbeat・繰り返し構造等から
    Intro/Verse/Chorus等を自動生成する。ヒューリスティック解析や
    将来的なAI活用を組み合わせる余地がある構想段階の項目。

P8  Section Quick Actions
    定型Section（Verse/Chorus/Bridge等）をワンキーで作成する
    （例: Alt+1=Intro、Alt+2=Verse、Alt+3=Chorus）。「作る→名前を
    入力→OK」という現行フローを1操作へ短縮する。ライブ編集・解析
    作業では定型Section種別しか使わないことがほとんどであるため、
    編集速度への効果が大きいと見込まれる。P4（Editing Interaction
    Modernization）のKeyboard-first項目群と密接に関連するため、
    実装時はP4とセットで設計する。
```

設計上の留意点: ここまで発展させる場合、Sectionの位置づけを「Analysis Editorの
機能」から「Project全体で共有する楽曲構造データ」へ昇格させる判断が必要になる。
これは既存ロードマップの「Chart Modeと通常モードのシステム統合」
（Authority再設計を伴う規模のテーマ）と関心事が重なるため、着手時はそちらと
セットで設計フェーズを設けること。P1（全モード共通Navigation）は特に、
現在Analysis Editor Session限定になっているSection Authority Scope
（section-model.md §5）の範囲拡張を伴う可能性が高く、真っ先にこの判断を
要する項目である。

#### カポ範囲拡張（-2 まで対応）
内容: 現在カポは 0〜11 の範囲のみ。半音下げチューニング用途で -2 まで対応できるようにする。

#### 開発者支援：解析データのテスト支援機能
内容: 編集前スナップショットの保存・ChordMini解析直後の状態へリセット・
analysis.jsonのエクスポート／インポート等。優先度低（開発者向け機能）。

#### Chart Mode → Editor（コード進行の挿入）
内容: Chart Modeで解析・編集したコード進行を、通常モード（project.lines）へ
挿入できるようにする。単なるUI改善ではなく、Analysis Buffer → Chart ViewModel →
project.lines という逆変換が必要な設計テーマ。
「Editor→Chart」を含む双方向編集・システム統合の全体像は「ロードマップ」の
「Chart Modeと通常モードのシステム統合」を参照（本項目はその最初のステップ）。

#### Keyboard-first UI（キーボード操作の拡充）
内容: ほぼ全操作をキーボードから行えるようにする、という方向性のテーマ。
今回の要望（モード・タブ切替のショートカットキー化）を最初の候補として、
将来的に対象を広げていく前提で名称を一般化した。

候補（優先順位未定）:
- モード切替（Chart Mode／演奏モード／TAPモード。例: F1〜F4）
- タブ切替（ダイアグラム／ライブラリ。例: Ctrl+1/2）
- 検索・編集操作（Analysis Editorの既存ショートカットとの統一）
- Boundary操作・再生操作

具体的なキー割り当ては着手時の設計フェーズで検討する。

#### `__CS_DEBUG__` perf instrumentation
内容: `window.__CS_DEBUG__.perf` の正式化（chartmode.jsに`_perfState`を持たせ、
`getPerfState()`をexport）。beat cursorが一瞬停止する現象（現在のIssue）の
調査に必要な開発者ツール強化。`_rafLoop`はhot pathのため、restore/asset
lifecycleが完全安定してから着手する。

### ロードマップ（長期構想・優先度未定）

#### Chart Modeと通常モードのシステム統合（ロードマップ最上位テーマ）
内容: 現状はEditor（通常モード）・Chart・Performance・Tapがモードとして分離している。
将来的にはこれらを「1つのワークスペース」として統合する構想。
architecture.mdのアーキテクチャ変更を伴う規模のテーマのため、ロードマップの
最上位に位置づける。

構成要素（親子関係）:
```
Chart Modeと通常モードのシステム統合
  ├ Chart → Editor（コード進行挿入）  … 「新機能候補」参照・最初のステップ
  ├ Editor → Chart（編集の即時反映）  … 未設計
  ├ 共通編集モデル（誰がAuthorityかの再設計）
  └ モード統合（Editor/Chart/Performance/Tapの単一ワークスペース化）
```

Editor→Chartまで実現すると完全な双方向同期になり、「誰がAuthorityか」
（architecture.md §13）を再設計する必要が生じる。architecture.mdの
書き換えを伴う規模のため、着手前に必ず独立した設計フェーズを設けること。

#### CSS再構成（残タスク・theme system cleanup）
状態: 一部完了（Phase86でモジュール所有権ベースの分割完了）
内容: components.cssの肥大化は、Phase86（Sprint A）で
chart.css / analysis-editor.css / library.css / chord-entry.css /
modal.css / tapmode.css の6ファイルへ分離済み（分割基準はarchitecture.md
§3「CSS ownership」参照）。`--color-blue-rgb`のsilver/blue欠落も
Phase86で修正済み。

残タスク:
- `--color-edit-point-bg` が現在未使用
- silverテーマの `--color-green-rgb` が未定義（Phase78のamber-rgb修正・
  Phase86の--color-blue-rgb欠落と同種のパターン。今回は対象外としたため
  引き続きopen）
- theme.css の selector override 増殖（blue themeの text-secondary設定ミスはPhase79で
  修正済みだが、同種の問題が他にも潜んでいる可能性）
- components.cssに残る35ブロック（`.speed-cluster`等・複数モジュール共有／
  所有権未確定）の再監査
- `.perform-options`のスタイルがcomponents.css/layout.css/perform.cssの
  3ファイルに分散（Phase86で発見・実害なし）
- `.scope-selector`（replace.js所有と推定）の所属未確定。replace.js取得後に確定


#### CHORD_DB再構造化
目的: コードDBの構造見直し・検索効率改善

#### 転回形ダイアグラム自動生成
目的: 転回形コードのダイアグラムを自動生成する仕組みの導入

#### CSVコードファイルインポート機能の削除検討
状態: Deprecated候補
内容: Sonic Visualiser解析結果のCSV取り込みを想定していたが、精度が実用レベルに
達せず形骸化している。`csvImporter.js` 等の削除を将来検討する。

#### LAN配信モード（PCサーバー → スマホブラウザ）
目的: server.py をLAN開放し、同一Wi-Fi上のスマホからアクセスできるようにする。
音声配信・プロジェクト管理・UIの3段階対応が必要。Project DBライブラリタブが
先行すると自然に解決しやすい。

#### 音楽理論・学習支援基盤（theory.js）
目的: コード構成音表示・キー/度数解析・スケール関連表示・指板可視化・自動理論解釈
実装済み: alias normalization・lookup normalization・replacementMap.json
未実装: 完全な理論構造化（tones / intervals / harmonic relation）

---

> 将来、本セクション（5. Future Features）が肥大化した場合は
> `docs/future-roadmap.md` として独立ファイルへ切り出すことを検討する。
