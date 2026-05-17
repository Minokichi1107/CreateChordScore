# アーキテクチャ概要

> 最終更新: Phase33完了時点

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
│   ├─ modals.js
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
| chords.js | コード情報・ダイアグラム・lookup |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理 |
| csvImporter.js | CSVインポート |
| perform.js | 演奏モード関連処理 |
| modals.js | 軽量modal群（time / repeat / copy / diagram / chordEdit） |
| idb.js | IndexedDB操作層（audio/chord_sourceのローカル保存） |

### 依存関係ルール

- `app.js` がオーケストレーター。モジュール間の連携は `app.js` 経由を原則とする
- モジュール間の直接操作禁止（例: `editor.js` → `audio.js` の直接呼び出しは禁止）
- `project.js` はデータ管理・変換に限定（UI操作を含まない）
- `modals.js` はUI lifecycle と callback通知のみ。state mutationは app.js が担当
- `utils.js` / `helpers.js` は作らない

### modals.js 依存注入パターン

`modals.js` は `initModals({...})` で依存を注入される。

```javascript
initModals({
  // 共通土台
  openModal, closeModal, mkMBtn, toast, getAudioTime,
  // diagram modal用
  getPreviewSvg, getCapo, generateId,
  onAddDiagram, onUpdateDiagram, getDiagCallbacks,
  // chord edit modal用
  onPreviewChord,
})
```

注入ルール：
- 「何をしたいか」を表す抽象callbackを渡す（例: `onPreviewChord`）
- 内部実装（`setDiagRight` / `getCapo` 等）を直接渡さない
- 広域stateの丸渡し（`getProject()` 等）は禁止

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
  rbHits,    // 置換回数
  // 将来追加予定:
  // diagLocked,     // ダイアグラム固定フラグ（hover → locked分離）
  // manualCollapsed,// 左パネル手動折りたたみ
  // autoCollapsed,  // 左パネル自動折りたたみ（responsive）
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
initModals()         ← Phase33で追加
↓
initializeUI()
↓
restoreProjectState()
```

---

## 6. 将来予定（構造レベル・未実装）

### chordEntry.js（将来）
`openAddChord` は現在 `app.js` に残留しているが、将来的に独立subsystem化を想定。

```
chordEntry.js（将来）
  ├ openAddChord
  ├ insertAt state管理
  ├ preview rendering
  ├ keyboard handling
  ├ 他行コード転送
  └ live editing flow
```

現時点で `modals.js` への収納は行わない。理由：ライブ編集型であり軽量modal群と性質が異なるため。

### その他将来予定
- モジュールが肥大化した場合は責務単位での再分割を検討
- 機能追加・既知課題は `current-issues.md` を参照
