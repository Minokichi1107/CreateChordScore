# 引き継ぎ: Phase65完了 — restore-aware asset authority normalization

## 作業状態
- ブランチ: main
- 直前作業: Phase64完了（timing model rehydration redesign）

---

## 完了したこと

| 変更 | 内容 | ファイル |
|---|---|---|
| `assetState` 追加 | `{audioLoaded, chordLoaded, restoreSettled}` を GLOBAL STATE に追加。asset loaded 状態の唯一の authority | js/app.js |
| `setAudioLoaded()` 追加 | state更新 → UI同期 → banner評価 を1箇所に集約。`silent` オプションで評価抑制可能 | js/app.js |
| `setChordLoaded()` 追加 | 同上（chord 版） | js/app.js |
| `_evaluateBannerState()` 追加 | assetState + project metadata の純粋な projection としてバナー表示/非表示を決定 | js/app.js |
| `checkReloadBannerDone()` 削除 | DOM-as-authority アンチパターンを排除 | js/app.js |
| `loadChordData` ingest 専用化 | 直接DOM操作・banner評価を削除。呼び出し側が `setChordLoaded()` を担う | js/app.js |
| `loadProj` async IIFE 整理 | `restoreSettled=false` で restore transaction を保護。完了後に `_evaluateBannerState()` を1回だけ呼ぶ | js/app.js |
| manual ingest 経路統一 | audio-btn / file-audio / chord-btn / file-chord を `setAudioLoaded` / `setChordLoaded` 経由に統一 | js/app.js |
| `resetProject()` 整理 | `setAudioLoaded(false, null, {silent:true})` / `setChordLoaded(false, null, {silent:true})` で silent リセット。restore transaction lifecycle は loadProj 側が管理する（resetProject は関与しない） | js/app.js |
| autosave restore 条件修正 | `lines.length > 0` → `id && (lines.length>0 \|\| title \|\| artist \|\| audio \|\| chord_source)` | js/app.js |

---

## 確定した設計原則

### asset loaded authority（Phase65で確立）

```
[ASSET AUTHORITY INVARIANT]
assetState は runtime における asset loaded 状態の唯一の authority（single source of truth）。

DOM state や derived runtime state
  (button.classList / aEl.src / palette.length 等)
を authority source として参照してはいけない。
これらは assetState を「反映する（projection）」だけ。

assetState = {
  audioLoaded:    false,   // audio が使える状態か
  chordLoaded:    false,   // chord データが使える状態か
  restoreSettled: true,    // asset restore transaction 完了フラグ。
                           // false の間は _evaluateBannerState() は評価を行わない。
                           // loadProj() の async restore transaction 中のみ false。
}
```

### restoreSettled semantics

```
restoreSettled は「asset authority evaluation を抑止する transactional guard」。

false にするのは loadProj() の async restore transaction 開始時のみ。
async IIFE が完了（audio / chord 両方の試行が終了）した後に true に戻し、
_evaluateBannerState() を1回だけ呼ぶ。

restore transaction lifecycle は loadProj() の責務。
resetProject() は「空状態へ戻す」のみで、
restore transaction の開始・完了には関与しない。

manual ingest は restore transaction ではないため restoreSettled を操作しない
（通常状態 = true のまま）。

これにより transient phase（restore 途中）でのバナー誤表示・flicker を防ぐ。
```

### loadChordData / setChordLoaded の責務分離

```
loadChordData  = chord parser / ingest 専用。
  project / palette 更新は行うが、
  asset authority 更新・banner評価・button UI同期は行わない。

setChordLoaded = runtime authority 確立（呼び出し側の責務）。

理由: loadChordData は将来 preview import / validation only 等にも
      使われる可能性があるため、
      「呼び出す = chord asset authority 成立」という意味を内包させない。
```

### _evaluateBannerState は UI projection

```
バナーの表示/非表示は assetState + project metadata の純粋な投影（projection）。
バナーは「状態の反映」であり、DOM 状態を authority として参照してはいけない。

[将来の退行リスク]
以下の3パターンで authority が崩れやすい:
  ① assetState を bypass する直接DOM更新
  ② restoreSettled を「なんとなく false にする」
  ③ _evaluateBannerState に別条件を継ぎ足す（DOM class 判定等）
```

### autosave restore eligibility（Phase65で修正）

```
以前:
  saved.lines.length > 0

だったため、metadata-only project
（title / artist / audio / chord_source のみ設定済み・lines=[]）
が restore 対象から漏れていた。

修正後:
  saved.id && (
    saved.lines?.length > 0 ||
    saved.title || saved.artist || saved.audio || saved.chord_source
  )

restore eligibility は「作業実体が存在するか」で判定すべきであり、
lyrics / chord line の有無に依存してはいけない。
```

---

## 動作確認済みシナリオ

| シナリオ | 結果 |
|---|---|
| restore成功（audio/chord 両方 IndexedDB あり）| バナーなし ✅ |
| audio のみ IndexedDB 未登録 → バナー表示 | ✅ |
| バナー表示後に手動 audio 選択 → バナー消える | ✅ |
| 新規プロジェクト（ボタンリセット・tap-btn disabled）| ✅ |
| audio → chord 順手動読み込み | 手動確認済み ✅ |
| lines=[] プロジェクトの autosave 復元 | confirm が出る ✅ |

---

## 積み残し・保留

### beat cursor が一瞬停止して数ビートジャンプする（issue化・観察中）

```
【現象】
再生中、beat cursor が一瞬停止した後、数ビート先へジャンプすることがある。

【確認済み事実】
- audio playback position 自体は正常（カーソル描画のみ）
- 毎回同じ位置で再現しない（ランダム発生）
- 数ビート程度ジャンプする
- 処理落ちのような見え方
- 曲サイズ依存は今のところ不明

【現時点の仮説（断定ではない）】
main thread blockage（autosave serialize / layout reflow 等）または
frame scheduling delay の可能性。原因は未特定。

次フレームで audio currentTime が数ビート先に進んでいるため
cursor が catch-up して「飛んだ」ように見える構造は確か。

【未確認】
- requestAnimationFrame stall の実測（performance.now() で dt 計測）
- layout / reflow blockage
- autosave serialize のサイズ・実行タイミング

【備考】
Phase63 の rAF 化で「通常時は滑らか」になった副作用として、
一時的な stall が以前より目立ちやすくなっている可能性がある。
再現条件確立後に profiler / frame timing 計測を行う。
現時点では「現象記録フェーズ」であり原因断定フェーズではない。
```

### assetState の source フィールド（将来）

```
現在: { audioLoaded, chordLoaded, restoreSettled }

将来の拡張候補:
  audio: { loaded, source: 'manual'|'restore', filename }
  chord: { loaded, source: 'manual'|'restore', filename }

時期: autosave restore / workspace reopen / LAN mode 実装時
      Phase65 では boolean フラグのみで十分と判断。
```

### chord restore 後に chordLoaded=false になるケース（観察中）

```
【観測事実】
デバッグ確認時、audioLoaded=false / chordLoaded=false の状態で
_evaluateBannerState() が呼ばれるケースが1回観測された。
最終的には banner / UI state は正常に収束していた。

【未確定】
発生の再現条件・根本原因は未特定。
非同期タイミング問題の可能性はあるが未確認。

【判断】
実害なしと判断し Phase65 範囲での対処はしない。
将来 async restore の並列化・高速化を行う場合は要注意。
```

---

## 次フェーズ候補

- debug API 整理（window.__CS_DEBUG__ 統合・TEMP REPAIR タグ削除）
- Chart Mode pickup-aware alignment（設計フェーズが必要）
- Chart Mode 並列表示（設計フェーズが必要）

---

## commit message

```
feat: Phase65 restore-aware asset authority normalization

- introduce assetState {audioLoaded, chordLoaded, restoreSettled}
  as the single runtime authority for asset loaded state
- add setAudioLoaded() / setChordLoaded() / _evaluateBannerState()
  as the asset authority API
- remove checkReloadBannerDone() (DOM-as-authority antipattern)
- unify manual ingest and IndexedDB restore through same API
- guard _evaluateBannerState() with restoreSettled flag to prevent
  transient-phase banner flicker during restore transaction
- restoreSettled=false only during loadProj() async restore IIFE;
  manual ingest never touches restoreSettled
- loadChordData: remove DOM ops and banner evaluation;
  setChordLoaded() is now the caller's responsibility
- fix: metadata-only projects (lines=[]) not restored from autosave
  restore eligibility: id && (lines>0 || title || artist || audio || chord_source)

[ASSET AUTHORITY INVARIANT]
  assetState is the single runtime authority for asset loaded state.
  DOM state (button.classList / aEl.src / palette.length) must never
  be used as authority source — these are projections only.
```

---

## 運用ルール（変わらず）

→ docs/handover/README.md 参照
