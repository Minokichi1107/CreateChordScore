# AllTogetherTimeCue --- Milestone Planning / M2開始 Handover（引き継ぎ）

## 1. この文書の目的

この文書は、AllTogetherTimeCueの現在地、これまでに確定したProduct
Intent（製品意図）・Design
Decision（設計判断）・Invariant（不変条件）、完了済みのTechnical
Feasibility Test（技術的成立性検証）、および次の開発段階を別Chat /
別AIエージェントへ引き継ぐための文書である。

単なる実装Task（タスク）の指示ではなく、「なぜこのプロジェクトを作るのか」「何を対象とし、何を対象としないのか」「現在どこまで確認済みなのか」を前提として、次の探索・設計を行うことを目的とする。

------------------------------------------------------------------------

## 2. Project / Product（プロジェクト・製品）

### Project / Product Name（プロジェクト・製品名）

**AllTogetherTimeCue**

### Concept（コンセプト）

> **All Together, at the Right Time.**\
> まとめて、ちょうどいいタイミングで。

このプロジェクトは、重いCalendar
App（カレンダーアプリ）を新しく作ることを目的としない。

中心目的は、生活の中に散らばる「忘れたくないこと」を集め、適切なタイミングで知らせること。

将来的にはSchedule（予定）、Task（タスク）、Timing（タイミング）、Notification（通知）、Context（状況）まで対象になる可能性がある。

ただし、将来機能は現時点で確定しない。

Weather-aware Notification（天候依存型通知）などのContext-aware
Notification（状況依存型通知）は将来候補であり、現在のMVP範囲ではない。

------------------------------------------------------------------------

## 3. Product Boundary（製品境界）

このプロジェクトでは、少なくとも以下の方向を重要な製品境界として扱う。

1.  Forgetting Prevention（忘却防止）
2.  Timing Support（タイミング支援）
3.  Schedule Synchronization（スケジュール同期）
4.  Cross-device Notification（端末横断通知）

ただし、これらをすべて現時点で実装するという意味ではない。

「技術的にできること」から機能を増やすのではなく、「ユーザーが必要としていること」に対して必要最小限の技術を使う。

------------------------------------------------------------------------

## 4. Schedule Source（予定データの供給元）

### Design Decision（設計判断）

**Google Calendarを唯一の外部Schedule
Source（予定データの供給元）とする。**

Jorteとの直接連携は行わない。

現在の実運用は、

``` text
Jorte
  ↓
Google Calendar
  ↓
AllTogetherTimeCue
```

である。

Jorteでは通常の予定をGoogle Calendarへ登録する運用になっており、Google
Calendar Webから予定を確認できることを実機確認済み。

### Rationale（理由）

このツールが必要としているのはJorte固有のUIや機能ではなく、予定そのものである。

Jorte固有の連携を実装すると、依存・追加実装・保守負担・移行困難が発生する。

したがって、「Jorteに対応する」のではなく、「Google
Calendarに対応する」と定義する。

### Invariant（不変条件）

> Jorteを別のCalendar
> Client（カレンダークライアント）に置き換えても、予定がGoogle
> Calendarに存在する限り、AllTogetherTimeCueの核心機能は成立する。

Jorte直接連携を勝手に追加しないこと。

------------------------------------------------------------------------

## 5. 完了済み：M0 Project Foundation（プロジェクト基盤）

**PASS / 完了**

実施済み：

-   Project / Product Name決定
-   ローカル開発環境構築
-   `localhost:8000` で動作確認
-   Git初期化
-   GitHub Repository（リポジトリ）作成
-   `main` ブランチ
-   `origin/main` への接続
-   Initial commit（初回コミット）
-   GitHubへのPush（プッシュ）

GitHub Repository：

**AllTogetherTimeCue**

Initial commit：

``` text
d82fdaf Initial commit
```

確認済みの状態：

``` text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

------------------------------------------------------------------------

## 6. 完了済み：M1 Calendar Feasibility（カレンダー技術成立性）

**PASS / 完了**

### 目的

Google Calendar
APIから、自分の予定をAllTogetherTimeCueへ取得できるかを確認する。

### 実施済み

-   Google Cloud Project作成
-   Google Calendar API有効化
-   OAuth設定
-   Web Application用OAuth Client ID作成
-   Authorized JavaScript Origins設定
-   `http://localhost:8000` を登録
-   OAuth Scopeとして `calendar.readonly` を使用
-   Google Identity Services（Google認証サービス）Token Clientを使用
-   Browser-only（ブラウザのみ）構成
-   `localhost:8000` でローカルWebアプリを起動
-   Googleアカウントで認証・許可
-   Google Calendar APIを呼び出し
-   実際のGoogle Calendar上の今後の予定を取得
-   タイトル・開始日時・終了日時を画面表示

### 使用した最小API条件

``` text
calendarId: primary
timeMin: 現在時刻
maxResults: 1
singleEvents: true
orderBy: startTime
```

### 成功条件

> 認証後、Google Calendar
> APIから今後の予定を1件取得し、タイトル・開始・終了を表示できること。

→ **PASS**

したがって、

> **「Google Calendar APIが利用可能か？」というTechnical
> Feasibility（技術的成立性）の問いは終了している。**

同じ成立性を再確認することを目的に、M1の実験を繰り返さない。

------------------------------------------------------------------------

## 7. M1で確定しているTechnical Boundary（技術境界）

今回の最小実験では、以下を採用した。

-   Browser-only
-   Google Identity Services Token Client
-   OAuth Scope `calendar.readonly`
-   Access Tokenはメモリ上のみ
-   Client Secret（クライアントシークレット）をブラウザ側に埋め込まない
-   認証情報を永続保存しない
-   Backend（バックエンド）は導入していない
-   DB（データベース）は導入していない
-   Sync（同期）は実装していない
-   Webhookは実装していない
-   Push Notification（プッシュ通知）は実装していない
-   Eventの作成・変更・削除は実装していない
-   Jorte連携は実装していない

重要：

> 今回のBrowser-only構成が、製品全体で最終的に採用されることまで決定したわけではない。

認証状態維持・同期・Webhook・通知などが必要になった時点で、Backend等を再検討する。

------------------------------------------------------------------------

## 8. Current Milestone（現在のマイルストーン）

# M2 Schedule Handling（予定の扱い）

以前は「M2 Schedule
Integration（予定統合）」と呼んでいたが、現時点では「Integration（統合）」を実装前提にしてしまわないため、

**Schedule Handling（予定の扱い）**

とする。

M2の目的は、Google Calendarの予定を「取得できる」状態から、

> **AllTogetherTimeCueにとって、予定とは何か**

を明らかにすること。

まだ実装方針は確定していない。

------------------------------------------------------------------------

## 9. M2 Task候補

### M2-1 必要なSchedule情報の整理

現在の最小実験で扱ったのは主に、

-   title / summary
-   start
-   end

である。

AllTogetherTimeCueとして本当に必要なEvent
Resource（予定データ）の最小集合を整理する。

検討候補：

-   単発予定
-   終日予定
-   定期予定
-   時刻・タイムゾーン
-   キャンセル
-   Event ID（予定識別子）
-   更新日時
-   その他のEvent Resource項目

ただし、最初から「全部必要」と決めない。

Product Intentから必要性を判断する。

------------------------------------------------------------------------

### M2-2 Schedule Model（予定モデル）の検討

Google Calendar Event Resourceをそのままアプリ内部で扱うのか、

``` text
Google Calendar Event
        ↓
そのまま利用
```

とするのか、

``` text
Google Calendar Event
        ↓
Schedule Adapter（予定変換層）
        ↓
AllTogetherTimeCue Schedule
```

のように内部Schedule Model（予定モデル）を持つのかを検討する。

Adapter（変換層）を導入すること自体を目的にしない。

必要性が確認されるまで、抽象化を増やさない。

------------------------------------------------------------------------

### M2-3 Schedule取得範囲の検討

現在の実験は、

> 現在時刻以降の予定を最大1件

だった。

次に、

-   どの期間を扱うのか
-   何件必要なのか
-   過去の予定を扱う必要があるのか
-   定期予定をどう扱うのか
-   一覧表示が必要なのか

などをProduct Intentから検討する。

API仕様から必要機能を逆算しない。

------------------------------------------------------------------------

### M2-4 Import / Sync（取り込み・同期）の必要性検討

ここでは、

> **AllTogetherTimeCueにとって、本当にSyncが必要なのか？**

を先に考える。

Syncが必要と判定された場合に初めて、

-   Background Processing（バックグラウンド処理）
-   Refresh Token（リフレッシュトークン）
-   Webhook
-   Backend
-   DB

などの技術を検討する。

これらを先に導入しない。

------------------------------------------------------------------------

### M2-5 Schedule UI（予定UI）

必要なSchedule情報と内部での扱い方が整理された後、必要最小限のUIを作る。

UIを先に作ることを目的にしない。

------------------------------------------------------------------------

## 10. M3以降の候補

以下は候補地図であり、現時点では仕様確定しない。

``` text
M3 Notification Core（通知コア）
    ↓
M4 Cross-device Notification（端末横断通知）
    ↓
M5 Task / Timing Support（タスク・タイミング支援）
    ↓
M6 Context-aware Notification（状況依存型通知）
```

これらは将来の候補であり、現在のM2設計から詳細仕様を決めない。

------------------------------------------------------------------------

## 11. Development Process（開発プロセス）

今後も以下の工程を基本とする。

``` text
User Intent
 ↓
Exploration（探索）
 ↓
Technical Design（技術設計）
 ↓
Risk Check（リスク確認）
 ↓
Implementation（実装）
 ↓
Validation（検証）
 ↓
Review / Handover（レビュー・引き継ぎ）
```

重要なのは、Milestone（マイルストーン）が変わったからといって、すぐImplementation（実装）へ進まないこと。

M2-1もまずExploration（探索）から始める。

------------------------------------------------------------------------

## 12. 重要な設計原則

### Why（なぜ）

機能や技術を採用する前に、「それはユーザーにとって何のために必要なのか」を確認する。

### Boundary（境界）

現在のTaskの範囲を越えて、AIエージェントが勝手に機能・アーキテクチャを拡張しない。

### Invariant（不変条件）

以下を勝手に変更しない。

1.  Google Calendarを唯一の外部Schedule Sourceとする。
2.  Jorteへの直接依存を作らない。
3.  技術的可能性だけを理由に機能を追加しない。
4.  小さな実験結果だけから将来の大規模アーキテクチャを確定しない。
5.  必要性が確認される前にBackend / DB / Sync / Webhook等を導入しない。
6.  必要性が確認される前にSchedule Adapter等の抽象化を増やさない。
7.  M2ではまず「予定とは何か」を整理し、その結果から実装範囲を決める。

------------------------------------------------------------------------

## 13. AIエージェントへの作業方針

AIエージェントは、以下の順序で作業する。

``` text
目的理解
 ↓
境界理解
 ↓
現在地確認
 ↓
公式資料確認
 ↓
Exploration（探索）
 ↓
Technical Design（技術設計）
 ↓
Risk Check（リスク確認）
 ↓
Implementation（実装）
 ↓
Validation（検証）
```

特に、

> **「技術的に可能」＝「実装すべき」ではない。**

ことを維持する。

また、設計判断については、

-   Why（なぜ必要か）
-   Boundary（どこまでか）
-   Invariant（何を変えてはいけないか）

を明確にする。

------------------------------------------------------------------------

## 14. 次Chatでの開始地点

次ChatではM2を開始する。

ただし、いきなりコードを書かない。

最初のテーマは、

> **「AllTogetherTimeCueがGoogle
> Calendarの予定を扱うために、本当に何が必要なのか？」**

である。

まずM2-1を中心にExploration（探索）を行う。

必要に応じてGoogle Calendar Event
Resourceの公式仕様を確認するが、APIに存在するフィールドをすべて採用する方向には進めない。

探索の結果を整理した後、

1.  User Intent
2.  必要なSchedule情報
3.  Schedule Modelの必要性
4.  取得範囲
5.  Syncの必要性
6.  Risk Check

を確認し、その後に初めてImplementation（実装）Taskを決める。

------------------------------------------------------------------------

## 15. 現在のプロジェクト状態 --- Summary（要約）

``` text
Product
  AllTogetherTimeCue
  "All Together, at the Right Time."

Schedule Source
  Google Calendarのみ
  Jorte直接連携なし

M0 Project Foundation
  PASS

M1 Calendar Feasibility
  PASS
  Google Calendar APIから実予定を取得・表示済み

GitHub
  Repository: AllTogetherTimeCue
  Branch: main
  Remote: origin/main
  Initial commit: d82fdaf
  Working tree: clean

Current Milestone
  M2 Schedule Handling

Next Focus
  M2-1 必要なSchedule情報の整理

Current Process
  User Intent
  → Exploration
  → Technical Design
  → Risk Check
  → Implementation
  → Validation
  → Review / Handover
```

------------------------------------------------------------------------

## 16. 最後に

このプロジェクトでは、

> **「できるから作る」のではなく、「必要だから作る」。**

を基本原則とする。

M1では「Google Calendar
APIが使えるか」という技術的な不確実性を解消した。

M2では、その技術を使って何を作るべきなのかを整理する。

したがって、M1の成功をそのまま「複数予定取得機能の実装開始」と解釈しない。

**M2の最初の仕事は、実装ではなく、予定をAllTogetherTimeCueの中でどう扱うべきかを明らかにすることである。**
