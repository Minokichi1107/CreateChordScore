# 引き継ぎ: Phase35完了 — Theme Layer Cleanup

## 作業状態
- ブランチ: main
- 直前作業: Phase35完了（theme token階層設計・CSS ownership整理）

---

## 今回の完了内容

### 変更ファイル
- `theme.css` — Primitive RGB値・Semantic token・TAP alias token 追加、`#2b54af` 直指定解消
- `components.css` — テーマ依存直指定を role確認の上 token参照へ整理
- `ui-rules.md` — token階層ルール §5〜§7 追記

### token設計（確定）

#### Primitive層（`:root` に追加）
```css
--color-green-rgb: 61,220,132;
--color-amber-rgb: 255,184,64;
--color-blue-rgb:  79,158,255;
```
alpha合成用。直接使用禁止。`rgba(var(--color-amber-rgb), .10)` の形で使う。

#### Semantic層（各テーマブロックに追加）
```css
--surface-selected  /* 選択行背景 */
--surface-hover     /* hover背景 */
--surface-playing   /* 再生中行背景 */
--border-selected   /* 選択行border */
--border-focus      /* focus/hover時border */
```
silverテーマは背景輝度が高いため alpha を強めに設定している（dark .10 → silver .18 等）。

#### Component alias層（TAP subsystem専用）
```css
--tap-surface-tapped    /* TAP済み行背景 */
--tap-surface-current   /* TAPカーソル位置背景（focusと命名しないこと） */
--tap-btn-surface       /* 円形TAPボタン背景 */
--tap-chord-tag-surface /* コードタグ背景 */
--tap-chord-tag-border  /* コードタグborder */
--tap-chord-tag-text    /* コードタグテキスト */
```
`--tap-chord-tag-*` は現状3テーマ同値。差分が生まれた時点で分岐させる。

---

## 設計判断の記録

### hover と raised を分離した理由
`--surface-hover: var(--surface-raised)` にしかけたが回避した。
- hover = interaction state（マウスが乗っている）
- raised = elevation/depth（浮いて見える）
は意味が違う。今は同値でも将来 metallic redesign / mobile UI で分離される可能性がある。

### `--tap-surface-current` と命名した理由
`--tap-surface-focus` にしかけたが回避した。
CSS の `focus` はキーボードフォーカスの予約語的ニュアンスが強い。
将来の accessibility / keyboard navigation 対応で衝突しないよう `current`（TAPカーソル位置）とした。

### Component alias に落とした token
`--tap-chord-tag-*` / `--tap-surface-*` / `--tap-btn-surface` は
「Semantic に見せかけた component token」になりかねないため alias 扱いとした。
TAP subsystem 内で閉じるため、Semantic 層への汚染が発生しない。

### 意図的保留（今フェーズ対象外）
`.mac-insert-btn.active` の `#fff` と `--color-accent` 未定義問題は紐付いているため保留。
雑に直すと architecture を汚す。role確認・semantic整理を経由してから対応する。

---

## 重要な設計ルール（継続）

- token追加時は必ず層（Primitive / Semantic / alias）を先に確認・明示する
- alpha込みtokenは作らない → `rgba(var(--color-amber-rgb), .10)` パターンを使う
- silverテーマは alpha値を強めに設定する（背景輝度差への対応）
- Component alias token は role・追加理由・所属層を明文化してから追加する

---

## regression確認済み（silverテーマ）
- selected行（amber系）✅
- tapped行（green系）✅
- 再生中行（blue系）✅
- hover ✅
- TAPオーバーレイのコードタグ ✅

---

## 今回見つかった別問題（Phase35とは独立）

### TAP閉じるボタン hover feedback欠落
- hover時の視覚変化なし
- `--surface-hover` を適用できる候補
- `current-issues.md` に追記済み

### pause icon alignment
- ⏸️が再生ボタン内で中央からズレる
- Unicode glyph metrics / font rendering差異が原因候補
- 単純なpadding調整は環境差で逆効果になる可能性あり
- 将来的にSVG icon化を検討
- `current-issues.md` に追記済み

---

## 次フェーズ（Phase36）
hover overlay interaction redesign。設計フェーズから着手。
- popup pointer-events
- hover維持条件
- overlay close timing
- position offset
- dblclick = diagLock（Phase34で保留していた問題）
- hover flicker対策
