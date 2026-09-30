# CreateChordScore Phase135 引き継ぎメモ（最終版）
## Beat / Downbeat / Measure Model 整理 — 完了報告
作成日: 2026-09-17

> 本ファイルは、アップロードされた前回ドラフト（2026-09-16時点）を
> 下地とし、その後の追加調査（`beatCount`未使用の確認・`confidence`の
> 実利用箇所確認・Pickup Measureの扱い確認・最小Measure Modelの
> 確定）を反映した最終版。**このファイル単体で、次のChat/Claudeが
> 「何を調べたか」「何が事実か」「何を決めたか」「何をまだ決めて
> いないか」「次に何をするか」を理解できることを目標とする。**

---

## 1. Phase135の目的

Phase134（Slot Model探索）の途中で、「Slot（拍を画面上でどう細かく
扱うか）を決める前に、そもそもBeat（拍）とは何かが整理されていない」
という課題が見つかり、Phase135として以下の関係整理に着手した。

```
Beat（拍）
  ↓
Downbeat（小節開始位置の候補）
  ↓
Measure Boundary Estimation（小節境界推定）
  ↓
Measure（小節）
  ↓
Slot（拍をさらに細かく扱う単位）
```

**目的だったこと**: Beat・Downbeat・Measureの概念的な関係を整理し、
CreateChordScoreが内部で扱う「最小限のMeasure Model」を確定すること。

**目的ではなかったこと**: Collision（Chart Mode上の衝突表示）や
Slot Allocation（拍の配分アルゴリズム）を具体的に決めること。
これらはSlot Model確定後の、さらに先の課題として意図的に切り離した。

---

## 2. これまでのFact Check（確認済みの事実）

### Beat

```
・raw.beats は ChordMini（madmom detector）が出力する、時刻の
  配列。CreateChordScore にとって Detected Beat（検出Beat）に
  あたる
・Musical Beat（CreateChordScoreが最終的に扱いたい音楽上のBeat）
  とは区別する。現時点の方針は「Detected Beatを基本的に信頼するが、
  明らかな異常があれば修正対象とする」というもの。ただし
  「明らかな異常」の判定基準はまだ定義していない
・BPM（raw.bpm）だけからBeatの正しさを定義する一般則は作らない
・raw.beats は Authority（正本）として変更しない。修正が必要な
  場合は別の仕組み（repairRule等）で表現する
```

### 「瞳をとじて」（93baeafd / b8fbb1c3）

```
・約173.8秒を境に、Beat間隔が約0.85秒→約0.43秒へ急変する
・ChordMiniの再実行でも、beats・downbeats・chordsすべてが
  完全に同一の結果として再現した（596 Beat / 149 Downbeat /
  BPM 136.364 / 4/4）
・約173.8秒付近には、転調・構成の変わり目・ドラムフィル・
  ダイナミクス変化のいずれも聴感上確認できなかった
・ドラムは約97秒（1番サビ）から参入しているが、そこではBeat間隔に
  変化が無かった。編成の厚みとBeat間隔変化は対応していない
・原因（ChordMini側の検出特性か、音楽的な構造変化か）は
  現時点でも未確定のまま。単一曲への個別補正は行っていない
・GitHub Issue #109（Beat Cursorが曲途中でテンポが大きく変わって
  見えるケースの横断調査）として切り出し済み。Beat Modelの定義
  問題とは分離して扱う
```

### Downbeat

```
・raw.downbeats はtimestampの配列（時刻の羅列のみ）
・Downbeatには少なくとも3つの側面がある:
    ①構造上の位置（拍子が定める小節の先頭）
    ②演奏上のアクセント（実際に強く演奏される拍）
    ③聴感上の着地点（聴き手が「ここで一区切り」と感じる位置）
  raw.downbeatsという時刻配列のデータ構造は①のみ表現可能。
  ②（音量・強度）③（主観的知覚）は原理的に表現できない
    （raw.chordsにはconfidenceフィールドがあるが、raw.beats /
    raw.downbeatsには存在しない、というデータ構造上の非対称性を
    確認済み）
・ChordMiniのraw.downbeatsが①②③のどれを検出しようとしているかは
  このRepositoryだけからは確認できない（Unknown・維持）
・DownbeatとBeatは、同じ時刻を指すことがあっても、概念として
  同一とは限らない（timestamp equality ≠ conceptual identity）
・17曲＋追加確認2曲（計19曲）の実データでは、Downbeatはすべて
  raw.beatsの要素と完全一致していた。ただしこれは観測事実であり、
  普遍的な音楽理論やChordMiniのデータ契約としては確定していない
```

### Measure

```
・現在の実装（timing.js: buildMeasures()）は、Downbeatが十分に
  ある場合（fullモード）はDownbeatを直接Measure境界として使い、
  無い場合（beat-onlyモード）はBeat配列をtimeSignature.numerator
  個ずつ機械的にグループ化する
・fullとbeat-onlyのMeasureオブジェクトは、データの形（
  { startTime, endTime, beatCount, confidence }）としては完全に
  同一。ただし下流の扱いには差がある（後述）
・beat-onlyのグルーピングは、beats[0]から無条件に開始し
  （Pickupを考慮しない）、実際のBeat間隔（疎密）を一切見ず、
  配列のインデックスのみでN個ずつ区切る。最後に余ったグループにも
  beatCount = numerator という誤ったラベルがそのまま入る
・したがって「Measure = numerator個のBeat」は、現在の実装が
  採用している暫定的な区切り方法であって、CreateChordScoreの
  Product Invariant（製品上の不変条件）としては確定していない
```

### `beatCount`（今回の追加調査で判明した事実）

```
・buildMeasures()の2箇所（full/beat-onlyそれぞれ）で書き込まれる
・しかし、実行コード上でこの値を読み取っている箇所は
  1つも存在しない（JSDocの型注釈以外、参照ゼロ）
・timing.js内のコメントに、過去は「measures[mi].beatCountの
  積み上げで逆算していた」が「beatCountの積み上げは行わない
  （measuresが唯一のauthority）」へ変更した経緯が明記されている
・つまりコードベースは、既に一度「beatCountに頼らない」方向へ
  移行した実績を持つ
・結論: beatCountをMeasureの必須属性から外しても、現在の実装動作
  には一切影響しない
```

### `confidence`（今回の追加調査で判明した事実）

```
・実際に読み取られている: GridViewModel構築時にmeasure.confidence
  がコピーされ、data-confidence属性を経て、CSSクラス
  chart-measure--estimated（枠線を破線にするだけの、控えめな
  視覚表現）に反映される
・したがって、現時点でこのフィールドを完全に削除すると、
  「推定された小節」を見た目で区別する現在の表現が失われる
・ただし"high"/"estimated"という値の意味そのものは、Phase135では
  厳密に定義していない（「Downbeatから作ったか、Beatから
  推定したか」という生成経路の違いを示すラベル以上の意味は、
  現状のコードには無い）
```

---

## 3. Downbeatがない場合の情報源（棚卸し。判断はしていない）

```
【現在利用可能・接続済み】
  ・raw.beats
  ・timeSignature.numerator

【存在するが、現在のbeat-only境界推定には未接続または限定的】
  ・timeSignature.denominator（denominatorは計算に一切
    使われず、ヘッダーの表示文字列にのみ使用）
  ・audioDuration（最後のMeasureの終了時刻のフォールバック
    計算にのみ限定利用）
  ・raw.bpm（createTimingModel()の引数リストに含まれておらず、
    Measure構築に一切渡っていない）
  ・raw.chords（同様にMeasure構築には渡っていない）
  ・Beat interval regularity（beats[i+1]-beats[i]から計算可能
    だが、beat-onlyのグルーピングはこれを一切見ない）
  ・単一Downbeat（downbeatsが1個しか検出されない場合、
    isDownbeatsUsable()の閾値（2個以上）を満たさず、
    この1個の情報は完全に無視される）
  ・repairRule（仕組みとしては存在するが、mode判定は
    repair適用"前"のdownbeatsで行われ、かつbeat-onlyの
    Measure構築処理自体がdownbeats引数を参照しないため、
    現状このパスには構造的に届かない）
  ・analyzeTiming()が計算する期待Measure長（中央値ベースの
    診断値。診断専用の別経路として存在し、Measure構築には
    接続されていない）

【現在のデータモデルには存在しない】
  ・Beat/Downbeatの強さ・confidence（raw.chordsには
    confidenceがあるが、raw.beats/raw.downbeatsには無い）
  ・独立したphrase/harmonic structureの境界情報
  ・曲中のtime signature change（単一のglobal値のみ保持）
  ・6/8等のcompound-meter semantics（複合拍子特有の意味づけ）
  ・waveformを使った分析情報（音響信号そのものはこのパイプライン
    に含まれない）
```

---

## 4. Pickup（弱起小節）

```
・Pickupは現在Measure Modelの属性ではない（Measureオブジェクト
  自体にPickup用フィールドは存在しない）
・detectPickupMeasure()による後段の判定処理であり、
  _renderChartGrid()（描画関数）内でその都度計算されるローカル
  変数として存在する（生成時ではなく、表示/layout correction
  の段階で扱われている）
・判定基準はBeat数ではなく、Measureの実時間の長さ（duration）の
  統計のみ
・beat-onlyモードではPickup visual compression（視覚圧縮表示）を
  適用しない（コード内コメントで明示的に「別issue」と記載）
・Quantize・Playhead・Collision等の主要機能は、Pickup属性を
  Measure自身が持たなくても、現に正常に成立している
・以上より、PhaseではPickupをMeasure Modelの必須属性にしない
```

---

## 5. Phase135で確定した最小Measure Model（最重要）

```javascript
{
  startTime,   // 必須
  endTime,     // 必須
  confidence,  // 現在のUI表示（破線表示）で使われるため残す。
               // ただし値の厳密な意味はPhase135では固定しない
}
```

概念上の核:

```
Measure = startTimeからendTimeまでの時間区間
```

各要素の位置づけ:

```
startTime       必須。Confirmed（現在のコードで実際に消費されている）
endTime         必須。Confirmed（detectPickupMeasure() / click seek
                の両方で実際に消費されていることを確認済み）
confidence      残す。ただし意味は厳密に固定しない
beatCount       Measureの本質的・必須属性ではない
                （書き込まれるが読み取られない。前回調査で確認済み）
Beat配列        Measure自身には持たせない
                （Beat ∈ Measure という時間的関係から導出できる、
                という考え方を採る）
Downbeat        Measure自身の属性ではない。境界推定に利用する
                「強い手掛かり」という位置づけ
Pickup          Measureの必須属性ではない（§4参照）
Time Signature  Measure自身の必須属性ではない
```

**この最小モデルが答えているのは「Measureが何の形をしているか」
だけであり、「そのstartTime/endTimeを何を根拠に決めるか」
（Measure Boundary Estimation）には一切答えていない。** この区別が
Phase135全体を通じて最も重要な切り分けである。

---

## 6. 責務分離（概念モデル）

```
Beat
  ↓
Measure Boundary Estimation（小節境界推定）
  ↓
Measure
```

```
・Beat = 時間上の基本的な区切り／時間上の点
・Downbeat = Measure境界を推定するための強い手掛かり
  （Measureそのものではない）
・Measure = startTime〜endTimeの時間区間
・DownbeatとBeatはtimestampが一致する場合があっても、
  概念上同一とは限らない
・MeasureがBeatを直接所有する、ともPhase135では決めていない
  （「このBeatはこのMeasureの範囲に含まれる」という関係は、
  時間的な包含関係から都度導出できる、という考え方を採る）
```

これは既存の設計原則（architecture.md）における

```
Authority（正本） → Projection（導出） → Rendering（描画）
```

という考え方と自然に整合する。Beatが正本（Authority）であり、
「どのBeatがどのMeasureに属するか」という所属関係は、毎回そこから
導出される一時的な計算結果（Projection）として扱える。

---

## 7. Phase135で意図的に決めていないこと（次Phaseへ持ち越し）

以下はPhase135を再び無限調査に戻すための一覧ではなく、
「Measureの形は決まったので、次のTechnical Designの中で扱う」
という前提の一覧である。

```
・Downbeatありの場合のMeasure境界生成の具体的な確定方式
  （現行のDownbeatをそのまま信頼する方式で進めるか、Beatとの
  整合確認を挟むか、というA-1/A-2/A-3の選択は未確定のまま）
・Downbeatなしの場合のMeasure Boundary Estimation
  （現行のnumerator個ずつのグルーピングを製品仕様として正式採用
  するか、別の方法にするかは未確定）
・6/8, 9/8, 12/8, 3/4, 曲中の拍子変更（Time Signature Change）
  （現在のサンプルには実例が無く、理論的な検討のみで実証されて
  いない。Future Featureとして保留）
・Beat欠落・過剰検出時の扱い
・Downbeat不一致時の補正・警告の実装
・Slot Model（Beat/Measure確定後の、さらに先の課題）
・Collision（GitHub Issue #94）・Slot Allocation Algorithm
・Playhead/Beat Cursor問題（GitHub Issue #109。独立調査）
```

これらは「全部調査してから次へ進む」という意味ではなく、
実際に必要になった段階でそれぞれ個別に着手すればよい、という
位置づけである。

---

## 8. Phase135終了判定

```
今回決まったこと:
  Measureが「何の形をしているか」
  → { startTime, endTime, confidence } という最小モデルとして確定

まだ決まっていないこと:
  そのstartTime/endTimeを「何を根拠に決定するか」
  （Measure Boundary Estimationのアルゴリズムそのもの）
```

この2つは明確に別のレイヤーの問題であり、前者（形）が決まった
ことをもって、Phase135はここで区切ってよいと判断する。

**次Phaseは Phase136: Measure Boundary / Timing Technical Design
（仮）として、確定したMeasure最小モデルを前提に、Measure境界を
どのように生成するかをTechnical Designとして検討するところから
開始する。**

---

# 次Chat開始用プロンプト

以下を新しいChatに貼って開始する。

```text
あなたはCreateChordScore / GuitarChordScoreのPhase136を
引き継いでください。

まず、添付の「Phase135 引き継ぎメモ（最終版）」を前提資料として
読み、Phase135で確定したこと（§5の最小Measure Model）と、
まだ決めていないこと（§7）を混同しないでください。

進め方は、

  ChatGPTが候補を整理 → Claudeが実コードを確認 →
  私が修正・判断 → ChatGPTが再整理

です。ChatGPTだけで思考実験を延々と続けず、実際のコードや
19個の分析JSON（既存17曲＋追加確認2曲）で確認できる事実を
Claudeにチェックしてもらい、私が必要に応じて軌道修正しながら
前に進めます。

技術用語は必ず English（日本語） で表記してください。
説明順は基本的に やりたいこと → 仕組みの説明 → 技術用語 で
お願いします。

Phase135で確定した前提（変更しない）:

  Measure = { startTime, endTime, confidence }
    startTime / endTime は必須
    confidence は残すが意味は厳密に固定しない
    beatCount・Beat配列・Downbeat・Pickup・Time Signatureは
    いずれもMeasure自身の必須属性ではない

Phase136で扱うテーマ（1つだけ）:

  Downbeatがある場合／ない場合それぞれで、Measureの
  startTime・endTimeを「何を根拠に」決定するか
  （Measure Boundary Estimation）

注意:
  ・6/8, 9/8, 12/8, 3/4, 拍子変更は、実データが無いため
    今すぐ結論を出さない（Future Featureとして保留のまま）
  ・「瞳をとじて」は代表的検証ケースだが単独補正しない
  ・Beat Cursor問題（Issue #109）とMeasure Boundary Estimationを
    混同しない
  ・raw.beats / raw.downbeatsを変更しない
  ・normalizedをAuthority（権威）として扱わない
  ・full / beat-onlyを「同一Model」「別Model」と断定しない
  ・Slot・Collision・Allocation Algorithmへ話を広げない
  ・実装には進まない

まずは上記テーマについて、Claudeに確認してもらうための短い
確認項目を提示してください。Claudeの回答を私が持ってきたら、
その内容を再整理して次へ進みます。
```
