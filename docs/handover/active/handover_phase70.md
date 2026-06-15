# 引き継ぎ: Phase70作業中

## 作業状態
- ブランチ: (未定)
- 直前作業: Phase69完了（Chart slot active highlight stabilization）

---

## micro-log

### pickup/projection layerの位置づけに関する設計メモ

- 議論の発端: Issue #45 taxonomy調査中、analysis側にpickupが存在するのに
  Chart Modeのgrid表現がそれを無視していたことが発覚（Phase68の背景）
- 確立した認識: Phase68は「pickup対応機能」ではなく、
  「timing modelが表現可能なsemanticをrendererが潰していた」ことの修正
  → canonical timing space ≠ visual projection space の分離として一般化された

### 「綺麗な小節頭」要望の問題分解（3分割）

今後この種の要望が来た際の切り分け軸として記録:

| 問題 | 現状 |
|---|---|
| ① 小節頭にコードを綺麗に並べたい | Phase68でかなり改善済み |
| ② ビートカーソルを曲に合わせたい | Phase56〜64で概ね成立 |
| ③ "音楽的に正しい小節構造"を自動推定したい | まだ難しい（taxonomy Type A〜D） |

- ③は自動化が本質的に困難（pickup / rit. / beat tracking collapse / 半テンポ誤認
  / 局所drift が現実に起きるため。大規模商用解析でも誤認が発生する領域）
- 現実的な落とし所は「人間が軽く補正できる設計」
  → Type A/C「手動修正UI」の方向性は妥当

### lightweight correction UIのコンセプト（将来のmeasure repair design入力）

将来 measure repair / manual correction UI を設計する際の種:
- 「この拍を小節頭にする」
- 「ここから4拍単位で再構築」
- 「pickup長を指定」

→ これらは "correction authority をどこに置くか" の設計問題であり、
  renderer / normalized timing / playback / seek / measure numbering /
  projection の全層に影響するため、Type A/C同様「設計フェーズが必要」。

### 設計順序に関する認識

- 現状は「壊れない timing/projection architectureを先に固めている段階」
  であり、「自動で綺麗にする段階」にはまだ到達していない
- これは基盤未完成ではなく、基盤を先に安定化している段階という位置づけ
- 「pickup support問題」ではなく「musical authority correction問題」と
  再定義できたことが今回の議論の核

### 反映タイミング

correction authority / measure repair model / manual correction UI /
canonical vs projection repair boundary の設計に着手するタイミングで、
current-issues.md（Issue #45 taxonomy）・architecture.md §9.5 へ正式反映する。

---

## 完了したこと

### Phase70-A: `__CS_DEBUG__.perf` projection化 + Chart Mode speed同期修正

| 変更 | 内容 | ファイル |
|---|---|---|
| `_perfState`導入 | `lastRAFDelta` / `maxRAFDelta` / `longFrames` / `longFrameLog`をchartmode.jsが所有 | js/chartmode.js |
| `_resetPerfState()` | `openChartMode()`で呼び、セッション毎にリセット（リセット直後の初回フレームは計測スキップ） | js/chartmode.js |
| `_recordFrame()` | `_rafLoop`から毎フレーム呼び、dt計測・33ms超えをlongFrameとして記録（リングバッファ20件） | js/chartmode.js |
| `getPerfState()` export | shallow clone（longFrameLogも個別コピー）を返すgetter projection | js/chartmode.js |
| `__CS_DEBUG__.perf`をgetter化 | mutable暫定実装から`get perf() { return getPerfState(); }`へ変更。timing/project/chartと原則統一 | js/app.js |
| `dumpInvariants()`簡略化 | `perf`を`getPerfState()`の戻り値で表示。`maxRAFDelta`のログ追加 | js/app.js |
| **Chart Mode speed 150%固定バグ修正** | `mainSpeedSel.value * 100`の単位誤り（percent integerをfloatと誤認）を修正 | js/chartmode.js |
| **Chart→main/TAP speed表示同期修正** | Chart speedスライダーのinputハンドラを`setSpeed(pct)`呼び出しに統一。通常モード・TAPモードの表示も同期される | js/chartmode.js |

---

## 確定した設計原則

### perf instrumentationのownership（Phase70-A）

```
__CS_DEBUG__.perf が timing / project / chart と同じ
「debug layerはstateを所有しない」原則に統一された。

_lastFrameTime は公開対象外の内部state（getPerfState()には含まれない）。
getPerfState() は longFrameLog を含めてshallow clone（参照漏れ防止）。

計測スコープ: Chart Mode open中のみ（_rafLoopと同じ）。
open毎に_resetPerfState()でリセット
  → tab inactive→open直後の巨大dtがstall判定に混入するのを防ぐ。
```

### speed authority統一の範囲（Phase70-A）

```
speed変更のauthorityは setSpeed()（audio.js）に一本化（Chart Mode含む）。
value直代入はinputイベントを発火しないため、表示同期にはsetSpeed()経由が必須。

Chart Mode speed同期修正は、「全speed UI統一」ではなく、
既存authority（setSpeed）へChart UIを収束させる局所修正として実施。
performモードのspeed UIは意図的にスコープ外（既存の非同期）。
理由: 全speed UI統一にはtransport abstraction / audio ownership /
mode synchronization / UI projectionの再設計が必要で、
Phase70-Aの範囲（perf instrumentation）を大きく超えるため。
→ 下記「speed authority fragmented」として別issue化。
```

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| `__CS_DEBUG__.perf` / `dumpInvariants()`でlongFrameLog取得 | ✅（タブ非アクティブ時の大きいdeltaも正しく記録） |
| Chart Mode初期表示が100%になる | ✅ |
| Chart Modeスライダー操作 → `aEl.playbackRate`反映 | ✅ |
| Chart Mode操作 → 通常モード`#speed-reset`表示も同期（113%確認） | ✅ |
| 演奏モード`#perform-speed`は非同期のまま（想定通り） | ✅ |

---

## current-issues.md更新

- 今回closeしたissue:
  - 「AddChordモーダルの記号過剰」内のhover-only削除ボタン（`✕`表示制御）
    → `.mac-preview-tag-del`にopacity制御で実装済みであることをPhase70-Bで確認。close。
    実装時期は不明（過去フェーズで実装されたがcurrent-issues.mdへの反映が漏れていた）。
  - 「interaction hierarchy改修」内の同項目も同様にclose。
    残作業（既存tokenのキーボード削除・小節線のキーボード挿入）は
    「未着手」として残置（keyboard-first redesignの一部として将来の設計フェーズ対象）。
- 今回新規に積み残したissue:
  - 「speed authority fragmented」（Phase70-A完了時に記録済み、本handover内に記載）

## 運用変更（Phase70で確立）

current-issues.md の issue open/close は handover作成時に確定する方針を
README.mdに追記した。

```
[ISSUE TRUTH SOURCE INVARIANT]
issueの状態（open/close）のtruth sourceはhandoverであり、
Chat内の会話記憶に依存してはいけない。
closeはphase単位（handover作成時）でまとめて確定する。
```

きっかけ: 「hover-only削除ボタン」issueが、実装は完了していたにもかかわらず
current-issues.mdに「未着手」として残存していたことが判明（Phase70-B）。
handover_phase64の教訓（handover記録あり/実コード未適用）の**ミラーケース**
（実コード完了/issue記録未更新）として記録。

詳細はREADME.md「current-issues.md の状態管理（issue open/close）方針」を参照。
handover_phaseXX.mdテンプレートにも「current-issues.md更新」セクションを追加済み。

---

## 積み残し・将来課題

### speed authority fragmented（新規issue）

```
3系統のspeed UI（#speed-sel / #perform-speed / #chart-speed-sel）が
独立してaEl.playbackRateを書き換えており、演奏モードは他と非同期。

Phase70-Aで Chart Mode → setSpeed() への収束は完了したが、
演奏モードは独立UIのまま残っている。

将来的には setSpeed() を唯一のauthorityとして全UIが経由する設計に
統一すべき（transport abstraction の一部として検討）。

優先度: 低（実害は表示のズレのみ。playbackRate自体は各UIで正しく動作する）。
```

### beat cursor stall（Phase65から継続・観察データ取得開始）

```
Phase70-Aで導入したperf instrumentationにより、
window.__CS_DEBUG__.perf.longFrameLog でstall観測が可能になった。

今回の動作確認では291.6ms単発stall（再現せず）と
7.5秒/34秒の大きいdelta（タブ非アクティブによる正常な挙動）を観測。

次のアクション: 長時間再生での自然な蓄積を待ち、
再現性のあるstallパターンが見つかれば原因調査に進む。
```

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
