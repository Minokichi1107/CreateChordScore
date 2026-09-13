# 引き継ぎ: Phase133完了 — Chart Mode Collisionの実態調査・Type分類確立・設計固定

## 作業状態
- 直前作業: Phase132完了（検索/置換ボタンの有効化タイミング修正）
- 対象Issue: GitHub Issue #94（Chart Mode：Collisionで裏側に隠れたコードを
  自動削除する）
- 本フェーズは **Exploration + Technical Design のみ。コード変更なし**
  （Phase98・Phase122と同じ「設計固定フェーズ」パターン）

---

## 1. Purpose（目的）

Issue #94「Collisionで裏側に隠れたコードを自動削除する」を単独の問題として
実装するのではなく、Phase130（Add Point貼り付けのCollision予測・警告）との
関係を調査した上で、Chart Mode上の「Collision」という言葉が指す現象を正しく
分類し、それぞれに妥当な解決方針を確定すること。

---

## 2. Scope（今回やったこと）

- Issue #94・Issue #81の実際のGitHub本文を取得し、現在のコード
  （chartmode.js / analysisCommands.js / app.js）と突き合わせて事実確認した
- 「Collision」に複数の異なる現象があることを発見し、Type A / Type B /
  Stage 2（#81）として分類を確立した
- 4つの貼り付け経路（Add Point貼り付け・そのまま貼り付け＝Ctrl+V・
  範囲に合わせて貼り付け・Ctrl+V）の実装を精査し、「そのまま貼り付け」と
  「Ctrl+V」が同一のCommand（`pasteAbsolute()`）であることを確認した
- 実データ（17曲分の`analysis/{id}.json`）を使い、貼り付け時にCollisionが
  どの程度・どんな形で発生しうるかを統計的に検証した
- 実際のユーザー報告（範囲に合わせて貼り付け＋狭い範囲での実例）から、
  `pasteSelectionCommand`にPhase130相当のCollision検出が存在しない
  という具体的な抜け漏れを特定した
- Type Aの解決方針について、Authorityを変更する案（duration調整）と
  Projectionのみで解決する案（スロット配分）の両方を検討し、後者を
  採用する方向で設計を固定した
- 新設する配分ロジックの設計を`chart-slot-allocation-design.md`として
  切り出し、次フェーズへの引き継ぎ設計ドキュメントとした

---

## 3. Out of Scope（今回はやらないと決めたこと）

- Type A（Slot Collision）の解決アルゴリズム自体の実装
  → 次フェーズ（Phase134想定）で実データ検証の上、確定する
- Issue #81（Pickup Measureの視覚圧縮衝突）への対応
  → 今回の調査でType A・Type Bとは意味論が異なることを再確認した上で、
    引き続き別Issueとして分離した（architecture.md §9.5の
    [PICKUP COLLISION SCOPE INVARIANT]の判断を踏襲）
- 拍子・表示解像度の拡張（変拍子・16ビート表示等）
  → 将来のFuture Issue候補として認識のみ。今回は着手しない
- Chart Modeのグリッドをコードデータ（analysis.json）に合わせて再構築する案
  → 「グリッドは音楽的な物差しであるべき」という理由から不採用と判断した
    （詳細は本文中の議論参照。次フェーズのスロット配分設計とは独立した論点）
- `pasteSelectionCommand`・`pasteFitAtEditPointCommand`への実装
  → 当初は「Phase130の予測・警告を追加するだけ」という小さい対応を
    検討したが、たかっちさんのProduct Intent確認により「確認するのでは
    なくCollisionを自動的に発生させない」方針へ変更されたため、
    次フェーズでのアルゴリズム確定後にまとめて実装する

---

## 4. Implementation（実装内容・事実）

**なし。** 本フェーズはコード変更を一切行っていない。

| 変更 | 内容 | ファイル |
|---|---|---|
| （実装なし） | — | — |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Ctrl+V（そのまま貼り付け）は現状維持

```
結論: pasteAbsolute() → buildPastePlan() / commitPastePlan()（Phase79〜111）
      は変更しない。確認モーダルも追加しない。

理由: buildPastePlan()は既に「新規優先・既存コード側を短縮/削除・
      複数既存コードにまたがる場合も正しく対応」を実現していることを
      コードで確認した（buffer全体をループし、fullyInside/overlapsStart/
      overlapsEnd/両側overlapの4分類を既存コード1件ごとに判定する設計。
      複数の既存コードにまたがるケースも自然に処理できる）。
      「上書き貼り付け」というCtrl+Vの操作自体にユーザーは既に同意して
      いるため、確認モーダルは冗長と判断した。
```

### [判断] Type A（Slot Collision）の解決方針をProjection層に限定する

```
結論: 貼り付けで生成するコードの実時間（start/end）は変更しない。
      「1拍1コード」の保証は、Chart Mode描画時のスロット配分ロジック
      （次フェーズで設計）によって実現する。

理由: Authority（analysis.raw）を変更する案（duration調整・端の
      トリミング等）も検討したが、実データ検証（17曲・2668ペア）で
      「既存コード列は99.96%が隙間なく連続している」ことが判明し、
      「既存を守りつつ新規側を縮める」というルールは、狭い範囲への
      貼り付けでは新規コードのほとんどを消してしまうことが分かった。
      Authority → Projection → Rendering というプロジェクト全体の
      設計原則にも、Projection層での解決の方が合致する。
```

### [判断] `chart-slot-allocation-design.md`として設計を分離・次フェーズへ送る

```
結論: N個のonsetをK個のスロットへ配分する具体的アルゴリズムは、
      本フェーズでは確定しない。

理由: 実装コストが見た目より大きいことが判明したため。当初「既存の
      remapPickupOnsetMap()（Pickup Measure用）を一般化すればよい」と
      考えたが、精査の結果remapPickupOnsetMap()自体は「衝突を解決する」
      関数ではなく「押し込んで1つだけ表示する」関数に過ぎないと判明した。
      つまり新設するのは既存機構の一般化ではなく、独立した新しい配分
      ロジックである。この事実を踏まえ、たかっちさんの判断により
      「設計だけ固定し、実装・検証は次フェーズで行う」という、
      Phase98（Section機能）・Phase122（Debug Recorder）と同じ
      運用パターンを採用した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 6.1 「そのまま貼り付け」と「Ctrl+V」は同一のCommandだった

キーバインド表（keybindings.md）とapp.jsを突き合わせた結果、UIメニューの
「そのまま貼り付け」ボタン（`aep-paste-absolute`）とキーボードの`Ctrl+V`は、
どちらも`pasteAbsolute()`を呼ぶ、完全に同一の経路であると判明した。
当初「4つの貼り付け経路」として整理していたが、実体は3つのCommandである。

### 6.2 Collisionには構造的に異なる3種類が存在する

```
Type A（Slot Collision）: 実時間は重ならないが、拍検出由来のグリッドで
  同じ表示スロットに丸め込まれる。durationを縮めても解決しない
  （quantizeはonsetのstart時刻のみを見るため）。
  pasteFitAtEditPointCommand・pasteSelectionCommandで発生しうる
  （構造上、Type Bは発生しない）。

Type B（Time-Overlap Collision）: 実時間そのものが重複する。
  buildPastePlan/commitPastePlan（Ctrl+V）のみで発生しうる
  （他の2経路は、貼り付け先の時間窓を自前で確保してから敷き詰める
  設計のため、構造的にType Bが起こりえない）。

Stage 2 Collision（Issue #81）: Pickup Measureの視覚圧縮表示による
  別種の衝突。Phase92の時点で意図的にType Aとは別スコープとされている。
```

3つとも「Collision」という同じ言葉を使うが、原因も解決手段も異なる。
この区別を明示していないと、性質の異なる問題を同じ解決策で扱おうとする
リスクがあることを、今回の調査過程自体で実感した。

### 6.3 実データ検証（17曲・analysis/{id}.json）

```
・隣接コード間のgap: 2668ペア中2667ペアが完全に連続（gap=0秒）
・貼り付け長D別、複数の既存コードにまたがる確率（ランダム位置サンプリング）:
    D=0.5小節: 57.6%　D=1小節: 85.3%　D=2小節: 96.0%　D=4小節: 99.1%
・「既存コードの端だけと重なる」単純ケースは理論上0%
  （bufferが隙間なく連続しているため、境界を越えた瞬間に必ず次の
  既存コードにも突入する。単純な境界トリムだけでは済まない）
```

この結果により、「既存コードを一切変更せず新規側だけ縮める」というルールは
Ctrl+Vには適用しにくい（新規側のほとんどが消える）ことが判明し、
上記5.の設計判断につながった。

### 6.4 ユーザー実例による`pasteSelectionCommand`の抜け漏れ発見

「範囲に合わせて貼り付け」で狭い範囲に複数コードを敷き詰めた際、
既存コードの頭がCollisionになる、という実際の使用報告があった。
コード確認の結果、`pasteFitAtEditPointCommand`には存在する境界Collision
予測（`predictFitPasteCollision()`）が、`pasteSelectionCommand`には
一切実装されていないことを確認した。当初はこの抜け漏れに
`predictFitPasteCollision()`をそのまま再利用して警告を追加する案を
検討したが、Product Intentの確認により方針を変更した（5.参照）。

---

## 7. Remaining Issues（残課題）

- 「1拍1コード」を実現する具体的な表示モデル自体が、次フェーズでまだ
  何も確立されていない（Phase133で確定したのはAuthority/Projectionの
  役割分担とN>K拒否のみ。配分方法・適用範囲・タグの要否はすべて未確定）
- `pasteSelectionCommand`・`pasteFitAtEditPointCommand`への実装は未着手
- N > Kで貼り付けを拒否する際のユーザー向けメッセージは未設計

---

## 8. Next Phase（次フェーズ開始位置）

Phase133で確定したのは「Authorityの実時間データを変更せず、Projection側
（Chart Mode描画）で解決する」という方針、およびN>Kでの貼り付け拒否まで
である。具体的な配分方法・適用範囲・タグの要否は**未確定**。

次フェーズの最初の目的は、特定のアルゴリズム（比例配分・最大剰余方式等）を
実装することではなく、**実データを使って「1拍1コード」を自然に実現する
Chart Modeの表示モデルを確立すること**である。
`chart-slot-allocation-design.md`の§4（現時点では候補の例示に過ぎない）・
§7「次にこのメモを開く時にやること」を参照。

---

## 9. Files Changed（変更ファイル一覧）

```
docs/handover/active/handover_phase133.md（新規）
docs/chart-slot-allocation-design.md（新規）
```

コード（js/*.js）の変更は一切なし。

---

## 10. Micro Log

（本フェーズはExploration/Technical Designのみのため省略。詳細は本文の
Findings・Design Decisionsに整理済み）

---

## Issue状態変更記録
- 今回closeしたissue: なし
- 今回新規に積み残したissue: なし（Issue #94・#81はいずれもOpenのまま。
  #94は「Type Bはbuildpastplanで解決済み・Type Aは次フェーズで対応」と
  いう形で引き続きOpen。#81は今回のスコープ外として現状維持）

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: Chart Mode Onset Slot Allocation（範囲に合わせて貼り付け時の
  Slot Collision解消・設計固定済み）
  状態: 設計固定済み（Phase133）。実装はPhase134以降
  内容: 「範囲に合わせて貼り付け」で複数コードを狭い範囲に敷き詰めた際、
  Chart Mode表示上のスロット衝突（Type A・Slot Collision）が発生し、
  隠れたコードを手動で削除する必要がある問題。詳細設計は
  `docs/chart-slot-allocation-design.md`参照。GitHub Issue #94に対応する
  部分的解決（Type Bはbuildpastplanで既に解決済みと判明したため対象外、
  Type Aのみ残課題）。

#### MODIFY
- 見出し: なし

#### CLOSE
- 見出し: なし

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Chart Mode Collision実態調査・Type分類確立（Phase133・GitHub Issue #94。
    Collisionを Type A（Slot Collision）／Type B（Time-Overlap Collision）／
    Stage 2（Issue #81）に分類。Type BはbuildPastePlan/commitPastePlan
    （Ctrl+V）が既に正しく解決済みと判明し対応不要。Type Aは実データ検証を
    経て、Authorityを変更せずProjection層で解決する方針を確定し、
    具体的な配分アルゴリズムはchart-slot-allocation-design.mdへ設計を
    分離して次フェーズへ送った。コード変更なし）

- Major Milestones（Analysis Editorテーブルへ追加候補）:
  | 133 | Chart Mode Collision実態調査・Type分類確立（GitHub Issue #94。
    Type A/B/Stage2の分類確立・Ctrl+Vは既存実装で解決済みと確認・
    Type Aの解決方針をchart-slot-allocation-design.mdへ設計分離） |
    docs/chart-slot-allocation-design.md（新規・コード変更なし） |

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
