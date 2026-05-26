# 引き継ぎ: Phase42.5完了 — 環境整備・Git運用改善

## 作業状態
- ブランチ: phase42-design
- 直前作業: Phase42.5完了（環境整備・Git運用改善）

---

## Phase42.5 の成果

### 完了したもの

| 作業 | 内容 |
|---|---|
| VSCode検索除外設定 | archive / backup / tmp / testdata / docs/archive 等を除外 |
| 不要ファイル削除 | dev_notes / ideas / todo / project_schedule / システム設計書 |
| 個人データgit除外 | resource/projects / chords / lyrics / sample を.gitignore追加 |
| app.js obsolete削除 | 未使用import / 重複リスナー / 空セクション / generateId削除 |
| バックアップバッチ作成 | scripts/backup_chordscore.bat |
| 起動バッチ修正 | scripts/ChordScoreを起動.bat のパス問題修正 |
| gitクリーンアップ | 4コミットに分けて整理・working tree clean達成 |

---

## 確定した運用ルール

### Git運用（新規追加）

```
バグ発見時のフロー:
  git stash
    ↓
  git checkout -b bugfix/xxx
    ↓
  デバッグ作業（console.log自由に追加）
    ↓
  修正完了
    ↓
  git diff で確認
  git add -p で1つずつ確認
    ↓
  git commit
    ↓
  元ブランチにマージ
    ↓
  git stash pop
```

### 実装ルール（新規追加）

```
- 20行以上の変更は関数全体を渡す（部分差し替え禁止）
- 実装前に「触るファイル／触らないファイル」を明示
- 複数ファイルにまたがる場合はStep番号をつけて順番に進める
- 動作確認OKが出てから次のStepへ進む
- 「ついでに修正」は禁止。1フィーチャー1コミット
- 大きな関数への変更は関数全体置換方式で提示する
```

---

## .vscode/settings.json（確定版）

```json
{
    "editor.fontSize": 16,
    "workbench.colorTheme": "Quiet Light",

    "search.exclude": {
        "**/archive/**": true,
        "**/backup/**": true,
        "**/tmp/**": true,
        "**/testdata/**": true,
        "**/docs/archive/**": true,
        "**/docs/draft/**": true,
        "**/docs/testing/**": true,
        "**/docs/prompts/**": true,
        "**/resource/sample/**": true,
        "**/docs/devlog.md": true,
        "**/docs/README.md": true
    },
    "files.exclude": {
        "**/archive/**": true,
        "**/backup/**": true,
        "**/tmp/**": true
    }
}
```

---

## バックアップ運用

```
スクリプト: scripts/backup_chordscore.bat
対象:
  resource/projects/
  resource/chords/
  resource/lyrics/
  analysis/

バックアップ先:
  D:\SettingBackup\project\Guitarchordscore\YYYY-MM-DD\
  F:\マイドライブ\SettingBackup\project\Guitarchordscore\YYYY-MM-DD\

運用: タスクスケジューラで定期実行予定
```

---

## app.js で削除したもの

```
未使用import:
  transposeRoot / showCapoInfo（chords.js）
  getAudioElement / setAudioSource（audio.js）
  renderTovLines（tapmode.js）
  rbRefresh（replace.js）

重複リスナー:
  timeupdate の4行が2回登録されていた → 1回に修正

空セクション:
  AUDIO ENGINE / LYRIC IMPORT /
  TAP MODE OVERLAY / コード置換バー

未使用関数:
  generateId()
```

---

## 現在のドキュメント構造

```
docs/
  current-issues.md     ← 現役バックログ
  phase-status.md       ← フェーズ履歴
  architecture.md       ← 現役アーキテクチャ仕様
  ui-rules.md           ← CSS設計ルール
  review-guidelines.md  ← レビュールール
  project_instructions.md ← 開発ルール
  keybindings.md        ← キーバインド一覧
  file_format.md        ← ファイルフォーマット仕様
  devlog.md             ← 開発日誌（検索除外済み）
  handover/
    handover_phase40.md ← Chart Mode設計
    handover_phase41.md ← Chart Mode実装
    handover_phase42.md ← Analysis Persistence
    handover_phase42-5.md ← 環境整備・Git運用（このファイル）
  archive/              ← 旧handover（検索除外済み）
```

---

## 次フェーズ候補

Phase43: Chord editing state stabilization（推奨）
```
対象issue:
  #44 AddChord / transpose / undo state contamination
  #43 N.C. / no chord semantic design
  Chart Mode カポ反映問題
```

または:
  チャートモード追加機能
  キー入力実装

---

## 運用ルール（変わらず）

- 実装前に仕様確認 → 提案 → 明示的な実装指示の順
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 大きな関数への変更は関数全体置換方式
- バグ修正はbugfixブランチを切って作業
```

---