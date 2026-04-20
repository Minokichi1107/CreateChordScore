Phase5実施計画（修正版）
了解しました。イベント移動のみに集中します。

📋 Phase5実施内容（確定）
Phase5
├ capo event 移動
├ TAP events 移動
└ keydown 移動
方針:

✅ イベント登録の場所を移動するのみ
❌ 状態アクセサは導入しない
❌ ロジックは一切変更しない
❌ 変数参照方法も変更しない


🎯 Phase5-1: capo event 移動
現状確認
現在の場所: app.jsトップレベル（グローバルスコープ）
現在のコード:
javascriptdocument.getElementById('capo').addEventListener('change',()=>{
  const newCapo=parseInt(document.getElementById('capo').value)||0;
  const diff=newCapo-_prevCapo;
  if(diff===0)return;
  const semitones=-diff;
  project.lines.forEach(line=>{
    line.chords.forEach(c=>{
      if(c.type==='sep')return;
      c.chord=transposeChord(c.chord,semitones);
    });
  });
  palette=palette.map(ch=>transposeChord(ch,semitones));
  renderPalette();
  refreshEditor();
  _prevCapo=newCapo;
  autoSaveLocal();
  const cur=document.getElementById('diag-in').value.trim();
  if(cur) showDiagramPanel(cur, getCapo());
  toast(`カポ${newCapo}: 全コードを${Math.abs(diff)}半音${diff>0?'下':'上'}に移調`);
});

移動先
setupEventHandlers()内の配置位置:
javascriptfunction setupEventHandlers() {
  // ============================================
  // File Events
  // ============================================
  document.getElementById('file-chord').addEventListener(...)
  document.getElementById('file-audio').addEventListener(...)
  
  // ============================================
  // Palette Events
  // ============================================
  document.getElementById('pal-filter').addEventListener(...)
  document.getElementById('custom-add').addEventListener(...)
  document.getElementById('custom-in').addEventListener(...)
  
  // ============================================
  // Import Events
  // ============================================
  document.getElementById('btn-import').addEventListener(...)
  document.getElementById('btn-append').addEventListener(...)
  document.getElementById('btn-clearall').addEventListener(...)
  
  // ============================================
  // Editor Events
  // ============================================
  document.getElementById('add-line-btn').addEventListener(...)
  
  // ============================================
  // Project Events
  // ============================================
  document.getElementById('btn-save').addEventListener(...)
  document.getElementById('btn-saveas').addEventListener(...)
  document.getElementById('btn-open').addEventListener(...)
  document.getElementById('file-project').addEventListener(...)
  document.getElementById('btn-new').addEventListener(...)
  
  // ============================================
  // Diagram Events
  // ============================================
  const diagToggleBtn = document.getElementById('diag-toggle');
  diagToggleBtn.addEventListener(...)
  document.getElementById('diag-in').addEventListener(...)
  const _diagBtn=document.getElementById('btn-add-diag');
  if(_diagBtn)_diagBtn.addEventListener(...)
  
  // ============================================
  // Capo Events  ← ここに追加
  // ============================================
  document.getElementById('capo').addEventListener('change',()=>{
    const newCapo=parseInt(document.getElementById('capo').value)||0;
    const diff=newCapo-_prevCapo;
    if(diff===0)return;
    const semitones=-diff;
    project.lines.forEach(line=>{
      line.chords.forEach(c=>{
        if(c.type==='sep')return;
        c.chord=transposeChord(c.chord,semitones);
      });
    });
    palette=palette.map(ch=>transposeChord(ch,semitones));
    renderPalette();
    refreshEditor();
    _prevCapo=newCapo;
    autoSaveLocal();
    const cur=document.getElementById('diag-in').value.trim();
    if(cur) showDiagramPanel(cur, getCapo());
    toast(`カポ${newCapo}: 全コードを${Math.abs(diff)}半音${diff>0?'下':'上'}に移調`);
  });
}

作業手順
ステップ1: 元の場所からコードを切り取り
app.jsのトップレベルから
document.getElementById('capo').addEventListener... の部分を削除
ステップ2: setupEventHandlers()の末尾に貼り付け
上記の位置に貼り付け
ステップ3: 動作確認
□ ブラウザでリロード
□ capo値を変更（0→2）
□ コードが転調されることを確認
□ ダイアグラムパネルが更新されることを確認
□ consoleエラーがないことを確認
ステップ4: commit
bashgit add app.js
git commit -m "Phase5-1: Move capo change event to setupEventHandlers"
git push

🎯 Phase5-2: TAP events 移動
移動対象（12個）
TAPオーバーレイ関連:
javascript1. document.getElementById('btn-tapmode').addEventListener('click', openTapMode);
2. document.getElementById('btn-tapmode-close').addEventListener('click', closeTapMode);
3. document.getElementById('tov-play-btn').addEventListener('click', ...)
4. document.getElementById('tov-m5').addEventListener('click', ...)
5. document.getElementById('tov-speed').addEventListener('input', ...)
シークバー:
javascript6. const tovSeekIn = document.getElementById('tap-ov-seek-in');
   tovSeekIn.addEventListener('mousedown', ...)
7. tovSeekIn.addEventListener('mouseup', ...)
8. tovSeekIn.addEventListener('input', ...)
audio要素:
javascript9. aEl.addEventListener('timeupdate', updateTovTime);
10. aEl.addEventListener('play', ...)
11. aEl.addEventListener('pause', ...)
TAPボタン:
javascript12. const tovTapBtn = document.getElementById('tap-ov-tapbtn');
    tovTapBtn.addEventListener('click', ...)

移動先
javascriptfunction setupEventHandlers() {
  // ... 既存のイベント ...
  
  // ============================================
  // Capo Events
  // ============================================
  document.getElementById('capo').addEventListener(...)
  
  // ============================================
  // TAP Mode Events
  // ============================================
  
  // TAP オーバーレイ ON/OFF
  document.getElementById('btn-tapmode').addEventListener('click', openTapMode);
  document.getElementById('btn-tapmode-close').addEventListener('click', closeTapMode);
  
  // TAP オーバーレイ内 再生コントロール
  document.getElementById('tov-play-btn').addEventListener('click', () => {
    if (!aEl.src) return;
    aEl.paused ? aEl.play() : aEl.pause();
  });
  
  document.getElementById('tov-m5').addEventListener('click', () => {
    aEl.currentTime = Math.max(0, aEl.currentTime - 5);
  });
  
  document.getElementById('tov-speed').addEventListener('input', e => {
    const pct=parseInt(e.target.value);
    setSpeed(pct);
  });
  
  // TAP オーバーレイ内 シークバー
  const tovSeekIn = document.getElementById('tap-ov-seek-in');
  tovSeekIn.addEventListener('mousedown', () => tovSeeking = true);
  tovSeekIn.addEventListener('mouseup', () => {
    tovSeeking = false;
    aEl.currentTime = (tovSeekIn.value / 1000) * (aEl.duration || 0);
  });
  tovSeekIn.addEventListener('input', () => {
    if (!tovSeeking) return;
    const pct = tovSeekIn.value / 10;
    document.getElementById('tap-ov-seek-fill').style.width = pct + '%';
  });
  
  // メインaElのイベント（TAPオーバーレイ同期用）
  aEl.addEventListener('timeupdate', updateTovTime);
  aEl.addEventListener('play', () => {
    document.getElementById('tov-play-btn').textContent = '⏸';
  });
  aEl.addEventListener('pause', () => {
    document.getElementById('tov-play-btn').textContent = '▶';
  });
  
  // TAPボタン
  const tovTapBtn = document.getElementById('tap-ov-tapbtn');
  tovTapBtn.addEventListener('click', () => {
    if (!aEl.src) return;
    const t = aEl.currentTime;
    let idx = tovFocusIdx;
    if (idx < 0 || idx >= project.lines.length) {
      idx = project.lines.findIndex(l => l.time == null);
    }
    if (idx < 0) idx = 0;
    if (idx < project.lines.length) {
      project.lines[idx].time = parseFloat(t.toFixed(3));
      tovFocusIdx = idx + 1;
      renderTovLines();
      autoSaveLocal();
      const rows = document.querySelectorAll('.tap-ov-line');
      if (rows[idx]) {
        rows[idx].classList.add('tov-tapped');
        setTimeout(() => rows[idx].classList.remove('tov-tapped'), 350);
      }
      if (tovFocusIdx < project.lines.length && rows[tovFocusIdx]) {
        const area = document.getElementById('tap-ov-lines');
        const nextEl = rows[tovFocusIdx];
        const top = nextEl.offsetTop;
        const h = area.clientHeight;
        if (top > area.scrollTop + h * 0.6) {
          area.scrollTo({ top: top - h * 0.35, behavior: 'smooth' });
        }
      }
    }
    tovTapBtn.classList.add('tapping');
    setTimeout(() => tovTapBtn.classList.remove('tapping'), 150);
  });
}

作業手順（1イベントずつ）
ステップ2-1: btn-tapmode
□ 元の場所から切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（TAPモードON/OFF）
□ commit: "Phase5-2-1: Move btn-tapmode event"
ステップ2-2: btn-tapmode-close
□ 元の場所から切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（TAPモード閉じる）
□ commit: "Phase5-2-2: Move btn-tapmode-close event"
ステップ2-3: tov-play-btn
□ 元の場所から切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（TAPオーバーレイ内再生）
□ commit: "Phase5-2-3: Move tov-play-btn event"
ステップ2-4: tov-m5
□ 元の場所から切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（-5秒）
□ commit: "Phase5-2-4: Move tov-m5 event"
ステップ2-5: tov-speed
□ 元の場所から切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（速度変更）
□ commit: "Phase5-2-5: Move tov-speed event"
ステップ2-6〜8: tovSeekIn（3つまとめて移動可）
□ const tovSeekIn = ... の定義ごと切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（シークバー操作）
□ commit: "Phase5-2-6: Move tovSeekIn events (mousedown/mouseup/input)"
ステップ2-9〜11: aEl events（3つまとめて移動可）
□ aEl.addEventListener('timeupdate', ...) 
□ aEl.addEventListener('play', ...) 
□ aEl.addEventListener('pause', ...) 
□ setupEventHandlers()に貼り付け
□ 動作確認（再生中のTAPオーバーレイ同期）
□ commit: "Phase5-2-7: Move aEl events (timeupdate/play/pause)"
ステップ2-12: tovTapBtn
□ const tovTapBtn = ... の定義ごと切り取り
□ setupEventHandlers()に貼り付け
□ 動作確認（TAPボタンで時刻セット）
□ commit: "Phase5-2-8: Move tovTapBtn event"

🎯 Phase5-3: keydown 移動
移動対象（1個）
javascriptdocument.addEventListener('keydown', e => {
  if (!document.getElementById('tap-overlay').classList.contains('open')) return;
  if (e.code === 'Space') { e.preventDefault(); tovTapBtn.click(); }
  if (e.code === 'ArrowLeft') aEl.currentTime = Math.max(0, aEl.currentTime - 5);
  if (e.code === 'ArrowRight') aEl.currentTime = Math.min(aEl.duration || 0, aEl.currentTime + 5);
  if (e.code === 'Escape') closeTapMode();
});

移動先
javascriptfunction setupEventHandlers() {
  // ... 既存のイベント ...
  
  // ============================================
  // TAP Mode Events
  // ============================================
  // ... TAPモード関連イベント ...
  
  // ============================================
  // Global Keyboard Events
  // ============================================
  document.addEventListener('keydown', e => {
    if (!document.getElementById('tap-overlay').classList.contains('open')) return;
    if (e.code === 'Space') { e.preventDefault(); tovTapBtn.click(); }
    if (e.code === 'ArrowLeft') aEl.currentTime = Math.max(0, aEl.currentTime - 5);
    if (e.code === 'ArrowRight') aEl.currentTime = Math.min(aEl.duration || 0, aEl.currentTime + 5);
    if (e.code === 'Escape') closeTapMode();
  });
}
注意点:

tovTapBtnへの参照が必要
Phase5-2-12でtovTapBtnを移動済みなので、この時点でスコープ内に存在


作業手順
ステップ3-1: keydown移動
□ 元の場所から切り取り
□ setupEventHandlers()の末尾に貼り付け
□ 動作確認:
  - TAPモードを開く
  - Spaceキーで時刻セット
  - ←→キーでシーク
  - Escキーで閉じる
□ commit: "Phase5-3: Move global keydown event for TAP mode"

✅ Phase5完了条件
以下が全て満たされたら完了:
□ capo changeイベントがsetupEventHandlers内に存在
□ TAP関連イベント12個がsetupEventHandlers内に存在
□ keydownイベントがsetupEventHandlers内に存在
□ app.jsトップレベルにイベント登録が残っていない
□ DOMContentLoaded内にイベント登録が残っていない
  （setupEventHandlers()呼び出しとその他の初期化処理のみ）
□ 全機能が正常動作
  - capo変更
  - TAPモード ON/OFF
  - TAP実行（Spaceキー含む）
  - シークバー操作
  - 再生同期
□ consoleエラーなし
□ 全commitが完了

📊 Phase5実施後の状態
setupEventHandlers()の構成:
setupEventHandlers() {
  // File Events (2個)
  // Palette Events (3個)
  // Import Events (3個)
  // Editor Events (1個)
  // Project Events (5個)
  // Diagram Events (3個)
  // Capo Events (1個)        ← Phase5-1で追加
  // TAP Mode Events (12個)   ← Phase5-2で追加
  // Global Keyboard Events (1個) ← Phase5-3で追加
}
合計: 31個のイベント
行数: 約300〜350行（推定）

🎬 Phase5開始
準備確認:

✅ Phase4動作確認完了
✅ Gitステータスクリーン
✅ イベント移動のみ実施（ロジック変更なし）

Phase5-1から開始してください。
何か不明点があればすぐに質問してください。1ステップずつ慎重に進めましょう。