# Phase134 調査 — Beat / Measure / Slot 定義論点整理

> **位置づけ**: 本ファイルはPhase134（Exploration専用フェーズ）の調査結果を、
> 次フェーズ（Beat/Measure/Slotの定義確定・Technical Design）へ引き継ぐための
> Handoverドキュメントである。section-model.md・debug-recorder-design.md・
> chart-slot-allocation-design.mdと同じ「調査固定・実装は次フェーズ」という
> 運用パターンを踏襲する。
>
> ステータス: **調査完了・定義未確定（Phase134・Exploration Freeze）。
> Beat/Measure/Slotの定義そのもの、およびTechnical Designは次フェーズ以降。**
>
> 本フェーズはコード変更を一切行っていない。

---

## [DOCUMENT AUTHORITY]

```
本ファイルはPhase134で行ったChart Mode Slot Collision調査、および
そこから派生したBeat Model / Measure Model / Slot Modelの論点整理を
集約するドキュメントである。

architecture.md・chart-slot-allocation-design.mdには、本フェーズ完了後の
棚卸しで概要と本ファイルへの参照のみを記載し、調査の詳細プロセス自体は
重複して保持しない。
```

---

## A. Phase134の目的・経緯

Phase134は当初、Phase133で確立したType A Slot Collision（拍検出由来のグリッドへ
複数onsetが量子化される現象）について、実データから「1拍1コード」を実現する
表示モデルの候補を探ることを目的として開始した。

調査を進める中で、以下の経緯で当初のスコープを超える論点が見つかった。

```
Step1: 17曲・全onsetのSlot Collision実態調査
  → 衝突は「曲頭N由来」「極短onset由来」の2パターンにほぼ集約される
    ことが判明（Type A allocation algorithmの単純な必要性は薄いことが判明）

Step2: 通常ケース（非Collision）を含めたSlot Assignment全体の妥当性調査
  → anticipationWindowが、グローバル固定値(曲頭のslot幅)を閾値に使う
    実装上の特性により、精度の良い量子化結果を悪化させるケースを発見
    （93baeafd, G7の例）

Step3: 93baeafdのBeat検出の異常を深掘り
  → 曲の前半約51%が、後半の約2倍のbeat間隔（疎密度）になっている
    ことを発見。メトロノーム実測でBPM(136.364)自体は正常と確認

Step4: 実際のユーザー体感（「前半が遅い」「後半がカクカクする」）との
       照合調査
  → Chart ModeのPlayhead（再生カーソル）が、連続値ではなく
    離散的なslot位置を瞬間移動する実装であることを発見。
    この1つの実装特性が、「前半が遅い」「後半がカクカクする」という
    一見別々に見える2つの体感を、同じメカニズムから説明できる
    可能性が高いことが分かった

→ 結果として、当初のテーマ（Collision Allocation Algorithm）へ進む前に、
  「そもそも1 Slotとは何を表す単位なのか」というより上位の問題が
  未定義のまま残っていることが明確になった。
```

---

## B. Confirmed Facts（確認済み事実）

### B-1. Playhead（再生カーソル）の実装経路

```
_rafLoop()                                      [chartmode.js]
    ↓ 毎フレーム（約60fps）
updateChartPlayback(aEl.currentTime)            [chartmode.js L2823]
    ↓
model.getBeatPosition(currentTime)              [timing.js L506]
    ↓ 内部で quantize(time) を呼ぶ（onset量子化と同一関数）
q.slot / slotsPerMeasure                        ← 離散値を返す
    ↓
measureEl._playheadEl.style.left = `${pos*100}%`
```

- `getBeatPosition()`は連続補間を行わず、`quantize(time).slot / slotsPerMeasure`という
  **離散値**を返す（timing.js L506-513、コード確認済み）
- `getBeatPosition()`内部で呼ばれる`quantize()`は、onset量子化に使われるものと
  **同一の関数**であり、anticipationWindowロジックもそのまま適用される
- `.chart-playhead`のCSS定義（css/chart.css L378-389）に`transition`プロパティは
  **存在しない**（確認済み）。JSが`left`を書き換えた瞬間、アニメーションなしで
  即座に位置が変わる
- したがって現在のPlayheadは「連続的に動くカーソル」ではなく、
  「slot位置が変わるたびに瞬間移動する階段関数」として実装されている
- コード内コメント（chartmode.js L2300）には
  `"playhead = continuous overlay（measure直下 absolute）"`と記載されているが、
  上記の実装事実とは一致していない

### B-2. Grid（小節の表示幅）

- `.chart-measure { grid-template-columns: repeat(8, 1fr); }`（css/chart.css L129、確認済み）
- 1小節は常に8等分のグリッドとして描画される。**実際の小節の長さ（秒）に関わらず、
  画面上の幅は一定**（実時間に比例しない）

### B-3. Timing（Beat→Slot生成）

- `buildSlotTimings(beats, resolutionPerBeat=2)`は、検出された`beats`配列の各区間を
  そのまま2等分してslotを生成する（timing.js、確認済み）
- Beat検出の疎密度がそのままslotの実時間幅に反映される（疎ならslotも広くなる）
- `anticipationWindow`の判定に使われる`slotWidth`は、曲全体を通じて
  `slotTimings[1] - slotTimings[0]`（曲頭・最初のslot幅）に固定されている
  （timing.js、確認済み。この値が「曲全体の代表値」であるという設計意図を
  示す記録はコード・commit履歴のどこにも見つからなかった）

### B-4. Analysis Data（bpm / beats / downbeats / timeSignature）

- `raw.beats`・`raw.downbeats`・`raw.bpm`・`raw.timeSignature`はすべて存在する
  （93baeafdで確認。他16曲でも同形式）
- `downbeats`は常に`beats`配列の値と厳密一致する部分集合である
  （93baeafd: 149個のdownbeatすべてがbeats配列内の値と誤差0で一致。確認済み）
- `beats`・`downbeats`・`bpm`は、いずれも`tools/chordmini_fetch.py`の
  `/api/detect-beats`単一API呼び出しの同一レスポンスから取得される（確認済み）
- `analysisLoader.js`の`sanitizeTimestamps()`は型・範囲・重複除去のみを行い、
  bpmとbeats間隔・downbeatとbeatsの整合性を検証する処理は**存在しない**
  （grep・目視で確認済み。「存在しない」ことそのものが確認できた事実）

### B-5. 93baeafd（平井堅「瞳を閉じて」）の具体的なBeat列

```
曲頭〜約51%地点（0〜174.57秒）: beat間隔 中央値 約0.84〜0.85秒
約51%地点以降（174.57秒〜）  : beat間隔 中央値 約0.42〜0.43秒

比率: 約1.93〜2.07倍（区間により変動）
```

- 遷移はbeat[205]→beat[206]の**1拍でほぼ瞬時**に発生している
  （0.77秒→0.46秒。実測値、確認済み）
- 前半・後半とも「downbeat間隔 ÷ beat間隔 ≒ 4」が維持されている
  （4拍1小節という相対構造そのものは崩れていない）
- 前半beat列の隣接ペアの中点を補完すると、中央値0.425秒・標準偏差0.008秒という
  高い規則性を持つグリッドが得られる（真のbeat周期0.440秒に近い）
- メトロノーム実測・外部BPM情報（SongBPM）により、`raw.bpm=136.364`自体は
  楽曲テンポとして妥当と確認済み（前提の修正。以前は疑問視していた）
- 実時間あたりのコード密度（コード数/秒）は前半・後半でほぼ同等
  （0.664 vs 0.604）であり、和声変化の頻度そのものが劇的に変わっている
  わけではない
- 既存の`analyzeTiming()`診断ロジック（Phase59導入）をこの曲のデータへ
  適用すると、`severity: 'severe'`・小節1〜52が連続してdrift判定される
  （既存の診断機構が、今回発見した異常をすでに検知できる範囲だったことが確認できた）

---

## C. Interpretation（解釈・推測。Confirmed Factと明確に区別する）

```
・前半のbeat列は「実際には約0.44秒周期で存在する拍のうち、1拍おきにしか
  検出されていない」可能性が高い（Confirmed Factではない。中点補完の
  規則性の高さから推測される、有力な解釈にとどまる）

・「前半が遅く感じる」「後半がカクカクする」という体感は、Playheadの
  離散ステップ挙動（B-1）から説明できる可能性が高い。ただし
  「体感の100%がこれで説明できる」とは断定できない

・Beat Detectionの密度差（B-5）は、上記の体感の"程度"を左右する要因では
  あるが、"カクつき自体"の根本原因ではない（根本原因はB-1の実装特性）

・Slotの実時間的な意味が、Beat Detectionの密度に依存してしまっている
  可能性がある（B-3から導かれる解釈）
```

---

## D. Unknown（未確認事項）

```
・ChordMini/madmom内部でbeats/downbeats/bpmがどのように生成されているか
  （このリポジトリからは確認不可能）
・93baeafd前半で、具体的にどちらの拍（奇数/偶数）が検出されているか
  （音声照合が必要。今回は未実施）
・他16曲でも、Playheadの離散ステップ挙動が体感上の問題として知覚されるか
  （今回は93baeafd集中のため未確認。beat検出が正常な曲でも、
  resolutionPerBeat=2による1/8小節刻みのジャンプ自体は構造的に
  存在するはずだが、知覚されるかどうかは未検証）
・chartmode.js内の"continuous overlay"というコメントが、当初どういう
  設計意図で書かれたものか（commit履歴・Handoverに該当する記述なし）
・Beat Model / Measure Model / Slot Modelをどう定義するか
  （本ファイルの主題。次フェーズで検討する）
```

---

## E. Slot Modelの問題（今回の核心）

```
resolutionPerBeat=2という設定は、一見すると
  「1 beatを音楽的に2分割する（8分音符グリッド）」
という意味に読める。

しかし現在の実装が実際に保証しているのは、

  1 slot = 検出されたbeat区間 ÷ 2

という、あくまで「検出結果に対する相対的な分割」である。

Beat検出が理想的（安定した密度）であれば両者は一致するが、
93baeafdのようにBeat検出密度が局所的に変化すると、
「1 slotが何秒に相当するか」は曲の場所によって変わってしまう
（前半 約0.435秒 ≈ 実質1拍相当 / 後半 約0.215秒 ≈ 実質8分音符相当）。

この曖昧さは、Phase133〜134で調査していたCollision問題（onsetの配置）
だけでなく、今回新たに発見したPlayhead（再生カーソル）の見え方にも
影響していることが分かった（Slotの定義が、Collision表示だけでなく
体感上の再生品質にも直結している）。

[重要] ここでは問題の所在を整理するに留め、新しいSlotの定義（例えば
「1 slot = 1/8音符固定にする」等）はまだ決定しない。
```

---

## F. Beat / Measure / Slotの「定義すべき質問」（次フェーズで検討）

次フェーズでは、以下の問いに対する答え（Decision）を確定させることが
最初の作業になる。本ファイルはこれらの問いを整理するところまでとし、
回答は含まない。

```
Beat Model（拍モデル）
  ・Beatとは何を表すのか？
  ・検出されたbeat（raw.beats）と、音楽的なbeatを同一視してよいか？
  ・BPM（raw.bpm）との関係はどうあるべきか？
  ・Downbeatとの関係はどうあるべきか？
  ・beats/downbeats/bpm/timeSignature間の整合性を、どのレイヤーが
    どう保証すべきか（現状は無保証）？

Measure Model（小節モデル）
  ・Measureは何を基準に区切るべきか？
  ・Downbeatをそのままmeasure開始点として使ってよいか？
  ・timeSignatureをどう扱うべきか？
  ・実時間上のmeasure長と、画面上のmeasure幅（現状は固定8等分）の
    関係をどう考えるべきか？

Slot Model（スロットモデル）
  ・Slotは何を表す単位なのか？
  ・音楽的な絶対時間単位（例: 1/8音符固定）なのか？
  ・それとも表示上の配置単位（検出beat依存の相対分割）なのか？
  ・Beat Detection結果から生成される派生単位として扱い続けるべきか？
  ・Slotの時間的位置は、実時間とどう対応すべきか？
  ・Playheadの位置表現（連続値であるべきか）と、Onset配置のSlot
    （離散値でよいか）は、同じモデルを共有すべきか、分離すべきか？
```

---

## G. Collision問題との関係

```
Phase133〜134前半では、

  Collision（衝突）
      ↓
  Slot Allocation（配分）

という構造で検討していた。しかし今回の調査により、

  Beat Model
      ↓
  Measure Model
      ↓
  Slot Model
      ↓
  Slot Allocation

という、より上位の関係が明確になった。Slot自体の定義が曲によって
意味を変えてしまう状態のまま配分アルゴリズムを設計すると、
「何を1つの単位として配分しているのか」という土台が場所によって
変わってしまう。

[決定事項]
  allocateOnsetsToSlots() および Largest Remainder Method（最大剰余方式）
  を含む配分アルゴリズムは、現時点では唯一の正解として固定しない
  （Phase133で確立した判断を、今回の調査結果によって再確認・補強した）。
  Allocation Algorithmの実装・選定は、Beat/Measure/Slotの定義確定後、
  次フェーズ以降で扱う。
```

---

## H. Playhead問題との関係

```
今回の発見として、Slotの意味の曖昧さは、Collision（onset配置）だけでなく
Playhead（再生カーソル）の見え方にも影響している可能性が明らかになった。

[明記しておくこと]
  「Slot Modelを変更すればPlayhead問題が必ず解決する」とは言えない。
  Playheadが現在「離散ステップ・トランジションなし」という実装である
  こと自体は、Slotの定義とは独立した、Chart Mode側の別の設計課題
  （連続的な表示にするかどうか）である可能性がある。
  両者は密接に関連するが、同一の問題ではない。
```

---

## I. 次フェーズへの明確なHandover

```
次フェーズは、以下の順序で進める。

  Beat Model Definition（Beatの定義確定）
      ↓
  Measure Model Definition（Measureの定義確定）
      ↓
  Slot Model Definition（Slotの定義確定）
      ↓
  Technical Design（技術設計）
      ↓
  Implementation Design（実装設計）
      ↓
  Implementation（実装）

Phase134では、上記のうち「定義すべき問い」（§F）を整理したのみであり、
Beat/Measure/Slotの定義そのものはまだ確定していない。

次フェーズの開始点は「§Fの問いに対する回答（Decision）を1つずつ
確定させる」ことである。定義が確定した後、初めてTechnical Design
（実データからどうSlotを生成するか、Playheadをどう連続化するか等）へ
進む。

Implementationは今回の成果物に含まれない。
```

---

## J. 守られたArchitectural Invariants（今回の調査で変更していないもの）

```
・Authority（正本）は変更していない（analysis.rawは無改変）
・Chart ModeはProjection（導出）として扱い、Renderingと混同していない
・Chart Modeの表示都合でAuthorityの時間情報を書き換えていない
・Paste処理（pasteAbsolute() / buildPastePlan() / commitPastePlan()）には
  触れていない
・Pickup Measure / Issue #81の既存処理には触れていない
・Allocation Algorithmは決定していない
・timing.js / chartmode.js / analysisLoader.js / CSS / ChordMini関連コードへの
  変更は一切行っていない（参照・調査のみ）
```

---

## 関連ドキュメント・調査対象一覧

```
- GitHub Issue #94（Chart Mode：Collisionで裏側に隠れたコードを自動削除する）
- GitHub Issue #81（Pickup Measureのvisual compression collision・対象外のまま）
- architecture.md §9・§9.5（Chart Mode timing pipeline・projection layer）
- current-issues.md §Chart Mode系「Issue #45 — Chart Mode 小節頭ズレ
  （timing failure taxonomy）」（Type C: beats 半テンポ/粒度異常。
  93baeafdはこのType Cの具体的な実例である可能性が高い）
- chart-slot-allocation-design.md（Phase133で確立。本ファイルの前段）
- 調査対象コード: analysisLoader.js / timing.js / chartmode.js /
  css/chart.css / tools/chordmini_fetch.py
- 調査対象データ: analysis/93baeafd-533e-4318-9e91-ab52d02088dd.json
  （代表ケース。他16曲は今回未着手）
```
