# 引き継ぎ: Phase99完了 — current-issues軽量課題2件の解消

## 作業状態
- ブランチ: bugfix/library-sort-and-pagehide（想定・実際のブランチ名に合わせて修正すること）
- 直前作業: Phase98完了（Section Specification・Design Freeze）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| Commit 1: Library artist sort deterministic tie-break | `getSortedProjects()`の`'artist'`分岐に、artist名が同値の場合の`title`タイブレークを追加 | app.js |
| Commit 2: Pause playback on pagehide | `window.addEventListener('pagehide', ...)`を新設し、`aEl.pause()`を呼ぶ | app.js |

両commitとも実機確認済み（詳細は下記「調査プロセス」参照）。

---

## 調査プロセス（原因特定の経緯）

### Commit 1: ライブラリ順序退行

再発報告のみで原因未特定だった課題。[FEATURE REGRESSION POLICY]に従い、
実装漏れと決めつけず実コード（app.js）をgrepして原因を特定した。

```
listProjects()
  └ IndexedDBから updatedAt 降順で返す
    （restoreLastProjectOnStartup()内コメントで確認：
     "truth source = updatedAt 最大レコード"）
        ↓
loadProj() 末尾で autoSaveLocal() が必ず走る
  └ saveProjectToDB() により、開いただけのプロジェクトの
    updatedAt が現在時刻に更新される
        ↓
getSortedProjects(projects, 'artist')
  └ Array.sort() は安定ソート（stable sort）
  └ 同一artist名同士は「元の配列の並び順」がそのまま保持される
  └ 元の配列は updatedAt 降順のため、直前に開いた曲が
    同artist内で先頭に来てしまう
```

「実装漏れ」ではなく、「artist比較だけでは同名同士の順序を保証しない」
というタイブレーク（tie-break）設計の欠落だった。

### Commit 2: バックアップ中の音声停止問題

app.js内に`beforeunload`/`visibilitychange`/`pagehide`のいずれも
実装されていないことをgrepで確認（想定通り未実装）。

設計レビュー（ChatGPT）で「`visibilitychange`で一律pauseすると、
コード譜を見ながら他タブを参照する等の通常利用まで再生停止してしまう」
という指摘を受け、対象イベントを`pagehide`（実際の離脱時のみ）に限定した。

またrAFループとの関係について、chartmode.js側の`_startRafLoop`/
`_stopRafLoop`が非公開関数であり、app.js側からはそもそも呼び出せない
構造であることをimport一覧の確認で裏付けた。

---

## 確定した設計原則

### 【表示ソートは決定的であるべき】（Deterministic Display Sort）

同一キー（今回はartist名）でグルーピングされる表示順は、`updatedAt`のような
「たまたま今の状態」に依存する値へ暗黙に頼ってはならない。タイブレークは
明示的な二次キー（今回はtitle）で決定し、常に同じ入力からは同じ順序が
再現されることを保証する。

将来、Album/Genre等のソート項目が増えた場合も、この原則（グルーピング
キーが同値の場合は必ず明示的な二次キーで決定する）を踏襲すること。

### Playback Authority再確認（既存原則の実例確認）

Phase63で確立した「playback authority 3層分離」（architecture.md §9）の
再確認となった。

```
pause対象 = aEl（Playback Authorityそのもの）
rAFループ = chartmode.js内部のProjection層（表示更新のみ・音声再生の制御権限を持たない）
```

音声を止めたい場合、Authority（aEl）を止めれば目的は達成され、
Projection層（rAF）を個別に停止させる必要はない。またrAFループの
start/stop（`_startRafLoop`/`_stopRafLoop`）はchartmode.js非公開関数
であり、app.js側からは構造上呼び出せない（カプセル化が保たれている）。

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue:
  - ライブラリ：曲を開くと同じアーティスト内で一番上に移動する（退行の疑い）
  - バックアップ中の音声停止問題
- 今回新規に積み残したissue: なし

---

## 積み残し・保留バグ

なし（本フェーズはスコープを2件に限定し、両方完結）。

---

## 次フェーズ候補

- Phase100: current-issuesから軽量課題をさらに1件、またはChart Mode
  クリックモデル見直し等の設計寄りテーマへ着手
- current-issuesが数件片付いた段階で Section Data Layer（Phase98で
  仕様固定済み・section-model.md参照）へ着手

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
