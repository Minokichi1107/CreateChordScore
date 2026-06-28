# 引き継ぎ: Phase73-F完了 — Library UIブラッシュアップ + 右パネルレイアウト修正

## 作業状態
- ブランチ: （Phase73-Eの続き or 新ブランチ）
- 直前作業: Phase73-E完了（restore authority 分離 + saveProjectNew analysis 継承）

---

## 背景

Project DBとLibrary UIが安定（Phase73-B〜E）した後、実運用で発見されたUX課題と
レイアウトバグを修正するフェーズ。ChatGPTレビューにより一部実装を見直した。

---

## 完了したこと

### 1. 右パネルのはみ出し修正（layout.css）

| 変更 | 内容 | ファイル |
|---|---|---|
| `#panel-right` の高さ修正 | `position:sticky; height:calc(100vh - 47px)` → `height:100%` | css/layout.css |

**原因:**
`#app` がすでに `height: calc(100vh - 47px)` を持っているのに、
`#panel-right` が独自に同じ計算をしていたため、
`#app` の padding/gap 分だけオーバーしてブラウザ下端にはみ出していた。

### 2. ライブラリ表示領域の拡張（components.css）

| 変更 | 内容 | ファイル |
|---|---|---|
| `#panel-right` を flex column 化 | `display:flex; flex-direction:column; min-height:0; overflow:hidden` 追加 | css/components.css |
| `#panel-library` に `flex:1; min-height:0` 追加 | 親の残り高さをすべて占有 | css/components.css |
| `#panel-diagram` を flex column 化 | `display:flex; flex-direction:column; flex:1; min-height:0` 追加 | css/components.css |
| `.library-list` の `max-height` 削除 | `max-height: calc(100vh - 180px)` → `flex:1; min-height:0` | css/components.css |
| `[hidden]` の `!important` 保護追加 | `display:flex` が `hidden` 属性を上書きするため `display:none !important` で保護 | css/components.css |

**設計原則:**
```
flex parent の高さを子要素に伝える際は
  display: flex
  flex-direction: column
  min-height: 0      ← これがないと flex child が shrink できない
  overflow: hidden
の4点セットが必要。min-height:0 を忘れるとはみ出す。

[HIDDEN OVERRIDE RULE]
display:flex を持つ要素で hidden 属性を使う場合は
[hidden] { display: none !important } の明示が必須。
ブラウザの hidden 属性はデフォルト display:none だが
CSSの display:flex に上書きされる（specificity の問題）。

[FEATURE REGRESSION POLICY]
既に動作実績のある機能が消失した場合は「実装漏れ」と断定しない。
まず以下を確認し、原因を区別してから記録する。
  ・Git履歴
  ・ブランチ差分
  ・マージ履歴（古いファイルでの上書き、リファクタでの欠落 等）
今回のChart Mode接続消失の調査経験を踏まえて、この運用ルールを追加した。
```

### 3. DIAGRAMタブ切り替え修正（上記に含む）

`#panel-diagram` に `display:flex` を追加したことで `hidden` が上書きされ
DIAGRAMとLIBRARYが同時に表示される問題が発生したが、
`[hidden] { display: none !important }` で解決済み。

### 4. Chart Mode コードダイアグラムホバーの接続（app.js）

**原因:**
Phase67ではChart Modeコードダイアグラム機能は正常に動作していた。

Phase73-Fで調査した結果、app.jsから以下の接続が存在しない状態になっていたことを確認した。

- import（`setTooltipEnabled`）
- `initChartMode()` への引数（`findChord` / `drawDiagram` / `tooltipEnabled`）
- `Shift+D` キーハンドラ
- 表示メニュー（`btn-toggle-chart-diag`）との接続

どのコミットで失われたかは未調査。Git履歴を追跡すれば特定可能。
本フェーズでは接続を復元し、正常動作を確認した。

| 変更 | 内容 | ファイル |
|---|---|---|
| `setTooltipEnabled` を import に追加 | import の復元 | js/app.js |
| `initChartMode()` に3つの引数追加 | `findChord` / `drawDiagram` / `tooltipEnabled` の復元 | js/app.js |
| `_updateChartDiagMenu()` 追加 | 表示メニューのチェックマーク更新ヘルパー | js/app.js |
| `Shift+D` キーハンドラ追加 | Chart Mode 中のみ有効 | js/app.js |
| `btn-toggle-chart-diag` クリックハンドラ追加 | 表示メニューとの接続の復元 | js/app.js |

**動作確認済み:**
- Chart Modeでコード名にhoverするとダイアグラムが表示される ✅
- `Shift+D` でON/OFF切替 ✅
- 表示メニュー「Chart コード図」チェック ✅

### 5. ライブラリUIブラッシュアップ（app.js + components.css）

| 変更 | 内容 |
|---|---|
| 時刻表示（「〇分前」）削除 | `library-item-time` スパンを削除。アーティスト名のみに整理 |
| クリック時フィードバック追加 | 行をハイライト + カーソルを `progress` に変更（テキスト変更なし） |

**ChatGPTレビューによる設計変更:**
当初「読み込み中...」テキスト表示を実装したが、ChatGPTから
「画面が落ち着かなくなる可能性がある」「100〜200ms程度なら
選択状態とカーソル変更で十分」という指摘を受け、折衷案を採用。

```
[LOADING FEEDBACK POLICY]
ライブラリ曲クリック時のフィードバックは
  ① 行に library-item--loading クラスを付与（選択状態のハイライト）
  ② document.body.style.cursor = 'progress'（システムの砂時計）
  ③ pointer-events: none（二重クリック防止）
の3点のみとし、テキストの書き換えは現時点では採用しない。
理由: loadProj() は analysis HTTPリクエスト + IndexedDB復元を含むが、
     テキスト変更は「画面が落ち着かなくなる」副作用があり、
     視覚的な選択状態だけで「押せた」ことは十分伝わるため。

将来の再検討条件:
  LAN配信・ProjectDB増大・analysis肥大化などでロード時間が
  さらに伸びることが実測で判明した場合は、テキスト表示方式を再検討する。
```

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| 右パネルがブラウザ下端にはみ出さない | ✅ |
| ライブラリ一覧が下端まで表示される | ✅ |
| LIBRARY ↔ DIAGRAM タブ切り替え正常 | ✅ |
| Chart Mode コードダイアグラムホバー表示 | ✅ |
| Shift+D でホバーON/OFF切替 | ✅ |
| 表示メニュー「Chart コード図」チェック | ✅ |
| ライブラリ時刻表示が消えている | ✅ |
| 曲クリック時にフィードバック表示 | ✅ |
| 曲切り替えが正常に動作する | ✅ |

---

## current-issues.md 更新

- 今回 close した issue:
  - 「Chart Modeのダイアグラム表示トグルとホバーツールチップポップアップが非機能」
    原因: Phase67では正常動作していたが、Phase73-F時点でapp.js側の接続
    （import / initChartMode引数 / Shift+D / 表示メニュー）が失われており
    機能が無効化されていた。どの変更で失われたかは未調査。
    本フェーズで接続を復元し正常化。
  - 「右パネルのposition:sticky起因のオーバーフロー」（本フェーズで修正済み）

- 今回新規に積み残した issue:
  - なし

---

## 積み残し・次フェーズ候補

```
Phase74（実運用・Chart Mode品質向上）:
  - 実曲での弱起（pickup）検証（Phase68/69の最終確認）
  - Issue #45 Type D: 発生ケース収集後に repairDownbeats の有効性検証
  - Audio同期ズレの実曲データ収集・原因分析
  - ProjectDB運用で出てきた不具合修正

保留（将来フェーズ）:
  - ユーザー向けREADME作成
  - server.py廃止・GitHub Pages対応の検討
  - ChordMini開発者への連絡（公開前の倫理的配慮）
  - 孤立 analysis/{id}.json のクリーンアップAPI（server.py拡張）

Library将来候補:
  - 検索欄
  - アーティスト別グループ表示（開閉式）

Issue #45 継続:
  - Type A/C: 手動修正UI設計フェーズ（大規模・将来）
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
