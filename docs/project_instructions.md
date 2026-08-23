# ChordScore Editor — プロジェクト指示

## このプロジェクトについて

ブラウザベースのギターコード譜エディター「ChordScore Editor」の開発支援。
Vanilla JS（モジュール構成）・Python（ローカルサーバー）。
GitHub: github.com/Minokichi1107/CreateChordScore

---

## 開発ルール（厳守）

### 実装フロー
- 機能追加を依頼された場合、すぐに実装しない
- 仕様確認 → 提案 → 「実装してください」の明示後に実装
- 改善提案は後出し・小出し禁止。設計段階でまとめて提示
- 新機能・UX変更を伴う開発は、Product Intent → UX / Behavior
  Specification → Rough Phase Estimate → Product Freeze →
  Technical Design の順で進める（詳細は docs/handover/README.md の
  「Development Process」参照）。見た目の微調整・軽微なバグ修正は
  上記の簡易フロー（仕様確認→提案→実装指示）のままでよい

### コード制約
- 1回の回答で500行以上のコードを書かない
- 既存コードを破壊するリファクタリング禁止。段階的変更のみ
- リファクタリングと機能追加の混在禁止
- 1 commit = 1 logical concern（1つの論理的な変更目的）を原則とする
- 1フィーチャーが複数Phaseにまたがる場合、Phaseごとに必要な
  logical concern単位でコミットしてよい
- 機能追加と無関係なリファクタリングを同一コミットに混在させない

### 禁止事項
- utils.js / helpers.js を作らない
- uiモジュール間の直接依存禁止（app.js経由のみ）
- CHORD_DB への直接参照（read）禁止。findChord() を使う
- フェーズ外の実装・設計変更を勝手に開始しない。現在のProduct
  Intent / Product Freezeの範囲外にある改善案・機能案は、実装せず
  「Out of Scope / Future Candidate」として別途提示する。ただし、
  現在の設計判断に直接影響する重大な将来リスクや既存Invariant
  違反を発見した場合は、警告として提示してよい（「先回り実装の
  禁止」と「リスク報告の禁止」は別物として扱う）

---

## 設計原則

### モジュール構成
| モジュール | 責務 |
|---|---|
| app.js | アプリ起動・状態管理・モジュール間調整（オーケストレーター） |
| audio.js | 音声再生管理 |
| editor.js | コード譜編集 |
| chords.js | コード情報・ダイアグラム・lookup |
| project.js | プロジェクトデータの管理・シリアライズ・保存関連処理 |
| csvImporter.js | CSVインポート |
| perform.js | 演奏モード関連処理 |
| idb.js | IndexedDB操作層（audio/chord_sourceのローカル保存） |

- app.js がオーケストレーター。モジュール間の連携は app.js 経由
- モジュール間の直接操作禁止
- project.js はデータ管理・シリアライズに限定（UI操作を含まない）

### 状態管理
```js
project = { id, title, artist, beats, audioFile, lines[], palette[] }
uiState = { focLine, tapIdx, diagOn, rbHits }
audioState = { currentTime, duration, playing }
```
- 状態は app.js に集中管理

### CSS責務
| ファイル | 責務 |
|---|---|
| base.css | reset / normalize / 非テーマ依存の構造定義 |
| theme.css | テーマ差分のみ（color / background / shadow / border-color） |
| layout.css | 配置・構造（colorを含まない） |
| components.css | UI形状。color / background は theme.css へ |
| state.css | 汎用stateクラスのみ |
| perform.css | 演奏モード固有スタイル |

- テーマ依存色は theme.css に集約。他ファイルへの記述禁止
- 色・背景・borderは原則 CSS変数経由（var(--surface-base) 等）
- semantic role を持たない色の直指定は避ける

### chord lookup
```
raw input → normalizeChordName() → canonical key → findChord() → CHORD_DB
```
- canonical = Cmaj7（CM7 / C△7 はalias）
- m7 と M7 は別物（case-sensitive）
- enharmonic（C# / Db）は統合しない

### idb.js 注意点
- 最低構成（GC・schema migration・compression なし）
- asset種類追加: key形式 `${projectId}:${type}` に新typeを追加
- schema変更: DB_VERSION をインクリメントして onupgradeneeded を更新

---

## 既知の危険領域

- **app.js**: オーケストレーター。責務を増やす変更は慎重に。**全文出力禁止・差分のみ**。
  Phase71でassetState設計・__CS_DEBUG__・Chart Hover接続など大量の実装が古いファイル上書きで消失した実績あり。
- **CSS theme layer**: components.css にテーマ依存色が残存（.tov-chord-tag 等）。移管作業中
- **chord lookup**: CHORD_DB 直参照は禁止。findChord() 経由のみ
- **idb.js**: 最低構成。将来スキーマ変更時は DB_VERSION 更新が必要

---

## レビュー・設計説明時の用語ルール

専門用語・略称・ローカル関数名は、
初出時に簡潔に補足説明を付記すること。
説明文は日本語で書くこと。コードコメントも日本語で。

例：

- migration（旧設計から新設計への移行）
- latent bug（潜在化していた既存バグ）
- rbRefresh（replace検索結果を再生成する関数）

特に以下を区別して説明する：

- 一般的CS用語
- 音楽ドメイン用語
- CreateChordScore固有概念
- ローカル関数名/略称

略称や内部関数名のみで説明を進めないこと。

---

## 設計議論のルール

### 目的
設計判断をAI任せのブラックボックスにしない。
構造を理解した上で判断できるようにする。

### AIへの説明要件
新しい設計提案・構造変更を議論する際は、以下を含めること。

**必須**
- 簡潔に平易な言葉での説明
- 図解（ASCIIでよい）
- 「誰が何を持つか」（ownership）の明示

**できれば**
- データの流れ（どこから来てどこへ行くか）
- なぜその設計にするのか（理由）
- やってはいけないこと（アンチパターン）

### 図解の例

```
app.js
  └ modal土台（mOv / mTit / mBody / mBtns）を持つ
  └ openModal / closeModal / mkMBtn を渡す
        ↓ 注入
modals.js
  └ 中身だけ作る（HTML・イベント・callback）
  └ 土台には直接触らない
```

### 特に図解が必要なテーマ
- state ownership（誰が状態を持つか）
- callback の流れ（誰が呼んで誰が受けるか）
- UI lifecycle（いつ開いて、いつ閉じて、誰が閉じるか）
- subsystem の境界（どこまでが誰の責務か）

---

## 現在地

最新の開発状況・完了フェーズ一覧は `phase-status.md` を参照する。
本ファイル（project_instructions.md）には進行中の経過（「PhaseXX
進行中」等）を書かない。architecture.mdと同じ方針であり、書いた
時点の状態が読んだ時点では古びてしまうことを避けるための判断。

---

## Protected Runtime Interfaces（削除・名称変更禁止）

以下はDevTools診断・保守・運用で使用する公開インターフェース。
削除・名称変更・移動は設計変更として扱い、architecture.mdを更新すること。

| インターフェース | 所有者 | 用途 |
|---|---|---|
| `window.__CS_DEBUG__` | app.js | DevTools診断・timing調査 |
| `window.__CS_DEBUG__.timing` | app.js | ビートズレ診断 |
| `window.__CS_DEBUG__.project` | app.js | プロジェクト状態確認 |
| `window.__CS_DEBUG__.perf` | app.js → chartmode.js | パフォーマンス診断 |
| `assetState` | app.js | audio/chord loaded状態のauthority |
| `setAudioLoaded()` | app.js | audio asset authority更新 |
| `setChordLoaded()` | app.js | chord asset authority更新 |
| `_evaluateBannerState()` | app.js | バナー表示のprojection |
| `getPerfState()` | chartmode.js | perf instrumentation getter |
| `chartState` | chartmode.js | Chart Mode runtime state |
| `window.__CS_REPAIR__` | app.js | 緊急修復ツール |

### フェーズ完了時の確認コマンド
```powershell
# 保護対象インターフェースの存在確認（フェーズ完了前に必ず実行）
Select-String -Path "js\app.js" -Pattern "__CS_DEBUG__|assetState|setAudioLoaded|setChordLoaded" | Select-Object -First 5
git diff --stat
```