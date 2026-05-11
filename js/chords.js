// ════════════════════════════════════════
// CHORD DATABASE
// frets[6]: 6弦→1弦  -1=ミュート 0=開放
// ════════════════════════════════════════
export const CHORD_DB = {
  'C':    {v:[{n:'ロー',f:[-1,3,2,0,1,0]},{n:'バレー3F',f:[-1,3,5,5,5,3],b:3},{n:'ハイ8F',f:[8,10,10,9,8,8],b:8}]},
  'Cm':   {v:[{n:'バレー3F',f:[-1,3,5,5,4,3],b:3}]},
  'Cmaj7':{v:[{n:'ロー',f:[-1,3,2,0,0,0]},{n:'バレー3F',f:[-1,3,5,4,5,3],b:3}]},
  'Cm7':  {v:[{n:'バレー3F',f:[-1,3,5,3,4,3],b:3}]},
  'C7':   {v:[{n:'ロー',f:[-1,3,2,3,1,0]},{n:'バレー3F',f:[-1,3,5,3,5,3],b:3}]},
  'Csus2':{v:[{n:'ロー',f:[-1,3,0,0,1,0]}]},
  'Csus4':{v:[{n:'ロー',f:[-1,3,3,0,1,1]}]},
  'Cadd9':{v:[{n:'ロー',f:[-1,3,2,0,3,0]}]},
  'D':    {v:[{n:'ロー',f:[-1,-1,0,2,3,2]},{n:'バレー5F',f:[-1,5,7,7,7,5],b:5}]},
  'Dm':   {v:[{n:'ロー',f:[-1,-1,0,2,3,1]},{n:'バレー5F',f:[-1,5,7,7,6,5],b:5}]},
  'Dmaj7':{v:[{n:'ロー',f:[-1,-1,0,2,2,2]}]},
  'Dm7':  {v:[{n:'ロー',f:[-1,-1,0,2,1,1]},{n:'バレー5F',f:[-1,5,7,5,6,5],b:5}]},
  'D7':   {v:[{n:'ロー',f:[-1,-1,0,2,1,2]}]},
  'Dsus4':{v:[{n:'ロー',f:[-1,-1,0,2,3,3]}]},
  'Dadd9':{v:[{n:'ロー',f:[-1,-1,0,2,3,0]}]},
  'E':    {v:[{n:'ロー',f:[0,2,2,1,0,0]},{n:'バレー7F',f:[-1,7,9,9,9,7],b:7}]},
  'Em':   {v:[{n:'ロー',f:[0,2,2,0,0,0]},{n:'バレー7F',f:[-1,7,9,9,8,7],b:7}]},
  'Emaj7':{v:[{n:'ロー',f:[0,2,1,1,0,0]}]},
  'Em7':  {v:[{n:'ロー',f:[0,2,0,0,0,0]},{n:'バレー7F',f:[-1,7,9,9,8,7],b:7}]},
  'E7':   {v:[{n:'ロー',f:[0,2,0,1,0,0]}]},
  'Esus4':{v:[{n:'ロー',f:[0,2,2,2,0,0]}]},
  'F':    {v:[{n:'バレー1F',f:[1,3,3,2,1,1],b:1},{n:'ハイ5F',f:[-1,-1,3,5,5,5]}]},
  'Fm':   {v:[{n:'バレー1F',f:[1,3,3,1,1,1],b:1}]},
  'Fmaj7':{v:[{n:'ロー',f:[-1,-1,3,2,1,0]},{n:'バレー1F',f:[1,3,2,2,1,1],b:1}]},
  'Fm7':  {v:[{n:'バレー1F',f:[1,3,1,1,1,1],b:1}]},
  'F7':   {v:[{n:'バレー1F',f:[1,3,1,1,1,1],b:1}]},
  'G':    {v:[{n:'ロー',f:[3,2,0,0,0,3]},{n:'ロー2',f:[3,2,0,0,3,3]},{n:'バレー3F',f:[3,5,5,4,3,3],b:3}]},
  'Gm':   {v:[{n:'バレー3F',f:[3,5,5,3,3,3],b:3}]},
  'Gmaj7':{v:[{n:'ロー',f:[3,2,0,0,0,2]}]},
  'Gm7':  {v:[{n:'バレー3F',f:[3,5,3,3,3,3],b:3}]},
  'G7':   {v:[{n:'ロー',f:[3,2,0,0,0,1]},{n:'バレー3F',f:[3,5,3,4,3,3],b:3}]},
  'Gsus4':{v:[{n:'ロー',f:[3,3,0,0,1,3]}]},
  'Gadd9':{v:[{n:'ロー',f:[-1,-1,3,2,1,3]}]},
  'A':    {v:[{n:'ロー',f:[-1,0,2,2,2,0]},{n:'バレー5F',f:[5,7,7,6,5,5],b:5}]},
  'Am':   {v:[{n:'ロー',f:[-1,0,2,2,1,0]},{n:'バレー5F',f:[5,7,7,5,5,5],b:5}]},
  'Amaj7':{v:[{n:'ロー',f:[-1,0,2,1,2,0]}]},
  'Am7':  {v:[{n:'ロー',f:[-1,0,2,0,1,0]},{n:'バレー5F',f:[5,7,5,5,5,5],b:5}]},
  'A7':   {v:[{n:'ロー',f:[-1,0,2,0,2,0]}]},
  'Asus2':{v:[{n:'ロー',f:[-1,0,2,2,0,0]}]},
  'Asus4':{v:[{n:'ロー',f:[-1,0,2,2,3,0]}]},
  'Aadd9':{v:[{n:'ロー',f:[-1,0,2,2,0,0]}]},
  'B':    {v:[{n:'バレー2F',f:[-1,2,4,4,4,2],b:2},{n:'バレー7F',f:[7,9,9,8,7,7],b:7}]},
  'Bm':   {v:[{n:'バレー2F',f:[-1,2,4,4,3,2],b:2},{n:'バレー7F',f:[7,9,9,7,7,7],b:7}]},
  'Bmaj7':{v:[{n:'バレー2F',f:[-1,2,4,3,4,2],b:2}]},
  'Bm7':  {v:[{n:'バレー2F',f:[-1,2,4,2,3,2],b:2}]},
  'B7':   {v:[{n:'ロー',f:[-1,2,1,2,0,2]},{n:'バレー2F',f:[-1,2,4,2,4,2],b:2}]},
  'C#':   {v:[{n:'バレー4F',f:[-1,4,6,6,6,4],b:4}]},
  'C#m':  {v:[{n:'バレー4F',f:[-1,4,6,6,5,4],b:4}]},
  'C#m7': {v:[{n:'バレー4F',f:[-1,4,6,4,5,4],b:4}]},
  'C#maj7':{v:[{n:'バレー4F',f:[-1,4,6,5,6,4],b:4}]},
  'Db':   {v:[{n:'バレー4F',f:[-1,4,6,6,6,4],b:4}]},
  'D#':   {v:[{n:'バレー6F',f:[-1,6,8,8,8,6],b:6}]},
  'D#m':  {v:[{n:'バレー6F',f:[-1,4,8,8,7,6],b:6}]},
  'Eb':   {v:[{n:'バレー6F',f:[-1,6,8,8,8,5],b:6}]},
  'Ebm':  {v:[{n:'バレー6F',f:[-1,6,6,8,7,6],b:6}]},
  'Ebmaj7':{v:[{n:'バレー6F',f:[-1,6,8,7,8,5],b:6}]},
  'F#':   {v:[{n:'バレー2F',f:[2,4,4,3,2,2],b:2}]},
  'F#m':  {v:[{n:'バレー2F',f:[2,4,4,2,2,2],b:2}]},
  'F#m7': {v:[{n:'バレー2F',f:[2,4,2,2,2,2],b:2}]},
  'F#maj7':{v:[{n:'バレー2F',f:[2,4,3,3,2,2]}]},
  'Gb':   {v:[{n:'バレー2F',f:[2,4,4,3,2,2],b:2}]},
  'G#':   {v:[{n:'バレー4F',f:[4,6,6,5,4,4],b:4}]},
  'G#m':  {v:[{n:'バレー4F',f:[4,6,6,4,4,4],b:4}]},
  'G#m7': {v:[{n:'バレー4F',f:[4,6,4,4,4,4],b:4}]},
  'Ab':   {v:[{n:'バレー4F',f:[4,6,6,5,4,4],b:4}]},
  'Abm':  {v:[{n:'バレー4F',f:[4,6,6,4,4,4],b:4}]},
  'Abmaj7':{v:[{n:'バレー4F',f:[4,6,5,5,4,4]}]},
  'A#':   {v:[{n:'バレー6F',f:[6,8,8,7,6,6],b:6}]},
  'A#m':  {v:[{n:'バレー6F',f:[6,8,8,6,6,6],b:6}]},
  'Bb':   {v:[{n:'バレー1F',f:[-1,1,3,3,3,1],b:1}]},
  'Bbm':  {v:[{n:'バレー1F',f:[-1,1,3,3,2,1],b:1}]},
  'Bbmaj7':{v:[{n:'バレー1F',f:[-1,1,3,2,3,1],b:1}]},
  'Bb7':  {v:[{n:'バレー1F',f:[-1,1,3,1,3,1],b:1}]},
};

// ════════════════════════════════════════
// SVG DIAGRAM RENDERER
// ════════════════════════════════════════
export function drawDiagram(frets, barre, options = {}) {
  // ════════════════════════════════════════
  // 横向きダイアグラム（ナット左・90°回転）
  // X軸 = フレット方向（左がナット）
  // Y軸 = 弦方向（上が6弦・下が1弦）
  // ════════════════════════════════════════
  const scale = options.scale ?? 1;
  const ST=6, FC=4;
  // sS: 弦間隔(Y), fS: フレット間隔(X)
  const sS=11*scale, fS=14*scale;
  // マージン
  const mL=24*scale, mT=7*scale, mR=10*scale, mB=12*scale;
  // ミュート/開放記号のための左側スペース
  const symW=12*scale;
  // グリッドサイズ
  const gW=fS*FC, gH=sS*(ST-1);
  const W=symW+mL+gW+mR, H=mT+gH+mB;

  const pressed=frets.filter(f=>f>0);
  let sf=1;
  if(barre&&barre>0){
    sf=barre;
  } else if(pressed.length){
    const mn=Math.min(...pressed),mx=Math.max(...pressed);
    if(mx>4) sf=mn;
  }

  const rootStyle=getComputedStyle(document.body);
  const C=rootStyle.getPropertyValue('--diag-stroke').trim()||'#e2e6f0';
  const MC='#ff5c5c',OC='#3ddc84',DC='#4f9eff',BC='rgba(79,158,255,.8)';

  // グリッド原点
  const ox=symW+mL, oy=mT;

  let s=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  // scaleに連動するサイズ定数
  const natW=5*scale, natRx=2*scale;
  const fSize=Math.round(11*scale);
  const barW=9*scale, barRx=4*scale, barPad=4*scale;
  const dotR=5*scale, barreDotR=4*scale;
  const openR=4*scale, openSW=1.5*scale;
  const xFSize=Math.round(11*scale);

  // ナット or フレット番号ラベル
  if(sf===1){
    s+=`<rect x="${ox-natW}" y="${oy}" width="${natW}" height="${gH}" rx="${natRx}" fill="${C}" opacity=".8"/>`;
  } else {
    s+=`<text x="${ox-natW-2}" y="${oy+gH/2+fSize*0.4}" font-size="${fSize}" font-weight="bold" fill="${C}" text-anchor="end" font-family="IBM Plex Mono,monospace">${sf}fr</text>`;
  }

  // 弦線（横線 × 6本）
  for(let i=0;i<ST;i++){
    const y=oy+i*sS;
    s+=`<line x1="${ox}" y1="${y}" x2="${ox+gW}" y2="${y}" stroke="${C}" stroke-width=".8" opacity=".5"/>`;
  }

  // フレット線（縦線 × FC本）
  for(let i=1;i<=FC;i++){
    const x=ox+i*fS;
    s+=`<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy+gH}" stroke="${C}" stroke-width=".5" opacity=".3"/>`;
  }

  // セーハバー（縦長の丸角rect）
  if(barre&&barre>0){
    const bf=barre-sf;
    if(bf>=0&&bf<FC){
      const bx=ox+bf*fS+fS/2;
      // frets順はi=0が6弦(下)なので反転してY計算
      let ti=ST-1, bi=0;
      for(let i=0;i<ST;i++){if(frets[i]!==-1){bi=ST-1-i;break;}}
      for(let i=ST-1;i>=0;i--){if(frets[i]!==-1){ti=ST-1-i;break;}}
      if(ti>bi){const tmp=ti;ti=bi;bi=tmp;}
      s+=`<rect x="${bx-barW/2}" y="${oy+ti*sS-barPad}" width="${barW}" height="${(bi-ti)*sS+barPad*2}" rx="${barRx}" fill="${BC}"/>`;
    }
  }

  // ドット・ミュート・開放
  // frets[0]=6弦(下), frets[5]=1弦(上) → y を反転
  for(let i=0;i<ST;i++){
    const f=frets[i];
    const y=oy+(ST-1-i)*sS;
    if(f===-1){
      s+=`<text x="${ox-mL/2-2}" y="${y+xFSize*0.4}" font-size="${xFSize}" text-anchor="middle" fill="${MC}" font-family="sans-serif">✕</text>`;
    } else if(f===0){
      // 開放弦の○は非表示
    } else {
      const fp=f-sf;
      if(fp>=0&&fp<FC){
        const dx=ox+fp*fS+fS/2;
        const isBarreDot=(barre&&f===barre);
        if(!isBarreDot){
          s+=`<circle cx="${dx}" cy="${y}" r="${dotR}" fill="${DC}" opacity=".95"/>`;
        }
      }
    }
  }

  return s+`</svg>`;
}

export function lookupChord(name){
  if(!name||name==='N')return null;
  // オンコードを含む完全名でまず検索
  if(CHORD_DB[name])return{name,data:CHORD_DB[name]};
  const n0=name.replace(/♭/g,'b').replace(/♯/g,'#');
  if(CHORD_DB[n0])return{name:n0,data:CHORD_DB[n0]};
  // ベース音を除いたルートで検索
  const base=name.split('/')[0];
  if(CHORD_DB[base])return{name:base,data:CHORD_DB[base]};
  const nb=base.replace(/♭/g,'b').replace(/♯/g,'#');
  if(CHORD_DB[nb])return{name:nb,data:CHORD_DB[nb]};
  return null;
}

// TODO: move to editor.js in phase4
export function showDiagramPanel(chord, capo, callbacks = {}){
  const { onEdit = null, onDelete = null } = callbacks;
  document.getElementById('diag-title').textContent=chord||'';
  const c=document.getElementById('diag-container');
  if(!chord||chord==='N'){c.innerHTML='<div class="diag-empty">コードタグをホバー<br>または上で入力</div>';return;}
  const r=lookupChord(chord);
  const capoInfo=showCapoInfo(chord, capo);
  if(!r){
    c.innerHTML=`${capoInfo}<div class="diag-empty">"${chord}"<br>のダイアグラムは未登録<br><br><small style="color:var(--color-amber)">↑「＋ダイアグラムを手動登録」<br>で追加できます</small></div>`;
    return;
  }
  c.innerHTML=capoInfo;
  r.data.v.forEach(vr=>{
    const d=document.createElement('div');
    d.className='dv';
    if(vr._id) d.dataset.diagId=vr._id;

    const label=document.createElement('div');
    label.className='dv-label';
    label.textContent=vr.n;

    const svg=document.createElement('div');
    svg.className='dv-svg';
    svg.innerHTML=drawDiagram(vr.f,vr.b||null);

    d.appendChild(label);
    d.appendChild(svg);

    // idがある = storage管理対象 → 編集・削除ボタン表示
    if(vr._id && onEdit && onDelete){
      const btnRow=document.createElement('div');
      btnRow.className='dv-btn-row';

      const editBtn=document.createElement('button');
      editBtn.className='dv-btn dv-btn-edit';
      editBtn.textContent='✏️';
      editBtn.title='編集';
      editBtn.onclick=()=>onEdit(r.name, vr._id);

      const delBtn=document.createElement('button');
      delBtn.className='dv-btn dv-btn-del';
      delBtn.textContent='🗑';
      delBtn.title='削除';
      delBtn.onclick=()=>onDelete(r.name, vr._id);

      btnRow.appendChild(editBtn);
      btnRow.appendChild(delBtn);
      d.appendChild(btnRow);
    }

    c.appendChild(d);
  });
}

// TODO: move to editor.js in phase4
export function setDiagRight(chord, capo, callbacks = {}){
  document.getElementById('diag-in').value=chord||'';
  showDiagramPanel(chord, capo, callbacks);
}

// ════════════════════════════════════════
// CHORD DB 永続化（カスタム登録分をlocalStorageに保存）
// ════════════════════════════════════════
export const CHORD_DB_BUILTIN_KEYS = new Set(Object.keys(CHORD_DB));

export function diagKey(name)    { return name.replace(/\//g, '__SLASH__'); }
export function diagKeyDecode(k) { return k.replace(/__SLASH__/g, '/'); }

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function stableId(rawK, n, f) {
  return 'legacy-' + rawK + '-' + n + '-' + JSON.stringify(f);
}

function migrateCustomDiagrams(raw) {
  if (raw && raw.version === 2) return raw;
  const chords = {};
  for (const [rawK, val] of Object.entries(raw || {})) {
    const variants = (val.v || []).map(vr => ({
      id:      stableId(rawK, vr.n, vr.f),
      n:       vr.n,
      f:       vr.f,
      ...(vr.b !== undefined && { b: vr.b }),
      _custom: true,
    }));
    if (variants.length) chords[rawK] = variants;
  }
  return { version: 2, chords };
}

export function saveCustomDiagrams() {
  const chords = {};
  for (const [k, val] of Object.entries(CHORD_DB)) {
    const targets = CHORD_DB_BUILTIN_KEYS.has(k)
      ? val.v.filter(vr => vr._custom)
      : val.v;
    if (!targets.length) continue;
    chords[diagKey(k)] = targets.map(vr => ({
      id:      vr._id || generateId(),
      n:       vr.n,
      f:       vr.f,
      ...(vr.b !== undefined && { b: vr.b }),
      _custom: true,
    }));
  }
  try {
    localStorage.setItem('cs_customDiags', JSON.stringify({ version: 2, chords }));
  } catch(e) {}
}

// ────────────────────────────────────────
// runtime上のカスタム分をクリア（load前・Undo時に使用）
// ────────────────────────────────────────
function clearCustomFromRuntime() {
  for (const k of Object.keys(CHORD_DB)) {
    if (!CHORD_DB_BUILTIN_KEYS.has(k)) delete CHORD_DB[k];
    else CHORD_DB[k].v = CHORD_DB[k].v.filter(vr => !vr._custom);
  }
}

export function loadCustomDiagrams() {
  try {
    const saved = localStorage.getItem('cs_customDiags');
    if (!saved) return;
    const parsed = JSON.parse(saved);
    const data   = migrateCustomDiagrams(parsed);

    if (!parsed.version) {
      localStorage.setItem('cs_customDiags', JSON.stringify(data));
    }

    // clear → rebuild（mergeではなく完全再構築）
    clearCustomFromRuntime();

    for (const [rawK, variants] of Object.entries(data.chords)) {
      const k = diagKeyDecode(rawK);
      if (!CHORD_DB[k]) CHORD_DB[k] = { v: [] };
      CHORD_DB[k].v.push(...variants.map(vr => {
        const runtime = { n: vr.n, f: vr.f, _custom: true, _id: vr.id };
        if (vr.b !== undefined) runtime.b = vr.b;
        return runtime;
      }));
    }
  } catch(e) {}
}

// ────────────────────────────────────────
// Undo stack（ダイアグラム編集用）
// ────────────────────────────────────────
const _diagUndoStack = [];
const UNDO_MAX = 10;

export function diagPushUndo() {
  const snap = localStorage.getItem('cs_customDiags') || 'null';
  _diagUndoStack.push(snap);
  if (_diagUndoStack.length > UNDO_MAX) _diagUndoStack.shift();
}

export function diagUndo() {
  if (!_diagUndoStack.length) return false;
  const snap = _diagUndoStack.pop();
  if (snap === 'null') {
    localStorage.removeItem('cs_customDiags');
  } else {
    localStorage.setItem('cs_customDiags', snap);
  }
  return true;
}

export function diagUndoSize() { return _diagUndoStack.length; }

// ════════════════════════════════════════
// CAPO 移調ロジック
// ════════════════════════════════════════
const NOTES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_ALT={'Db':'C#','Eb':'D#','Fb':'E','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B'};

function noteToIdx(n){
  const norm=NOTE_ALT[n]||n;
  return NOTES.indexOf(norm);
}

export function transposeRoot(root, semitones){
  // ♭/♯を正規化
  const norm=NOTE_ALT[root]||root;
  const idx=NOTES.indexOf(norm);
  if(idx<0)return root; // 不明なルートはそのまま
  const newIdx=(idx+semitones+12)%12;
  // 元がフラット系ならフラット表記に
  const flatRoots=['F','Bb','Eb','Ab','Db','Gb'];
  const sharpRoots=['C','G','D','A','E','B','F#','C#'];
  // 元のルートがフラット系だったらフラットで返す
  const origFlat=Object.keys(NOTE_ALT).includes(root)||root==='Bb'||root==='Eb'||root==='Ab'||root==='Db'||root==='Gb';
  const raw=NOTES[newIdx]; // C# 系
  if(origFlat){
    const flatMap={'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb'};
    return flatMap[raw]||raw;
  }
  return raw;
}

export function transposeChord(chord, semitones){
  if(!chord||chord==='N'||semitones===0)return chord;
  // オンコード分離: Bb/D → root=Bb, bass=D
  const slashIdx=chord.indexOf('/');
  const main=slashIdx>=0?chord.slice(0,slashIdx):chord;
  const bass=slashIdx>=0?chord.slice(slashIdx+1):null;
  // ルートと質（suffix）を分離: C#m7 → root=C#, suffix=m7
  const m=main.match(/^([A-G][b#♭♯]?)(.*)/);
  if(!m)return chord;
  const [,root,suffix]=m;
  const newRoot=transposeRoot(root,semitones);
  let result=newRoot+suffix;
  if(bass){
    const bassM=bass.match(/^([A-G][b#♭♯]?)(.*)/);
    if(bassM){const [,br,bs]=bassM;result+=`/${transposeRoot(br,semitones)}${bs}`;}
    else result+=`/${bass}`;
  }
  return result;
}

export function showCapoInfo(displayChord, capo){
  if(capo===0)return'';
  const realChord=transposeChord(displayChord, capo);
  return`<div style="font-size:10px;color:var(--color-amber);text-align:center;margin-top:4px;font-family:var(--font-mono)">カポ${capo} → 実音: ${realChord}</div>`;
}

// ────────────────────────────────────────
// コード名正規化
// ────────────────────────────────────────
export function normChord(raw) {
  if (!raw || ['N', 'X', 'n'].includes(raw)) return 'N';
  
  const qualityMap = {
    maj: '',
    min: 'm',
    maj7: 'maj7',
    min7: 'm7',
    dom7: '7',
    '7': '7',
    dim: 'dim',
    aug: 'aug',
    sus2: 'sus2',
    sus4: 'sus4',
    hdim7: 'm7b5',
    maj9: 'maj9',
    min9: 'm9',
    add9: 'add9'
  };
  
  if (raw.includes(':')) {
    const [root, quality] = raw.split(':', 2);
    return root + (qualityMap[quality] ?? quality);
  }
  
  return raw;
}

// ════════════════════════════════════════
// CHORD NAME CANONICALIZATION (Phase20)
// ════════════════════════════════════════

const _SUFFIX_ALIAS = {
  // maj7 系
  'maj7': 'maj7', 'M7': 'maj7', 'Maj7': 'maj7',
  // min 系
  'min': 'm', 'mi': 'm', 'minor': 'm',
  'min7': 'm7', 'mi7': 'm7', 'minor7': 'm7',
};

function _unicodeNorm(str) {
  let s = str.normalize('NFKC');
  s = s.replace(/♭/g, 'b').replace(/♯/g, '#');
  s = s.replace(/△/g, 'M');   // △7 → M7 → alias tableでmaj7へ
  return s;
}

export function normalizeChordName(raw) {
  if (!raw || ['N', 'X', 'n', ''].includes(raw)) return raw;

  let s = _unicodeNorm(raw);

  const slashIdx = s.indexOf('/');
  const main = slashIdx >= 0 ? s.slice(0, slashIdx) : s;
  const bassStr = slashIdx >= 0 ? s.slice(slashIdx) : '';

  const m = main.match(/^([A-G][b#]?)(.*)/);
  if (!m) return s;   // Unicode正規化済みのsを返す
  const [, root, suffix] = m;

// suffix を完全一致で alias lookup
  const canonSuffix = Object.prototype.hasOwnProperty.call(_SUFFIX_ALIAS, suffix)
    ? _SUFFIX_ALIAS[suffix]
    : suffix;

  return root + canonSuffix + bassStr;
}

export function findChord(raw) {
  if (!raw || raw === 'N') return null;
  const key = normalizeChordName(raw);
  if (CHORD_DB[key]) return { name: key, data: CHORD_DB[key] };
  const base = key.split('/')[0];
  if (CHORD_DB[base]) return { name: base, data: CHORD_DB[base] };
  return null;
}