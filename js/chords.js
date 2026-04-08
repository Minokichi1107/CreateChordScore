// ════════════════════════════════════════
// CHORD DATABASE
// frets[6]: 6弦→1弦  -1=ミュート 0=開放
// ════════════════════════════════════════
export const CHORD_DB = {
  'C':    {v:[{n:'ロー',f:[0,3,2,0,1,0]},{n:'バレー3F',f:[-1,-1,3,5,5,3],b:3},{n:'ハイ8F',f:[-1,-1,10,9,8,8],b:8}]},
  'Cm':   {v:[{n:'バレー3F',f:[-1,3,5,5,4,3],b:3}]},
  'Cmaj7':{v:[{n:'ロー',f:[0,3,2,0,0,0]},{n:'バレー3F',f:[-1,-1,3,5,4,3],b:3}]},
  'Cm7':  {v:[{n:'バレー3F',f:[-1,3,5,3,4,3],b:3}]},
  'C7':   {v:[{n:'ロー',f:[0,3,2,3,1,0]},{n:'バレー3F',f:[-1,3,5,3,5,3],b:3}]},
  'Csus2':{v:[{n:'ロー',f:[0,3,0,0,1,0]}]},
  'Csus4':{v:[{n:'ロー',f:[0,3,3,0,1,3]}]},
  'Cadd9':{v:[{n:'ロー',f:[0,3,2,0,3,0]}]},
  'D':    {v:[{n:'ロー',f:[-1,-1,0,2,3,2]},{n:'バレー5F',f:[-1,-1,5,7,7,5],b:5}]},
  'Dm':   {v:[{n:'ロー',f:[-1,-1,0,2,3,1]},{n:'バレー5F',f:[-1,-1,5,7,6,5],b:5}]},
  'Dmaj7':{v:[{n:'ロー',f:[-1,-1,0,2,2,2]}]},
  'Dm7':  {v:[{n:'ロー',f:[-1,-1,0,2,1,1]},{n:'バレー5F',f:[-1,-1,5,7,5,5],b:5}]},
  'D7':   {v:[{n:'ロー',f:[-1,-1,0,2,1,2]}]},
  'Dsus4':{v:[{n:'ロー',f:[-1,-1,0,2,3,3]}]},
  'Dadd9':{v:[{n:'ロー',f:[-1,-1,0,2,3,0]}]},
  'E':    {v:[{n:'ロー',f:[0,2,2,1,0,0]},{n:'バレー7F',f:[-1,-1,7,9,9,7],b:7}]},
  'Em':   {v:[{n:'ロー',f:[0,2,2,0,0,0]},{n:'バレー7F',f:[-1,-1,7,9,8,7],b:7}]},
  'Emaj7':{v:[{n:'ロー',f:[0,2,1,1,0,0]}]},
  'Em7':  {v:[{n:'ロー',f:[0,2,2,0,3,0]},{n:'バレー7F',f:[-1,-1,7,9,7,7],b:7}]},
  'E7':   {v:[{n:'ロー',f:[0,2,0,1,0,0]}]},
  'Esus4':{v:[{n:'ロー',f:[0,2,2,2,0,0]}]},
  'F':    {v:[{n:'バレー1F',f:[1,3,3,2,1,1],b:1},{n:'ハイ5F',f:[-1,-1,3,5,5,5]}]},
  'Fm':   {v:[{n:'バレー1F',f:[1,3,3,1,1,1],b:1}]},
  'Fmaj7':{v:[{n:'ロー',f:[0,3,3,2,1,0]},{n:'バレー1F',f:[1,3,3,2,1,0]}]},
  'Fm7':  {v:[{n:'バレー1F',f:[1,3,3,1,4,1],b:1}]},
  'F7':   {v:[{n:'バレー1F',f:[1,3,1,2,1,1],b:1}]},
  'G':    {v:[{n:'ロー',f:[3,2,0,0,0,3]},{n:'ロー2',f:[3,2,0,0,3,3]},{n:'バレー3F',f:[3,5,5,4,3,3],b:3}]},
  'Gm':   {v:[{n:'バレー3F',f:[3,5,5,3,3,3],b:3}]},
  'Gmaj7':{v:[{n:'ロー',f:[3,2,0,0,0,2]}]},
  'Gm7':  {v:[{n:'バレー3F',f:[3,5,3,3,3,3],b:3}]},
  'G7':   {v:[{n:'ロー',f:[3,2,0,0,0,1]},{n:'バレー3F',f:[3,5,3,4,3,3],b:3}]},
  'Gsus4':{v:[{n:'ロー',f:[3,3,0,0,1,3]}]},
  'Gadd9':{v:[{n:'ロー',f:[3,2,0,2,0,3]}]},
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
  'C#':   {v:[{n:'バレー4F',f:[-1,-1,4,6,6,4],b:4}]},
  'C#m':  {v:[{n:'バレー4F',f:[-1,-1,4,6,5,4],b:4}]},
  'C#m7': {v:[{n:'バレー4F',f:[-1,-1,4,6,4,4],b:4}]},
  'C#maj7':{v:[{n:'バレー4F',f:[-1,-1,4,6,5,4],b:4}]},
  'Db':   {v:[{n:'バレー4F',f:[-1,-1,4,6,6,4],b:4}]},
  'D#':   {v:[{n:'バレー6F',f:[-1,-1,6,8,8,6],b:6}]},
  'D#m':  {v:[{n:'バレー6F',f:[-1,-1,6,8,7,6],b:6}]},
  'Eb':   {v:[{n:'バレー6F',f:[-1,-1,5,7,7,5],b:5}]},
  'Ebm':  {v:[{n:'バレー6F',f:[-1,-1,6,8,7,6],b:6}]},
  'Ebmaj7':{v:[{n:'バレー6F',f:[-1,-1,5,7,6,5],b:5}]},
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
  'Bbmaj7':{v:[{n:'バレー1F',f:[-1,1,3,2,3,0]}]},
  'Bb7':  {v:[{n:'バレー1F',f:[-1,1,3,1,3,1],b:1}]},
};

// ════════════════════════════════════════
// SVG DIAGRAM RENDERER
// ════════════════════════════════════════
export function drawDiagram(frets, barre) {
  const ST=6,FC=4;
  const mL=40,mT=30,sS=14,fS=18;
  const gW=sS*(ST-1), gH=fS*FC;
  const LM=6; // viewBox左マージン（frラベルがクリップされないよう）
  const W=LM+mL+gW+14, H=mT+gH+12;
  const pressed=frets.filter(f=>f>0);
  let sf=1;
  if(barre&&barre>0){
    sf=barre;
  } else if(pressed.length){
    const mn=Math.min(...pressed),mx=Math.max(...pressed);
    if(mx>4) sf=mn;
  }
  const C='#e2e6f0',MC='#ff5c5c',OC='#3ddc84',DC='#4f9eff',BC='rgba(79,158,255,.8)';
  // viewBoxをLM分左にずらしてfrラベルのスペースを確保
  let s=`<svg width="${W}" height="${H}" viewBox="${-LM} 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  // ナット or フレット番号ラベル
  if(sf===1){
    s+=`<rect x="${mL}" y="${mT-5}" width="${gW}" height="6" rx="2" fill="${C}" opacity=".75"/>`;
  } else {
    // frラベルをグリッド左端から余裕を持たせて表示
    s+=`<text x="${mL-6}" y="${mT+fS*.75}" font-size="13" font-weight="bold" fill="#dde2ee" text-anchor="end" font-family="IBM Plex Mono,monospace">${sf}fr</text>`;
  }
  // フレット線
  for(let i=1;i<=FC;i++){const y=mT+i*fS;s+=`<line x1="${mL}" y1="${y}" x2="${mL+gW}" y2="${y}" stroke="${C}" stroke-width=".6" opacity=".3"/>`;}
  // 弦
  for(let i=0;i<ST;i++){const x=mL+i*sS;s+=`<line x1="${x}" y1="${mT}" x2="${x}" y2="${mT+gH}" stroke="${C}" stroke-width=".8" opacity=".45"/>`;}
  // セーハバー
  if(barre&&barre>0){
    const bf=barre-sf;
    if(bf>=0&&bf<FC){
      const by=mT+bf*fS+fS/2;
      let fi=0,li=ST-1;
      for(let i=0;i<ST;i++){if(frets[i]!==-1){fi=i;break;}}
      for(let i=ST-1;i>=0;i--){if(frets[i]!==-1){li=i;break;}}
      s+=`<rect x="${mL+fi*sS-4}" y="${by-7}" width="${(li-fi)*sS+8}" height="14" rx="7" fill="${BC}"/>`;
    }
  }
  // ドット・ミュート・開放
  for(let i=0;i<ST;i++){
    const f=frets[i],x=mL+i*sS;
    if(f===-1){
      s+=`<text x="${x}" y="${mT-13}" font-size="12" text-anchor="middle" fill="${MC}" font-family="sans-serif">✕</text>`;
    } else if(f===0){
      s+=`<circle cx="${x}" cy="${mT-16}" r="5" fill="none" stroke="${OC}" stroke-width="1.5"/>`;
    } else {
      const fp=f-sf;
      if(fp>=0&&fp<FC){
        const dy=mT+fp*fS+fS/2;
        const isBarreDot=(barre&&f===barre);
        s+=`<circle cx="${x}" cy="${dy}" r="${isBarreDot?5:6}" fill="${DC}" opacity="${isBarreDot?.6:.95}"/>`;
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
export function showDiagramPanel(chord, capo){
  document.getElementById('diag-title').textContent=chord||'';
  const c=document.getElementById('diag-container');
  if(!chord||chord==='N'){c.innerHTML='<div class="diag-empty">コードタグをホバー<br>または上で入力</div>';return;}
  const r=lookupChord(chord);
  const capoInfo=showCapoInfo(chord, capo);
  if(!r){
    c.innerHTML=`${capoInfo}<div class="diag-empty">"${chord}"<br>のダイアグラムは未登録<br><br><small style="color:var(--amber)">↑「＋ダイアグラムを手動登録」<br>で追加できます</small></div>`;
    return;
  }
  c.innerHTML=capoInfo;
  r.data.v.forEach(vr=>{
    const d=document.createElement('div');d.className='dv';
    d.innerHTML=`<div class="dv-label">${vr.n}</div><div class="dv-svg">${drawDiagram(vr.f,vr.b||null)}</div>`;
    c.appendChild(d);
  });
}

// TODO: move to editor.js in phase4
export function setDiagRight(chord, capo){
  document.getElementById('diag-in').value=chord||'';
  showDiagramPanel(chord, capo);
}

// ════════════════════════════════════════
// CHORD DB 永続化（手動登録分をlocalStorageに保存）
// ════════════════════════════════════════
export const CHORD_DB_BUILTIN_KEYS = new Set(Object.keys(CHORD_DB));

export function diagKey(name){return name.replace(/\//g,'__SLASH__');}
export function diagKeyDecode(k){return k.replace(/__SLASH__/g,'/');}

export function saveCustomDiagrams() {
  const custom = {};
  for (const [k, v] of Object.entries(CHORD_DB)) {
    if (!CHORD_DB_BUILTIN_KEYS.has(k)) {
      custom[diagKey(k)] = v;
    } else {
      const customVariants = v.v.filter(vr => vr._custom);
      if (customVariants.length) custom[diagKey(k)] = { v: customVariants };
    }
  }
  try { localStorage.setItem('cs_customDiags', JSON.stringify(custom)); } catch(e) {}
}

export function loadCustomDiagrams() {
  try {
    const saved = localStorage.getItem('cs_customDiags');
    if (!saved) return;
    const custom = JSON.parse(saved);
    for (const [rawK, v] of Object.entries(custom)) {
      const k = diagKeyDecode(rawK);
      if (!CHORD_DB[k]) CHORD_DB[k] = { v: [] };
      v.v.forEach(vr => {
        vr._custom = true;
        const ei = CHORD_DB[k].v.findIndex(x => x.n === vr.n);
        if (ei >= 0) CHORD_DB[k].v[ei] = vr; else CHORD_DB[k].v.push(vr);
      });
    }
  } catch(e) {}
}

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
  return`<div style="font-size:10px;color:var(--amber);text-align:center;margin-top:4px;font-family:var(--mono)">カポ${capo} → 実音: ${realChord}</div>`;
}
