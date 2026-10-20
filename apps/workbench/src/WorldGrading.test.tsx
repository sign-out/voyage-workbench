import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,hash,type Project} from '../../../packages/core/project';
import {bundledRubric,gradingSnapshot,type GradeReport,type GradeScore} from '../../../packages/core/world-grading';

const cssHook=registerHooks({load(url,context,nextLoad){return url.endsWith('/world-grading.css')?{format:'module',source:'export {};',shortCircuit:true}:nextLoad(url,context);}});
const {WorldGrading}=await import('./WorldGrading');
cssHook.deregister();
const selection={path:'universal',overlay:'standard',rationale:'The opening and blurb promise an open-ended sandbox.'};
const snapshot=gradingSnapshot(bundledRubric,selection);
const world=()=>create('grading-project','Test world','{"name":"World","worldBackground":"A patient mystery."}',1);
const score:GradeScore={lower:48.25,upper:76,max:100,coverage:.72,sections:[{id:'Discover',lower:18,upper:25,max:30},{id:'Activate',lower:12,upper:20,max:25}]};
function report(project:Project,overrides:Partial<GradeReport>={}):GradeReport{
 return {id:'report-1',taskId:'task-1',sourceHash:hash(project.activeSource),rubricHash:snapshot.rubricHash,rubricTitle:bundledRubric.title,rubricVersion:bundledRubric.version,created:1000,selection,
  summary:'<script>alert("unsafe")</script> Keep this as text.',strengths:['An evocative setting'],criteria:[{id:'P1',grade:3,feedback:'The player promise is legible.',evidence:[{path:['worldBackground'],quote:'<img src=x onerror=alert(1)> A patient mystery.'}],improvement:'Show a meaningful opening choice.'},{id:'P3',grade:'NE',feedback:'No supplied image evidence.',evidence:[],improvement:'Supply an inspectable cover.'}],
  gates:[{id:'G1',status:'NE',explanation:'Missing source evidence.'}],diagnostics:{cover:{score:'NE',explanation:'No cover supplied.'},title:{score:75,explanation:'Specific title.'},blurb:{score:62,explanation:'A readable promise.'},storyStart:{score:55,explanation:'Opening needs a decision.'},characterCreator:{score:'NE',explanation:'Creator not supplied.'}},
  fixes:[{id:'fix-1',criterionIds:['P1'],priority:'high',title:'Clarify the first choice',why:'Make agency explicit.',requirements:['Preserve the premise.'],allowedPaths:[['worldBackground']]}],scores:{universal:score,adaptive:{...score,lower:50,upper:80}},missingEvidence:['Cover image'],promises:['Investigate the mystery'],intent:'Original setting',assessmentMode:'offline_static_source_only',certification:'not_assessed',...overrides};
}
function render(project=world(),busy=false){
 const calls:unknown[]=[];
 const html=renderToStaticMarkup(<WorldGrading project={project} busy={busy} onCommand={async command=>{calls.push(command);}} onStart={async value=>{calls.push(value);}} onStop={async()=>{calls.push('stop');}} onNavigate={tab=>calls.push(tab)}/>);
 assert.deepEqual(calls,[],'render must never start grading, issue commands, stop tasks, or navigate');
 return html;
}
test('empty grading section uses built-in v1.6 labels and explicit source-only cost warnings',()=>{
 const html=render();
 for(const phrase of ['World Grading','Built-in rubric v1.6','Progression / Power Growth','Creator-first entry','Fixed identity / immediate scene','512 KiB','Source-only, not runtime certification.','API providers may charge','no fixes are applied','Your first assessment starts here'])assert.ok(html.includes(phrase),phrase);
 assert.match(html,/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Grade world/);
 assert.doesNotMatch(html,/Suggest Work Order/);
});
test('selection, rubric import, and rationale have associated accessible form labels',()=>{
 const html=render();
 for(const suffix of ['import','path','secondary','overlay','rationale']){
  const control=html.match(new RegExp(`<(?:input|select|textarea)[^>]*id="([^"]*-${suffix})"`));
  assert.ok(control,`${suffix} control exists`);
  assert.ok(html.includes(`for="${control[1]}"`),`${suffix} has a label`);
 }
 assert.match(html,/<textarea[^>]*required=""/);
 assert.match(html,/<fieldset[^>]*><legend>Genre path and entry overlay/);
 assert.match(html,/<select[^>]*id="[^"]*-secondary"[^>]*disabled=""/);
 assert.match(html,/Hybrids require two distinct specialist paths/);
 assert.match(html,/aria-describedby="[^"]*-safety"/);
 assert.match(html,/role="status"/);
});
test('running and prepared grading keep previous reports readable and expose cancel',()=>{
 for(const state of ['PREPARED','RUNNING']){
  const project=world();project.grading={reports:[report(project)]};
  project.tasks=[{id:'task-2',attempt:'attempt',kind:'plan',state,prompt:'Grade',reply:'',baseSource:project.activeSource,baseHash:hash(project.activeSource),stagedSource:project.activeSource,workOrder:project.workOrder,created:2000,grading:snapshot}];
  const html=render(project,true);
  assert.ok(html.includes(`Assessment ${state.toLowerCase()}. Previous reports remain available.`));
  assert.match(html,/>Cancel grading</);
  assert.match(html,/Assessment report/);
  assert.match(html,/<fieldset disabled=""/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>Suggest Work Order/);
 }
});
test('reports show bounded scores, weighted coverage, source evidence and optional planning proposals',()=>{
 const project=world();project.grading={reports:[report(project)]};const html=render(project);
 for(const phrase of ['Universal anchor','Selected adaptive path','48.25','76','72%','Discover','What’s working','Traceable player promises','Criterion feedback','NE · not evidenced','Show a meaningful opening choice.','Gates and non-additive diagnostics','Story start','Character creator','Missing evidence','Suggest Work Order','Review and explicitly approve a Work Order in Planning','Source matches current world','Rubric matches current rubric'])assert.ok(html.includes(phrase),phrase);
 assert.match(html,/<code>\[&quot;worldBackground&quot;\]<\/code>/);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img src=x/);
 assert.doesNotMatch(html,/<script>|<img src=x/);
 assert.match(html,/<details[^>]*><summary>Source evidence/);
 assert.match(html,/<button type="button">Suggest Work Order/);
});
test('source and rubric staleness independently disable proposals without removing history',()=>{
 for(const stale of ['source','rubric','both']){
  const project=world(),old=report(project);
  if(stale!=='rubric')old.sourceHash='old-source';
  if(stale!=='source')old.rubricHash='old-rubric';
  project.grading={reports:[old,report(project,{id:'report-older',created:500})]};
  const html=render(project);
  if(stale!=='rubric')assert.match(html,/Source changed · stale report/);
  if(stale!=='source')assert.match(html,/Rubric changed · stale report/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>Suggest Work Order/);
  assert.match(html,/report-older/);assert.match(html,/Report history/);assert.match(html,/Regrade world/);
 }
});
test('reopening grading reuses the last committed lens for a one-click regrade',()=>{
 const project=world();project.grading={reports:[report(project)]};
 const html=render(project);
 assert.match(html,/<button[^>]*type="submit"[^>]*>Regrade world/);
 assert.doesNotMatch(html,/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Regrade world/);
 assert.ok(html.includes(selection.rationale));
});
test('unapplied drafts block grading and fix proposals with an explicit explanation',()=>{
 const project=world();project.draft={path:['name'],text:'"Changed"',baseHash:hash(project.activeSource)};project.grading={reports:[report(project)]};
 const html=render(project);
 assert.match(html,/Unapplied draft: apply or discard the world draft before grading/);
 assert.match(html,/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Regrade world/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Suggest Work Order/);
});
test('ordinary active assistant tasks block grading and fixes even when busy is false',()=>{
 for(const kind of ['plan','work'] as const){
  for(const state of ['PREPARED','RUNNING']){
   const project=world();project.grading={reports:[report(project)]};
   project.tasks=[{id:'ordinary-task',attempt:'attempt',kind,state,prompt:'Existing work',reply:'',baseSource:project.activeSource,baseHash:hash(project.activeSource),stagedSource:project.activeSource,workOrder:project.workOrder,created:2000}];
   const html=render(project,false);
   assert.match(html,/Finish or stop the existing assistant task before grading or suggesting fixes/);
   assert.match(html,/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Regrade world/);
   assert.match(html,/<button[^>]*disabled=""[^>]*>Suggest Work Order/);
   assert.doesNotMatch(html,/>Cancel grading</);
  }
 }
});
test('historical criteria use original snapshot labels or IDs, never replacement rubric labels',()=>{
 const project=world();
 const originalRubric={...bundledRubric,criteria:bundledRubric.criteria.map(criterion=>criterion.id==='P1'?{...criterion,name:'Original saved criterion'}:criterion)};
 const originalSnapshot=gradingSnapshot(originalRubric,selection);
 const replacement={...bundledRubric,criteria:bundledRubric.criteria.map(criterion=>criterion.id==='P1'?{...criterion,name:'Replacement criterion must not relabel history'}:criterion)};
 project.grading={rubric:replacement,reports:[report(project,{rubricHash:originalSnapshot.rubricHash})]};
 project.tasks=[{id:'task-1',attempt:'attempt',kind:'plan',state:'COMPLETED',prompt:'Grade',reply:'',baseSource:project.activeSource,baseHash:hash(project.activeSource),stagedSource:project.activeSource,workOrder:project.workOrder,created:1000,grading:originalSnapshot}];
 const saved=render(project);
 assert.match(saved,/P1 · Original saved criterion/);assert.doesNotMatch(saved,/Replacement criterion must not relabel history/);
 project.tasks=[];
 const missing=render(project);
 assert.match(missing,/Original rubric snapshot unavailable/);assert.match(missing,/<h5>P1<\/h5>/);assert.doesNotMatch(missing,/Replacement criterion must not relabel history/);
});
test('rubric identity is stable when imported profile and overlay insertion order changes',()=>{
 const project=world();
 project.grading={rubric:{...bundledRubric,adaptive_paths:{...bundledRubric.adaptive_paths,profiles:Object.fromEntries(Object.entries(bundledRubric.adaptive_paths.profiles).reverse()),entry_overlays:Object.fromEntries(Object.entries(bundledRubric.adaptive_paths.entry_overlays).reverse())}},reports:[report(project)]};
 const html=render(project);
 assert.match(html,/Rubric matches current rubric/);assert.doesNotMatch(html,/Rubric changed · stale report/);
 assert.doesNotMatch(html,/<header/);
});
test('failed and canceled runs preserve existing reports and communicate status safely',()=>{
 const project=world();project.grading={reports:[report(project)]};
 project.tasks=[{id:'task-2',attempt:'attempt',kind:'plan',state:'FAILED',prompt:'Grade',reply:'',baseSource:project.activeSource,baseHash:hash(project.activeSource),stagedSource:project.activeSource,workOrder:project.workOrder,created:2000,grading:snapshot,error:'<provider unavailable>'}];
 const html=render(project);
 assert.match(html,/role="alert">&lt;provider unavailable&gt;/);assert.match(html,/Assessment report/);assert.doesNotMatch(html,/>Cancel grading</);
 project.tasks[0].state='CANCELED';project.tasks[0].error='';
 assert.match(render(project),/Cancelled assessments do not replace previous reports/);
});
test('grading styles protect narrow layouts, keyboard focus, and readable evidence',()=>{
 const css=readFileSync(new URL('./world-grading.css',import.meta.url),'utf8');
 for(const phrase of ['@media(max-width:760px)','grid-template-columns:1fr','focus-visible','min-height:44px','overflow-wrap:anywhere','white-space:pre-wrap','prefers-reduced-motion'])assert.ok(css.includes(phrase),phrase);
});
