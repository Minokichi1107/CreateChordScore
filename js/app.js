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
  showCapoInfo
} from './chords.js';

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
let project={title:'',audio:'',capo:0,lines:[],chord_source:''};
let palette=[];
let _aURL=null;

// ════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════
function getCapo(){return parseInt(document.getElementById('capo').value)||0;}

// ════════════════════════════════════════
// AUDIO ENGINE
// ════════════════════════════════════════
const aEl=document.getElementById('audio-el');
const pBtn=document.getElementById('play-btn');
const tDis=document.getElementById('time-dis');
const sIn=document.getElementById('seek-in');
const sFill=document.getElementById('seek-fill');
const tapBtn=document.getElementById('tap-btn');
const curC=document.getElementById('cur-chord');
let seeking=false, tapIdx=-1;

function fmt(s,tenth=false){
  const m=Math.floor(s/60),sc=Math.floor(s%60);
  return tenth?`${m}:${String(sc).padStart(2,'0')}.${Math.floor((s%1)*10)}`:`${m}:${String(sc).padStart(2,'0')}`;
}

aEl.addEventListener('timeupdate',()=>{
  if(seeking)return;
  const t=aEl.currentTime,d=aEl.duration||0;
  tDis.textContent=`${fmt(t,true)} / ${fmt(d)}`;
  if(d>0){sFill.style.width=(t/d*100)+'%';sIn.value=Math.round(t/d*1000);}
  updateCurChord(t);highlightLine(t);
});
aEl.addEventListener('play',()=>pBtn.textContent='⏸');
aEl.addEventListener('pause',()=>pBtn.textContent='▶');
aEl.addEventListener('ended',()=>pBtn.textContent='▶');

// ── 音量バー ──
(()=>{
  const volSlider=document.getElementById('vol-slider');
  const volBtn=document.getElementById('vol-btn');
  if(!volSlider||!volBtn)return;
  // localStorage から音量を復元
  const savedVol=parseFloat(localStorage.getItem('cs_volume'));
  const initVol=isNaN(savedVol)?0.8:savedVol;
  aEl.volume=initVol;
  volSlider.value=Math.round(initVol*100);
  updateVolIcon(initVol);

  volSlider.addEventListener('input',()=>{
    const v=parseFloat(volSlider.value)/100;
    aEl.volume=v;
    aEl.muted=false;
    updateVolIcon(v);
    localStorage.setItem('cs_volume',v);
  });
  volBtn.addEventListener('click',()=>{
    aEl.muted=!aEl.muted;
    updateVolIcon(aEl.muted?0:aEl.volume);
  });
  function updateVolIcon(v){
    volBtn.textContent=v<=0||aEl.muted?'🔇':v<0.4?'🔉':'🔊';
  }
})();
aEl.addEventListener('loadedmetadata',()=>{tDis.textContent=`0:00.0 / ${fmt(aEl.duration)}`;tapBtn.disabled=false;});
pBtn.addEventListener('click',()=>{if(aEl.src)aEl.paused?aEl.play():aEl.pause();});
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.code==='Space'){e.preventDefault();if(aEl.src)aEl.paused?aEl.play():aEl.pause();}
  if(e.code==='ArrowLeft')aEl.currentTime=Math.max(0,aEl.currentTime-5);
  if(e.code==='ArrowRight')aEl.currentTime=Math.min(aEl.duration||0,aEl.currentTime+5);
});
document.getElementById('btn-m5').addEventListener('click',()=>{aEl.currentTime=Math.max(0,aEl.currentTime-5);});
// 再生速度スライダー
const speedSel=document.getElementById('speed-sel');
const speedReset=document.getElementById('speed-reset');
function setSpeed(pct){
  const rate=Math.max(0.01,pct/100);
  aEl.playbackRate=rate;
  speedSel.value=pct;
  if(speedReset) speedReset.textContent=pct+'%';
  // TAPモード側も同期
  const tovSpd=document.getElementById('tov-speed');
  const tovLbl=document.getElementById('tov-speed-label');
  if(tovSpd) tovSpd.value=pct;
  if(tovLbl) tovLbl.textContent=pct+'%';
}
speedSel.addEventListener('input',e=>setSpeed(parseInt(e.target.value)));
if(speedReset) speedReset.addEventListener('click',()=>setSpeed(100));
sIn.addEventListener('mousedown',()=>seeking=true);
sIn.addEventListener('mouseup',()=>{seeking=false;aEl.currentTime=(sIn.value/1000)*(aEl.duration||0);});
sIn.addEventListener('input',()=>{if(!seeking)return;sFill.style.width=(sIn.value/10)+'%';const t=(sIn.value/1000)*(aEl.duration||0);tDis.textContent=`${fmt(t,true)} / ${fmt(aEl.duration||0)}`;});
tapBtn.addEventListener('click',()=>{
  if(!aEl.src||aEl.paused)return;
  const t=aEl.currentTime;
  let idx=tapIdx;
  if(idx<0||idx>=project.lines.length)idx=project.lines.findIndex(l=>l.time==null);
  if(idx<0)idx=0;
  if(idx<project.lines.length){project.lines[idx].time=parseFloat(t.toFixed(3));tapIdx=idx+1;renderLines();flashLine(idx);autoSave();}
});
function flashLine(i){const r=document.querySelectorAll('.line-row');if(r[i]){r[i].classList.add('tap-flash');setTimeout(()=>r[i].classList.remove('tap-flash'),400);}}
function updateCurChord(t){if(!window._ct||!window._cn)return;let c='N';for(let i=0;i<window._ct.length;i++){if(window._ct[i]<=t)c=window._cn[i];else break;}curC.textContent=c;}
// ════════════════════════════════════════
// DIAGRAM ON/OFF TOGGLE
// ════════════════════════════════════════
let diagOn = true;
const diagToggleBtn = document.getElementById('diag-toggle');
diagToggleBtn.addEventListener('click', () => {
  diagOn = !diagOn;
  diagToggleBtn.textContent = diagOn ? '🎸 ダイアグラム ON' : '🎸 ダイアグラム OFF';
  diagToggleBtn.classList.toggle('off', !diagOn);
  if (!diagOn) { const p=document.getElementById('popup');if(p)p.classList.remove('show'); }
  localStorage.setItem('cs_diagOn', diagOn ? '1' : '0');
});

let _lastActiveIdx = -1;
function highlightLine(t){
  const rows=document.querySelectorAll('.line-row');
  let ai=-1;
  for(let i=project.lines.length-1;i>=0;i--){
    if(project.lines[i].time!=null&&project.lines[i].time<=t){ai=i;break;}
  }
  rows.forEach((r,i)=>r.classList.toggle('active-line',i===ai));
  // 行が変わったときだけスクロール
  if(ai>=0 && ai!==_lastActiveIdx && rows[ai]){
    scrollEditorToRow(rows[ai]);
  }
  _lastActiveIdx=ai;
}

// editor-area内で指定行が中央付近に来るようスクロール
let _lastScrolledRow = -1;
function scrollEditorToRow(rowEl, force=false){
  const area=document.getElementById('editor-area');
  if(!area)return;
  const areaRect=area.getBoundingClientRect();
  const rowRect=rowEl.getBoundingClientRect();
  const relTop=rowRect.top - areaRect.top;
  const areaH=areaRect.height;
  const rowH=rowRect.height;
  // 表示範囲内（上15%〜下80%）かつforceでなければスキップ
  if(!force && relTop>=areaH*0.15 && relTop+rowH<=areaH*0.8) return;
  const target=area.scrollTop + relTop - areaH*0.35;
  area.scrollTop = Math.max(0, target); // instantスクロール（smoothは毎フレーム干渉する）
}

// ════════════════════════════════════════
// FILE LOADING
// ════════════════════════════════════════
document.getElementById('file-audio').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  if(_aURL)URL.revokeObjectURL(_aURL);
  _aURL=URL.createObjectURL(f);aEl.src=_aURL;project.audio=f.name;
  const b=document.getElementById('audio-btn');b.textContent=f.name;b.classList.add('loaded');
  tapBtn.disabled=false;
  // 音量バーの初期値を反映
  aEl.volume=parseFloat(document.getElementById('vol-slider')?.value||80)/100;
  toast(`音声: ${f.name}`);
  // バナーの音声選択済みチェック
  checkReloadBannerDone();
});
document.getElementById('file-chord').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    let data;
    if(f.name.endsWith('.csv'))data=parseCSV(ev.target.result);
    else{try{data=JSON.parse(ev.target.result);}catch{toast('JSONエラー');return;}}
    loadChordData(data,f.name);
  };
  r.readAsText(f,'utf-8');
});
function parseCSV(text){
  const ls=text.split('\n');const ch=[],ti=[];let prev=null;
  for(const l of ls){const p=l.trim().split(',');if(p.length<2)continue;const t=parseFloat(p[0]);if(isNaN(t))continue;const c=normChord(p[1].trim());if(c!==prev){ch.push(c);ti.push(t);prev=c;}}
  return{chords:ch,times:ti,duration:ti[ti.length-1]+2||0};
}
function normChord(raw){
  if(!raw||['N','X','n'].includes(raw))return'N';
  const Q={maj:'',min:'m',maj7:'maj7',min7:'m7',dom7:'7','7':'7',dim:'dim',aug:'aug',sus2:'sus2',sus4:'sus4',hdim7:'m7b5',maj9:'maj9',min9:'m9',add9:'add9'};
  if(raw.includes(':')){const[root,q]=raw.split(':',2);return root+(Q[q]??q);}return raw;
}
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
    btn.addEventListener('click',()=>addChordToLine(chord));
    btn.addEventListener('mouseenter',()=>setDiagRight(chord, getCapo()));
    c.appendChild(btn);
  });
}
document.getElementById('pal-filter').addEventListener('input',renderPalette);

// 手打ちでパレットに追加
document.getElementById('custom-add').addEventListener('click',()=>{
  const inp=document.getElementById('custom-in');
  const val=inp.value.trim();if(!val)return;
  if(!palette.includes(val)){palette.push(val);renderPalette();document.getElementById('pal-count').textContent=palette.length;}
  addChordToLine(val);inp.value='';toast(`"${val}" を追加してフォーカス行に挿入`);
});
document.getElementById('custom-in').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('custom-add').click();});

// ════════════════════════════════════════
// LINE MANAGEMENT
// ════════════════════════════════════════
let focLine=-1;

function mkLine(lyric='',time=null,chords=[],repeat=null){
  return{lyric,time,chords:chords.map(c=>typeof c==='string'?{chord:c,offset:0}:{...c}),repeat:repeat||null};
}

function addChordToLine(chord){
  if(focLine<0||focLine>=project.lines.length){
    if(!project.lines.length){project.lines.push(mkLine());renderLines();}
    focLine=project.lines.length-1;
  }
  project.lines[focLine].chords.push({chord,offset:0});
  renderLines();autoSave();
  setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins[focLine])ins[focLine].focus();},0);
}

function renderLines(){
  const cont=document.getElementById('lines-cont');
  cont.innerHTML='';
  project.lines.forEach((line,idx)=>{
    const row=document.createElement('div');row.className='line-row';row.dataset.idx=idx;

    // 行番号
    const num=document.createElement('div');num.className='line-num';num.textContent=idx+1;

    // 時刻ボタン
    const tb=document.createElement('button');
    tb.className='line-time'+(line.time!=null?' has-t':'');
    tb.textContent=line.time!=null?fmt(line.time,true):'--:--.--';
    tb.title=line.time!=null?'クリック: その時間に移動  右クリック: 時刻を編集':'クリック: 時刻を設定';
    tb.addEventListener('click',()=>{
      if(line.time!=null){
        // 時刻が設定済み → 再生バーをシーク
        aEl.currentTime=line.time;
        if(aEl.paused) aEl.play();
        toast(`▶ ${fmt(line.time,true)} にシーク`);
      } else {
        // 時刻未設定 → 時刻編集モーダル
        openTimeModal(idx);
      }
    });
    tb.addEventListener('contextmenu',e=>{
      // 右クリックで時刻編集モーダル
      e.preventDefault();
      openTimeModal(idx);
    });

    // コンテンツエリア
    const cont2=document.createElement('div');cont2.className='line-content';

    // ── コードタグ行（折り返し対応）──
    const tags=document.createElement('div');tags.className='chord-tags';

    // リピートバッジ
    if(line.repeat){
      const badge=document.createElement('span');badge.className='repeat-badge';
      badge.innerHTML=`<span>× ${line.repeat.count}</span><span style="font-size:10px;opacity:.7">回</span><span class="rb-del" title="削除">✕</span>`;
      badge.querySelector('.rb-del').addEventListener('click',e=>{e.stopPropagation();project.lines[idx].repeat=null;renderLines();autoSave();});
      badge.addEventListener('click',e=>{if(e.target.classList.contains('rb-del'))return;openRepeatModal(idx);});
      tags.appendChild(badge);
    }

    // コードタグ（削除ボタン大きく）＋セパレーター「/」対応
    line.chords.forEach((c,ci)=>{
      // セパレーターアイテム
      if(c.type==='sep'){
        const sep=document.createElement('span');
        sep.className='chord-sep';sep.textContent='/';
        sep.title='クリックで削除';
        sep.addEventListener('click',e=>{
          e.stopPropagation();
          project.lines[idx].chords.splice(ci,1);renderLines();autoSave();
        });
        tags.appendChild(sep);return;
      }
      // コードタグ本体
      const tagWrap=document.createElement('span');tagWrap.className='chord-tag-wrap';
      const tag=document.createElement('span');tag.className='chord-tag';
      const ns=document.createElement('span');ns.className='chord-name';ns.textContent=c.chord;
      tag.appendChild(ns);
      tag.addEventListener('click',e=>{if(e.target.classList.contains('del-x'))return;openChordEdit(idx,ci);});
      tag.addEventListener('mouseenter',()=>{if(!diagOn)return;setDiagRight(c.chord, getCapo());showPopup(c.chord,tag);});
      tag.addEventListener('mouseleave',hidePopup);
      const dx=document.createElement('span');dx.className='del-x';dx.textContent='✕';dx.title='削除';
      dx.addEventListener('click',e=>{e.stopPropagation();project.lines[idx].chords.splice(ci,1);renderLines();autoSave();});
      tag.appendChild(dx);
      tagWrap.appendChild(tag);
      // タグの右に「/挿入」ミニボタン（ホバーで表示）
      const insertSep=document.createElement('button');
      insertSep.className='insert-sep-btn';insertSep.textContent='/';
      insertSep.title=`${c.chord}の後に小節線を挿入`;
      insertSep.addEventListener('click',e=>{
        e.stopPropagation();
        // ci+1の位置にsepを挿入
        project.lines[idx].chords.splice(ci+1,0,{type:'sep'});
        renderLines();autoSave();
      });
      tagWrap.appendChild(insertSep);
      tags.appendChild(tagWrap);
    });

    // +コード / +/ ボタン
    const acb=document.createElement('button');acb.className='add-chord-btn';acb.textContent='+コード';
    acb.addEventListener('click',()=>openAddChord(idx));
    const asb=document.createElement('button');asb.className='add-sep-btn';asb.textContent='+/';
    asb.title='小節区切り「/」を追加';
    asb.addEventListener('click',()=>{
      project.lines[idx].chords.push({type:'sep'});renderLines();autoSave();
    });
    tags.appendChild(acb);tags.appendChild(asb);
    cont2.appendChild(tags);

    // 歌詞入力
    const li=document.createElement('input');li.type='text';li.className='lyric-input';
    li.value=line.lyric;li.placeholder='歌詞を入力...';
    li.addEventListener('focus',()=>{focLine=idx;tapIdx=idx;});
    li.addEventListener('input',e=>{project.lines[idx].lyric=e.target.value;autoSave();});
    li.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();project.lines.splice(idx+1,0,mkLine());renderLines();setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins[idx+1])ins[idx+1].focus();},0);}
      if(e.key==='Backspace'&&!e.target.value&&project.lines.length>1){e.preventDefault();project.lines.splice(idx,1);renderLines();autoSave();setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins[Math.max(0,idx-1)])ins[Math.max(0,idx-1)].focus();},0);}
    });
    cont2.appendChild(li);
    row.appendChild(num);row.appendChild(tb);row.appendChild(cont2);

    // ── ホバーアクション ──
    const acts=document.createElement('div');acts.className='line-acts';
    const mk=(t,cl,title,fn)=>{const b=document.createElement('button');b.className=`la ${cl}`;b.textContent=t;if(title)b.title=title;b.addEventListener('click',fn);return b;};
    acts.appendChild(mk('⏱','','次TAPでこの行に時刻セット',()=>{tapIdx=idx;toast(`次のTAPで行${idx+1}に時刻セット`);}));
    acts.appendChild(mk('🔁 リピート','am','リピート記号を追加/編集',()=>openRepeatModal(idx)));
    acts.appendChild(mk('📋 コピー','gn','コードを別の行にコピー',()=>openCopyModal(idx)));
    acts.appendChild(mk('↑挿入','','上に空行を挿入',()=>{project.lines.splice(idx,0,mkLine());renderLines();autoSave();}));
    acts.appendChild(mk('削除','del','',()=>{project.lines.splice(idx,1);renderLines();autoSave();}));
    row.appendChild(acts);
    cont.appendChild(row);
  });
  updateStatus();
}

// ════════════════════════════════════════
// LYRIC IMPORT
// ════════════════════════════════════════
document.getElementById('btn-import').addEventListener('click',()=>{
  const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
  const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
  project.lines=ls.map(l=>mkLine(l));renderLines();autoSave();toast(`${ls.length}行を取り込みました`);
});
document.getElementById('btn-append').addEventListener('click',()=>{
  const t=document.getElementById('lyric-ta').value.trim();if(!t)return;
  const ls=t.split('\n').map(l=>l.trim()).filter(l=>l);
  ls.forEach(l=>project.lines.push(mkLine(l)));renderLines();autoSave();toast(`${ls.length}行を追記`);
});
document.getElementById('btn-clearall').addEventListener('click',()=>{if(confirm('全行を削除しますか？')){project.lines=[];renderLines();autoSave();}});
document.getElementById('add-line-btn').addEventListener('click',()=>{
  project.lines.push(mkLine());renderLines();autoSave();
  setTimeout(()=>{const ins=document.querySelectorAll('.lyric-input');if(ins.length)ins[ins.length-1].focus();},0);
});

// ════════════════════════════════════════
// MODAL SYSTEM
// ════════════════════════════════════════
const mOv=document.getElementById('modal-ov');
const mTit=document.getElementById('m-title');
const mBody=document.getElementById('m-body');
const mBtns=document.getElementById('m-btns');
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
      <button onclick="document.getElementById('mi-t').value=aEl.currentTime.toFixed(3)" class="sm-btn" style="white-space:nowrap">▶ 現在位置</button>
    </div>`;
  mBtns.appendChild(mkMBtn('キャンセル','',closeMod));
  mBtns.appendChild(mkMBtn('時刻を削除','del',()=>{project.lines[idx].time=null;renderLines();autoSave();closeMod();}));
  mBtns.appendChild(mkMBtn('セット','ok',()=>{const v=parseFloat(document.getElementById('mi-t').value);if(!isNaN(v)){project.lines[idx].time=v;renderLines();autoSave();}closeMod();}));
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
        s.addEventListener('click',()=>{project.lines[idx].chords.splice(ci,1);renderLines();autoSave();renderModalPreview();});
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
        dx.addEventListener('click',()=>{project.lines[idx].chords.splice(ci,1);renderLines();autoSave();renderModalPreview();});
        tag.appendChild(nm);tag.appendChild(dx);
        previewEl.appendChild(tag);
      }
    });
  }

  function addChord(ch){
    if(!ch)return;
    addToPaletteIfNew(ch);
    project.lines[idx].chords.push({chord:ch,offset:0});
    renderLines();autoSave();
    renderModalPreview();
    // 入力欄をクリア＆フォーカス
    const inp=document.getElementById('mac-input');
    if(inp){inp.value='';inp.focus();}
  }

  function addSep(){
    project.lines[idx].chords.push({type:'sep'});
    renderLines();autoSave();
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
  mBtns.appendChild(mkMBtn('削除','del',()=>{project.lines[idx].chords.splice(ci,1);renderLines();autoSave();closeMod();}));
  mBtns.appendChild(mkMBtn('更新','ok',()=>{
    const v=document.getElementById('mi-c').value.trim();
    if(v){addToPaletteIfNew(v);project.lines[idx].chords[ci].chord=v;renderLines();autoSave();}
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
  if(line.repeat)mBtns.appendChild(mkMBtn('リピート削除','del',()=>{project.lines[idx].repeat=null;renderLines();autoSave();closeMod();}));
  mBtns.appendChild(mkMBtn('セット','ok',()=>{project.lines[idx].repeat={count:cnt};renderLines();autoSave();closeMod();}));
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
    renderLines();autoSave();closeMod();toast(`${cbs.length}行に${replace?'上書き':'追記'}${copyRepeat&&line.repeat?' (リピート込み)':''}しました`);
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

// Diagram button
document.getElementById('diag-in').addEventListener('input',e=>showDiagramPanel(e.target.value.trim(), getCapo()));
// btn-add-diag は下部ボタン(btn-add-diag-bottom)に統合済み。念のためnullチェック
const _diagBtn=document.getElementById('btn-add-diag');
if(_diagBtn)_diagBtn.addEventListener('click',()=>openAddDiagramModal(document.getElementById('diag-in').value.trim()));

// ════════════════════════════════════════
// HOVER POPUP
// ════════════════════════════════════════
const popEl=document.getElementById('popup');
let popT=null;
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
function getProj(){
  return{
    title:document.getElementById('project-title').value,
    audio:project.audio,
    capo:parseInt(document.getElementById('capo').value)||0,
    key:document.getElementById('proj-key').value.trim(),
    tempo:parseInt(document.getElementById('proj-bpm').value)||0,
    lines:project.lines,
    chord_source:project.chord_source,
  };
}

let _fileHandle = null; // 保存先ファイルハンドル

async function saveToHandle(handle, data) {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function saveProject(forceNew = false) {
  const data = getProj();
  const title = data.title || 'chordscore';
  const suggestedName = title.replace(/[^\w\-ぁ-ん一-龯ァ-ヶ]/g,'_') + '_project.json';

  // File System Access API対応ブラウザ
  if (window.showSaveFilePicker) {
    try {
      if (!_fileHandle || forceNew) {
        _fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        });
      }
      await saveToHandle(_fileHandle, data);
      const fn = _fileHandle.name;
      document.getElementById('st-save').textContent = fn + ' ' + new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      toast(`💾 保存: ${fn}`);
      autoSave();
    } catch(e) {
      if (e.name !== 'AbortError') { toast('保存エラー: ' + e.message); }
    }
  } else {
    // フォールバック：従来のダウンロード
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=suggestedName; a.click();
    URL.revokeObjectURL(url);
    toast(`💾 保存: ${suggestedName}`);
    autoSave();
  }
}

document.getElementById('btn-save').addEventListener('click', () => saveProject(false));
document.getElementById('btn-saveas').addEventListener('click', () => saveProject(true));
document.getElementById('btn-open').addEventListener('click',()=>document.getElementById('file-project').click());
document.getElementById('file-project').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    try{
      const data=JSON.parse(ev.target.result);
      loadProj(data);
      toast(`読み込み: ${f.name}`);
      // 音声・コードファイルが未選択なら再選択バナーを表示
      if(data.audio||data.chord_source) showReloadBanner(data.audio, data.chord_source);
    }catch{toast('JSONエラー');}
  };
  r.readAsText(f);
});

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
function loadProj(data){
  _fileHandle=null; // 別プロジェクトを開いたとき上書き保存先をリセット
  document.getElementById('project-title').value=data.title||'';
  document.getElementById('capo').value=data.capo||0;
  document.getElementById('proj-key').value=data.key||'';
  document.getElementById('proj-bpm').value=data.tempo||'';
  _prevCapo=data.capo||0;
  project.audio=data.audio||'';project.chord_source=data.chord_source||'';
  project.lines=(data.lines||[]).map(l=>mkLine(l.lyric||'',l.time??null,l.chords||[],l.repeat||null));
  if(data.audio){const b=document.getElementById('audio-btn');b.textContent=data.audio;b.classList.add('loaded');}
  if(data.chord_source){const b=document.getElementById('chord-btn');b.textContent=data.chord_source;b.classList.add('loaded');}
  renderLines();
}
document.getElementById('btn-new').addEventListener('click',()=>{
  if(project.lines.length>0&&!confirm('編集内容を破棄して新規作成しますか？'))return;
  project={title:'',audio:'',capo:0,lines:[],chord_source:''};palette=[];window._cn=[];window._ct=[];
  document.getElementById('project-title').value='';document.getElementById('capo').value=0;
  ['audio-btn','chord-btn'].forEach(id=>{const b=document.getElementById(id);b.textContent=id==='audio-btn'?'クリックして選択':'JSON / CSV';b.classList.remove('loaded');});
  aEl.src='';pBtn.textContent='▶';tDis.textContent='0:00.0 / 0:00';sFill.style.width='0%';curC.textContent='-';tapBtn.disabled=true;
  renderPalette();renderLines();showDiagramPanel('', getCapo());localStorage.removeItem('cs_auto');document.getElementById('st-save').textContent='-';
});

// ════════════════════════════════════════
// TAP MODE OVERLAY
// ════════════════════════════════════════
let tovFocusIdx = -1;
let tovSeeking = false;

function openTapMode() {
  document.getElementById('tap-overlay').classList.add('open');
  renderTovLines();
  syncTovPlayer();
  // 音声が再生中なら同期
  updateTovTime();
}

function closeTapMode() {
  document.getElementById('tap-overlay').classList.remove('open');
  renderLines(); // 編集エリアを最新に更新
}

document.getElementById('btn-tapmode').addEventListener('click', openTapMode);
document.getElementById('btn-tapmode-close').addEventListener('click', closeTapMode);

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

// オーバーレイ内シークバー
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

// メインaElのtimeupdateをオーバーレイにも反映
aEl.addEventListener('timeupdate', updateTovTime);
aEl.addEventListener('play', () => {
  document.getElementById('tov-play-btn').textContent = '⏸';
});
aEl.addEventListener('pause', () => {
  document.getElementById('tov-play-btn').textContent = '▶';
});

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

// TAPボタン（オーバーレイ）
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
    // 次の行に自動フォーカス
    tovFocusIdx = idx + 1;
    renderTovLines();
    autoSave();
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

// Spaceキーでも TAP（オーバーレイが開いているとき）
document.addEventListener('keydown', e => {
  if (!document.getElementById('tap-overlay').classList.contains('open')) return;
  if (e.code === 'Space') { e.preventDefault(); tovTapBtn.click(); }
  if (e.code === 'ArrowLeft') aEl.currentTime = Math.max(0, aEl.currentTime - 5);
  if (e.code === 'ArrowRight') aEl.currentTime = Math.min(aEl.duration || 0, aEl.currentTime + 5);
  if (e.code === 'Escape') closeTapMode();
});

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
      if (line.time != null) { project.lines[idx].time = null; renderTovLines(); autoSave(); }
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
let rbSnapshot = null;   // Undo用スナップショット
let rbHits = [];         // [{lineIdx, chordIdx}]
let rbCurr = -1;         // 現在ハイライト位置

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

document.getElementById('rb-find').addEventListener('input',()=>{rbCurr=0;rbRefresh();});
document.getElementById('rb-replace').addEventListener('input',()=>{});
document.getElementById('rb-all').addEventListener('change',()=>{rbCurr=0;rbRefresh();});
document.getElementById('rb-focus').addEventListener('change',()=>{rbCurr=0;rbRefresh();});

document.getElementById('rb-next').addEventListener('click',()=>{
  if(!rbHits.length){rbRefresh();return;}
  rbCurr=(rbCurr+1)%rbHits.length;
  rbHighlightAll();rbScrollToCurrent();
  // フォーカスを検索欄に戻してバーを閉じないようにする
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
  renderLines();autoSave();
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
  renderLines();autoSave();
  rbHits=[];rbCurr=0;rbRefresh();
  toast(`${count}件置換しました`);
});

document.getElementById('rb-undo').addEventListener('click',()=>{
  if(!rbSnapshot)return;
  project.lines=JSON.parse(rbSnapshot);
  rbSnapshot=null;
  document.getElementById('rb-undo').disabled=true;
  renderLines();autoSave();
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

// Ctrl+H で置換バー開閉
document.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key==='h'){
    e.preventDefault();
    document.getElementById('btn-replace-open').click();
  }
});

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
// ⑧ 右パネル：ダイアグラム登録ボタン下部固定接続
// ════════════════════════════════════════
let asT=null;
function autoSave(){
  clearTimeout(asT);asT=setTimeout(()=>{
    try{localStorage.setItem('cs_auto',JSON.stringify(getProj()));const n=new Date();document.getElementById('st-save').textContent=`${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;}catch(e){}
  },1000);
}
function updateStatus(){
  document.getElementById('st-lines').textContent=project.lines.length;
  document.getElementById('st-chords').textContent=project.lines.reduce((s,l)=>s+l.chords.length,0);
  document.getElementById('st-timed').textContent=project.lines.filter(l=>l.time!=null).length;
}
let toastT=null;
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2500);}
document.getElementById('project-title').addEventListener('input',autoSave);
document.getElementById('proj-key').addEventListener('input',autoSave);
document.getElementById('proj-bpm').addEventListener('input',autoSave);

// カポ変更：前の値との差分で全コードを移調（確認なし・即時）
let _prevCapo = 0;
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
  renderLines();
  _prevCapo=newCapo;
  autoSave();
  const cur=document.getElementById('diag-in').value.trim();
  if(cur) showDiagramPanel(cur, getCapo());
  toast(`カポ${newCapo}: 全コードを${Math.abs(diff)}半音${diff>0?'下':'上'}に移調`);
});

window.addEventListener('DOMContentLoaded',()=>{
  // ① カスタムダイアグラム復元（右パネルに現在表示中のコードがあれば再描画）
  loadCustomDiagrams();
  const curDiagChord = document.getElementById('diag-in').value.trim();
  if(curDiagChord) showDiagramPanel(curDiagChord, getCapo());

  // ダイアグラムON/OFF状態復元
  const savedDiagOn = localStorage.getItem('cs_diagOn');
  if (savedDiagOn === '0') {
    diagOn = false;
    diagToggleBtn.textContent = '🎸 ダイアグラム OFF';
    diagToggleBtn.classList.add('off');
  }
  try{
    const saved=localStorage.getItem('cs_auto');
    if(saved){const data=JSON.parse(saved);if(data.lines&&data.lines.length>0&&confirm(`前回の作業「${data.title||'無題'}」(${data.lines.length}行) を復元しますか？`)){loadProj(data);toast('自動保存データを復元しました');}}
  }catch(e){}
  renderLines();renderPalette();

  // ⑧ 右パネル下部登録ボタン接続
  const btnAddDiagBottom=document.getElementById('btn-add-diag-bottom');
  if(btnAddDiagBottom) btnAddDiagBottom.addEventListener('click',()=>{
    const chord=document.getElementById('diag-in').value.trim();
    openAddDiagramModal(chord);
  });
});
