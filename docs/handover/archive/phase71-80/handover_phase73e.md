# 引き継ぎ: Phase73-E完了 — restore authority 分離 + saveProjectNew analysis 継承

## 作業状態
- ブランチ: phase73-e-restore-authority（推奨）
- 直前作業: Phase73-D完了（Legacy Project Import / empty autosave guard）

---

## 完了したこと

### 1. lastOpenedProjectId の導入（restore authority 分離）

| 変更 | 内容 | ファイル |
|---|---|---|
| `LS_LAST_OPENED` 定数追加 | `'cs.lastOpenedProjectId'` | app.js |
| `updateLastOpenedProject(id)` 追加 | localStorage への書き込み | app.js |
| `getLastOpenedProjectId()` 追加 | localStorage からの読み取り | app.js |
| `clearLastOpenedProject()` 追加 | localStorage からの削除 | app.js |
| `loadProj()` 末尾に追加 | `updateLastOpenedProject(project.id)` — 通常経路の唯一の更新ポイント | app.js |
| `restoreLastProjectOnStartup()` 書き換え | lastOpenedProjectId 優先 → フォールバック（updatedAt DESC）の2段構え | app.js |
| delete handler に追加 | 削除対象 === lastOpenedProjectId なら `clearLastOpenedProject()` | app.js |

### 2. saveProjectNew() の analysis 継承（Phase73-E 内で発覚・解決）

| 変更 | 内容 | ファイル |
|---|---|---|
| analysis 退避 → 新UUID保存 | ID変更前に raw / repairRule を退避し、新UUID で `saveAnalysisFile()` を呼ぶ | app.js |
| 処理順序確定 | ① saveProject(FSA) → ② saveAnalysisFile → ③ updateLastOpenedProject | app.js |

---

## 発覚した問題と解決経緯

### 問題: saveProjectNew() 後に 404 エラー

```
症状:
  「新規プロジェクトとして保存」実行後、次回起動時に
  GET /analysis/新UUID.json → 404
  「解析データが見つかりません」バナーが表示される。

原因:
  saveProjectNew() は project.id を新UUIDに変更するが、
  analysis/{旧UUID}.json はサーバーに残ったまま。
  loadProj() が analysis/新UUID.json を参照しようとして 404 になる。

設計確認（ChatGPT三者レビュー）:
  ① saveProjectNew() の導入経緯:
    別名保存で複数プロジェクトが同一 analysis/{id}.json を参照するバグを防ぐために導入。
    つまり「analysis は project identity に属する」が設計意図として既に確定していた。

  ② analysis/{id}.json の内部構造確認:
    { raw: {...}, repairRule: {...} }
    ↑ projectId フィールドなし。ファイル名（UUID）のみがIDとして機能する。
    → 内容の書き換えなしに新UUIDで保存できる（ChatGPTの懸念を解消）。

  ③ saveProject(true) が analysis を参照しないことを確認:
    serializeProject() は hasAnalysis フラグのみ保存。
    analysis 本体（raw/repairRule）には一切アクセスしない。
    → 「saveProject → saveAnalysisFile」の順が整合性上正しい（ChatGPT推奨順序）。
```

---

## 確定した設計原則

```
[RESTORE TARGET AUTHORITY]（Phase73-E）
  次回起動時の復元対象は lastOpenedProjectId が authority。
  updatedAt はライブラリの並び順・表示にのみ使う。
  restore authority に updatedAt を直接使わない。

[FALLBACK POLICY]
  lastOpenedProjectId が欠落 / DB 上に存在しない場合のみ
  updatedAt DESC 先頭をフォールバックとして使う。

[OPEN VS SAVE SEPARATION]
  「現在開いているproject」 ≠ 「最後にsaveされたproject」
  この2つは別概念として管理する。

[SINGLE WRITE POINT]
  lastOpenedProjectId の更新は「プロジェクトを開く責務」を持つ処理のみが行う。
  ・loadProj() 末尾（ライブラリ / ファイル→開く / 起動時復元 の全経路を包含）
  ・saveProjectNew()（新UUID確定の特殊ケース・SINGLE WRITE POINT の例外）
  複数UIから直接更新しない。

[LAST OPENED DELETE POLICY]
  削除対象ID === lastOpenedProjectId の場合のみ localStorage からクリア。
  次回起動時はフォールバックに委ねる。

[SAVE PROJECT NEW SEMANTICS]
  saveProjectNew() は現在の編集状態を保持したまま新しい project lineage を作成する。
  analysis は project identity に属するデータであり、編集状態の一部でもあるため新UUIDへ引き継ぐ。
  （この設計は saveProjectNew() 導入経緯と一致する:
   別名保存で複数プロジェクトが同一 analysis/{id}.json を参照するバグを防ぐために導入された）
  audio/chord asset の継承は将来の設計フェーズで判断する。

[ANALYSIS COPY SAFETY]
  analysis/{id}.json の内部には projectId フィールドが存在しない。
  ファイル名（UUID）のみがIDとして機能するため、内容はそのまま新UUIDで保存できる。

[ANALYSIS COPY ORDER]
  saveProjectNew() での処理順:
    ① await saveProject(true)                   FSA保存（analysis不依存を確認済み）
    ② await saveAnalysisFile(新UUID, raw, rule)  analysis保存
    ③ updateLastOpenedProject(新UUID)            lastOpened更新
  失敗時の最悪ケース:
    ①失敗（キャンセル）→ analysis/lastOpened 両方未更新（最も安全）
    ②失敗 → project は存在、Chart Mode だけ不可（再インポートで復旧可能）
    ③失敗 → 次回起動でフォールバックが効く
```

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| ライブラリから曲をクリック → 次回起動でその曲が復元される | ✅ |
| 「新規プロジェクトとして保存」→ Chart Mode が正常に使える | ✅（修正後確認済み） |
| 「開く」でファイルから読み込み → 次回起動でその曲が復元される | ✅ |
| 曲を削除 → 次回起動でフォールバック（別の曲）が出る | 未テスト（現在開いているプロジェクトは削除不可のため） |
| 「新規プロジェクトとして保存」→ ダイアログをキャンセル → 現在のプロジェクトが壊れない / lastOpened が変わらない / analysis が生成されない | 未テスト |

---

## current-issues.md 更新

- 今回 close した issue:
  - なし（Phase73-E は新設フェーズ）

- 今回新規に積み残した issue:
  - **analysis ファイルのライフサイクル管理**（状態: 意図的保留）
    現在、以下の2経路で analysis/{旧UUID}.json がサーバーに残り続ける:
    ① saveProjectNew() → 旧UUIDの analysis が孤立（参照されないだけで実害なし）
    ② deleteProject() → analysis ファイルは削除されない（Phase73-Cで記録済み）
    server.py に削除APIを追加し、saveProjectNew() / deleteProject() から呼ぶ設計は
    Phase74（パブリックリリース準備）以降で判断する。

  - **audio/chord asset の lineage 継承**（状態: 設計未定）
    saveProjectNew() で audio/chord は旧IDに紐づいたまま残る（現状の仕様）。
    完全複製（C案）が必要かどうかは実際の運用観察を経てから判断する。

---

## 積み残し・次フェーズ候補

```
Phase73-F（Library UX 軽量改善・候補）:
  - 検索欄
  - 現在開いている曲の視認性改善（▶ マークはあるが目立たない）
  - ソート記憶の初期値見直し

Phase73-G 以降:
  - 孤立 analysis ファイルのクリーンアップAPI（server.py 拡張）
  - audio/chord asset の lineage 継承設計
  - LAN配信モードへの布石
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
