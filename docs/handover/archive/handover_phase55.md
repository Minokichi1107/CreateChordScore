# 引き継ぎ: Phase55完了 — カポ引き継ぎバグ修正 + AddChordモーダルUI改善 + Chart Modeコード重なり修正

## 作業状態

* ブランチ: main
* commit:
  - `d812322` style: show chord delete button on hover
  - `f4f7753` fix: restore chord transpose on capo reset when importing chord JSON
  - `a28683c` docs: update Phase54 handover after capo restore and chart overlap fixes

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| hover-only 削除ボタン | AddChordモーダルの ✕ ボタンをhover時のみ表示 | js/chordEntry.js, css/components.css |
| capo restore on import | コードJSON読み込み時、capo適用済みlinesをcanonicalに戻してからリセット | js/app.js |
| chart overlap fix | 1小節内複数コードの重なりを slotIndex 比率配置で解消 | js/chartmode.js |
| console.log削除 | refreshEditor / CAPO CHANGE のデバッグログ削除 | js/app.js |

---

## 確定した設計原則

### capo reset lifecycle invariant（Phase55で新規確立）

```
capo state を破棄する前に
必ず project.lines を canonical に戻す

restore → reset → ingest の順序が重要
```

具体的な実装（`loadChordData()` 冒頭）：

```javascript
// 1. restore: lines を canonical に戻す
if (_prevCapo !== 0) {
  (project.lines || []).forEach(line => {
    line.chords.forEach(c => {
      if (!c.chord) return;
      c.chord = transposeChord(c.chord, _prevCapo); // +prevCapo で逆算
    });
  });
}

// 2. reset: 3つセットで整合
project.capo = 0;
document.getElementById('capo').value = 0;
_prevCapo = 0;

// 3. ingest: 新JSONを読み込む（以降の既存処理）
```

この invariant は今後以下にも適用すること：
- project load 時のcapoリセット
- 将来のundo/redo
- 将来のDB persistence

### chart chord label の配置方針（Phase55で修正）

```
before（Phase54まで）:
  position: absolute; left: 6px;
  → 全コードが同座標に重なる

after（Phase55）:
  slotIndex が 0 の場合: left: 6px（変わらず）
  slotIndex > 0 の場合: left: calc(slotIndex / slotsPerMeasure * 100% + 2px)
  → 小節内の拍位置に比例した水平配置
```

ChatGPT指摘の通り、これは応急処置。将来的には：

```
measure
 └ slots-grid
    ├ slot → chord-label（slot所属）
    └ slot → chord-label（slot所属）
```

の構造に移行する方が CSS 責務として自然。

---

## 今回の重要な発見

### destructive transpose architecture の確認

capo変更時に `c.chord` を直接書き換えている（破壊的変換）。
つまり `project.json` には「capo適用後のコード文字列」が保存される。
canonical（原曲キー）は保持されていない。

これは今後の save/load・undo・Chart Mode・theory解析すべてに影響する既知の設計負債。
（architecture.md §8 に記録済み）

### git restore による広範囲ロールバック事故

`git restore js/app.js` を実行した際に Phase49〜54 の変更が大量に消失した。
以下が消えた：
- `chartMeasuresPerRow` / `rightHidden` 変数
- `applyRightHidden()` / `updateViewMenuChecks()`
- `chart-col-btn` イベントハンドラ
- Shift+{ / Shift+} キーショートカット
- `normalizeProject` / `createEmptyProject` import
- `isNoChordToken` import
- `saveDiagStateForModal` 系 API
- TOKEN MIGRATION 処理
- artist/title 分離（Phase46）

**教訓：**
- `git restore <file>` は全変更を破棄する。部分的な取り消しには `git restore -p` を使う
- 復旧は `git reflog` で正常 commit を特定し `git checkout <hash> -- <file>` で戻す

---

## 積み残し・保留

### chart chord label の構造改善
状態: 意図的保留
内容: slot所属のlabel構造への移行（ChatGPT推奨）
現在の slotIndex 比率配置は応急処置として機能しているが、
将来コード密度が上がった場合に再衝突する可能性がある。

### loadChordData() の呼び出し経路整理
状態: 要確認
内容: ChatGPT指摘：`loadChordData()` がユーザーによるコードJSON import専用として
設計されていない可能性がある。IndexedDB auto restore 経路からも呼ばれており、
その際に `project.capo = 0` / `_prevCapo = 0` が実行されて
`loadProj()` で復元した capo が上書きされる問題が発生した（Phase55デバッグ中に確認）。
方向性: import path / restore path / project hydrate path の整理が必要。

### capo projection 統合
状態: 設計前（大規模）
内容: destructive mutation model → projection model への移行。
全面的な変更になるため将来の専用フェーズで対応。

---

## 次フェーズ候補

- `moveChordAcrossLines`（行またぎコード移動）: editor core mutation として実装
- Chart Mode ビート単位フォーカス（簡易版）
- hover-only ✕ の構造改善（slot所属label化）
- `loadChordData()` 呼び出し経路整理

---

## commit message

```
style: show chord delete button on hover
fix: restore chord transpose on capo reset when importing chord JSON
docs: update Phase54 handover after capo restore and chart overlap fixes
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
