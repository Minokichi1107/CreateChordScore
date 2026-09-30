# Phase135続き — Exhaustive Exploration
（Beat / Downbeat / Measure / Time Signature 論点総洗い出し）

> 目的は「正解を決めること」ではなく、Technical Design前に見落としを
> 防ぐため設計空間を可視化すること。実装・コード変更・モデル確定は
> 行わない。これまでの一連のPhase135ドキュメント（Beat Model・
> Downbeat Model・Measure Model・9モデル組み合わせ）を土台として
> 統合・拡張する。

---

## ① Concept Inventory（概念一覧）

### Beat

```
Fact/既確定:
  ・作業定義: 楽曲のリズムを構成する時間上の基本的な区切り
  ・等間隔を要求しない
  ・raw.beatsは時刻の配列（sanitizeTimestampsによりソート済み・
    重複除去済み・非負値のみ）
  ・Beat interval = beats[i+1]-beats[i]として実装上導出される

未整理（今回新たに明示）:
  ・Beatは時間上の「点」か「区間」か
    現在のraw.beatsはtimestampの配列＝点として実装されている。
    しかし「Beat interval」という導出は、暗黙にBeatを
    「次の区切りまでの区間の起点」として扱っている側面もある。
    この「点」と「区間の起点」という2つの見方の違いは、
    今まで明示的に区別されていなかった
  ・Beat timestampはBeatそのものか、Beat boundary（境界）か
    上記と関連する、同じ曖昧さの言い換え
  ・Swing（未検討だった新規論点）: 8分音符等の分割が均等でない
    リズム表現。Beat単位そのものへの直接の影響は今回のサンプル
    データからは確認できない（Unknown）
  ・Rubato: 演奏表現としてBeat Modelの「揺らぎ許容」原則の
    対象内だが、個別に論点として明示されていなかったため追記
  ・Beatが過剰検出された場合（余分なBeatが混入する場合）:
    欠落（missing）は既に論点化されていたが、過剰検出は
    今回初めて明示。現状のコードに、余分なBeatを検知・除外する
    仕組みは無い（Unknown・未確認）
  ・「Beatを信頼する」とは具体的に何を意味するか
    現行方針は「基本的に信頼するが、明らかな異常があれば
    修正対象」だが、「信頼する」という言葉が指す具体的操作
    （何を検証し、何を検証しないか）が定義されていない
    （Must Decide候補・§⑧参照）
```

### Downbeat（①②③の区別を前提に再整理）

```
既確定（前回までの整理の再掲）:
  ・①構造上の位置／②演奏アクセント／③聴感上の着地の区別
  ・raw.downbeatsは①のみ表現可能。②③は原理的に表現不可
    （データ構造上の事実）
  ・Detected Downbeat／Musical Downbeatの区別
  ・Downbeatが欠落する場合 → beat-onlyモードへ明示的フォールバック
  ・DownbeatがBeatと一致しない場合 → quantizeTimeのサイレント
    フォールバック（beatInMeasure=0）

未整理（今回新たに明示）:
  ・Downbeatが過剰検出される場合: 現状のコードに検知・対処の
    仕組みは無い（Unknown）
  ・Downbeatの位置が「少しずれる」場合（完全一致でも完全不一致
    でもない、近接ケース）: 現在のquantizeTimeは完全一致
    （epsilon内一致）のみを扱うため、この中間ケースは実質的に
    「一致しない」場合と同じ扱いになる
  ・Downbeatの「強さ」やconfidenceを表現する必要性:
    raw.chordsにはconfidenceフィールドが存在するが、
    raw.beats/raw.downbeatsには存在しない（データ構造上の
    非対称性。今回新たに指摘）
```

### Measure

```
既確定（前回までの整理の再掲）:
  ・4つの観点: 記譜上／音楽的・聴感的／解析上（Analytical）／
    製品UI上（Product/UI）
  ・start/end timestampを持つ（実装上）
  ・beatCount = timeSignature.numerator（無条件・未検証）
  ・Time Signatureの役割はfull/beat-onlyモードで異なる
    （定義的役割⇔ラベル付けのみ）

未整理（今回新たに明示）:
  ・BeatとMeasureの実装上の非対称性: Beatは「点」として実装
    されるが、Measureは「区間（start/end）」として実装される。
    この非対称性自体、これまで明示的に指摘されていなかった
  ・Pickup／Empty／Partial Measure／不規則小節／拍子変更／
    Compound Meterは§⑤（境界事例）で一覧化する
```

### Time Signature

```
既確定（前回までの整理の再掲）:
  ・numerator: buildMeasures()で「定義」、analyzeTiming()で
    「検証」という異なる2つの使われ方が共存
  ・denominator: 現状UI表示にのみ使用（計算には未使用）
  ・単一のtimeSignatureが曲全体で不変という前提（拍子変更未対応）
  ・numerator=Measure内Beat数、は「実装上の便宜」に最も近い
    （音楽的仕様でも、検証されたデータ契約でもない。前回整理済み）

denominatorがUI表示だけで十分かという問いへの結論:
  出さない（ご指定の通り）。現状の実際の役割はUI表示のみという
  事実のみ記録する
```

---

## ② Relationship Inventory（関係候補一覧）

### Beat × Downbeat（前回のA/B/Cを軸別に再整理）

```
時刻関係:
  完全一致／近接（許容誤差あり）／Beatの間（どちらのBeatにも
  一致しない）／一致しない

意味関係:
  DownbeatはBeatの属性（付随するラベル）／
  DownbeatはBeatとは別の構造情報／
  DownbeatはBeatを参照するが独立した意味を持つ

データ関係:
  Beat arrayがAuthority（Downbeatはそこから派生）／
  Downbeat arrayがAuthority（Beatとは無関係に独立）／
  両方が独立したAuthority（現在のraw.beats/raw.downbeatsの
  実装形態はこれに近い。2つの独立した配列として提供される）／
  一方から他方をDerivedできる
```

**現状の実装は「データ関係」としては"両方が独立したAuthority"
（2つの独立配列）に該当するが、`quantizeTime()`の
`[ASSUMPTION]`は"Beat arrayがAuthority"に近い期待を持つ**、
という前回までの指摘を、この分類軸に位置づけ直した。

### Beat × Measure（前回十分に独立していなかった軸。今回新設）

```
候補A: Beat → Measure
  Beatを基礎に、一定数を束ねてMeasureを構築する
候補B: Measure → Beat
  Measure構造が先に決まり、その内部にBeatが配置される
候補C: 相互依存
  BeatとMeasureが互いの情報を使って構造化される
  （どちらが先とも言えない）
```

**依存関係の整理（beatInMeasureを中心に）**:

```
Beat count（Measure内の拍数）
Beat position（各Beatの時刻）
beatInMeasure（今何拍目か）
Measure start / end
Beat interval
Time Signature
Downbeat

これらの間で、現在の実装（quantizeTime）は:
  beatInMeasure ← （measure.startTimeをbeats配列内で検索）←
  Downbeat（間接的に。measure.startTime自体がDownbeat由来のため）

という依存の連鎖になっている。つまりbeatInMeasureは、直接には
Beat配列上の検索結果だが、その検索対象（measure.startTime）は
実質的にDownbeat起源であり、BeatとDownbeatの両方に間接的に
依存する、複合的な依存構造を持つ
```

**重要論点（ご指定通り重要論点として扱う）**:

```
beatInMeasureは何をAuthorityとして決定されるべきか、候補:
  候補1: 位置ベース
    Beat配列における、そのMeasure開始位置からの通し番号
  候補2: 時間ベース
    Measure開始からの経過時間 ÷ 想定Beat間隔（四捨五入等）
  候補3: 検索ベース（現在の実装）
    measure.startTimeをBeat配列内で検索し、そこからのインデックス差

候補1と候補3は近いが同一ではない（候補3はDownbeatの値を検索の
起点にするのに対し、候補1はMeasure自体の構成方法に依存する）。
候補2は、Beat配列に依存せず経過時間だけで計算するため、
DownbeatとBeatの不一致問題そのものを回避できる可能性があるが、
Beat Model原則（間隔は一定でなくてよい）と組み合わせた場合の
精度は未検証
```

### Downbeat × Measure（前回の1/2/3を再掲・拡張）

```
1: Downbeat → Measure
2: Measure → Downbeat
3: 関連するが同一概念ではない

拡張論点:
  Downbeat = Measure start（値として同一）
  Downbeat ≠ Measure start（別の値でありうる）
  Downbeatは Measure startの証拠（evidence）の一つに過ぎない
  Measure startはDownbeatとは独立に構築される
  Downbeatが欠落する場合のMeasure構築の代替手段
  Downbeatが誤っている場合のMeasureへの影響
  Measureが欠落する場合（Downbeat自体は存在するがMeasure化されない）
  Measureが再構築される場合（repairRule適用等）
```

### 4者同時関係（Time Signatureを含む）

```
考えられる依存関係のパターン（列挙。採否は決めない）:

パターン1: 直列
  Time Signature → Beat → Downbeat → Measure
  （TSがBeatの粒度を決め、Beatの中からDownbeatが選ばれ、
  Downbeat間隔がMeasureを作る）

パターン2: Beat/Downbeatが並行入力
  Time Signature ─┐
  Beat ───────────┼→ Measure
  Downbeat ───────┘
  （3つの独立した情報源がMeasure構築に合流する。現在の
  buildMeasures()のfullモードは、実質的にこれに近い
  ——ただしTime Signatureはbeatcountラベルにのみ関与し
  境界決定には関与しない、という点で"合流"の度合いが
  情報源ごとに異なる）

パターン3: Downbeat中心・Time SignatureとBeatは検証用
  Downbeat → Measure（境界決定）
  Time Signature・Beat → Measureの"妥当性を検証"する
  補助情報（analyzeTiming()的な使われ方の一般化）

パターン4: モード依存（現状の実装に最も近い）
  Downbeatが使える場合: パターン1的でも2的でもなく、
    Downbeatが単独でMeasureを決め、TSはラベルのみ、
    Beatはさらに別の検証（quantizeTime内）にのみ使われる
  Downbeatが使えない場合: Time SignatureとBeatのみで
    Measureが決まる（パターン1に近い、Downbeat抜きの形）
```

---

## ③ Current Implementation Assumptions（総点検）

前回・前々回で発見済みの事実に加え、今回新たに洗い出したものを含む。

```
【データ形状・前処理】
  ・raw.beats/downbeatsはsanitizeTimestampsによりソート済み・
    重複除去済み・非負値のみ（Confirmed）
  ・非有限値（NaN/Infinity等）はフィルタされる想定
    （sanitizeTimestampsの型・範囲チェックに含まれる。前回同様の整理）

【閾値・モード切替】
  ・beats.length>=3、downbeats.length>=2という閾値のみで
    使用可否を判定（値の中身は見ない。Confirmed・再掲）
  ・Beat/Downbeatの個数同士の対応関係はチェックされない
    （今回新規指摘。例えばdownbeats個数がbeats個数に対して
    不自然に多い・少ない場合でも、それぞれの閾値さえ満たせば
    エラーにならない）

【Measure構築】
  ・beatCount=timeSignature.numerator固定・無条件（Confirmed・再掲）
  ・単一のglobal timeSignature（Confirmed・再掲）
  ・denominatorは計算未使用（Confirmed・再掲）
  ・最終Measureのend Time は audioDuration が無い場合
    startTime + beatsPerMeasure*0.5 という固定的なフォールバック値
    を使う（今回新規に明示。前回棚卸し時に発見していたが
    論点として未整理だった）

【quantizeTime内】
  ・measure.startTimeがbeats配列の要素と一致するという
    [ASSUMPTION]（Confirmed・再掲）
  ・beatInMeasureはbeatCountで頭打ちにされない
    （実際のBeat数がbeatCountと異なっていても、超過分を
    検知・制限する仕組みが無い。前回棚卸しの再掲）

【Playhead/getBeatPosition】
  ・quantizeTimeと同じ関数を使うため、上記のASSUMPTIONの脆弱性を
    そのまま継承する（Phase134由来の既存整理の再掲）

【診断ロジック】
  ・analyzeTimingは中央値ベースの期待値計算であり、正当な
    半分/倍テンポ区間（あるいは本物のTempo Change）を
    誤って"severe"と診断しうる（93baeafdで実際に発生済み）。
    これは診断ロジックの限界であり、Measure構築自体には
    影響しない、という切り分けは前回までに確認済み
```

---

## ④ Authority / Derived Boundary（候補の整理。決定しない）

```
raw.beats / raw.downbeats / timeSignature
  種別: Persistence Authority（保存データとしての正本。
        architecture.md [ANALYSIS AUTHORITY INVARIANT]で既に確立）
  ただし: これは「ストレージ上の正本」であることを意味するのみで、
        「音楽的に正しい」ことを意味しない。Persistence Authority
        とMusical Truthは別の軸であり、混同しないよう注意が必要
        （今回明示）

normalized.beats / normalized.downbeats
  種別: Derived Model（disposable derived cache。
        architecture.md既存原則で確立済み）
  現状raw.beats/downbeatsとほぼ同一（repair:falseが
  analysisLoader.jsにハードコードされているため。前々回確認済み）

Measure
  種別: 今回新たに明確になった重要な事実——Measureは
        raw.*のような永続化された値を一切持たない。
        常にbuildMeasures()によって都度計算される、
        完全なRuntime Projectionである
  この点、Beat/Downbeatには永続化された"正本"（raw.*）が
  存在するのに対し、Measureには存在しない、という非対称性が
  ある（今回新規に明示）

beatInMeasure
  種別: 完全なRuntime計算値（quantizeTime内でのみ存在。
        永続化なし。Derived Model）

visual Slot
  種別: Runtime Projection（architecture.md §9.5で既に確立済み）

playback position（Playhead）
  種別: 混合。基礎となる時刻（aEl.currentTime）はRuntime
        Authority（architecture.md §9「playback authority
        3層分離」で確立済み）だが、それをどのslotとして
        表示するかという離散化された表現は、UI Representation
        （§9.5のProjection）にあたる
```

### Musical Truth / Analytical Result / Derived Model / UI Representationの区別

```
今回明確になった構造上の事実: 現在のデータモデル全体を通じて、
「Musical Truth」を直接表現するフィールドは**どこにも存在しない**。

raw.* → Analytical Result（ChordMiniの検出結果。音楽的真実の
        主張ではなく、あくまで解析出力）
normalized → Derived Model
Measure/beatInMeasure/Slot → Derived Model / UI Representation

Musical Truthへ人間の判断を反映する唯一の経路はrepairRuleだが、
これも新しい「Musical Truth」というデータ種別を作るのではなく、
既存のraw隣接構造（analysis/{id}.jsonの一フィールド）に
補正指示として追記される形を取っている（既存アーキテクチャの
確認・今回の文脈での再整理）
```

---

## ⑤ Boundary Case Inventory（境界事例一覧）

| カテゴリ | 事例 | 現状の扱い |
|---|---|---|
| Rhythm/Beat | tempo change | Beat Model原則で許容 |
| | gradual tempo change | 許容対象だが実例未確認（Unknown） |
| | rubato | 許容対象 |
| | groove | 許容対象 |
| | swing | 影響範囲は未検討（Unknown・新規） |
| | half-time | 93baeafdの解釈候補の一つ（未確定） |
| | double-time | 同上 |
| | missing beat | quantizeTimeのASSUMPTION破れ・サイレントフォールバック |
| | extra beat | 検知・対処の仕組みなし（Unknown・新規） |
| | uneven beat | Beat Model原則の許容範囲内 |
| Downbeat | missing downbeat | beat-onlyへの明示的フォールバック（Confirmed） |
| | extra downbeat | 検知・対処の仕組みなし（Unknown・新規） |
| | wrong downbeat | 一致しない場合と同じ扱い |
| | downbeat≠beat | quantizeTimeのサイレントフォールバック |
| | downbeat between beats | 「一致しない」の具体例の一つ |
| | weak/ambiguous downbeat | confidence情報自体がデータ構造に無い |
| | 構造downbeat vs アクセント不一致 | ①②の不一致（前々回整理済み） |
| Measure | 3/4 | 単純拍子、大きな問題は想定されない（未検証） |
| | 4/4 | 17曲で検証済み |
| | 6/8, 9/8, 12/8 | [FIXME-6/8]既知・実データ未検証 |
| | irregular meter | 構造的に未対応 |
| | time signature change | 構造的に未対応（単一global値） |
| | pickup | 深掘り対象外（既存事実のみ保持） |
| | partial measure | pickupと未分化のまま扱われている |
| | missing measure boundary | downbeats一部欠落時の挙動は未検証（Unknown・新規） |
| | wrong measure boundary | 判定手段自体が無い |
| Data | empty arrays | fallback/beat-onlyへ（Confirmed） |
| | insufficient arrays | 同上（Confirmed） |
| | duplicated timestamps | sanitizeTimestampsで除去（Confirmed） |
| | unsorted timestamps | sanitizeTimestampsでソート（Confirmed） |
| | non-finite timestamps | フィルタされる想定（Confirmed） |
| | mismatched Beat/Downbeat counts | 対応関係は未チェック（今回新規指摘） |
| | inconsistent Time Signature | 表現手段自体が無い（構造的gap） |

---

## ⑥ Evidence Status（Fact / Interpretation / Hypothesis / Unknown）

```
Fact（確認済みの事実）:
  ・17曲すべて4/4、DownbeatはBeat要素と完全一致、Downbeat間は
    常に4 Beat（93baeafdの異常区間内でも維持）
  ・raw.beats/downbeatsは時刻配列のみでconfidence等の付随情報を
    持たない
  ・buildMeasures()のfull/beat-onlyモードは異なる構築ロジックを持つ
  ・quantizeTimeのASSUMPTIONは実装上の都合であり、音楽的仕様でも
    データ契約でもない（コード内コメント自体がこれを示唆）
  ・denominatorは現状計算に未使用
  ・Measureは永続化されず、常に都度計算される（今回新規確認）
  ・「瞳をとじて」は再解析でも完全に同一の特徴が再現した

Interpretation（解釈・未確定）:
  ・93baeafd前半が検出漏れ（A）か音楽的構造変化（B）か
  ・「Downbeat間=numerator個のBeat」がChordMiniの構造的保証か
    偶然の一致か

Hypothesis（仮説）:
  ・6/8等の複合拍子でnumeratorの解釈がずれる可能性
  ・拍子変更曲での構造的な非対応が実害を生む可能性

Unknown（未確認）:
  ・3/4/6/8/12/8/拍子変更での実データ検証
  ・extra beat/extra downbeatの実在
  ・ChordMini/madmomの内部動作
  ・93baeafd中間点の音源照合結果（Candidate B未実施）
```

---

## ⑦ Decision Dependency Map（提案。実際の依存関係は今回の探索結果に基づく）

```
Beat定義（現状ほぼ安定・軽微な未決事項のみ残る）
      │
      ├──→ Beat×Downbeat関係（A/B/C）───┐
      │                                  │
      ├──→ Downbeat×Measure関係（1/2/3）─┤
      │                                  ▼
      │                    full/beat-onlyモードを単一モデルの
      │                    異なる経路とみなすか、明示的に
      │                    2モデル体制として受け入れるか
      │                                  │
      ├──→ Time Signatureの役割          │
      │    （定義／検証／UI表示の使い分け）  │
      │                                  ▼
      └──→ beatInMeasureのAuthority     Measure Model確定
           （位置／時間／検索ベース）      （4つの観点の統一方針含む）
                    │                     │
                    └─────────┬───────────┘
                               ▼
                          Slot Model
                               │
                               ▼
                   Playhead/Cursor実装改善
                （Issue #109。ただし独立調査も並行可能）
```

**注記**: この依存図はあくまで今回の探索から見えてきた"推定"であり、
確定した設計手順ではない。特にPlayhead/Cursor改善は、Slot Model
確定を待たずに独立した観察・実験（Candidate A/B）を並行して
進められる、という位置づけは維持する（既存のIssue #109分離方針
と矛盾しない）。

---

## ⑧ Must Decide / Can Defer / Future Feature / Observation Needed / Separate Issue

```
Must Decide Before Technical Design（技術設計前に決める必要が高い）:
  ・Beat×Downbeat関係（A/B/C）
  ・Downbeat×Measure関係（1/2/3）
  ・full/beat-onlyモードを統一するか、2モデル体制を正式に
    受け入れるか
  ・beatInMeasureのAuthority（位置／時間／検索ベース）

Can Defer（Technical Design後でも決められる可能性）:
  ・denominatorの具体的な使い道（複合拍子対応の詳細）
  ・Pickup Measureの厳密な定義（候補X/Y/Z。現状0件検出のため
    緊急性が低い）
  ・Downbeat/Beatのconfidence表現の追加

Future Feature（現時点では将来構想として扱える）:
  ・拍子変更（Time Signature Change）対応
  ・複合拍子（6/8, 9/8, 12/8）の正式対応
  ・加算拍子・不規則拍子対応

Observation Needed（追加データ・実験が必要）:
  ・3/4・6/8・12/8の実データ検証（サンプル自体が無い）
  ・Downbeat間隔≠numeratorとなる実例の有無
  ・extra beat/extra downbeatの実例の有無
  ・93baeafdのA/B仮説検証（音源照合。Candidate B未実施のまま）

Separate Issue（今回のモデルから切り離す）:
  ・Beat Cursor問題（Issue #109）
  ・Pickup Measureの詳細設計
```

この分類自体もClaudeの判断による提案であり、最終決定ではない。

---

## ⑨ 最終サマリー

```
Technical Designへ進む前に、最低限確定しなければならないこと:
  1. Beat×Downbeat関係（A/B/C）
  2. Downbeat×Measure関係（1/2/3）
  3. full/beat-onlyモードの統一方針（1モデルの異なる経路か、
     2モデル体制の正式受容か）
  4. beatInMeasureのAuthority

まだ確定しなくてもTechnical Designへ進めると考えられること:
  ・複合拍子・拍子変更対応（Future Featureとして先送り可能。
    今回のサンプルにも実例が存在しないため）
  ・Pickup Measureの厳密な定義（現状のヒューリスティックのまま
    当面進められる。検出0件という低頻度の事実に基づく）
  ・confidence表現の追加（データ構造拡張は後からでも可能）

今回の探索全体を通じて最も重要だと考えられる発見（前回までの
整理の集大成）:
  現在の実装は、単一の一貫したBeat/Downbeat/Measure Modelに
  基づいて設計されたものではなく、機能追加のたびに個別の判断が
  積み重なった結果、複数の異なるモデルの断片（B×1的な構築・
  A×2的なフォールバック・quantizeTime内の独自の期待）が
  意図せず共存している状態にある。Technical Designへ進む際の
  最初の分岐点は、「この断片の混在を許容したまま設計するか」
  「単一の一貫したモデルへ統一するか」という、個々の論点以前の
  上位方針の選択である。
```
