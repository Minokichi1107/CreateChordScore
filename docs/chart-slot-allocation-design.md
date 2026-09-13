# Chart Mode: Onset Slot Allocation 設計メモ

> **位置づけ**: Phase133のExploration/Technical Designで起票した設計メモ。
> section-model.md・debug-recorder-design.mdと同じ運用パターン
> （設計固定のみ・コード変更は次フェーズ）を踏襲する。
>
> ステータス: **設計固定中（Phase133・Design Freeze）。実装・アルゴリズム
> 検証はPhase134以降。**

---

## [DOCUMENT AUTHORITY]

```
本ファイルは、Chart Modeにおける「N個のonsetをK個の表示スロットへ
どう配置するか」という設計判断を集約する設計ドキュメントである。

architecture.mdには概要と本ファイルへの参照のみを記載し、設計内容を
重複して保持しない（section-model.md・debug-recorder-design.mdと同じ方針）。
```

---

## 0. 経緯（1行で）

「範囲に合わせて貼り付け」で複数コードを狭い範囲に敷き詰めた際、末尾のコードが
極端に短くなりChart Mode上のグリッド（表示スロット）で隣接コードと衝突する、
という実運用上の報告から出発した。調査の過程で、この現象は「実時間の重複」
ではなく「拍検出（beats/downbeats）とコード検出（chords）という**別々の
AI解析結果**を、表示グリッド上で量子化した際に生じる衝突」であることが
判明した（本ファイルでは以後これを Slot Collision と呼ぶ）。

---

## 1. 確定したProduct Intent

```
範囲に合わせて貼り付けた結果、Chart Mode上で1拍（1スロット）の中に
コードが1つだけになる状態を自動的に作り、後からCollisionの
ゴミ掃除（隠れたコードを手動で探して削除する作業）を不要にする。
```

---

## 2. 確定したアーキテクチャ方針

以下はPhase133で確定した制約であり、次フェーズでの検証もこの制約の中で行う。

```
[方針1] Authority（analysis.raw / buffer上の実時間データ）は変更しない
  貼り付けで生成されるコードのstart/endは、これまで通り実時間（秒）で
  正確に計算された値のままとする。表示上の衝突解決は、この実時間データを
  書き換えることでは行わない。

[方針2] 解決はProjection層（Chart Mode描画）側で行う
  「どのコードをどのスロットに表示するか」は、Authorityとは独立した
  Chart Mode側の導出ロジックとして持つ。

[方針3] N（貼り付けコード数）> K（対象区間の表示スロット数）の場合は、
        貼り付けを拒否する
  「1スロット1コード」を無理に守ろうとして複数コードを1スロットへ
  押し込めば、防ぎたかったCollisionを別の形で再生産するだけである。
  この場合はユーザーへ「この範囲には収まりません」等を伝え、
  データは一切変更しない。

[方針4] Issue #81（Pickup Measureの視覚圧縮衝突・Stage 2 Collision）とは
        現時点で分離する
  Pickup Measure専用の remapPickupOnsetMap() / projectPickupSlotIndex()
  （Phase68・architecture.md §9.5）には触れない・依存しない。
  将来的にこの設計が一般化され#81にも使える可能性はあるが、
  Phase133〜134の対象には含めない。
```

---

## 3. Collisionの分類（このドキュメントでの用語整理）

Phase133の一連の調査で、Chart Mode上の「Collision」という言葉には
複数の異なる現象が存在することが判明した。混同を避けるため整理する。

```
Type A: Slot Collision（本ファイルの主題）
  実時間では重ならない2つのonsetが、拍検出由来のグリッドへ量子化した際、
  同じ表示スロットに丸め込まれる。原因は「拍検出（beats/downbeats）」と
  「コード検出（chords）」が別々のAI解析結果であり、両者が完全に
  一致する保証がないこと。durationを縮めても解決しない
  （quantizeはonsetの開始時刻のみを見るため）。

Type B: Time-Overlap Collision（Phase133で別途調査・対応済み）
  実時間そのものが重複する。「そのまま貼り付け（Ctrl+V）」でのみ発生。
  既存のbuildPastePlan()/commitPastePlan()（Phase79〜111）が
  「新規優先・既存側を調整（短縮・削除）」という形ですでに正しく
  処理済みであることをPhase133で確認した。本ファイルの対象外。

Stage 2 Collision（Issue #81・対象外）
  Pickup Measureの視覚圧縮表示によって、複数のonsetが同一の
  visual slotへ集約される際に生じる。remapPickupOnsetMap()が
  既に持つ仕組みだが、衝突を「解決」はしておらず、Phase92の
  Collision Indicatorと同じく「1つだけ表示・残りは検出のみ」という
  設計のまま。本ファイルが新設する配分ロジックとは独立した仕組みとして
  維持する。
```

---

## 4. 次フェーズで確立する表示モデル（現時点では未着手・候補の列挙のみ）

Phase133で確定したのは §2 の方針（Authorityは変更しない・Projection層で
解決する・N>Kは拒否する）までである。**「1拍1コードをどう実現するか」
という表示モデル自体は、まだ何も決まっていない。**

以下に挙げるアルゴリズム名・適用範囲は、あくまで議論の過程で出た
「考えられる方向性の例」であり、次フェーズで採用する仕様ではない。
次フェーズは、これらの案から1つを選ぶ作業ではなく、実データを見ながら
「1拍1コードをどう実現すれば音楽的・UX的に自然か」という表示モデル
そのものを確立する作業として位置づける。

### 4.1 議論の中で出た方向性の例（採用が決まったものではない）

以下はいずれも「こういう考え方もありうる」という例示に過ぎず、
次フェーズの出発点として固定するものではない。次フェーズは実データを
見た上で、ここに挙げていない方式を新たに検討してもよい。

```
例1: 比例配分（最大剰余方式 / Largest Remainder Method）
  各onsetに最低1スロットを保証した上で、残りのスロットをratioの
  大きい順に追加配分する、という考え方の例。選挙の議席配分に近い。

例2: その他
  次フェーズで実データを見ながら、例1にとらわれず検討する。
```

なお、**N ≤ K であることは前提となる**（N > Kは§2方針3により
貼り付け自体を拒否するため、表示モデルの対象外）。

### 4.2 適用範囲の候補

```
候補A: タグ付き方式
  貼り付けで生成されたN個のコードに、同じ貼り付け操作由来であることを
  示す目印（例: pasteGroupIdのようなフィールド）を持たせ、Chart Mode側は
  そのグループ単位でのみ配分し直す。
  → buffer（Authority）に新しいフィールドが増える。
  → 適用範囲が貼り付けブロックに限定され、挙動の予測がしやすい。

候補B: 無タグ方式
  目印を持たせず、Chart Mode描画時に「onsetが密集して衝突している
  連続区間」をその場で検出し、区間ごとに配分し直す。
  → bufferには一切触れない（Authorityの純度は候補Aより高い）。
  → 貼り付け以外の場所（元々密集していた既存データ）にも
    自動的に効いてしまう可能性があり、挙動の予測範囲が広がる。
```

候補A/Bのどちらが妥当かは、次フェーズで実データ（既存プロジェクトの
analysis.raw.chords）を使い、実際にどの程度・どんな形で密集区間が
発生するかを確認してから判断する。

---

## 5. Named Invariant（候補）

次フェーズで実装に着手する際、以下のような原則を確立することを想定している
（名称・文言は次フェーズで確定）。

```
[ONSET SLOT ALLOCATION SCOPE]（仮称）
新設する配分ロジックはProjection層の純粋関数であり、buffer（Authority）の
start/endを一切変更しない。canonical timing（quantize結果）も変更しない。
Pickup Measure専用のremapPickupOnsetMap()/projectPickupSlotIndex()とは
独立した別の仕組みであり、両者を混同・共有しない（#81とは別スコープのまま）。
```

---

## 6. 関連Issue・関連ドキュメント

```
- GitHub Issue #94（Chart Mode：Collisionで裏側に隠れたコードを自動削除する）
  → 当初の要望から出発したが、調査の結果、Ctrl+Vのケース（Type B）は
    既存実装ですでに解決済みと判明。本ファイルの対象は「範囲に合わせて
    貼り付け」由来のType A（Slot Collision）に絞り込まれた。
- GitHub Issue #81（Chart Mode: Pickup Measureのvisual compression
  collision対応）→ 本ファイルの対象外。ただし本ファイルの配分ロジックが
  将来的に転用できる可能性がある関連Issueとして記録しておく。
- architecture.md §9.5（Chart Mode projection layer・
  [PICKUP COLLISION SCOPE INVARIANT]）
- analysisCommands.js: pasteSelectionCommand() / pasteFitAtEditPointCommand()
  （Slot Collisionが発生しうる貼り付け経路）
- chartmode.js: predictFitPasteCollision() / resolveCollision() /
  remapPickupOnsetMap()（関連する既存Projection関数）
```

---

## 7. 次にこのメモを開く時にやること（Phase134候補）

- [ ] **最初にやること**: 実データ（複数プロジェクトのanalysis.raw.chords）
      を使い、「1拍1コード」を音楽的・UX的に自然な形で実現する表示モデルを
      確立する。§4.1に列挙した例（比例配分等）はあくまで議論の出発点であり、
      これらを実装することが目的ではない。実データを見た結果、
      §4.1にない別の方式が適切と判断されれば、そちらを採用してよい
- [ ] 表示モデルが定まった後、適用範囲（タグ付き方式か無タグ方式か。
      §4.2はこちらも例示に過ぎない）を、実データでの検証結果を踏まえて決定する
- [ ] N > Kで拒否する際のユーザー向けメッセージを設計する
- [ ] pasteSelectionCommand（範囲に合わせて貼り付け）への実装方法を
      Technical Designとして確定する
- [ ] pasteFitAtEditPointCommand（Add Point貼り付け）にも同じ設計を
      適用するかを判断する（構造上は同じSlot Collisionが起こりうる）
- [ ] 実装完了時、architecture.md §9.5へ本ファイルへの参照リンクを追記する
      （section-model.md・debug-recorder-design.mdと同じ運用パターン）
