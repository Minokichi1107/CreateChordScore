# アーキテクチャ概要

> 最終更新: Phase32完了時点

---

## 1. ツール概要

ブラウザベースのギターコード譜エディター。
音声ファイルの再生・コード進行の編集・ダイアグラム表示・プロジェクト保存を行う。
フレームワーク非依存（Vanilla JS）。

---

## 2. ディレクトリ構造

```
CreateChordScore/
├─ index.html
├─ server.py
├─ css/
│   ├─ base.css
│   ├─ theme.css
│   ├─ layout.css
│   ├─ components.css
│   ├─ state.css
│   └─ perform.css
├─ js/
│   ├─ app.js
│   ├─ audio.js
│   ├─ editor.js
│   ├─ chords.js
│   ├─ project.js
│   ├─ csvImporter.js
│   ├─ perform.js
│   └─ idb.js
├─ resource/
│   ├─ audio/
│   ├─ chords/
│   ├─ icons/
│   └─ projects/
├─ docs/
├─ tools/
├─ scripts/
└─ testdata/
```

---

## 3. JSモジュール構成

| モジュール | 責務 |
|---|---|
| app.js | アプリ起動・状態管理・モジュール間調整（オーケストレーター） |
| audio.js | 音声再生管理 |
| editor.js | コード譜編集 |
| chords.js | コード情報・ダイアグラム |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理 |
| csvImporter.js | CSVインポート |
| perform.js | 演奏モード関連処理 |
| idb.js | IndexedDB操作層（audio/chord_sourceのローカル保存） |

### 依存関係ルール

- `app.js` がオーケストレーター。モジュール間の連携は `app.js` 経由を原則とする
- モジュール間の直接操作禁止（例: `editor.js` → `audio.js` の直接呼び出しは禁止）
- `project.js` はデータ管理・変換に限定（UI操作を含まない）
- `utils.js` / `helpers.js` は作らない

---

## 4. 状態管理

状態は `app.js` に集中管理される。

### project
```javascript
project = {
  id,        // UUID（IndexedDB参照キー）
  title,
  artist,
  beats,
  audioFile,
  lines[],
  palette[]
}
```

### uiState
```javascript
uiState = {
  focLine,   // フォーカス行インデックス（-1: 未選択）
  tapIdx,    // TAPモードインデックス
  diagOn,    // ダイアグラム表示フラグ
  rbHits     // 置換回数
}
```

### audioState
```javascript
audioState = {
  currentTime,
  duration,
  playing
}
```

---

## 5. 起動フロー

```
DOMContentLoaded
↓
initApp()
↓
setupEventHandlers()
↓
initializeUI()
↓
restoreProjectState()
```

---

## 6. 将来予定（構造レベル・未実装）

- モジュールが肥大化した場合は責務単位での再分割を検討
- 現時点で `app.js` の追加分割は予定なし
- 機能追加・既知課題は `current-issues.md` を参照
