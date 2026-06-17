# 引き継ぎ: Phase72-A完了 — Correction Authority 設計フェーズ

## 作業状態
- ブランチ: (未定・設計フェーズのため実コード変更なし)
- 直前作業: Phase71-A完了（speed authority統一 + reset trigger追加）

---

## 背景

Phase68〜70で「rendererがsemanticを潰さない」アーキテクチャ整理が進んだ結果、
「ChordMiniの解析結果（タイミング）に間違いがあった場合、人間がどう修正するか」
という correction authority 問題に着手できる土台が整った。

本フェーズは実装を一切行わず、設計判断のみを確定させた。
ユーザーが実際にChart Mode画面で「2小節目のDが本来の小節頭であるべき」と
気づいたことが、抽象的な議論を実用的な要件に引き戻す重要な役割を果たした。

---

## 確定した設計（Phase72-Aスコープ）

### 1. データ構造（保存する“意図”の形）

```json
{ "version": 1, "type": "anchorDownbeat", "beatTime": 2.37 }
```

- `version`フィールドを最初から持たせる。将来`tolerance` / `confidence` /
  `source` / `createdAt`等を追加する可能性に備えた保存フォーマットの
  進化余地の確保（過剰設計ではなく最低限の保険）。
- `beatTime`（絶対時刻）で保存する。`rawBeatIndex`（配列位置）は採用しない。
- 理由: raw配列の構造変化（再解析時の拍数増減等）に対し、
  時刻ベースの方が「音楽的瞬間」としての意味を保ちやすい。
  配列位置（index）はraw構造そのものに強く依存するため脆い。
- **[VALUE SOURCE CONSTRAINT]** `beatTime`は必ず`raw.beats`に実在する値
  （detected beat identity）から取得する。DOM位置・カーソル位置・描画位置
  等から計算された中間値・任意の浮動小数（floating arbitrary time）を
  保存してはならない。これは将来の再matching精度に直結する制約。
- 将来の再解析時は、保存されたbeatTimeに最も近い拍へ
  snapping（再マッチング）する想定。大きくズレた場合の扱い
  （無効化／ユーザー通知／threshold等）は未設計であり、将来検討とする。

### 2. 保存場所

```
analysis/{id}.json
  ├─ raw          （既存・変更なし・不変のcanonical source）
  ├─ metadata     （既存・変更なし）
  └─ repairRule   （新規追加。単数。null または下記shape）
```

```json
"repairRule": null
```
```json
"repairRule": {
  "version": 1,
  "type": "anchorDownbeat",
  "beatTime": 2.37
}
```

- **[SINGULAR SHAPE]** フィールド名は`repairRules`（複数形）ではなく
  `repairRule`（単数形）とする。Phase72-Aの思想は「複数repairの相互作用
  問題を意図的に封印する」ことであり、データshapeもそれに合わせて
  単一オブジェクト（またはnull）に固定する。配列にすると実態は
  `[rule]`しか入らないのに複雑さだけ増え、「複数を許可している」と
  誤読されるリスクがある。将来複数repairへ拡張する場合は、
  その時点で設計自体を見直すべき大きな変更となる。

- `project.json`ではなく`analysis.json`側に置く。
  理由: repairは「UI状態」や「Chart表示専用設定」ではなく
  「音源解析結果に対する補正」という性質を持つため。
- project.id ↔ analysis/{id}.json は既にPhase62で1対1関係が
  確立済み（1曲=1解析=1利用）のため、複数project間での
  repair共有・競合は現状想定不要。

### 3. UI操作

```
Chart Mode上でコードをクリック
  ↓
コンテキストメニュー表示
  ↓
「ここを小節頭にする」を選択
  ↓
そのコードが乗っている拍のbeatTimeを取得し
analysis.json の repairRule として保存
```

- 検討した他案（再生中に時刻指定/ 専用タイミング補正モード）は不採用。
  理由: 再生中指定はレイテンシ等の精度問題があり論外。
  専用モードは実装コストが大きく、Phase72-Aのスコープを超える。
- UI上は「コードをクリックする」操作に見えるが、内部的に保存するのは
  「コードが乗っている拍のbeatTime」である。コードそのものではなく
  拍に紐づける（同拍に複数コードがある場合や、将来の表示変更に強くするため）。

### 4. 再構成ロジック（measure rebuild）

```
raw.beats は一切変更しない（演奏の揺れ・タメを尊重する既存思想と一致）

anchor地点（指定された拍）より前: 変更しない
anchor地点より後ろ: 拍子の拍数（4/4なら4拍）ずつ、
                    beatsを新しく数え直してグルーピングする
```

- **[ANCHOR INCLUSIVE RULE]** anchor beatは必ず新しい小節の先頭
  （new measure start inclusive）に含まれる。
  例: anchor = b6 の場合、新小節1は `[b6 b7 b8 b9]` であり、
  `[b5 b6 b7 b8]`のようにanchorが小節の途中に来てはならない。
  Phase72-B実装時に解釈ミスしやすい点のため明記する。
- 「beat grid を作り直す」のではなく「beat grouping を変える」という
  責務の違いを明確にした。raw.beatsの検出結果自体は信頼し続ける。
- 既存のrepair思想（Phase59〜「演奏の揺れは直さない・自信がないなら触るな」）
  と完全に一致する方向性。

### 5. 既存pickup detection（Phase61）との関係

```
raw analysis
  ↓
pickup detection（既存・曲の最初の弱起判定。完全に別処理）
  ↓
base measures
  ↓
anchorDownbeat repair（今回追加・ユーザー補正）
  ↓
final measures
```

- 完全に別層として分離する。混在させると、anchor repairで生じた
  短い小節をpickup detectorが誤って「弱起」と再判定し、
  再構築が循環するリスクがあるため。

### 6. 拍子変更への対応

- Phase72-Aでは対応しない。現在のtimeSignatureを固定して使う。
- 曲中拍子変更対応は別フェーズ級の規模（拍子イベントのタイムライン、
  repair ruleとの優先順位、UI拍子編集等が必要）のため、スコープ外とする。

### 7. 複数修正の許可

- Phase72-Aでは**repairRuleは1個のみ**に制限する（複数同時保持は禁止）。
- 理由: 複数repairRuleの相互作用（precedence/merge/conflict/
  cascading reconstruction）はrepair graph systemに近い規模になり、
  Phase72-Aの「最初の一歩」としては過大。
- 新しいanchor指定をすると、既存のrepairRuleを置き換える
  （undo stack等は不要・シンプルな置き換えのみ）。

### 8. 取り消し方法

- 「補正を解除」ボタンのみ。1個制限のため、undo履歴管理は不要。

---

## 確定した設計原則（architecture.md反映候補）

```
[CORRECTION AUTHORITY PRINCIPLE]
repairRuleは「結果」ではなく「意図」を保存する。
  良い例: { type: "anchorDownbeat", beatTime: 2.37 }
  悪い例: { measureStarts: [1.25, 3.75, ...] }
         （これはnormalizedの先取り保存であり、
          既存のderived cache persistence禁止原則に反する）

raw.beatsは絶対に変更しない（既存のraw immutable原則の継続）。

pickup detection（既存）とanchor repair（新規）は別層として分離する。
両者を混在させると判定の循環リスクが生じる。

repair適用後のmeasures（final measures）が、
Chart Mode描画・playback・seek・cursor全ての入力となる
（Phase68〜69で確立したprojection layer原則の継続。
 「見た目だけ直して動作は別基準」というPhase68以前の
 アンチパターンを再発させない）。

[MEASURE IDENTITY RULE]
measure index / measure order は repair適用によって変化しうる。
measureはstable entityではなく、beats groupingから導出される
projectionである（anchor repair適用前のmeasure[6]が、
適用後も同じmeasure[6]である保証はない）。

永続参照（将来のbookmark / comment / loop range / annotation等）は、
measure indexを直接の参照キーにしてはならない。
time / beat anchor基準で参照を持つべき。
これはcorrection authority機能に限らず、measureに依存する
将来の全機能に影響する原則である。
```

---

## 検討して不採用にした案（記録）

| 案 | 内容 | 不採用理由 |
|---|---|---|
| raw直接書き換え | repairをrawに直接上書き | 元解析結果が消える・取り消し不可・persistence汚染 |
| 表示だけ補正 | rendererの描画時だけ位置をズラす | seek/cursorとの基準ズレが再発（Phase68以前と同じ問題） |
| rawBeatIndex方式 | 配列位置で保存 | raw配列構造の変化（再解析時）に脆弱 |
| 再生中の時刻指定UI | リアルタイムでタイミングを指定 | 精度問題（レイテンシ・反応速度誤差）で論外 |
| 専用タイミング補正モード | 別画面での編集UI | 実装コストが大きくスコープ超過 |
| 時間計算ベースの再構成 | BPMから理論値で等間隔grouping | raw.beatsの演奏実態を無視し、既存repair思想に反する |
| 前後両方を再構成 | anchor前後とも組み直す | ユーザーの実ケース（後ろだけズレていた）と不一致 |

---

## 次フェーズ候補

```
Phase72-B（最小実装・優先）:
  - repairRule保存（analysis.json）
  - measures再構築ロジック（anchor以降のみgrouping変更）
  - Chart Mode反映
  - seek/cursor同期（既存authority chainへの統合）
  ゴール: 「コードをクリック→repairRule保存→measures再構築→
          Chart/seek/cursor全部揃う」のend-to-endを最短で通す。
          これが通れば今回の設計判断の妥当性が実証される。

Phase72-C（UX改善・後回し）:
  - コンテキストメニューの見た目調整
  - 補正適用中であることを示す視覚的インジケーター
  - 再計算タイミングの最適化
```

設計細部（メニューUI・hover挙動・視覚フィードバック等）は
実装しながら判断する方が合理的なため、Phase72-Aでは意図的に
詰めなかった（過剰な事前設計を避ける判断）。

---

## current-issues.md更新

- 今回closeしたissue: なし（設計フェーズのため）
- 今回新規に追加すべきissue:
  「Chart Mode timing correction（manual repair）」
  状態: 設計完了（Phase72-A）・実装未着手
  内容: 上記の確定設計に基づき、Phase72-Bで最小実装を行う。
  Issue #45（timing failure taxonomy）のType A/Cへの対応候補。

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
