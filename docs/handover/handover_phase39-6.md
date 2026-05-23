# 引き継ぎ: Phase39-6完了 — token abstraction 適用漏れ修正

## 作業状態
- ブランチ: phase39-6（remote push済み・main merge待ち）
- 直前作業: Phase39-6完了（tapmode.js / replace.js の isSepToken 統一）

---

## 今回の完了内容

### 変更ファイル
- `js/tapmode.js` — `import { isSepToken }` 追加・sep判定1箇所を `isSepToken()` に変更
- `js/replace.js` — `import { isSepToken }` 追加・sep判定3箇所を `isSepToken()` に変更
- `docs/review-guidelines.md` — 新設（用語説明・レイヤ説明ルール）

---

## Phase39-6 — behavior layer token abstraction migration 完了

### 背景

Phase39-4 で `type:'sep'` → `type:'barline'` への canonical 化を行ったが、
`tapmode.js` / `replace.js` への `isSepToken()` 適用が漏れていた。

grep で発覚：
```
js/replace.js: if (c.type === 'sep') return;
js/replace.js: filter(c => c.type !== 'sep')
js/replace.js: if (c.type === 'sep' || c.chord !== find)
js/tapmode.js: if (c.type === 'sep') {
```

### tapmode.js の変更

```js
// import追加
import { isSepToken } from './tokens.js';

// 179行: TAPオーバーレイのchord列生成・sep判定
if (isSepToken(c)) {   // ← c.type === 'sep' から変更
```

### replace.js の変更

```js
// import追加
import { isSepToken } from './tokens.js';

// rbRefresh: ヒット登録時のsep除外
if (isSepToken(c)) return;   // ← c.type === 'sep' から変更

// rbScrollToCurrent: visible index計算（sep除外後の表示位置算出）
.filter(c => !isSepToken(c))   // ← c.type !== 'sep' から変更

// 全置換ループ: sep除外
if (isSepToken(c) || c.chord !== find) continue;   // ← c.type === 'sep' から変更
```

### behavior layer migration 完了状態

| 層 | 状態 |
|---|---|
| render layer（editor.js / perform.js） | ✅ Phase39-3 |
| semantic layer（app.js / chordEntry.js） | ✅ Phase39-4 |
| behavior layer（tapmode.js / replace.js） | ✅ Phase39-6 |

---

## 動作確認済み
- TAPオーバーレイで `/` 正常表示 ✅
- 全置換で barline がスキップされる ✅
- replace ヒット数・位置計算 ログ上正常 ✅
- console error なし ✅
- フォーカスずれ: 一時的に発生したが再現不可（原因未確定）

---

## 新設: docs/review-guidelines.md

レビュー・設計コミュニケーション時の用語説明ルールを文書化。
- 用語説明ルール（初出時に補足を付記）
- 用語分類（一般CS / 音楽ドメイン / プロジェクト固有 / ローカル関数名）
- レイヤ説明ルール（render / behavior / semantic / orchestration）
- 設計議論ルール（図解・ownership明示）

---

## 未解決 Issue（GitHub登録済み）

| Issue | 内容 |
|---|---|
| transpose/undo state contamination | 置換→AddChord挿入→Undo でカポ・token状態がズレる。transient state が actual mutation に漏れている疑い |
| N.C. / no chord token 設計 | isChordLikeInput（コード名として妥当か判定する関数）に弾かれて挿入不可。`{ type:'no_chord' }` token化が推奨 |
| replace フォーカスずれ | Em7→E全置換後にEm検索した際に一時発生。再現不可・原因未確定 |

---

## git状態

```
# コミット済み
Phase39-6: token abstraction 適用漏れ修正（tapmode.js / replace.js）
docs: update devlog for Phase39-6
chore: add chord and project resource data

# remote push済み
git push --set-upstream origin phase39-6 → 完了

# main merge手順（未実施）
git checkout main
git pull
git merge phase39-6
git push
git branch -d phase39-6
git push origin --delete phase39-6
```

---

## 次フェーズ: Phase40 — Issue #26 設計フェーズ

### 背景・目的

Issue #26「ChordMini Beat/Grid情報対応」の設計フェーズ。

**現在の構造（line-centric flat token list）：**
```js
project.lines = [
  {
    lyric: '太陽に向かって咲く',
    time: 19.2,
    chords: [
      { chord: 'G' },
      { type: 'barline' },   // canonical（Phase39-4以降）
      { chord: 'Dmaj/3' },
      { type: 'barline' },
    ]
  }
]
```

**将来の方向（bars[]構造）：**
```js
line.bars = [
  { beats: 4, chords: [{ chord: 'G' }] },
  { beats: 4, chords: [{ chord: 'Dmaj/3' }] },
]
```

### Phase40でやること（設計のみ・実装は後）

1. Issue #26 で実現したい「表示・操作」の要件定義
   - 小節ごとの整列表示か
   - 拍数情報の取り込みか
   - ChordMini JSONのbeat情報活用か
2. bars[] 移行の architecture draft
   - data shape 定義
   - migration boundary
   - backward compatibility policy
   - forbidden direct access ルール
3. 現在の `isSepToken()` access layer との接続設計

### 重要な設計制約

- `render順序 = data順序` 前提を壊すと replace/tap/render/undo が全崩壊
- 今すぐ全面実装しない（「bars[]を導入可能な境界を定義する」フェーズ）
- keyboard-first chord entry は Issue #26 設計後に着手する方が安全

### 確認が必要なこと（次セッション開始時）

Issue #26 の具体的なユースケース：

```
A案: 小節ごとに整列表示
│ G  │ Dmaj/3 │ Em7  │ A  │

B案: 拍数を意識した表示
│ G(2拍) │ Dmaj/3(2拍) │

C案: ChordMiniのJSONにあるbeat情報を取り込んで自動配置

D案: 上記の組み合わせ
```

どれを目指すかによって migration の深さが変わるため、
**次セッション開始時に要件を確認してから設計に入ること。**

