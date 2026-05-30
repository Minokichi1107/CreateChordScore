# handover_phase45.md

```markdown
# 引き継ぎ: Phase45完了 — 行挿入ボタン上下両方向対応

## 作業状態
- ブランチ: main
- 直前作業: Phase45完了（insert-button-bidirectional）

---

## Phase45 の成果

### 完了したもの

| 変更 | 内容 | ファイル |
|---|---|---|
| onLineInsertAbove/Below 分離 | callback を上下方向に分離 | js/app.js / js/editor.js |
| [↑] 挿入 [↓] UI追加 | ホバーアクションに挿入グループ追加 | js/editor.js |
| CSS追加 | .la-insert-wrap / .la-insert-label | css/layout.css |

### commit
```
6af7218 feat: 行挿入ボタンを上下両方向対応に変更
```

### 設計ポイント
- 全行でdisabledなし・同一UI（先頭/末尾も制限なし）
- `gap:0` + label側border追加で視覚的均等を実現
- button/spanの混在でbaseline崩れを回避

---

## 保留中バグ

### capo change 無効化（intermittent）
```
ブランチ: bugfix/capo-after-ended（保留・削除しない）
状態: 再現待ち
条件: 長時間使用後 / ChartMode経由 / ended近辺
否定済み:
  - state破壊
  - _prevCapo不整合
  - diff異常
  - lines消失
  - change未発火
  - render chain完全停止
最有力仮説: timing/race系（instrumentationで消えるため）

残置ログ（再現時のため残す）:
  js/app.js:
    console.log('refreshEditor')        ← refreshEditor冒頭
    console.log('CAPO CHANGE', newCapo) ← capo change冒頭
```

---

## 次フェーズ: Phase46

### テーマ
**Project metadata schema migration**
`project.title` → `project.artist` + `project.title` に分離

### 本質
UIではなく永続データ構造の変更として扱う

```
変更前: project.title: string
変更後: project.artist: string
        project.title:  string
```

### 設計方針

#### normalizeProject を deserialize境界に置く
```javascript
// project.js
function normalizeProject(raw) {
  return {
    artist: raw.artist || '',
    title:  raw.title  || '',
    // ...
  };
}
```
各所での `project.artist || ''` 散在を防ぐ。
境界で正規化して以降は必ず存在する状態を保証する。

#### buildProjectFilename を1箇所に固定
```javascript
// project.js
function buildProjectFilename(project) {
  // {artist}-{title}_project.json
}
```
export / autosave / download / backup で規則が分裂しない。

#### backward compatibility
旧形式（titleのみ）のプロジェクトを読んだ時に自動補完する。

### 変更が必要な経路
```
js/project.js
  - serializeProject    ← artist追加
  - deserializeProject  ← normalizeProject適用・旧形式補完
  - buildProjectFilename（新設）

js/app.js
  - resetProject        ← artist初期化
  - loadProj            ← artist復元
  - getUIState          ← artist取得
  - saveProject         ← buildProjectFilename使用

index.html
  - アーティスト名input追加

css/layout.css
  - ヘッダーレイアウト調整
```

### 優先順序
```
1. artist/title 分離（Phase46）
2. save/export filename整備
3. library UI
4. IndexedDB拡張
```

---

## 積み残し（Phase49棚卸し対象）

### phase-status.md への追記
```
### Phase45 — 行挿入ボタン上下両方向対応
- onLineInsert を onLineInsertAbove / onLineInsertBelow に分離
- [↑] 挿入 [↓] グループUI追加
- .la-insert-wrap / .la-insert-label CSS追加
- 全行でdisabledなし・同一UI
```

### current-issues.md への追記・更新
```
# バックログ更新
- 「挿入ボタン ↑↓ 両方向対応」→ 完了済みとして削除

# 保留バグ更新
- capo change 無効化（intermittent）
  否定済み項目を追記:
  state破壊 / _prevCapo / diff異常 / lines消失 /
  change未発火 / render chain完全停止

# 新規追加（Phase46予告）
- Project metadata schema migration
  project.title → artist + title 分離
  normalizeProject / buildProjectFilename 新設
  backward compatibility必須
```

### architecture.md への追記
```
## 状態管理 への追記
project = {
  id,
  title,
  artist,   ← Phase46で追加予定
  ...
}

## 将来予定 への追記
Phase46: project metadata schema migration
  - artist/title 分離
  - normalizeProject境界正規化
  - buildProjectFilename一元化
```

### ui-rules.md への追記
```
なし（今回はCSS構造変更なし）
```

---

## 運用ルール（変わらず）

- 実装前に仕様確認 → 提案 → 明示的な実装指示
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 変更後の関数全体を必ず出す
- git add はパスに注意（css/ js/ プレフィックス必要）
- バグ修正は bugfix ブランチを切って作業
```