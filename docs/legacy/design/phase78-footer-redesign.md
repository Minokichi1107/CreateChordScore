# 設計書: Phase78 Footer Redesign（実装前ドキュメント）

> ⚠️ このファイルは handover ではない。
> 実装前の設計正本（design source of truth）として保存する。
> Phase78完了後、実装結果は handover_phase78.md に別途まとめる。
> このファイル自体は実装後に破棄してよい（README.mdの二層構造でいう
> micro-log に近い位置づけ）。

---

## 0. 設計原則（最上位・すべての判断基準）

### 原則1：初心者でも5分で使い始められること

```
- 初心者：アイコン＋ツールチップだけで全機能に到達できる
- 中級者：メニュー内のショートカット表示で自然に覚える
- 上級者：ほぼキーボードだけで編集できる

数字・秒数・技術的な精度表現はUIの主役にしない。
「意味（大きく／小さく）」を主役にし、数字は
ツールチップ・ショートカット表示・マニュアルという
「保険の層」へ退避させる。
```

### 原則2：UIは内部実装ではなく、ユーザーの意図を表現する

```
UI should expose user intent, not internal implementation.

「editPoint」「boundaryIndex」「selection.chordIds」等の
内部概念・変数名は、UIラベル・トースト文言・エラーメッセージに
一切露出させない。

ユーザーは「コードを選んでいる」「位置を選んでいる」としか
認識しない。内部で editorMode が 'edit-point' に切り替わっていても、
ユーザー体験としては「編集対象が変わっただけ」に見えること。

この原則はUIラベルだけでなく、トースト・エラーメッセージ・
ツールチップ文言すべてに適用する。
```

---

## 1. 全体構造

```
selection (Authority・既存のまま変更なし)
{ chordIds, boundaryIndex, anchorChordId, editPoint }
        │
        ▼
deriveEditorMode(selection)     ← 新規・純粋関数・stateを持たない
        │
        ▼
   'idle' | 'single' | 'multi' | 'edit-point'
        │
        ▼
renderAnalysisEditorPanel(mode) ← 既存関数を書き換え
        │
        ├─ Group 1: Selection       （選択情報＋選択解除）
        ├─ Group 2: Navigation      （全体シフト・常時固定）
        ├─ Group 3: Primary Action  （mode依存・視覚的に主役）
        └─ Group 4: Workspace       （Undo/Redo/編集終了/保存・控えめ・編集操作ではなくワークスペース制御）
```

**用語について（修正点①②）**：
「行（row）」ではなく「グループ（Group）」と呼ぶ。実際のUIは横一列の
ツールバーであり、ユーザーは4行ではなく4つの意味のまとまりとして認識する。
Group 3 は「対象固有操作」ではなく **Primary Action Group** と呼ぶ。
Add Here / 削除 / 編集 / 結合など、そのモードで「今一番やってほしい操作」
はすべてPrimary Actionである。

Group 4 は「Secondary Action」ではなく **Workspace（ワークスペース制御）**
と呼ぶ。Undo/Redo/保存/編集終了は「編集操作」ではなく「編集セッションそのもの
の制御」であり、Primary Actionとは役割の種類が異なる（優先度が低いから
Secondaryなのではなく、そもそも別カテゴリの操作）。

---

## 2. `deriveEditorMode()` 仕様

```javascript
/**
 * [EDITOR MODE PROJECTION]
 * editorMode は selection から導出される Projection である。
 * selection が唯一の Authority のまま変わらない。
 * editorMode 自体を state として保持・シリアライズしてはならない
 * （呼び出しの都度この関数で再計算する）。
 */
function deriveEditorMode(selection) {
  if (selection.editPoint) return 'edit-point';
  if (selection.chordIds.length === 1) return 'single';
  if (selection.chordIds.length >= 2) return 'multi';
  return 'idle';
}
```

- 引数は `selection` のみ（他stateに依存しない・純粋関数）
- 呼び出し側（`renderAnalysisEditorPanel()` 冒頭）で毎回呼ぶ
- `selection.editPoint` と `selection.chordIds` は既にPhase77で排他制御済み
  のため、この優先順位で矛盾は起きない

---

## 3. 4 Groups の最終仕様

| Group | 常時／mode依存 | 内容 |
|---|---|---|
| 1. Selection | 常時（中身がmode依存） | idle:「クリックして編集」／single:「Bm ×」／multi:「3コード選択 ×」／edit-point:「Bmの途中（8.120秒）×」 |
| 2. Navigation | 常時固定 | `◀◀ ◀ ▶ ▶▶`（数字非表示・ホバーで秒数＋ショートカット表示） |
| 3. Primary Action | mode依存・視覚的に主役（amber枠） | 下記3-1参照 |
| 4. Workspace | 常時固定・視覚的に控えめ | Undo / Redo / 編集終了 / 保存して閉じる（**全mode共通表示**。edit-point中も操作可能にする＝現状からの変更点） |

### 3-1. Group 3（Primary Action）の中身（mode別）

```
idle:        （非表示・何もなし）

single:      個別移動（◀◀◀▶▶▶）│ ＋ ✎ 🗑 │ その他▼
                                        ├ コピー      Ctrl+C
                                        ├ 切り取り    Ctrl+X
                                        ├ 貼り付け    Ctrl+V
                                        └──────────
                                        （結合は対象外・グレーアウトまたは非表示）

multi:       範囲シフト（◀◀◀▶▶▶）│ その他▼
                                  ├ コピー      Ctrl+C
                                  ├ 切り取り    Ctrl+X
                                  ├ 貼り付け    Ctrl+V
                                  ├──────────
                                  └ 結合        Ctrl+J
                                  │ 🗑 複数削除

edit-point:  ［Add Here］（amber塗り強調ボタン・単独のPrimary Action）
             ※ Group2（全体シフト）は共通表示のためGroup3には重複させない
             ※ 将来Sprint3で「貼り付け挿入」ボタンがここに追加される
```

### 3-2. その他▼メニューの仕様

```
その他▼メニューは低頻度編集コマンドの格納場所であり、
将来の拡張ポイントである（修正点③）。

Other menu hosts low-frequency editing commands.
Additional commands may be added without increasing toolbar density.

つまり、Phase79以降で編集コマンドが増えた場合、
まず「その他▼」への追加を検討する。ツールバー本体の横幅・
ボタン数を増やさないことを優先する。

グループ区切り:
  クリップボード系（コピー／切り取り／貼り付け）
  ──────────────
  特殊操作（結合）
```

---

### 3-3. Action Registry（Sprint1で導入）

Group 3（Primary Action）はmodeごとに内容が変わるため、`if (mode === ...)`の
分岐が将来増殖しないよう、データ駆動で描画する。

```javascript
const ACTIONS = {
  idle:       [],
  single:     [ADD, RENAME, DELETE, /* overflow: */ COPY, CUT, PASTE],
  multi:      [MERGE, DELETE_SELECTION, /* overflow: */ COPY, CUT, PASTE],
  'edit-point': [ADD_HERE],
};

renderPrimaryActionGroup(ACTIONS[mode]);
```

各要素は `{ id, label, icon, shortcut, overflow, handler }` の形を持つ。
新しいコマンド（将来のNormalize / Split / Duplicate等）が増えても、
`renderPrimaryActionGroup()` 自体は変更不要。Action定義を追加するだけで済む。

これはOut of Scopeにするほど大きい変更ではなく、Group構造を作る
Sprint1のタイミングで併せて導入する。

---

## 4. 主な変更点（現状コードとの差分サマリ）

| 変更 | 内容 | 理由 |
|---|---|---|
| editPoint早期return を廃止 | 通常パネルの4 Group構造に統合 | 「別モード感」の排除（原則2） |
| Group4=Workspace（Undo/Redo/編集終了/保存）を全mode共通表示に | 現状はeditPoint中に消えていた | edit-point中でもUndo・保存ができるように |
| 「〜してください」注意書きを廃止 | 該当modeで無関係な要素は非表示にする | 状態遷移型UIの本来の姿 |
| シフト系ボタンの表記変更 | 数字表示 → 矢印アイコン＋ツールチップ（秒表記で統一） | 原則1 |
| 編集操作をアイコン＋その他▼に整理 | 常用（追加/変更/削除）とその他に分離、ショートカット併記 | 使用頻度ベースの整理・原則1 |
| 死コード化する既存トースト | `'コードを選択してください'`（現行1257, 1292行目） | 該当ボタンが非表示になるため到達不可能に。実装時に削除するか防御的に残すか要判断 |

---

## 5. CSS token設計方針（ui-rules.md準拠）

```
新規token候補（Semantic層）:
  --surface-emphasis        (Primary Action Group の amber枠背景・低alpha)
  --border-emphasis         (Primary Action Group の amber枠border)
  --action-subdued-text     (Workspace Group の控えめテキスト色)

既存活用:
  --color-red系               (削除・danger色。既存の aep-btn--danger を流用)
  --color-amber系              (Add Here強調ボタン。既存tokenがあれば流用)
```

具体的な変数名・値は実装時にcomponents.css/theme.cssの既存定義を確認してから
確定する（架空の変数を先に決め打ちしない）。

---

## 6. Out of Scope（Sprint1では扱わない）

```
・Decorator（境界ハンドル・editPointマーカーの統一描画）      → Sprint2
・Paste Insert                                              → Sprint3
・ツールチップ文言の最終磨き込み・秒/ms単位の再検証            → Sprint4（仕組みだけSprint1で作る）
・その他▼メニューの開閉アニメーション等の装飾                  → Sprint4
```

---

## 7. 未確定・実機で判断する項目（暫定デフォルトで実装し、後日調整）

```
・個別移動/全体シフトの見た目: ◀◀◀▶▶▶（数字非表示）＋ホバーで秒数＋ショートカット
・ツールチップの単位: 秒（他表示との統一。将来英語版では s 表記を検討）
・選択解除: ×バッジ直付け
・Primary Action Groupの視覚強調: amber枠（single/multi/edit-point共通）

→ いずれも見た目の微調整であり、deriveEditorMode()という
  内部設計そのものには影響しない。Sprint1はこの暫定案で実装し、
  実機で数日使ってから微修正する。
```

---

## 8. Sprint1 Investigation（実コード調査結果・app.js/components.css/theme.css確認済み）

```
[Display]
✅ 確定: Selection Header に Layer 4 Projection漏れ
   選択中コードの名称表示がcapo変換（transposeChord）を経由せず、
   raw chord名をそのまま表示している。

✅ 確定: EditPoint Header に同一パターンの Layer 4 Projection漏れ
   Selection Headerと同じ原因・同じ修正方法（実装ミスがコピペされたと推定）。

   グリッド側は正しくtransposeChord適用済み・パネル側のみ未適用。
   修正に必要な関数（transposeChord / getCapo）はapp.js内で
   既にimport・利用可能なため、修正コストは低い。

✅ 確定（P2・軽微）: amber系のRGB基礎トークンがテーマ非依存
   ui-rules.md §6のtoken設計原則（RGB値もテーマごとに用意する）には反するが、
   影響は薄いオーバーレイの色味程度に限られ、フッターが濃紺に見える主因ではない。

□ 未解明: フッター背景が実際に濃紺で表示される根本原因
   関連CSSクラス自体はtoken参照で書かれており、理論上テーマ追従するはずだが、
   実機では追従していない。ソースコードの推測ではなく、実装時にDevTools
   （Elements → 対象要素 → Computed → background-color）で
   実際に効いているルールのソースを直接確認する。

[Wording]
✅ 確定: Analysis Editorパネルにツールチップが現状一切存在しない
   → 「既存文言の是正」ではなく「原則2に沿った新規設計」としてSprint1で作る

[Accessibility]（今回追加）
□ title属性だけで十分か、aria-labelが必要なボタンはあるか
□ アイコンのみボタンがキーボードフォーカス時も意味が伝わるか
  （Sprint1でアイコン主体UIへ移行するため、実装コストが最も低い今のタイミングで
   title + aria-label を同時に付与する）

[Implementation]
□ Sprint1のGroup構造変更に伴い到達不可能になる既存トーストの
  削除要否を実装時に判断する
```

> 実装メモ（具体的な行番号・関数名。コード変更で古くなるため設計書本体には含めない）：
> `renderAnalysisEditorPanel()` 内、選択中コード表示・editPoint位置表示の
> 各箇所で `chord.chord` / `owner.chord` を `transposeChord(●, -getCapo())`
> に置き換える。詳細な行番号は実装時のコミット・handoverに記録する。

### Sprint1 実装順序（確定）

```
① Footer UIリファクタ（deriveEditorMode・4 Groups構造・CSS token設計）
        ↓
② Capo表示修正（2箇所・確定バグ）
        ↓
③ DevToolsでフッター背景色の実効ルールを確認
        ↓
④ 必要ならCSS修正（③の結果次第。--color-amber-rgbの是正はP2として合わせて検討）
        ↓
⑤ Tooltip + aria-label 追加（Accessibility Check含む）
```

この順序により、CSS調査に時間を溶かす前にUI構造そのものを先に固める。

## 9. Decorator Layer Design Principle（Sprint2向け・今回のスクリーンショットレビューで確定）

```
Decoratorは「文字」を装飾するのではなく、「編集対象セル」を装飾する。

- コード選択はセル全体をハイライトする（outline＋背景色、文字周辺の帯だけにしない）
- edit-pointは空白セル全体をハイライトする（同上）
- 継続コードは継続範囲全体を一つの選択領域として表現する
  （選択したコードが複数小節にまたがる場合、そのすべてに背景色を伸ばす）
- コード選択とedit-pointは同じ視覚言語で表現する
  （色・太さ・スタイルを共通化し、ユーザーに「別モード」と感じさせない）
```

```
[DECORATOR PROJECTION INVARIANT]

Decorator は selection から導出される Selection Projection である。

selection
        ↓
Selection Projection
        ↓
Decorator（描画のみ）

Decorator は selection / editPoint を変更してはならない。
Decoratorの責務は「今のselectionをどう見せるか」の描画のみであり、
selectionそのものの読み書き・保持・状態管理には一切関与しない
（deriveEditorMode()と同じ「Projectionは書き込みをしない」という
思想をDecoratorにも適用する）。
```

---

## 10. Sprint1 Exit Criteria

```
□ deriveEditorMode() が唯一のmode判定になっている
  （renderAnalysisEditorPanel()内にmodeを再判定するif分岐が重複していない）

□ editPoint専用UI（早期return）が存在しない
  （4 Groups構造に統合されている）

□ 4 GroupsすべてがWorkspace（Group4）を含め、全modeで一貫して表示される

□ Group3（Primary Action）がAction Registryから生成される
  （modeごとのif分岐でボタンHTMLを組み立てていない）

□ Capo表示がSelection HeaderとEditPoint Headerで一致する
  （グリッド表示と同じフォーム音で表示される）

□ アイコンのみのボタンすべてに title + aria-label が付いている

□ 実機でダークテーマ・ライトテーマ（silver/blue）双方を確認済み

□ 既存のキーボードショートカット（Ctrl+C/X/V・Delete/Backspace・矢印キー等）が
  Sprint1変更後も従来通り動作する
```

これは設計の評価基準ではなく、Sprint1の完了判定基準（Definition of Done）である。
実装後、実機で1項目ずつ確認する。

## 11. ステータス

```
状態: 設計確定・調査完了・Exit Criteria確定・実装待ち
次のアクション: 「実装してください」の明示指示を受けてから、
  「8. Sprint1 実装順序」に沿って着手する
このファイルの扱い: 実装完了後、handover_phase78.md 作成時に破棄可
```
