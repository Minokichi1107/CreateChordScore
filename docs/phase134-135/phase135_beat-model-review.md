# Phase135 調査 — Beat Model議論の整理

> **位置づけ**: 本ファイルは、たかっちさんが実施したPhase135のBeat Model
> （拍モデル）に関する議論を、`Phase134_調査_Beat-Measure-Slot定義論点整理.md`
> と整合する形で整理したレビューメモである。
> **本フェーズもコード変更なし。Technical Design・補正アルゴリズムの
> 提案は行わない（Exploration継続）。**

---

## 1. Phase134 Handoverとの整合性確認

Phase134の引き継ぎ事項（§I）は次の順序だった。

```
Beat Model Definition → Measure Model Definition → Slot Model Definition
→ Technical Design → Implementation Design → Implementation
```

今回の議論はこの最初のステップ「Beat Model Definition」に取り組んだもので、
順序自体は崩れていない。

ただし1点、位置づけを明確にしておきたい。

```
Phase134の"Definition"という言葉は「定義を確定させる」ことを指していたが、
Phase135で実際に確定したのは「Beatをどう定義するか」ではなく
「Beatの定義をどう決めていくか（進め方）」である。

Beat Model Definitionというマイルストーンは、まだ完了していない。
Phase135はその内部の一段階（方針決め）として位置づくべきで、
「Beat Model確定 → 次はMeasure Model」という段階には進んでいない。
```

これは矛盾ではなく、Phase134の粒度（大項目の列挙）に対して、
Phase135がその内部をさらに1段階分解しただけと理解できる。

**§J（Phase134で守られたInvariant）との整合**：
今回の議論もAuthorityの不変更・Allocation Algorithm未決定・Chart Mode
既存コードへの不接触を維持しており、矛盾は無い。

---

## 2. 今回新たに確定した内容

以下はDecisionとして確定したと言える内容。

### 2.1 Beatの定義（作業定義）

```
Beat（拍）とは、楽曲のリズムを構成する時間上の基本的な区切りである。

・楽曲全体で数学的に等間隔であることは要求しない
・テンポ変化・リズム変化・演奏表現・Grooveによる揺らぎを許容する
```

### 2.2 「Beat間隔の変化」と「異常」を同一視しない

```
Beat間隔が変化した、という観測結果だけでは異常と判定しない。
変化の原因を以下の3つに切り分けることが必要、という原則を確立した。

  (a) 楽曲本来のリズムによる変化
  (b) ChordMiniの解析異常
  (c) CreateChordScore側の処理バグ
```

これは既存の`analyzeTiming()`（Phase59・diagnostics）が
`severity: 'severe'`のような判定を出す場合でも、それが即座に
「解析異常」を意味するわけではない、という解釈の精緻化にあたる
（Phase134 §B-5で93baeafdに`severe`判定が出ることは確認済みだが、
今回の原則により「severeという診断結果」と「実際に異常と断定すること」
は別の話だと明確になった）。

### 2.3 Musical Beat / Detected Beat という概念区別の導入

```
Detected Beat  … ChordMiniが解析で検出したBeat候補（raw.beats）
Musical Beat   … CreateChordScoreが最終的に扱いたい、楽曲上の真のBeat
```

現時点の関係:

```
ChordMini → raw.beats（Detected Beat） → 検証・必要なら補正 → Musical Beat
```

`Detected Beat = Musical Beat`という等式はまだ採用していない
（今後もそう定義するとは限らない、という留保付き）。

### 2.4 Authorityの扱い（既存Invariantとの整合を明言）

```
raw.beatsそのものは書き換えない。
補正は別レイヤー（Musical Beatを導出する層）で行う。
normalizedは引き続きDerived Data（再生成可能）であり、
新たな永続的Authorityとしない。
```

これは既存の以下と完全に一致する（新設ではなく再確認）：
- `[TIMING INVARIANT]` `raw.beats`は絶対に変更しない（§9）
- `[PERSIST INVARIANT]` normalizedはdisposable derived cache（§9）
- `[FINAL MEASURES PERSISTENCE PROHIBITION]`（§9・repairRule文脈）

### 2.5 BPMとBeatの関係を、現時点では一般則化しない

```
以下いずれも採用しない（保留）:
  ・BPMからBeatを機械的に生成する
  ・BeatからBPMを機械的に決定する
  ・BPM/Beatどちらかを絶対的Authorityとする

raw.beatsとraw.bpmは異なる解析情報として並行して扱う。
```

### 2.6 判断の進め方（帰納的アプローチ）

```
[記録用の表現・Decisionではなく方針のメモ]

現時点で一般則を定義するにはサンプル数が不足しているため、
複数楽曲による観察・検証を先行する。

観察 → 仮説 → 別サンプルでの検証 → 再現性が十分ならルール化、
という進め方を採る。Phase134で用意した16曲は将来の観察対象候補。
```

ご依頼の通り、これは「帰納的アプローチを正式なDesign方針として固定した」
という意味ではなく、「今はサンプル不足につき一般則を作らない」という
現状認識の記録として扱う。

---

## 3. まだUnknownとして残すべき内容

Phase134 §D（Unknown）に、今回の議論で新たに増えた項目を加えると以下になる。

```
Phase134から持ち越し:
  ・ChordMini/madmom内部の生成ロジック（確認不可能）
  ・93baeafd前半がどちらの拍（奇数/偶数）を検出しているか（音源照合未実施）
  ・他16曲でのPlayhead離散ステップの知覚有無
  ・"continuous overlay"コメントの当初意図

Phase135で新たに明確になったUnknown:
  ・Musical BeatとDetected Beatを具体的にどう検証するか（方法論未定）
  ・「明らかな異常」の判定基準（閾値・手法とも未定）
  ・BPMとBeat間隔の整合性をどう判定するか
  ・Tempo Change（曲中のテンポ変化）をBeat Modelでどう扱うか
  ・93baeafdの「1拍おきにしか検出されていない」という解釈の真偽
    （Interpretationのまま。Confirmed Factに昇格していない）
```

---

## 4. 既存Invariantを壊していないかの確認

チェックした結果、以下はすべて**維持されている**（矛盾なし）。

| Invariant | 状態 |
|---|---|
| `[TIMING INVARIANT]`（raw.beats不変・§9） | 維持。「補正は別レイヤー」と明言 |
| `[PERSIST INVARIANT]`（normalizedはdisposable・§9） | 維持。「Authorityとしない」と明言 |
| `[ANALYSIS AUTHORITY INVARIANT]`（analysis正本はanalysis/{id}.json・§9） | 維持。raw.beats書き換え無し |
| repairRule `[SINGULAR SHAPE]`（単数・複数repairは対象外・§9） | 未言及だが矛盾なし（後述） |
| Phase133 `[方針1]`（Authorityは変更しない） | 維持。Slot Collision議論と同じ立場 |

**1点、今後の整理待ちの関係がある**：

```
既存のrepairRule（Phase72・anchorDownbeat方式）は、
「Detected Beatに対してCreateChordScore側が補正を加える」という、
今回のMusical Beat / Detected Beat区別とほぼ同じ構造を先に持っている。

repairRuleは「結果ではなく意図を保存する」（§9）という設計だが、
今回の議論の「Musical Beatとして利用する」という表現が、
既存repairRule機構とどう関係するか（同じ仕組みの再利用か、
別の新しい補正層を指すのか）はまだ整理されていない。

これは矛盾ではなく、単に「まだ接続されていない」状態。
次フェーズ以降でrepairRule Invariantとの関係を明示すべき論点として
残しておく。
```

---

## 5. 「DownbeatとBeatの関係」へ進むうえで不足している論点

ご依頼の通り、まだ次の検討には進みません。以下は次フェーズ開始時に
論点として持っておくべき事項の列挙に留めます。

```
5.1 Phase134で確認済みの事実との接続
  ・93baeafdではdownbeatsがbeats配列の値と誤差0で完全一致していた
    （Phase134 §B-4）。これは「Downbeat ⊂ Beat（部分集合）」という
    構造を示唆するが、1曲のみの確認であり一般化はされていない。
    他曲での確認が必要。

5.2 既存実装との関係整理
  ・detectPickupMeasure()（Phase61）は既にdownbeatとmeasureの境界を
    扱っている。今回のBeat Model議論はこの既存ロジックの前提
    （downbeatsが信頼できる）を暗黙に置いているが、その前提自体が
    今回のBeat Model議論の対象でもある（循環に注意）。

5.3 timeSignatureの扱いの先送り
  ・Downbeat・Measureの検討にはtimeSignatureが不可分だが、
    Phase134 §Fでは「Measure Model」の論点として分離されている。
    Downbeat-Beat関係だけを先に決めるのか、timeSignatureも
    同時に扱うのか、次フェーズ開始時に scope を明確にする必要がある。

5.4 帰納的アプローチの適用範囲
  ・§2.6の「帰納的に判断する」方針をDownbeat-Beat関係にも
    そのまま適用するのか、それとも既に確認済みの事実（5.1）を
    起点にした別の進め方を取るのか、未整理。

5.5 Musical Beat / Detected Beatの区別をDownbeatにも適用するか
  ・「Detected Downbeat」と「Musical Downbeat」という同型の区別を
    導入するかどうかは、今回のBeat側の議論からは自動的には決まらない。
    これも次フェーズの最初の論点になりうる。
```

---

## まとめ

```
確定: Beatの作業定義／異常判定の3分類原則／Musical-Detected区別／
      Authority関係の再確認／BPM-Beat一般則の非採用／
      進め方としての帰納的アプローチ（Decisionではなく現状認識）

未確定（Unknown）: 検証方法・異常判定基準・BPM整合性・Tempo Change扱い・
      93baeafdの解釈の真偽

Invariant: すべて維持。ただしrepairRuleとの関係整理は次フェーズ以降の
      持ち越し論点として明記

次フェーズ: Downbeat-Beat関係の検討開始時、§5の論点（特に5.2の循環と
      5.3のscope）を先に整理してから着手することを推奨
```
