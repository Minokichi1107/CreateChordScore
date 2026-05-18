# キーバインド管理台帳

> 最終更新: Phase34-1b実装前（diagLocked UIなし時点）
>
> このファイルの目的:
> - 実装済みキーの一覧管理
> - OS/ブラウザ衝突の記録
> - 新規キー追加時の衝突チェック用リファレンス

---

## 凡例

| 項目 | 意味 |
|---|---|
| Scope | `global` = 常時有効 / `perform` = 演奏モード中のみ / `modal` = モーダル表示中 |
| Context | そのスコープ内でさらに有効条件がある場合に記載 |
| preventDefault | ブラウザデフォルト動作をキャンセルするか |
| Conflict | OS・ブラウザとの衝突リスク |
| Source | 実装箇所（ファイル・関数名） |

---

## 実装済みキーバインド

### Global（常時有効）

| Key | Action | preventDefault | Conflict | Source |
|---|---|---|---|---|
| `Ctrl+S` | プロジェクト上書き保存 | ✅ 必要 | ⚠️ ブラウザの「ページ保存」と衝突。preventDefault済み | app.js `setupEventHandlers` |
| `Alt+N` | 新規プロジェクト作成 | ✅ 必要 | ⚠️ macOS では Alt+N が `~` 入力と衝突する可能性あり。Windows/Linux は概ね安全 | app.js `setupEventHandlers` |
| `Ctrl+Z` | コード自動登録のUNDO | ✅ 必要 | ⚠️ ブラウザ・OSの汎用Undoと衝突。importUndoStackが空の場合はブラウザに渡さず無視 | app.js `setupEventHandlers` |
| `Ctrl+H` | 置換バー開閉 | ✅ 必要 | ⚠️ ブラウザの「検索と置換」と衝突（Firefoxなど）。preventDefault済み | app.js `setupEventHandlers` |

### Perform Mode（演奏モード中のみ）

| Key | Context | Action | preventDefault | Conflict | Source |
|---|---|---|---|---|---|
| `Space` | 演奏モード全般 | 再生 / 一時停止 | ✅ 必要 | ⚠️ ブラウザのスクロールと衝突。preventDefault済み | app.js `setupEventHandlers` |
| `ArrowLeft` | 静止モード（static）のみ | 前ページへ | ✅ 必要 | ✅ 演奏モード内限定のため低リスク | app.js `setupEventHandlers` |
| `ArrowRight` | 静止モード（static）のみ | 次ページへ | ✅ 必要 | ✅ 演奏モード内限定のため低リスク | app.js `setupEventHandlers` |

---

## 予定キーバインド（未実装）

### Phase34-1b 予定

| Key | Scope | Context | Action | preventDefault | Conflict | 備考 |
|---|---|---|---|---|---|---|
| `L` | global | 演奏モード外、モーダル非表示時 | diagLocked トグル（右パネル固定/解除） | 不要 | ✅ 低リスク。テキスト入力フォーカス中は無効にすること | input/textarea フォーカス中はスキップするguard必要 |
| `Escape` | global | diagLocked=true の時 | diagLocked 解除 | 不要 | ⚠️ モーダル閉じる動作と競合する可能性。モーダル表示中はモーダル側を優先すること | 優先度: modal close > diag unlock |

---

## ブラウザ衝突リスク早見表

新規キーを追加する前にここで確認する。

| Key | ブラウザ衝突 | OS衝突 | 備考 |
|---|---|---|---|
| `Ctrl+S` | ⚠️ ページ保存 | - | preventDefault必須 |
| `Ctrl+Z` | ⚠️ 汎用Undo | ⚠️ macOS Undo | preventDefault必須 |
| `Ctrl+H` | ⚠️ Firefox: 検索と置換 | - | preventDefault必須 |
| `Ctrl+L` | 🚫 URLバーフォーカス | - | 使用禁止 |
| `Ctrl+W` | 🚫 タブを閉じる | - | 使用禁止 |
| `Ctrl+N` | 🚫 新規ウィンドウ | - | 使用禁止 |
| `Ctrl+T` | 🚫 新規タブ | - | 使用禁止 |
| `Ctrl+R` | 🚫 ページ再読み込み | - | 使用禁止 |
| `Alt+N` | - | ⚠️ macOS: `~`入力と衝突 | macOS注意 |
| `Space` | ⚠️ スクロール | - | performモード内はpreventDefault済み |
| `Backspace` | ⚠️ 環境によっては「戻る」 | - | フォーム外での使用時は注意 |
| `F5` | 🚫 ページ再読み込み | - | 使用禁止 |
| `Enter` | ⚠️ フォーム送信 | - | モーダル内での使用は慎重に |
| `L` | ✅ 低リスク | ✅ | テキスト入力中はguard必要 |
| `Escape` | ✅ 低リスク | ✅ | モーダル優先に注意 |

---

## 新規キー追加時のチェックリスト

1. 上記「ブラウザ衝突リスク早見表」で衝突確認
2. Scope / Context を明確に定義する（「常時有効」は最後の手段）
3. テキスト入力中（`input` / `textarea` フォーカス中）に発火しないよう guard を入れる
4. 演奏モード・モーダル表示中との優先度を決める
5. preventDefault が必要か判定する
6. このファイルに追記する

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
