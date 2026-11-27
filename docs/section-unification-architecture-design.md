# Section設定フロー統合アーキテクチャ設計案

- 状態: **設計案（未承認）。コード変更なし**
- 作成日: 2026-11-27
- 作業ブランチ: `phase150-section-integration`
- 基準コミット: `697914787be876b2814a9b455a4194ef3809dbfe`（Stage2）
- 保護対象: `main` / Stage1 / Stage2 および作成済みバックアップブランチ

## 1. 目的

Section設定に関係する既存機能を、ユーザーが一つの操作フローとして利用できるように整理する。

今回の目的は自動生成アルゴリズムの精度向上ではない。低精度であることを前提に、境界候補を補助情報として提示し、ユーザーがコード進行上で境界を確認・修正できることを優先する。

統合対象は次の4領域。

1. 境界候補の検出とコードIDへの変換
2. Section Draft（保存前の一時編集データ）の生成・編集・履歴管理
3. Stage1（コード進行上の編集）とStage2（全Section確認）のUI
4. Draftの検証・採用・既存保存処理への引き渡し

**ファイルを一つにまとめることは目的にしない。** 責務の重複をなくし、各層の境界を明確にする。

## 2. 変更しない前提・既存合意

- Sectionの境界は `startChordId` / `endChordId` でコードを参照する。時間値をSectionの正本として持たない。
- 既存SectionはDraftを採用するまで保存済みデータから変更しない。
- Draftのキャンセル時は保存済みSectionを維持し、採用時に初めて置き換える。
- 新規設定では候補があれば初期候補として利用し、候補がなければ曲全体を1 Sectionとした状態から手動編集できる。
- 既存Sectionがある曲にも再設定を許可する。再設定用Draftを作り、採用時のみ置き換える。
- 既存Sectionの再設定・候補からの再設定・全範囲からのやり直しは、可能な限り同じDraft編集・確認フローを使う。
- 既存Sectionの再設定はStage2（全Section一覧・確認画面）から開始し、各Sectionの「編集・分割」でStage1へ移動する。Stage1からStage2へ戻れる。Stage間の移動ではDraftとUndo/Redo履歴を維持する。
- Draft編集中のUndo/Redoは、Draft内で一時管理し、Analysis Editor Historyへは採用時に1回だけ記録する。Undo/Redo時は上部に1行の通知を数秒表示し、変更されたSectionカードをハイライトする。履歴一覧は設けない。通知文言はUndo「元に戻しました（結合）」、Redo「やり直しました（分割）」を基本とする。
- Stage1はコード進行上の境界編集と試聴を中心とする。Stage2は全Sectionの時系列確認、結合・分割の入口、長さ比較、採用を担う。
- Sectionコピー（コード進行のコピー）は今回の対象外。
- Section名・種類の入力に、転調・キー変更の入力を追加しない。
- Section候補の検出精度を今回の統合要件にしない。

## 3. 現在の実装事実（Stage2基準）

### 3.1 現行UIの入口

`sec-setup-btn` は `startSectionReconfiguration()` を呼び出す。旧 `startSectionAutoGeneration()` は現行ボタンから呼ばれていない。

`startSectionReconfiguration()` の現在の動作:

- Analysis Editorが開いていない場合、開始しない。
- コードBufferが空なら開始しない。
- 保存済みコード列と現在のBufferを比較し、未保存コード編集がある場合は、現在は「保存して続ける／キャンセル」の二択確認を表示する。
- Sectionが0件の場合、Timing Modelがfallbackでなく小節情報があるときだけ `detectSectionBoundaries()` を実行する。
- 検出候補を `createDraftFromBoundaries()` と `buildSectionsFromDraft()` でコードID範囲へ変換する。
- 候補を利用できない場合は、曲全体を覆う1 Sectionを初期値にする。
- 既存Sectionがある場合は、そのSectionをコピーしてDraftの初期値にする。
- Draftと音声位置・再生速度のスナップショットをRuntimeに保持し、通常再生を停止してStage2を開く。Sectionが0件の初回設定ではStage1から開始する。

### 3.2 現在のDraftとUI

- `sectionReconfiguration.js`: Draftの生成、Sectionの診断、境界調整、分割、結合、削除、Undo/Redo、採用前検証を持つ。
- `sectionReconfigurationModal.js`: Stage1のコード進行編集・試聴UI。現行実装には通常編集、境界編集、分割の各モードがある。
- `sectionOverview.js` / `sectionOverviewModal.js`: Stage2の全Section表示、長さ表示、同種Section比較、結合、編集・分割への遷移を持つ。
- Stage1とStage2は同じRuntime上のDraftを共有し、Stage切替時にDraftを作り直さない。
- 採用時は `_adoptSectionReconfigDraft()` → `prepareDraftForAdopt()` → `replaceSectionsFromDraftCommand()` を通る。
- `replaceSectionsFromDraftCommand()` はAnalysis Editor Historyを1回積み、Section配列を置き換える。ディスクへの保存は既存の通常保存フローが担う。
- キャンセル時はDraftを破棄し、開始前の音声位置・再生速度を復元する。

### 3.3 旧自動生成経路

旧経路は次の構成。

`startSectionAutoGeneration()`
→ `evaluateSectionGenerationEligibility()`
→ `detectSectionBoundaries()`
→ `openSectionAutoGenerationModal()`
→ `_adoptGeneratedSections()`
→ `applyGeneratedSectionsCommand()`

この経路はSectionが既にある場合に拒否し、既存Sectionの置換を許可しない。現在の統合フローとは別経路であり、機能上の責務が重複している。

一方、`sectionGeneration.js` の `captureSectionGenerationBuffer()` と `hasSectionGenerationCodeEdits()` は、現行の再設定開始時にも使われている。したがって、ファイル全体を一括削除してはならない。

## 4. 統合後の責務分担案

### A. 入口・開始モード（app.js側のオーケストレーション）

Section設定開始時に、少なくとも次の開始意図を区別する。

| 開始意図 | Draftの初期値 | 保存済みSectionへの影響 |
|---|---|---|
| 新規設定 | 検出候補。利用不可なら全範囲1 Section | 採用まで変更なし |
| 既存Sectionの編集 | 保存済みSectionのコピー | 採用まで変更なし |
| 既存Sectionを候補から再設定 | 新しい検出候補 | 採用まで変更なし |
| 全範囲からやり直し | 全範囲1 Section | 採用まで変更なし |

この4つを別々の保存・編集システムにしない。初期Draftの作り方だけを変え、その後は同じStage1 / Stage2 / 採用処理を通す。

### B. 候補生成（純粋関数層）

主な再利用対象:

- `sectionBoundaryDetection.js`: 小節単位の境界候補を検出する。
- `sectionAutoGeneration.js`: 小節境界をコード範囲へ対応付け、候補DraftをSection範囲へ変換する。

候補検出はあくまで提案であり、確定判断ではない。候補がゼロでもエラー扱いにせず、手動設定可能なDraftを用意する。

候補生成処理はSection保存・Editor Session変更・DOM操作を行わない。候補を既存Sectionへ直接適用しない。

### C. Draft管理（sectionReconfiguration.js）

Draftの唯一の編集モデルとして維持する。

担当:
- 保存済みSectionからのDraft複製
- 候補または全範囲からのDraft生成に必要な共通データ形状
- Section境界・名称・種類の編集
- 分割・結合・削除
- Draft専用Undo/Redo
- Section IDの維持・新規発行
- 採用前の構造診断

UIはDraftを直接書き換えず、この層の操作関数を通す。

### D. UI（Stage1 / Stage2）

- Stage1: コード進行を見ながら境界を決める。試聴位置を調整して再生できる。Stage間移動時もDraftを維持する。
- Stage2: Sectionを時系列順に確認し、小節数・拍数・同種Sectionとの長さ比較を表示する。結合・分割の操作をここから開始できる。
- Stage2からの分割は、既存実装どおり必要に応じてStage1の編集へ遷移し、分割後にStage2へ戻る方式を維持できる。
- Stage1とStage2の両方に同じ操作ボタンを重複配置しない。現行Stage1モジュールにも結合処理が存在するため、合意済みUI責務に合わせて配置を整理する。

### E. 検証・採用（共通の出口）

採用経路は `prepareDraftForAdopt()` と `replaceSectionsFromDraftCommand()` に一本化する。

- Draftの未知キー・重複ID・無効なコード参照・開始終了逆転・未入力の名称／種類を検査する。
- 検証に成功した場合だけ、canonical Section（保存対象のSectionデータ）へ変換する。
- Analysis EditorのSection配列を一度のHistory操作で置き換える。
- 実ファイルへの保存は既存の通常保存に任せる。

旧 `applyGeneratedSectionsCommand()` を新経路の採用処理として残さない。削除は参照箇所・テスト・CIを調べてから行う。

## 5. 重要な設計上の不整合・要解決事項

### 5.1 既存Sectionへの隙間・重なりルール

Section Modelはデータモデルとして隙間・重なりを許容する。一方、現在の `buildDraftSectionsFromCurrent()` は既存Section間の隙間を「その他」Sectionで埋め、重なり数を診断する。

さらに、`prepareDraftForAdopt()` は `validateGeneratedSectionSet()` を呼び、先頭から末尾までの完全連続・非重複を要求する。`replaceSectionsFromDraftCommand()` も同じ生成物用検証を再実行する。

つまり、**生成物専用だったはずの連続性ルールが、既存Sectionの再設定にも適用されている**。

これは「既に設定済みの曲は隙間・重なりの強制対象外」とする合意と整合しない可能性がある。実装前に次の区別を明示する必要がある。

- 新規設定・全範囲からのやり直し: 完全連続・非重複を要求する方針。
- 既存Sectionの編集・候補再設定: 既存データの隙間・重なりだけを理由に採用を拒否しない方針。ただし各Sectionの参照整合性・ID・名称・種類などの検証は行う。

この区別を実装する場合、生成物専用の `validateGeneratedSectionSet()` を全Draftに適用せず、開始意図に応じた検証ポリシーを明示する。既存Sectionの隙間を自動で「その他」Sectionに変換する現在の挙動も再検討する。

### 5.2 未保存コード編集時の確認

現行実装は「保存して続ける／キャンセル」の二択だが、合意済みの動作は次の三択。

- 保存して続ける
- 未保存のコード編集だけを破棄して続ける
- キャンセル

破棄対象は未保存コード編集のみ。保存済みコード譜・保存済みSectionには影響させない。現在の `_sectionReconfigConfirmChoice()` は `window.confirm()` の二択実装なので、専用の三択UIへ変更する必要がある。

### 5.3 既存Sectionの候補再生成・全リセット

現在の `startSectionReconfiguration()` は既存Sectionがあると、それをDraftの初期値として使う。既存Sectionを候補から再設定する入口、および全範囲1 Sectionへ戻す入口は確認できない。

新しい入口は保存済みSectionを直接消さず、Draftの初期値だけを差し替える。キャンセル時は既存Sectionを維持する。

### 5.4 Stage1 / Stage2の操作重複

Stage2には結合ボタンがあり、Stage1にも `mergeDraftWithPrevious()` を呼ぶ処理がある。合意済みUI責務に合わせ、結合の入口をStage2に集約するか確認する。

分割はStage2の「編集・分割」からStage1へ遷移する現行構造を維持できるが、分割後にどちらのSectionへフォーカスするかは、mainとStage2で挙動が異なる。mainは後半Section、Stage2は前半Sectionを選択する。これは一括移植せず、ユーザーの操作意図とテストを確認して決める。

### 5.5 Draft Undo/Redo

現在のDraftは独立した `undoStack` / `redoStack` を持つ。採用前のDraft編集履歴とAnalysis Editorの保存対象Historyを混同しない。合意済みB案の詳細と現行テストを照合し、履歴の保持範囲・ステージ切替時の維持・採用時のHistory 1回を回帰テストで固定する。

## 6. ファイル別の扱い案

| ファイル | 分類 | 方針 |
|---|---|---|
| `js/sectionBoundaryDetection.js` | 再利用 | 候補検出の純粋関数として維持。精度改善は今回対象外 |
| `js/sectionAutoGeneration.js` | 責務整理して再利用 | 小節→コード範囲変換を候補Draft生成層として再利用。旧自動生成専用の命名・コメントを整理する候補 |
| `js/sectionGeneration.js` | 分離・整理 | Buffer snapshot比較は共通ユーティリティとして残す。旧適格性判定は旧経路廃止時に参照監査 |
| `js/sectionAutoGenerationModal.js` | 廃止候補 | 現行統合UIと二重化。旧経路以外の参照・テストを確認してから削除 |
| `js/sectionSetValidation.js` | 責務再設計 | 生成物専用の完全連続検証と、Draft採用に必要な個別・集合検証を分離 |
| `js/sectionReconfiguration.js` | 中核として維持 | Draft lifecycle（生成から破棄・採用までの状態管理）と編集操作を集約 |
| `js/sectionReconfigurationModal.js` | UIとして維持・調整 | Stage1。main版との全面置換はしない。重複操作と合意済みUIを照合 |
| `js/sectionOverview.js` | 再利用 | Stage2の一覧・比較・結合可否判定 |
| `js/sectionOverviewModal.js` | 再利用・調整 | Stage2。再設定入口と結合・分割導線を整理 |
| `js/analysisCommands.js` | 出口を一本化 | `replaceSectionsFromDraftCommand()` を採用経路とする。`applyGeneratedSectionsCommand()` は参照監査後に廃止候補 |
| `js/app.js` | オーケストレーション整理 | 開始意図、未保存確認、候補生成、Stage切替、採用、音声復元を調整する。UI詳細やDraft操作ロジックを増やさない |

## 7. 実装順序案

1. **設計確定**: §5の検証ポリシー、開始意図、Stage1/Stage2の操作責務を確定する。
2. **Draft生成経路の統一**: 新規候補・既存Section・候補再生成・全リセットを同じDraft形状へ変換する。
3. **検証責務の分離**: 生成物専用の完全連続検証と、既存Section再設定の検証を区別する。
4. **開始UIの不足を実装**: 既存Sectionの再生成・全リセット、未保存コード編集時の三択確認を追加する。
5. **UI重複の整理**: Stage1/Stage2の操作配置と分割後フォーカスを確定する。
6. **旧経路の廃止**: 呼び出し元・テスト・CI・ドキュメントを調べたうえで旧モーダル・旧Command等を削除する。
7. **回帰確認**: Draft、History、音声復元、保存、Project切替、異常Section、隙間・重なりを検証する。

各段階は小さなコミットに分ける。リファクタリングと挙動変更を同じコミットに混在させない。

## 8. 必須テスト観点

- 新規設定: 候補あり／候補なし／Timing Model fallback／小節情報なし。
- 既存Section: 正常／隙間あり／重なりあり／無効なコード参照あり。
- 再設定: 候補から再生成／全範囲へリセット／キャンセル／採用。
- 未保存コード編集: 保存／破棄／キャンセルの各分岐。保存済みSectionが意図せず変更されないこと。
- Draft操作: 境界移動／分割／結合／削除／Undo／Redo／Stage切替後の状態維持。
- 採用: Section配列の置換がAnalysis Editor Historyに1回だけ記録され、通常保存で永続化されること。
- 音声: モーダル開始時の位置・再生速度の保存、試聴停止、キャンセル・採用後の復元。
- Project切替・編集モード終了・コードBuffer変更時のDraft破棄または採用拒否。
- 最終Sectionの分割、分割後フォーカス、Section IDの維持・新規発行。
- 既存のPhase146〜148、Section再設定、Stage2 Overviewの回帰テスト。

## 9. mainからの機能取り込み方針

mainとStage1/Stage2は、`js/sectionReconfigurationModal.js` を共通祖先から独立に追加している。main版は1,408行、Stage2版は1,416行であり、単純な前後関係ではない。

main版には分割後に後半Sectionへフォーカスする挙動があり、Stage2版は前半Sectionにフォーカスを維持する。mainの実装をStage2へ丸ごと置き換えない。取り込む場合は、個別機能・意図・回帰テストを確認したうえで、必要な差分だけを移植する。

## 10. ブランチ・変更管理

- この設計案と今後の統合作業は `phase150-section-integration` のみで行う。
- `main`、Stage1、Stage2、各バックアップブランチは変更しない。
- 設計案の承認前に本書の内容を実装仕様として扱わない。
- 実装前に、ユーザーが未確定事項を確認・判断する。
- mainへのマージ、PRの作成・更新、バックアップ削除は別途明示的な承認を得る。

## 11. 現時点の結論

統合は可能。ただし、中心となるDraftモデルと二段階UIは既にStage2に実装されているため、ゼロから作り直す必要はない。

最大の課題はファイル数ではなく、次の3点である。

1. 旧自動生成専用の検証ルールが、新しい既存Section再設定にも流用されていること。
2. 既存Sectionを候補から再生成する入口と、全範囲へ戻す入口が未実装であること。
3. 旧経路と新経路が `app.js`・Command・検証モジュールに併存していること。

したがって、**既存Draftフローを中核に据え、候補生成をDraftの初期値供給元として統合し、採用処理を一つに保つ**のが最も安全な方向である。ただし、§5に列挙した不整合を解決するまでは実装に進まない。
