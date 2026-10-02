# 引き継ぎ: Phase138完了 — 軽量Issue3件（#115 / #112 / #113）

## 作業状態
- ブランチ: `main`（ローカルは `origin/main` より2コミット先行。実機で確認済みの状態）
- 直前作業: Phase138完了（3件とも実機確認OK）
- コミット:
  - [x] #115 `be14993` `fix(chart): reset chart scroll on project switch (#115)`
  - [x] #112 `2374a47` `fix(chords): add sus4(b7) readable mappings for remaining roots (#112)`
  - [x] #113 `4072810` `fix(chords): unify m7b5 to canonical m7-5 with readable mapping (#113)`
- Push: 未実施（`origin/main` は #115 の `be14993` まで）

---

## 今回の目的

Phase137の運用検討を終えたあと、軽量Issueを1件ずつ処理した。
各Issueは「調査 → 設計提示 → 『実装してください』 → 実装 → 実機確認」の順で進めた。

## 完了したこと

- [x] #115 曲を切り替えたとき、Chart Modeを先頭から表示する
- [x] #112 ChordMini表記のReadable変換が効かないコード（`sus4(b7)`）を直す
- [x] #113 `m7b5` と `m7-5` の表記を `m7-5` に統一する
- [ ] コミット・pushの状況確認（上記「作業状態」の確認欄）

| Issue | 原因 | 変更 | ファイル |
|---|---|---|---|
| #115 | `#chart-overlay` が `hidden`（`display:none`）の間は `scrollTop` を代入しても効かず、再表示時に旧Projectの位置が復元されていた | リセットを「次回描画への予約」にした | `app.js` / `chartmode.js` |
| #112 | コードの不具合ではなく、`replacementMap.json` に `sus4(b7)` の登録が不足していた | 14件追加 | `replacementMap.json` |
| #113 | `m7b5` と `m7-5` が別キー扱いだった（`normalizeChordName()` にaliasなし） | alias 1行 + Map 17件 | `chords.js` / `replacementMap.json` |

---

## #115 の設計

```
loadProj(data)                                chartmode.js
  旧 project.id を退避（resetProject の前）
  ... 既存の復元処理 ...
  新ID !== 旧ID ──YES──▶ resetChartScroll()     _scrollResetPending = true
                                                 grid.scrollTop = 0
                                                 chartState.lastScrolledMeasure = -1
Chart Modeを開く → renderChartMode()
  → _renderChartGrid()
       予約あり → _prevScrollTop = 0 で描画し、予約を消費
       予約なし → 従来どおり現在位置を保存・復元
```

- 責務: 「Projectが変わったか」の判定は `app.js`、「スクロールを戻す」は `chartmode.js`。`chartmode.js` はProjectを知らない（`[NAVIGATION OWNERSHIP]` と同じ分担）。
- Phase106由来の `_prevScrollTop` 保存・復元は変更していない。同一Project内の再描画では位置を保持する。
- 初回ロード（旧IDなし）と同一IDの再読込では、リセットしない。
- 最初の実装（`grid.scrollTop = 0` の直接代入のみ）は実機で効かなかった。非表示要素への代入が無効だったため、予約方式へ修正した。

## #112 の調査結果

- `toReadableChord()` の呼び出しは `sanitizeChords()`（`analysisLoader.js`）の中だけ。
- `analysis.chords` の生成箇所は3つ: `loadAnalysis()` / `saveAnalysisEdit()` / `_refreshEditorView()`。
- Chart Modeの3経路（Slot / Continuous / fallback）は、`analysis.chords` の値にcapo分の移調をかけて表示するだけ。ラベル用の追加変換はない。
- `loadReplacementMap()` は起動時の復元より前に `await` される。
- Map未ロード時は素通しになる（Nodeで確認）が、今回の原因ではなかった。
- 原因: Mapの `sus4(b7)` は `F#sus4(b7)` / `Gbsus4(b7)` / `Asus4(b7)` の3つだけだった。
- 追加した14件（変換先は「ルート+`7sus4`」）: C, C#, D, D#, E, F, G, G#, A#, B, Db, Eb, Ab, Bb。
- `Asus4(b7)` → `Em7/A` は既存のまま変更していない。
- 結論: Chart Modeに `toReadableChord()` を追加する案は採らない（二重適用になるため）。

## #113 の設計

```
ChordMini hdim7 ─▶ raw.chords "Bm7b5"（変更しない）
                       │
        ┌──────────────┴───────────────┐
 表示: replacementMap で Bm7-5     ダイアグラム検索: normalizeChordName() で Bm7-5
```

- Canonical（正規形）は `m7-5`。`m7b5` は入力側の別名（alias）。
- `chords.js` の `_SUFFIX_ALIAS` に `'m7b5': 'm7-5'` を追加。
- `replacementMap.json` に17ルート分（`〇m7b5` → `〇m7-5`）を追加。
- 既存のカスタムダイアグラム（localStorage `cs_customDiags`）は、読込時の `normalizeChordName()` による統合・再保存で救済される。専用migrationは不要。
- 検索は `fromReadableChord(toCanonicalChord(...))`（`app.js` の検索処理）で、`Bm7-5` → `Bm7b5` に戻る。
- 実機確認前の検証（Node）: 再キー化、`Bm7b5`・`Bm7-5` 双方のダイアグラム検索、Capo 2 の表示（`Am7-5`）、冪等性、逆引き衝突の警告が既存の1件（`A#/D`）のまま。

---

## 確定した設計原則

- `raw.chords` は書き換えない（Canonical → Readable → capo の順序は維持）。
- 表記の不足は、まずMap（データ）で補う。JSの変換経路は追加しない。
- Named Invariant の新設・意味変更・廃止: なし（architecture.md の即時更新は不要）。

## micro-log

- `resetChartScroll()` を予約方式にした
  - reason: 非表示（`display:none`）の要素への `scrollTop` 代入は無効
  - invariant: `_prevScrollTop` の保存・復元（Phase106）は維持
- `m7b5` → `m7-5` はCanonical側で統一
  - reason: 表記揺れの根が「別キー扱い」で、読込時の既存の統合処理がそのまま使える
  - authority: `raw` は変更しない

## Out of Scope（今回やらないと決めたこと）

- `m7(b5)` と `ø` の対応（#113を別の正規化問題に広げないため）
- `replacementMap.json` 自体の再設計、新しいコード正規化ルール
- Slot / Collision / Beat / Measure Model、Phase136のContinuous Projection
- 未登録表記の洗い出しスクリプト（今回は見送り）

## 実機確認

```
[x] #115 別の曲に切り替えて開くと先頭から表示される
[x] #115 同一曲内の再描画ではスクロール位置が保たれる（A→B→Aも先頭）
[x] #112 Dsus4(b7) / Esus4(b7) / Gsus4(b7) が 〇7sus4 と表示される
[x] #113 m7b5 を含む曲で m7-5 と表示され、ダイアグラムが出る
```

## Issue状態変更記録
- 今回完了したissue: #115 / #112 / #113（実装・実機確認まで完了）
- GitHub Issueのclose状態: **未反映**（確認時点で3件ともopen）。close後に「close済み」へ更新する
- #113 をcloseする前の注意: Issue本文に将来課題「コード表記スタイルのユーザー選択」が残っている。これは #113 の完了条件（`m7-5` への統一）とは別なので、別Issueへ分離するか「#113の完了条件とは別」と明記してからcloseする
- 今回新規に積み残した項目: 下記「積み残し・保留」の4件（GitHub Issue化は開発者判断）
- `current-issues.md`: #115 / #112 / #113 は未掲載のため変更なし

## 積み残し・保留

- [ ] 編集で入れたコード（AddChord / Rename）がReadable表記のまま `buffer` に入り、canonical表記と混在する（#112調査で発見。`m7-5` の手入力が増えると、検索が `m7b5` 側と当たらない場面が増える）
- [ ] スラッシュ付き（`Em7b5/A` など）は表示が元の表記のまま。ダイアグラムは `m7-5` で見つかる
- [ ] `Cmaj7/3`、`Cdim/b3` など、`replacementMap.json` に無い転回形表記
- [ ] `〇7sus4` のダイアグラムは、組み込みの辞書（`CHORD_DB`）に無い。登録の有無は未確認（#112の表示確認の範囲外）
- （以下はPhase136からの引き継ぎで、上記4件とは別枠）Phase136: Issue #120（右端小節のContinuous Playhead描画乱れ）、Issue #109（Beat Cursor）、`tools/measure-barline-offsets.mjs` の扱い、`_renderChartGridContinuous()` のdocstring更新

## 運用メモ

- 実装前の方針確認で、過去に決めた表記方針（`m7-5` 統一）と逆の推奨を出してしまった。AI側は、方針に関わる提案の前に過去の決定を確認すること。
- 今回はprivateリポジトリをAIがcloneして調査・実装した。アクセストークンはチャットに貼らず、使用後は必ず失効させる。
- `replacementMap.json` は `.gitignore` 対象だが、すでにGit管理下のため通常どおりコミットで残る（実曲由来データは含まない）。

## コミット案（1コミット1目的）

```
fix(chart): reset chart scroll on project switch (#115)
fix(chords): add sus4(b7) readable mappings for remaining roots (#112)
fix(chords): unify m7b5 to canonical m7-5 with readable mapping (#113)
```

## 次フェーズ候補

- 新しいProduct Intentから開始する（Issue消化を目的にしない）。
- 候補: 積み残しのReadable混在問題（設計が必要）、Phase136の保留事項、Phase133〜135のSlot / Beat / Measure Model。

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- No changes.（新規の積み残しは、Phase137の方針どおり、必要ならGitHub Issueへ記録する）

#### MODIFY
- No changes.

#### CLOSE
- No changes.（#115 / #112 / #113 は `current-issues.md` に掲載されていない。GitHub Issue側でclose）

### phase-status.md

- Current Status（完了済みリスト）に追加: 「Phase138 — 軽量Issue3件（#115 曲切替時のChart Modeスクロールリセット、#112 `sus4(b7)` のReadable変換追加、#113 `m7b5` → `m7-5` 統一）を完了。いずれも実機確認済み。」
- Major Milestones（Chart Mode表）に追加: `138 | #115 曲切替時のスクロールリセット（予約方式。_prevScrollTop保持仕様は維持） | app.js / chartmode.js`
- Major Milestones（基盤・アーキテクチャ整理表）に追加: `138 | コード表記の統一（#112 sus4(b7) Map追加、#113 m7b5→m7-5をCanonical化。raw.chordsは変更しない） | chords.js / replacementMap.json`
- Current Work の更新: 「Phase138完了。次は新しいProduct Intentから開始」
- Future Candidates の更新: 積み残し4件（Readable混在・スラッシュ付き表示・未登録の転回形表記・`7sus4` のダイアグラム登録の有無）をTechnical Debtへ追記するか検討。

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
