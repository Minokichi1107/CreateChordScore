# Phase135続き — Existing Implementation Assumptions（Downbeat関連）

> **位置づけ**: Downbeat-Beat関係の検討に入る前段階として、現行コードが
> downbeatsについて実際にどう振る舞っているかを事実確認した記録。
> **設計判断は一切含まない。すべて「現在のコードがそうなっている」という
> 事実の報告。** 実機クローンの上でgrep・コード読解により確認した
> （推測・記憶ではなく実コード確認）。

対象コミット時点のファイル: `js/analysisLoader.js` / `js/timing.js` /
`js/chartmode.js` / `js/app.js`

---

## 1. downbeatsをどこで生成・読み取りしているか

```
ChordMini API（/api/detect-beats）
    ↓
raw.downbeats（analysis/{id}.json・永続データ）
    ↓
analysisLoader.js: loadAnalysis()
    downbeats = sanitizeTimestamps(raw.downbeats)   ← L346
    ↓
    buildNormalizedTimingAnalysis({ beats, downbeats, ... }, { repair: false })  ← L374
    ↓
normalized.downbeats（runtime cache。repair:falseのため raw相当のまま）
    ↓
chartmode.js: buildGridViewModel()
    downbeats = cachedNormalized?.downbeats ?? analysis.downbeats ?? []  ← L103
    ↓
timing.js: createTimingModel({ beats, downbeats, ... })  ← L114（chartmode.js側）
```

**事実**: `app.js`自体はdownbeatsに関する固有ロジックを持たない
（`downbeat`という文字列の出現はコメント2件のみ。L40, L5365）。読み取り・
生成ロジックはすべて`analysisLoader.js`と`timing.js`に閉じている。

**事実**: `sanitizeTimestamps()`（analysisLoader.js L92-99）は、
`beats`・`downbeats`それぞれに独立して適用される。型チェック・非負値
フィルタ・ソート・重複除去のみを行い、**beatsとdownbeatsの間の相互参照や
整合性チェックは行わない**。

---

## 2. downbeatsの存在を前提としている処理

`timing.js`の動作モード判定（L61-72）がdownbeatsの有無で分岐する。

```javascript
function isDownbeatsUsable(downbeats) {
  return Array.isArray(downbeats) && downbeats.length >= 2;  // L57-59
}
function determineMode(beats, downbeats) {
  if (!isBeatsUsable(beats))         return 'fallback';
  if (!isDownbeatsUsable(downbeats)) return 'beat-only';
  return 'full';                                             // L68-72
}
```

**事実**: 判定条件は「配列であり要素数2以上」のみ。値の中身（時刻として
妥当か、beatsとの整合性があるか）は一切見ない。

downbeatsが使える（`isDownbeatsUsable`がtrue）場合と使えない場合で、
`buildMeasures()`（L97-136）の小節構築方法自体が分岐する：

```
mode === 'full'      : downbeats[i] を各小節のstartTimeとしてそのまま使う
mode === 'beat-only'  : downbeatsを一切使わず、beatsをtimeSignature.numerator
                        個ずつグループ化して小節を推定する
```

「downbeatsが存在するかどうか」だけで、小節構築の**アルゴリズム自体が
別物に切り替わる**という設計になっている。

---

## 3. downbeatsの値が正しいことを暗黙に前提としている処理

`buildMeasures()`のfullモード（L100-111）は、downbeatsの値を
無条件に信頼している。

```javascript
if (mode === 'full') {
  return downbeats.map((startTime, i) => {
    const endTime = i < downbeats.length - 1 ? downbeats[i + 1] : ...;
    return { startTime, endTime, beatCount: beatsPerMeasure, confidence: 'high' };
  });
}
```

**事実**: `confidence: 'high'`は、downbeatsの値そのものを検証した結果
ではなく、「fullモードで動いている」という条件だけで固定的に付与される
ラベルである（beat-onlyモードは常に`'estimated'`）。confidenceという
名前だが、実態は「どちらのモードで生成されたか」を示すフラグに近い。

**事実**: `beatCount: beatsPerMeasure`は`timeSignature.numerator`から来る
固定値であり、その小節に実際に何拍のbeatsが含まれているかを
downbeats[i]〜downbeats[i+1]の区間から数えて検証してはいない
（§4で詳述）。

---

## 4. beatsとdownbeatsの対応を前提としている処理

これが最も明示的な前提が書かれている箇所。`quantizeTime()`内、
コード内コメントとして以下が存在する（timing.js L364-367）。

```javascript
// [ASSUMPTION] measure.startTime は必ず raw.beats のいずれかの要素と一致する。
// 現在の anchorDownbeat repair では:
//   applyAnchorRepair() が after.push(beats[i]) で downbeat を生成するため、
//   measure.startTime は常に beats[] 上の実在する値になる。
```

実際の処理（L381-388）：

```javascript
const startBeatIdx = beats.findIndex(
  b => Math.abs(b - measure.startTime) < BEAT_EPS
);
if (startBeatIdx !== -1) {
  beatInMeasure = beatIdx - startBeatIdx;
}
// startBeatIdx === -1 の場合、beatInMeasure は初期値の 0 のまま
// （エラーにはならず、サイレントに0として扱われる）
```

**事実**: 「小節の開始時刻（downbeatの値）は、必ずbeats配列の中の
どれかの要素と厳密一致する」という前提が、コードコメントとして
明示的に書かれている。

**事実**: この前提が成り立たない場合（downbeatの値がbeats配列のどの
要素とも一致しない）、`findIndex`が`-1`を返し、`beatInMeasure`は
静かに`0`にフォールバックする。エラーや警告は出ない。

**事実**: コード内には将来リスクとしての自己言及コメントもある
（L376-380）：「将来'shiftTime'等、beats上に存在しない時刻を
startTimeとして持つ別方式のrepairRuleが追加された場合、findIndexが
-1を返し…サイレントフォールバックする」

**追加の事実（beatCountとの関係）**: `buildMeasures()`のfullモードは
`beatCount: beatsPerMeasure`（timeSignature由来の固定値）を返すが、
`quantizeTime()`が実際に計算する`beatInMeasure`（L387）は
`beatCount`で頭打ちにする処理を持たない。つまり、ある小節の実際の
beats数が`timeSignature.numerator`と異なっていても、コード上でそれを
検出・制限する仕組みは存在しない。

---

## 5. timeSignatureとdownbeatsの関係を前提としている処理

`timeSignature.numerator`は複数箇所でbeatsPerMeasureとして使われるが、
**downbeats側からその値を検証する処理は存在しない**。

```
buildMeasures()（fullモード）    beatCount = timeSignature.numerator（固定）
                                  ← downbeats[i]〜[i+1]間の実beats数とは無関係

buildMeasures()（beat-onlyモード） beatsPerMeasureごとにbeatsをグループ化
                                  ← downbeats自体を使わない

applyAnchorRepair()               anchor以降、beatsPerMeasureごとに
                                  beatsを再グルーピングしてdownbeatsを
                                  再生成する（L207-212）
                                  ← 新しいdownbeatsを生成する側であり、
                                    生成後の値がtimeSignatureと整合するかの
                                    事後検証はしない

analyzeTiming()                   expectedMeasureLength =
                                  medianBeatInterval（beatsから算出）
                                  × timeSignature.numerator
                                  という「期待値」を計算し、実際の
                                  downbeat間隔とのdrift（ズレ）を診断する
                                  （L620-684）。ただしこれは診断結果を
                                  返すのみで、mode判定や処理の分岐には
                                  使われない。
```

**事実**: `analyzeTiming()`はbeats・downbeats・timeSignatureの3者の
整合性を数値化する唯一の箇所だが、その結果（severity等）は現状
**診断情報として保持されるのみ**で、`determineMode()`や
`buildMeasures()`の分岐条件には使われていない
（`__CS_DEBUG__.timing`・Chart Mode診断UIでの参照用）。

**事実**: `[FIXME-6/8]`というコメント（timing.js L31-32, L116）が
既存コード内に存在する。6/8拍子は`numerator=6`としてそのまま扱われて
おり、音楽的には2拍系（3+3）であるべきという既知の未解決事項が
コードコメントとして残っている。

---

## 6. detectPickupMeasure()がdownbeatsについて実際に置いている前提

`detectPickupMeasure()`（chartmode.js L2719-2753）は、**downbeats配列を
直接参照しない**。引数は`measures`（`buildMeasures()`の出力）のみ。

```javascript
function detectPickupMeasure(measures) {
  if (measures.length < 2) return false;
  // endTime欠損ガード（旧project互換）
  if (!measures.every(m => Number.isFinite(m?.startTime) && Number.isFinite(m?.endTime))) {
    return false;
  }
  const restLengths = measures.slice(1).map(m => m.endTime - m.startTime);
  // ... median・条件A・条件Bによる統計的判定
}
```

**事実**: 判定は「`measures[0]`の長さが、`measures[1]`以降の中央値の
75%未満（条件A）」かつ「`measures[1]`以降が中央値の±30%以内という
正常範囲に収まっている（条件B）」という、**measures配列の長さの統計
のみ**で行われる。

**事実**: したがって`detectPickupMeasure()`は「downbeatsの値が正しい
かどうか」を一切検証しない。`buildMeasures()`が生成した`measures`
（fullモードならdownbeats由来、beat-onlyモードならbeats由来）を
**そのまま正しいものとして受け取り**、その上で統計的な形状判定を
行っているだけである。

**事実**: full/beat-onlyどちらのモードで生成された`measures`でも
同じロジックがそのまま適用される（モードによる分岐は無い）。

---

## 7. downbeatsが不正・欠落していた場合、現在の処理がどう振る舞うか

観測された事実を分岐ケースごとに整理する。

```
ケース1: raw.downbeats が存在しない／配列でない
  → sanitizeTimestamps() が [] を返す（analysisLoader.js L93）
  → isDownbeatsUsable([]) は false
  → determineMode() は 'beat-only' を返す
  → buildMeasures() は beatsを timeSignature.numerator 個ずつ
    グループ化する経路に切り替わる（エラーにはならない）

ケース2: raw.downbeats はあるが要素数が1以下
  → 同上（'beat-only'にフォールバック）

ケース3: downbeatsの要素数は2以上だが、値がbeats配列のどの要素とも
         一致しない（§4の[ASSUMPTION]が破れるケース）
  → mode は 'full' のまま（isDownbeatsUsableは値の中身を見ないため）
  → quantizeTime() 内で startBeatIdx が -1 になり、
    beatInMeasure が静かに 0 にフォールバックする
  → エラー・警告は出ない。小節内のbeat/slot位置が実際とズレた
    まま描画される可能性がある（レンダリング自体は止まらない）

ケース4: repairRule（anchorDownbeat）のbeatTimeがbeats配列に
         見つからない
  → applyAnchorRepair() が console.error() でログを出し、
    補正をスキップしてそのまま元のdownbeatsを返す（timing.js L197-205）
  → これはケース1〜3と異なり、明示的なエラーログが出る唯一のケース

ケース5: beats自体が使えない（3拍未満）
  → determineMode() は 'fallback' を返す
  → createTimingModel() は最小限のダミーオブジェクトを返す
    （quantizeは常に { measure:0, beat:0, slot:0, confidence:'low' }）
  → downbeatsの状態に関わらず、この場合は常にfallback
```

**事実としてのまとめ**: 現在のコードは、downbeatsが「存在しない・
少なすぎる」場合には明示的な代替経路（beat-only）を持つが、
「存在はするが値がbeatsと整合しない」場合には**検出する仕組みが
無く**、サイレントフォールバック（0への丸め）という形で吸収される。
エラーとして表面化するのは、repairRule適用時に限られる。

---

## 補足：Phase134の確認事実との接続

Phase134 §B-4で確認された「93baeafdではdownbeatsがbeats配列の値と
誤差0で完全一致していた」という事実は、今回確認した§4の
`[ASSUMPTION]`（コード内コメント）が、少なくともこの1曲では実際に
成立していたことを裏付けている。ただし、これが**全曲で成立する
保証がコード上にある**わけではなく（§4・§7ケース3参照）、
「たまたま成立していた」のか「ChordMiniが常にこの性質を持つ値を返す」
のかは、今回のコード調査だけでは判別できない（引き続きUnknown）。

---

## 今回維持している既存の合意事項（Phase135継続分）

以下はご指定の通り、本ファイルでも変更していない。

```
・Beatは数学的な等間隔を要求しない
・テンポ変化・リズム変化・Grooveによる揺らぎを異常とみなさない
・Beat間隔の変化だけでは異常判定しない
・楽曲本来の変化 / ChordMini解析異常 / CreateChordScore側の処理バグを区別する
・ChordMiniのDetected Beatを基本的に信頼するが盲信しない
・raw.beats（および raw.downbeats）は変更しない
・normalizedはDerived Data（派生データ）のまま
・BPMとBeatの一般則はまだ決めない
・複数楽曲による観察・検証を先行する
・93baeafdの「1拍おき」という解釈は未確認のまま
```

**Musical Beatの表現について**: ご指摘の通り、本ファイルでは
「楽曲上の真のBeat」という断定的表現を避け、
「CreateChordScoreが最終的に扱うべき音楽上のBeat」という程度の
表現に留めています（そもそも本ファイルはDetected Beat側＝
downbeatsの実装事実確認が主題であり、Musical Beatの定義には
踏み込んでいません）。

---

## 本ファイルで行っていないこと（確認）

```
・downbeatsの正しさの判定基準の提案
・Downbeatの定義そのものの提案
・検証方法・補正方法の設計
・「§4のASSUMPTIONが問題である」という評価
  （事実として記録したのみで、修正すべきとは述べていない）
・16曲サンプルを用いた実データ検証（本ファイルはコード読解のみ）
```

次のステップ（Downbeat Modelの定義議論）は、本ファイルが示した
「現在のコードが何を前提に動いているか」という土台の上で、
別途行うべき議論として引き続き保留します。
