# 引き継ぎ: Phase81完了 — ドキュメント棚卸し + 再構成

## 作業状態
- 直前作業: Phase80完了（Search Engine：検索・置換実装）
- ブランチ: phase81-document-cleanup（想定・実際のブランチ名に合わせて読み替え）

---

## 1. Purpose（目的）

Phase74〜80でAnalysis Editor・Search Engine・Project DB・Decorator Layer等の
実装が積み重なり、コードだけでなくドキュメントも増加・重複が進んでいた。
本フェーズは新機能追加ではなく、以下4点の整理・再構成を行う。

```
① ディレクトリ・ファイル構成の棚卸し（不要ファイル削除・legacy整理）
② docs/README.md の更新（読む順番ガイド・分類の明確化）
③ architecture.md の更新（Phase75〜80の設計を正式反映）
④ phase-status.md / current-issues.md の更新（履歴・課題の整理）
```

ChatGPT（設計レビュー担当）との複数ラウンドのレビューを経て、単なる内容追記ではなく
「ドキュメントの情報アーキテクチャ自体を見直す」フェーズとなった。

---

## 2. Scope（今回やったこと）

```
① ディレクトリ・ファイル構成の棚卸し
   ・docs/prompts/ を削除（未使用・存在も忘れられていたため）
   ・docs/draft/ 内、設計資料は docs/legacy/design/ へ移動、単純な下書きは削除
   ・docs/testing/ 内、テストfixture候補・CSS監査資料は docs/legacy/testing/ 及び
     docs/legacy/design/ へ移動、完了済み動作確認メモは削除
   ・docs/architecture/testdata.md は docs/legacy/ へ移動（現運用と乖離のため）
   ・handover_phase79_sprint2_1.md のarchive欠落を確認・解消
   ・docs/handover/archive/ が phase01-13〜phase71-80 の10フェーズ帯サブフォルダ
     構成になっていることを確認（過去チャットで既に実施済みと判明）

② docs/README.md 更新
   ・「ドキュメントの読み始め」節を新設（phase-status → current-issues →
     handover/active → architecture.mdの順）
   ・「ドキュメント運用」「ドキュメント分類」を役割分離して明記
   ・「一時作業ファイルの扱い」ルールを新設（統合/legacy保存/削除の三択を
     フェーズ終了時に必ず選ぶ）
   ・ディレクトリ構成図を現状に合わせて更新

③ architecture.md 更新
   ・§0 Overview 新設（全体図・設計の背骨・用語定義・読む順番の目安）
   ・§2 ディレクトリ構造の testdata/ 記載を docs/ へ修正
   ・§12 Analysis Editor Architecture 全面更新（Phase75〜79の実装を反映。
     Editor Session / Editing Commands / UI Projection / Decorator Layer の
     主要コンポーネント構成へ整理）
   ・§13 Authority Index 更新（Runtime Projectionを別表13.1として分離。
     Authority Indexは「唯一の正本」のみを掲載する方針を明記）
   ・§14 Search Engine 新設（Phase80の実装を反映）
   ・§13の「本セクション」誤記修正、冒頭のPhase進行表現削除

④ phase-status.md 更新
   ・「1. Current Status」「2. Major Milestones」「3. Future Candidates」
     「Appendix: Phase Timeline」の4部構成へ再編
   ・Phase01〜60を10フェーズ単位で折りたたみ化（さらに全体を1段ネストした
     detailsで包む）、Phase61〜80も同様に折りたたみ化
   ・Phase75〜80の実績を新規追加
   ・末尾に重複していた旧要約パラグラフ（Phase60〜74の「主な成果（参考）」）を削除

⑤ current-issues.md 更新
   ・「1. バックログ」「2. Current Issues」「3. UI改善」「4. 既知の技術的負債」
     「5. Future Features（新機能候補・ロードマップ）」の5部構成へ再編
   ・README `[CLOSE BY DELETION]` ルールに違反していた完了済み項目
     （約15件）を削除
   ・設計知見・教訓・確立済み仕様の説明（architecture.mdの役割に属する内容）
     を4件削除
   ・Analysis Editorの巨大な進捗管理エントリを解体（Phase80で機能完成のため）
   ・Phase75〜80のhandoverで積み残された項目を新規追加
   ・「範囲シフトが選択範囲外へ影響する疑い」「矢印キー範囲シフト対応」の
     2件は、Phase79 Sprint2-1で既に解決済みと判明したため削除
   ・CSS再構成（components.css肥大化）をバックログへ正式追加
   ・実機で新たに発見された2件のバグ（Blue themeフレット視認性・ダイアグラム
     登録モーダルが勝手に閉じる）と4件の新機能要望（Chart→Editor挿入・
     Chart/Editorシステム統合・Keyboard-first UI）を追加
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・CSS再構成の実施
  → バックログへの正式追加のみ。実装（components.css/theme.cssの再構成）は
    別フェーズとする。

・Future Featuresに追加した新機能・ロードマップ項目の実装
  → Capo-aware Editing、Chart↔Editorシステム統合、Keyboard-first UI等は
    いずれも記録のみ。設計着手は別フェーズ。

・プロジェクトルートの README.md 更新
  → docs/README.mdからスクリーンショット・プロジェクト紹介部分を分離する
    判断はしたが、ルートREADME.mdへの実際の反映は開発者側の作業として
    このチャット外で実施する。

・軽微なUI調整
  → 当初のPhase81スコープ案に含めていたが、ドキュメント整理の分量が
    想定より多くなったため今回は着手しなかった。

・current-issues.mdのUI改善セクションをCurrent Issuesへ統合するか
  → ChatGPTレビューで「統合しても自然」との指摘があったが、最終的に
    「変更必須ではない・好みの範囲」との結論のため現状維持とした。

・Roadmapの親子関係表現（コードブロック → 箇条書き/ASCIIツリー）の変更
  → ChatGPTレビューで「コードブロックはコードと誤認されうる」との指摘が
    あったが、文書表現の好みの範囲として今回は見送った。
```

---

## 4. Implementation（実装内容・事実）

| 変更 | 内容 | ファイル |
|---|---|---|
| ディレクトリ整理 | prompts削除・draft/testingの仕分け（legacy/design・legacy/testingへ移動 or 削除） | docs/ 配下 |
| README全面更新 | 読み始めガイド・運用/分類の分離・一時ファイル運用ルール新設 | docs/README.md |
| architecture.md全面更新 | §0新設・§12全面更新・§13更新（13.1新設）・§14新設・誤記修正 | docs/architecture/architecture.md |
| phase-status.md全面再構成 | 4部構成・Phase75〜80追加・折りたたみ化・重複要約削除 | docs/phase-status.md |
| current-issues.md全面再構成 | 5部構成・完了項目削除・設計知見の除去・新規課題/機能追加 | docs/current-issues.md |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] architecture.mdに§0 Overviewを新設し、用語定義をこのタイミングで確定する

```
結論:
  Authority / Projection / Derived Cache / Runtime Cache という用語の定義を、
  「将来必要になったら追加する」のではなく、今回（用語が3〜4個の段階）で
  §0に明記した。

理由（ChatGPTレビューで確定）:
  用語が増えてから定義集を作るより、少ないうちに整理する方が低コスト。
  architecture.mdが「詳細を調べる辞典」として優秀な一方、「初めて読む人の
  入口」として機能していなかった問題を解消する狙い。
```

### [判断] Authority IndexとRuntime Projectionを別表に分離する（§13）

```
結論:
  §13 Authority Indexには「唯一の正本」のみを掲載し、boundaryHandleChordId・
  editorMode・searchMatchIds等は「13.1 Runtime Projection」という別表に分離した。

理由（ChatGPTレビューで確定）:
  chartState.boundaryHandleChordId等をAuthority Indexに載せると、読んだ人が
  「これも正本なのか」と誤解する。selectionが唯一のAuthorityであり、これらは
  すべてselectionから導出されるProjectionに過ぎない。
  Phase79〜80で確立した「Authorityを増やさずProjectionを増やす」という
  設計思想を、ドキュメント構造自体にも反映した。
```

### [判断] phase-status.mdを「概要→機能索引→将来候補→付録(詳細履歴)」の4部構成にする

```
結論:
  古い構成（Phase0から順に読む年表形式）から、
  1. Current Status（30秒で読める現在地）
  2. Major Milestones（機能軸の索引。「Search Engineはいつ入った？」に即答）
  3. Future Candidates（Future Features / Technical Debt / Watch Listの3分類）
  Appendix: Phase Timeline（詳細履歴。10フェーズ単位で折りたたみ）
  という構成に変更した。

理由（ChatGPTレビューで複数ラウンド確定）:
  「今知りたいこと」と「歴史」を完全に分離する狙い。Timelineは「Phase67で
  何をやったか」を調べる時にだけ参照する付録であり、主役ではない。
  進行中のPhase81はFutureではなくCurrent Statusの「Current Work」に
  記載すべき、という指摘も反映（進行中フェーズと将来候補は別カテゴリ）。
```

### [判断] current-issues.mdを「Current Issues / Technical Debt / UI改善 / Future Features / Roadmap」に5分類する

```
結論:
  README `[FILE SCOPE INVARIANT]`（open issuesのみ保持）を実際に適用し、
  以下を実施した。
    - 完了済み項目（約15件）を削除（CLOSE BY DELETIONルールの適用）
    - 設計知見・確立済み仕様の説明（4件）をarchitecture.mdの役割として除去
    - 「バグ・既知の設計ギャップ」（Issue）と「新機能・将来構想」（Future
      Feature）を明確に分離
    - Future Featuresの中でも「次フェーズ候補」と「長期ロードマップ」を
      分離

理由（ChatGPTレビューで複数ラウンド確定）:
  以前のcurrent-issues.mdは「今困っていること」と「将来やりたいこと」が
  混在しており、README運用ルールとの整合性が取れていなかった。
  Analysis Editorの巨大な進捗管理エントリも、ドキュメント自身に明記されて
  いた「全項目完了後、このエントリごと削除する」という指示に従い解体した。
```

### [判断] 「Chart Modeと通常モードの双方向編集」はロードマップ側に一本化する

```
結論:
  Future Features側には「Chart→Editor（コード進行挿入）」という具体的な
  実装候補のみを残し、「Editor→Chart」「共通編集モデル」「モード統合」は
  ロードマップの「Chart Modeと通常モードのシステム統合」という親テーマの
  子要素として記載した。

理由（ChatGPTレビューで確定）:
  Editor→Chartまで実現すると完全な双方向同期になり、「誰がAuthorityか」
  （architecture.md §13）を再設計する必要が生じる大きなテーマ。
  Future Features側に重複して書くと責務が曖昧になるため、親子関係を
  ロードマップ側に集約した。
  「設計上の危険ポイント（Authority再設計が必要）をロードマップに明記して
  おく」ことで、将来この項目に着手する人（自分自身を含む）が「単なる
  UI追加ではない」と即座に理解できるようにした。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### current-issues.mdがREADMEの運用ルールに違反していたことの発見

```
今回のリファクタリング着手前、current-issues.mdを精査した結果、
README（docs/handover/README.md）で定めた [FILE SCOPE INVARIANT]
（open issuesのみ保持）・[CLOSE BY DELETION]（完了項目は削除する）に
違反し、「状態: 完了（PhaseXX）」のまま削除されずに残っていた項目が
15件以上見つかった。

また、「token utility追加時のimport audit（教訓）」「handover記録と
実コードの乖離（教訓）」「project identity lifecycle semantics
（確立済み）」等、README上「architecture.mdまたはREADME.mdの役割」と
明記されている設計知見・確立済み仕様の説明も混入していた。

これらはこのタイミングで発見・除去した。今後のフェーズ完了時のhandover
作成時、current-issues.mdへの追記が本当に「open issue」なのか、
「設計知見」や「完了報告」になっていないかを都度確認する必要がある。
```

### handover_phase79_sprint2_1.md のarchive欠落発見と解消の経緯

```
Phase81着手時のディレクトリ棚卸しで、docs/handover/archive/に
handover_phase79_sprint2_1.mdが存在しないことに気づいた
（sprint2_2は存在）。当初「本チャットにアップロードされた内容が
まだリポジトリに反映されていない」可能性を疑ったが、確認の結果、
過去の別チャットで既に発行・archive追加済みであったことが判明した。

Phase79 Sprint1 → Sprint2-1 → Sprint2-2という3段階の連続する
handoverの一部が欠けていないかを確認する価値があった事例として記録する。
```

### phase-status.mdの構造刷新は3ラウンドのレビューを経て確定した

```
① 初版: Phase0〜74を全て個別の###見出し+bulletで記載する従来形式を踏襲し、
   Phase75〜80を追加しただけの案を提示。
② ChatGPTレビュー1回目: 「Major Milestones（機能別マイルストーン）」の
   導入と、Phase Timelineの「付録」化を提案。
③ ChatGPTレビュー2回目: Current StatusからNextを削除し「進行中のPhaseは
   Futureではない」という区別、Future/Technical Debt/Watch Listの3分類、
   Appendix全体のさらなる折りたたみを提案。
最終的に4部構成・全面日本語併記の版に到達した。この経緯は、ドキュメントの
情報設計は一度で決まらず、複数回の「実際に読む立場」からのレビューを
経て磨かれるものだという実例になった。
```

---

## 7. Remaining Issues（残課題）

```
・プロジェクトルートのREADME.mdへのスクリーンショット・プロジェクト紹介部分の反映
  状態: 未実施（このチャット外の作業）
  内容: docs/README.mdから分離した前半部分（プロジェクト概要・スクリーンショット）を、
  プロジェクトルートのREADME.mdへ実際に反映する必要がある。既存の内容との
  重複確認も含め、開発者側で対応すること。

・軽微なUI調整
  状態: 未着手
  内容: 当初のPhase81スコープに含めていたが、ドキュメント整理の分量が
  想定より多くなったため見送った。次フェーズ以降で必要に応じて対応。

・current-issues.mdの新規発見バグ2件の調査
  状態: 未着手（次フェーズ候補）
  内容: Blue themeダイアグラム編集モーダルのフレット番号視認性、
  ダイアグラム登録モーダルが勝手に閉じる問題。詳細はcurrent-issues.md
  「Modal / Theme系」参照。

・current-issues.mdの表現上の微調整（好みの範囲・対応不要）
  内容: UI改善セクションをCurrent Issuesへ統合するか、Roadmapの親子関係を
  コードブロックから箇条書き/ASCIIツリーへ変更するか。いずれも
  ChatGPTレビューで「変更必須ではない」との結論。
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase82候補（優先順位未定・current-issues.md「5. Future Features」参照）:

最優先候補:
  ・Blue themeダイアグラム編集モーダルのフレット番号視認性の調査
  ・ダイアグラム登録モーダルが勝手に閉じる問題の再現条件特定

新機能候補（次フェーズ以降）:
  ・Chart Mode → Editor（コード進行の挿入）
  ・Keyboard-first UI（モード・タブ切替のショートカット化）
  ・Boundary Handleのドラッグ操作
  ・Capo-aware Editing

ロードマップ（大規模・独立フェーズ必須）:
  ・Chart Modeと通常モードのシステム統合
    （Authority再設計を伴う規模。着手前に必ず独立した設計フェーズを設けること）
  ・CSS再構成（components.css肥大化）
```

---

## 9. Files Changed（変更ファイル一覧）

```
docs/README.md
  ・全面更新（読み始めガイド・運用/分類の分離・一時ファイル運用ルール新設・
    ディレクトリ構成図更新）
  ・理由: 新構成・新ルールへの追従

docs/architecture/architecture.md
  ・§0 Overview 新設
  ・§2 ディレクトリ構造修正（testdata/ → docs/）
  ・§12 Analysis Editor Architecture 全面更新
  ・§13 Authority Index 更新（13.1 Runtime Projection新設）
  ・§14 Search Engine 新設
  ・冒頭のPhase進行表現削除・§13誤記修正
  ・理由: Phase75〜80の設計内容を正式反映するため

docs/phase-status.md
  ・全面再構成（4部構成・Phase75〜80追加・折りたたみ化）
  ・理由: 検索性向上・情報の重複排除

docs/current-issues.md
  ・全面再構成（5部構成・完了項目削除・新規課題/機能追加）
  ・理由: README運用ルールとの整合性確保・Issue/Feature分離

docs/legacy/
  ・testdata.md 追加（architecture/から移動）
  ・design/ 新設（grid実装設計仕様書.txt・grid実装設計議論プロンプト.txt・
    phase78-footer-redesign.md・参照一覧.txt・定義済み一覧.txt を格納）
  ・testing/ 新設（detect-beats-offload.txt・recognize-chords-offload.txt を格納）

docs/prompts/ 削除
docs/draft/ 削除（design該当分は legacy/design/ へ移動済み、残りは削除）
docs/testing/ 内の完了済み動作確認メモ・古い実データバックアップ 削除
  （10-1動作確認テスト.txt・phase5完了動作確認.txt・phase6test.txt・
  行フォーカスバグ修正動作確認1〜3.txt・chord.txt）
```

---

## 10. Micro Log

- ディレクトリ棚卸しの過程で、docs/handover/archive/handover_phase79_sprint2_1.md
  の欠落に一時気づいたが、既に過去チャットで解決済みと判明
- docs/draft・docs/testing内の各ファイルについて、「単なる下書き」か
  「設計資料として価値があるか」を1件ずつ中身を確認しながら仕分けた
  （grid実装設計仕様書等はChart Mode誕生の経緯を示す一次資料として
  legacy/design/へ、CSS変数の参照/定義dumpも同様に保存）
- README.md更新時、H1見出しが2つ（プロジェクト概要とドキュメント案内）
  混在している問題を発見し、docs/README.mdはドキュメント案内に専念する
  形へ整理（プロジェクト概要はルートREADME.mdの役割として分離）
- architecture.md更新は§12→§13→新設セクション→整合性チェックの順で
  段階的に進め、各ステップでChatGPTレビューを挟んだ
- phase-status.mdは3ラウンドのレビューを経て「概要→マイルストーン→
  将来候補→付録」の4部構成に収束した
- current-issues.mdはREADMEの運用ルール（open issues only・close by
  deletion）が実際には守られていなかったことを発見し、大幅な削除・
  再分類を実施。Issue/Technical Debt/UI改善/Future Features/Roadmapの
  5分類は複数ラウンドのレビューを経て確定
- 実機で新たに見つかった2件のバグ（Blue themeフレット視認性・
  ダイアグラム登録モーダル自動クローズ）と4件の機能要望
  （Chart→Editor挿入・双方向編集・システム統合・Keyboard-first UI）を
  現行の分類体系に沿って追加。「Chart↔Editor双方向編集」は
  Authority再設計を伴う大規模テーマと判断し、ロードマップの親テーマへ
  一本化した

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
