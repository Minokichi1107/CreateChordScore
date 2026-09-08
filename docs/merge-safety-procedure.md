git status --short
git branch --show-current# branch → main マージ安全手順（独り立ち用）

> 位置づけ: `merge-to-main-checklist.md`をベースに、実際にやってみて
> 得た知見（BOM/改行問題への対処含む）を反映した最終版。
> AIの助けが無くても、この手順通りに進めればほぼ同じ安全性を再現できる。

---

## 大原則：4つの問い

事故の本質は「**mergeした結果、何が起きるか事前に見ていなかった**」こと。
以下の4つを、確定させる**前に**必ず「見る」。

| # | 問い | 確認コマンド |
|---|---|---|
| ① | 危険なファイルが管理対象に紛れていないか？ | `git ls-files` を grep |
| ② | .gitignoreで**削除**が起きていないか？（追加はOK、削除はNG） | `git diff` |
| ③ | mainに合流したら実際どのファイルが変わる？ | dry-run merge → `git status` |
| ④ | ③の結果、想定外のファイルが混ざっていないか？ | 目視確認 |

問題なければ確定（commit → push）。何か変なら `git merge --abort` でいつでも巻き戻せる。

---

## 手順（コピペ用・PowerShell）

### Step 0：branch側の作業を確認

```powershell
git status --short
git log --oneline -5
```

- `M .gitignore`のようにstaged/unstagedの変更が残っていないか確認
- 前回作業からの続きなら、変更内容が意図通りか`git diff --cached`等で見る

### Step 1：①危険なファイルのtracked確認（branch側）

```powershell
git ls-files | Select-String "resource/audio|resource/chords|resource/lyrics|resource/projects|resource/sample|archive/lyric|backup|copypaste|testdata/debug|^tmp/|\.vscode"
```

結果が空、または既知の誤検知（例: `scripts/backup_chordscore.bat`）のみであればOK。
何か新しいものが出たら、`git add`されてしまった個人データの可能性があるため**ここで止める**。

### Step 2：①をmain側でも確認

```powershell
git checkout main
git pull
git ls-files | Select-String "resource/audio|resource/chords|resource/lyrics|resource/projects|resource/sample|archive/lyric|backup|copypaste|testdata/debug|^tmp/|\.vscode"
```

Step 1と同じ基準で確認。**mainとbranch両方**を見るのが重要（過去のトラブルは
「両者の状態が食い違ったままmergeした」ことが一因と推測されているため）。

> `Deletion of directory ... failed` のような警告が出ても、直後の
> `git status` / `git diff` が空（クリーン）であれば無害な一時的現象。
> 心配なら該当ファイルの中身を`git diff`で確認する。

### Step 3：②.gitignoreの差分確認

```powershell
git diff main <branch名> -- .gitignore
```

- 追加行（`+`）だけであることを確認
- 削除行（`-`）がある場合は要注意：**既存の無視ルールが消えていないか**を必ず確認する
  （消えたルールに該当するファイルが、merge後に突然trackedの対象になり得るため）

### Step 4：③④ dry-runマージで実際の変更を確認

まだ何もcommitしない。「試しに合わせてみたら何が起きるか」だけを見る。

```powershell
git merge --no-commit --no-ff <branch名>
git status
```

- 変更ファイル一覧を**全部目視で読む**
- 事前に把握している作業内容（handover文書等）と照合する
- 想定外のファイルが多数出てきたら、ここでまだcommitせず立ち止まる

### Step 5：最終ダブルチェック

```powershell
git status --short | Select-String "resource/audio|resource/chords|resource/lyrics|resource/projects|resource/sample|archive/lyric"
```

出力が空であることを確認。

### Step 6：確定 or 中止

**問題なければ確定：**

```powershell
git commit
git push
```

（`git commit`実行後にエディタが開く場合、デフォルトのマージメッセージのまま
保存して閉じればOK。Vimなら `:wq` → Enter）

**何かおかしいと感じたら中止（いつでも取り消せる）：**

```powershell
git merge --abort
```

---

## 残るリスク（正直な話）

- **目視確認のミス**：ファイル一覧が長いと見落とす可能性はゼロではない
- **ファイル名だけでは中身までは分からない**：中身の意図しない変更まで
  確認したい場合は、個別に`git diff main <branch> -- <該当ファイル>`で見る

派手な変更（多数ファイル・構造変更）ほど、確定前に一度落ち着いて
`git status`の一覧を全部読むこと。急いでいる時・流し読みする時が一番危ない。

---

## 実例（2026-09-02実施：phase127-provenance-status → main）

このドキュメントの手順は、以下の実際のマージ作業で検証済み。

```
① .gitignoreへ node_modules/ / *.patch / recovery/ の除外ルールを追加
   （既存ルールへの削除は無し・追加のみ）
② 作業中に発覚したBOM欠落を修正
   （PowerShellでBOM付きUTF-8として保存し直し・git addし直し）
③ Step 1〜5をすべて実施し、危険物なし・削除なしを確認
④ dry-runの変更ファイル一覧（19ファイル）を、Phase127のhandover文書
   （実装内容の記録）と1つずつ照合して一致を確認
⑤ 問題なしと判断し、git commit → git push で確定
```

結果：事故なく完了。commit `b35f759`。

---

## 参考：BOM（Byte Order Mark）についてのメモ

ファイル先頭に付く、目に見えない3バイトの印（「UTF-8で書かれている」という
目印）。今回、エディタでの保存時に意図せず消えたことで無関係な差分
（`# OS`の行）が発生した。

**確認方法：**
```powershell
python -c "print(open('.gitignore','rb').read()[:3] == b'\xef\xbb\xbf')"
```
`True`ならBOMあり。

**BOM付きで保存し直す方法：**
```powershell
$content = Get-Content .gitignore -Raw -Encoding UTF8
[System.IO.File]::WriteAllText("$PWD\.gitignore", $content, [System.Text.UTF8Encoding]::new($true))
```

このような「意図しない差分」が混ざっていないかも、Step 3の`git diff`で
毎回確認する習慣をつけておくと安心。
