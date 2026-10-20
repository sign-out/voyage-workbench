import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
import {bundledRubric,gradingPrompt,gradingSnapshot,parseGradeReport,parseRubric} from './world-grading';
import type {GradeDiagnostic,GradeReport,GradeSelection,Rubric} from './world-grading';

const source=JSON.stringify({shortId:'package-id',initialGameState:{heroesVersion:36,title:'Harbor of Echoes',blurb:'Trade stories at the harbor. Choose a vessel.',opening:'The ferryman asks, "Where next?"\nChoose a vessel.',crew:[{name:'Mara'}]}});
const selection:GradeSelection={path:'progression',overlay:'standard',rationale:'Precommitted: the listing, opening and progression contract all emphasize earned navigation skills.'};
const metadata={id:'report',taskId:'grading-task',sourceHash:'host-computed-source-hash',created:123};
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
type Output=Pick<GradeReport,'summary'|'strengths'|'criteria'|'gates'|'diagnostics'|'fixes'|'missingEvidence'|'promises'|'intent'>;
function diagnostic(rubric:Rubric['cover_rubric']):GradeDiagnostic {
 const definitions=rubric.dimensions??rubric.rubric??[];
 return {score:100,explanation:'Source-grounded static diagnostic judgment only.',dimensions:definitions.map(dimension=>({id:dimension.id,grade:rubric.dimensions?10:4,evidence:[{path:['initialGameState','title'],quote:'Harbor of Echoes'}]}))};
}
function output(grade:0|1|2|3|4|'NE'=4):Output {
 return {
  summary:'Static source specifies a harbor fantasy; runtime behavior is unverified.',strengths:['The title establishes a distinct setting.'],
  criteria:bundledRubric.criteria.map(criterion=>({id:criterion.id,grade,feedback:'Source describes the harbor; all conclusions are static.',evidence:grade==='NE'?[]:[{path:['initialGameState','title'],quote:'Harbor of Echoes'}],improvement:'Trace each promise to a governed action.'})),
  gates:bundledRubric.gates.concat(bundledRubric.optional_new_hard_checks).map(gate=>({id:gate.id,status:'PASS' as 'PASS'|'FAIL'|'NE',explanation:'Source-level design check only; no runtime verification.'})),
  diagnostics:{cover:diagnostic(bundledRubric.cover_rubric),title:diagnostic(bundledRubric.title_rubric),blurb:diagnostic(bundledRubric.blurb_rubric),storyStart:diagnostic(bundledRubric.story_start_rubric),characterCreator:diagnostic(bundledRubric.character_creator_rubric)},
  fixes:[{id:'fix-opening',criterionIds:['A1','D1'],priority:'high',title:'Clarify first-action ownership',why:'The opening names a choice but not its state contract.',requirements:['Specify the next action owner and limits.'],allowedPaths:[['initialGameState','opening']] as (string|number)[][]}],
  missingEvidence:[] as string[],promises:['Choose a vessel.'],intent:'Original world, based on authored source.'
 };
}
function parse(input:unknown,snapshot=gradingSnapshot(undefined,selection)){
 return parseGradeReport(typeof input==='string'?input:JSON.stringify(input),snapshot,source,metadata);
}
function replaceCriterion(input:ReturnType<typeof output>,id:string,grade:0|1|2|3|4|'NE'){
 const criterion=input.criteria.find(entry=>entry.id===id)!;criterion.grade=grade;
 if(grade!=='NE')criterion.evidence=[{path:['initialGameState','title'],quote:'Harbor of Echoes'}];
}
function setDiagnostic(input:Output,key:'cover'|'title'|'blurb',score:number){
 input.diagnostics[key].score=score;
 for(const dimension of input.diagnostics[key].dimensions!)dimension.grade=score/10;
}

test('bundled rubric imports the complete uploaded matrix and supplemental instructions',()=>{
 const bundled=JSON.parse(readFileSync(new URL('./world-rubric.json',import.meta.url),'utf8'));
 assert.deepEqual(parseRubric(bundled),bundled);assert.deepEqual(parseRubric(JSON.stringify(bundled)),bundled);
 assert.equal(bundledRubric.version,'1.6');assert.equal(bundledRubric.criteria.length,16);
 assert.equal(Object.keys(bundledRubric.adaptive_paths.profiles).length,8);
 assert.equal(bundledRubric.optional_new_hard_checks.length,2);
 assert.equal(bundledRubric.require_play_testing,false);assert.equal(bundledRubric.require_live_UI,false);
 assert.deepEqual(bundledRubric.new_static_probes,bundled.new_static_probes);
 assert(Object.isFrozen(bundledRubric));
});

test('rubric imports preserve supplemental instructions without sharing input references',()=>{
 const rubric=copy(bundledRubric);rubric.extra_instructions={nested:['Keep promises honest.'],enabled:true};
 const parsed=parseRubric(rubric);assert.deepEqual(parsed.extra_instructions,rubric.extra_instructions);
 (rubric.extra_instructions as {nested:string[]}).nested.push('Changed');
 assert.deepEqual(parsed.extra_instructions,{nested:['Keep promises honest.'],enabled:true});
});
test('imports reject changes to formulas the scoring engine cannot execute',()=>{
 const overrides=copy(bundledRubric);overrides.grading.overrides.P3='path_weight_P3*adjusted_cover_diagnostic/100';
 assert.throws(()=>parseRubric(overrides),/Unsupported scoring change.*overrides.P3/);
 const scoring=copy(bundledRubric);scoring.adaptive_paths.scoring.p3_formula='weight_P3 * adjusted_cover_diagnostic/100';
 assert.throws(()=>parseRubric(scoring),/Unsupported scoring change.*p3_formula/);
});
test('diagnostic caps with prose qualifiers or exceptions require explicit evaluation',()=>{
 const input=output();
 input.diagnostics.blurb.dimensions!.find(dimension=>dimension.id==='B-C')!.grade=3;
 let report=parse(input);
 assert.ok(report.diagnostics.blurb.score!=='NE'&&report.diagnostics.blurb.score>69);
 input.diagnostics.blurb.dimensions!.find(dimension=>dimension.id==='B-C')!.grade=10;
 for(const id of ['B-B','B-D'])input.diagnostics.blurb.dimensions!.find(dimension=>dimension.id===id)!.grade=3;
 report=parse(input);
 assert.ok(report.diagnostics.blurb.score!=='NE'&&report.diagnostics.blurb.score>69);
 input.diagnostics.blurb.caps=[{condition:'B-B < 4 and B-D < 4',explanation:'No documented mystery exception applies to this source.'}];
 assert.equal(parse(input).diagnostics.blurb.score,69);
});

test('incomplete or unsupported imported rubrics fail clearly rather than silently falling back',()=>{
 for(const input of [null,[],{},'not JSON',{title:'Custom'}, {...bundledRubric,assessment_mode:'live_gameplay'}])assert.throws(()=>parseRubric(input));
 for(const key of ['adaptive_paths','cover_rubric','static_verification_protocol','grading']){
  const rubric=copy(bundledRubric);delete (rubric as Record<string,unknown>)[key];assert.throws(()=>parseRubric(rubric),new RegExp(key));
 }
 for(const key of ['social','universal']){
  const rubric=copy(bundledRubric);delete rubric.adaptive_paths.profiles[key];assert.throws(()=>parseRubric(rubric),/missing adaptive profile/);
 }
 const rubric=copy(bundledRubric);delete rubric.adaptive_paths.entry_overlays.fixed_identity;assert.throws(()=>parseRubric(rubric),/missing entry overlay/);
});

test('rubric validation rejects duplicate ids, nonfinite/negative weights and inconsistent totals',()=>{
 const mutations:((rubric:Rubric)=>void)[]=[
  rubric=>{rubric.criteria[1].id=rubric.criteria[0].id;},
  rubric=>{rubric.sections[1].id=rubric.sections[0].id;},
  rubric=>{rubric.gates[1].id=rubric.gates[0].id;},
  rubric=>{rubric.optional_new_hard_checks[0].id='G1';},
  rubric=>{rubric.sections[0].max_points=31;},
  rubric=>{rubric.criteria[0].max_points=-1;},
  rubric=>{rubric.criteria[0].max_points=NaN;},
  rubric=>{rubric.adaptive_paths.profiles.social.criterion_weights.P1=Infinity;},
  rubric=>{delete rubric.adaptive_paths.profiles.social.criterion_weights.P1;},
  rubric=>{rubric.adaptive_paths.profiles.social.criterion_weights.fake=1;},
  rubric=>{rubric.adaptive_paths.profiles.social.section_weights.Discover=99;},
  rubric=>{rubric.adaptive_paths.profiles.social.total=99;},
  rubric=>{rubric.adaptive_paths.entry_overlays.creator_first.weight_delta.A1=1;},
  rubric=>{rubric.adaptive_paths.entry_overlays.standard.weight_delta={A1:1,A2:-1};},
  rubric=>{rubric.cover_rubric.dimensions![1].id='C-A';},
  rubric=>{rubric.cover_rubric.caps![0].cover_score_cap=101;},
  rubric=>{rubric.grading.overrides={};}
 ];
 for(const mutate of mutations){const rubric=copy(bundledRubric);mutate(rubric);assert.throws(()=>parseRubric(rubric));}
 assert.throws(()=>parseRubric(JSON.stringify(bundledRubric).replace('"max_points":30','"max_points":1e999')),/finite/);
});

test('rubric bounds are UTF-8 bytes and imports reject cycles, duplicate JSON keys and excessive depth',()=>{
 assert.throws(()=>parseRubric({...bundledRubric,padding:'界'.repeat(180000)}),/512 KiB/);
 assert.throws(()=>parseRubric(' '.repeat(512*1024+1)),/512 KiB/);
 const circular:Record<string,unknown>={};circular.self=circular;
 assert.throws(()=>parseRubric(circular),/cycles/);
 assert.throws(()=>parseRubric('{"title":"one","title":"two"}'),/Duplicate key/);
 let nested:unknown={};for(let index=0;index<70;index++)nested={nested};
 assert.throws(()=>parseRubric({...bundledRubric,nested}),/nesting/);
});

test('snapshots normalize and freeze precommit selection and hash all supplemental instructions',()=>{
 const snapshot=gradingSnapshot(undefined,{...selection,path:' progression ',rationale:' '+selection.rationale+' '});
 assert.deepEqual(snapshot.selection,selection);assert.match(snapshot.rubricHash,/^[a-f0-9]{64}$/);
 assert(Object.isFrozen(snapshot));assert(Object.isFrozen(snapshot.selection));assert(Object.isFrozen(snapshot.rubric.criteria));
 const reversed=Object.keys(bundledRubric).reverse().reduce((result,key)=>({...result,[key]:bundledRubric[key]}),{});
 assert.equal(gradingSnapshot(reversed,selection).rubricHash,snapshot.rubricHash);
 assert.notEqual(gradingSnapshot({...bundledRubric,extra:'A new instruction'},selection).rubricHash,snapshot.rubricHash);
});

test('path, hybrid and overlay choices must be known and carry a precommit rationale',()=>{
 for(const choice of [{...selection,path:'invented'},{...selection,overlay:'invented'},{...selection,rationale:' '},{...selection,secondaryPath:'progression'},{...selection,secondaryPath:'universal'},{...selection,path:'universal',secondaryPath:'social'}])assert.throws(()=>gradingSnapshot(undefined,choice));
 assert.equal(gradingSnapshot(undefined,{...selection,secondaryPath:'social',overlay:'creator_first'}).selection.secondaryPath,'social');
});

test('grading prompt prohibits interim prose, mutation, inferred visuals and runtime certification',()=>{
 const prompt=gradingPrompt(gradingSnapshot(undefined,selection));
 for(const phrase of ['FULL current source','Do NOT emit interim prose','concatenates ALL assistant text','ONLY textual output','No inferred visuals','not inspected pixels','Do NOT mutate','propose_work_order','NA is NOT supported','G14','G15','75%','25%','70/30','never rescale','nearest quarter','all caps'])assert(prompt.includes(phrase),phrase);
 assert(prompt.includes(JSON.stringify(bundledRubric)));assert(prompt.includes(selection.rationale));
});

test('valid structured and fenced reports retain exact source evidence and host-computed metadata',()=>{
 const input=output(),report=parse(input);
 assert.equal(report.id,metadata.id);assert.equal(report.taskId,metadata.taskId);assert.equal(report.sourceHash,metadata.sourceHash);
 assert.equal(report.rubricTitle,bundledRubric.title);assert.equal(report.rubricHash,gradingSnapshot(undefined,selection).rubricHash);
 assert.deepEqual(report.criteria[0].evidence,input.criteria[0].evidence);assert.deepEqual(report.selection,selection);
 assert.equal(report.scores.universal.lower,100);assert.equal(report.scores.adaptive.lower,100);
 assert.equal(report.scores.universal.coverage,1);assert.equal(report.certification,'not_assessed');
 assert.equal(report.assessmentMode,'offline_static_source_only');
 assert.deepEqual(parse('```json\n'+JSON.stringify(input)+'\n```'),report);
 assert.equal(source,JSON.stringify(JSON.parse(source)));
});

test('evidence accepts exact decoded strings, raw JSON and numeric array paths without trimming quotes',()=>{
 const input=output();
 input.criteria[0].evidence=[{path:['initialGameState','opening'],quote:'"Where next?"\nChoose a vessel.'},{path:['initialGameState','crew',0,'name'],quote:'Mara'},{path:['initialGameState','opening'],quote:'\\"Where next?\\"\\nChoose'}];
 assert.deepEqual(parse(input).criteria[0].evidence,input.criteria[0].evidence);
});

test('fabricated, malformed and missing source evidence is rejected, not coerced',()=>{
 const mutations:((input:ReturnType<typeof output>)=>void)[]=[
  input=>{input.criteria[0].evidence[0].quote='Not in this source';},
  input=>{input.criteria[0].evidence[0].path=['initialGameState','missing'];},
  input=>{input.criteria[0].evidence[0].path=['initialGameState','crew','0','name'];},
  input=>{input.criteria[0].evidence[0].path=['initialGameState','crew',-1];},
  input=>{input.criteria[0].evidence[0].quote='';},
  input=>{input.criteria[0].evidence=[];},
  input=>{input.criteria[0].evidence[0].quote='Harbor of Echoes ';}
 ];
 for(const mutate of mutations){const input=output();mutate(input);assert.throws(()=>parse(input));}
});

test('partial reports and unknown/duplicate criterion and gate references fail',()=>{
 const mutations:((input:ReturnType<typeof output>)=>void)[]=[
  input=>{input.criteria.pop();},input=>{input.criteria.push(copy(input.criteria[0]));},input=>{input.criteria[0].id='P99';},
  input=>{input.gates.pop();},input=>{input.gates.push(copy(input.gates[0]));},input=>{input.gates[0].id='G99';},
  input=>{input.fixes[0].criterionIds=['P99'];},input=>{input.fixes[0].criterionIds=['A1','A1'];},input=>{input.fixes.push(copy(input.fixes[0]));}
 ];
 for(const mutate of mutations){const input=output();mutate(input);assert.throws(()=>parse(input));}
 const universal=gradingSnapshot(undefined,{...selection,path:'universal'}),input=output();
 input.gates=input.gates.filter(gate=>!['G14','G15'].includes(gate.id));assert.equal(parse(input,universal).gates.length,13);
 assert.throws(()=>parse(input),/G14, G15/);
});

test('report schema rejects malformed output, spoofed scores, unsupported NA and unbounded text',()=>{
 for(const input of ['{}','[]','not JSON','A progress update\n'+JSON.stringify(output()),JSON.stringify(output())+'\nDone.'])assert.throws(()=>parse(input));
 for(const extra of [{scores:{}},{certification:'STATIC READY'},{rubricHash:'invented'},{selection}])assert.throws(()=>parse({...output(),...extra}),/Host metadata/);
 const input=output();input.summary='x'.repeat(10001);assert.throws(()=>parse(input),/10000/);
 const numeric=output();(numeric.criteria[0] as {grade:unknown}).grade=2.5;assert.throws(()=>parse(numeric),/Invalid criterion grade/);
 const na=output();(na.criteria[0] as {grade:unknown}).grade='NA';assert.throws(()=>parse(na),/NA is not supported.*Use NE/);
 (na.criteria[0] as {grade:unknown}).grade=4;(na.gates[0] as {status:unknown}).status='NA';assert.throws(()=>parse(na),/NA is not supported/);
 const diagnostic=output();(diagnostic.diagnostics.cover as {score:unknown}).score='NA';assert.throws(()=>parse(diagnostic),/NA is not supported/);
 assert.throws(()=>parse(' '.repeat(1024*1024+1)),/1024 KiB/);
});

test('universal rounds each presentation contribution, adaptive rounds only final total',()=>{
 const input=output('NE');replaceCriterion(input,'P3',4);replaceCriterion(input,'P4',4);
 setDiagnostic(input,'cover',1);setDiagnostic(input,'title',1);setDiagnostic(input,'blurb',1);
 const report=parse(input);
 assert.equal(report.scores.universal.lower,0);assert.equal(report.scores.universal.upper,87);
 assert.equal(report.scores.adaptive.lower,0.25);assert.equal(report.scores.adaptive.upper,87.25);
 assert.equal(report.scores.universal.coverage,0.13);
 assert.equal(report.scores.adaptive.sections[0].lower,0.13);
 assert.equal(report.scores.adaptive.sections[0].max,30);
});

test('P3 uses 75/25 adjusted diagnostics and P4 uses blurb rather than raw grade',()=>{
 const input=output('NE');replaceCriterion(input,'P3',1);replaceCriterion(input,'P4',1);
 setDiagnostic(input,'cover',40);setDiagnostic(input,'title',80);setDiagnostic(input,'blurb',60);
 const report=parse(input);assert.equal(report.scores.universal.lower,7);assert.equal(report.scores.adaptive.lower,7);
 assert.equal(report.scores.universal.upper,94);assert.equal(report.scores.universal.max,100);
});

test('NE retains full intervals and coverage, including entire P3 on missing cover OR title',()=>{
 for(const missing of ['cover','title'] as const){
  const input=output();input.diagnostics[missing].score='NE';const report=parse(input);
  assert.equal(report.criteria.find(criterion=>criterion.id==='P3')!.grade,'NE');
  assert.equal(report.scores.universal.lower,92);assert.equal(report.scores.universal.upper,100);assert.equal(report.scores.universal.coverage,0.92);
  assert(report.missingEvidence.some(gap=>gap.includes('P3')));
 }
 const missing=output('NE'),report=parse(missing);assert.equal(report.scores.universal.lower,0);assert.equal(report.scores.universal.upper,100);assert.equal(report.scores.universal.coverage,0);
 const blurb=output();blurb.diagnostics.blurb.score='NE';assert.equal(parse(blurb).scores.universal.lower,95);
});

test('fractional rubric weights retain entire NE weight instead of rounding missing evidence away',()=>{
 const rubric=copy(bundledRubric);rubric.criteria[0].max_points=10.1;rubric.criteria[1].max_points=6.9;
 rubric.adaptive_paths.profiles.universal.criterion_weights.P1=10.1;rubric.adaptive_paths.profiles.universal.criterion_weights.P2=6.9;
 const snapshot=gradingSnapshot(rubric,selection),input=output('NE');replaceCriterion(input,'P2',0);
 for(const criterion of input.criteria)if(criterion.id!=='P1')replaceCriterion(input,criterion.id,0);
 setDiagnostic(input,'cover',0);setDiagnostic(input,'title',0);setDiagnostic(input,'blurb',0);
 const report=parse(input,snapshot);assert.equal(report.scores.universal.upper,10.1);assert.equal(report.scores.universal.coverage,0.899);
});

test('specialist hybrid weights are fixed 70/30 then entry overlay; universal remains unchanged',()=>{
 const input=output('NE');replaceCriterion(input,'A4',4);
 const snapshot=gradingSnapshot(undefined,{...selection,secondaryPath:'social',overlay:'creator_first'}),report=parse(input,snapshot);
 const expected=bundledRubric.adaptive_paths.profiles.progression.criterion_weights.A4*0.7+bundledRubric.adaptive_paths.profiles.social.criterion_weights.A4*0.3+2;
 assert.equal(report.scores.adaptive.lower,Math.round(expected*4)/4);assert.equal(report.scores.adaptive.coverage,expected/100);
 assert.equal(report.scores.universal.lower,4);assert.equal(report.scores.universal.coverage,0.04);
 for(const section of report.scores.adaptive.sections){
  const expectedMax=bundledRubric.adaptive_paths.profiles.progression.section_weights[section.id]*0.7+bundledRubric.adaptive_paths.profiles.social.section_weights[section.id]*0.3;
  assert(Math.abs(section.max-expectedMax)<1e-9);
 }
});

test('diagnostic dimensions apply numeric caps and force the corresponding truthfulness gate to FAIL',()=>{
 const input=output();
 input.diagnostics.title.dimensions!.find(dimension=>dimension.id==='T-F')!.grade=5;
 input.diagnostics.cover.dimensions!.find(dimension=>dimension.id==='C-A')!.grade=3;
 input.diagnostics.blurb.dimensions!.find(dimension=>dimension.id==='B-F')!.grade=5;
 const report=parse(input);assert.equal(report.diagnostics.title.score,49);assert.equal(report.diagnostics.cover.score,69);assert.equal(report.diagnostics.blurb.score,49);
 assert.equal(report.gates.find(gate=>gate.id==='G10')!.status,'FAIL');assert.equal(report.gates.find(gate=>gate.id==='G11')!.status,'FAIL');
 assert(report.diagnostics.cover.caps!.length>0);
 input.diagnostics.title.dimensions![0].grade='NE';assert.equal(parse(input).diagnostics.title.score,'NE');
 input.diagnostics.cover.caps=[{condition:'invented cap',explanation:'Fake'}];assert.throws(()=>parse(input),/Unknown cover cap/);
});

test('raw model diagnostic scores without complete dimension evidence become NE, never inflated points',()=>{
 const input=output();delete input.diagnostics.cover.dimensions;
 const report=parse(input);assert.equal(report.diagnostics.cover.score,'NE');assert.equal(report.scores.universal.lower,92);
 assert.match(report.diagnostics.cover.explanation,/complete source-evidenced/);
 const absent=output();delete absent.diagnostics.title.dimensions![0].evidence;assert.equal(parse(absent).diagnostics.title.score,'NE');
 const fabricated=output();fabricated.diagnostics.title.dimensions![0].evidence![0].quote='Fabricated dimension evidence';assert.throws(()=>parse(fabricated),/Fabricated evidence/);
 const incomplete=output();incomplete.diagnostics.blurb.dimensions!.pop();assert.throws(()=>parse(incomplete),/Incomplete blurb dimensions/);
 const overclaim=output();setDiagnostic(overclaim,'blurb',20);overclaim.diagnostics.blurb.score=100;assert(Math.abs((parse(overclaim).diagnostics.blurb.score as number)-20)<1e-9);
});

test('quarter rounding can never award more than an imported fractional criterion maximum',()=>{
 const rubric=copy(bundledRubric);rubric.criteria[0].max_points=10.125;rubric.criteria[1].max_points=6.875;
 rubric.adaptive_paths.profiles.universal.criterion_weights.P1=10.125;rubric.adaptive_paths.profiles.universal.criterion_weights.P2=6.875;
 const report=parse(output(),gradingSnapshot(rubric,selection));assert.equal(report.scores.universal.lower,100);
 for(const section of report.scores.universal.sections)assert(section.upper<=section.max);
});

test('fix scope reuses proposedOrder safety and never mutates the source',()=>{
 for(const path of [[],['shortId'],['initialGameState'],['initialGameState','missing'],['initialGameState','heroesVersion']]){
  const input=output();input.fixes[0].allowedPaths=[path];assert.throws(()=>parse(input));
 }
 const whole=output();
 whole.fixes[0].wholeWorld=true;assert.throws(()=>parse(whole),/not both/);
 whole.fixes[0].allowedPaths=[];const report=parse(whole);assert.equal(report.fixes[0].wholeWorld,true);assert.deepEqual(report.fixes[0].allowedPaths,[]);
 assert.equal(JSON.parse(source).initialGameState.opening,'The ferryman asks, "Where next?"\nChoose a vessel.');
});

test('metadata and rubric snapshot tampering fail and all-pass output never certifies readiness',()=>{
 const snapshot=gradingSnapshot(undefined,selection);
 assert.throws(()=>parseGradeReport(JSON.stringify(output()),{...snapshot,rubricHash:'changed'},source,metadata),/hash/);
 assert.throws(()=>parseGradeReport(JSON.stringify(output()),snapshot,source,{...metadata,created:Infinity}),/finite/);
 const report:GradeReport=parse(output());assert.equal(report.certification,'not_assessed');assert.equal(report.scores.adaptive.lower,100);
});

test('shared grader executes without TextEncoder, Buffer or Intl globals',()=>{
 const compiled=transformSync(readFileSync(new URL('./world-grading.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code;
 const module={exports:{}};
 const dependencies:Record<string,unknown>={
  './document':{parse:JSON.parse},
  './work-orders':{},
  'js-sha256':{sha256:()=> 'hash'}
 };
 runInNewContext('const rubricFixture=JSON.parse(rubricJSON);const require=name=>name==="./world-rubric.json"?rubricFixture:loadDependency(name);\n'+compiled,{module,exports:module.exports,rubricJSON:JSON.stringify(bundledRubric),loadDependency:(name:string)=>dependencies[name],TextEncoder:undefined,Buffer:undefined,Intl:undefined});
 const grader=module.exports as {gradingSnapshot:(rubric:unknown,selection:GradeSelection)=>unknown};
 assert(grader.gradingSnapshot(undefined,selection));
});
