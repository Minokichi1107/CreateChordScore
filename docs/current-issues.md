# 現在の課題・バックログ

> 最終更新: Phase73-A完了時点

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
※ Chart 関連作業の後に実装予定。
※ modal内の小機能として実装すると line mutation が modal subsystem に漏れるため注意。

#### interaction hierarchy 改修
状態: 部分完了（Phase53, hover-only削除ボタンはPhase70-Bで確認・完了）
内容: AddChord modal の操作体系をキーボード主体に変更。
- insertion cursor 化（`+` → `|` 表示への変更）: **Phase53 で完了**
- ArrowLeft/Right 行またぎ navigation: **Phase53 で完了**
- hover-only 削除ボタン（`✕` の表示制御）: **完了（Phase70-B確認）**
- 既存tokenのキーボード削除・小節線のキーボード挿入: 未着手
  （Backspace/Delete/separator等のキー割当は本格的なkeyboard-first redesignの
  一部として設計フェーズで扱う。Phase70-Bでは見送り）
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
設計上の注意点:
- editor renderer / chart renderer の single source of truth をどこに置くか
- focus / selection / scroll sync のタイミング
- mutation 後の chart 再描画タイミング
備考: Phase64 で 4層 architecture contract が確立したため、設計着手可能な段階。

注意（Phase69で追記）: Phase68/69で確立したprojection layer（canonical timing space ≠
visual projection space）のboundaryはまだ新しい。ここにsubsystem boundaryを追加する
Chart Mode並列表示を勢いで実装すると、projection layerを壊すリスクが高い。
着手前に設計フェーズを必ず挟むこと。

#### Chart Mode に audio controls 追加（mini transport）
状態: **完了（Phase50）**
内容: Chart Mode 内に ▶ / シークバー / 速度 / 音量 の mini transport を実装済み。
playback authority は `updateChartPlayback()` に集約（aEl listener を transport に持たせない設計）。

#### Chart Mode click seek（再生位置クリック）
状態: **完了（Phase60）**
内容: measure クリック → normalized measure model の startTime → app.js seekTo 経由でシーク。
seek authority は normalized measure model に限定（raw downbeats 禁止）。
playback authority は app.js が持つ（chartmode.js は aEl に直接触らない）。
event delegation により将来の renderer 変更に対して耐性がある。

#### Chart Mode pickup measure 表示補正（Type B 対応）
状態: **numbering完了（Phase61）/ visual projection実装完了・実曲検証待ち（Phase68〜69）**
内容:
  numbering correction: 完了（小節0 → "0"、以降 1, 2, 3 ...）
  visual projection（alignment）: 実装完了（Phase68〜69）。
    canonical timing space ≠ visual projection space の分離を確立し、
    `projectPickupSlotIndex()` / `projectionEmpty` slot / `data-visual-slot-index` /
    `chartState.pickupLeadingOffset` により measure 0 の表示位置調整・右詰め配置・
    playback highlight remapを実装済み（architecture.md §9.5参照）。
    synthetic test（FORCE_PICKUP_DEBUG）で動作確認済み。
  実曲pickup検証: 未実施（手元の楽曲が全てpickupなしのため）。
    projection-empty slot + slot--active の組み合わせを実際のpickup曲で
    最終確認することが次フェーズ候補の最優先項目。
  mode==='beat-only'でのpickup対応: 別issue（canonical measure grouping自体が
    pickupを考慮していないため、visual projectionだけでは解決できない）

pickup-aware measure alignment の影響範囲（解決済み）:
  measure.pickupOffsetBeats metadata → `chartState.pickupLeadingOffset` として実装
  leading empty slot projection → `projectionEmpty` slotとして実装
  right-aligned pickup rendering → `remapPickupOnsetMap()` で実装（右詰め・ceil基準）
  pickup-aware cursor / seek semantics → projectionEmpty slotはhover/highlight/seek対象外
    （DOM invariantで保証）。playhead位置（continuous）はremap対象外（discrete slot
    highlightingのみremap）

#### Issue #45 — Chart Mode 小節頭ズレ（timing failure taxonomy）
状態: **classified / instrumented（Phase59）/ Type B 番号補正完了（Phase61）**
内容: ズレの種類を以下の4タイプに分類した。

| Type | 原因 | 対処状況 |
|---|---|---|
| Type A | beat tracking collapse（beats = downbeats 完全一致） | 未着手（A案・手動修正UIが必要） |
| Type B | pickup measure（弱起小節） | 番号補正: 完了（Phase61）/ alignment: 将来候補 |
| Type C | beats 半テンポ / 粒度異常（beat resolution mismatch） | 未着手（A案のみ） |
| Type D | 局所 drift → 全体伝播（当初の想定ケース） | 発生ケース収集中（今回調査4曲では未発生） |

現状:
  - normalized timing pipeline 確立済み（buildNormalizedTimingAnalysis）
  - analyzeTiming() / repairDownbeats() 実装済み（repair default OFF）
  - window.__CS_DEBUG__.timing で DevTools から診断可能（Phase66で__TIMING_DEBUG__から移行）

次のアクション候補:
  - Type D: 発生ケース収集後に repair: true で効果検証
  - Type A/C: A案（手動修正UI）設計フェーズ（大規模・将来）

#### Chart Mode ビート単位フォーカス
状態: **完了（Phase56）**
内容: `getBeatPosition(t)` を timing.js に追加し、Chart Mode に playhead（beat cursor）を実装。
measure直下 continuous overlay として分離。`updateChartPlayback()` で left% のみ更新（DOM再生成なし）。

#### Chart Mode hover chord diagram
状態: **完了（Phase67）**
内容: Chart Modeのコード名hoverで小型コードダイアグラムをtooltip表示。
single tooltip instance（body直下・ephemeral UI・chartStateにauthorityを持たない）。
表示メニュー・`Shift+D`でON/OFF切替（localStorage: `cs.chartDiagHover`）。
詳細: architecture.md §9.5参照。

#### Chart Mode slot active highlight
状態: **完了（Phase69）**
内容: `.chart-slot--active`（outline主体・低alpha）を追加。
`[data-visual-slot-index]`セレクタによりprojection-aware（visual slot space対象）。
projectionEmpty slotはDOM invariant（`data-visual-slot-index`不在）により
構造的にactive対象から除外される（Phase68のexclusion設計が機能していることをaudit済み）。

### restore lifecycle 系

#### restored asset state synchronization
状態: **完了（Phase65設計・Phase66実適用）**
内容:
  `assetState {audioLoaded, chordLoaded, restoreSettled}` をasset loaded状態の
  唯一のauthorityとして導入。manual ingestとIndexedDB restoreを
  `setAudioLoaded()` / `setChordLoaded()` 経由に統一し、DOM-as-authority
  アンチパターン（`checkReloadBannerDone()`）を排除。

  `restoreSettled` guardにより、loadProj()のasync restore transaction中は
  `_evaluateBannerState()` の評価をスキップし、restore途中でのバナー誤表示・
  flickerを防止。

  また、autosave restore eligibilityを修正
  （`saved.lines.length > 0` → `saved.id && (lines>0 || title || artist ||
  audio || chord_source)`）し、metadata-only project（lines=[]）も
  復元対象に含めた。

  詳細: architecture.md §4 assetState参照。

#### beat cursorが一瞬停止して数ビートジャンプする
状態: 観察中（Phase65で記録・原因未特定）
内容: 再生中、beat cursorが一瞬停止した後、数ビート先へジャンプすることがある。
- audio playback自体は正常（カーソル描画のみの問題）
- 毎回同じ位置で再現しない（ランダム発生）・曲サイズ依存は不明

仮説候補: main thread blockage（autosave serialize / layout reflow）または
frame scheduling delay。Phase63のrAF化で「通常時は滑らか」になった副作用として
一時的なstallが目立ちやすくなっている可能性がある。

次のアクション: `__CS_DEBUG__.perf`実装（Phase66-B・perf instrumentation）後に
`performance.now()`でdt計測・frame timing測定を行う。現時点は現象記録フェーズ。

#### timing model rehydration schema contract
状態: 未着手（Phase61 hotfix で発覚・Phase64で止血済み）
内容: restore ordering contract は確立（Phase64）。
しかし schema versioning / migration layer は未定義のまま。

必要なもの:
  - runtime timing schema contract の定義
  - schema versioning / migration layer
  - invariant validation（endTime 等の必須フィールド保証）

現状: isRestore フラグ（Phase63）/ endTime 付与（Phase64）で止血済み。

### その他将来検討

#### debug observability consolidation
状態: **完了（Phase66）**
内容:
  `window.__CS_REPAIR__` 等の TEMP REPAIR タグ付きコードを削除済み。
  `window.__TIMING_DEBUG__` を廃止し、`window.__CS_DEBUG__` に統合。

  実装済み構造:
    window.__CS_DEBUG__.timing          タイミング診断（getter）
    window.__CS_DEBUG__.project          プロジェクト状態（assetState含む・shallow clone）
    window.__CS_DEBUG__.chart            Chart Mode 状態
    window.__CS_DEBUG__.dumpInvariants()  snapshot生成・console出力・return

  設計原則: debug layerはstateを所有しない（runtime state → getter projection →
  DevTools）。詳細はarchitecture.md §5.5参照。

#### `__CS_DEBUG__` perf instrumentation（Phase66-B）
状態: 未着手
内容:
  `window.__CS_DEBUG__.perf` は現状暫定実装（debug objectがstateを直接保持・
  設計原則違反）。

  正式な設計:
    chartmode.jsに`_perfState`を持たせ、`_rafLoop`で`lastRAFDelta` /
    `longFrames`を計測。`getPerfState()`をexportし、app.js側を
    getter projectionに変更する。

  実装しない理由:
    `_rafLoop`はhot path。instrumentation自体がjitterを生む可能性があり、
    restore/asset lifecycleが完全安定してから着手する。

  関連: beat cursor stall issue（restore lifecycle系参照）の調査前提。
  実装コスト: 小

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
状態: 設計完了（Phase73-A）・実装未着手
内容: 保存済みプロジェクトをブラウザ内DBで管理・一覧表示するUIの追加（右パネル）。
Phase73-AでProject Core Authority / Asset Resolution / Project Switch Lifecycleの
3原則を確定済み。次は Phase73-B（idb.js拡張・project.js拡張・generation counter実装・
autosave切替）に進む。

#### CSVコードファイルインポート機能の削除検討
状態: Deprecated候補
内容: Sonic Visualiser解析結果のCSV取り込みを想定していたが、精度が実用レベルに
達せず形骸化している。`csvImporter.js` / chord-btnのCSV分岐 / file picker accept設定の
削除を将来検討する。優先度は低く、Project DB系列のフェーズが一段落してから着手する。

#### FSA保存ファイルのProject DBへの取り込み導線
状態: 未設計・Phase73-B非ブロッキング
内容: 過去に手動保存したproject.jsonファイル群を、どうやってProject DBカタログに
登録するか。自動スキャンはFSA APIの制約上困難なため、「開いた時に自動登録される」
程度の現実的な着地になる見込み。Repository層（listProjects/getProject/saveProjectToDB/
deleteProject）やgeneration counterの実装には依存しない独立した機能のため、
Phase73-Cで個別に扱う。

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

---

## 3. UI/UX課題

### AddChordモーダルの記号過剰
状態: 部分対応（Phase53, hover-only削除ボタンはPhase70-B時点で確認・完了）
内容: `+` と `×` が多く見づらい・冗長。
- `+` ボタン → insertion cursor（`|`）への変更: **Phase53 で完了**
- hover-only 削除ボタン（`✕` 表示制御）: **完了（実装時期不明・Phase70-B確認時点でcomponents.cssに既存）**
  `.mac-preview-tag-del { opacity:0; pointer-events:none; }` +
  `:hover` / `:focus-within` で `opacity:1` に切替済み
- 繰り返し回数「×N回」と削除「×」の視覚的衝突: 未着手

### 中央パネルの繰り返し表示
状態: 未対応
内容: 繰り返し回数「×N回」と削除ボタン「×」が視覚的に衝突して紛らわしい。記号・デザインの見直しが必要

### 演奏モードの繰り返し表示
状態: 未対応
内容: 繰り返しが行の下に表示されて見づらく、「×N回」表記も削除操作との視覚的衝突がある。Simile記号（𝄋）の使用を検討

### カポ状態が新規プロジェクト読み込み時に引き継がれるバグ
状態: **完了（Phase63設計・Phase64実装）**
内容: `loadChordData()` に `isRestore` フラグを追加し、IndexedDB restore 経路での
capo reset 副作用を排除。restore → reset → ingest の順序を invariant として確立。
Phase63 で設計・Phase64 で実コード適用（3箇所の適用漏れを修正）。

### localhost:8767 が読み込み中のまま開かないことがある
状態: 再現性確認中
内容: 読み込みを中止して再度読み込むと比較的早く開く。再現条件の特定が必要

### Theme system cleanup / contrast audit

- blue theme で text-secondary contrast が低く、一部UIで局所overrideが発生
- theme.css の selector override 増殖に注意
- 将来的に component → CSS variable 経由への整理を検討

### バグ: バックアップ中の音声停止問題
状態: 未対応（低優先度）
内容: バックアップバッチ実行 → タブが再起動 → 音声は流れ続けるが止める手段がない。
原因候補: beforeunload / visibilitychange イベントで aEl.pause() が呼ばれていない。

---

## 4. 既知の技術的負債

- `components.css` の `.mac-insert-btn.active` 系（`--color-accent` 未定義問題と紐付き・意図的保留）
- `idb.js` は最低構成（GC・schema migration・compression なし）
  - Phase73-B で "projects" object store を追加予定（DB_VERSION インクリメント）
  - asset種類追加: key形式 `${projectId}:${type}` に新typeを追加
  - schema変更: `DB_VERSION` をインクリメントして `onupgradeneeded` を更新
- `isSepToken` の旧形式互換（`c.chord === '/'` / `type:'sep'`）は barline migration 完了後に削除判断

### project identity lifecycle semantics（Phase62で確立）
状態: 確立済み
内容:
  保存 → id 維持 / 別名保存 → id 維持 / 新規として保存 → 新UUID
  UUID は system-wide authority key として定義。
  将来の Project DB / workspace / recent projects の設計基盤。

  将来追加の可能性:
  外部共有 / zip import / project merge / cloud sync が来ると
  deserialize 時の duplicate UUID detection が必要になる可能性あり。

### isChordLikeInput の末尾検証強化
状態: 未着手
内容: 現行の `/^[A-G](#|♯|b|♭)?/` は先頭のみ検証するため、
`Cほげ` / `A日本語` のような入力が通ってしまう。
方向性:
- 末尾まで検証する正規表現に強化（暫定案）:
  `/^[A-G](#|♯|b|♭)?[a-zA-Z0-9()+\-susmajdimaugM♭♯#/]*$/`
- または将来 `parseChordToken(raw)` として tokens.js に統合
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

### handover記録と実コードの乖離（教訓・Phase64）
状態: 再発防止知識
内容: Phase64 で以下の「handover に書いてあったが実コードに未適用」のケースを複数発見・修正した。
  - Phase60.5: showOpenFilePicker 移行（audio/chord/project open の3経路）
  - Phase63: isRestore フラグ（loadChordData 引数・capo reset ガード・IndexedDB 呼び出し）
  - Phase61: endTime が measures[] 初期化時に未付与（hotfix は症状対処のみだった）

対策:
  - フェーズ完了後の実コード audit を handover audit と同様に実施すること
  - 特に漏れやすい箇所: フラグ追加の呼び出し側への適用・API 移行の全経路への適用・生成側のフィールド追加

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

### debug API 散在
状態: **完了（Phase66）**
内容: `window.__CS_REPAIR__` / `window.__CS_TRANSPOSE__` 等の TEMP REPAIR タグ付きコードを削除。
`window.__TIMING_DEBUG__` を `window.__CS_DEBUG__.timing` getterに統合済み。
残課題は perf instrumentation（Phase66-B）のみ（「その他将来検討」セクション参照）。

### hover hitbox分離（将来・Phase67から継続）
状態: 意図的保留
内容: Chart Mode hover chord diagram（Phase67）では現在scrollWidth guardで
carry-forward領域の誤hoverを抑制している（interaction heuristic）。
将来的にlayout span（`.chart-chord-name`）とinteraction span（`.chart-chord-hit`）を
DOMレベルで分離することで、zoom/font変更耐性・touch long-press対応・
accessibility改善が見込める。

```html
<span class="chart-chord-name">       <!-- duration layout責務 -->
  <span class="chart-chord-hit"        <!-- hover hitbox責務（将来） -->
        data-chord="Am7">Am7
  </span>
</span>
```

正式なhitbox authorityは未確立。現在のscrollWidth guardは
「テキスト幅付近のhoverだけ有効にする」暫定的なinteraction narrowingであり、
layout authorityではない。

### runtime authority の継続的な明文化（設計知見）
状態: 継続観察
内容:
  Phase60〜64 でやっていたことの本質は「authority の整理」だった。
  authority が曖昧になると設計負債化する。
  新しい機能を追加するたびに、以下の authority が明確かどうかを確認すること。

  現在確立済みの authority:
    seek authority          = normalized measure model の startTime（Phase60）
    playback authority      = app.js / aEl.currentTime（Phase50〜63）
    visual update authority = rAF loop in chartmode.js（Phase63）
    rebuild authority       = app.js が orchestration / analysisLoader.js が implementation（Phase64）
    persistence authority   = analysis.raw のみ serialize（全フェーズ通じて一貫）
    projection authority    = capo依存の変換は Layer 4（chartmode.js render phase）のみ（Phase43〜）
    mutation authority      = project.lines への変更は app.js 経由（初期から一貫）
    asset loaded authority  = assetState {audioLoaded, chordLoaded, restoreSettled}（Phase65〜66）
    debug observability     = __CS_DEBUG__ getter projection（state非所有・Phase66）
    chart visual projection = canonical timing space ≠ visual projection space
                               （data-visual-slot-index / projectPickupSlotIndex、Phase68〜69）
    project core authority  = Project DB（IndexedDB "projects" store）が canonical source
                               （audio/analysis/customDiagramsは既存authority維持・Phase73-A）

  authority が曖昧になりやすいタイミング:
    - 新しいモジュールが既存モジュールのデータを参照し始めた時
    - 「ここで直接やった方が楽」という誘惑が生じた時
    - 複数のモジュールが同じデータを書き換え始めた時

  参照: architecture.md §9 の各 authority セクション
