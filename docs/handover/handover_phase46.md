# 引き継ぎ: Phase46完了 — Project Metadata Schema Migration

## 作業状態
- ブランチ: main（マージ済み）
- 直前作業: Phase46完了（project-metadata-schema-migration）

---

## Phase46 の成果

### 完了したもの

| 変更 | 内容 | ファイル |
|---|---|---|
| `normalizeProject` 新設 | deserialize境界での一括正規化。旧形式（title only）の backward compatibility を保証 | js/project.js |
| `createEmptyProject` 新設 | 空プロジェクトの生成を1箇所に集約。`resetProject` 等で使用 | js/project.js |
| `buildProjectFilename` 新設 | `{artist}-{title}_project.json` 形式のファイル名生成を1箇所に固定 | js/project.js |
| `serializeProject` 更新 | `artist` フィールドを追加 | js/project.js |
| `deserializeProject` 更新 | `normalizeProject` 適用・旧形式補完 | js/project.js |
| `resetProject` 更新 | `createEmptyProject` 使用・artist初期化 | js/app.js |
| `loadProj` 更新 | artist復元 | js/app.js |
| `getUIState` 更新 | artist取得を追加 | js/app.js |
| `saveProject` 更新 | `buildProjectFilename` 使用 | js/app.js |
| アーティスト名input追加 | ヘッダーにinput追加 | index.html |
| ヘッダーレイアウト調整 | artist/titleの並列配置 | css/layout.css |

---

## 確定した設計原則

### normalizeProject を deserialize 境界に置く

```
読み込み（JSON.parse後）
     ↓
normalizeProject(raw)   ← ここで artist / title / id 等を全補完
     ↓
以降は必ず両フィールドが存在する状態を保証
```

各所での `project.artist || ''` 散在を防ぐ。
旧形式ファイルを読んでも自動補完されるため、
呼び出し元は互換性を意識しなくてよい。

### buildProjectFilename を1箇所に固定

```javascript
// project.js
function buildProjectFilename(project) {
  const a = (project.artist || '').trim();
  const t = (project.title  || '').trim();
  if (a && t) return `${a}-${t}_project.json`;
  if (a)      return `${a}_project.json`;
  if (t)      return `${t}_project.json`;
  return 'untitled_project.json';
}
```

export / autosave / download で命名規則が分裂しない。

### project state の ownership

```
createEmptyProject()  ← 生成の唯一の場所
     ↓
project = { id, title, artist, audio, capo, lines, chord_source }
     ↓
getUIState()  ← artist / title / capo / key / tempo をUI要素から収集
     ↓
serializeProject(project, uiState)  ← 保存形式へ変換
```

---

## 混乱と教訓

### CSS調整の混乱

Phase46 でヘッダーへの artist input 追加と同時に
`layout.css` のヘッダーレイアウトを調整した。

**教訓：UI変更と責務移行（schema migration）は分離すべきだった。**

- schema migration（project.js / app.js）: 純粋なデータ構造変更
- UI変更（index.html / layout.css）: 見た目の変更

この2つを同一フェーズに混在させたことで、
「どちらのせいでレイアウトが崩れたか」の切り分けが困難になった。

次回同様の作業では schema migration を先に完成させ、
UIは別コミット（または別フェーズ）にする。

---

## 積み残し

### phase-status.md への追記（棚卸し時）

```
### Phase45 — 行挿入ボタン上下両方向対応
- onLineInsert を onLineInsertAbove / onLineInsertBelow に分離
- [↑] 挿入 [↓] グループUI追加
- .la-insert-wrap / .la-insert-label CSS追加

### Phase46 — Project Metadata Schema Migration
- project.title → artist + title 分離
- normalizeProject / createEmptyProject / buildProjectFilename 新設
- serializeProject / deserializeProject / resetProject / loadProj 更新
- ヘッダーにアーティスト名入力欄追加
- 旧形式（title only）backward compatibility 保証
```

### current-issues.md の更新（棚卸し時）

- 「アーティスト名 / 曲名フィールド分離」→ 完了済みとして削除
- capo change 無効化バグ（intermittent）の否定済み項目を追記

---

## 次フェーズ候補: Phase47

### テーマ候補

以下の中から選択（軽量〜中規模）：

#### A. Chart Mode 拡張: mini transport 追加
Chart Mode 内に ▶ / シークバー / 速度 / 音量 の mini transport を追加。
現在はメイン画面で再生してから Chart Mode を開く必要がある。
**規模: 中**

#### B. プロジェクトライブラリUI（IndexedDB）
保存済みプロジェクトをブラウザ内DBで管理・一覧表示するUIを追加。
LAN配信モードへの布石になる。
**規模: 大（設計フェーズが必要）**

#### C. 軽量UI改善: フロートメニュー位置改善
狭幅時にフロートメニューが編集エリアと重なる問題。
lyric baseline anchor への変更。
**規模: 小**

#### D. Chart Mode 並列表示（設計フェーズ）
Chart Mode を全画面ではなくエディターと並列表示できるようにする。
Phase44 の projection responsibility 整理が完了したため設計可能な段階。
**規模: 大（設計フェーズ）**

---

## 保留バグ

### capo change 無効化（intermittent）
ブランチ: `bugfix/capo-after-ended`（保留・削除しない）
状態: 再現待ち
否定済み: state破壊 / _prevCapo不整合 / diff異常 / lines消失 / change未発火 / render chain完全停止
最有力仮説: timing/race系

---

## 運用ルール（変わらず）

- 実装前に仕様確認 → 提案 → 明示的な実装指示
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 変更後の関数全体を必ず出す
- git add はパスに注意（css/ js/ プレフィックス必要）
- バグ修正は bugfix ブランチを切って作業
