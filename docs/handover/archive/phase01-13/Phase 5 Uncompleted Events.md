Phase5 残作業（修正版）
1️⃣ Replace UI イベント

ファイル

js/app.js

行

920  document.getElementById('rb-find').addEventListener('input',...)
921  document.getElementById('rb-replace').addEventListener('input',...)
922  document.getElementById('rb-all').addEventListener('change',...)
923  document.getElementById('rb-focus').addEventListener('change',...)
925  document.getElementById('rb-next').addEventListener('click',...)
932  document.getElementById('rb-prev').addEventListener('click',...)
939  document.getElementById('rb-one').addEventListener('click',...)
957  document.getElementById('rb-all-btn').addEventListener('click',...)
980  document.getElementById('rb-undo').addEventListener('click',...)
990  document.getElementById('rb-close').addEventListener('click',...)
998  document.getElementById('btn-replace-open').addEventListener('click',...)

対応

setupEventHandlers() に移動
（まだなら）
2️⃣ プロジェクトメタ入力

ファイル

js/app.js

行

1066 document.getElementById('project-title').addEventListener('input', autoSaveLocal)
1067 document.getElementById('proj-key').addEventListener('input', autoSaveLocal)
1068 document.getElementById('proj-bpm').addEventListener('input', autoSaveLocal)

対応

setupEventHandlers()へ
3️⃣ HTML onclick 削除

ファイル

index.html

行

33 <button id="audio-btn" onclick="document.getElementById('file-audio').click()">
38 <button id="chord-btn" onclick="document.getElementById('file-chord').click()">

修正

HTML

<button id="audio-btn">
<button id="chord-btn">

JS（setupEventHandlers）

document.getElementById('audio-btn').addEventListener('click',()=>{
  document.getElementById('file-audio').click();
});

document.getElementById('chord-btn').addEventListener('click',()=>{
  document.getElementById('file-chord').click();
});
4️⃣ btnAddDiagBottom

btnAddDiagBottom.addEventListener('click'

行

app.js 1401

これが setupEventHandlers外なら移動対象です。

移動不要（Claudeに触らせない）

以下は 正しい位置にあるイベントなので移動禁止です。

動的DOM
btn.addEventListener
row.addEventListener
timeEl.addEventListener
dx.addEventListener
モーダル
mkMBtn
mOv.addEventListener
setTimeout(...addEventListener)
別モジュール
js/editor.js
js/audio.js