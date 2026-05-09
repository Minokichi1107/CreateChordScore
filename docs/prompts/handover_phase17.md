# ChordScore Phase17 引き継ぎプロンプト

---

## プロジェクト概要

**ChordScore** — ギター弾き語り用コード譜作成・演奏WebツールVanilla JS、フレームワークなし。GitHub Pages運用。

---

## 現在のブランチ・ファイル構成

```
## 完了ブランチ
phase16（mainへ統合済み）

## 現在の作業ブランチ
phase17-（未定）

index.html
css/
  theme.css
  layout.css
  components.css
  perform.css
  state.css
js/
  app.js / editor.js / chords.js / audio.js
  perform.js / replace.js / tapmode.js
```

---

## Phase16で完了した作業

### 設計方針（Phase16で確定）

**JS Component層のCSS ownership ルール**

| 種類 | 所有 |
|---|---|
| layout / spacing / typography / semantic color / component visual | CSS |
| state-derived geometry / runtime position / 計算値 | JS |

**抽象化判断基準（Phase15から継続）**

- 3箇所以上で再利用
- semantic説明可能
- 「共通化可能」ではなく「共通化圧力が存在する」を基準にする

**container ownership原則**

- typography・color → role class所有
- spacing → container所有（原則）
- ただしfield-label等の局所contextではrole spacing許容

---

### C4：modal role classes導入

```css
.modal-caption        /* font-size:12px / text-secondary / font-mono */
.modal-section-label  /* font-size:11px / text-muted / font-mono */
.modal-field-label    /* font-size:10px / text-muted / font-mono / margin-bottom:4px */
.modal-section        /* margin-bottom:8px（default vertical separation） */
.modal-input-row      /* display:flex / align-items:center（gap保留） */
```

### C5：repeat-stepper component化

```css
.repeat-stepper        /* flex / center / gap:16px */
.repeat-stepper-btn    /* font-size:22px / padding:4px 14px / line-height:1 */
.repeat-stepper-value  /* font-mono / 40px / amber / min-width:64px */
.repeat-stepper-label  /* font-size:11px / text-muted / font-mono（stepper文脈専用） */
.repeat-quickpick      /* flex / gap:5px / center / flex-wrap */
```

### C6：copy-list component化

```css
.copy-list             /* max-height:180px / overflow-y:auto / flex-col / gap:3px */
.copy-list-item        /* flex / gap:8px / surface-overlay / border-radius / cursor */
.copy-list-item-lyric  /* font-size:13px / flex:1 / truncate */
.copy-list-item-chords /* font-size:10px / chord-text / font-mono */
```

### C7：diagram-string-grid component化

```css
.diagram-string-grid        /* grid / repeat(6,1fr) / gap:6px */
.diagram-string-field       /* text-align:center */
.diagram-string-field input /* surface-overlay / border / font-mono / 16px */
```

### C8：openAddChord component化

```css
.mac-preview-tag      /* chord-bg / chord-border / inline-flex / 12px / cursor:default */
.mac-preview-tag-del  /* font-size:13px / text-muted / cursor:pointer */
.mac-sep-token        /* text-muted / font-mono / 16px / cursor:pointer */
.mac-palette-list     /* flex-wrap / gap:4px / max-height:110px / overflow-y:auto */
```

mBody.innerHTML側：`.modal-section` / `.modal-field-label` / `.modal-input-row` 適用済み。

---

## 現在のinline style残存状況

### 静的HTML側

```
① JS state（残して良い）
   display:none / display:flex（JS制御）

② 意図的残存
   .capo-row margin-top:5px / 3px（2件・値に意味差なし）
   .pbody padding-bottom:5px（1件）
   spacer div flex:1（1件）
```

### JS動的UI側（意図的保留）

| 対象 | 保留理由 |
|---|---|
| modal-input-row gap（6px/8px/14px） | compact/wide variant観測不足 |
| ボタン font-size系（13px等） | modal action hierarchy未定義 |
| modal-surface-area（mac-preview / copy元） | semantic role未確定 |
| reload-banner | 単発・局所 |
| mac-preview-tag-del hover red | runtime interaction state・JS残留 |
| repeat-badge inline style | editor.js内・JS生成 |

「保留」はすべて理由付き。取りこぼしではない。

---

## 今後のTODO

| フェーズ | 内容 |
|---|---|
| Phase12終盤 | 演奏モードヘッダーへのカポ番号表示 |
| Phase13以降 | 右パネル下部にプロジェクトDBライブラリタブ追加 |
| Phase17前半 | openAddDiagramModal注意書き文言修正（「ブラウザを閉じるまで」→実態に合わせる） |
| Phase17以降 | 手動登録ダイアグラムのエクスポート・インポート機能 |
| Phase17以降 | `base.css` 導入（`body`/`scrollbar`を`theme.css`から分離） |
| 観測継続 | modal-input-row gap variant（compact/wide）の確定 |
| 観測継続 | modal action button hierarchy（font-size系） |

---

## theme.css の設計原則（重要）

```
Primitive層  → 値の部品（数値・色）。直書きOK・必須
Semantic層   → 意味を持つ値。テーマで上書き。直書きOK・必須
Component層  → var()だけ使う。直書き禁止
```

### 層責務の確定（設計ルール）

| 層 | 責務 | 直書きOK? |
|---|---|---|
| Primitive | 値のみ（px・色） | ✅ |
| Semantic | 意味の定義・テーマ差分 | ✅（値のみ） |
| Component | var()のみで見た目構築 | ❌ |
| Theme override | Semantic差し替えのみ | ❌ |
| Mode override | Semantic差し替えのみ | ❌ |
| Instance | JS一時状態のみ（display/transform等） | ✅ |

### 編集ガイド（theme.css内にも記載済み）

| タグ | 意味 |
|---|---|
| `[SAFE]` | 値を自由に変えてよい |
| `[STRUCTURE]` | var()構造を維持。プロパティ削除禁止 |
| `[DANGER]` | 依存関係あり。DevTools確認必須 |

### token追加条件（厳守）

以下をすべて満たした時のみtoken化：
- 3箇所以上で再利用
- theme差分が存在、またはsemantic説明が可能
- 「共通化圧力が存在する」（共通化可能、ではない）

---

## 開発方針（厳守）

- リファクタリングと機能追加の混在禁止
- 1フィーチャー1コミット
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止
- 改善提案は後出し小出し禁止。設計段階でまとめて提示

---

## 開発環境

Windows / Python 3.11 / VSCode / GitHub Pages（`github.com/Minokichi1107/CreateChordScore`）

---

このプロンプトを新しいチャットの最初に貼り付けてください。最新の `theme.css` も一緒に添付すると作業をすぐ再開できます。
