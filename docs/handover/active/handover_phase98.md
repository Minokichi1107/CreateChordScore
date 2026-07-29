# 引き継ぎ: Phase98完了 — Section Specification（仕様固定フェーズ）

> Phase98はコードを1行も書かない設計フェーズ（Design Freeze）である。
> 実装は行っておらず、`section-model.md` の仕様確定とドキュメント影響確認のみを行った。
> ChatGPTレビュー済み（Authority Scopeの表現・Section Invariants・
> UUID意味付け・Update責務の切り分け、複数回のレビューを反映済み）。

## 作業状態
- ブランチ: なし（コード変更なし。ドキュメントのみのフェーズ）
- 直前作業: Phase97完了（Selection Hit-Test統一 / Search Enharmonic対応）

---

## 1. Purpose（目的）

`section-model.md` §9「次にこのメモを開く時にやること」に積み残されていた
2つの未解決事項（境界コード増減ルール、正本問題）に回答し、Sectionサブシステムの
仕様を実装着手前に固定する。ロードマップ上は以下の位置づけ。

```
S. Section Specification（仕様固定・本フェーズ）
    ↓
A. Section Data Layer（実装・Phase99以降）
```

---

## 2. Scope（今回やったこと）

```
・Sectionデータモデルの正式化
    { id, type, name, startChordId, endChordId }
・境界コード増減時のルール確定（3ケース）
・Section Invariants（不変条件）の新設
・Authority Scopeの確定（Analysis Editor Session限定という表現）
・ライフサイクル仕様の確定（生成・更新・削除）
・Update責務の切り分け（責務はSession Layer・API設計はPhase99）
・section-model.md の最終版書き起こし（[DOCUMENT AUTHORITY]新設）
・architecture.mdへの影響箇所の洗い出し（反映はPhase99へ先送り）
・ドキュメント影響確認（README / architecture / phase-status /
  current-issues の4ファイルを個別に判定）
```

---

## 3. Out of Scope（今回はやらないと決めたこと）

```
・Section Data Layerの実装（Phase99以降）
    → 本フェーズはあくまで仕様固定。コード変更は一切行っていない。

・architecture.mdへの実際の反映
    → architecture.mdは「現在実装されている設計」のみを記載する方針
      （§0）のため、未実装のSectionをここに書くのは時期尚早と判断。
      影響箇所（§3/4/9/11/12/13）はsection-model.md §8に洗い出し済みで、
      Phase99着手時にそこから転記する。

・「Chart Modeと通常モードのシステム統合」への言及の深掘り
    → Authority Scope（§5）を「Analysis Editor Session限定」に
      留めたことで、この巨大テーマ（ロードマップ最上位）への
      本格的な言及は不要と判断した。

・5フェーズごとの定期棚卸し
    → 今回行ったのはPhase98限定のスコープを絞った影響確認であり、
      README.md運用ルールに定める定期棚卸し（次回はPhase93〜97分の
      予定）とは別物。定期棚卸しの負担は増やしていない。
```

---

## 4. Implementation（実装内容・事実）

本フェーズはドキュメントのみの変更。コード（js/css）の変更は一切ない。

| 変更 | 内容 | ファイル |
|---|---|---|
| データモデル確定 | `{ id, type, name, startChordId, endChordId }`。`id`は「Section Identity」と明記 | section-model.md §4.1 |
| 境界増減ルール確定 | 内部追加＝自動包含／境界削除＝隣接コードへ付け替え／0コード＝Section自体を削除 | section-model.md §4.3 |
| Invariants新設 | [SECTION INVARIANTS]（4条件）を新設 | section-model.md §4.4 |
| Authority Scope確定 | 「bufferが正本」ではなく「Analysis Editor Session限定のAuthority」という表現に確定 | section-model.md §5 |
| ライフサイクル確定 | 生成・更新（責務はSession Layer）・削除（明示/暗黙）を確定 | section-model.md §6 |
| DOCUMENT AUTHORITY新設 | 「唯一の正本」ではなく「設計判断を集約する設計ドキュメント」という表現で新設 | section-model.md 冒頭 |
| 影響箇所洗い出し | architecture.md §3/4/9/11/12/13への影響を洗い出し（反映はしない） | section-model.md §8 |

---

## 5. Design Decisions（設計判断・採用理由）

### [判断] 境界コード増減時、内部追加は無条件で自動包含する

```
結論:
  Section内部にコードが追加された場合、追加ロジックなしで自動的に
  Sectionの範囲に含まれる仕様とした。

理由:
  Sectionは startChordId〜endChordId の「区間」を表す定義であるため、
  「その間に存在するコードはすべてSection」という解釈が最もシンプルで
  例外がない。追加のたびにSection側で何か処理をする必要がない。
```

### [判断] 境界コード削除時は既存の「隣接再割り当てパターン」を転用する

```
結論:
  startChordId/endChordIdが削除された場合、削除位置に隣接する
  コードへ自動的に付け替える。Section内が0コードになった場合は
  Section自体を削除する。

理由:
  Analysis Editorには既に editPoint / boundaryHandleChordId という、
  「参照先が消えた時に隣へ再割り当てる」パターンの実績がある。
  Sectionもこれに倣うことで、プロジェクト全体の一貫性を保った。
```

### [判断] Authority Scopeは「buffer」ではなく「Analysis Editor Session」という単位で表現する（ChatGPTレビュー反映）

```
結論:
  「analysisEditor.bufferが正本」という実装詳細に基づく表現ではなく、
  「Analysis Editor Session（編集セッション）に限定されるAuthority」
  という、スコープに基づく表現を採用した。

理由:
  「bufferだから」と書くと、実装（JS変数名）にAuthorityの説明が
  紐づいてしまい、将来project.linesへ統合する判断のたびに文書の
  書き直しが必要になる。「編集セッション限定だから」という理由に
  しておけば、将来Project Repositoryへスコープが広がる場合も、
  「スコープが変わった」という1点の更新で済み、Authorityの
  所在の説明ロジック自体を作り直す必要がない。

  この判断は、実装が同じでも「Section Session Authorityの置き場所を
  差し替える」という将来像（buffer → Project Repository）を
  見据えたもの（ChatGPT提案）。
```

### [判断] Section Invariantsを新設し、既存Invariant群と同じ役割を持たせる（ChatGPTレビュー反映）

```
結論:
  データモデル・ライフサイクルとは別に、「Sectionが常に満たすべき
  4条件」を[SECTION INVARIANTS]として独立させた。

理由:
  データモデルやライフサイクルのルールだけでは、「このCommandの
  実装はSectionとして正しい状態を保っているか」を都度判断する
  基準がなかった。既存の[BOUNDARY INVARIANT]・
  [UNDO TRANSACTION INVARIANT]と同じ形式・同じ役割で用意する
  ことで、Phase99実装時の判断基準として機能させる。
```

### [判断] `id`フィールドに「Section Identity」という意味を明記する（ChatGPTレビュー反映）

```
結論:
  Sectionの`id`が、`project.id`や`chord._id`と同じ「Identity」を
  表すものであることをコメントとして明記した。

理由:
  このプロジェクトはIdentity（rename/move/duplicateを経ても
  同一性が維持される値）という概念を一貫して重視している。
  明記しておくことで、将来「複製時にidは新規発行するのか、
  引き継ぐのか」のような判断に迷わなくなる（新規発行が前提と
  なる、という解釈の土台になる）。
```

### [判断] §6 Updateは「責務の所在」と「API設計」を分けて記述する（ChatGPTレビュー反映）

```
結論:
  Sectionの更新（境界増減による自動更新を含む）の責務はSession
  Layerが持つ、とここで確定した。一方、具体的にどの関数が・
  どのタイミングでこの更新処理を呼び出すか（API設計）は
  Phase99で決定する、と明確に切り分けた。

理由:
  Phase98はDesign Freezeのフェーズであり、「まだ実装していないので
  何も決められない」と全てを先送りするのは、仕様固定フェーズとしては
  中途半端になる。境界増減がCommandの副作用として起きる以上、それ自体が
  独立したUndo単位にならないことは[UNDO TRANSACTION INVARIANT]から
  論理的に導けるため、責務の所在（Session Layer）まではこの時点で
  確定できると判断した。一方、実際の関数シグネチャや呼び出し経路は
  実装しながら決める方が安全なため、そこはPhase99に残した。
```

---

## 6. Findings（判明した知見・調査プロセスの記録）

### Phase94のhandoverに、current-issues.mdへの未反映の積み残しが存在していた

```
handover_phase94.md 末尾に、「current-issues.mdへ手動で追記すること」
という指示（Section Data Layer構想への言及）が残されていたが、
現物のcurrent-issues.mdを確認したところ、この追記が反映されていない
ことが判明した。今回のドキュメント影響確認（§7参照）でこの積み残しを
解消した。「実装した記憶はあるがドキュメントが古い」という
[ISSUE TRUTH SOURCE INVARIANT]が想定するズレのパターンと同種の
事象が、Section関連ドキュメントでも実際に発生していたことになる。
```

### 「唯一の正本」という表現が、既存のAuthority用語と衝突しかけた

```
section-model.mdをSection設計の集約先とする方針自体は早い段階で
決まったが、当初案の「[DOCUMENT AUTHORITY]＝唯一の参照先」という
書き方は、architecture.mdとの役割分担を曖昧にする可能性があった。
このプロジェクトの「Authority」はこれまで一貫して「状態（state）の
唯一の正本」という意味で使われてきたため、ドキュメントの集約先という
別の文脈にそのまま転用すると、将来「architecture.mdに書くべきか
section-model.mdに書くべきか」で解釈の衝突が起きうる、という
ChatGPTの指摘により、「設計判断を集約する設計ドキュメント」という
表現へ調整した。
```

---

## 7. Remaining Issues（残課題）

```
・architecture.mdへの実際の反映（Phase99着手時に実施）
  状態: 影響箇所の洗い出しのみ完了（section-model.md §8）
  内容: §3/4/9/11/12/13への反映は、Section Data Layerの実装が
  始まってから行う。

・Section更新のAPI設計（Phase99で決定）
  状態: 責務の所在（Session Layer）のみ確定
  内容: 具体的な関数シグネチャ・呼び出し経路は実装時に設計する。

・（Phase93より継続）pointercancel経路の未検証
  状態: 未対応（Section作業とは無関係の既存の積み残し。継続保持）
```

---

## 8. Next Phase（次フェーズ開始位置）

```
Phase99の候補: A. Section Data Layer（実装フェーズ）

着手時に行うこと:
  ・section-model.md §8の影響箇所を実際にarchitecture.mdへ反映
  ・Section更新のAPI設計（呼び出し経路）を確定させる
  ・[SECTION INVARIANTS]（§4.4）を満たすことをテスト観点に含める

他の候補（未確定）:
  ・Phase93〜97で見送ったB1/B3/A（クリック挙動統一の設計セッション）
  優先順位は次回セッション開始時に相談して決める。
```

---

## 9. Files Changed（変更ファイル一覧）

```
docs/section-model.md
  ・全面改訂（Phase94時点の草案から、Phase98仕様固定版へ）
  ・追加: [DOCUMENT AUTHORITY]・§4.3境界増減ルール・§4.4 Invariants・
    §5 Authority Scope（確定表現）・§6 ライフサイクル・§8 影響範囲・
    §9 議論ログ（Phase98分）
  ・理由: 本フェーズの主目的（仕様固定）

【本フェーズでは実施し、次回current-issues.md/phase-status.md編集時に
反映が必要な内容（このチャットからは直接ファイル編集不可のため）】

phase-status.md
  ・Completedへ「✓ Section Architecture Design（Phase98・Design
    Freeze。実装はPhase99以降）」を追加
  ・Phase Timelineへ Phase98 の詳細エントリを追加
  ・理由: 「調査/設計のみでコミットなし」というフェーズの記録
    （Phase91と同種のパターン）

current-issues.md
  ・Future Featuresの「Section Data Layer」項目を、Phase94時点の
    未反映指示から「状態: 仕様確定済み（Phase98）・実装未着手」へ更新
  ・理由: Phase94からの積み残し（§6 Findings参照）の解消
```

---

## 10. Micro Log

- Phase98は当初「境界コード増減ルール」「正本問題」の2論点のみで
  完結する想定だったが、ChatGPTとの往復で段階的にスコープが広がった:
  論点2（Authority Scope）→ 表現の精緻化 → ライフサイクル仕様追加 →
  ドキュメント棚卸し追加 → Invariants/UUID/Update責務の最終調整、
  という順で成果物が7項目から最終的に8項目相当まで拡張された
- Authority Scopeの表現は、「bufferが正本」→「Section Session
  Authorityをbuffer側に置く」→「Analysis Editor Session限定の
  Authority」という3段階の言い換えを経て確定した。実装（何を
  Authorityとして参照するか）は変わらないが、説明のロジックを
  「実装詳細ベース」から「スコープベース」へ変えることで、将来の
  文書更新コストを下げるという、設計そのものではなく
  「設計の説明の仕方」を最適化する珍しい種類の議論だった
- 「ドキュメント棚卸し」という言葉が、README.mdが定める定期棚卸し
  （5フェーズごと）と混同されそうになったため、「Phase98限定の
  影響確認」として明確に切り分けた
- [DOCUMENT AUTHORITY]の文言は、「唯一の正本」という強い表現から
  「設計判断を集約する設計ドキュメント」という表現へ、ChatGPTの
  指摘で1段階弱められた。このプロジェクトの「Authority」という
  用語が持つ既存の厳密な意味（stateの唯一の正本）を、ドキュメント
  管理という別の文脈へそのまま持ち込まないよう配慮した結果
- 全ての議論はコード変更を一切伴わないため、node --check等の
  検証手順は本フェーズでは不要だった

---

## current-issues.md更新（該当issueがある場合）

- 今回closeしたissue: なし
- 今回新規に積み残したissue: なし
  （§9 Files Changed に記載の通り、Phase94からの積み残しの「解消」
  であり、新規の積み残しは発生していない）

---

## 運用ルール（変わらず）
→ docs/handover/README.md 参照
