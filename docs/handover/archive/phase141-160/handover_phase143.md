# 引き継ぎ: Phase143完了 --- Section編集時の名前表示

## 最重要（次のChatへ）

-   **Phase143 D（Section編集時の名前表示）は実装・実機確認・PR
    mergeまで完了。**
-   PR **#133** `feature/phase143-section-name → main`
    をmerge済み。リモートの作業ブランチも削除済み。
-   Phase143では、Slot / 編集経路でも
    **Section名を常時表示**し、Section開始位置を示す開始線も表示する仕様を実装した。
-   Section Model / Authority / 保存形式は変更していない。
-   `buildSectionMarkerProjection()` はContinuous /
    Slotで共通利用している。違いは主として **Rendering（描画）**
    にある。
-   Phase143の実装では、新しいState / Authorityを追加していない。
-   次Phaseでは、Phase143の未確定事項（特にSection名の最小表示幅32px）を必要に応じて扱う。

------------------------------------------------------------------------

## 1. Phase143の目的

Phase142から持ち越した D：

> **Sectionを編集中でも、Section名をユーザーが確認できるようにする。**

当初の設計では「現在PreviewしているSectionの名前を表示する」方向に寄ったが、実機確認前の設計整理で、ユーザーが意図していた仕様はより広いことが明確になった。

### 最終仕様

  Chart Mode / 状態        Section名                     Gold Preview
  ------------------------ ----------------------------- --------------------
  Continuous（通常表示）   既存どおり                    既存どおり
  Slot / 編集中            **すべてのSection名を表示**   なし
  Slot / Preview中         **すべてのSection名を表示**   既存のGold Preview
  Preview終了後            **すべてのSection名を表示**   なし

-   Section名の表示は `_previewSectionId` に依存しない。
-   「Section boundary line
    display」設定のON/OFFに従い、Section名と開始線をまとめて表示/非表示する。
-   SlotではContinuousと同じようなHeader
    lane（ヘッダー用の専用領域）は追加しない。
-   行高・`scrollTop`・既存のSlot操作領域を変更しない。

------------------------------------------------------------------------

## 2. 設計上の重要な整理

### Authority → Projection → Rendering

Phase143で重要だったのは、**Projection（導出）を共通化し、Rendering（描画）はChart
Modeごとの制約に合わせて分ける**という整理。

#### Authority（正本）

Slot / 編集中のSection情報は、保存済み `analysis.raw.sections`
を直接読むのではなく、

-   `getSections(analysisEditor)`
-   `analysisEditor.buffer`

を利用する。

これにより、編集中のRename / 境界変更 /
Deleteなどを最新状態として扱える。

#### Projection（導出）

既存の

``` js
buildSectionMarkerProjection(chords, sections)
```

をContinuousとSlotで共用。

Sectionの開始位置を示すprojectionから、Slot側では必要な

``` text
chordId
label
colorToken
```

を取り出す。

#### Rendering（描画）

ContinuousとSlotでは画面構造が異なるため、描画処理は共通化しない。

-   Continuous：既存のSection Marker構造を使用
-   Slot：行単位のSection layerをOverlayとして構築

これは重複設計ではなく、**同じProjectionを異なるRendering制約へ適用する設計**として整理された。

------------------------------------------------------------------------

## 3. Slot側の表示仕様

### Section名

Section開始位置から、同一行内の次のSection開始位置まで、または行末までを候補範囲として使用。

配置候補は次の順序。

1.  実際のSection開始位置
2.  入らない場合は同一行の次のMeasure head（小節先頭）
3.  それでも入らない場合は次の行のhead
4.  物理的に配置できない場合は名前を非表示にし、開始線は残す

Section名同士の重なりは避ける。

文字幅は実際のDOM上の文字幅を測定して判断する。

### 最小幅

現在は安全策として **32px** を使用。

これはPhase143時点では最終仕様として固定していない。

特に4列表示など狭い条件では、短いSection名でも表示幅が不足するケースがある。

例：

-   Pre-Chorus：4列時に約14.9pxしか確保できず非表示
-   1〜3列では表示可能

したがって、**32pxを最終値として確定するか、別の表示ルールにするかは後続判断**。

------------------------------------------------------------------------

## 4. Section開始線

Section名だけを開始位置から離れた場所へ移動すると、ユーザーから見て「どこから始まるSectionなのか」が分かりにくくなるため、Slot側にも実際のSection開始位置を示す線を追加。

-   Sectionの実際の開始位置に配置
-   既存のSection start offsetを利用
-   描画専用であり、Section位置そのものは変更しない
-   `pointer-events: none`
-   行高を変更しない

開始線とSection名の間に視覚的な関係を作ることで、Section名を次のMeasure
head等へ移動した場合でも開始位置を追跡できるようにした。

------------------------------------------------------------------------

## 5. 実装

### `app.js`

`buildSectionNameLabels()` を追加。

役割：

-   編集中のSection情報を取得
-   `buildSectionMarkerProjection()` を再利用
-   Section開始Anchorだけを取り出す
-   空名前を除外
-   `chordId / label / colorToken` をChart Modeへ提供

`initChartMode()` に `getSectionNameLabels` として渡す。

### `chartmode.js`

Slot描画時にSection名Projectionを取得。

-   行単位のSection layerを生成
-   MeasureごとのSection cellを生成
-   Section開始線を実際の開始slotに配置
-   Section名の配置候補を計算
-   実測した文字幅と既存Section名の配置状況をもとに重なりを回避

既存のSection PreviewやBoundary Handleとは別系統。

### `css/chart.css`

Slot用Section layer / marker / labelの表示を追加。

-   absolute overlay
-   `pointer-events: none`
-   row heightに影響しない
-   Silver edit modeでは既存テーマ上の視認性を考慮したSection color
    tokenを使用

------------------------------------------------------------------------

## 6. Validation（検証）

実機で以下を確認済み。

1.  Sectionを選択していなくてもSection名が表示される
2.  Preview中もSection名が残る
3.  Preview終了後もSection名が残る
4.  Section表示ON/OFFで名前・開始線が連動する
5.  同一Measure内に複数Sectionがある場合に名前が重ならない
6.  Renameが反映される
7.  Undo / Redoが追従する
8.  Section境界変更が追従する
9.  Section削除が追従する
10. 3テーマ（dark / silver / blue）で視認できる
11. Section開始位置のコード操作を妨げない
12. Row height / `scrollTop` に影響しない
13. Continuous表示に影響しない
14. 4列表示を含む狭い表示幅で確認

また、DOM上でSection名labelの生成状態と、狭幅時の実測幅も確認済み。

------------------------------------------------------------------------

## 7. 重要な設計上の教訓

### ProjectionとRenderingは「同じにする」のではなく、責務を分ける

Phase143の検討中に、

> なぜContinuousと編集/SlotでProjectionの仕組みが違うのか？

という疑問が出た。

調査結果として、**Projection自体はすでに共通化されている**。

違うのは主にRendering。

ContinuousにはSection Header
laneがあり、Slotは固定的なGrid（格子）構造と操作領域を持つ。

そのため、Renderingまで完全に同じ仕組みにすると、

-   行高への影響
-   `scrollTop` のずれ
-   SlotのHit Testing（操作対象判定）
-   Measure / Slotの固定レイアウトとの競合

などのリスクが増える。

したがって現時点では、

> **Authority（正本） → 共通Projection（導出） → Mode-specific
> Rendering（モード固有の描画）**

を維持する。

完全なRendering共通化は、必要性が出た場合に別Phaseで検討する。

------------------------------------------------------------------------

## 8. Phase143で得られた開発プロセス上の教訓

今回、Technical
Design（技術設計）自体は実装可能な粒度まで整理できたが、最初の設計ではユーザーが期待していたUXの範囲とずれが生じた。

原因は、技術設計の中にUX上の判断材料が多く含まれ、ユーザーが「現在のPreviewだけの名前表示」と「編集中も全Section名を表示する」という差を容易に判断できなかったこと。

そのため今後、UI変更ではIssue / User Intent段階で、

> **Visual / Behavior Reference（画面・動作イメージ）**

を用意し、

-   何が見えるか
-   いつ見えるか
-   何が変わらないか
-   代表的な状態でどう見えるか

を先に共有する。

Technical Designは、そのUXを**どう実装するか**に集中する。

------------------------------------------------------------------------

## 9. 残課題

### Phase143内で未確定

-   Section名の最小表示幅 **32px** の最終値
-   物理的に配置できない場合の「名前非表示＋開始線」の扱いを、今後さらにUXとして調整するか
-   空名前Sectionでは開始線を出さず、名前も出さない現在仕様を維持するか

これらはPhase143のmergeを妨げる問題ではない。

### Phase143の範囲外

-   Continuous / SlotのRendering完全共通化
-   Section Model変更
-   Authority変更
-   保存形式変更
-   Section Projectionそのものの再設計

------------------------------------------------------------------------

## 10. Git / PR

-   PR: **#133**
-   Branch: `feature/phase143-section-name`
-   Base: `main`
-   PR head: `4c06de10a90c6fa3dc85f0f7ceecb6fc6f549fb8`
-   PR: **merge済み**
-   リモート作業ブランチ: **削除済み**

次のローカル確認：

``` bash
git switch main
git pull
git status
```

`main` が `origin/main` と同期し、working
treeがcleanであることを確認する。

------------------------------------------------------------------------

## 11. 次のChatへの開始情報

Phase143は完了。

次Phaseでは、まずPhase143の未確定事項を必要なら確認したうえで、次のUser
Intentを定義する。

特に、Phase143で得られた以下の方針は維持する。

``` text
Authority
   ↓
Projection
   ↓
Rendering
```

-   SectionのAuthorityを増やさない
-   ProjectionとRenderingを混同しない
-   UI変更では、Technical
    Designの前にユーザーが見た目・動作を確認できる材料を用意する
-   実装前にUX上の未確定事項を残さない
-   実装後はLogicだけでなく実機表示までValidationする

Phase142のhandoverにあった「Section編集中の名前表示」は、Phase143で完了済みとして扱う。
