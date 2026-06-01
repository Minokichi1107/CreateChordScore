# 現在の課題・バックログ

> 最終更新: Phase44完了時点

---

## 1. バックログ（優先順）

### pause icon alignment
状態: 未着手
内容: 一時停止アイコン（⏸️）が再生ボタン内で中央からズレる。
原因候補: Unicode glyph metrics / font rendering差異。
方向性: 将来的にSVG icon化またはinline-flex + fixed width対応を検討。
単純なpadding調整は環境差で逆効果になる可能性あり。

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
状態: 未着手
内容: chordEntry.js の modal close 後、diagLocked 状態の右パネル表示を復元する処理。
Phase39-1 で forcePreviewChord が diagLockedChord を書き換えない設計になったため、
modal close 時に diagLockedChord を右パネルに再表示する処理が必要。
方向性:
- `restoreDiagAfterTransientPreview()` を app.js に追加
- `closeMod()` から呼ぶ（暫定）
- 将来: `beginTransientPreview()` / `endTransientPreview()` API に昇格

#### 行またぎコード移動
状態: 未着手
内容: 先頭コード→前行末尾 / 末尾コード→次行先頭への移動。
通常画面（inline editing）または AddChord モーダルから操作できるUIを追加。
token array boundary mutation として実装すること（string splice 禁止）。
`project.lines` 編集APIが必要。app.js 内 `moveChordAcrossLines` として設計済み（Phase38-3）。
※ modal内の小機能として実装すると line mutation が modal subsystem に漏れるため注意。

#### diagLocked — 将来拡張候補
状態: 検討
内容: Phase36で確立した diagLock gestureに将来追加できる操作。
- context menu からのlock
- long press = lock（タッチ対応時・PC版は実装済み）
備考: dblclick = lock はevent競合問題により longpress に変更済み。

### token / rendering 系

#### simile token 挿入UI
状態: 未着手
内容: AddChordモーダルから simile token（`{type:'simile', bars:1|2}`）を挿入できるUI。
Phase38-2で設計済み。chordEntry.js 拡張として実装予定。

#### renderTokenNode 層
状態: 未着手
内容: simile token の SVG描画。performSimileStyle='svg' 対応。
Phase38-2で設計済み。

#### interaction hierarchy 改修
状態: 未着手
内容: AddChord modal の操作体系をキーボード主体に変更。
- insertion cursor 化（`+` → `|` 表示への変更）
- hover-only 削除ボタン（`✕` の表示制御）
Phase38-2で設計済み。chordEntry.js 拡張として実装予定。

### Issue #26 — ChordMini Beat/Grid情報対応
状態: 設計前
内容: 将来の `bars[]` 構造への移行・grid表示・beat alignment対応。
Phase39-4 で barline canonical 化・isSepToken() access layer を確立済み。
本格設計は Issue #26 設計フェーズで行う。

### responsive UI 系

### import normalization 系

#### 非正規コード置換
状態: 未着手
内容: chordminiからのJSONインポート時の非正規コード名を解読・置換。
canonical chord / alias resolution の延長線上にある。
import normalization pipeline として設計。

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
状態: 未着手
内容: Chart Mode 内に ▶ / シークバー / 速度 / 音量 の mini transport を追加。
現在はメイン画面で再生してから Chart Mode を開く必要がある。
方向性: Chart renderer が playback authority を持つか、
既存 aEl の proxy として動作させるかを設計段階で決定する。

#### Chart Mode ビート単位フォーカス
状態: 未着手
内容: 現在の再生同期は小節単位ハイライト。
将来的にビート単位・スロット単位での追従を可能にする。
必要な要素: beat index / token duration / subdivision / sync source。
備考: 単純な UI 改善ではなく playback engine 拡張に近い規模。
timing.js の quantize() が基盤になる。Phase41 handover の「slot highlight」と同一方向。

### その他将来検討

#### コード名正規化
状態: 検討中
目的: 全角→半角変換・表記揺れ統一・lookup安定化

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
状態: 検討中
目的:
- コード構成音表示
- キー/度数解析
- スケール関連表示
- 指板可視化
- 自動理論解釈

現在の canonical chord は lookup 用文字列正規化であり、
tones / intervals / harmonic relation を持たない。

将来的には以下のような理論構造を扱う必要がある。

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
状態: 未対応
内容: `+` と `×` が多く見づらい・冗長。UI上の記号・操作要素の冗長表示を削減し、視認性と意味の明確化が必要

### 中央パネルの繰り返し表示
状態: 未対応
内容: 繰り返し回数「×N回」と削除ボタン「×」が視覚的に衝突して紛らわしい。記号・デザインの見直しが必要

### 演奏モードの繰り返し表示
状態: 未対応
内容: 繰り返しが行の下に表示されて見づらく、「×N回」表記も削除操作との視覚的衝突がある。Simile記号（𝄋）の使用を検討

### 上書き保存時にファイル選択ダイアログが開く場合がある
状態: 再現性確認中
内容: 既存プロジェクトファイルを開いた状態で上書き保存しても、ファイル選択ダイアログが開くことがある。再現条件の特定が必要

### localhost:8767 が読み込み中のまま開かないことがある
状態: 再現性確認中
内容: 読み込みを中止して再度読み込むと比較的早く開く。再現条件の特定が必要

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

### git filter-repo / git gc 実行時に objects 削除質問が大量に出る
状態: 既知・無害
内容: Windows 環境で git filter-repo や git gc を実行すると
`.git/objects/xx` の削除に失敗し `Should I try again? (y/n)` が
大量に表示される。
原因: VSCode / Explorer / ウイルス対策ソフト等が .git 配下のファイルを
ロックしているため削除できない。
影響: なし。Git の処理本体（履歴書き換え・パック）は完了している。
対処:
- `Parsed N commits` / `HEAD is now at...` が出た時点で成功
- 質問が出始めたら Ctrl+C で即中断してよい
- 気になる場合は実行前に VSCode を閉じると質問が減る

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

### Chart Mode 小節数切り替え（Phase49.5より持ち越し）
状態: 未着手
内容: Chart Mode の1行あたり小節数を表示メニューから切り替えられるようにする。
現在は `MEASURES_PER_ROW = 3` に固定（Phase49.5で3列が見やすいと確認済み）。
方向性:
- `chartMeasuresPerRow` 状態変数追加（localStorage永続）
- 表示メニューに「📊 Chart: 3列 / 4列」トグル追加
- `MEASURES_PER_ROW` を定数→引数化
注意: render関数の引数追加が呼び出し元に波及するため設計フェーズが必要。
時期: Chart Mode拡張フェーズで独立実装。