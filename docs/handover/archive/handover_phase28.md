# 引き継ぎ: Phase28 — 左パネル折りたたみ UIバグ修正

## 作業状態
- ブランチ: phase28（phase27からブランチ）
- 直前作業: Phase27完了・mainにmerge済み
  - storage canonical invariant 修復（load/migrate/import 3経路）
  - chords.js / app.js 変更済み

## 作業ファイル
- `css/` 以下（左パネル・ヘッダー・グリッド関連CSS）
- `app.js`（折りたたみトグルロジック）
- `index.html`（レイアウト構造確認用）

---

## バグ内容

**左パネル折りたたみ時にヘッダーボタンが見切れる**（Phase25関連）

現象：
- 左パネルを折りたたんだ状態で、ヘッダー部分のボタン類が画面外にはみ出る／クリップされる
- 中央パネルの幅が期待通りに広がらない可能性あり
- grid/flex の幅計算が `left-collapsed` クラス付与時に正しく追従していない

---

## 現状の折りたたみ実装（app.js）

```js
// DOMContentLoaded 内
const btnCollapse = document.getElementById('btn-left-collapse');
if (btnCollapse) {
  if (localStorage.getItem('leftCollapsed') === '1') {
    document.body.classList.add('left-collapsed');
  }
  btnCollapse.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('left-collapsed');
    localStorage.setItem('leftCollapsed', collapsed ? '1' : '0');
  });
}
```

- `body.left-collapsed` クラスのon/offで状態管理
- CSS側で `.left-collapsed` に対応するレイアウト変化を定義しているはず

---

## 調査の起点

CSSアップロードがないため、次Chatでは以下を確認：

1. **`index.html`** — レイアウトのDOM構造（grid/flexの親子関係）
2. **該当CSS** — `.left-collapsed` 時のgrid-template-columns / width定義
3. **ヘッダー部分のCSS** — overflow, position, z-index, clip の有無

確認すべき仮説：
- `.left-collapsed` 時にヘッダーの `overflow: hidden` か `clip` が効いてボタンが消える
- grid列幅の再計算が走らず、ヘッダーが旧幅のままになっている
- ヘッダーが `position: fixed` または `sticky` で左パネル幅を参照している

---

## 開発方針（厳守）

- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止
- 改善提案は後出し小出し禁止。設計段階でまとめて提示

---

## Phase28以降のバックログ（優先順）

1. **Phase28**（次）: 左パネル折りたたみ UIバグ修正 ← 今ここ
2. **Phase14**: base.css 分離（body・scrollbarをtheme.cssから分離）
3. **Issue #29**: プロジェクトロード時のaudio/chord_source自動復元未対応
4. **Phase13**: 右パネルにプロジェクトDBライブラリタブ追加
5. **Phase12**: 演奏モードヘッダーにカポ番号表示

---

## 参考：Issue #29 メモ（Phase28では触らない）

- プロジェクトロード時にaudio/chord_source JSONが自動復元されない
- 手動再読み込みが必要、ダイアグラム欠落も確認済み
- file handle / reconnect / runtime resource lifecycle まで関わるため Phase14後に対応
- [Issue #29](https://github.com/Minokichi1107/CreateChordScore/issues/29)
