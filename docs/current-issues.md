# 現在の課題・バックログ

> 最終更新: Phase59完了時点

---

## 1. バックログ（優先順）

### Issue #27 — メタリックテーマ描画方式の見直し
状態: 検討中
目的:
- 描画負荷低減
- CSS複雑化抑制
- モバイル安定化
- テーマ拡張性向上

方向性:
- CSS + テクスチャのハイブリッド方式
- filter / backdrop-filter 依存削減
- semantic token体系は維持

備考: 本格化した場合は `docs/theme-rendering-architecture.md` へ昇格

---

## 2. 将来検討（subsystem別整理）

### chord editor / line editing 系

#### transient preview restore
状態: **完了（Phase52）**
内容: modal close 後、diagLocked 状態の右パネル表示を復元する処理。
退避 → commit / rollback パターンで実装済み。
適用条件: `locked === true && chord !== null` の場合のみ restore。
confirm操作（コード追加・バーライン追加）はすべて commit 扱い。
将来の Add Simile / Inline Edit / Transpose Preview でも同パターンを再利用できる雛形になっている。

#### 行またぎコード移動
状態: 未着手
内容: 先頭コード→前行末尾 / 末尾コード→次行先頭へのコード移動。
通常画面（inline editing）または AddChord モーダルから操作できるUIを追加。
token array boundary mutation として実装すること（string splice 禁止）。
`project.lines` 編集APIが必要。app.js 内 `moveChordAcrossLines` として設計済み（Phase38-3）。
※ Phase53 で行またぎ**カーソル navigation** は実装済み。**コードそのものの移動**は別問題として未着手。
※ modal内の小機能として実装すると line mutation が modal subsystem に漏れるため注意。

#### interaction hierarchy 改修
状態: 部分完了（Phase53）
内容: AddChord modal の操作体系をキーボード主体に変更。
- insertion cursor 化（`+` → `|` 表示への変更）: **Phase53 で完了**
- ArrowLeft/Right 行またぎ navigation: **Phase53 で完了**
- hover-only 削除ボタン（`✕` の表示制御）: 未着手
Phase38-2で設計済み。残作業は chordEntry.js 拡張として実装予定。

### token / rendering 系

#### simile token 挿入UI
状態: 未着手
内容: AddChordモーダルから simile token（`{type:'simile', bars:1|2}`）を挿入できるUI。
Phase38-2で設計済み。chordEntry.js 拡張として実装予定。

#### renderTokenNode 層
状態: 未着手
内容: simile token の SVG描画。performSimileStyle='svg' 対応。
Phase38-2で設計済み。

### Issue #26 — ChordMini Beat/Grid情報対応
状態: 設計前
内容: 将来の `bars[]` 構造への移行・grid表示・beat alignment対応。
Phase39-4 で barline canonical 化・isSepToken() access layer を確立済み。
本格設計は Issue #26 設計フェーズで行う。

### Chart Mode 系

#### Chart Mode 並列表示（編集しながら Chart を参照）
状態: 設計前
内容: Chart Mode を全画面モードではなく、エディター画面と並列表示できるようにする。
または全画面編集モードに Chart パネルを組み込む。
設計上の注意点:
- editor renderer / chart renderer の single source of truth をどこに置くか
- focus / selection / scroll sync のタイミング
- mutation 後の chart 再描画タイミング
備考: Phase44 で projection responsibility が整理されたため、並列表示の設計に入れる段階。

#### Chart Mode に audio controls 追加（mini transport）
状態: **完了（Phase50）**
内容: Chart Mode 内に ▶ / シークバー / 速度 / 音量 の mini transport を実装済み。
playback authority は `updateChartPlayback()` に集約（aEl listener を transport に持たせない設計）。

#### Chart Mode click seek（再生位置クリック）
状態: 未着手
内容: Chart Mode の小節 / slot クリック → その位置から再生開始。
normalized timing pipeline（Phase59）が確立したため実装可能な段階。
playback authority は app.js が持つ（chartmode.js が aEl に直接触らない）。
注意: 現在の seek 式（slot比率計算）は等間隔 slot 前提の暫定実装。
      将来 triplet / swing 対応時は beat-aware seek mapping への移行が必要。

#### Chart Mode pickup measure 表示補正（Type B 対応）
状態: 未着手
内容: 曲が小節の途中から始まる弱起（pickup measure）のケースで
小節1が短くなり、以降の小節番号がズレて表示される問題。
Issue #45 Type B として分類済み（Phase59）。
対処候補: 小節1の長さ < beatsPerMeasure × 0.75 拍分 → 番号を「0」または「♩」にする。
注意: 単純な length 比較では rubato intro / free tempo intro での誤検出リスクあり。
      判定条件は未確定。専用設計フェーズが必要。

#### Issue #45 — Chart Mode 小節頭ズレ（timing failure taxonomy）
状態: **classified / instrumented（Phase59）**
内容: Phase59の調査により、ズレの種類を以下の4タイプに分類した。

| Type | 原因 | B案で直せるか |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats 完全一致） | 不可（A案のみ） |
| Type B | pickup measure（弱起小節。小節1だけ短い） | 限定的（要設計） |
| Type C | beats 半テンポ / 粒度異常（beat resolution mismatch） | 不可（A案のみ） |
| Type D | 局所 drift → 全体伝播（当初の想定ケース） | 可能（B案対象） |

現状:
  - normalized timing pipeline 確立済み（buildNormalizedTimingAnalysis）
  - analyzeTiming() / repairDownbeats() 実装済み（repair default OFF）
  - window.__TIMING_DEBUG__ で DevTools から診断可能
  - Type D は今回調査した4曲では未発生（サンプル数少・発生頻度未確定）
  - Type A/C は A案（手動修正UI）のみで対処可能

次のアクション候補:
  - Type B: pickup measure 自動検出・表示補正（実装コスト小）
  - Type D: 発生ケース収集後に repair: true で効果検証
  - Type A/C: A案（手動修正UI）設計フェーズ（大規模・将来）

#### Chart Mode ビート単位フォーカス
状態: **完了（Phase56）**
内容: `getBeatPosition(t)` を timing.js に追加し、Chart Mode に playhead（beat cursor）を実装。
measure直下 continuous overlay として分離。`updateChartPlayback()` で left% のみ更新（DOM再生成なし）。

### その他将来検討

#### カポ範囲拡張（-2 まで対応）
状態: 未着手
内容: 現在カポは 0〜11 の範囲のみ。半音下げチューニング用途で -2 まで対応できるようにする。
方向性: カポ入力UIの範囲変更・移調ロジックの負値対応確認が必要。

#### 名前をつけて保存ショートカット（Ctrl+Shift+S）
状態: 未着手
内容: 現在 Ctrl+S は上書き保存。名前をつけて保存（Save As）を Ctrl+Shift+S で追加。
方向性: 既存の保存処理に Shift 判定を追加するだけで実装可能。

#### CHORD_DB再構造化
状態: 検討中
目的: コードDBの構造見直し・検索効率改善

#### 転回形ダイアグラム自動生成
状態: 検討中
目的: 転回形コードのダイアグラムを自動生成する仕組みの導入

#### プロジェクトDBライブラリタブ追加
状態: 未着手
内容: 保存済みプロジェクトをブラウザ内DBで管理・一覧表示するUIの追加（右パネル）

#### LAN配信モード（PCサーバー → スマホブラウザ）
状態: 検討中
目的: server.py をLAN開放し、同一Wi-Fi上のスマホからアクセスできるようにする

概要:
- server.py のバインドアドレスを `0.0.0.0` に変更するだけで基本アクセスは実現可能
- ただし以下の対応が別途必要

対応が必要な領域:
- **音声配信**: PC上の音声ファイルをHTTP経由でスマホに配信する仕組み
- **プロジェクト管理**: File System Access API依存の保存/読込をIndexedDB中心に移行
- **UI**: スマホ画面幅・タッチ操作への対応

依存関係:
- プロジェクトDBライブラリタブ（IndexedDB中心設計）が先行すると自然に解決しやすい
- Issue #27（モバイル安定化）とも関連

備考: Phase化する場合は server.py 改修・音声配信・UI対応の3段階に分割予定

#### 音楽理論・学習支援基盤（theory.js）
状態: 部分実装済み・将来拡張
目的:
- コード構成音表示
- キー/度数解析
- スケール関連表示
- 指板可視化
- 自動理論解釈

実装済み:
- alias normalization（CM7 → Cmaj7 等）
- lookup normalization（normalizeChordName / findChord）
- replacementMap.json（140件の chord name 置換辞書）

未実装:
- 完全な理論構造化（tones / intervals / harmonic relation）
- interval semantic engine

将来的には以下のような理論構造を扱う必要がある：

```js
{
  root: "C",
  quality: "maj7",
  tones: ["C","E","G","B"],
  intervals: [1,3,5,7]
}
```

---

## 3. UI/UX課題

### AddChordモーダルの記号過剰
状態: 部分対応（Phase53）
内容: `+` と `×` が多く見づらい・冗長。
- `+` ボタン → insertion cursor（`|`）への変更: **Phase53 で完了**
- hover-only 削除ボタン（`✕` 表示制御）: 未着手
- 繰り返し回数「×N回」と削除「×」の視覚的衝突: 未着手

### 中央パネルの繰り返し表示
状態: 未対応
内容: 繰り返し回数「×N回」と削除ボタン「×」が視覚的に衝突して紛らわしい。記号・デザインの見直しが必要

### 演奏モードの繰り返し表示
状態: 未対応
内容: 繰り返しが行の下に表示されて見づらく、「×N回」表記も削除操作との視覚的衝突がある。Simile記号（𝄋）の使用を検討

### カポ状態が新規プロジェクト読み込み時に引き継がれるバグ
状態: **完了（Phase58）**
内容: `loadChordData()` に `isRestore` フラグを追加し、IndexedDB restore 経路での
capo reset 副作用を排除。restore → reset → ingest の順序を invariant として確立。
`loadProj()` が uiState.capo で capo lifecycle を管理する経路を分離済み。

### localhost:8767 が読み込み中のまま開かないことがある
状態: 再現性確認中
内容: 読み込みを中止して再度読み込むと比較的早く開く。再現条件の特定が必要


### Theme system cleanup / contrast audit

- blue theme で text-secondary contrast が低く、一部UIで局所overrideが発生
- theme.css の selector override 増殖に注意
- 将来的に component → CSS variable 経由への整理を検討

---

## 4. 既知の技術的負債

- `components.css` の `.mac-insert-btn.active` 系（`--color-accent` 未定義問題と紐付き・意図的保留）
- `idb.js` は最低構成（GC・schema migration・compression なし）
  - asset種類追加: key形式 `${projectId}:${type}` に新typeを追加
  - schema変更: `DB_VERSION` をインクリメントして `onupgradeneeded` を更新
- `isSepToken` の旧形式互換（`c.chord === '/'` / `type:'sep'`）は barline migration 完了後に削除判断

### isChordLikeInput の末尾検証強化
状態: 未着手
内容: 現行の `/^[A-G](#|♯|b|♭)?/` は先頭のみ検証するため、
`Cほげ` / `A日本語` のような入力が通ってしまう。
方向性:
- 末尾まで検証する正規表現に強化（暫定案）:
  `/^[A-G](#|♯|b|♭)?[a-zA-Z0-9()+\-susmajdimaugM♭♯#/]*$/`
- または将来 `parseChordToken(raw)` として tokens.js に統合
  `{ type:'chord', raw:'D♭maj7', normalized:'C#maj7' }` のような構造
- 優先度: 低（実害は限定的。誤入力されても normalizeChordName で処理される）

### barline storage migration
状態: 意図的保留
内容: 保存済みデータの `{ type:'sep' }` / `{ chord:'/' }` を `{ type:'barline' }` へ migration。
現在は `isSepToken()` で透過的に扱えるため不急。
時期: Issue #26 の bars[] 設計フェーズ前後に合わせて実施を検討。

### token utility 追加時の import audit（教訓・Phase44）
状態: 再発防止知識
内容: Phase44-Step2 で perform.js に isChordToken を使う変更を入れたが
import 追加が漏れ、perform mode 全消失バグとして Step3 動作確認時に発覚。
対策: token 関数を追加・変更した際は、参照している全ファイルの import を同時に確認すること。

### grid-template-columns の分散管理（技術的負債・Phase49）
状態: 意図的保留
内容: `#app` の `grid-template-columns` 定義が以下の4箇所に分散している:
  1. デフォルト（3列）
  2. `body.left-collapsed`（2列・左40px）
  3. `body.right-hidden`（2列・右なし）
  4. `body.left-collapsed.right-hidden`（2列・両方）
将来: 左固定幅変更・可変サイドバー・diag幅調整が入ると重複管理になる。
時期: パネルレイアウト再設計フェーズで統合を検討。

### 左パネル collapse / hide の概念整理（Phase49）
状態: 意図的保留
内容: 現在の「◧ 左パネル」トグルは `width:40px` の collapse（細バー残存）であり、
完全非表示（hide）ではない。UIラベルと実挙動がずれている。
方向性: collapse（幅縮小）と hide（完全非表示）を概念として分離し、
UIラベル・状態変数名を整理する。
時期: パネルレイアウト再設計フェーズで対応。