# 引き継ぎ: Phase86完了 — CSS責務分離（Sprint A）+ トークン正規化

## 作業状態
- ブランチ: phase86-refactor-audit
- 直前作業: Phase85完了（UI視認性・記号衝突修正）

## Key Commits
- `a8435da` — phase86: normalize theme RGB tokens and remove dead CSS variables
- `ad60d4d` — phase86: split module-owned CSS from components.css

---

## 1. Purpose（目的）

app.js / CSSのリファクタリング着手可否を判断するところから始まり、以下2段階の作業を行った。

```
① CSS棚卸し（実装ではなく事実確認）
   components.css の各セレクタが、どのJSモジュールが生成するDOMに
   対応するのかを実ファイル横断で確認する

② Sprint A（CSS責務分離）
   棚卸し結果に基づき、components.css を「モジュール所有権」単位で
   6ファイルへ分割する
```

app.js側のリファクタリング（Sprint B: analysisSession.js抽出）は次フェーズ以降とし、今回はCSS側のみ実施した。

---

## 2. Scope（今回やったこと）

```
① CSS棚卸し
   ・components.css 全131セレクタを prefix 別に分類
   ・app.js / chartmode.js / chordEntry.js / modals.js / tapmode.js /
     perform.js / index.html を横断的にgrep/viewし、各セレクタの
     実所有モジュールを確認（推定に頼らず実参照ベースで確定）

② トークン正規化（Sprint A着手前の地ならし）
   ・theme.css: --color-blue-rgb をsilver/blueに追加
   ・theme.css: 未使用トークン3件削除（--shadow-knob-border-*、
     --text-logo-span-color）
   ・layout.css: マジックナンバー2件をtoken参照に置換

③ Sprint A（CSS責務分離）
   ・components.css からモジュール所有ブロックを6つの専用ファイルへ抽出し、
     共有コンポーネント層として components.css を残置した
     （chart.css / analysis-editor.css / library.css / chord-entry.css /
       modal.css / tapmode.css を新規作成）
   ・index.html の <link> 読み込み順を更新
   ・実機確認（TAP modeで404が発生 → ブラウザキャッシュが原因と判明・解消）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・app.js のリファクタリング（Sprint B: analysisSession.js抽出）
  → 次フェーズ以降。今回はCSS側のみに限定した。

・.perform-options のスタイル統合（3ファイルに分散している問題）
  → 棚卸しで発見したが、実害がないため今回は見送り。
    current-issues.mdへ将来課題として記録する。

・.library-sort-select（未使用class属性）の削除
  → HTML側の軽微な冗長性であり、実害なし。今回は見送り。

・.scope-selector（replace.js所有と推定）の移動
  → replace.js自体が未アップロードのため実参照未確認。
    確定情報が揃うまで保留。

・Chart Mode内部の再分割
  → 当初から対象外（timingModel/playback loop/projection rendererが
    強く結合しており、リスクが高いため）。
```

---

## 4. Implementation（実装内容・事実）

### 4-1. トークン正規化

| 変更 | 内容 | ファイル |
|---|---|---|
| `--color-blue-rgb` 追加 | silver/blueで未定義だったため追加（darkと同値・見た目変更なし）。`--surface-playing`等が参照していたが、これまで暗黙的にdarkの値へフォールバックしていた | theme.css |
| 未使用トークン削除 | `--shadow-knob-border-top/bottom/side`（`--knob-border-*`への置き換え後の消し忘れ）、`--text-logo-span-color`（`--text-logo-span`と重複・参照ゼロ） | theme.css |
| マジックナンバー置換 | `.line-row.active-line`・`.line-row.tap-flash`の直書きrgba値が、既存token（`--color-blue-rgb`/`--color-green-rgb`）の値と完全一致していたためtoken参照に統一 | layout.css |

### 4-2. Sprint A（CSS責務分離）

| 新設ファイル | 所有モジュール | 移動セレクタ数 |
|---|---|---|
| chart.css | chartmode.js | 83ブロック |
| analysis-editor.css | app.js（Footer UI） | 41ブロック |
| tapmode.css | tapmode.js | 38ブロック |
| library.css | app.js（Library UI） | 20ブロック |
| chord-entry.css | chordEntry.js | 14ブロック |
| modal.css | modals.js | 13ブロック |
| components.css（残置分） | 複数モジュール共有／未確定 | 35ブロック |

index.html の `<link>` 読み込み順を以下に更新：
```
base → theme → layout → components → modal → chord-entry →
library → analysis-editor → tapmode → chart → state → perform
```

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] CSSの分割単位は「見た目の種類」ではなく「DOMを生成するモジュールの所有権」で決める

```
結論:
  当初のChatGPT案（editor.css / chart.css / modal.css / diagram.css の
  4分割・機能軸）を、実データ確認後に「モジュール所有権軸」の6分割へ
  修正した。

理由:
  棚卸しの結果、components.css の131セレクタ全てが既に何らかの
  モジュール固有namespace（chart-* / aep-* / library-* 等）を持っており、
  JSモジュール境界とCSS責務がほぼ一致していることが判明した。
  「UI機能」で切ると aep-*（Analysis Editor Footer）と library-*
  （Library UI）が同じ editor.css に混在し、将来また責務が混ざる
  リスクがあった。

  この原則は今後 replace.css や diag-lock.css を切り出す際の
  基準としても使う。
```

### [判断] `.speed-cluster` / `.speed-reset-btn` は components.css に残置する

```
結論:
  「予測で追加したため要確認」という自己申告コメントが components.css
  に残っていたが、index.html実機確認の結果、通常モード・TAPモード・
  演奏モードの3箇所で実際に使われている生きたクラスだと判明した。

理由:
  複数モジュール（app.js/tapmode.js/perform.js）から共有される
  汎用コンポーネントは、単一モジュール所有のファイルへ移すと
  かえって責務が曖昧になる。「移動しない条件＝複数モジュールから
  生成される」という基準に従い、components.cssへ残した。
```

### [判断] `#right-tabs` / `.right-tab` / `#panel-diagram` / `.phdr`系は analysis-editor.css / library.css のどちらにも入れない

```
結論:
  #panel-library と #panel-diagram が同じタブ切替ロジックの中で
  対になってapp.jsから参照されていることを確認したため、
  タブ切替シェル（#right-tabs・.right-tab）とダイアグラムパネル本体
  （.phdr系）は components.css に残置した。

理由:
  .phdr は「ダイアグラムパネルの見出し」であり、Analysis Editor
  Footer（aep-*）とは無関係と index.html 構造確認で確定した。
  aep-* と字面が近いため混同しやすいが、Phase36（diagLock API）由来の
  独立した機能であり、Phase74以降のAnalysis Editorより前から存在する。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### `--color-blue` は実在しない変数だった（誤検出の自己訂正）

```
当初「未使用トークン」として --color-blue（rgbなし）を削除対象に
挙げていたが、実装直前の再確認で、これがtheme.css内の日本語コメント
文（「--color-blueは既にPlayback Active...」）を、変数定義と
誤って正規表現でマッチさせていたことが判明した。

--color-blue という変数は最初から定義されておらず、
--color-blue-rgb（RGB版）のみが実在していた。削除リストから
正しく除外し、この誤検出について実装前にユーザーへ報告・訂正した。

教訓: grep結果を鵜呑みにせず、削除・変更の実行直前に必ず
再確認する（当プロジェクトの既存ルールと一致する動作ができた）。
```

### コメント内の変数言及と実際の変数定義を区別する必要性

```
上記の誤検出は、「行頭が -- で始まり : を含む」という緩い正規表現が
コメント文中の変数名言及も拾ってしまったことが原因。
行頭定義のみに絞る正規表現（^\s*--name\s*:）に修正することで解消した。
今後CSS変数の棚卸しを行う際は、この誤検出パターンに注意する。
```

### `--color-blue-rgb` の欠落は `--color-green-rgb`（既知）と同型のバグだった

```
current-issues.mdには「silverの--color-green-rgb欠落」のみ記載されて
いたが、実際に3テーマ間で変数定義の差分を取ったところ、
--color-blue-rgb がsilver・blue両方で欠落していることが新たに判明した
（--color-green-rgbはsilverのみの欠落だったのに対し、より範囲が広い）。

--surface-playing（Playback Active強調色）が影響を受けており、
silver/blueテーマで再生中ハイライトが暗黙的にdarkの色にフォールバック
していた。Phase78のamber-rgb修正時と同じ「primitive色+rgb版の
片方だけ追加し忘れる」パターンが、今回で3件目の実例となった。
```

### CSS一括抽出スクリプトの1回目実装に、複数行コメントの解析バグがあった

```
components.cssを機械的に7分割するPythonスクリプトの初版は、
「各行が独立してコメント行かどうか」を行ごとに判定する簡易ロジックを
採用していた。これは、コメント本文の途中に空行や「*」で始まらない
継続行（例: 日本語の説明文が複数行に渡る場合）があると、
そのコメントを本来のルールから切り離し、意味のない断片として
STAY側（components.css残置）に取り残してしまうバグを生んだ。

実害の具体例: `.chart-slot--edit-point::before`（@media
(prefers-reduced-motion: reduce) 内）が、@mediaラッパー自体の
セレクタ文字列に "chart-" が含まれないため分類ロジックを素通りし、
components.cssに取り残されるところだった。

対処: /* と */ の開閉状態を厳密に1文字ずつ追跡するパーサーへ
書き直した上で、「全ブロックを元の順序で結合すると元ファイルと
バイト単位で完全一致する」ことを実際に検証してから本番の分割を
実行した。この「分解→再結合→原本と完全一致確認」という手順を、
今後同種の機械的ファイル分割を行う際の標準手順とする。
```

### TAP mode 404はブラウザキャッシュが原因で、Sprint Aの分割自体に問題はなかった

```
実機確認でTAPボタンを押しても反応がなく、コンソールに
「css/tapmode.css 404」が出ていた。

切り分けの結果:
  ① PowerShellで css/tapmode.css の実在を確認 → 存在した
  ② ブラウザで直接URLアクセス → 200 OKで表示された
  ③ 強制リロード（Ctrl+Shift+R）→ TAP mode復活

つまりファイル自体・配置場所・index.htmlの記述はいずれも正しく、
分割作業の途中（index.htmlに<link>を追加した直後、まだ
tapmode.cssが所定の場所になかった一瞬）にブラウザが404を
キャッシュし、その後ファイルが正しい場所に揃った後も
古いキャッシュ結果を保持し続けていたことが原因だった。

教訓（CSS分割時のデバッグ手順として確立）:
  ①ファイル実在確認（Get-Item）→②URL直接到達確認（ブラウザ直開き）
  →③DOM存在確認→④JS動作確認→⑤最後にキャッシュを疑う（強制リロード）
  という順序を踏むことで、「モジュール境界の分割自体が壊れた」という
  誤診を避けられた。
```

---

## 7. Remaining Issues（残課題）

```
・.perform-options のスタイルが components.css / layout.css / perform.css
  の3ファイルに分散している
  状態: 発見済み・未対応（実害なし）
  内容: 単一コンポーネントの見た目が3ファイルにバラけている。
  次にperform.cssまわりを触る機会に統合を検討する。

・.library-sort-select（HTML上のclass属性）がCSSルールを一切持たない
  状態: 発見済み・未対応（実害なし）
  内容: 実際のスタイルは `.library-toolbar select`（子孫セレクタ）
  から効いており、このclass属性自体はHTML上の死んだ記述。

・.scope-selector の所有モジュール未確定
  状態: 保留
  内容: コード内コメントでreplace.js所有と推定されるが、
  replace.js自体が未アップロードのため実参照は未確認。

・components.cssに残る35ブロックの精査
  状態: 未着手（優先度低）
  内容: 今回は「複数モジュール共有」「所有権不明」の理由で
  意図的に残置したが、汎用コンポーネントとして適切かの
  再監査は将来のCSS再構成フェーズで行う。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Sprint B候補（app.js リファクタリング）:
  ・analysisSession.js への Editor Session 抽出
    （analysisEditor.buffer / selection / search / history等）
  ・analysisCommands.js への Editing Commands 抽出
    （splitChord / deleteChord / moveBoundary 等）
  ・_activateSearchMatch() は aEl.currentTime を直接操作するため
    完全pureにできない。コールバック注入 or app.js残置の方針を
    Sprint B着手時に決定する

CSS関連の将来候補:
  ・.perform-options の3ファイル分散の統合
  ・.scope-selector の所有確定（replace.js取得後）
  ・components.cssに残る35ブロックの再監査
```

---

## 9. Files Changed（変更ファイル一覧）

```
theme.css
  ・--color-blue-rgb をsilver/blueに追加
  ・未使用トークン3件削除
  ・理由: テーマ間のトークンパリティ修正・死んだコードの除去

layout.css
  ・.line-row.active-line / .line-row.tap-flash のマジックナンバーを
    token参照に置換
  ・理由: 既存トークンとの重複解消

components.css
  ・131セレクタ中96セレクタ（chart-* / aep-* / library-* / mac-* /
    insert-cursor* / modal-* / copy-list* / diagram-string* /
    repeat-stepper-label / tov-* / tap-ov-*）を6ファイルへ分離
  ・理由: モジュール所有権に基づく責務分離（Sprint A）

chart.css / analysis-editor.css / library.css / chord-entry.css /
modal.css / tapmode.css（すべて新設）
  ・components.cssから該当セレクタを機械的に移動
  ・理由: 上記と同じ

index.html
  ・<link>読み込み順を更新（components.css以下、モジュール所有7ファイル
    [components/modal/chord-entry/library/analysis-editor/tapmode/chart]
    の並び順を含む全体を再整理）
  ・理由: Decorator系（chart.css）の詳細度を最後に置くため
```

---

## 10. Micro Log

- CSS棚卸しはcomponents.cssのみアップロードされた状態から開始し、
  app.js内での参照回数（0件/複数件）を基準に暫定的な所有モジュールを
  推定した。その後app.js/chartmode.js/chordEntry.js/modals.js/
  tapmode.js/perform.js/index.htmlを順次追加取得し、推定を実参照ベースの
  確定情報へ置き換えていった
- `.tov-*` はproject_instructions.mdの例文（.perform-line と並記）から
  当初perform.js所有と推定していたが、tapmode.js内で25箇所参照されて
  いることを確認し、tapmode.js所有へ訂正した
- CSS変数の未使用チェックは、CRLF改行の影響で初回スクリプトが
  誤動作（echo -eの非互換動作）したため、printfベースに修正して再実行した
- Sprint A本番の分割スクリプトは、まず単純な行ベースパーサーで試作し、
  「分解→再結合→原本と完全一致」を検証する過程で複数行コメントの
  解析バグを発見・修正した。本番実行前に必ずこの完全一致検証を通す
  運用とした
- 実装後、括弧対応チェック・@keyframes/@media移動漏れチェック・
  ファイル間セレクタ重複チェック・内容欠落チェックの4点を機械的に実施
- 実機確認でTAP mode 404が発生したが、ユーザー側での切り分け
  （PowerShellでのファイル実在確認→ブラウザ直接アクセス→強制リロード）
  により、ブラウザキャッシュが原因でありSprint A自体は健全と確認された

---

## current-issues.md更新（該当issueがある場合）
- 今回closeしたissue: なし
- 今回新規に積み残したissue:
  - `.perform-options`のスタイルが3ファイルに分散（実害なし・将来のperform.css整理時に統合検討）
  - `.library-sort-select`が未使用class属性（実害なし・低優先度）
  - `.scope-selector`の所有モジュール未確定（replace.js取得後に確定）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
