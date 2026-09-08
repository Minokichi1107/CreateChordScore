# 引き継ぎ: Phase129完了 — Phase128 PR Merge前のCRLF/LF問題解決

## 作業状態
- 対象branch: `phase128-chartmode-diagram-registration`（作業完了・削除済み）
- 直前作業: Phase128後半完了（部分バレー表現の拡張・GitHub Issue #93-A）
- 現在の状態: **main へ Merge済み**（`eede348`）。本フェーズの作業は完了している

---

## 1. Purpose（目的）

Phase128（前半・後半）の成果をGitHub上でPR化し、`main` へMergeする前に、
PR上で`js/chartmode.js`が `+3088/-3044` という不自然な巨大diffになっている
問題の原因を特定し、安全に解決してから正式にMergeすること。

---

## 2. Scope（今回やったこと）

- `js/chartmode.js` の巨大diffの原因調査（Blob単位・バイト単位での実測）
- `.gitattributes`（`js/chartmode.js text eol=crlf`）の新設によるEOL恒久対策
- main側 `chartmode.js` Blobの正規化（独立commit）
- Phase128ブランチの追従方法の検討（Rebase→リスク検出→Merge方式へ切替）
- Merge conflict解決（Blob hash直接照合による安全な検証）
- `git checkout` 時の filter未適用問題の発見・解消
- GitHub上でのPR Merge・ブランチ削除・最終動作確認

---

## 3. Out of Scope（今回はやらないと決めたこと）

- リポジトリ全体のCRLF/LFポリシー再設計（`.gitattributes`は`chartmode.js`
  1行のみに限定。他ファイルへの拡張は行っていない）
- 過去の古いブランチ（`phase123-c1-reconcile-diagnostics` /
  `phase127-provenance-status`）の整理（今回のスコープ外・未対応のまま残存）

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | 対象 |
|---|---|---|
| `.gitattributes` 新設 | `js/chartmode.js text eol=crlf` の1行のみ | リポジトリルート |
| main側EOL正規化 | main上で独立commit（`f653ba8`）として`chartmode.js`のBlobをLFへ正規化 | main |
| Phase128ブランチ追従 | 当初Rebaseを試みたが中断し、Merge方式へ切替（詳細は5節） | phase128ブランチ |
| Merge実行 | `git merge origin/main` → conflict発生 → Blob hash照合で解決（`e5a5039`） | phase128ブランチ |
| GitHub PR Merge | PR #106として「Create a merge commit」方式でmainへ統合（`eede348`） | main |
| ブランチ削除 | `phase128-chartmode-diagram-registration`をGitHub・ローカル両方から削除 | - |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] リポジトリ全体ではなく `chartmode.js` 1行だけに `.gitattributes` を限定

```
結論: js/chartmode.js text eol=crlf の1行のみを追加する。

理由: 今回発生した問題は、既存プロジェクトルールで「chartmode.jsのみCRLFを
      維持する」という取り決めが、開発者環境の core.autocrlf=true により
      構造的に守られていなかったことが原因。他ファイルには同種の問題が
      発生していないため、必要な範囲に限定した。
```

### [判断] Rebaseを中断し、Mergeへ切り替えた

```
結論: git rebase --abort で作業を中断し、git merge に切り替えた。

理由: Phase128ブランチの開発履歴自体に、chartmode.jsのCRLF/LF往復が
      複数回（開発中の中間commit）含まれていることが判明した。
      Rebaseは各commitを1つずつ履歴順に再生するため、中間の汚れた
      状態を毎回conflictとして踏み、誤った中間状態を拾うリスクが
      高いと判断した。Mergeは最終状態同士を1回だけ3-way比較するため、
      この種の履歴汚染に影響されない。
```

### [判断] Merge conflict解決は Blob hash の直接照合で検証する

```
結論: git checkout --ours / --theirs の判断だけに頼らず、
      git rev-parse :js/chartmode.js で実際に採用されたBlob hashを
      毎回検証してから次へ進んだ。

理由: Merge時とRebase時で ours/theirs の意味が逆転するという
      Gitの仕様により、実際に一度取り違えるミスが発生した
      （main側の内容を誤って採用してしまった）。この種のミスは
      コマンド名だけでは検知できないため、Blob hashという
      客観的な事実で都度検証する方式に切り替えた。
```

### [判断] PowerShellの `>` リダイレクトを診断作業で使わない

```
結論: git cat-file blob の出力をファイル化する際、PowerShellの
      `>` ではなく cmd /c 経由、または .NET の ReadAllBytes() を用いた。

理由: PowerShell（5.1系）の `>` はデフォルトでUTF-16LEエンコーディング
      を使用するため、生のバイト列（改行コードの実体）を正しく
      保存できない。実際にこの問題で診断結果が誤り、時間を浪費した。
      以後、生バイト列の検証には必ず git hash-object で
      「元のBlob hashと一致するか」を確認するステップを挟んだ。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### 巨大diffの根本原因

```
main側 chartmode.js Blob   : CRLF形式で保存されていた
Phase128側 chartmode.js Blob: LF形式で保存されていた（開発中の
                              core.autocrlf自動変換の結果）

→ 改行コードが1行ごとに全て「違う行」として検出され、
  実質52行程度の変更が +3088/-3044 という巨大diffに見えていた
```

### `git checkout` はファイルが既に存在する場合、filter再適用をスキップすることがある

```
.gitattributes の eol=crlf 属性は正しく認識されていた
（git check-attr -a で eol: crlf と確認済み）にも関わらず、
git checkout -- js/chartmode.js を実行してもCRLFへ変換されない
現象が発生した。

原因: 既存ファイルを一旦 Remove-Item で削除してから
再度 git checkout -- を実行することで、filterが正しく
再適用され、CRLFへの変換が反映された。単純な
git checkout -- だけでは、内容に変化がないと判定された場合
filterの再適用がスキップされることがあると考えられる。
```

### PowerShellの `>` リダイレクトによる二重の落とし穴

```
1回目: git cat-file blob ... > file.txt
       → UTF-16LE化により CRLF=0、単独CR/LFが数千件という
         誤った解析結果が出た

再発防止: 以後は cmd /c "git cat-file blob ... > file.bin" を使用し、
          さらに git hash-object file.bin で元のBlob hashと
          一致することを都度確認する運用に切り替えた
```

---

## 7. Remaining Issues（残課題）

- 過去の未整理ブランチ（`phase123-c1-reconcile-diagnostics` /
  `phase127-provenance-status`）が `origin` に残存している。
  内容がmainへ反映済みか未確認のため、今回は削除しなかった
- リポジトリ全体のCRLF/LF管理方針（`.gitattributes`の他ファイルへの
  適用要否）は依然として未検討（Phase128後半handoverでも
  同様の記録あり・意図的な保留）

---

## 8. 実機確認（Phase128の成果としての最終検証）

Merge後、mainを最新化した環境で以下を確認済み。

```
□ git log -1 --oneline → eede348（Merge pull request #106）であること   → OK
□ git ls-files --eol js/chartmode.js → i/lf w/crlf attr/text eol=crlf   → OK
□ node --check（app.js/chartmode.js/chords.js/modals.js/perform.js）    → OK（全て無エラー）
□ Chart Modeのonsetセル右クリック → ダイアグラム登録メニューが出る       → OK
□ carryセルでは出ない                                                   → OK
□ 部分バレー（Cmaj9等）の登録・保存・リロード後の復元                     → OK
□ GitHub PR diffが実質差分のみ（+49/-5, chartmode.js）で表示される       → OK
□ ローカルブランチ・リモート追跡ブランチとも整理済み                      → OK
```

---

## 9. 次フェーズ候補

Phase128・Phase129として計画していた作業（GitHub Issue #93-A/#93-B・
CRLF/LF問題対応）はすべて完了。次のIntentは、README.md記載の
Development Processの方針（Issue先行ではなく、新しい要望・発見事項
ベースで選定する）に従い、次回チャットで改めて選定する。

参考: current-issues.md には Phase128完了時点で以下が積み残されている
（本phase129では未着手）。
- `.gitattributes` 導入検討（今回`chartmode.js`のみに限定して実施済み。
  他ファイルへの拡張要否は引き続き未定）
- 複数バレー（Multiple Barre）対応（実例待ち）
- bs範囲内の途中ミュート弦によるバレー帯の分断未対応

---

## Deferred Documentation（棚卸し時に反映する内容）

### current-issues.md

#### ADD
- 見出し: `chartmode.js`のCRLF/LF往復問題は`.gitattributes`により解決済み
  状態: 解決済み（Phase129）
  内容: Phase128後半handoverで記録されていた「core.autocrlf=true環境下での
  CRLF/LF往復問題」は、`.gitattributes`（`js/chartmode.js text eol=crlf`）
  の導入により恒久的に解決した。mainへMerge済み・新規clone環境でも
  `i/lf w/crlf`であることを確認済み。旧issue項目はcloseしてよい。

#### MODIFY
- No changes.

#### CLOSE
- 見出し: `chartmode.js`のCRLF/LF往復問題（`core.autocrlf=true`環境）
  （Phase128後半handoverで新規記録されたもの。Phase129で解決したためclose）

### phase-status.md

- Current Status（完了済みリスト）に追加:
  ✓ Phase129: Phase128 PR Merge前のCRLF/LF問題解決。`.gitattributes`
    （`js/chartmode.js text eol=crlf`）を新設し、main側Blobを独立commitで
    正規化。RebaseではなくMergeを採用（Phase128ブランチの開発履歴に
    含まれるEOL往復による中間状態混入リスクを回避するため）。
    Blob hash照合による安全なconflict解決を徹底。PR #106として
    `main`へMerge完了（`eede348`）

- Major Milestones（基盤・アーキテクチャ整理テーブルへ追加候補）:
  | 129 | `chartmode.js` CRLF/LF問題の恒久対策（`.gitattributes`導入。
    Git blob単位でのEOL不一致が巨大diffの原因だったことを実測で特定・
    Rebase/Mergeの意味論差異・checkout時のfilter再適用挙動など、
    複数のGit内部知見を確立） |

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
