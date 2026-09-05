# Phase127-F 進行状況スナップショット（更新版・チャット引き継ぎ用）

> 位置づけ: 前バージョンのスナップショットには「バックフィル機能は
> データ破損バグが確認されており使用禁止」という記載があったが、
> これは後続チャットでの再調査の結果、**根拠が崩れて撤回**された。
> 本ファイルはその再調査結果と、その後実装したPhase127-F②
> （Structure Sync・🔵バックフィル）を反映した最新版である。
> 正式なhandover_phase127-f.mdの作成はまだ行っていないため、
> 引き続き本ファイルが次チャットへの引き継ぎ役を担う。

---

## 0. 現状サマリー（最重要・まずここを読むこと）

```
Section消失問題（1曲・過去に発生）:
  原因は未確定のまま。「TOCTOU（同時編集によるレースコンディション）が
  原因」という以前の結論は撤回・保留とした。
  → 詳細は §1 参照

バックフィル機能（「ファイル▼」→「編集状況を再判定」）:
  実行禁止ではない。Phase127-F②で安全性を再設計した上で実装・
  3巡のChatGPTレビュー・実機検証を完了している。
  → 詳細は §2 参照
```

**この2つは別の話である。** Section消失原因の調査が保留になったことは、
バックフィル機能の安全性を否定するものではない（むしろ調査の過程で、
コード追跡・実機検証を通じてバックフィルの安全設計が固まった）。

---

## 1. Section消失問題（保留・原因未確定）

### 1-1. 発端と、以前の結論（撤回済み）

Phase127-F実機テスト中、Section構成を持っていた曲（1曲）でSectionが
消失していることに気づいた。当時のチャットは、以下の相関から
「バックフィル実行中のTOCTOU（同時編集による上書き）」と結論づけていた。

```
根拠とされたもの: 🟡（hasContentEdit検出）が付いた曲と、
                   Section消失に気づいた曲が一致していた（相関）
```

**この結論は推測であり、実際のログでの検証は行われていなかった。**

### 1-2. 再調査で判明したこと（撤回の根拠）

たかっちさんへの聞き取りと、コードの追跡調査により、以下が判明した。

```
・消えたSectionはバックフィル実行のずっと前に作成されたもの
・バックフィル実行中にその曲を編集・保存した記憶はない
  （TOCTOU成立に必須の「同時編集」が起きていなかった）
・新旧いずれのバックフィルのコードを追跡しても、
  単発実行（同時編集なし）でSectionが消える書き込み経路が
  見当たらなかった
  （snapshotRawの比較対象はIndexedDB上のインポート時オリジナル
  データであり、Sectionを一切含まない。書き込みはraw全体を
  そのまま書き戻すだけで、sectionsフィールドには一切触れない）
```

たかっちさん自身も「1曲だけの事象であり、自分の記憶違い・過去の
設定ミスだった可能性もある」とコメントしている。

### 1-3. 現在の扱い

```
判断: 保留・観察継続。これ以上の深追いはコストに見合わないため
      打ち切る（件数1・再現性なし・機構的な原因も見当たらない）。

TOCTOU予防策（baseVersionによる楽観的並行性制御）の位置づけ:
  「確定した原因の修正」ではなく「将来発生し得るread-modify-write
  競合から既存データを守る予防的強化」として実装済みのまま活かす
  （実装自体は妥当な防御的設計のため無駄にはしない）。
```

今後、同種のSection消失が再発した場合は、今回追加した診断・競合防御
（`baseVersion`不一致時のconflictログ等）により、推測ではなくログから
原因を追える状態になっている。

---

## 2. バックフィル機能（Phase127-F）実装状況

### 2-1. Phase127-F①〜④（既存・変更なし）

```
① 🔵（Section）のライブチェック化 — 完了・実機確認OK
   create/delete時の一方向フラグではなく、保存の都度
   getSections(session).length > 0 で再計算する方式に変更済み。

②③ Migration State設計・再インポート時のリセット — 完了
   project.contentEditBackfill = { version, status, checkedAt }
   contentEditBackfillが未設定（undefined）＝バックフィル対象、
   という判定方式。再インポート時はhasContentEdit=falseへリセット。

④ 比較ロジック本体（compareContentEditSnapshot） — 完了
   chords（名前・start/end）・beats・downbeatsのみを比較対象とし、
   1e-6秒の許容誤差で数値比較。10パターンの単体テストPASS。
```

### 2-2. Phase127-F②（今回追加・Structure Sync実装）

既存曲で`raw.sections`にデータがあるのに、Analysis Editorで一度も
保存し直していないと🔵が付かない問題を解消した。

**責務分離（設計の核心）:**

```
Content Migration（🟡 hasContentEdit）
  「オリジナルインポート内容から変化したか」の1回限りの判定。
  contentEditBackfillで管理し、一度判定したプロジェクトは
  再評価しない。

Structure Sync（🔵 hasStructureEdit）
  「今この瞬間、raw.sectionsが存在するか」という現在状態からの
  導出値。Migration Stateとは独立に、実行のたびに現在状態との
  一致を検査する（検査する＝毎回保存する、ではない）。

  [重要] hasStructureEditは「ユーザーがSectionを手動編集した」
  という操作履歴の証明ではない。「現在Section構造が存在する」
  という現在状態から導出されるProvenance表示である。
```

両者の判定結果は、変更がある場合に限り1つの`raw.provenance`へ
マージした上で、`saveAnalysisFile()`を1回だけ呼んで書き込む
（Single Writerの原則を保つため、2回に分けて書き込まない）。

**新設した安全設計（`[BACKFILL NON-DESTRUCTIVE INVARIANT]`。
正本はarchitecture.md §12。要約のみ以下に記載）:**

```
・provenance関連状態（raw.provenance / contentEditBackfill /
  provenanceSummary）以外のデータは一切変更しない
・raw書き込みはgeneratedAtをbaseVersionとしてサーバーへ送り、
  読み込み後に他の保存が入っていないか確認した上でのみ行う
  （server.py側の楽観的並行性制御。socketserver.TCPServerが
  シングルスレッドであることが前提）
・conflict検出時は🟡🔵両方の判定結果を破棄し、次回に再評価する
  （一部だけ確定させない）
・analysisFile自体の読み込みに失敗した場合（loadAnalysisFile()は
  ファイル不在・JSON破損・fetch失敗を区別せず一律nullを返す）も
  恒久的な'unavailable'として確定せず、次回に再試行する
```

**設計プロセス:** Technical Design → ChatGPT 3巡レビュー
（設計承認 → async化・読み込み失敗の扱いの修正指摘 → 実装コード監査）
を経て実装。前回のPhase127-F作業で「単体テストPASSでも実機で
`ReferenceError`が発生した」教訓から、今回は実際の`app.js`経由での
本番接続経路テストを必須とした。

### 2-3. 検証済み／未検証の境界（重要・混同しないこと）

| 検証項目 | 状態 |
|---|---|
| 実機・本番経路でReferenceError等が無いこと | ✅ 実機PASS |
| 既にMigration済みの曲でもStructure Syncが動くこと | ✅ 実機PASS（意図的に矛盾状態を作って確認） |
| `sections>0 / hasStructureEdit=false → true`への復元 | ✅ 実機PASS（DevToolsから`/save-analysis`へ直接POSTして矛盾状態を作成→バックフィル実行→復元確認） |
| toast文言（「セクション構成のみ検出: N件」） | ✅ 実機PASS |
| `sections=[] / hasStructureEdit=true → false`への復元 | ⚠️ **実機未検証**。ロジックは対称的で`_evaluateStructureSync()`のコードレビューで担保 |
| `raw.sections`が不正形式（Array以外） | ⚠️ コードレビューのみ（`Array.isArray`ガードで対応） |
| `analysisFile`読み込み失敗時の挙動 | ⚠️ コードレビューのみ |
| 🟡＋🔵同時変更時、`saveAnalysisFile()`が1回だけ呼ばれること | ⚠️ コードレビューのみ |
| conflict発生時、🟡🔵両方が破棄されること | ⚠️ コードレビューのみ |
| `node --check js/app.js` | ✅ PASS |
| `python -m py_compile server.py` | ✅ PASS |
| `git diff --check` | ✅ PASS（CRLF警告のみ・内容上の問題なし） |

「実機検証済み」と「コードレビューのみで担保」を次チャットが混同
しないよう、この表を正本として扱うこと。

---

## 3. 次チャット・次フェーズへの注意点

```
・recovery系ファイル（music-recovery-match*.csv・recovery/）は
  Phase127-F②のcommit対象外。音声ファイル復旧調査
  （ChatGPT側で別途進行中）の成果物であり、今回のスコープと無関係
  （git addしないこと）

・今回のPhase127-F②変更範囲と、過去の音声/Section消失調査を
  混同しないこと。両者は独立した別問題として扱う

・正式なhandover_phase127-f.mdはまだ作成していない。本ファイルが
  代わりに現状を引き継ぐ。次チャットで手が空いたタイミングで、
  docs/handover/README.mdのテンプレートに沿った正式handoverへ
  整理することを推奨する（Design Decisions・Findings等、今回の
  設計判断の経緯は記録価値が高い）

・architecture.md §12に[BACKFILL NON-DESTRUCTIVE INVARIANT]を
  追記済み（Named Invariant即時反映ルールに従い、commitと同時に
  反映済みのはず。次チャットは反映済みであることを前提にしてよい）
```

---

## 4. Phase127全体の状況（前回スナップショットからの引き継ぎ）

- Phase127-D'まで完了（Provenance Tooltip機構）
- Phase127-F：①〜④実装完了 → 🟡単体でのバグ調査（TOCTOU仮説・保留）
  → 🔵 Structure Sync実装（F②）→ 実機検証・コード監査PASS →
  architecture.md反映 → **commit準備完了**
- Phase127-E（Provenance Popover）は未着手のまま

## 5. 新チャットでの再開方法

1. このファイル（更新版）をプロジェクトにアップロード（またはメッセージに添付）
2. commitが完了していれば「Phase127-F②はcommit済みです」、
   未完了であれば「commit前の最終確認から続けてください」と伝える
3. リポジトリは`bash_tool + git clone`で毎回取得し直す
