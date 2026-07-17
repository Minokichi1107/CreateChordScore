# 引き継ぎ: Phase79 Sprint2-1完了 — Selection Highlight実装 + Forward Wall Model最終化

## 作業状態
- 直前作業: Phase79 Sprint1完了（Paste Insert：そのまま貼り付け）
- ブランチ: phase79-sprint2-decorator-layer（想定・実際のブランチ名に合わせて読み替え）

---

## 1. Purpose（目的）

Phase79 Sprint2（Decorator Layer）の最優先項目である Selection Highlight を実装する。
継続セル（carry）を含むコード単位のハイライトを実現し、Phase78以来「継続セルまで
ハイライトされず選択範囲が認知しづらい」という課題を解消する。

作業の過程で、Sprint1で確定したはずの Forward Wall Model（範囲シフト）に
可逆性の欠陥が見つかり、大幅な再設計が発生した。本フェーズはSelection Highlightと
Forward Wall Model最終化という2つの大きな成果を含む。

---

## 2. Scope（今回やったこと）

```
① UI表記の微調整（Sprint1の続き）
   ・Add Here → 挿入
   ・そのまま貼り付け → 貼り付け上書き（アイコンを📌→📑）
   ・「◯件選択中」等の「件」表記 → 「コード」／数字のみへ統一

② Forward Wall Model の再設計（範囲シフトの可逆性問題を修正）
   ・不変条件の確認（chordIdsのbuffer順正規化）
   ・「prevChord.end / tailChord.start のみ可変」モデルへ全面書き換え
   ・UI Constraint（Chart Modeの1スロット未満描画不可問題への対処）追加
   ・矢印キーの再設計（選択数に応じた自動切り替え・Ctrl+Shift+矢印で全体移動）

③ Decorator Layer設計方針の確定
   ・パイプライン方式・Map・ヘルパー関数はすべて見送り
   ・「必要になってから抽象化する」方針を明文化

④ Selection Highlight実装（chartmode.js / components.css）
   ・expandToSlots()は変更せず純粋データ生成のまま維持
   ・_renderChartGrid()のslotループをfor...ofからインデックス付きforへ変更
   ・onset/carry共通でownerId判定・小節内でisFirst/isLast判定
   ・chart-chord-name--selected を chart-chord-name--selected-text に改名し、
     Boundary Handle（::before）を削除（責務分離）

⑤ カラートークン新設・複数ラウンドの実機調整
   ・--color-selection / --color-selection-bg（Selection Highlight専用）
   ・--color-edit-point / --color-edit-point-bg（EditPoint専用）
   ・3テーマ（dark/silver/blue）それぞれで実機フィードバックを反映

⑥ 副次的に発見した3テーマ横断バグの修正
   ・blueテーマの--text-secondaryが--text-chordとほぼ同値だった設定ミス
   ・projectionEmpty休符アイコンの色（text-secondary→text-muted）
   ・blueテーマに--color-greenの上書きが存在しなかった件（保存ボタン視認性）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Boundary Handle の正式実装
  → Sprint2-2へ。今回はchart-chord-name--selected-textから::beforeを
    削除したのみで、代替の描画はまだ存在しない（現状ハンドル非表示）。

・EditPoint Marker の形状・統一描画
  → 色（amber→紫系）のみ調整。Phase77由来の暫定的な破線枠のまま。
    Boundary Handleと統一的な描画にする作業はSprint2-2以降。

・Decorator パイプライン化
  → 「Selectionだけ先に作り、Boundary/EditPointで重複が見えたら
    共通化する」という方針を確定。今回は導入しない。

・シフト量（矢印キー個別/範囲移動）の可逆性の完全保証
  → Forward Wall Modelの可逆性は「単純な往復」でのみ保証される。
    Undo/Split/Delete/Paste/Merge等、他の編集操作と組み合わせた場合の
    挙動までは保証しない（docstringにも明記済み）。
```

---

## 4. Implementation（実装内容・事実）

### 4.1 Forward Wall Model 最終形（app.js）

| 変更 | 内容 |
|---|---|
| `_getMinSlotDuration(atTime)` 新設 | Chart Modeの1スロット分の時間長を返すヘルパー。`chartState.viewModel.model`のquantize/getMeasure/slotsPerMeasureを利用 |
| `shiftSelectionRange()` 全面書き換え | 可変なのは「選択範囲の直前のコード（prevChord.endのみ）」と「選択範囲の末尾コード（tailChord.startのみ）」の2箇所だけ。それ以外（内部・nextChord）は方向に関わらず一切変更しない |
| 矢印キーハンドラ書き換え | 選択数で自動切り替え（単一→個別移動／複数→範囲シフト）。Shift併用で0.5秒刻み。Ctrl+Shift併用でshiftAll（全体移動） |

### 4.2 Selection Highlight（chartmode.js / components.css）

| 変更 | 内容 |
|---|---|
| `_renderChartGrid()`のslotループ | `for (const slot of measureSlots)` → `for (let si = 0; si < measureSlots.length; si++)`（前後のslot参照のため） |
| Selection Highlight本体 | switch文（onset/carry生成）の後・appendChildの前に追加。ヘルパー関数は作らず、その場でownerId／prevOwner／nextOwnerを算出 |
| `.chart-slot--selected` / `--selected-start` / `--selected-end` 新設 | components.cssに追加。小節ごとに枠を区切り、背景色は連続させる |
| `chart-chord-name--selected` → `chart-chord-name--selected-text` | 責務分離。文字強調のみに限定し、`::before`（Boundary Handle相当）を削除 |

### 4.3 カラートークン（theme.css）

| トークン | dark | silver | blue |
|---|---|---|---|
| `--color-selection` | `#7FFFD4` | `#2EA87D` | `#1F8F68` |
| `--color-selection-bg` | `rgba(127,255,212,.44)` | `rgba(46,168,125,.22)` | `rgba(31,143,104,.22)` |
| `--color-edit-point` | `#C77DFF` | `#8B3FD1` | `#8034C2` |
| `--color-edit-point-bg` | `rgba(199,125,255,.22)` | `rgba(139,63,209,.18)` | `rgba(128,52,194,.18)` |

### 4.4 3テーマ横断バグ修正（theme.css / components.css）

| バグ | 修正 |
|---|---|
| blueテーマの`--text-secondary`が`--text-chord`とほぼ同値（`#d1e3ff`） | `#1c3854`へ修正（primary/secondary/mutedの明度階調をsilverと揃えた） |
| projectionEmpty（弱起小節の空白）の休符アイコンがblueテーマで見えない | `.chart-slot--projection-empty`の`color`を`--text-secondary`→`--text-muted`へ変更 |
| blueテーマに`--color-green`の上書きがなく保存ボタンが視認しづらい | `--color-green: #0F8A3D` / `--color-green-rgb: 15,138,61`を追加 |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] Forward Wall Model：「prevChord.end / tailChord.start のみ可変」モデルの採用

```
経緯:
  当初のForward Wall Model（Phase79前半）は「進行方向のコードは絶対不変・
  来た方向のコードが吸収する」という設計だったが、実機テストで
  「右シフトで選択範囲外のE（後続コード）が動く」という違和感が報告された。

  調査の結果、これは仕様通りの動作だったが、ユーザーの直感
  （「編集対象は選択したコードだけ」）とは一致しなかった。

  最終的に「選択範囲の直前・末尾の2箇所だけが可変、それ以外は方向に
  関わらず一切不変」というモデルに収束した。これは状態管理（Origin-Anchored
  方式で検討されたsnapshot/totalDelta等）を一切追加せずに実現できる、
  という利点がある（prevChord.startとtailChord.endに一度も書き込まない
  ため、往復すれば自動的に元の値へ戻る）。

理由:
  ・ユーザーの直感（選択したコードだけが変化する）と一致する
  ・更新対象が常に同じ2箇所（prevChord.end / tailChord.start）で、
    方向によって処理が変わらないためコードが単純
  ・追加の状態管理が不要（Origin-Anchored方式は不採用）
```

### [判断] UI Constraint（最低1スロット分の残存長）を導入

```
結論:
  shiftSelectionRange()の衝突判定を、理論上のゼロ（EPS）ではなく、
  Chart Modeの1スロット分の時間長（_getMinSlotDuration()）でクランプする。

理由:
  Chart ModeのresolveCollision()は、1スロット内で複数onsetが衝突した場合
  durationの長い方を採用する設計になっている。範囲シフトでprevChord/
  tailChordを理論上ゼロ近くまで縮めると、この衝突解決により描画対象から
  脱落し、選択ハイライトも表示できなくなることが実機テストで判明した。
  これはForward Wall Model自体の仕様ではなく、現行のChart Modeレンダラー
  との整合性を保つための制約として位置付けた。
```

### [判断] Decoratorパイプライン・ヘルパー関数・Mapは今回作らない

```
結論:
  Selection Highlightの実装にあたり、当初検討していた
  ・Decoratorパイプライン（複数Decoratorを順に適用する仕組み）
  ・computeSelectionSegments()のような専用ヘルパー関数
  ・slotオブジェクトをキーとしたMap
  は、いずれも導入しなかった。ownerId判定・isFirst/isLast判定は、
  _renderChartGrid()のswitch文の直後でその場で計算している。

理由:
  現時点でDecoratorはSelectionの1種類しかなく、抽象化の恩恵よりも
  コードの追いやすさを優先すべきと判断した。Boundary Handle・
  EditPoint Markerの実装時に同種のロジックが2箇所以上に現れたら、
  その時点で共通化する（「必要になってから抽象化する」方針）。
  Origin-Anchored Shiftを見送った時と同じ判断基準。
```

### [判断] `chart-chord-name--selected`の責務分離（C案の採用）

```
結論:
  旧`chart-chord-name--selected`は「文字強調」と「Boundary Handle
  （個別移動の左端ハンドル）」の2つの責務を1つのクラスが兼ねていた。
  `chart-slot--selected`の新設を機に、`chart-chord-name--selected-text`
  へ改名し、文字強調のみに責務を絞った。`::before`（Boundary Handle部分）
  は削除した。

理由:
  A案（新旧ハイライトの二重表示を許容）は「Selection Highlightだけ作る」
  と言いながら実質2つのハイライトが重なる状態になり評価しづらい。
  B案（Boundary Handleまで設計変更）はSprint2-2の作業に前倒しで
  踏み込むことになりスコープオーバー。
  C案（責務だけ分離・Boundary Handleロジックには触れない）が
  最も変更範囲が小さく、Sprint2-1のスコープを超えなかった。
```

### [判断] EditPointの色を黄色系から紫系へ変更

```
経緯:
  EditPointマーカーの色は当初amberを流用していたが、Selection Highlightと
  混同されるため分離することにした。黄色系（#FFE066→#FFEB3B）を試したが、
  silver/blueテーマ向けに暗く調整すると「茶色」に見えてしまい、amberとの
  区別が付かないという指摘が複数回発生した。

  実機での`getComputedStyle`確認により、CSS自体は正しく反映されている
  ことを確定した上で、これは実装のバグではなく「暗い黄色は知覚的に
  茶色化する」という色の物理的な性質による構造的な問題と判断した。

結論:
  色相を黄色系から紫系へ変更した（dark: #C77DFF / silver: #8B3FD1 /
  blue: #8034C2）。紫は暗くしても茶色化せず、amber・
  --color-selection（緑）・--color-blue（再生位置ハイライト）の
  いずれとも被らない。

教訓:
  「暗くしてコントラストを確保する」という調整は、色相によっては
  別の色（黄色→茶色）に知覚されてしまうリスクがある。今後同様の
  トークン調整をする際は、暗くする前に色相自体を再検討する視点を持つ。
  同種の現象は本フェーズ内で--color-green（暗くしすぎて青に見えた）
  でも再発した（5.末尾の教訓参照）。
```

### [判断] 矢印キーの役割：選択数で自動切り替え＋Ctrl+Shiftで全体移動

```
結論:
  矢印キー: 単一選択→個別移動／複数選択→範囲シフト（対象を自動判定）
  Shift+矢印キー: 同上・歩幅を0.1秒→0.5秒に拡大（既存の「歩幅を大きくする」
    という意味を維持）
  Ctrl+Shift+矢印キー: 全体移動（shiftAll）。曲全体に影響するため、
    誤操作防止の観点であえて重い修飾キーの組み合わせにした

理由:
  「矢印は常に選択対象を動かす」というルールを最後まで一貫させることを
  優先した。Shiftを「全体移動」に転用する案も検討したが、対象が
  飛びすぎてUIの一貫性が崩れるため不採用。全体移動は使用頻度が低い
  操作でもあるため、誤操作防止に重きを置いたキー割り当てにした。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### Forward Wall Model：3段階の設計変遷

```
① 両側吸収モデル（Phase77後半・当初案）
   選択範囲の前後どちらの隣接コードも伸縮して吸収する。
   → 「選択していない後続コードが動く」という違和感が実機報告される。

② 進行方向固定モデル（Phase79前半）
   進行方向のコードは絶対不変、来た方向のコードが吸収する。
   → 「右シフトで縮んだコードが、左シフトで元に戻らない」という
     可逆性の欠陥が発覚。原因は「右と左で別の境界を操作している」ため、
     ステートレスなアルゴリズムでは数学的に両立し得なかった
     （境界①＝prevChord|選択範囲間、境界②＝選択範囲|nextChord間、
     という異なる2つの境界を、往復操作がそれぞれ別々に触るため）。
   → Origin-Anchored Shift（snapshot/totalDeltaによる状態管理）が
     一度提案されたが、「システムがシンプルであること」を重視する
     プロジェクト方針と衝突するため見送られた。

③ prevChord.end / tailChord.start のみ可変モデル（最終形・採用）
   ユーザー自身の「選択した範囲の前のコードと右端のコードの長さだけ
   可変にしたい」という提案がきっかけで発見された。常に同じ2箇所
   （prevChord.end / tailChord.start）だけを更新するため、
   状態management不要で可逆性も自動的に満たされる。
```

### EditPoint色調査：CSS自体は最初から正しく反映されていた

```
「色を変えても見た目が変わらない」という報告が複数回続いたが、
`getComputedStyle()`での実測により、CSS変数もoutline-colorの
計算値も常に正しく更新されていたことが確定した（技術的なバグは
一度もなかった）。

真因は「暗い黄色は茶色に見える」という知覚上の問題であり、
これはコードのどこにも表れないため、実測（DevTools）だけでは
気づけない種類の問題だった。色相そのものを紫へ変更したことで解決した。

教訓: 「値は正しく反映されているのに見た目の指摘が続く」場合、
コードのバグではなく色の知覚特性を疑う視点が必要。
```

### `--color-green`（blueテーマ）：暗くしすぎて青に見えた事例

```
EditPointと同種の現象がblueテーマの保存ボタンでも発生した。
「まだ薄い」という指摘を受けて`--color-green`を暗くしていったところ
（#0B5C2E→#073D1F）、今度は青系の背景に囲まれる影響で「緑ではなく
青いボタンに見える」という新たな指摘が発生した。彩度を保ったまま
暗すぎない値（#0F8A3D）へ再調整して解決した。

これはEditPointの教訓（暗い色は色相が知覚的にシフトする）が
再現した事例であり、今後同様のトークン調整をする際に参照すべき。
```

### blueテーマの`--text-secondary`設定ミスの発見経緯

```
projectionEmpty（弱起小節の休符アイコン）がblueテーマで見えないという
報告から調査を開始し、`.chart-slot--projection-empty`が
`color: var(--text-secondary)`を使っていることを特定した。

3テーマの値を比較したところ、dark/silverでは
primary→secondary→mutedの順に一貫した明度階調を持つのに対し、
blueだけ`--text-secondary: #d1e3ff`が`--text-chord: #c8e0ff`と
ほぼ同じ値（コード名専用の「濃い背景の上で使う薄い色」）になっていた。
これは明らかなコピペミスと判断し、`#1c3854`へ修正した。

この修正により、projectionEmptyだけでなく`--text-secondary`を
使う他の箇所（Analysis Editorのボタン等）も同時に改善された
（1箇所ずつ個別対応するより、根本のトークンを直す方が
波及効果があり効率的だった）。
```

---

## 7. Remaining Issues（残課題）

Sprint2-2で対応する。優先順位は元々の計画通り。

```
① Boundary Handle（新規実装）
   状態: 未着手。現在は個別移動ハンドルの視覚表現が一切ない
        （旧chart-chord-name--selectedの::beforeを削除したため）。
   Selection Highlightと同じ「その場で実装・必要になったら共通化」
   方針で進める想定。

② EditPoint Marker の統一描画
   状態: 色のみ調整済み（紫系）。形状はPhase77由来の暫定的な
        破線枠のまま。Boundary Handleと統一的な描画にする作業が残っている。

③ Forward Wall Modelの可逆性の限界（既知の制約として明記済み・対応不要）
   単純な往復でのみ可逆性が保証される。Undo/Split/Delete/Paste/Merge等
   他の編集操作と組み合わせた場合の挙動は未検証。
   問題が実際に報告されたら調査する。

④ silverテーマの--color-green-rgb未定義（Phase78由来・今回は無関係と判明したため未対応）
   状態: 意図的保留。当初Selection Highlight用に調査中に発見したが、
        最終的に--color-selectionという別トークンを新設したため
        直接の影響はなくなった。ただしsilverテーマの
        rgba(var(--color-green-rgb), ...)を使う箇所（TAP surface等）は
        依然としてdarkの値を継承したままの可能性がある。
        Phase78のamber-rgb修正と同じパターンのため、いずれ対応する価値はある。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase79 Sprint2-2: Boundary Handle + EditPoint Marker統一描画

新しいチャットで再開する。
アップロードするもの:
  ・本handover（handover_phase79_sprint2_1.md）
  ・最新のapp.js
  ・chartmode.js
  ・components.css
  ・theme.css

着手順序（優先順位）:
  ① Boundary Handle（個別移動の左端ハンドル・新規実装）
  ② EditPoint Marker（Boundary Handleと統一的な見た目に整理）

Sprint2-2着手時、まず確認すること:
  ・chart-chord-name--selected-text周辺の実コード（Selection Highlightの
    実装がどこまで進んでいるか）をgrep/viewしてから設計を具体化する
  ・Selection Highlightと同じ「その場で実装・共通化は後回し」方針を
    引き継ぐかどうかを確認する
```

---

## 9. current-issues.md更新（該当があれば）

```
今回closeした項目:
  ・Chart Mode Analysis Editor「Selection Highlight」（Phase79 Sprint1
    handoverで最優先項目として積み残されていたもの）→ 完了

今回新規に積み残した項目:
  ・Boundary Handle統一描画（Sprint2-2）
  ・EditPoint Marker統一描画（Sprint2-2）
  ・silverテーマの--color-green-rgb未定義（優先度低・Phase78由来の既知課題の一部）
```

---

## 10. Files Changed（変更ファイル一覧）

```
js/app.js
  ・_getMinSlotDuration() 新設
  ・shiftSelectionRange() 全面書き換え（Forward Wall Model最終形）
  ・矢印キーハンドラ書き換え（選択数自動判定・Ctrl+Shift+矢印で全体移動）
  ・getGroup3Actions()内のPASTE_ABS等ラベル変更（挿入・貼り付け上書き）
  ・COPY/CUT/MERGE/削除ボタンのラベル「件」→数字のみ
  ・renderAnalysisEditorPanel()内の選択情報表示「件」→「コード」

js/chartmode.js
  ・_renderChartGrid()のslotループをインデックス付きforへ変更
  ・Selection Highlight本体を追加（switch文の後・appendChild前）
  ・chart-chord-name--selected → chart-chord-name--selected-text へ改名

css/components.css
  ・.chart-slot--selected / --selected-start / --selected-end 新設
  ・chart-chord-name--selected-text（旧chart-chord-name--selected、
    ::before削除・文字強調のみに責務を絞る）
  ・.chart-slot--edit-point（outline shorthandから個別プロパティへ変更）
  ・.chart-slot--projection-empty（color: text-secondary→text-muted）

css/theme.css
  ・--color-selection / --color-selection-rgb / --color-selection-bg 新設（3テーマ）
  ・--color-edit-point / --color-edit-point-bg 新設（3テーマ・複数回調整）
  ・blueテーマの--text-secondaryを#d1e3ff→#1c3854へ修正（設定ミス修正）
  ・blueテーマに--color-green / --color-green-rgb を新規追加（#0F8A3D）
```

---

## 11. Micro Log

- Forward Wall Modelの可逆性欠陥をユーザー自身の実機テストで発見。
  「右で縮んだコードが左で元に戻らない」という指摘から、右左で
  別々の境界を操作していることが根本原因と判明
- Origin-Anchored Shift（状態管理による可逆性保証）が一度提案されたが、
  「システムをシンプルに保ちたい」というユーザーの要望により見送り
- ユーザー自身の「前のコードと右端のコードだけ可変にしたい」という
  提案が、状態管理不要な最終モデルの発見につながった
- Decorator Layer設計で、パイプライン・Map・ヘルパー関数をすべて
  見送り、「必要になってから抽象化する」方針を確定（Selection
  Highlightの実装がシンプルに保たれた）
- Selection Highlightの色調整で3回の実機フィードバックループ
  （amber二重表示→背景色濃度→テーマ別コントラスト）を経て確定
- EditPointの色調整で「暗い黄色は茶色に見える」という知覚上の問題に
  遭遇し、色相そのものを紫へ変更する形で解決。同種の現象が
  blueテーマの保存ボタン（暗い緑が青に見えた）でも再発した
- 調査の過程でblueテーマの--text-secondary設定ミス（--text-chordと
  ほぼ同値）を発見・修正。1箇所の症状から根本原因（トークン自体の
  誤り）を特定し、複数箇所への波及的な改善につながった
- 矢印キーの役割をユーザー・ChatGPT双方の議論で再設計。
  「対象は選択数で自動判定・Shiftで歩幅・Ctrlで重い操作」という
  一貫したルールに整理

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
