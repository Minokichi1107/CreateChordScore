# キーバインド管理台帳

> 最終更新: Phase92完了時点（app.js実コード確認済み）
>
> このファイルの目的:
> - 実装済みキーの一覧管理
> - OS/ブラウザ衝突の記録
> - 新規キー追加時の衝突チェック用リファレンス

---

## 実装確認ポリシー

この台帳は「実コードで確認済み」と「handover文書由来」を区別して管理する。

- **実コード確認済み**: app.js / chartmode.js 等をgrepして確認（行番号を併記）
- **handover由来**: フェーズhandoverに記載があるが、現行コード未確認
- **要確認**: どちらにも確証がなく、次回コード監査対象

新規キー追加時は、可能な限り「実コード確認済み」へ昇格させること。

**本更新（app.js確認）時点で、旧版にあった「要確認」項目はすべて実コードで解消済み。**
残る「要確認」はOS/ブラウザ側の挙動（コード側では検証不可能な項目）のみ。

---

## 凡例

| 項目 | 意味 |
|---|---|
| Scope | `global` = 常時有効 / `perform` = 演奏モード中のみ / `analysis` = Analysis Editor編集中のみ（`isAnalysisEditing()`） |
| Context | そのスコープ内でさらに有効条件がある場合に記載 |
| preventDefault | ブラウザデフォルト動作をキャンセルするか |
| Conflict | OS・ブラウザとの衝突リスク |
| Source | 実装箇所（ファイル・関数名・行番号） |

---

## 実装済みキーバインド

### Global（常時有効）

| Key | Action | preventDefault | Conflict | Source |
|---|---|---|---|---|
| `Ctrl+S` | プロジェクト上書き保存 | ✅ 必要（確認済み） | ⚠️ ブラウザの「ページ保存」と衝突。preventDefault済み | app.js L3689 |
| `Ctrl+Shift+S` | 名前を付けて保存（別名保存） | ✅ 必要（確認済み） | ⚠️ Ctrl+Sと同系統。上記と同じ分岐内でshiftKeyにより切替 | app.js L3689-3696 |
| `Alt+N` | 新規プロジェクト作成 | ✅ 必要（確認済み） | ⚠️ macOSではOption+N系の文字入力（チルダ系ダイアクリティカル）と、キーボード配列によって競合する可能性あり。`e.key==='n'`固定判定のため大文字Nでは発火しない | app.js L3699（`e.altKey && e.key==='n'`） |
| `Ctrl+Z` | コード自動登録のUNDO（importUndoStack） | ✅ 必要（確認済み） | ⚠️ ブラウザ・OSの汎用Undoと衝突。importUndoStackが空の場合はブラウザに渡さず無視。**`isAnalysisEditing()`中は完全に無効化**（下記Analysis Editor側のCtrl+Zと競合しないことをコード上のガードで確認済み・排他は明示的） | app.js L3707（`!isAnalysisEditing()`ガード） |
| `Ctrl+H` | 置換バー開閉 | ✅ 必要（確認済み） | ⚠️ ブラウザの「検索と置換」と衝突（Firefoxなど）。preventDefault済み | app.js L3678 |
| `L` | diagLocked トグル（右パネル固定/解除） | 不要 | ✅ 低リスク。テキスト入力中・演奏モード表示中はguard済み（確認済み） | app.js L3718 |
| `Escape` | 優先順位付きの多段クローズ：①モーダル閉じる ②検索バー閉じる（Analysis Editor中） ③diagLock解除 ④editPoint解除（Analysis Editor中） | 状況により異なる（確認済み） | ✅ 低リスク。優先順位がコード上で固定されておりモーダル優先は保証される | app.js L3731-3754 |
| `Shift+[` | 左パネル トグル（collapse切替） | 不要 | ✅ 低リスク。テキスト入力中はguard済み | app.js L3790（`e.key==='{'`。JIS/US配列差はe.key基準のため吸収） |
| `Shift+]` | 右パネル トグル（非表示切替） | 不要 | ✅ 低リスク。テキスト入力中はguard済み | app.js L3799（`e.key==='}'`） |
| `Shift+D` | Chart Mode コード図ホバー ON/OFF（Chart Mode表示中のみ） | 不要 | ✅ 低リスク。テキスト入力中・Chart Mode非表示中はguard済み | app.js L3808 |

### Perform Mode（演奏モード中のみ）

| Key | Context | Action | preventDefault | Conflict | Source |
|---|---|---|---|---|---|
| `Space` | 演奏モード全般 | 再生 / 一時停止 | ✅ 必要 | ⚠️ ブラウザのスクロールと衝突。preventDefault済み | app.js `setupEventHandlers` |
| `ArrowLeft` | 静止モード（static）のみ | 前ページへ | ✅ 必要 | ✅ 演奏モード内限定のため低リスク | app.js `setupEventHandlers` |
| `ArrowRight` | 静止モード（static）のみ | 次ページへ | ✅ 必要 | ✅ 演奏モード内限定のため低リスク | app.js `setupEventHandlers` |

### Analysis Editor（`isAnalysisEditing()`が真の間のみ有効）

> Phase74〜92で追加。今回すべてapp.js実コードで確認済み。

| Key | Context | Action | preventDefault | Conflict | Source |
|---|---|---|---|---|---|
| `Ctrl+F` | Analysis Editor編集中（テキスト入力中は素通り） | 検索バーを開く（`openSearchBar()`） | ✅ 必要（確認済み） | ✅ 低リスク。inTextInputガードにより検索欄自身にフォーカス中はブラウザ標準検索と衝突しない | app.js L3866 |
| `F3` | 検索バー開＋ヒット1件以上の時のみ（フォーカス位置に関わらず動作） | 次の検索結果へ（`searchGoToNext()`） | ✅ 必要（確認済み） | ⚠️ ブラウザの「ページ内検索の次へ（Find Next）」と同キー。アプリが優先的に処理する設計（コード内コメントに「ChatGPTレビューで確定した条件」と明記あり） | app.js L3877（Phase80） |
| `Shift+F3` | 同上 | 前の検索結果へ（`searchGoToPrev()`） | ✅ 必要（確認済み） | 同上 | app.js L3877 |
| `Enter` | 検索欄（searchInput）フォーカス中 | 次のヒットへ | ✅ 必要（確認済み） | ✅ 低リスク（検索欄内で完結） | app.js（searchInput keydownリスナー） |
| `Shift+Enter` | 検索欄（searchInput）フォーカス中 | 前のヒットへ | ✅ 必要（確認済み） | 同上 | app.js（searchInput keydownリスナー） |
| `Enter` | 置換欄（replaceInput）フォーカス中 | 置換して次へ（`replaceCurrentAndAdvance(1)`） | ✅ 必要（確認済み） | ✅ 低リスク（置換欄内で完結） | app.js（replaceInput keydownリスナー） |
| `Shift+Enter` | 置換欄（replaceInput）フォーカス中 | 置換して前へ（`replaceCurrentAndAdvance(-1)`） | ✅ 必要（確認済み） | 同上 | app.js（replaceInput keydownリスナー） |
| `Enter` | editPointモード中・上記フォーカス以外・モーダル非表示時 | Add Here実行（`addChordAtEditPoint()`） | ✅ 必要（確認済み） | ✅ 低リスク。modal-ov表示中・テキスト入力中はguard済み | app.js L3762（Phase77後半） |
| `Enter` | 単一選択中（single）・上記フォーカス以外・モーダル非表示時 | コード名変更モーダルを開く（`openChordRenameSelector()`） | ✅ 必要（確認済み） | ⚠️ 上記editPoint時のEnterと同キーだが`deriveEditorMode()`の分岐で排他（確認済み） | app.js L3773（Phase83） |
| `Ctrl+C` | Analysis Editor編集中（テキスト入力中は無効） | コピー（`copySelection()`） | ✅ 必要（確認済み） | ✅ 低リスク（テキスト入力欄では素通り） | app.js L3828（Phase76-G） |
| `Ctrl+X` | 同上 | 切り取り（`cutSelection()`） | ✅ 必要（確認済み） | ✅ 低リスク | app.js L3832 |
| `Ctrl+V` | 同上（`!e.shiftKey`） | そのまま貼り付け・絶対位置保持（`pasteAbsolute()`） | ✅ 必要（確認済み） | ⚠️ ブラウザ標準の貼り付けと同キーだが、テキスト入力欄では素通りするためアプリ内では実害なし | app.js L3838（Phase79） |
| `Ctrl+Shift+V` | 同上 | 範囲に合わせて貼り付け（`pasteSelection()`） | ✅ 必要（確認済み） | ⚠️ Chrome/Edge/Firefoxで「書式なしペースト」と同キーだが、テキスト入力欄では素通りするためアプリ内では実害なし | app.js L3842（Phase79） |
| `Delete` / `Backspace` | 同上 | 選択削除（`deleteSelection()`。単一選択も内部で吸収） | ✅ 必要（確認済み） | ⚠️ Backspaceは環境によって「戻る」と衝突するが、テキスト入力欄では素通りするため実害なし | app.js L3846（Phase76-G） |
| `Ctrl+Z` | 同上 | Undo（`undoEdit()`） | ✅ 必要（確認済み） | ✅ 低リスク。上部GlobalのCtrl+Z（import undo）とは`isAnalysisEditing()`で完全排他（コード上のガードで確認済み・競合なし） | app.js L3853（Phase79） |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 同上 | Redo（`redoEdit()`）。両方の組み合わせに対応 | ✅ 必要（確認済み） | ✅ 低リスク | app.js L3857（Phase79） |
| `ArrowLeft` / `ArrowRight` | 同上（テキスト入力中は無効） | 単一選択→個別移動（`shiftSelectedBoundary()`）／複数選択→範囲シフト（`shiftSelectionRange()`）。選択数で自動切替 | ✅ 必要（確認済み） | ✅ 低リスク | app.js L3891（Sprint2で確定） |
| `Shift+ArrowLeft` / `Shift+ArrowRight` | 同上 | 歩幅を0.1秒→0.5秒に拡大（対象切替ロジックは上と同じ） | ✅ 必要（確認済み） | ✅ 低リスク | app.js L3895 |
| `Ctrl+Shift+ArrowLeft` / `Ctrl+Shift+ArrowRight` | 同上 | 全体移動（`shiftAll()`）。選択数に関わらず優先。曲全体に影響するため重い修飾キーの組み合わせを意図的に採用 | ✅ 必要（確認済み） | ⚠️ 破壊力の大きい操作。誤操作防止のためあえてCtrl+Shift併用にしている（コード内コメントに明記） | app.js L3898 |
| `Ctrl/Cmd+クリック` | Chart Modeのコードセル・`!e.shiftKey`の時のみ | 二段階クリックモデルをバイパスして即editPoint確定 | N/A（クリックイベント） | ✅ 低リスク（Shift優先のため範囲選択とは排他） | chartmode.js（Phase86-2で追加・実コード確認済み） |
| `Shift+クリック` | Chart Modeのコードセル | 範囲選択（`selectChordRange()`） | N/A（クリックイベント） | ✅ 低リスク | chartmode.js / analysisSession.js `selectRange()`（Phase76） |

---

## ブラウザ衝突リスク早見表

新規キーを追加する前にここで確認する。

| Key | ブラウザ衝突 | OS衝突 | 備考 |
|---|---|---|---|
| `Ctrl+S` | ⚠️ ページ保存 | - | preventDefault必須 |
| `Ctrl+Shift+S` | ✅ 低リスク | - | ブラウザ標準機能との衝突なし |
| `Ctrl+Z` | ⚠️ 汎用Undo | ⚠️ macOS Undo | preventDefault必須。Analysis Editor中/外で2つのハンドラが排他制御されている |
| `Ctrl+Y` / `Ctrl+Shift+Z` | ⚠️ 一部ブラウザで汎用Redo | - | preventDefault済み |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | ⚠️ 標準コピー/切り取り/貼り付け | - | テキスト入力欄では素通りするガードあり。それ以外では意図的にブラウザから奪う |
| `Ctrl+Shift+V` | ⚠️ 「書式なしペースト」と同キー（Chrome/Edge/Firefox） | - | preventDefault済み。テキスト入力欄では素通り |
| `Ctrl+F` | ⚠️ ブラウザのページ内検索 | - | preventDefault済み。inTextInputガードで検索欄自身では素通り |
| `Ctrl+H` | ⚠️ Firefox: 検索と置換 | - | preventDefault必須 |
| `Ctrl+L` | 🚫 URLバーフォーカス | - | 使用禁止 |
| `Ctrl+W` | 🚫 タブを閉じる | - | 使用禁止 |
| `Ctrl+N` | 🚫 新規ウィンドウ | - | 使用禁止 |
| `Ctrl+T` | 🚫 新規タブ | - | 使用禁止 |
| `Ctrl+R` | 🚫 ページ再読み込み | - | 使用禁止 |
| `Alt+N` | - | ⚠️ macOS: Option+N系の入力（チルダダイアクリティカル等）と配列依存で競合の可能性 | macOS注意（要実機確認・配列依存のためコードからは断定不可） |
| `Space` | ⚠️ スクロール | - | performモード内はpreventDefault済み |
| `Delete` / `Backspace` | ⚠️ 環境によっては「戻る」（Backspace） | - | テキスト入力欄外でのみ発火。実害小 |
| `F5` | 🚫 ページ再読み込み | - | 使用禁止 |
| `Enter` | ⚠️ フォーム送信 | - | モーダル内での使用は慎重に。本アプリでは複数コンテキストで分岐済み |
| `F3` | ⚠️ ブラウザの「ページ内検索の次へ」と同キー | - | アプリが優先的に処理。検索バー開＋ヒットありの時のみ奪う設計 |
| `Shift+F3` | ✅ 低リスク | - | 同上 |
| `L` | ✅ 低リスク | ✅ | テキスト入力中はguard必要 |
| `Escape` | ✅ 低リスク | ✅ | モーダル優先に注意 |
| `Shift+[` / `Shift+]` | ✅ 低リスク | ✅ | e.key基準でJIS/US配列差を吸収 |
| `Shift+D` | ✅ 低リスク | ✅ | Chart Mode表示中のみ |
| `Ctrl/Cmd+クリック` | ✅ 低リスク | ⚠️ macOS/Windowsでmodifier key名称が異なる点に注意（`e.ctrlKey || e.metaKey`で両対応） | - |
| `Ctrl+Shift+Arrow` | ✅ 低リスク | ✅ | 意図的に重い組み合わせを採用（誤操作防止） |

---

## 新規キー追加時のチェックリスト

1. 上記「ブラウザ衝突リスク早見表」で衝突確認
2. Scope / Context を明確に定義する（「常時有効」は最後の手段）
3. テキスト入力中（`input` / `textarea` フォーカス中）に発火しないよう guard を入れる
4. 演奏モード・モーダル表示中との優先度を決める
5. preventDefault が必要か判定する
6. このファイルに追記する（実コード確認済みの行番号を残す）

### guard の基本形

```js
// テキスト入力中はスキップ
const tag = document.activeElement?.tagName;
if (tag === 'INPUT' || tag === 'TEXTAREA') return;
```

### モーダル表示中スキップの基本形

```js
// モーダル表示中はスキップ
if (document.getElementById('modal-ov').classList.contains('open')) return;
```
