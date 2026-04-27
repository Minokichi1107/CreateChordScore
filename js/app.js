/**
 * ════════════════════════════════════════
 * ChordScore Editor - Main Application
 * ════════════════════════════════════════
 * 
 * 【アプリケーション構造】
 * 
 * app.js (このファイル)
 *  - アプリ全体の統合・調整
 *  - Global State管理
 *  - イベントハンドラー集約
 *  - モーダル制御
 *  - TAPモード制御
 * 
 * chords.js
 *  - コードデータベース
 *  - ダイアグラム描画
 *  - カポ転調
 * 
 * editor.js
 *  - 譜面UI描画（renderLines）
 *  - 行ハイライト
 *  - スクロール制御
 * 
 * audio.js
 *  - 音声再生制御
 *  - TAP入力
 *  - 再生位置同期
 * 
 * project.js
 *  - プロジェクト保存/読み込み
 *  - シリアライズ/デシリアライズ
 * 
 * csvImporter.js
 *  - CSV/JSONパース
 * 
 * 【データフロー】
 * 
 * 1. ユーザー操作
 *     ↓
 * 2. Event Handler (setupEventHandlers)
 *     ↓
 * 3. State更新 (project, focLine, etc.)
 *     ↓
 * 4. 再描画トリガー (refreshEditor / renderTovLines)
 *     ↓
 * 5. UI反映 (renderLines / DOM更新)
 * 
 * 【責務配置ルール】
 * 
 * app.jsに置くもの:
 *  - Global State
 *  - setupEventHandlers
 *  - モーダル制御
 *  - TAPモード制御
 *  - State初期化（resetProject）
 * 
 * app.jsに置かないもの:
 *  - DOM描画ロジック → editor.js
 *  - コード変換 → chords.js
 *  - 音声制御 → audio.js
 *  - ファイルI/O → project.js
 */

// ════════════════════════════════════════
// IMPORTS
// ════════════════════════════════════════
import {
  CHORD_DB,
  CHORD_DB_BUILTIN_KEYS,
  drawDiagram,
  lookupChord,
  showDiagramPanel,
  setDiagRight,
  diagKey,
  diagKeyDecode,
  saveCustomDiagrams,
  loadCustomDiagrams,
  transposeRoot,
  transposeChord,
  showCapoInfo,
  normChord
} from './chords.js';

import {
  serializeProject,
  deserializeProject,
  saveProjectToFile,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage
} from './project.js';

import {
  initAudioEngine,
  fmt,
  setSpeed,
  flashLine,
  getAudioElement,
  setAudioSource
} from './audio.js';

import {
  mkLine,
  addChordToLine,
  highlightLine,
  scrollEditorToRow,
  renderLines
} from './editor.js';

import {
  parseCSV,
  parseJSON
} from './csvImporter.js';

// ════════════════════════════════════════
// GLOBAL STATE
// ════════════════════════════════════════
/**
 * アプリケーション全体の状態管理
 * 
 * 【責務】
 * - プロジェクトデータ（lines, title, audio, etc.）
 * - UIフォーカス状態（focLine, tapIdx, tovFocusIdx）
 * - Audio要素とURL管理
 * - モーダル/ポップアップDOM参照
 * - 置換バー状態
 * 
 * 【データフロー】
 * State更新 → refreshEditor/renderTovLines → UI反映
 * 
 * 【ルール】
 * - 直接変更可能だが、resetProject()で初期化推奨
 */

// プロジェクトデータ
let project = {title:'',audio:'',capo:0,lines:[],chord_source:''};
let palette = [];
let focLine = -1;

// Audio関連
const aEl = document.getElementById('audio-el');
let _aURL = null;
let tapIdx = -1;

// UI状態
let diagOn = true;
let _prevCapo = 0;

// ファイル保存
let _fileHandle = null;

// モーダル要素
const mOv = document.getElementById('modal-ov');
const mTit = document.getElementById('m-title');
const mBody = document.getElementById('m-body');
const mBtns = document.getElementById('m-btns');

// ポップアップ
const popEl = document.getElementById('popup');
let popT = null;

// TAPモードオーバーレイ
let tovFocusIdx = -1;
let tovSeeking = false;
let tovTapBtn = null;

// コード置換バー
let rbSnapshot = null;
let rbHits = [];
let rbCurr = -1;

// 自動保存タイマー
let asT = null;

// トーストタイマー
let toastT = null;

// ----------------------------
// HELPER FUNCTIONS
// ----------------------------
function getCapo(){return parseInt(document.getElementById('capo').value)||0;}

// ════════════════════════════════════════
// AUDIO ENGINE（初期化はDOMContentLoadedで実行）
// ════════════════════════════════════════

// ════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════

function loadChordData(data,filename){
  project.chord_source=filename;
  const b=document.getElementById('chord-btn');b.textContent=filename;b.classList.add('loaded');
  const all=(data.chords||[]).filter(c=>c&&c!=='N');
  palette=[...new Set(all)];
  window._cn=data.chords||[];window._ct=data.times||[];
  // tempo・keyがあれば自動入力（空欄の場合のみ上書き）
  if(data.tempo){const bpmEl=document.getElementById('proj-bpm');if(!bpmEl.value)bpmEl.value=Math.round(data.tempo);}
  if(data.key){const keyEl=document.getElementById('proj-key');if(!keyEl.value)keyEl.value=data.key;}
  renderPalette();document.getElementById('pal-count').textContent=palette.length;
  toast(`コード読み込み: ${palette.length}種`+(data.tempo?` / ${Math.round(data.tempo)}BPM`:'')+(data.key?` / ${data.key}`:''));
  checkReloadBannerDone();
}

function checkReloadBannerDone(){
  const banner=document.getElementById('reload-banner');
  if(!banner)return;
  const audioOk=aEl.src&&aEl.src!==window.location.href;
  const chordOk=palette.length>0||!project.chord_source;
  if(audioOk&&chordOk)banner.remove();
}

// ════════════════════════════════════════
// PALETTE
// ════════════════════════════════════════
function renderPalette(){
  const filter=document.getElementById('pal-filter').value.toLowerCase();
  const c=document.getElementById('chord-pal');
  const filtered=palette.filter(ch=>ch.toLowerCase().includes(filter));
  c.innerHTML='';
  if(!filtered.length){c.innerHTML='<div style="color:var(--text3);font-size:11px;font-family:var(--mono)">なし</div>';return;}
  filtered.forEach(chord=>{
    const btn=document.createElement('button');btn.className='pal-chord';btn.textContent=chord;
    btn.addEventListener('click',()=>handleAddChordToLine(chord));
    btn.addEventListener('mouseenter',()=>setDiagRight(chord, getCapo()));
    c.appendChild(btn);
  });
}

// ════════════════════════════════════════
// LINE MANAGEMENT（editor.js wrapper）
// ════════════════════════════════════════

// renderLines用のコールバック設定を生成
// ════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════
/**
 * エディタUI制御とコールバック
 * 
 * 【責務】
 * - editor.jsへのコールバック提供
 * - State → UI State変換（getEditorUIState）
 * - 再描画トリガー（refreshEditor, callRenderLines）
 * 
 * 【データフロー】
 * ユーザー操作 → Callback → State更新 → refreshEditor → renderLines → UI
 */

function createEditorCallbacks() {
  return {
    onTimeClick: (idx, time) => {
      if (time != null) {
        aEl.currentTime = time;
        if (aEl.paused) aEl.play();
        toast(`▶ ${fmt(time, true)} にシーク`);
      } else {
        openTimeModal(idx);
      }
    },
    onTimeContextMenu: (idx) => {
      openTimeModal(idx);
    },
    onChordEdit: (idx, ci) => {
      openChordEdit(idx, ci);
    },
    onAddChord: (idx) => {
      openAddChord(idx);
    },
    onRepeatClick: (idx) => {
      openRepeatModal(idx);
    },
    onRepeatDelete: (idx) => {
      project.lines[idx].repeat = null;
      refreshEditor();
    },
    onChordDelete: (idx, ci) => {
      project.lines[idx].chords.splice(ci, 1);
      refreshEditor();
    },
    onSepClick: (idx, ci) => {
      project.lines[idx].chords.splice(ci, 1);
      refreshEditor();
    },
    onSepInsert: (idx, ci) => {
      project.lines[idx].chords.splice(ci + 1, 0, { type: 'sep' });
      refreshEditor();
    },
    onLineInsert: (idx) => {
      project.lines.splice(idx, 0, mkLine());
      refreshEditor();
    },
    onLineDelete: (idx) => {
      project.lines.splice(idx, 1);
      refreshEditor();
    },
    onLyricFocus: (idx) => {
      focLine = idx;
      tapIdx = idx;
    },
    onLineClick: (idx) => {
      // 通常モード: focLineを更新
      focLine = idx;
      tapIdx = idx;
      
      // UI更新（autoSaveなし）
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
      
      // 歌詞inputにフォーカス
      setTimeout(() => {
        const inputs = document.querySelectorAll('.lyric-input');
        if (inputs[idx]) {
          inputs[idx].focus();
        }
      }, 0);
    },
    onLyricInput: (idx, value) => {
      project.lines[idx].lyric = value;
      autoSaveLocal();
    },
    onLyricEnter: (idx) => {
      project.lines.splice(idx + 1, 0, mkLine());
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
      setTimeout(() => {
        const ins = document.querySelectorAll('.lyric-input');
        if (ins[idx + 1]) ins[idx + 1].focus();
      }, 0);
    },
    onLyricBackspace: (idx) => {
      project.lines.splice(idx, 1);
      refreshEditor();
      setTimeout(() => {
        const ins = document.querySelectorAll('.lyric-input');
        if (ins[Math.max(0, idx - 1)]) ins[Math.max(0, idx - 1)].focus();
      }, 0);
    },
    onTapSet: (idx) => {
      tapIdx = idx;
      toast(`次のTAPで行${idx + 1}に時刻セット`);
    },
    onCopyClick: (idx) => {
      openCopyModal(idx);
    },
    setDiagRight: (chord, capo) => {
      setDiagRight(chord, capo);
    },
    showPopup: (chord, element) => {
      showPopup(chord, element);
    },
    hidePopup: () => {
      hidePopup();
    },
    updateStatus: () => {
      updateStatus();
    },
    toast: (msg) => {
      toast(msg);
    }
  };
}

// renderLinesのUI状態を生成
function getEditorUIState() {
  return {
    focLine,
    tapIdx,
    diagOn,
    capo: getCapo(),
    fmt
  };
}

// エディタを再描画
function refreshEditor() {
  renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
  autoSaveLocal();
}

// エディタを再描画（自動保存なし）
function callRenderLines() {
  renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
}

// コード追加（パレットから）
function handleAddChordToLine(chord) {
  const result = addChordToLine(chord, project.lines, focLine, {
    onLinesChange: () => {
      renderLines(project.lines, getEditorUIState(), createEditorCallbacks());
    }
  });
  
  focLine = result.focLine;
  
  if (result.needsRender) {
    refreshEditor();
  }
  
  setTimeout(() => {
    const ins = document.querySelectorAll('.lyric-input');
    if (ins[focLine]) ins[focLine].focus();
  }, 0);
}

// ════════════════════════════════════════
// LYRIC IMPORT
// ════════════════════════════════════════

// ════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════
function closeMod(){mOv.classList.remove('open');mBody.innerHTML='';mBtns.innerHTML='';}
mOv.addEventListener('click',e=>{if(e.target===mOv)closeMod();});
function mkMBtn(txt,cls,fn){const b=document.createElement('button');b.className=`mbtn ${cls||''}`;b.textContent=txt;b.addEventListener('click',fn);return b;}

// 時刻モーダル
function openTimeModal(idx){
  const line=project.lines[idx];
  mTit.textContent=`行${idx+1}の時刻を設定`;
  mBody.innerHTML=`
    <div style="margin-bottom:8px;color:var(--text2);font-size:12px;font-family:var(--mono)">「${line.lyric||'(空)'}」</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input type="number" id="mi-t" class="mi" value="${line.time!=null?line.time.toFixed(3):''}" step="0.1" min="0" placeholder="秒 (例: 12.500)" style="font-size:13px">
      <button id="mi-t-current" class="sm-btn" style="white-space:nowrap">▶ 現在位置</button>
    </div>`;
  
  // 現在位置ボタンのイベント登録
  setTimeout(() => {
    const currentBtn = document.getElementById('mi-t-current');
    if (currentBtn) {
      currentBtn.addEventListener('click', () => {
        document.getElementById('mi-t').value = aEl.currentTime.toFixed(3);
      });
    }
  }, 0);
  
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  mBtns.appendChild(mkMBtn('時刻を削除','del',()=>{project.lines[idx].time=null;refreshEditor();closeMod();}));
  mBtns.appendChild(mkMBtn('セット','ok',()=>{const v=parseFloat(document.getElementById('mi-t').value);if(!isNaN(v)){project.lines[idx].time=v;refreshEditor();}closeMod();}));
  mOv.classList.add('open');
  setTimeout(()=>{const el=document.getElementById('mi-t');if(el)el.focus();},80);
}

function addToPaletteIfNew(chord){
  if(chord&&chord!=='N'&&!palette.includes(chord)){
    palette.push(chord);
    renderPalette();
    document.getElementById('pal-count').textContent=palette.length;
  }
}

// コード追加モーダル
function openAddChord(idx){
  mTit.textContent=`行${idx+1} コードをまとめて追加`;

  function renderModalPreview(){
    const line=project.lines[idx];
    const previewEl=document.getElementById('mac-preview');
    if(!previewEl)return;
    previewEl.innerHTML='';
    if(!line.chords.length){
      previewEl.innerHTML='<span style="color:var(--text3);font-family:var(--mono);font-size:11px">(コードなし)</span>';
      return;
    }
    line.chords.forEach((c,ci)=>{
      if(c.type==='sep'){
        const s=document.createElement('span');
        s.style.cssText='color:var(--text3);font-family:var(--mono);font-size:16px;padding:0 3px;cursor:pointer;';
        s.textContent='/';s.title='クリックで削除';
        s.addEventListener('click',()=>{project.lines[idx].chords.splice(ci,1);refreshEditor();renderModalPreview();});
        previewEl.appendChild(s);
      } else {
        const tag=document.createElement('span');
        tag.style.cssText='display:inline-flex;align-items:center;gap:3px;background:var(--chord-bg);border:1.5px solid var(--chord-border);border-radius:4px;color:#c8e4ff;font-family:var(--mono);font-size:12px;font-weight:700;padding:3px 5px 3px 8px;cursor:default;';
        const nm=document.createElement('span');nm.textContent=c.chord;
        const dx=document.createElement('span');
        dx.textContent='✕';
        dx.style.cssText='font-size:13px;color:rgba(160,180,210,.5);cursor:pointer;padding:1px 3px;border-radius:2px;';
        dx.addEventListener('mouseenter',()=>dx.style.background='var(--red)');
        dx.addEventListener('mouseleave',()=>dx.style.background='');
        dx.addEventListener('click',()=>{project.lines[idx].chords.splice(ci,1);refreshEditor();renderModalPreview();});
        tag.appendChild(nm);tag.appendChild(dx);
        previewEl.appendChild(tag);
      }
    });
  }

  function addChord(ch){
    if(!ch)return;
    addToPaletteIfNew(ch);
    project.lines[idx].chords.push({chord:ch,offset:0});
    refreshEditor();
    renderModalPreview();
    // 入力欄をクリア＆フォーカス
    const inp=document.getElementById('mac-input');
    if(inp){inp.value='';inp.focus();}
  }

  function addSep(){
    project.lines[idx].chords.push({type:'sep'});
    refreshEditor();
    renderModalPreview();
  }

  const palHtml=palette.length
    ?`<div style="margin-top:8px"><div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:5px">楽曲のコードから選択:</div>
       <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:110px;overflow-y:auto">
         ${palette.map(c=>`<button class="pal-chord" style="font-size:11px" onclick="_mac_add('${c.replace(/'/g,"\\'").replace(/\//g,'\\/')}')">${c}</button>`).join('')}
       </div></div>`
    :'';

  mBody.innerHTML=`
    <div style="margin-bottom:8px">
      <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:5px">現在のコード:</div>
      <div id="mac-preview" style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:6px;background:var(--bg3);border-radius:var(--radius);align-items:center"></div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <input type="text" id="mac-input" class="mi" placeholder="コード名 (例: Am7)" autocomplete="off"
        style="font-size:15px;letter-spacing:1px;flex:1">
      <button id="mac-add-btn" class="sm-btn green" style="white-space:nowrap;font-size:13px">追加</button>
      <button id="mac-sep-btn" class="sm-btn" style="white-space:nowrap;font-size:13px" title="小節線を追加">／</button>
    </div>
    ${palHtml}
  `;

  window._mac_add=(ch)=>addChord(ch);

  document.getElementById('mac-add-btn').addEventListener('click',()=>{
    const v=document.getElementById('mac-input').value.trim();
    addChord(v);
  });
  document.getElementById('mac-sep-btn').addEventListener('click',()=>addSep());

  renderModalPreview();

  mBtns.appendChild(mkMBtn('完了','ok',closeMod));
  mOv.classList.add('open');
  setTimeout(()=>{
    const inp=document.getElementById('mac-input');
    if(inp){
      inp.focus();
      inp.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();addChord(inp.value.trim());}
        if(e.key==='Escape'){closeMod();}
      });
      inp.addEventListener('input',()=>{
        const v=inp.value.trim();
        if(v) setDiagRight(v, getCapo());
      });
    }
  },80);
}

// コード編集モーダル
function openChordEdit(idx,ci){
  const c=project.lines[idx].chords[ci];
  mTit.textContent='コードを編集';
  mBody.innerHTML=`<input type="text" id="mi-c" class="mi" value="${c.chord}" style="font-size:18px;letter-spacing:2px" autocomplete="off">`;
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  mBtns.appendChild(mkMBtn('削除','del',()=>{project.lines[idx].chords.splice(ci,1);refreshEditor();closeMod();}));
  mBtns.appendChild(mkMBtn('更新','ok',()=>{
    const v=document.getElementById('mi-c').value.trim();
    if(v){addToPaletteIfNew(v);project.lines[idx].chords[ci].chord=v;refreshEditor();}
    closeMod();
  }));
  mOv.classList.add('open');
  setTimeout(()=>{const el=document.getElementById('mi-c');if(el){el.focus();el.select();el.addEventListener('keydown',e=>{if(e.key==='Enter')mBtns.querySelector('.ok').click();});el.addEventListener('input',()=>setDiagRight(el.value, getCapo()));}},80);
}

// リピートモーダル
function openRepeatModal(idx){
  const line=project.lines[idx];
  let cnt=line.repeat?line.repeat.count:2;
  mTit.textContent=`行${idx+1}のリピート設定`;
  mBody.innerHTML=`
    <div style="margin-bottom:10px;color:var(--text2);font-size:12px;font-family:var(--mono)">イントロ・リフなどの繰り返し回数を設定します</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:12px">
      <button id="r-minus" class="sm-btn" style="font-size:22px;padding:4px 14px;line-height:1">−</button>
      <div style="text-align:center">
        <div id="r-cnt" style="font-family:var(--mono);font-size:40px;font-weight:700;color:var(--amber);min-width:64px;text-align:center">${cnt}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">回繰り返し</div>
      </div>
      <button id="r-plus" class="sm-btn" style="font-size:22px;padding:4px 14px;line-height:1">＋</button>
    </div>
    <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
      ${[2,3,4,8,16].map(n=>`<button class="pal-chord" style="font-size:13px" onclick="_sr(${n})">${n}回</button>`).join('')}
    </div>`;
  window._sr=(n)=>{cnt=n;document.getElementById('r-cnt').textContent=n;};
  document.getElementById('r-minus').addEventListener('click',()=>{cnt=Math.max(2,cnt-1);document.getElementById('r-cnt').textContent=cnt;});
  document.getElementById('r-plus').addEventListener('click',()=>{cnt++;document.getElementById('r-cnt').textContent=cnt;});
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  if(line.repeat)mBtns.appendChild(mkMBtn('リピート削除','del',()=>{project.lines[idx].repeat=null;refreshEditor();closeMod();}));
  mBtns.appendChild(mkMBtn('セット','ok',()=>{project.lines[idx].repeat={count:cnt};refreshEditor();closeMod();}));
  mOv.classList.add('open');
}

// コードコピーモーダル
function openCopyModal(fromIdx){
  const line=project.lines[fromIdx];
  if(!line.chords.length){toast('コードがありません');return;}
  mTit.textContent=`行${fromIdx+1}のコードをコピー`;
  const prev=line.chords.map(c=>`<span class="chord-tag" style="pointer-events:none"><span>${c.chord}</span></span>`).join('');
  const rows=project.lines.map((l,i)=>i===fromIdx?'':
    `<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg3);border-radius:4px;cursor:pointer">
      <input type="checkbox" data-to="${i}" style="width:15px;height:15px;accent-color:var(--accent)">
      <span style="font-family:var(--mono);font-size:11px;color:var(--text3);flex-shrink:0">行${i+1}</span>
      <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.lyric||'(空)'}</span>
      ${l.chords.length?`<span style="font-size:10px;color:var(--chord-text);font-family:var(--mono)">[${l.chords.map(c=>c.chord).join(' ')}]</span>`:''}
    </label>`
  ).join('');
  mBody.innerHTML=`
    <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:5px">コピー元:</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;padding:7px;background:var(--bg3);border-radius:6px;margin-bottom:8px">${prev}${line.repeat?`<span class="repeat-badge" style="pointer-events:none">× ${line.repeat.count}回</span>`:''}</div>
    <div style="font-size:11px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">コピー先（複数選択可）:</div>
    <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px" id="copy-list">${rows}</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;padding:5px 0;border-top:1px solid var(--border)">
      <input type="checkbox" id="copy-repeat" ${line.repeat?'checked':''} style="width:14px;height:14px;accent-color:var(--amber)">
      <span style="font-size:11px;font-family:var(--mono);color:var(--amber)">リピート記号もコピーする</span>
      <span style="font-size:10px;color:var(--text3);font-family:var(--mono)">${line.repeat?`(× ${line.repeat.count}回)`:'(元行にリピートなし)'}</span>
    </label>
    <div style="margin-top:4px;font-size:10px;color:var(--text3);font-family:var(--mono)">「追記」= コードを既存の後ろに追加　「上書き」= コード・リピートを置き換え</div>`;
  const doCopy=replace=>{
    const cbs=document.querySelectorAll('#copy-list input:checked');
    if(!cbs.length){toast('コピー先を選択してください');return;}
    const src=line.chords.map(c=>({...c}));
    const copyRepeat=document.getElementById('copy-repeat').checked;
    cbs.forEach(cb=>{
      const ti=parseInt(cb.dataset.to);
      project.lines[ti].chords=replace?src.map(c=>({...c})):[...project.lines[ti].chords,...src.map(c=>({...c}))];
      if(copyRepeat&&line.repeat){project.lines[ti].repeat={...line.repeat};}
      else if(replace&&!copyRepeat){/* 上書き時はリピートを変えない */}
    });
    refreshEditor();closeMod();toast(`${cbs.length}行に${replace?'上書き':'追記'}${copyRepeat&&line.repeat?' (リピート込み)':''}しました`);
  };
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  mBtns.appendChild(mkMBtn('上書き','am',()=>doCopy(true)));
  mBtns.appendChild(mkMBtn('追記','ok',()=>doCopy(false)));
  mOv.classList.add('open');
}

// ダイアグラム手動登録モーダル
function openAddDiagramModal(defaultChord=''){
  mTit.textContent='ギターダイアグラムを手動登録';
  mBody.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">コード名</div>
        <input type="text" id="dd-n" class="mi-sm" value="${defaultChord}" placeholder="例: Cadd9" style="text-align:center;font-size:14px;letter-spacing:1px">
      </div>
      <div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">ポジション名</div>
        <input type="text" id="dd-v" class="mi-sm" value="カスタム" placeholder="ロー/バレー等">
      </div>
    </div>
    <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:6px">各弦のフレット番号（6弦=低音側 → 1弦=高音側）<br><span style="color:var(--amber)">−1=ミュート　0=開放　1〜22=フレット番号</span></div>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px">
      ${['6弦','5弦','4弦','3弦','2弦','1弦'].map((s,i)=>`
        <div style="text-align:center">
          <div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-bottom:3px">${s}</div>
          <input type="number" id="dd-f${i}" value="0" min="-1" max="22"
            style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--mono);font-size:16px;padding:5px 2px;text-align:center"
            oninput="_pd()">
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:14px;align-items:start">
      <div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">セーハ（0=なし）</div>
        <input type="number" id="dd-b" value="0" min="0" max="22"
          style="width:68px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--mono);font-size:14px;padding:5px;text-align:center"
          oninput="_pd()">
      </div>
      <div style="flex:1;text-align:center">
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-bottom:4px">プレビュー</div>
        <div id="dd-prev" style="display:flex;justify-content:center"></div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:10px;color:var(--text3);font-family:var(--mono)">※ 登録はブラウザを閉じるまで有効です</div>`;
  window._pd=()=>{
    const fr=Array.from({length:6},(_,i)=>parseInt(document.getElementById(`dd-f${i}`)?.value)||0);
    const br=parseInt(document.getElementById('dd-b')?.value)||0;
    const el=document.getElementById('dd-prev');if(el)el.innerHTML=drawDiagram(fr,br||null);
  };
  setTimeout(window._pd,50);
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  mBtns.appendChild(mkMBtn('登録','ok',()=>{
    const name=document.getElementById('dd-n').value.trim();
    const vname=document.getElementById('dd-v').value.trim()||'カスタム';
    if(!name){toast('コード名を入力してください');return;}
    const fr=Array.from({length:6},(_,i)=>parseInt(document.getElementById(`dd-f${i}`).value)||0);
    const br=parseInt(document.getElementById('dd-b').value)||0;
    const variant={n:vname,f:fr,b:br||undefined,_custom:true};
    if(!CHORD_DB[name])CHORD_DB[name]={v:[]};
    const ei=CHORD_DB[name].v.findIndex(vr=>vr.n===vname);
    if(ei>=0)CHORD_DB[name].v[ei]=variant;else CHORD_DB[name].v.push(variant);
    saveCustomDiagrams();
    showDiagramPanel(name, getCapo());document.getElementById('diag-in').value=name;
    closeMod();toast(`✅ "${name}" (${vname}) を登録・保存しました`);
  }));
  mOv.classList.add('open');
  setTimeout(()=>{const el=document.getElementById('dd-n');if(el){el.focus();el.select();}},80);
}

// ════════════════════════════════════════
// HOVER POPUP
// ════════════════════════════════════════
function showPopup(chord,anchor){
  if(!diagOn)return;
  clearTimeout(popT);
  const r=lookupChord(chord);if(!r)return;
  document.getElementById('pop-name').textContent=chord;
  const pv=document.getElementById('pop-vars');pv.innerHTML='';
  r.data.v.slice(0,3).forEach(vr=>{
    const d=document.createElement('div');d.style.textAlign='center';
    d.innerHTML=`<div style="font-size:9px;color:var(--text3);font-family:var(--mono);margin-bottom:3px">${vr.n}</div>${drawDiagram(vr.f,vr.b||null)}`;
    pv.appendChild(d);
  });
  const rect=anchor.getBoundingClientRect();
  popEl.style.left=rect.left+'px';popEl.style.top=(rect.top-10)+'px';
  popEl.classList.add('show');
  requestAnimationFrame(()=>{
    const pr=popEl.getBoundingClientRect();
    if(pr.top<8)popEl.style.top=(rect.bottom+8)+'px';
    if(pr.right>window.innerWidth-8)popEl.style.left=(window.innerWidth-pr.width-8)+'px';
    if(pr.left<8)popEl.style.left='8px';
  });
}
function hidePopup(){popT=setTimeout(()=>popEl.classList.remove('show'),150);}

// ════════════════════════════════════════
// SAVE / LOAD（File System Access API対応）
// ════════════════════════════════════════

function getUIState() {
  return {
    title: document.getElementById('project-title').value,
    capo: parseInt(document.getElementById('capo').value) || 0,
    key: document.getElementById('proj-key').value.trim(),
    tempo: parseInt(document.getElementById('proj-bpm').value) || 0,
  };
}

async function saveProject(forceNew = false) {
  const uiState = getUIState();
  const projectData = serializeProject(project, uiState);
  const result = await saveProjectToFile(projectData, _fileHandle, forceNew);

  if (result.success) {
    _fileHandle = result.fileHandle;
    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('st-save').textContent = result.fileName + ' ' + timestamp;
    toast(`💾 保存: ${result.fileName}`);
    autoSaveLocal();
    
    // フォールバック時のダウンロード処理（result.blobが存在する場合）
    if (result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } else if (result.error && result.error.name !== 'AbortError') {
    toast('保存エラー: ' + result.error.message);
  }
}


function showReloadBanner(audioName, chordName){
  // 既存バナーを削除
  const old=document.getElementById('reload-banner');if(old)old.remove();
  const banner=document.createElement('div');
  banner.id='reload-banner';
  banner.style.cssText='background:rgba(255,184,64,.12);border:1px solid var(--amber);border-radius:var(--radius);padding:8px 10px;margin:0 0 8px;font-size:11px;font-family:var(--mono);color:var(--amber);';
  banner.innerHTML=`
    <div style="margin-bottom:5px;font-weight:600">📂 ファイルを再選択してください</div>
    ${audioName?`<div style="margin-bottom:3px;color:var(--text2)">音声: ${audioName}
      <button onclick="document.getElementById('file-audio').click()" style="margin-left:6px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer;font-family:var(--mono);font-size:10px;padding:2px 6px;">選択</button>
    </div>`:''}
    ${chordName?`<div style="color:var(--text2)">コード: ${chordName}
      <button onclick="document.getElementById('file-chord').click()" style="margin-left:6px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;color:var(--text2);cursor:pointer;font-family:var(--mono);font-size:10px;padding:2px 6px;">選択</button>
    </div>`:''}
    <button onclick="document.getElementById('reload-banner').remove()" style="margin-top:5px;background:none;border:none;color:var(--text3);cursor:pointer;font-family:var(--mono);font-size:10px;padding:0">✕ 閉じる</button>
  `;
  // editor-areaの先頭に挿入
  const ea=document.getElementById('editor-area');
  ea.insertBefore(banner, ea.firstChild);
}

// ════════════════════════════════════════
// STATE MANAGEMENT
// ════════════════════════════════════════
/**
 * プロジェクト状態の初期化と管理
 * 
 * 【責務】
 * - State完全リセット（resetProject）
 * - プロジェクト読み込み（loadProj）
 * - UI状態の保存/復元
 * 
 * 【データフロー】
 * resetProject/loadProj → State更新 → refreshEditor → UI反映
 * 
 * 【使用箇所】
 * - New Project
 * - Load Project
 * - Project読み込み時
 */

/**
 * プロジェクト状態を完全にリセット
 * New Project / Load Project の共通処理
 */
function resetProject() {
  // Project Data
  project = {
    title: '',
    audio: '',
    capo: 0,
    lines: [],
    chord_source: ''
  };
  
  palette = [];
  window._cn = [];
  window._ct = [];
  _fileHandle = null;
  
  // Audio State
  if (_aURL) {
    URL.revokeObjectURL(_aURL);
    _aURL = null;
  }
  aEl.src = '';
  aEl.pause();
  aEl.currentTime = 0;
  
  // Focus State
  focLine = -1;
  tapIdx = -1;
  tovFocusIdx = -1;
  
  // UI Reset
  document.getElementById('project-title').value = '';
  document.getElementById('capo').value = 0;
  document.getElementById('proj-key').value = '';
  document.getElementById('proj-bpm').value = '';
  document.getElementById('diag-in').value = '';
  
  const lyricTa = document.getElementById('lyric-ta');
  if (lyricTa) lyricTa.value = '';
  
  const audioBtn = document.getElementById('audio-btn');
  const chordBtn = document.getElementById('chord-btn');
  
  audioBtn.textContent = 'クリックして選択';
  audioBtn.classList.remove('loaded');
  
  chordBtn.textContent = 'JSON / CSV';
  chordBtn.classList.remove('loaded');
  
  const tapBtn = document.getElementById('tap-btn');
  if (tapBtn) tapBtn.disabled = true;
  
  const linesCont = document.getElementById('lines-cont');
  if (linesCont) linesCont.innerHTML = '';
  
  const reloadBanner = document.getElementById('reload-banner');
  if (reloadBanner) reloadBanner.remove();
}

// ════════════════════════════════════════
// PROJECT OPERATIONS
// ════════════════════════════════════════

function loadProj(data){
  // Reset existing state
  resetProject();
  
  const { project: newProject, uiState } = deserializeProject(data);
  
  // Apply UI state
  document.getElementById('project-title').value = uiState.title;
  document.getElementById('capo').value = uiState.capo;
  document.getElementById('proj-key').value = uiState.key;
  document.getElementById('proj-bpm').value = uiState.tempo;
  _prevCapo = uiState.capo;
  
  // Apply project data
  project.audio = newProject.audio;
  project.capo = uiState.capo;  // ← 追加
  project.chord_source = newProject.chord_source;
  project.lines = (newProject.lines || []).map(l => mkLine(l.lyric || '', l.time ?? null, l.chords || [], l.repeat || null));
  
  // Update file buttons
  const audioBtn = document.getElementById('audio-btn');
  const chordBtn = document.getElementById('chord-btn');
  
  if (newProject.audio) {
    audioBtn.textContent = newProject.audio;
    audioBtn.classList.add('loaded');
  }
  
  if (newProject.chord_source) {
    chordBtn.textContent = newProject.chord_source;
    chordBtn.classList.add('loaded');
  }
  
  refreshEditor();
  
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if (curDiagChord) {
    showDiagramPanel(curDiagChord, getCapo());
  }
}

// ════════════════════════════════════════
// TAP MODE OVERLAY
// ════════════════════════════════════════
/**
 * TAPモードオーバーレイ制御
 * 
 * 【責務】
 * - TAPモードの開閉
 * - TAPオーバーレイ内の行描画（renderTovLines）
 * - 再生位置同期（syncTovPlayer, updateTovTime）
 * 
 * 【State】
 * - tovFocusIdx: TAPモード内のフォーカス行
 * - tovSeeking: シーク中フラグ
 * - tovTapBtn: TAPボタンDOM参照
 * 
 * 【データフロー】
 * TAP操作 → project.lines更新 → renderTovLines → UI反映
 */

function openTapMode() {
  document.getElementById('tap-overlay').classList.add('open');
  renderTovLines();
  syncTovPlayer();
  // 音声が再生中なら同期
  updateTovTime();
}

function closeTapMode() {
  document.getElementById('tap-overlay').classList.remove('open');
  refreshEditor(); // 編集エリアを最新に更新
}

// TAPオーバーレイ内の再生コントロールをメインaElに同期
function syncTovPlayer() {
  const tovPlay = document.getElementById('tov-play-btn');
  tovPlay.textContent = aEl.paused ? '▶' : '⏸';
  const d = aEl.duration || 0;
  if (d > 0) {
    const pct = aEl.currentTime / d * 100;
    document.getElementById('tap-ov-seek-fill').style.width = pct + '%';
    document.getElementById('tap-ov-seek-in').value = Math.round(aEl.currentTime / d * 1000);
  }
  document.getElementById('tap-ov-tapbtn').disabled = !aEl.src;
}

function updateTovTime() {
  if (!document.getElementById('tap-overlay').classList.contains('open')) return;
  const t = aEl.currentTime;
  const d = aEl.duration || 0;
  document.getElementById('tap-ov-time').textContent = fmt(t, true);
  if (d > 0 && !tovSeeking) {
    document.getElementById('tap-ov-seek-fill').style.width = (t / d * 100) + '%';
    document.getElementById('tap-ov-seek-in').value = Math.round(t / d * 1000);
  }
  // 現在コード
  if (window._ct && window._cn) {
    let cur = '-';
    for (let i = 0; i < window._ct.length; i++) { if (window._ct[i] <= t) cur = window._cn[i]; else break; }
    document.getElementById('tap-ov-chord').textContent = cur;
  }
  // アクティブ行ハイライト＋スクロール
  let ai = -1;
  for (let i = project.lines.length - 1; i >= 0; i--) {
    if (project.lines[i].time != null && project.lines[i].time <= t) { ai = i; break; }
  }
  const rows = document.querySelectorAll('.tap-ov-line');
  rows.forEach((r, i) => r.classList.toggle('tov-active', i === ai));
  if (ai >= 0 && rows[ai]) {
    const area = document.getElementById('tap-ov-lines');
    const el = rows[ai];
    const top = el.offsetTop;
    const h = area.clientHeight;
    const target = top - h * 0.35;
    if (top < area.scrollTop + h * 0.15 || top + el.offsetHeight > area.scrollTop + h * 0.85) {
      area.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }
  updateTovStatus();
}

function renderTovLines() {
  const area = document.getElementById('tap-ov-lines');
  area.innerHTML = '';
  project.lines.forEach((line, idx) => {
    const row = document.createElement('div');
    row.className = 'tap-ov-line';
    if (idx === tovFocusIdx) row.style.borderColor = 'var(--green)';

    // 時刻（クリックで削除）
    const timeEl = document.createElement('div');
    timeEl.className = 'tov-time' + (line.time != null ? '' : ' no-t');
    timeEl.textContent = line.time != null ? fmt(line.time, true) : '--:--.--';
    timeEl.title = line.time != null ? 'クリックで時刻を削除' : '未設定';
    timeEl.addEventListener('click', e => {
      e.stopPropagation();
      if (line.time != null) { project.lines[idx].time = null; renderTovLines(); autoSaveLocal(); }
    });

    // リピートバッジ
    const chordWrap = document.createElement('div');
    chordWrap.className = 'tov-chords';
    if (line.repeat) {
      const rb = document.createElement('span');
      rb.className = 'tov-repeat';
      rb.textContent = `×${line.repeat.count}`;
      chordWrap.appendChild(rb);
    }
    line.chords.forEach(c => {
      if(c.type==='sep'){
        const sp=document.createElement('span');
        sp.style.cssText='color:var(--text3);font-size:15px;padding:0 1px;align-self:center';
        sp.textContent='/';chordWrap.appendChild(sp);return;
      }
      const ct = document.createElement('span');
      ct.className = 'tov-chord-tag';
      ct.textContent = c.chord;
      chordWrap.appendChild(ct);
    });

    // 歌詞
    const lyricEl = document.createElement('div');
    lyricEl.className = 'tov-lyric';
    lyricEl.textContent = line.lyric || '(空)';

    // 行クリック→フォーカス設定
    row.addEventListener('click', () => {
      tovFocusIdx = idx;
      renderTovLines();
      toast(`行${idx + 1}にフォーカス — TAP で時刻をセット`);
    });

    row.appendChild(timeEl);
    row.appendChild(chordWrap);
    row.appendChild(lyricEl);
    area.appendChild(row);
  });
  updateTovStatus();
}

function updateTovStatus() {
  const timed = project.lines.filter(l => l.time != null).length;
  const total = project.lines.length;
  const el1 = document.getElementById('tov-timed');
  const el2 = document.getElementById('tov-total');
  if (el1) el1.textContent = timed;
  if (el2) el2.textContent = total;
}

// ════════════════════════════════════════
// ⑦ コード置換バー
// ════════════════════════════════════════

function rbGetFind(){ return document.getElementById('rb-find').value.trim(); }
function rbGetRepl(){ return document.getElementById('rb-replace').value.trim(); }
function rbScopeAll(){ return document.getElementById('rb-all').checked; }

// ヒットリストを更新してタグをハイライト
function rbRefresh(){
  // 既存ハイライトをクリア
  document.querySelectorAll('.chord-tag.rb-hit,.chord-tag.rb-curr').forEach(el=>{
    el.classList.remove('rb-hit','rb-curr');
  });
  rbHits=[];
  const find=rbGetFind();
  if(!find){document.getElementById('rb-count').textContent='-';rbCurr=-1;return;}

  const scopeAll=rbScopeAll();
  const targetLines=scopeAll
    ? project.lines.map((_,i)=>i)
    : (focLine>=0?[focLine]:[]);

  targetLines.forEach(li=>{
    project.lines[li].chords.forEach((c,ci)=>{
      if(c.type==='sep')return;
      if(c.chord===find) rbHits.push({li,ci});
    });
  });

  document.getElementById('rb-count').textContent=
    rbHits.length ? `${rbHits.length}件` : '0件';

  // ヒットタグを黄色に
  rbHits.forEach(({li,ci})=>{
    const tag=document.querySelector(`.line-row[data-idx="${li}"] .chord-tag:nth-child(${ci+2})`);
    // nth-child はリピートバッジの分ズレるので data属性で探す
  });
  // data属性ベースで確実にハイライト
  rbHighlightAll();
  if(rbCurr>=rbHits.length) rbCurr=0;
  rbScrollToCurrent();
}

function rbHighlightAll(){
  // まずレンダリング済みタグを全走査
  document.querySelectorAll('.chord-tag').forEach(tag=>{
    const nameEl=tag.querySelector('.chord-name');
    if(!nameEl)return;
    const chord=nameEl.textContent;
    const find=rbGetFind();
    if(chord===find) tag.classList.add('rb-hit');
    else tag.classList.remove('rb-hit','rb-curr');
  });
}

function rbScrollToCurrent(){
  if(rbCurr<0||rbCurr>=rbHits.length){
    document.getElementById('rb-count').textContent=
      rbHits.length?`${rbHits.length}件`:'0件';
    return;
  }
  document.getElementById('rb-count').textContent=
    `${rbCurr+1} / ${rbHits.length}件`;
  const {li}=rbHits[rbCurr];

  // editor-area内スクロール（scrollEditorToRowで統一、force=trueで必ず動かす）
  const rows=document.querySelectorAll('.line-row');
  if(rows[li]) scrollEditorToRow(rows[li], true);

  // 現在ハイライトをrb-currに
  document.querySelectorAll('.chord-tag.rb-curr').forEach(el=>el.classList.remove('rb-curr'));
  rbHits.forEach((h,i)=>{
    if(i!==rbCurr)return;
    const row=rows[h.li];
    if(!row)return;
    const nonSepIdx=project.lines[h.li].chords.slice(0,h.ci+1).filter(c=>c.type!=='sep').length-1;
    const allTags=row.querySelectorAll('.chord-tag');
    if(allTags[nonSepIdx]) allTags[nonSepIdx].classList.add('rb-curr');
  });
}

// ════════════════════════════════════════
// ⑤ 音量バー
// ════════════════════════════════════════
const volSlider=document.getElementById('vol-slider');
const volBtn=document.getElementById('vol-btn');

if(volSlider&&volBtn){
  // localStorageから音量を復元
  const savedVol=parseInt(localStorage.getItem('cs_vol'));
  const initVol=isNaN(savedVol)?80:savedVol;
  volSlider.value=initVol;
  aEl.volume=initVol/100;
  volBtn.textContent=initVol===0?'🔇':initVol<40?'🔉':'🔊';

  volSlider.addEventListener('input',()=>{
    const v=parseInt(volSlider.value)/100;
    aEl.volume=v;aEl.muted=(v===0);
    volBtn.textContent=v===0?'🔇':v<0.4?'🔉':'🔊';
    localStorage.setItem('cs_vol',volSlider.value);
  });
  volBtn.addEventListener('click',()=>{
    if(aEl.muted||aEl.volume===0){
      const r=parseInt(localStorage.getItem('cs_vol_pre'))||80;
      aEl.muted=false;volSlider.value=r;aEl.volume=r/100;
      volBtn.textContent=r<40?'🔉':'🔊';
    } else {
      localStorage.setItem('cs_vol_pre',volSlider.value);
      aEl.muted=true;volSlider.value=0;volBtn.textContent='🔇';
    }
  });
}

// ════════════════════════════════════════
// 自動保存
// ════════════════════════════════════════
function autoSaveLocal(){
  clearTimeout(asT);
  asT = setTimeout(() => {
    const uiState = getUIState();
    const projectData = serializeProject(project, uiState);
    const result = saveToLocalStorage(projectData);
    if (result.success) {
      document.getElementById('st-save').textContent = result.timestamp;
    }
  }, 1000);
}
function updateStatus(){
  document.getElementById('st-lines').textContent=project.lines.length;
  document.getElementById('st-chords').textContent=project.lines.reduce((s,l)=>s+l.chords.length,0);
  document.getElementById('st-timed').textContent=project.lines.filter(l=>l.time!=null).length;
}
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2500);}

// ----------------------------
// EVENT HANDLERS SETUP
// ----------------------------

/**
 * setupEventHandlers()
 * 
 * UIイベント登録の集中管理
 * 
 * 【配置ルール】
 * - ユーザー操作イベントのみ登録する
 * - モーダル内部の動的イベントはここに置かない
 * - セクションは機能単位で分類する
 * - 各セクション内はUI配置順に並べる
 * 
 * 【セクション構成】
 * 1. File Events: ファイル選択・読み込み
 * 2. Palette Events: コードパレット操作
 * 3. Import Events: 歌詞テキスト取り込み
 * 4. Editor Events: 行追加
 * 5. Project Events: 保存・読み込み・新規
 * 6. Diagram Events: ダイアグラム表示制御
 * 7. Capo Events: カポ変更
 * 8. TAP Mode Events: TAPオーバーレイ
 * 9. Replace Events: 置換機能
 * 10. Project Meta Events: タイトル・Key・BPM
 * 11. Keyboard Events: ショートカットキー
 */
function setupEventHandlers() {
  // ============================================
  // File Events
  // ============================================
  // File Events
  // ============================================
  // Audio file select button
  document.getElementById('audio-btn').addEventListener('click', () => {
    document.getElementById('file-audio').click();
  });

  // Chord file select button
  document.getElementById('chord-btn').addEventListener('click', () => {
    document.getElementById('file-chord').click();
  });

  // Chord file load (JSON/CSV)
  document.getElementById('file-chord').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      let data;
      if(f.name.endsWith('.csv')) {
        data = parseCSV(ev.target.result, normChord);
      } else {
        data = parseJSON(ev.target.result);
        if (!data) {
          toast('JSONエラー');
          return;
        }
      }
      loadChordData(data,f.name);
    };
    r.readAsText(f,'utf-8');
  });

  // Audio file load
  document.getElementById('file-audio').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    if(_aURL)URL.revokeObjectURL(_aURL);
    _aURL=URL.createObjectURL(f);aEl.src=_aURL;project.audio=f.name;
    const b=document.getElementById('audio-btn');b.textContent=f.name;b.classList.add('loaded');
    const tapBtn = document.getElementById('tap-btn');
    if(tapBtn) tapBtn.disabled=false;
    aEl.volume=parseFloat(document.getElementById('vol-slider')?.value||80)/100;
    toast(`音声: ${f.name}`);
    checkReloadBannerDone();
  });

  // ============================================
  // Palette Events
  // ============================================
  // Palette filter
  document.getElementById('pal-filter').addEventListener('input',renderPalette);

  // Custom chord add
  document.getElementById('custom-add').addEventListener('click',()=>{
    const inp=document.getElementById('custom-in');
    const val=inp.value.trim();if(!val)return;
    if(!palette.includes(val)){palette.push(val);renderPalette();document.getElementById('pal-count').textContent=palette.length;}
    addChordToLine(val);inp.value='';toast(`"${val}" を追加してフォーカス行に挿入`);
  });
  document.getElementById('custom-in').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('custom-add').click();});

  // ============================================
  // Import Events
  // ============================================
  // Import lyrics (replace all)
  document.getElementById('btn-import').addEventListener('click',()=>{
    const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
    const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
    project.lines=ls.map(l=>mkLine(l));refreshEditor();toast(`${ls.length}行を取り込みました`);
  });

  // Append lyrics
  document.getElementById('btn-append').addEventListener('click',()=>{
    const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
    const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
    ls.forEach(l=>project.lines.push(mkLine(l)));refreshEditor();toast(`${ls.length}行を追記`);
  });

  // Clear all lines
  document.getElementById('btn-clearall').addEventListener('click',()=>{if(confirm('全行を削除しますか？')){project.lines=[];refreshEditor();}});

  // ============================================
  // Editor Events
  // ============================================
  // Add empty line
  document.getElementById('add-line-btn').addEventListener('click',()=>{
    project.lines.push(mkLine());refreshEditor();
    setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins.length)ins[ins.length-1].focus();},0);
  });

  // ============================================
  // Project Events
  // ============================================
  // Save project
  document.getElementById('btn-save').addEventListener('click', () => saveProject(false));

  // Save as
  document.getElementById('btn-saveas').addEventListener('click', () => saveProject(true));

  // Open project (trigger file input)
  document.getElementById('btn-open').addEventListener('click',()=>document.getElementById('file-project').click());

  // Project file load
  document.getElementById('file-project').addEventListener('change',e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        loadProj(data);
        toast(`読み込み: ${f.name}`);
        if(data.audio||data.chord_source) showReloadBanner(data.audio, data.chord_source);
      }catch{toast('JSONエラー');}
      e.target.value = '';
    };
    r.readAsText(f);
  });

  // New project
  document.getElementById('btn-new').addEventListener('click',()=>{
    if(project.lines.length>0&&!confirm('編集内容を破棄して新規作成しますか？'))return;
    resetProject();
    renderPalette();
    refreshEditor();
    showDiagramPanel('', getCapo());
    clearLocalStorage();
    document.getElementById('st-save').textContent='-';
  });

  // UI: ダイアグラムON/OFF
  const diagToggleBtn = document.getElementById('diag-toggle');
  diagToggleBtn.addEventListener('click', () => {
    diagOn = !diagOn;
    diagToggleBtn.textContent = diagOn ? '🎸 ダイアグラム ON' : '🎸 ダイアグラム OFF';
    diagToggleBtn.classList.toggle('off', !diagOn);
    if (!diagOn) { const p=document.getElementById('popup');if(p)p.classList.remove('show'); }
    localStorage.setItem('cs_diagOn', diagOn ? '1' : '0');
  });

  // UI: ダイアグラム入力
  document.getElementById('diag-in').addEventListener('input',e=>showDiagramPanel(e.target.value.trim(), getCapo()));

  // UI: ダイアグラム追加ボタン
  const _diagBtn=document.getElementById('btn-add-diag');
  if(_diagBtn)_diagBtn.addEventListener('click',()=>openAddDiagramModal(document.getElementById('diag-in').value.trim()));

  // ============================================
  // Capo Events
  // ============================================

  // カポ変更：前の値との差分で全コードを移調（確認なし・即時）
  document.getElementById('capo').addEventListener('change',()=>{
    const newCapo=parseInt(document.getElementById('capo').value)||0;
    const diff=newCapo-_prevCapo;
    if(diff===0)return;
    // カポが増える(0→2)＝同じ音を出すためコードフォームは下げる(-2半音)
    // カポが減る(2→0)＝コードフォームは上げる(+2半音)
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
  aEl.addEventListener('timeupdate', updatePerformFocus);
  aEl.addEventListener('timeupdate', updatePerformPlayer);
  aEl.addEventListener('play', () => {
    document.getElementById('tov-play-btn').textContent = '⏸';
    const performBtn = document.getElementById('perform-play-btn');
    if (performBtn) performBtn.textContent = '⏸';
  });
  aEl.addEventListener('pause', () => {
    document.getElementById('tov-play-btn').textContent = '▶';
    const performBtn = document.getElementById('perform-play-btn');
    if (performBtn) performBtn.textContent = '▶';
  });

  // TAPボタン（オーバーレイ）
  tovTapBtn = document.getElementById('tap-ov-tapbtn');
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
      // 次の行に自動フォーカス
      tovFocusIdx = idx + 1;
      renderTovLines();
      autoSaveLocal();
      // TAP視覚フィードバック
      const rows = document.querySelectorAll('.tap-ov-line');
      if (rows[idx]) {
        rows[idx].classList.add('tov-tapped');
        setTimeout(() => rows[idx].classList.remove('tov-tapped'), 350);
      }
      // フォーカス行が画面外なら次の行へスクロール
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
    // ボタンアニメ
    tovTapBtn.classList.add('tapping');
    setTimeout(() => tovTapBtn.classList.remove('tapping'), 150);
  });

  // ============================================
  // Global Keyboard Events
  // ============================================
  document.addEventListener('keydown', e => {
    if (!document.getElementById('tap-overlay').classList.contains('open')) return;
    if (e.code === 'Space') { 
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      tovTapBtn.click(); 
    }
    if (e.code === 'ArrowLeft') aEl.currentTime = Math.max(0, aEl.currentTime - 5);
    if (e.code === 'ArrowRight') aEl.currentTime = Math.min(aEl.duration || 0, aEl.currentTime + 5);
    if (e.code === 'Escape') closeTapMode();
  }, { capture: true }); // capture phase で先に処理

  // Ctrl+H で置換バー開閉
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key==='h'){
      e.preventDefault();
      document.getElementById('btn-replace-open').click();
    }
  });

  // ============================================
  // Global Keyboard Shortcuts
  // ============================================
  document.addEventListener('keydown', e => {
    // Ctrl+S: 保存
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      document.getElementById('btn-save').click();
    }
    
    // Alt+N: 新規作成
    if (e.altKey && e.key === 'n') {
      e.preventDefault();
      document.getElementById('btn-new').click();
    }
  });

  // ============================================
  // Perform Mode Events
  // ============================================
  document.getElementById('btn-perform-mode').addEventListener('click', openPerformMode);
  document.getElementById('btn-perform-close').addEventListener('click', closePerformMode);
  
  // 演奏モード: 再生/一時停止
  document.getElementById('perform-play-btn').addEventListener('click', () => {
    if (aEl.paused) aEl.play(); else aEl.pause();
  });
  
  // 演奏モード: シーク
  document.getElementById('perform-seek-in').addEventListener('input', e => {
    aEl.currentTime = (e.target.value / 1000) * aEl.duration;
  });
  
  // 演奏モード: 速度調整
  document.getElementById('perform-speed').addEventListener('input', e => {
    const speed = parseInt(e.target.value) / 100;
    aEl.playbackRate = speed;
    document.getElementById('perform-speed-label').textContent = `${e.target.value}%`;
  });
  
  // 演奏モード: 音量調整
  const volSliderPerform = document.getElementById('vol-slider-perform');
  const volBtnPerform = document.getElementById('vol-btn-perform');
  if (volSliderPerform && volBtnPerform) {
    volSliderPerform.addEventListener('input', e => {
      aEl.volume = e.target.value / 100;
      volBtnPerform.textContent = e.target.value > 0 ? '🔊' : '🔇';
    });
    
    volBtnPerform.addEventListener('click', () => {
      if (aEl.volume > 0) {
        aEl.volume = 0;
        volSliderPerform.value = 0;
        volBtnPerform.textContent = '🔇';
      } else {
        aEl.volume = 0.8;
        volSliderPerform.value = 80;
        volBtnPerform.textContent = '🔊';
      }
    });
  }
  
  // 演奏モード: ダイアグラム表示ON/OFF
  document.getElementById('perform-diag-toggle').addEventListener('change', e => {
    performState.diagOn = e.target.checked;
    renderPerformLines();
  });
  
  // 演奏モード: ホバー表示ON/OFF
  document.getElementById('perform-diag-hover').addEventListener('change', e => {
    performState.diagHover = e.target.checked;
    if (!e.target.checked) hidePopup();
  });
  
  // 演奏モード: モード切替
  const performModeRadios = document.querySelectorAll('input[name="perform-mode"]');
  if (performModeRadios.length > 0) {
    performModeRadios.forEach(radio => {
      radio.addEventListener('change', e => {
        performState.mode = e.target.value;
        performState.page = 0;
        renderPerformLines();
      });
    });
  }
  
  // 演奏モード: キーボードショートカット
  document.addEventListener('keydown', e => {
    if (!performState.active) return;
    
    // Space: 再生/一時停止
    if (e.code === 'Space') {
      e.preventDefault();
      if (aEl.paused) aEl.play(); else aEl.pause();
    }
    
    // 静止モード時のページ送り
    if (performState.mode === 'static') {
      const totalPages = Math.ceil(project.lines.length / performState.linesPerPage);
      
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (performState.page > 0) {
          performState.page--;
          renderPerformLines();
        }
      }
      
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (performState.page < totalPages - 1) {
          performState.page++;
          renderPerformLines();
        }
      }
    }
  });
  
  // 演奏モード: スワイプ/ドラッグ操作
  let pointerStartX = 0;
  let pointerStartY = 0;
  
  const performLines = document.getElementById('perform-lines');
  
  performLines.addEventListener('pointerdown', e => {
    if (!performState.active || performState.mode !== 'static') return;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
  });
  
  performLines.addEventListener('pointerup', e => {
    if (!performState.active || performState.mode !== 'static') return;
    
    const deltaX = e.clientX - pointerStartX;
    const deltaY = e.clientY - pointerStartY;
    
    // 縦方向の移動が大きい場合はスワイプ判定しない
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    
    const threshold = 50;
    const totalPages = Math.ceil(project.lines.length / performState.linesPerPage);
    
    // 右スワイプ: 前ページ
    if (deltaX > threshold && performState.page > 0) {
      performState.page--;
      renderPerformLines();
    }
    
    // 左スワイプ: 次ページ
    if (deltaX < -threshold && performState.page < totalPages - 1) {
      performState.page++;
      renderPerformLines();
    }
  });

  // ============================================
  // Replace Bar Events
  // ============================================
  document.getElementById('rb-find').addEventListener('input',()=>{rbCurr=0;rbRefresh();});
  document.getElementById('rb-replace').addEventListener('input',()=>{});
  document.getElementById('rb-all').addEventListener('change',()=>{rbCurr=0;rbRefresh();});
  document.getElementById('rb-focus').addEventListener('change',()=>{rbCurr=0;rbRefresh();});

  document.getElementById('rb-next').addEventListener('click',()=>{
    if(!rbHits.length){rbRefresh();return;}
    rbCurr=(rbCurr+1)%rbHits.length;
    rbHighlightAll();rbScrollToCurrent();
    setTimeout(()=>document.getElementById('rb-find').focus(),10);
  });

  document.getElementById('rb-prev').addEventListener('click',()=>{
    if(!rbHits.length){rbRefresh();return;}
    rbCurr=(rbCurr-1+rbHits.length)%rbHits.length;
    rbHighlightAll();rbScrollToCurrent();
    setTimeout(()=>document.getElementById('rb-find').focus(),10);
  });

  document.getElementById('rb-one').addEventListener('click',()=>{
    if(!rbHits.length||rbCurr<0||rbCurr>=rbHits.length)return;
    const repl=rbGetRepl();
    const {li,ci}=rbHits[rbCurr];
    if(!rbSnapshot) rbSnapshot=JSON.stringify(project.lines);
    document.getElementById('rb-undo').disabled=false;
    if(repl===''){
      project.lines[li].chords.splice(ci,1);
    } else {
      project.lines[li].chords[ci].chord=repl;
      addToPaletteIfNew(repl);
    }
    refreshEditor();
    rbHits=[];rbCurr=0;rbRefresh();
    toast(`1つ置換しました`);
    setTimeout(()=>document.getElementById('rb-find').focus(),10);
  });

  document.getElementById('rb-all-btn').addEventListener('click',()=>{
    const find=rbGetFind();
    const repl=rbGetRepl();
    if(!find)return;
    rbSnapshot=JSON.stringify(project.lines);
    document.getElementById('rb-undo').disabled=false;
    const scopeAll=rbScopeAll();
    let count=0;
    project.lines.forEach((line,li)=>{
      if(!scopeAll&&li!==focLine)return;
      for(let ci=line.chords.length-1;ci>=0;ci--){
        const c=line.chords[ci];
        if(c.type==='sep'||c.chord!==find)continue;
        if(repl==='') line.chords.splice(ci,1);
        else { line.chords[ci].chord=repl; addToPaletteIfNew(repl); }
        count++;
      }
    });
    refreshEditor();
    rbHits=[];rbCurr=0;rbRefresh();
    toast(`${count}件置換しました`);
  });

  document.getElementById('rb-undo').addEventListener('click',()=>{
    if(!rbSnapshot)return;
    project.lines=JSON.parse(rbSnapshot);
    rbSnapshot=null;
    document.getElementById('rb-undo').disabled=true;
    refreshEditor();
    rbHits=[];rbCurr=0;rbRefresh();
    toast('置換を元に戻しました');
  });

  document.getElementById('rb-close').addEventListener('click',()=>{
    document.getElementById('replace-bar').classList.remove('open');
    document.querySelectorAll('.chord-tag.rb-hit,.chord-tag.rb-curr').forEach(el=>{
      el.classList.remove('rb-hit','rb-curr');
    });
    rbHits=[];rbCurr=-1;
  });

  document.getElementById('btn-replace-open').addEventListener('click',()=>{
    const bar=document.getElementById('replace-bar');
    bar.classList.toggle('open');
    if(bar.classList.contains('open')){
      setTimeout(()=>document.getElementById('rb-find').focus(),80);
    }
  });

  // ============================================
  // Project Meta Events
  // ============================================
  document.getElementById('project-title').addEventListener('input',autoSaveLocal);
  document.getElementById('proj-key').addEventListener('input',autoSaveLocal);
  document.getElementById('proj-bpm').addEventListener('input',autoSaveLocal);

  // ============================================
  // Bottom Diagram Button
  // ============================================
  const btnAddDiagBottom=document.getElementById('btn-add-diag-bottom');
  if(btnAddDiagBottom) btnAddDiagBottom.addEventListener('click',()=>{
    const chord=document.getElementById('diag-in').value.trim();
    openAddDiagramModal(chord);
  });
}

// ----------------------------
// APP INITIALIZATION
// ----------------------------
window.addEventListener('DOMContentLoaded',()=>{
  // 演奏モードを確実に非表示
  const performOverlay = document.getElementById('perform-overlay');
  if (performOverlay) {
    performOverlay.hidden = true;
    performOverlay.style.display = 'none';
  }
  
  // イベントハンドラー登録
  setupEventHandlers();
  
  // ① Audio Engine初期化
  const audioElements = {
    playBtn: document.getElementById('play-btn'),
    timeDisplay: document.getElementById('time-dis'),
    seekInput: document.getElementById('seek-in'),
    seekFill: document.getElementById('seek-fill'),
    tapBtn: document.getElementById('tap-btn'),
    curChord: document.getElementById('cur-chord'),
    btnM5: document.getElementById('btn-m5'),
    speedSel: document.getElementById('speed-sel'),
    speedReset: document.getElementById('speed-reset'),
    volSlider: document.getElementById('vol-slider'),
    volBtn: document.getElementById('vol-btn'),
    tovSpeed: document.getElementById('tov-speed'),
    tovSpeedLabel: document.getElementById('tov-speed-label'),
  };

  const audioCallbacks = {
    onTimeUpdate: (time) => {
      highlightLine(time, project.lines);
    },
    onTap: (time) => {
      let idx = tapIdx;
      if (idx < 0 || idx >= project.lines.length) {
        idx = project.lines.findIndex(l => l.time == null);
      }
      if (idx < 0) idx = 0;
      if (idx < project.lines.length) {
        project.lines[idx].time = parseFloat(time.toFixed(3));
        tapIdx = idx + 1;
        callRenderLines();
        flashLine(idx);
        autoSaveLocal();
      }
    },
    onMetadataLoad: () => {
      // 必要に応じて追加処理
    }
  };

  initAudioEngine(aEl, audioElements, audioCallbacks);

  // ② カスタムダイアグラム復元（右パネルに現在表示中のコードがあれば再描画）
  loadCustomDiagrams();
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if(curDiagChord) showDiagramPanel(curDiagChord, getCapo());

  // ③ ダイアグラムON/OFF状態復元
  const diagToggleBtn = document.getElementById('diag-toggle');
  const savedDiagOn = localStorage.getItem('cs_diagOn');
  if (savedDiagOn === '0') {
    diagOn = false;
    diagToggleBtn.textContent = '🎸 ダイアグラム OFF';
    diagToggleBtn.classList.add('off');
  }
  
  // 自動保存データの復元
  const saved = loadFromLocalStorage();
  if (saved && saved.lines && saved.lines.length > 0) {
    if (confirm(`前回の作業「${saved.title || '無題'}」(${saved.lines.length}行) を復元しますか？`)) {
      loadProj(saved);
      toast('自動保存データを復元しました');
    }
  }
  refreshEditor();renderPalette();
});

// ════════════════════════════════════════
// PERFORM MODE
// ════════════════════════════════════════

const performState = {
  active: false,
  focusIdx: -1,
  diagOn: true,
  diagHover: true,
  mode: 'follow',
  page: 0,
  linesPerPage: 10
};

function openPerformMode() {
  const overlay = document.getElementById('perform-overlay');
  overlay.hidden = false;
  overlay.style.display = 'flex';
  
  performState.active = true;
  performState.focusIdx = -1;
  performState.mode = 'follow';
  performState.page = 0;
  
  // Title設定
  const title = document.getElementById('project-title').value || '無題';
  const titleEl = document.getElementById('perform-title');
  if (titleEl) {
    titleEl.textContent = `🎸 演奏モード — ${title}`;
  }
  
  // 行描画
  renderPerformLines();
  
  // 再生状態同期
  updatePerformPlayer();
  
  // スワイプイベント
  setupPerformSwipe();
}

function closePerformMode() {
  const overlay = document.getElementById('perform-overlay');
  overlay.hidden = true;
  overlay.style.display = 'none';
  performState.active = false;
}

function renderPerformLines() {
  const container = document.getElementById('perform-lines');
  container.innerHTML = '';
  
  console.log('[Render] Mode:', performState.mode);
  console.log('[Render] Total lines:', project.lines.length);
  
  // 静止モード: ページ範囲を計算
  let linesToRender = project.lines;
  if (performState.mode === 'static') {
    const start = performState.page * performState.linesPerPage;
    const end = start + performState.linesPerPage;
    linesToRender = project.lines.slice(start, end);
    
    console.log('[Render] Page:', performState.page, 'Range:', start, '-', end);
    console.log('[Render] Lines to render:', linesToRender.length);
    
    // ページ情報更新
    const totalPages = Math.ceil(project.lines.length / performState.linesPerPage);
    const pageInfo = document.getElementById('perform-page-info');
    if (pageInfo) {
      pageInfo.textContent = `${performState.page + 1} / ${totalPages}`;
    }
    const pageNav = document.getElementById('perform-page-nav');
    if (pageNav) {
      pageNav.style.display = 'block';
    }
  } else {
    console.log('[Render] Follow mode - all lines');
    const pageNav = document.getElementById('perform-page-nav');
    if (pageNav) {
      pageNav.style.display = 'none';
    }
  }
  
  linesToRender.forEach((line, i) => {
    const el = document.createElement('div');
    el.className = 'perform-line';
    
    // 静止モード: 等サイズ表示
    if (performState.mode === 'static') {
      el.classList.add('static-mode');
    }
    
    const actualIdx = performState.mode === 'static' 
      ? performState.page * performState.linesPerPage + i 
      : i;
    el.dataset.idx = actualIdx;
    
    // コード取得
    const chordObjs = line.chords.filter(c => c.chord && c.chord !== '');
    
    // コード列生成
    let chordColumns = '';
    
    if (chordObjs.length > 0) {
      chordColumns = chordObjs.map(c => {
        const chordName = c.chord;
        let diagramHTML = '';
        
        if (performState.diagOn) {
          const result = lookupChord(chordName);
          if (result && result.data.v.length > 0) {
            const vr = result.data.v[0];
            diagramHTML = drawDiagram(vr.f, vr.b || null);
          } else {
            diagramHTML = '<div class="perform-chord-empty">-</div>';
          }
        }
        
        return `
          <div class="perform-chord-col">
            <div class="perform-chord-name" data-chord="${chordName}">${chordName}</div>
            ${performState.diagOn ? `<div class="perform-chord-diagram">${diagramHTML}</div>` : ''}
          </div>
        `;
      }).join('');
    }
    
    el.innerHTML = `
      ${chordColumns ? `<div class="chords">${chordColumns}</div>` : '<div class="chords">&nbsp;</div>'}
      <div class="lyric">${line.lyric || '&nbsp;'}</div>
    `;
    
    container.appendChild(el);
  });
  
  console.log('[Render] Complete. DOM children:', container.children.length);
  
  setupPerformDiagramHover();
}

function setupPerformDiagramHover() {
  document.querySelectorAll('.perform-chord-name').forEach(el => {
    el.addEventListener('mouseenter', e => {
      if (!performState.diagHover) return;
      const chord = e.target.dataset.chord;
      showPopup(chord, e.target);
    });
    
    el.addEventListener('mouseleave', () => {
      if (!performState.diagHover) return;
      hidePopup();
    });
  });
}

function updatePerformFocus() {
  if (!performState.active || performState.mode === 'static') return;
  
  const t = aEl.currentTime;
  let idx = -1;
  
  for (let i = project.lines.length - 1; i >= 0; i--) {
    const line = project.lines[i];
    if (line.time !== null && line.time <= t) {
      idx = i;
      break;
    }
  }
  
  if (idx === performState.focusIdx) return;
  
  performState.focusIdx = idx;
  
  document.querySelectorAll('.perform-line').forEach(el => {
    el.classList.remove('focused');
  });
  
  const target = document.querySelector(`.perform-line[data-idx="${idx}"]`);
  if (target) {
    target.classList.add('focused');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function updatePerformPlayer() {
  if (!performState.active) return;
  
  const seekIn = document.getElementById('perform-seek-in');
  const seekFill = document.getElementById('perform-seek-fill');
  const timeDisplay = document.getElementById('perform-time');
  
  if (aEl.duration) {
    const pct = (aEl.currentTime / aEl.duration) * 100;
    seekIn.value = pct * 10;
    seekFill.style.width = `${pct}%`;
    
    const min = Math.floor(aEl.currentTime / 60);
    const sec = Math.floor(aEl.currentTime % 60);
    timeDisplay.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  }
}

function performNextPage() {
  if (performState.mode !== 'static') return;
  const totalPages = Math.ceil(project.lines.length / performState.linesPerPage);
  if (performState.page < totalPages - 1) {
    performState.page++;
    renderPerformLines();
  }
}

function performPrevPage() {
  if (performState.mode !== 'static') return;
  if (performState.page > 0) {
    performState.page--;
    renderPerformLines();
  }
}

let performSwipe = { startX: 0, startY: 0 };

function setupPerformSwipe() {
  const container = document.getElementById('perform-lines');
  
  container.addEventListener('pointerdown', e => {
    performSwipe.startX = e.clientX;
    performSwipe.startY = e.clientY;
  });
  
  container.addEventListener('pointerup', e => {
    const dx = e.clientX - performSwipe.startX;
    const dy = e.clientY - performSwipe.startY;
    
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) performNextPage();
      else performPrevPage();
    }
  });
}
