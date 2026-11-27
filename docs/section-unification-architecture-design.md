# Section設定フロー統合アーキテクチャ設計案

- 状態: **設計案（合意事項反映・未承認）。コード変更なし**
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
- 既存Sectionがある曲にも再設定を許可する。開始時に「既存Sectionを活かす／最初から設定し直す」の二択をユーザーに提示する。
- 既存Sectionを活かす場合は、既存データを共通ルールで整形したDraftを作る。最初から設定し直す場合は、曲全体を1 SectionとしたDraftから始める。
- 既存Sectionのカバー率は、Section Overviewと同じコードIDから再生時間への投影で算出する。Section範囲の時間区間の和集合を曲全体のコード範囲時間で割り、重複は一度だけ、隙間は未カバーとする。80%以上なら「既存Sectionを活かす」、80%未満なら「最初から設定し直す」を推奨表示するが、最終選択は常にユーザーが行う。時間情報が不足する場合は推奨を出さず、両方を選べるようにする。
- 新規設定・既存Sectionを活かす再設定・最初からの再設定は、Draftの初期値だけを変え、その後は同じStage1 / Stage2 / 採用処理を使う。
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
- 保存済みコード列と現在のBufferを比較し、未保存コード編集がある場合は「保存して続ける／キャンセル」の二択を表示する。「保存して続ける」を選んだ場合はコード編集を保存してからSection設定を開始する。破棄して続ける選択肢は設けない。
- Sectionが0件の場合、Timing Modelがfallbackでなく小節情報があるときだけ `detectSectionBoundaries()` を実行する。
- 検出候補を `createDraftFromBoundaries()` と `buildSectionsFromDraft()` でコードID範囲へ変換する。
- 候補を利用できない場合は、曲全体を覆う1 Sectionを初期値にする。
- 既存Sectionがある場合は、再設定方法の二択を表示する。「既存Sectionを活かす」なら整形済み既存SectionをDraftの初期値にし、「最初から設定し直す」なら全範囲1 Sectionを初期値にする。
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
| 既存Sectionを活かして再設定 | 共通ルールで整形した既存Section | 採用まで変更なし |
| 最初から再設定 | 全範囲1 Section | 採用まで変更なし |

新規設定と既存Sectionの再設定を別々の保存・編集システムにしない。初期Draftの作り方だけを変え、その後は同じStage1 / Stage2 / 採用処理を通す。

既存Sectionがある場合は、再設定開始時に必ずユーザーへ二択を提示する。カバー率80%以上なら「既存Sectionを活かす」を、80%未満なら「最初から設定し直す」を推奨表示するが、どちらも選択可能とする。カバー率は選択肢の推奨にのみ使い、自動決定には使わない。時間情報が不足して算出できない場合は、どちらも推奨しない。

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

### 5.1 既存Sectionの正規化と共通検証ルール

今回の合意では、Section一括設定・再設定Draftの範囲で、既存Sectionも例外扱いせず、新規設定と同じ最終形へ整える。既存データの整形は保存済みデータへ直接行わず、Draft生成時にだけ実施する。これはSectionデータモデル全体の不変条件を変更するものではない。`section-model.md` が定義する通常のSectionデータモデルは引き続き個別Sectionの範囲・参照整合性を管理し、他の編集操作に対してグローバルに隙間・重複を禁止する変更は行わない。

**一括設定Draftの正規形（canonical shape／正規データ形状）:**

- Sectionは楽曲全体を隙間なくカバーする。
- Section同士は重複しない。
- Sectionの範囲は楽曲範囲内に収まる。
- 隙間はSection名・種類を「その他」としたSectionで補完する。
- 各Sectionは有効なコード範囲を参照する。

**既存データの整形順序:**

1. Sectionを楽曲上の開始位置が早い順に並べる。元配列の順番ではなく、実際の開始位置を基準にする。
2. 重複がある場合は先行Sectionを優先し、後続Sectionの開始位置を先行Sectionの終了位置の次へ移動する。
3. 重複補正によって範囲が完全になくなったSectionはDraftから除外する。例: Aメロ1〜12、サビ8〜10、Bメロ11〜16の場合、サビはAメロに吸収されDraftから除外される。
4. 重複解消後に残るSection間の隙間を「その他」で補完する。
5. 正規化後に全体が連続・非重複であることを共通検証する。

この整形はDraft上だけで行う。ユーザーがキャンセルした場合、元のSectionデータは一切変更しない。採用時に初めて整形後のSectionへ置き換える。

新規設定・既存Sectionを活かす再設定・最初からの再設定のすべてに、同じ正規形と採用時検証を適用する。したがって、生成物専用の `validateGeneratedSectionSet()` を別の例外ポリシーで使い分けるのではなく、Draft全体に対する共通検証へ責務を整理する。

なお、Section範囲が楽曲の外側にはみ出す、コード参照が存在しないなど、単純な隙間・重複補正では解決できない不正データは、誤った位置へ黙って移動させない。Draft上で修正が必要な問題として検出し、解決するまで採用を許可しない。



### 5.2 未保存コード編集時の確認

未保存のコード編集がある場合は、次の二択を表示する。

- **保存して続ける**: 未保存のコード編集を保存してからSection設定を開始する。
- **キャンセル**: Section設定を開始せず、コード編集画面へ戻る。

未保存コード編集を破棄して続ける選択肢は設けない。ユーザーがコード編集途中でSection設定を開始する頻度は低いため、誤って編集内容を失う可能性をなくし、保存を標準経路とする。

保存処理が失敗した場合はSection設定へ進まず、保存エラーをユーザーに通知する。保存済みSectionには影響させない。



### 5.3 既存Sectionの再設定方法と80%カバー率

既存Sectionがある曲で再設定を開始するときは、ユーザーに次の二択を提示する。

- **既存のSectionを活かす**: 既存SectionをDraftへ引き継ぎ、§5.1の共通ルールで整形してから編集する。
- **最初から設定し直す**: 既存SectionをDraftへ引き継がず、曲全体を1 Sectionとした状態から手動設定する。

選択肢はどちらも常に表示し、ユーザーが決定する。80%カバー率は推奨表示にのみ利用する。

カバー率は、既存SectionのコードID範囲をSection Overviewと同じ方法で時間区間へ投影し、その和集合を楽曲全体のコード範囲時間で割って算出する。各Sectionの開始時刻は開始コードの `start`、終了時刻は終了コードの次のコードの `start`（最後のコードまで含む場合は最終コードの `end`）とする。重複時間は一度だけ数え、Sectionに含まれないコード範囲の時間は未カバーとして扱う。カバー率はDraft正規化前の既存データから算出する。分母は `buffer[0].start` から `buffer[buffer.length - 1].end` までとする。必要な時刻が欠けている、または全体時間が正でない場合はカバー率を `null` とし、推奨を出さない。

- 80%以上: 「既存のSectionを活かす」を推奨表示する。
- 80%未満: 「最初から設定し直す」を推奨表示する。
- 算出不可: どちらも推奨しない。二択自体は必ず表示する。

カバー率によって選択肢を隠したり、自動的に開始方法を決めたりしない。どちらを選んでも保存済みSectionは採用まで変更しない。



### 5.4 Stage1 / Stage2の操作責務

結合操作はStage2の全Section確認画面に集約する。Stage1にあった「前と結合」ボタン、結合可否表示、結合ハンドラーは削除済み。Stage1は単一Sectionの境界編集・分割・試聴に専念する。

分割はStage2の「編集・分割」からStage1へ遷移する現行構造を維持する。分割後のフォーカスはStage2版の現行挙動（前半Sectionを選択）を維持し、main版の後半Sectionフォーカスを一括移植しない。

### 5.5 Draft Undo/Redo

現在のDraftは独立した `undoStack` / `redoStack` を持つ。これは採用前の一時編集履歴であり、Analysis Editorの保存対象Historyとは別である。

合意済みの動作:

- Stage1 / Stage2を移動してもDraftとUndo/Redo履歴を維持する。
- Undo/RedoはDraftだけを戻し、保存済みSectionやAnalysis Editor Historyを直接変更しない。
- Undo/Redo時は上部に1行の通知を数秒表示し、変更されたSectionカードを同時にハイライトする。履歴一覧は設けない。
- 通知文言はUndo「元に戻しました（結合）」、Redo「やり直しました（分割）」を基本とする。
- Draft採用時にだけ、Analysis Editor HistoryへSection一括置換を1回記録する。採用後のUndo/Redoは既存の共同Historyを使う。
- キャンセル時は保存済みSectionとAnalysis Editor Historyを変更しない。

現行実装にDraft内のStackと採用時のHistory 1回は存在する。Stage切替時の履歴維持、通知・カードハイライトの細部は現行テストと照合し、合意済み表示仕様との差分を確認する。

## 6. ファイル別の扱い案

| ファイル | 分類 | 方針 |
|---|---|---|
| `js/sectionBoundaryDetection.js` | 再利用 | 候補検出の純粋関数として維持。精度改善は今回対象外 |
| `js/sectionAutoGeneration.js` | 責務整理して再利用 | 小節→コード範囲変換を候補Draft生成層として再利用。旧自動生成専用の命名・コメントを整理する候補 |
| `js/sectionGeneration.js` | 分離・整理 | Buffer snapshot比較は共通ユーティリティとして残す。旧適格性判定は旧経路廃止時に参照監査 |
| `js/sectionAutoGenerationModal.js` | 廃止候補 | 現行統合UIと二重化。旧経路以外の参照・テストを確認してから削除 |
| `js/sectionSetValidation.js` | 責務再設計 | 共通正規化後の全Draftに対する連続性・非重複・参照整合性検証を担う。生成物専用検証は共通検証へ統合または廃止 |
| `js/sectionReconfiguration.js` | 中核として維持 | Draft lifecycle（生成から破棄・採用までの状態管理）と編集操作を集約 |
| `js/sectionReconfigurationModal.js` | UIとして維持・調整 | Stage1。main版との全面置換はしない。重複操作と合意済みUIを照合 |
| `js/sectionOverview.js` | 再利用 | Stage2の一覧・比較・結合可否判定 |
| `js/sectionOverviewModal.js` | 再利用・調整 | Stage2。再設定入口と結合・分割導線を整理 |
| `js/analysisCommands.js` | 出口を一本化 | `replaceSectionsFromDraftCommand()` を採用経路とする。`applyGeneratedSectionsCommand()` は参照監査後に廃止候補 |
| `js/app.js` | オーケストレーション整理 | 開始意図、未保存確認、候補生成、Stage切替、採用、音声復元を調整する。UI詳細やDraft操作ロジックを増やさない |

## 7. 実装順序案

1. **設計確定**: §5の正規化ルール、カバー率の算出、再設定二択、Stage1/Stage2の操作責務を確定する。
2. **Draft生成経路の統一**: 新規候補・既存Sectionの整形・全範囲1 Sectionを同じDraft形状へ変換する。
3. **正規化・検証の統一**: 既存データの隙間補完・重複解消・空Section除外と、Draft採用時の共通検証を実装する。
4. **開始UIの不足を実装**: 既存Sectionの活用／最初から再設定の二択、未保存コード編集時の二択確認を追加する。
5. **UI重複の整理**: Stage1/Stage2の操作配置と分割後フォーカスを確定する。
6. **旧経路の廃止**: 呼び出し元・テスト・CI・ドキュメントを調べたうえで旧モーダル・旧Command等を削除する。
7. **回帰確認**: Draft、History、音声復元、保存、Project切替、異常Section、隙間・重なりを検証する。

各段階は小さなコミットに分ける。リファクタリングと挙動変更を同じコミットに混在させない。

## 8. 必須テスト観点

- 新規設定: 候補あり／候補なし／Timing Model fallback／小節情報なし。
- 既存Section: 正常／隙間あり／重なりあり／重複補正で範囲を失うSection／無効なコード参照あり／楽曲範囲外。
- 正規化: 開始位置順の並べ替え、隙間の「その他」補完、先行Section優先の重複解消、範囲を失ったSectionのDraft除外。
- カバー率: Section Overviewと同じ時間境界を使うこと、重複時間を二重計上しないこと、隙間を未カバーとすること、80%境界で推奨表示が切り替わること、時間情報不足時に推奨を出さないこと、いずれの推奨でも両選択肢を選べること。
- 再設定: 既存Sectionを活かす／最初から設定し直す／キャンセル／採用。キャンセル時に保存済みSectionが変更されないこと。
- 未保存コード編集: 保存して続ける／キャンセルの各分岐。保存失敗時にSection設定へ進まないこと。保存済みSectionが意図せず変更されないこと。
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

1. 既存Sectionの隙間・重複を、ユーザーの意図を不必要に変えずにDraft上で正規化すること。
2. 既存Sectionを活かすか最初から設定し直すかの選択、80%カバー率による推奨表示、未保存コード編集時の二択確認を現行UIへ組み込むこと。
3. 旧経路と新経路が `app.js`・Command・検証モジュールに併存していること。

したがって、**既存Draftフローを中核に据え、候補生成または既存Sectionの正規化結果をDraftの初期値として供給し、全Draftに共通の正規形・検証・採用処理を適用する**のが最も安全な方向である。§5に記載したルールは今回のユーザー合意を反映した設計方針であり、コード変更はまだ行っていない。
