# Git 運用メモ

## git filter-repo / git gc 実行時の objects 削除問題

状態: 既知・無害
環境: Windows + Git Bash

### 症状
git filter-repo や git gc を実行すると
.git/objects/xx の削除に失敗し
Should I try again? (y/n) が大量に表示される。

### 原因
VSCode / Explorer / ウイルス対策ソフト等が
.git 配下のファイルをロックしているため削除できない。

### 影響
なし。Git の処理本体（履歴書き換え・パック）は完了している。

### 対処
- Parsed N commits / HEAD is now at... が出た時点で成功
- 質問が出始めたら Ctrl+C で即中断してよい
- 気になる場合は実行前に VSCode を閉じると質問が減る
