# CreateChordScore Phase135 引き継ぎメモ
## Beat / Downbeat / Measure Model（拍・小節開始・小節モデル）整理の途中経過
作成日: 2026-09-16

---

## 1. このChatの目的

CreateChordScore / GuitarChordScore の Phase135 では、Beat（拍）・Downbeat（小節開始位置）・Measure（小節）の関係を整理し、Technical Design（技術設計）へ進む前に最低限のモデル定義を固める。

仮説を延々と増やすのではなく、

**ChatGPTが候補を整理 → Claudeが実コードを確認 → ユーザーが修正・判断 → ChatGPTが再整理**

という形で進める。

現時点では Implementation（実装）には進まない。

---

## 2. Beat（拍）

現在の作業定義:

> Beat（拍） = 楽曲のリズムを構成する時間上の基本的な区切り

「曲全体で数学的に等間隔」である必要はない。Tempo Change（テンポ変化）、Rubato（ルバート）、Groove（グルーヴ）、Swing（スウィング）などによる時間間隔の変化は、それだけでは異常とは扱わない。

明らかに不自然な分析結果は修正対象になり得る。

### Detected Beat / Musical Beat

- Detected Beat（検出Beat） = ChordMini が検出した `raw.beats`
- Musical Beat（音楽上のBeat） = CreateChordScore が最終的に扱いたいBeat

現在の方針:

> Musical Beat は ChordMini の検出Beatを基本的には信頼するが、明らかな異常があれば修正対象とする。

`raw.beats` は直接書き換えず、将来の修正は別の仕組みで扱う。

Beat自体の編集機能や自動補正アルゴリズムは、現時点では決めない。

---

## 3. BPMについて

BPMとBeatの一般則を今の段階で固定しない。

多くの曲を観察し、傾向 → 仮説 → 別サンプルで検証、という帰納的な進め方を取る。

「BPM値だけでBeatの正しさを決める」ルールは未決定。

---

## 4. 「瞳をとじて」

GitHub Issue #109 に代表的な検証ケースとして記録済み。

事実:
- ChordMini再実行でも同じ596 Beat / 149 Downbeat / BPM 136.364 / 4/4
- 約173.8秒でBeat間隔が約0.85秒 → 約0.43秒へ変化
- 曲頭〜約97秒はピアノ＋歌、約97秒からドラム
- 約173.8秒付近に明確な転調・構造転換・ドラムフィル・ダイナミクス変化は確認できない
- 音楽的には明示的なテンポ変更には聞こえない

Interpretation（解釈）:
ChordMini/madmom側の検出特性である可能性が、曲側の実テンポ変化より整合的に見える。ただし原因は未確定。

この件はBeat Modelの代表例であり、単一曲への補正実装はしない。Beat Cursorの問題とも分離する。

---

## 5. Downbeat（小節開始位置）

意味の候補:
1. 構造上の小節開始位置
2. 実際に強くアクセントされる拍
3. 聴感上の「着地・始まり」

現在の `raw.downbeats` はtimestamp配列だけなので、2や3まで表現できるとは確認されていない。

現状では「小節の構造上の開始位置」を中心に扱うのが妥当そうだが、最終定義は未確定。

重要:

**DownbeatとBeatは同じ時刻になり得るが、同じ概念とは限らない。**

17曲の実データでは、すべてのDownbeatが `raw.beats` の要素と完全一致した。ただしこれは17サンプルの事実であり、普遍的な音楽理論やChordMiniの契約とは言えない。

---

## 6. 17個の分析JSONから確認できた事実

17曲すべて:
- Time Signature = 4/4
- Downbeatはすべて `raw.beats` の要素
- 隣接するDownbeat間には4 Beat
- 現在のサンプル範囲では `Downbeat → 4 Beat → Downbeat` が成立

まだ結論できない:
- 3/4
- 6/8
- 9/8
- 12/8
- Time Signature Change
- DownbeatとBeatが一致しないケース
- Beatの欠落・余分

6/8の議論は思考実験であり、17曲のデータから得た結論ではない。三連符と6/8は同じものではない。

---

## 7. Measure（小節）

現時点の最小イメージ:

> Measure = 複数のBeatをまとめた、時間上のひとまとまり

Measureには少なくとも時間的な範囲が必要と考えられる。

現在の実装では:

`{ startTime, endTime, beatCount, confidence }`

ただし最終フィールド設計は未決定。

保留:
- `endTime`を常に`startTime`から導出できるか
- `endTime`を独立して保持する必要があるか
- Beatの所属をMeasureが所有するのか、時間関係として導出するのか
- `beatCount`をMeasure属性として持つのか、Beatとの関係から導くのか
- measure numberをモデルとして持つ必要があるか

「MeasureがBeatを所有する」と早く決めない。BeatとMeasureの所属関係とデータ所有権は別問題。

---

## 8. Beat 1 / Beat 2 / Beat 3...

「Measure内で先頭から1,2,3...と数える」だけでは、「何をBeatと数えるか」というBeat粒度の問題を解決していない。

4/4では単純に見えても、6/8などでは問題が出る。

したがって「Beat 1 = 最初のBeat」だけでBeat Modelを完成させない。

---

## 9. 現在の実装

### Measure生成

`timing.js`では概ね:
- Downbeatが利用可能: DownbeatをMeasure開始としてMeasure生成
- Downbeatが利用不可: Beat列とTime Signatureを使ってMeasure生成

`determineMode()`:
- `full`
- `beat-only`
- `fallback`

### full / beat-only

両方とも同じ形:

`{ startTime, endTime, beatCount, confidence }`

ただし完全に同じ挙動ではない。

確認済み:
- `beat-only` は `confidence: 'estimated'`
- CSSでも `chart-measure--estimated` として区別
- Pickup Measureの視覚的調整は `beat-only` には適用されない
- コードコメント上、beat-onlyでのpickup対応は別問題

したがって現時点では、

> 「同一Model」

とも、

> 「完全に別Model」

とも断定しない。

安全な表現:

> 「同じMeasure型のデータを生成するが、生成条件と後段処理が異なる。」

---

## 10. DownbeatとMeasureの関係

現在の実装では、Downbeatが利用可能ならDownbeatをMeasure開始として使っている。

しかし、

> Downbeatが必ずMeasureの開始を定義する

という普遍的な音楽理論の法則としては固定しない。

DownbeatとBeatが一致しない場合の処理も未決定。

候補として:
- A-1: DownbeatをそのままMeasure開始として信頼
- A-2: Downbeatを使うがBeatとの整合性を検証
- A-3: BeatとDownbeatを独立情報として扱い、不一致時は保留

が出ているが、まだ選択していない。

---

## 11. 重要な実装上のAssumption（仮定）

`timing.js:quantizeTime()`には、

> `measure.startTime` は必ず `raw.beats` のいずれかの要素と一致する

という `[ASSUMPTION]` がある。

これは:
- 音楽理論上の法則ではない
- ChordMiniの正式なデータ契約と確認できていない
- 現在の17サンプルでは成立
- `applyAnchorRepair()` がBeat配列からDownbeatを作るため成立している面がある
- 将来DownbeatをBeat以外の時刻へ補正すると壊れる可能性がある

したがって、

**timestamp equality（時刻一致） ≠ conceptual identity（概念的一致）**

として扱う。

現在の実装は、
- Measure生成ではDownbeatを独立した境界情報として扱う
- `quantizeTime()`ではMeasure開始をBeat列の要素であることを前提にする

という二面性を持つ。

---

## 12. Downbeatがない場合

ユーザーの基本方針:
1. Downbeatがなければ、基本的にはBeatからMeasureを構成する
2. 常に4 Beatと決めつけない
3. Measure境界が間違っていれば、将来的にはユーザーが柔軟に修正できるようにする
4. 曲全体が大きく壊れている場合は、リセットできるようにする

現在コードでは `timeSignature.numerator` を使っているが、これを普遍的な音楽モデルとして採用するかは未決定。

---

## 13. Beat修正

ユーザーは現時点ではBeatそのものを編集する具体例を想像できない。

そのため:
- Beat編集UIは作らない
- Beat自動補正も作らない

ただし将来Beat自体の欠落・誤検出を修正する必要が出る可能性を考え、アーキテクチャをBeat修正不能に固定しない。

原則:
- `raw.beats`は不変
- 修正情報は別系統
- 必要性が確認されてから具体設計

---

## 14. 不変条件

- `analysis/{id}.json` がPersistence Authority（永続化上の権威）
- `raw.beats`は変更しない
- `raw.downbeats`も分析結果として扱い、勝手に直接書き換えない
- `repairRule`は修正意図を表す
- `normalized`はDerived Data（派生データ）であり、再構築可能
- `normalized`を永続化しない
- Chart ModeはnormalizedからRuntime Model（実行時モデル）を構築
- Audio `currentTime`がPlayback Authority（再生位置の権威）
- Playheadは別問題
- Slot ModelはBeat/Measureの定義が固まるまで決めない

---

## 15. 今はやらないこと

- Beat自動補正
- 「瞳をとじて」単独補正
- Playhead修正
- Slot定義確定
- Allocation Algorithm（配置アルゴリズム）の確定
- 6/8の最終モデル決定
- Time Signature Changeの実装
- Pickupの深掘り
- Downbeat不一致時の自動修正実装

---

## 16. GitHub Issue

### #109 Beat Cursor
「曲途中でBeat Cursorのテンポが大きく変わって見えるケースを横断調査する」

「瞳をとじて」の再現性・音声確認を記録済み。単一曲への補正はしない。

### #94 Collision
Phase134でType A Collisionの原因候補:
- 曲頭N由来
- 極短onset由来

今後、Beat/Measure/Slot定義後に定量化する。まだ実装しない。

---

## 17. 次のChatで再開する位置

次は思考実験を広げず、Claudeに実コードを確認してもらいながら、次の一点を整理する。

> **Downbeatがない場合、BeatからMeasureを作るとき、最低限何が必要なのか？**

確認項目:
1. 現在コードが何を基準にMeasureを作っているか
2. `timeSignature.numerator`を使うことの意味
3. 4/4の17曲データから確実に言えること
4. 「常に4 Beatではない」というProduct上の意図と、現在実装の`numerator`利用の関係
5. 3/4・6/8について、まだ観測不足で決められない点
6. 将来ユーザーがMeasure境界を修正できる余地をどこに残すか
7. ここで決めるべきこと／まだ決めなくてよいこと

この段階ではTechnical Design（技術設計）に入らない。

---

# 次Chat開始用プロンプト

以下を新しいChatに貼って開始する。

あなたはCreateChordScore / GuitarChordScoreのPhase135を引き継いでください。

まず、添付の「Phase135 引き継ぎメモ」を前提資料として読み、決定事項・未決定事項・実装上の事実を混同しないでください。

進め方は、

**ChatGPTが候補を整理 → Claudeが実コードを確認 → 私が修正・判断 → ChatGPTが再整理**

です。

ChatGPTだけで思考実験を延々と続けず、実際のコードや17個の分析JSONで確認できる事実をClaudeにチェックしてもらい、私が必要に応じて軌道修正しながら前に進めます。

技術用語は必ず **English（日本語）** で表記してください。

説明順は基本的に **やりたいこと → 仕組みの説明 → 技術用語** でお願いします。

現在の中心テーマは **Beat（拍）・Downbeat（小節開始位置）・Measure（小節）** の関係整理です。

次に扱うテーマは一つだけです。

> **Downbeatがない場合、BeatからMeasureを作るとき、最低限何が必要なのか？**

次の点を確認してください。

1. 現在の`timing.js`が実際に何を基準にMeasureを生成しているか
2. `timeSignature.numerator`を使っている現在の実装を事実として説明
3. 17曲の4/4分析JSONから確認できること
4. 「常に4 Beatではない」というProduct上の意図と、現在実装の`numerator`利用の関係
5. 3/4・6/8について、まだ観測不足で決められない点
6. 将来ユーザーがMeasure境界を修正できる余地をどう残すべきか
7. ここで決めるべきこと／まだ決めなくてよいこと

注意:
- 6/8について現在の17曲データから結論を出さない
- 「瞳をとじて」は代表的検証ケースだが単独補正しない
- Beat Cursor問題とBeat Modelを混同しない
- `raw.beats`を変更しない
- `normalized`をAuthority（権威）として扱わない
- timestamp equality（時刻一致）とconceptual identity（概念的一致）を混同しない
- full / beat-onlyを現時点で「同一Model」「別Model」と断定しない
- PickupやSlotやAllocation Algorithmへ話を広げない
- 実装に進まない

まずは上記テーマについて、Claudeに確認してもらうための**短い確認項目**を提示してください。Claudeの回答を私が持ってきたら、その内容を再整理して次へ進みます。
