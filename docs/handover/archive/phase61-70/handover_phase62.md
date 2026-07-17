# 引き継ぎ: Phase62完了 — project identity semantics 確立 + 新規プロジェクトとして保存

## 作業状態

* ブランチ: main
* 直前作業: Phase61完了（pickup measure numbering / file picker improvement）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `btn-savenew` 追加 | ファイルメニューに「🆕 新規プロジェクトとして保存」を追加 | index.html |
| `btn-savenew` ハンドラ追加 | クリック時に `crypto.randomUUID()` で新UUID発行・`_fileHandle` リセット | js/app.js |
| project identity semantics 確立 | 保存操作ごとの UUID lifecycle を明文化 | js/app.js（コメント） |

### 発端となった問題

同一アーティストの複数曲を「タイトルだけ変えて別名保存」した場合に `project.id` が重複し、IndexedDB の audio/chord/analysis asset が混在する問題が発覚した。

```
原因:
  既存プロジェクトを開く（loadProj）
      ↓
  project.id がそのまま引き継がれる
      ↓
  タイトルだけ変えて保存
      ↓
  別ファイル名でも内部の id は同じ
      ↓
  IndexedDB の asset key（${projectId}:audio 等）が衝突
```

---

## 確定した設計原則

### project identity semantics（Phase62で確立）

```
操作                     project.id    用途
─────────────────────────────────────────────────────────
上書き保存               維持          同一project継続
別名保存                 維持          同一projectの別ファイル
新規プロジェクトとして保存 新UUID        別project lineage開始
─────────────────────────────────────────────────────────

UUID は system-wide authority key。
  - analyses
  - IndexedDB assets（audio / chord）
  - autosave
  - 将来の workspace / recent projects

filename ≠ project identity
  - typo修正・大文字小文字・live版・capo違い・arrange違い
    → 同一identityのまま（別名保存で対応）
  - 完全別曲
    → 「新規プロジェクトとして保存」で lineage を分岐
```

### project.id の lifecycle ルール

```
発行: 新しい project lineage を開始する時のみ
      具体的には createEmptyProject()（新規作成）と
      btn-savenew（新規プロジェクトとして保存）の2経路
維持: 保存 / 別名保存 / loadProj / serialize / deserialize
変更禁止: 自動変更・rename・autosave での上書き

将来の Project DB / workspace restore / recent projects はすべて
project.id を canonical key として設計すること。

将来追加の可能性:
  外部共有 / zip import / project merge / cloud sync が来ると
  deserialize 時の duplicate UUID detection が必要になる可能性あり。
  workspace / cloud sync 実装フェーズで検討する。
```

---

## 積み残し・保留

### Issue: timing model rehydration redesign（architecture issue）

```
問題:
  analysis.raw から runtime timing model を再構築しているが
  rehydration contract が未定義のため以下が起きやすい:
    - endTime 欠損（Phase61 hotfix で止血済み）
    - old schema との互換問題
    - NaN propagation
    - Chart Mode failure

現状:
  project.analysis.raw のみ persist する方針は正しい。
  しかし「load 後に何をどの順序で再構築するか」の contract が未定義。

必要なもの:
  - runtime timing schema contract の定義
  - schema versioning / migration layer
  - normalize step の明文化
  - invariant validation（endTime 等の必須フィールド保証）
  - restore ordering invariant:
      audio / timing / chart / capo の restore 順序が
      暗黙依存にならないよう contract 化が必要
      （今回の capo bug はこの順序依存が原因）

目的:
  old project compatibility と derived state non-persistence を両立させる。
  将来の pickup-aware alignment / override projection でも同一契約を使う。
```

### Issue: restored asset state synchronization（UX / architecture）

```
現象:
  project restore 後、audio/chord は復元済みだが
  UI は「〇〇を読み込んでください」バナーが表示される

本質:
  manual ingest（ユーザーが手動でファイルを選ぶ）と
  project restore（IndexedDB から自動復元）が別 state 扱いになっている。
  runtime loaded flags が manual ingest path でしか更新されていない。

必要:
  - restore-aware loaded state
  - ingest / restore state の統合
  - runtime asset authority の整理

将来への影響:
  autosave restore / workspace reopen / recent project reopen
  を実装する際に必ず問題になる。
  今のうちに概念を整理しておく価値がある。
```

### バグ: プロジェクト読み込み時カポ値が0になる（原因特定済み）

```
現象:
  プロジェクト保存時のカポ値が読み込み後に0にリセットされる

原因（推定）:
  loadProj() でカポ値を正しく復元した後に
  IndexedDB からの chord 自動復元経路で
  loadChordData() が isRestore=false のまま呼ばれ
  capo reset 処理が走って上書きされる

修正箇所（予想・1行）:
  app.js IndexedDB chord復元部分
  現在: loadChordData(data, chordAsset.filename)
  修正: loadChordData(data, chordAsset.filename, true)

備考:
  Phase58 で isRestore フラグを追加した際に
  IndexedDB 復元経路への適用が漏れた可能性がある
  実装前に ChatGPT の設計レビュー推奨
```

### Issue: beat cursor smoothing（UX / timing architecture）

```
発見: 中西圭三 / You and I で演奏中にカクつきを確認

本質:
  timeupdate event ベースで playback cursor を更新しているため
  発火間隔が約250ms と粗く、低fps感・ガタつき・beat jump が見える。
  beats/downbeats データ自体は正常（BPM約97・4拍子・安定）。
  描画側の問題。

方針:
  requestAnimationFrame driven interpolation に変更
  audio currentTime の線形補間で visual smoothing を実現
  timing authority は audio currentTime を維持（visual interpolation のみ）
  Chart Mode 開閉時にループ開始・停止

変更予定ファイル: js/chartmode.js / js/app.js

優先度: 高（演奏中の違和感に直結・ツールの本来の目的に影響）
```

### バグ: バックアップ中の音声停止問題（低優先度）

```
現象:
  バックアップバッチ実行 → タブが再起動
  → 音声は流れ続ける → 止める手段がない

原因候補:
  beforeunload / visibilitychange イベントで
  aEl.pause() が呼ばれていない

優先度: 低（限定的な場面のみ発生）
```

---

## 雑談セッション（2025-06-07）で出たアイデア・改善候補

### 運用改善（適用済み）

```
・project_instructions.md / review-guidelines.md に日本語説明ルールを追記済み
  （説明文は日本語・コードと関数名は英語のまま）
```

### 将来フェーズ候補: デバッグ API 整理

```
背景:
  フェーズを重ねるごとに window.__ 系のデバッグ変数が増殖している
  TEMP REPAIR タグのまま残っているものがある
  「何を見ればいいか」が整理されていない

方針:
  Step 1: 仕分け
    - 削除すべきもの（TEMP REPAIR タグのもの）
    - 残すべきもの（__TIMING_DEBUG__ 等・診断用途あり）
    - 整理すべきもの（名前がバラバラなもの）

  Step 2: window.__CS_DEBUG__ に統合
    window.__CS_DEBUG__.timing   タイミング診断
    window.__CS_DEBUG__.project  プロジェクト状態
    window.__CS_DEBUG__.chart    Chart Mode 状態
    window.__CS_DEBUG__.dumpInvariants()  ← 特に推奨
      現在の project.id / loaded asset ids / audio authority /
      chart authority / timing schema を一覧表示する
      今回のような identity collision / asset mismatch を
      即座に追跡できるようになる

  Step 3: docs/ にデバッグガイドを作成
    「〇〇を確認したい時は window.__CS_DEBUG__.×× を見る」早見表

効果:
  バグが出た時に「まずここを見る」が決まる
  消し忘れのデバッグコードが残らなくなる
  AI への「この値を確認したい」指示が出しやすくなる
```

### 観察: Chat 更新の運用

```
Claude はフェーズ区切りで Chat 更新する現在の運用が適切。
handover が「引き継ぎ書」として機能しているため
新しい Chat でも文脈が復元できる設計になっている。

ChatGPT は会話が長くなると古い内容を忘れる → 定期更新が有効。
Claude はコンテキストウィンドウが大きいが無限ではない。
フェーズ完了直後の新しい Chat で handover 作成すると
文脈が少なく消費が少なく品質も安定する。
```

---

## 次フェーズ候補

### A. カポ値が読み込み時に0になるバグ修正（推奨・実装コスト極小）

```
原因特定済み・修正箇所は1行の可能性が高い
ChatGPT の設計レビュー後に実装可能
```

### B. beat cursor 滑らか化（実装コスト小〜中）

```
演奏中の違和感に直結・優先度高い
requestAnimationFrame 対応
getBeatPosition() 線形補間追加
```

### C. timing model rehydration（技術的負債・実装コスト中）

```
derived state を persist しない設計への移行
Phase61 hotfix の根本解決
```

### D. デバッグ API 整理（運用改善・実装コスト小）

```
window.__CS_DEBUG__ 統合
docs/ デバッグガイド作成
```

---

## backlog continuity

### project identity 系

- project.id 重複問題: **完了（Phase62）**
- timing model rehydration: 将来候補
- Project DB / workspace restore: 将来（大規模）

### Chart Mode 系

- beat cursor 滑らか化: **将来候補（Phase62雑談で発見）**
- pickup-aware measure alignment: 将来候補
- Chart/editor 並列表示: 設計フェーズが必要
- Issue #45 Type A/C: A案（手動修正UI）大規模

### バグ系

- カポ値が読み込み時に0になる: **原因特定済み・未修正**
- バックアップ中の音声停止: 低優先度・未修正

---

## 棚卸し時の docs 更新差分（5フェーズ棚卸し時に適用）

### phase-status.md

① ヘッダー更新:
```
> 最終更新: Phase61完了時点
→ > 最終更新: Phase62完了時点
```

② 完了フェーズ一覧に Phase62 セクションを追加:
```markdown
### Phase62 — project identity semantics + 新規プロジェクトとして保存
- project identity semantics を確立（保存 / 別名保存 / 新規プロジェクトとして保存の UUID lifecycle 定義）
- ファイルメニューに「🆕 新規プロジェクトとして保存」追加（新UUID発行・lineage 分岐）
- fix: 同一アーティストの複数曲で project.id が重複する問題（IndexedDB asset 混在）
- filename ≠ project identity の原則確立
```

③「現在地」セクション更新:
```
- Phase61完了
→ - Phase62完了
```

### current-issues.md

① ヘッダー更新:
```
> 最終更新: Phase61完了時点
→ > 最終更新: Phase62完了時点
```

② 技術的負債セクションに追記:
```
### project identity lifecycle semantics（Phase62で確立）
状態: 確立済み
内容:
  保存 → id 維持 / 別名保存 → id 維持 / 新規として保存 → 新UUID
  UUID は system-wide authority key として定義。
  将来の Project DB / workspace / recent projects の設計基盤。
```

③ バグとして追記:
```
### バグ: プロジェクト読み込み時カポ値が0になる
状態: 原因特定済み・未修正
修正予想: app.js IndexedDB chord復元で loadChordData に isRestore=true を渡す
```

---

## commit message

```
feat: Phase62 project identity semantics + save as new project

- add "新規プロジェクトとして保存" to file menu (btn-savenew)
- generate new UUID on save-as-new to separate project lineage
- clear _fileHandle to force new file dialog on save-as-new
- fix: project.id collision when creating multiple songs from same template
- define project identity semantics:
    保存         → id 維持（同一project継続）
    別名保存     → id 維持（同一projectの別ファイル）
    新規として保存 → 新UUID（別project lineage開始）
- filename ≠ project identity（UUID is system-wide authority key）
```

---

## 運用ルール変更（適用済み）

- `project_instructions.md` / `review-guidelines.md` に日本語説明ルールを追記済み
  （説明文は日本語・コードと関数名は英語のまま）
- ChatGPT / Claude どちらへの引き継ぎでもこのルールが適用されること

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
