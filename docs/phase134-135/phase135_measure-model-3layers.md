# Phase135続き — Measure Modelの3レイヤー整理
（Musical / Analytical / Product-UI Measure）

> Measureを実装する段階ではない。3つの概念を区別し、それぞれが
> Beat・Downbeat・Time Signatureとどう関係するかを明らかにする段階。
> 「どれを採用すべきか」の結論は出さない。

---

## 1. Musical Measure（音楽的な小節）

```
Beatとの関係:
  慣習的には「Measure = 一定数のBeatのまとまり」だが、この
  「一定数」自体が絶対法則ではなく、記譜上の慣習・選択である。
  同じ音楽を「3/4を2小節」と書いても「6/4を1小節」と書いても、
  響き自体は変わらない――Measureの境界線の引き方自体に、
  ある程度の記譜上の恣意性が含まれる

Downbeatとの関係:
  前回整理した①構造・②アクセント・③聴感のどの意味のDownbeatを
  境界とするかで、Musical Measureの区切り方が変わりうる
  （前回の論点M-2そのもの）

Time Signatureとの関係:
  Time Signatureは「Measureに何拍入るか・1拍は何分音符相当か」を
  宣言する記譜上の約束事。ただし、実際に感じられる拍節（felt meter）
  が記譜と食い違う音楽的現象（ヘミオラ等）も存在し、Time Signature
  は「実態の完全な記述」ではなく「近似的な宣言」である場合がある

小節内のBeat数:
  西洋のポピュラー音楽・クラシックの多くは「曲を通して一定」だが、
  これは音楽全般の普遍法則ではない。加算拍子（Additive meter。
  例: 7/8, 5/4のような、曲を通して意図的にBeat数を変え続ける音楽）
  では、小節ごとにBeat数が変わること自体が作曲上の手法である

変拍子:
  曲の途中でTime Signature自体が変わる（拍子変更）ことは
  音楽的に珍しくない。この場合、Musical Measureの「長さ」
  （Beat数の単位で）も曲中で変化する

複合拍子（6/8等）:
  「Beatとは何か」自体が曖昧になる。6/8のBeatを「8分音符6つ」と
  見るか「付点4分音符2つ（各々3分割）」と見るかで、1 Measure内の
  Beat数の数え方（6 vs 2）が変わる。これはBeat自体の粒度が
  Measure・Time Signatureの文脈に依存することを示す
  （§8 Feedback to Beat Modelで後述）

Pickup Measure（弱起小節）:
  完全なBeat数に満たない小節が曲頭（または楽節頭）に存在する
  という、記譜上ほぼ普遍的に見られる現象。「小節」という単位の
  例外ケースというより、「Beatの数え始めが、Measureの区切りより
  先に始まる」という、MeasureとBeatの数え方のズレそのものを
  表現する概念だと言える

Tempo Change / Grooveの影響:
  Measureの「実時間での長さ（秒）」と「Beat数（拍子が定める整数）」
  は独立した別の軸である。Beat間隔が変化すれば（Beat Modelで
  既に確認済みの通り）、Beat数が一定でもMeasureの実時間長は
  変化する。これは異常ではなく、当然の帰結である
```

**論点整理（新規）**: Musical Measureは、①「Beat数という整数の
まとまり」という側面と、②「実時間上でどれだけ続くか」という
側面の、2つの独立した軸を持つ。この2軸を分けて考えないと、
「小節が長い/短い」という表現が、拍数の話なのか秒数の話なのか
曖昧になる。

---

## 2. Analytical Measure（解析上の小節）

ChordMiniの出力（`raw.beats` / `raw.downbeats` / `raw.timeSignature` /
`raw.bpm`）から、CreateChordScoreが「ここからここまでを1小節」と
判断する際の概念。

### 核心の論点: DownbeatはMeasureの「境界情報」か「特別なBeat」か

```
立場1（境界情報として使う）:
  Downbeat（独立して検出された時刻の配列）が、そのままMeasureの
  区切り線になる。Beatを数えてMeasureを作るのではなく、
  Downbeatという別種の情報から直接Measureの形を決める

立場2（特別なBeatとして扱う）:
  まずBeatの列があり、その中で「小節の先頭にあたるBeat」に
  Downbeatというラベルを付ける、という考え方。Downbeat単独では
  Measureを作らず、あくまでBeat列の一部という位置づけになる
```

**現在の実装は、この2つの立場を混在させている（事実）**。

```
buildMeasures()のfullモードは、立場1をそのまま採用している
  （downbeats[i]を直接measure.startTimeとして使う。beatsを
  数えてdownbeatを導き出しているわけではない）

一方、quantizeTime()の[ASSUMPTION]（前回確認済み）は、
  「measure.startTimeは必ずbeats配列のどこかの要素と一致する」
  という前提を置いており、これは立場2（Downbeatはbeatsの一部で
  あるべき）の期待を暗黙に持ち込んでいる

つまり: Downbeatを「作る」段階（buildMeasures）は立場1、
Downbeatを「使う」段階（quantizeTime）は立場2の期待を持つ、
という一貫していない構造になっている（前回棚卸しで発見した
[ASSUMPTION]の危うさは、この立場の不一致に起因していたと言える）
```

### 核心の論点: timeSignature.numeratorは「定義」か「検証対象」か

```
buildMeasures()のfullモードでは、beatCountは
timeSignature.numeratorをそのまま代入するだけであり、
実際にそのMeasure内に何個のbeatsがあるかを数えて確認していない
（＝「定義」として使っている）

一方、analyzeTiming()（診断専用）は、beatsの中央値間隔×
timeSignature.numeratorという「期待される小節長」を計算し、
実際のdownbeat間隔とのズレを診断する（＝「検証」として使っている）

この2つの使い方が、同じコードベースの中に共存している
（前回棚卸しで確認済みの事実の再掲・整理）
```

---

## 3. Product / UI Measure（CreateChordScore上の小節）

ユーザーがChart Modeで「1小節」として認識・編集する単位。

**核心の問い（ご指定）**: Musical MeasureとProduct/UI Measureは
常に完全一致する必要があるか？

これはまだ結論を出さず、候補を並べる。

```
候補P1: Product Measure = Analytical Measureをそのまま採用
  現在の実装の実態に近い（buildMeasures()の出力がそのまま
  Chart Modeの小節グリッドになる）。Analytical Measureが
  Musical Measureの近似として十分であれば、この一致で問題ない

候補P2: Product Measure = Analytical Measure + 人間による修正
  現在のrepairRule（anchorDownbeat方式）は、まさにこの候補に
  相当する仕組みとして既に存在する。ユーザーが「ここが本当の
  小節頭のはず」と判断した場合、Analytical Measureをそのまま
  使わず、人間の音楽的判断（Musical Measureへのアクセス）を
  Product Measureへ反映する経路が既にある

候補P3: Product MeasureはMusical Measureと意図的に一致しない
  編集上の実用性を優先する
  例えば「実際の音楽的な区切りがどうであれ、画面には常に
  N拍ごとのグリッドを表示する」というような、Musical Measureの
  忠実な再現を最初から目指さない設計もありうる（現在は
  採用されていないが、候補として排除しない）
```

**重要**: 候補P2（repairRule）が既に存在するという事実は、
「Product MeasureはAnalytical Measureに対して独立に修正されうる」
という設計判断が、既に部分的に実装として存在していることを示す。
ただしこれは「Product = Musical」を目指した結果なのか、
「Analytical Measureの検出誤りを補正したいだけ」なのかは、
まだ明確に整理されていない（後述§4で扱う）。

---

## 4. 3レイヤーの関係（複数の候補形）

ご提示いただいた2つの形に加え、3つ目の候補も追加して整理する。

### 形1: 線形パイプライン

```
Musical Measure
      │  ChordMiniによる近似
      ▼
Analytical Measure
      │  CreateChordScoreによる取り込み・修正
      ▼
Product / UI Measure
```

「真のMusical Measureを、検出→表示という2段階でどんどん近似して
いく」という考え方。直感的で分かりやすいが、「修正（repairRule）」
がどこに位置するかが曖昧になる（Analytical Measureの内部で
修正されるのか、Product Measureの段階で別途修正されるのか）。

### 形2: 並行して合流する形

```
Musical Measure ─────┐
                     ├→ Product / UI Measure
Analytical Measure ──┘
```

「AnalyticalはAIによる推定、MusicalはUser（人間）の判断」という
2つの独立した情報源が、Product Measureの段階で合流する、という
考え方。**現在のrepairRuleの実際の使われ方（ユーザーが実際に
聴いて「ここが小節頭のはず」と判断し、Analytical Measureの
結果を上書きする）は、この形2に近い**。ユーザーの音楽的判断
（Musical Measureへの人間側のアクセス）が、Analyticalを経由せず
Product Measureへ直接反映されている、と解釈できる。

### 形3（新規候補）: Product Measureを独立した運用レイヤーとして扱う

```
Musical Measure         Analytical Measure
   （音楽理論・聴感の対象）  （AI検出結果）
        ↓ 情報提供           ↓ 情報提供
              Product / UI Measure
        （編集・保存・Undo履歴の対象となる、
         実務上唯一の「確定した」小節）
```

形1・形2との違いは、「Product MeasureがMusical/Analyticalの
"近似"である」という前提そのものを置かない点にある。Product
Measureは、それ自体が実務上のoperational（運用上の）決定であり、
Musical・Analyticalはその判断材料の提供元に過ぎない、という
捉え方。既存のUndo履歴・永続化の対象が常にProduct Measure相当の
確定値である（Musical Measureという「揺れ動く音楽的実在」を
直接保存できるわけではない）という実務上の制約とは整合しやすい。

**結論は出さない**。ただし、既存のrepairRule機構の存在は、
少なくとも形1（単純な一方向パイプライン）だけでは現状を
説明しきれないことを示す、という点は指摘できる。

---

## 5. Downbeatの3レイヤー対応

前回整理した①構造・②アクセント・③聴感の3側面を、
今回の3レイヤーに対応させる。

```
Musical Downbeat
  ①②③すべてを含みうる（前回整理の通り）

Analytical Downbeat（raw.downbeats）
  ①（構造上の位置）に近いものを検出しようとしていると
  推測されるが、madmomの内部設計はこのリポジトリからは
  確認できず、Unknownのまま（Phase134 §Dで既出）
  ②（演奏上のアクセント強度）を表す情報は、raw.downbeatsという
  「時刻の配列」というデータ形状そのものに含まれていない
  （音量・強度等の付随情報は無い。データ構造上、②を表現する
  手段が無いことは、コード確認により確認できる事実）
  ③（聴感上の着地）は、そもそも自動検出が対象にできる性質の
  ものではない（主観的な知覚のため）

Product/UI Measure Boundary（measure.startTime）
  現在の実装（fullモード）では、これは Analytical Downbeat の
  値をそのままコピーしたものであり、両者の間に独立した
  「Product/UI Measure Boundary」という中間概念は存在しない
  （§2の立場1がそのままProduct層まで貫通している、と言い換えられる）

  ただしrepairRuleが適用された場合のみ、Product/UI Measure
  Boundaryの値はAnalytical Downbeatの値と乖離しうる
  （§4形2のような、人間の判断が割り込む唯一の経路）
```

**整理**: 現状、「Analytical Downbeat」と「Product/UI Measure
Boundary」は、repairRule適用時を除いてほぼ同一の値であり、
概念として明示的に分離されていない。これは実装上の事実であり、
分離されているべきだったという評価ではない。

---

## 6. 現在の実装との対応（確認事項の再掲・前提として受領）

いただいた事実（`buildMeasures()`のfull/beat-onlyモード、
`beatCount = timeSignature.numerator`、`denominator`が計算に
未使用、Pickup Measureの構造的な扱い）は、前回棚卸しの内容と
完全に一致しており、そのまま前提として受け取った。

---

## 7. 核心の問い: Measureは何によって存在が決まるのか（候補A〜D）

### A. Time SignatureがMeasureを定義する

```
Time Signature → Measure → Beat
```

**長所**: 単純・決定的。Time Signatureが変わらず、検出が安定して
いる曲では素直に機能する。

**問題点**: Time Signatureの情報単体では、実時間上のどこに
Measureの境界を置くべきかを決められない（「4拍で1小節」という
ルールだけでは、実際の秒数に投影するにはテンポ情報・アンカー
となる時刻が別途必要になる）。したがって純粋な形のAは、
実際には単独で完結せず、何らかの形でBeat/Downbeat（アンカー）と
組み合わさらざるを得ない。

**前提条件**: Time Signature・テンポが曲中で一定であること
（変拍子・テンポ変化に弱い）。

### B. BeatとDownbeatからMeasureを推定する

```
Detected Beat
Detected Downbeat
      ↓
Measure
```

**長所**: 実際に観測されたデータに直接基づくため、テンポの揺れ・
Rubato等に頑健（Beat Modelの「等間隔を要求しない」という原則と
相性が良い）。現在の実装（fullモード）はこの形に近い。

**問題点**: 検出結果（Beat/Downbeat）自体が誤っていた場合、
Measureはその誤りをそのまま継承する。Time Signatureという
独立した情報を検算・妥当性確認に使えていない
（現状はanalyzeTiming()の診断機能に限定されており、
Measure構築自体には反映されない）。

### C. Musical Measureを解析結果から段階的に近似する

```
Musical concept → ChordMini detection → Analytical Measure → Product Measure
```

**長所**: 「最終的に何を表現したいか」という目標を見失わない、
という点で有用な指針になる。§4の形1と同じ構造。

**問題点**: これは計算手順（アルゴリズム）ではなく、あくまで
方針・目標設定に近い。「どう近似するか」を何も答えていない。
また、repairRule（人間の修正）がこのパイプラインのどこに
位置するのかを、この形だけでは説明しきれない
（§4で既出の指摘の再掲）。

### D. 単純な上下関係にしない

```
Musical / Analytical / Product Measureは、それぞれ別の目的を持つ
別々の概念であり、1つの「真の実体」への近似の連鎖として
無理に統一しない、という考え方
```

**長所**: 音楽そのものに内在する曖昧さ（記譜の恣意性・聴取者間の
知覚のズレ等、前回整理したDownbeatの3側面の対立）を、無理に
単一の「正解」へ収束させようとしない誠実さがある。repairRuleの
存在（§4形2・形3）とも整合しやすい。

**問題点**: 「では実際に保存・Undo履歴の対象になる値は何なのか」
という実務上の要請には、Dの考え方だけでは答えられない。
どこかで単一の確定値（Product Measure相当）が必要になることは、
Musical/Analyticalを何レイヤーに分けようと変わらない。

---

## Confirmed（確認済み）

```
・§6に列挙した既存実装の事実（前回棚卸しの内容）をそのまま前提とした
・現在の実装は、DownbeatをMeasure構築時には「境界情報」として
  使うが（buildMeasures）、Measure内部での利用時には「beats配列の
  一部であるはず」という期待（[ASSUMPTION]）を持っており、
  一貫していない（§2で新たに明示した整理）
・timeSignature.numeratorは、buildMeasures()では「定義」として、
  analyzeTiming()では「検証」として、異なる使われ方をしている
  （§2で整理）
・repairRule機構は、既にAnalytical MeasureとProduct/UI Measureの
  値が乖離しうる、唯一の実装済み経路である（§4・§5）
```

## Decision（決定事項）

```
Decisionなし。
```

## Unknown（未確定）

```
・Musical Measureの2つの側面（Beat数という整数の軸／実時間長という
  連続値の軸）を、CreateChordScoreがどちらを優先して扱うべきか
・DownbeatをMeasure構築の「境界情報」として扱うか「特別なBeat」
  として扱うかの一貫した立場
・timeSignature.numeratorを「定義」として扱うか「検証対象」として
  扱うかの一貫した立場
・§4の形1/形2/形3のうち、どれがCreateChordScoreの実態・目指す方向に
  最も近いか
・候補A/B/C/Dのうち、どれを採用するか（あるいは複数を併用するか）
・Musical MeasureとProduct/UI Measureが常に一致する必要があるか
  （§3候補P1/P2/P3のどれを採るか）
```

## Interpretation（解釈。断定ではない）

```
・repairRule機構が既に存在するという事実は、この設計がすでに
  暗黙のうちに「Analytical Measureは無条件に信頼しない」という
  立場（§4形2または形3）を部分的に採用していることを示唆する。
  ただし、これが意図的な設計判断としてそうなっていたのか、
  単に「検出ミスの補正手段」として個別に追加されただけなのかは、
  既存のhandover記録からは明確に読み取れない
```

## Feedback to Beat Model

```
既存の論点（再掲。忘れずに記録）:
  「1つのMeasureに含まれるBeat個数は常に一定なのか？」

新たに見つかった論点:
  ・複合拍子（6/8等）の検討により、「Beatの粒度そのものが
    Measure/Time Signatureの文脈に依存しうる」ことが明確になった。
    Beat Modelの作業定義（楽曲のリズムを構成する時間上の基本的な
    区切り）は、この「粒度がMeasureの文脈に依存する」という
    可能性にまだ触れていない。次にBeat Modelへ戻る際、
    「Beatという概念が、常に曲を通して同じ粒度を指すのか」という
    論点を追加で検討する必要がある

  ・（確認・明確化であり新しい問題ではない）Measureの実時間長が
    曲中で変化すること自体は、Beat間隔が変化しうるというBeat
    Modelの既存原則から当然導かれる帰結であり、Measure Model側で
    新たに問題視する必要はない、と整理できる
```

---

## 次に決めるべきことの優先順位（提案。Decisionではない）

```
1. Downbeatを「境界情報」として扱うか「特別なBeat」として扱うか
   （§2の立場1/2の一貫性を取ることが、他の論点の土台になるため
   最優先候補）

2. §4の3レイヤーの関係形（形1/形2/形3）のうち、どれが実態に
   近いかの整理（repairRuleの位置づけを明確にする上で必要）

3. Musical MeasureとProduct/UI Measureが常に一致する必要が
   あるか（§3候補P1/P2/P3）

4. timeSignature.numeratorの「定義」／「検証」のどちらの立場を
   一貫して採るか

5. 複合拍子・変拍子・加算拍子のような、今回のサンプル曲には
   存在しない音楽的ケースを、いつ・どの段階で検討対象に含めるか
```

上記の順序・要否は提案であり、確認いただくまでDecisionとしません。
