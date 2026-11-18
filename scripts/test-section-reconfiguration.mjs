import assert from 'node:assert/strict';
import { validateGeneratedSectionSet } from '../js/sectionSetValidation.js';
import { validateGeneratedSectionSet as v2 } from '../js/sectionAutoGeneration.js';
import {
  buildDraftSectionsFromCurrent, createReconfigurationDraft, updateDraftSection,
  undoDraft, setDraftSectionEndByChordIndex, prepareDraftForAdopt, RECONFIG_GAP_TYPE,
  createReconfigRuntime, teardownReconfigRuntime, draftSectionChordSpans,
} from '../js/sectionReconfiguration.js';
import { replaceSectionsFromDraftCommand, applyGeneratedSectionsCommand } from '../js/analysisCommands.js';
import { undoBuffer } from '../js/analysisSession.js';

const buf = (n=4) => Array.from({length:n}, (_,i)=>({_id:`k${i}`, chord:['C','G','Am','F'][i%4], start:i*2, end:i*2+2}));
const S = (id,s,e,type='verse',name='V') => ({id,type,name,startChordId:`k${s}`,endChordId:`k${e}`});
const st = (b, sections=[]) => ({active:true,buffer:b,sections:structuredClone(sections),history:[],future:[],dirty:false,selection:{chordIds:[],boundaryIndex:null,anchorChordId:null,editPoint:null}});

{
  const b=buf();
  assert.deepEqual(validateGeneratedSectionSet([S('a',0,1,'other','未設定'),S('b',2,3,'other','未設定')],b), v2([S('a',0,1,'other','未設定'),S('b',2,3,'other','未設定')],b));
}
{
  const b=buf(6);
  const built=buildDraftSectionsFromCurrent(b,[S('a',0,1),S('c',4,5)]);
  assert.equal(built.gapsFilled,1);
  assert.ok(built.sections.some(s=>s.type===RECONFIG_GAP_TYPE));
}
{
  const b=buf();
  const draft=createReconfigurationDraft({projectId:'p',buffer:b,sections:[S('a',0,3)]});
  updateDraftSection(draft,'a',{name:'X'});
  assert.equal(draft.sections[0].name,'X');
  undoDraft(draft);
  assert.equal(draft.sections[0].name,'V');
}
{
  const b=buf(6);
  const draft=createReconfigurationDraft({projectId:'p',buffer:b,sections:[S('a',0,2),S('b',3,5)]});
  const r=setDraftSectionEndByChordIndex(draft,0,1,b);
  assert.equal(r.ok,true);
  assert.equal(draft.sections[0].endChordId,'k1');
}
{
  const b=buf();
  const state=st(b,[S('old',0,3)]);
  const r=replaceSectionsFromDraftCommand(state,[S('n1',0,1,'chorus','A'),S('n2',2,3,'verse','B')]);
  assert.equal(r.ok,true);
  assert.equal(state.history.length,1);
  undoBuffer(state);
  assert.equal(state.sections[0].id,'old');
  assert.equal(applyGeneratedSectionsCommand(state,[S('x',0,3)]).reason,'sections-already-exist');
}
{
  const rt=createReconfigRuntime();
  rt.draft=createReconfigurationDraft({projectId:'old',buffer:buf(),sections:[S('a',0,3)]});
  rt.modalOpen=true;
  rt.audioSnapshot={timeSec:1,speedPct:100};
  const r=teardownReconfigRuntime(rt,{restoreAudio:false});
  assert.equal(r.adopt,false);
  assert.equal(rt.draft,null);
}
{
  const b=buf();
  const draft=createReconfigurationDraft({projectId:'p',buffer:b,sections:[S('a',0,3)]});
  const spans=draftSectionChordSpans(draft,b);
  assert.equal(spans[0].start,0);
  assert.equal(spans[0].end,3);
}
console.log('test-section-reconfiguration: ok');
