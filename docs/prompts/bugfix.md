バグ修正フィードバック指示テンプレ

これを そのままClaudeに貼って使えます。

① 修正対象
【対象機能】
例：ダイアグラム表示機能

【関連ファイル】
js/app.js
js/editor.js
js/chords.js
② 問題の概要
【現象】
例：
ダイアグラムをOFFにしてリロードすると、
ONに戻しても右パネルとホバー表示が更新されない。

【影響範囲】
・右パネルのダイアグラム
・コードホバーのポップアップ
③ 再現手順
1 ダイアグラムをOFFにする
2 中央パネルでコードを表示
3 ページをリロード
4 ダイアグラムをONにする
5 コードにホバー
④ 期待動作
OFF状態でもhoverイベントは登録される

OFF
↓
hover
↓
裏でダイアグラム生成

ON
↓
即座に右パネル表示
↓
hoverでポップアップ表示
⑤ 実際の動作
リロード後

hoverしても
setDiagRight() が呼ばれない

結果：
ダイアグラムが生成されない
⑥ 原因（調査結果）
editor.js hoverイベント内

tag.addEventListener('mouseenter', () => {
  if (!diagOn) return;

diagOn が false の場合

setDiagRight()
showPopup()

が実行されない。

そのため
ダイアグラム生成処理がスキップされる。


---

## ⑦ 修正方針


diagOn は

「表示制御のみ」

に使用する。

イベント登録
および
ダイアグラム生成

には影響させない。


---

## ⑧ 修正内容

修正前


tag.addEventListener('mouseenter', () => {
if (!diagOn) return;
setDiagRight(c.chord, capo);
showPopup(c.chord, tag);
});


修正後


tag.addEventListener('mouseenter', () => {
setDiagRight(c.chord, capo);
showPopup(c.chord, tag);
});


showPopup() 内で


if (!diagOn) return;


を行う。

---

## ⑨ テスト結果


テスト1
OFF → hover
右パネル変化 OK

テスト2
OFF → hover → ON
即表示 OK

テスト3
ON → hover → OFF
ポップアップ非表示 OK


---

## ⑩ Git情報


branch
fix/phase3-diagram-bug

commit
f583116


---

# Claudeへの最終確認

最後にこれを必ず付けます。


今回の修正で以下に問題が出ないか確認してください。

1 hoverイベントの多重登録
2 drawDiagramの過剰実行
3 diagram表示キャッシュの破壊