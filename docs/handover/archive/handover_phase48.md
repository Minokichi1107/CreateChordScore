# 引き継ぎ: Phase48完了 — フロートメニュー位置改善

## 作業状態
- ブランチ: main
- 直前作業: Phase48完了（float-menu-position-fix）

---

## Phase48 の成果

### 完了したもの

| 変更 | 内容 | ファイル |
|---|---|---|
| `.line-acts` 配置変更 | `position:absolute` 右端かぶり → `grid-column:1/-1` で行下展開に変更 | css/layout.css |
| `z-index:10` 削除 | かぶり前提の値が不要になったため削除 | css/layout.css |
| `:focus-within` 対応 | キーボード操作中もボタン群が展開されるように | css/layout.css |

### 変更前後

```
変更前: position:absolute で右端にかぶる
変更後: grid-column:1/-1 で全列スパン・行の下にアニメーション展開
```

### 変更箇所（layout.css 232〜233行目）

```css
/* 変更後 */
.line-acts{display:flex;flex-wrap:wrap;gap:3px;padding:0 4px;max-height:0;overflow:hidden;opacity:0;transition:max-height .15s ease,opacity .15s ease,padding .15s ease;grid-column:1 / -1}
.line-row:hover .line-acts,.line-row:focus-within .line-acts{max-height:36px;opacity:1;padding:3px 4px}
```

### ハマりポイント
- `.line-row` が `display:grid`（3列）だったため、
  フロー内に置くだけでは3列目に押し込まれてかぶった
- `grid-column:1 / -1` で全列スパンにすることで解決

---

## 保留バグ（変わらず）

### capo change 無効化（intermittent）
ブランチ: `bugfix/capo-after-ended`（保留・削除しない）
状態: 再現待ち
否定済み: state破壊 / _prevCapo不整合 / diff異常 / lines消失 / change未発火 / render chain完全停止
最有力仮説: timing/race系

---

## 次フェーズ候補: Phase49

### A. Chart Mode mini transport 追加（中規模）
Chart Mode内に ▶ / シークバー / 速度 / 音量 の mini transport を追加。
現在はメイン画面で再生してから Chart Mode を開く必要がある。

### B. 表示メニューの有効化（小〜中規模）
「左パネル表示」「右パネル表示」を有効化。
既存の `leftCollapsedManual` APIと接続する。

### C. プロジェクトライブラリUI（大規模・設計フェーズ）
保存済みプロジェクトをブラウザ内DBで管理・一覧表示。
ファイルメニューの「ライブラリ」を有効化する。
LAN配信モードへの布石になる。

### D. 5フェーズ棚卸し（Phase45〜49）
phase-status.md / architecture.md / current-issues.md の一括更新。
Phase45〜48の内容を反映する。

---

## 運用ルール（変わらず）

- 実装前に仕様確認 → 提案 → 明示的な実装指示
- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- CSS修正時は変更ブロック全体を提示してから適用
- git add はパスに注意（css/ js/ プレフィックス必要）
- バグ修正は bugfix ブランチを切って作業
