# 現在の課題・バックログ

> 最終更新: Phase123-C2完了時点（Phase119〜123-C2を反映）
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

## 1.5 Debug Session Recorder — Diagnostic Timeline v1 凍結後の保留事項

> Phase123-C2をもってDiagnostic Timelineを「v1」として一区切りとし、凍結した。
> 以下は通常のOpen issueとは区別し、「実運用でバグ調査に使ってみて不足が
> 判明した場合にのみ」着手する。机上の追加はしない
> （`debug-recorder-design.md` [RECORDING ADOPTION CRITERIA]参照）。
> 理由: デバッグ機能自体の開発が目的化することを避け、Phase124以降は
> アプリ本体の機能・UX改善へ復帰するため。

### render経路・参照元の識別の拡張（残スコープ）
状態: 保留（Mutation-triggered rangeのみPhase123-C2で実装済み）
内容: Section Preview等の非Mutation renderへの拡張、
`[RENDER PATH VISIBILITY]`の完全な適用。

### repairRule / capo変更の記録
状態: 保留
根拠: repairRule変更→render巻き戻り（Phase120）／capo変更→検索異常
（Phase97）。それぞれ独立した実バグ根拠を持つ。

### セッションlifecycle（begin/end/save/cancel）の記録
状態: 保留
根拠: dirty/reset漏れ（Phase103・Section Preview残留バグ）。

---

## 2. Current Issues（未解決の問題・バグ・既知の設計ギャップ）

### Chart Mode 系

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
「PICKUP COLLISION SCOPE INVARIANT」参照）。

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
`window.__CS_DEBUG__.chart` と、Analysis Editorの現行debug/observability
手段で取得できるselection状態をコンソールで取得し、事実ベースで原因を
切り分ける方針。

#### Boundary Handle Dragのpointercancel経路が未検証
状態: 未検証（Phase93で発見・Phase95-A2まで継続保留）
内容: 実機検証は「通常クリック」「8px以上ドラッグ＋Undo」「ドラッグ後click握りつぶし」
のみ実施済み。`pointercancel`（ウィンドウ外へのドラッグ・OSジェスチャ介入等での発火）は
実機で一度も踏んでいない経路。`_endGridBoundaryDrag()`は`pointerup`と共通処理のため
理論上は問題ないはずだが、未検証である旨を明記しておく。

#### Chart Modeで画面に何も表示されなくなる事象
状態: 未確認・原因未特定（Phase123-A実機検証中に発見）
内容: Analysis Editor編集中、bufferLengthは残っていたはずだがChart Mode上に
コードが一切表示されない状態が発生した（スクリーンショットあり）。Phase123-A
の変更（Recorder記録の追加のみ）が直接の原因である可能性は低いと考えられるが
未調査。次回発生時、`window.__CS_DEBUG__.chart`等で状況を確認する方針
（既存の「原因未特定の緑の棒バグ」と同様の扱い）。

#### `[RENDER CONTEXT INVARIANT]`違反4箇所（未修正）
状態: 未確認・原因未特定（Phase123-C2調査中に発見）
内容: `renderChartMode()`呼び出し元のうち、`saveAnalysisEdit()`・capo変更
ハンドラ・Chart Modeを開くボタン・列数切替ボタンの4箇所が`editing`引数を
渡していない。Phase106で確立した`[RENDER CONTEXT INVARIANT]`（`measuresPerRow`
と`editing`を両方明示すること）への違反状態が現存している。実害の有無は
未検証。Phase123-C2のRender Event実装とは独立した既存コードの問題であり、
別途調査・修正が必要。

### Debug Session Recorder 系

#### splitChord()が未使用のデッドコードである可能性
状態: 未確認・優先度低（Phase121で発見）
内容: app.js・chartmode.jsのどちらからも呼び出し箇所が見つからない。
Debug Recorder実装時に発見。削除するか、将来のカーソル位置分割機能で
使う予定があるか確認が必要（コード内コメントには「将来カーソル位置分割を
追加する場合もsplitChord()自体は変更不要」との記載があり、意図的に
残されている可能性もある）。

#### TAPモード（#tap-overlay）のz-index未確認
状態: 未確認・優先度低（Phase121で発見）
内容: Debug Recorderのインジケータ（#debug-rec-indicator）実装過程で、
演奏モード（z-index:9999）表示中にインジケータが隠れる問題を発見・修正した。
同種の問題がTAPモードでも起きないか、次回TAPモード表示中にAlt+Rの動作を
確認すること。

#### macOSでAlt+R（Option+R）が特殊文字を生成する可能性
状態: 未確認・要Mac実機確認（Phase121で発見）
内容: Recording Start/Stopのショートカットとして`Alt+R`を採用したが、
macOSのキーボード配列によっては`Option+R`が`®`という特殊文字を生成し、
`e.key`が`'r'`ではなく`'®'`として渡ってくる可能性がある（既存の`Alt+N`が
抱える制約と同種。keybindings.md参照）。開発環境がWindows中心のため
今回は確定させず、Mac実機での確認が取れ次第keybindings.mdへ反映する。

#### `deleteChord`/`updateSectionBoundary`のCommand拒否記録が実機未検証
状態: 検証保留（優先度低・Phase123-Aで発見）
内容: Mutation Attempt Recordingのうち、`deleteChordCommand`の「最後の1つ」
拒否・`updateSectionBoundaryCommand`の`start-after-end`拒否は、実機で拒否
イベントの発生そのものを確認できていない。前者はPuppeteer/人間実機とも
未検証（同一パターンの`deleteSelection`は動作確認済み）。後者はUI側の事前
ガード（境界ステッパーのdisabled制御）により通常操作では到達しないことが
判明済み。実用上のリスクは低いと判断し、優先度低として記録のみ行う。

#### Drag無移動時、既存`ok:true`仕様によりRender Eventが記録される
状態: 既知事項・低優先度（Phase123-C2で発見）
内容: 境界ハンドルを押してすぐ離した場合（実際には一度も`renderChartMode()`
が実行されない）でも、`_boundaryDragState.lastMoveOk`が未設定のため`ok:true`
と判定され、Render Eventが1件記録される。Phase123-A（Mutation Attempt
Recording）で確立された既存の`moveBoundary`判定仕様（クリックのみもok:true
扱い）を踏襲した結果であり、Phase123-C2では変更しない。修正する場合は
Phase123-Aの判定条件自体の見直しが必要（C2のスコープを超える）。

### Perform Mode 系

#### ブルーテーマの演奏モード「✕ 閉じる」ボタンが視認できない
状態: 未確認・原因推測のみ（Phase121実機テストで発見。perform.css確認済み・
theme.css未確認）
内容: `#btn-perform-close`が`--surface-btn-close`という専用トークンを
使用しており、ブルーテーマでは背景色と`--text-secondary`（文字色）が
近い色になっている可能性が高い。theme.cssを確認の上、別フェーズで対応する。

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
- `debug-recorder-design.md`内の`[MUTATION RECORDING SCOPE]`（Phase121で
  確立）が、Phase122の`[MUTATION ATTEMPT RECORDING]`確立後も明示的な
  supersession（上書き）記述なく残置されている（Phase123棚卸しで発見）。
  意味的には`[MUTATION RECORDING SCOPE]`（成功時のみ記録）と
  `[MUTATION ATTEMPT RECORDING]`（拒否・キャンセルも記録）は矛盾するため、
  後者が前者を実質的に置き換えたと考えられるが、`debug-recorder-design.md`
  自体にその経緯を明記する一文がない。設計文書の整合性問題として記録し、
  今回は推測で書き換えない（architecture.mdのNamed Invariant一覧にも
  `[MUTATION RECORDING SCOPE]`は含めていない）。

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
