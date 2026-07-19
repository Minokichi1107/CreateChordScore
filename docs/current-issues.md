# 現在の課題・バックログ

> 最終更新: Phase86完了時点
> 本ファイルは現在認識している未解決課題（Current Issues・Technical Debt・UI改善）を管理する。
> 将来の新機能・構想は「5. Future Features」で管理する（README `[FILE SCOPE INVARIANT]` に準拠）。

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

## 2. Current Issues（未解決の問題・バグ・既知の設計ギャップ）

### Chart Mode 系

#### Chart Mode pickup measure（実曲検証待ち）
状態: 実装済み・実曲検証未実施
内容: pickup measureの表示補正（番号・位置調整）は実装済み（architecture.md §9.5参照）。
synthetic testでは動作確認済みだが、手元の楽曲が全てpickupなしのため実曲での
最終確認が未実施。次フェーズ候補の優先項目。

#### Issue #45 — Chart Mode 小節頭ズレ（timing failure taxonomy）
状態: Type B対応済み・Type A/C/D未対応

| Type | 原因 | 対処状況 |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats 完全一致） | 未着手（手動修正UIが必要） |
| Type C | beats 半テンポ / 粒度異常 | 未着手（手動修正UIのみ） |
| Type D | 局所 drift → 全体伝播 | 発生ケース収集中（現状未発生） |

次のアクション候補:
- Type D: 発生ケース収集後に repair: true で効果検証
- Type A/C: 手動修正UI設計フェーズ（大規模・将来）

#### Known Design Gap — N（無音プレースホルダー）の表示モデル不一致
状態: 未着手・優先度低
内容: Analysis Editorの正本（buffer）は無音プレースホルダー（chord:'N'）を実在する
編集対象として扱うが、Chart Modeの表示モデル（buildGridViewModel）はNを表示前に除外する。
この不一致により、Nの領域はクリックで選択できず、必ずeditPointへ直行する。
個別移動ボタン経由で境界調整自体は可能なため実害は小さい。
（architecture.md §12「Known Design Gap」に設計上の位置づけを記載）

#### 原因未特定の「緑の棒」バグ
状態: 観察中（原因未特定）
内容: 編集終了・保存後、または編集中に別プロジェクトへ切り替えた際、画面上に緑の細い
縦線が残ることがある。静的コード確認では原因を特定できなかった。次回発生時に
`window.__CS_DEBUG__.chart` / `window.__analysisEditorDebug.state.selection` を
コンソールで取得し、事実ベースで原因を切り分ける方針。

### Analysis Editor 系

#### [Known Limitation] replaceCurrentAndAdvance()のbackward方向の簡略化
状態: 意図的な仕様（バグではない）
内容: 置換によりコード名がqueryと一致しなくなると、matches配列は1つ前に詰まる。
forward方向（Enter）は自然に正しく動作するが、backward方向（Shift+Enter）では
詰まった分だけ1件飛ばす可能性がある。利用頻度と補正実装コストを比較し、現段階では
仕様として許容した。実害が出るようなら再検討する。

### restore lifecycle 系

#### beat cursorが一瞬停止して数ビートジャンプする
状態: 観察中（原因未特定）
内容: 再生中、beat cursorが一瞬停止した後、数ビート先へジャンプすることがある。
audio playback自体は正常（カーソル描画のみの問題）。毎回同じ位置で再現しない。
仮説候補: main thread blockage（autosave serialize / layout reflow）またはframe
scheduling delay。現時点は現象記録フェーズ（診断には「5. Future Features」の
`__CS_DEBUG__` perf instrumentation が前提となる）。

### Library / Environment 系

#### localhost:8767 が読み込み中のまま開かないことがある
状態: 再現性確認中
内容: 読み込みを中止して再度読み込むと比較的早く開く。再現条件の特定が必要

#### バックアップ中の音声停止問題
状態: 未対応（低優先度）
内容: バックアップバッチ実行 → タブが再起動 → 音声は流れ続けるが止める手段がない。
原因候補: beforeunload / visibilitychange イベントで aEl.pause() が呼ばれていない。

#### ライブラリ：曲を開くと同じアーティスト内で一番上に移動する（退行の疑い）
状態: 再発（過去に修正した認識あり・原因未調査）
内容: ライブラリを「アーティスト順」で表示中、曲をクリックして開くと、その曲が
同じアーティスト内で先頭へ移動して表示される。以前修正した認識があるが、現在再発している。
対応方針: 実装漏れと断定せず、Git履歴・ブランチ差分・マージ履歴を確認して原因を調査する
（[FEATURE REGRESSION POLICY]に従う）。

---

## 3. UI改善

### 演奏モードの繰り返し表示
状態: 未対応
内容: 繰り返しが行の下に表示されて見づらく、「×N回」表記も削除操作との視覚的衝突がある。Simile記号（𝄋）の使用を検討

---

## 4. 既知の技術的負債

- `chord-entry.css`（Phase86でcomponents.cssから分離）の `.mac-insert-btn.active` 系（`--color-accent` 未定義問題と紐付き・意図的保留）
- `idb.js` は最低構成（GC・schema migration・compression なし）。asset種類追加時は
  key形式 `${projectId}:${type}` に新typeを追加。schema変更時は `DB_VERSION` を
  インクリメントして `onupgradeneeded` を更新すること
- `isSepToken` の旧形式互換（`c.chord === '/'` / `type:'sep'`）は barline migration 完了後に削除判断
- `isChordLikeInput` の末尾検証強化
  状態: 未着手
  内容: 現行の `/^[A-G](#|♯|b|♭)?/` は先頭のみ検証するため、`Cほげ` のような
  入力が通ってしまう。優先度は低（誤入力されてもnormalizeChordNameで処理される）。
- barline storage migration（意図的保留・Issue #26 の bars[] 設計フェーズ前後に実施検討）
- `grid-template-columns` の分散管理（`#app` の定義が4箇所に分散。パネルレイアウト
  再設計フェーズで統合を検討）
- 左パネル collapse / hide の概念整理（現在の「◧ 左パネル」トグルは完全非表示ではなく
  collapse。概念とラベルを整理する。パネルレイアウト再設計フェーズで対応）
- hover hitbox分離（Chart Mode hover chord diagramは現在scrollWidth guardで
  carry-forward領域の誤hoverを抑制している暫定実装。将来layout span
  （`.chart-chord-name`）とinteraction span（`.chart-chord-hit`）をDOMレベルで
  分離することで、zoom/font変更耐性・touch long-press対応が見込める）
- 置換欄の入力検証なし（Search Engineの置換欄は `isChordLikeInput()` 等の検証を
  経由しない自由入力。chordEntry.jsが実装時に未連携だったため。誤入力時はUndoで
  復旧する前提。必要であればchordEntry.js側にvalidation関数のexportを追加する）
- 保存データ復元のschema versioning未実装（restore ordering contractは確立済み
  だが、schema versioning / migration layerは未定義のまま。isRestoreフラグ・
  endTime付与で止血済み。正式なinvariant validationは今後の課題）
- `.library-sort-select`（HTML上のclass属性）にCSSルールが存在しない
  （Phase86棚卸しで発見）。実際のスタイルは `.library-toolbar select`
  という子孫セレクタから効いているため実害なし。低優先度。

---

## 5. Future Features（将来機能・将来構想）

新機能の要望・UX改善案・長期構想。バグでも設計上の問題でもなく、
「まだ作られていない新しい能力」に分類されるものをここに置く。

### 新機能候補（次フェーズ以降の着手候補）

#### 行またぎコード移動
内容: 先頭コード→前行末尾 / 末尾コード→次行先頭へのコード移動。
`moveChordAcrossLines` として設計済み（Phase38-3）。行またぎ**カーソル navigation**は
実装済み（Phase53）だが、**コードそのものの移動**は別問題として未着手。
Chart 関連作業の後に実装予定。

#### interaction hierarchy 改修（残り）
内容: 既存tokenのキーボード削除・小節線のキーボード挿入。
insertion cursor化・行またぎnavigation・hover-only削除ボタンは対応済み（Phase53, 70-B）。
残りは本格的なkeyboard-first redesignの一部として設計フェーズで扱う。

#### simile token 挿入UI / renderTokenNode 層
内容: AddChordモーダルから simile token（`{type:'simile', bars:1|2}`）を挿入できるUIと、
そのSVG描画（performSimileStyle='svg'対応）。Phase38-2で設計済み。

#### Issue #26 — ChordMini Beat/Grid情報対応
内容: 将来の `bars[]` 構造への移行・grid表示・beat alignment対応。
`isSepToken()` access layer確立済み（Phase39-3/4）のため土台はできている。

#### Chart Mode 並列表示（編集しながら Chart を参照）
内容: Chart Mode を全画面モードではなく、エディター画面と並列表示できるようにする。
4層 architecture contract確立済みのため設計着手可能な段階だが、projection layerの
boundaryはまだ新しく、着手前に設計フェーズを必ず挟むこと。

#### Boundary Handle のドラッグ操作
内容: `requestBoundaryShift()` という入口のみ用意済み。ボタン・矢印キー以外に
ドラッグでの境界移動を追加する。

#### 二段階クリックモデルの見直し
内容: 「1クリック＝選択、2回目クリック＝editPoint」という現行モデルから、
「ダブルクリックまたは明示操作＝editPoint」への変更を候補として検討する。

#### 複数選択時の個別移動
状態: 意図的に見送り中
内容: 「選択範囲の先頭コードだけ動く」という違和感が実機確認で発覚したため、
単一選択専用に限定した（範囲シフトで代替）。再要望があれば再検討する。

#### 通常のChart Modeクリック全体への「選択+シーク」一般化
内容: 検索結果クリック時の「選択+シーク」（Phase80実装済み）を、通常のコード選択
クリック全体へ一般化する。デフォルトON、Shift+クリック・editPoint選択はシークしない
という設計方針は合意済み。

#### Boundary Handle / Playhead の表示条件見直し
内容: 検索モード中のBoundary Handle非表示/減光、再生停止中のPlayhead淡色化などの案。
現時点では「改善アイデア」の段階。

#### カポ範囲拡張（-2 まで対応）
内容: 現在カポは 0〜11 の範囲のみ。半音下げチューニング用途で -2 まで対応できるようにする。

#### 開発者支援：解析データのテスト支援機能
内容: 編集前スナップショットの保存・ChordMini解析直後の状態へリセット・
analysis.jsonのエクスポート／インポート等。優先度低（開発者向け機能）。

#### Chart Mode → Editor（コード進行の挿入）
内容: Chart Modeで解析・編集したコード進行を、通常モード（project.lines）へ
挿入できるようにする。単なるUI改善ではなく、Analysis Buffer → Chart ViewModel →
project.lines という逆変換が必要な設計テーマ。
「Editor→Chart」を含む双方向編集・システム統合の全体像は「ロードマップ」の
「Chart Modeと通常モードのシステム統合」を参照（本項目はその最初のステップ）。

#### Keyboard-first UI（キーボード操作の拡充）
内容: ほぼ全操作をキーボードから行えるようにする、という方向性のテーマ。
今回の要望（モード・タブ切替のショートカットキー化）を最初の候補として、
将来的に対象を広げていく前提で名称を一般化した。

候補（優先順位未定）:
- モード切替（Chart Mode／演奏モード／TAPモード。例: F1〜F4）
- タブ切替（ダイアグラム／ライブラリ。例: Ctrl+1/2）
- 検索・編集操作（Analysis Editorの既存ショートカットとの統一）
- Boundary操作・再生操作

具体的なキー割り当ては着手時の設計フェーズで検討する。

#### `__CS_DEBUG__` perf instrumentation
内容: `window.__CS_DEBUG__.perf` の正式化（chartmode.jsに`_perfState`を持たせ、
`getPerfState()`をexport）。beat cursorが一瞬停止する現象（現在のIssue）の
調査に必要な開発者ツール強化。`_rafLoop`はhot pathのため、restore/asset
lifecycleが完全安定してから着手する。

### ロードマップ（長期構想・優先度未定）

#### Chart Modeと通常モードのシステム統合（ロードマップ最上位テーマ）
内容: 現状はEditor（通常モード）・Chart・Performance・Tapがモードとして分離している。
将来的にはこれらを「1つのワークスペース」として統合する構想。
architecture.mdのアーキテクチャ変更を伴う規模のテーマのため、ロードマップの
最上位に位置づける。

構成要素（親子関係）:
```
Chart Modeと通常モードのシステム統合
  ├ Chart → Editor（コード進行挿入）  … 「新機能候補」参照・最初のステップ
  ├ Editor → Chart（編集の即時反映）  … 未設計
  ├ 共通編集モデル（誰がAuthorityかの再設計）
  └ モード統合（Editor/Chart/Performance/Tapの単一ワークスペース化）
```

Editor→Chartまで実現すると完全な双方向同期になり、「誰がAuthorityか」
（architecture.md §13）を再設計する必要が生じる。architecture.mdの
書き換えを伴う規模のため、着手前に必ず独立した設計フェーズを設けること。

#### CSS再構成（残タスク・theme system cleanup）
状態: 一部完了（Phase86でモジュール所有権ベースの分割完了）
内容: components.cssの肥大化は、Phase86（Sprint A）で
chart.css / analysis-editor.css / library.css / chord-entry.css /
modal.css / tapmode.css の6ファイルへ分離済み（分割基準はarchitecture.md
§3「CSS ownership」参照）。`--color-blue-rgb`のsilver/blue欠落も
Phase86で修正済み。

残タスク:
- `--color-edit-point-bg` が現在未使用
- silverテーマの `--color-green-rgb` が未定義（Phase78のamber-rgb修正・
  Phase86の--color-blue-rgb欠落と同種のパターン。今回は対象外としたため
  引き続きopen）
- theme.css の selector override 増殖（blue themeの text-secondary設定ミスはPhase79で
  修正済みだが、同種の問題が他にも潜んでいる可能性）
- components.cssに残る35ブロック（`.speed-cluster`等・複数モジュール共有／
  所有権未確定）の再監査
- `.perform-options`のスタイルがcomponents.css/layout.css/perform.cssの
  3ファイルに分散（Phase86で発見・実害なし）
- `.scope-selector`（replace.js所有と推定）の所属未確定。replace.js取得後に確定


#### CHORD_DB再構造化
目的: コードDBの構造見直し・検索効率改善

#### 転回形ダイアグラム自動生成
目的: 転回形コードのダイアグラムを自動生成する仕組みの導入

#### CSVコードファイルインポート機能の削除検討
状態: Deprecated候補
内容: Sonic Visualiser解析結果のCSV取り込みを想定していたが、精度が実用レベルに
達せず形骸化している。`csvImporter.js` 等の削除を将来検討する。

#### LAN配信モード（PCサーバー → スマホブラウザ）
目的: server.py をLAN開放し、同一Wi-Fi上のスマホからアクセスできるようにする。
音声配信・プロジェクト管理・UIの3段階対応が必要。Project DBライブラリタブが
先行すると自然に解決しやすい。

#### 音楽理論・学習支援基盤（theory.js）
目的: コード構成音表示・キー/度数解析・スケール関連表示・指板可視化・自動理論解釈
実装済み: alias normalization・lookup normalization・replacementMap.json
未実装: 完全な理論構造化（tones / intervals / harmonic relation）

---

> 将来、本セクション（5. Future Features）が肥大化した場合は
> `docs/future-roadmap.md` として独立ファイルへ切り出すことを検討する。
