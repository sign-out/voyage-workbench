import {test} from 'node:test';import assert from 'node:assert/strict';
import {coverCategories,coverCrop,coverGenerationPrompt,scoreCover,coverViews,coverReviewRequest,coverReviewResult,coverGradingRoute,defaultCoverGrader,coverGraderSupportsImages,type CoverScores} from './covers';
import {defaultSettings,type TaskRoute,type Protocol} from './providers';
const brief={title:'A world',premise:'Explore a living city',direction:'One impossible landmark and a foreground traveler',original:true};
const scores=(value=8):CoverScores=>Object.fromEntries(coverCategories.map(category=>[category.id,{score:value,reason:'Visible evidence'}]));
const images=['original',...coverViews.map(view=>view.id),'thumbnail','blur','grayscale'].map(id=>({id,dataUrl:'data:image/png;base64,YQ=='}));
test('cover grading defaults to the effective Building text route without substituting models',()=>{
 const settings=defaultSettings();
 assert.deepEqual(defaultCoverGrader(settings),{profileId:'codex',model:''});
 assert.equal(coverGraderSupportsImages('codex'),true);
 settings.profiles.push({id:'vision',name:'Vision',protocol:'openai',baseUrl:'https://example.com/v1',model:'profile-text',imageModel:'image-only'});
 settings.routes.building={profileId:'vision',model:'building-override'};
 assert.deepEqual(defaultCoverGrader(settings),{profileId:'vision',model:'building-override'});
 assert.equal(coverGraderSupportsImages('openai'),true);
 assert.equal(coverGradingRoute(settings,'vision','manual-override').model,'manual-override');
 settings.routes.building.model='';
 assert.deepEqual(defaultCoverGrader(settings),{profileId:'vision',model:'profile-text'});
 settings.profiles[1].model='';
 assert.equal(defaultCoverGrader(settings).model,'');
 settings.routes.building.profileId='missing';
 assert.deepEqual(defaultCoverGrader(settings),{profileId:'',model:''});
});
test('weighted rubric uses all ten exact weights, floors and score caps',()=>{
 assert.equal(coverCategories.reduce((total,category)=>total+category.weight,0),100);assert.equal(scoreCover(scores(8)).total,80);
 const high=scores(10);high.A.score=4.9;assert.equal(scoreCover(high).total,69);assert.equal(scoreCover(high).caps.length,1);
 high.A.score=3.9;high.B.score=3.9;assert.equal(scoreCover(high).total,59);high.C.score=4;assert.equal(scoreCover(high).redesign,true);
 assert.equal(scoreCover(scores(6.9)).floors.length,3);assert.equal(scoreCover(scores(4)).redesign,true);
 for(const value of [-1,11,NaN,Infinity])assert.throws(()=>scoreCover({...scores(),A:{score:value,reason:'Evidence'}}));
 assert.throws(()=>scoreCover({}));assert.throws(()=>scoreCover({...scores(),A:{score:8,reason:''}}));
});
test('center crops preserve the actual source and reveal wide-source losses',()=>{
 assert.deepEqual(coverCrop(1200,400,320,320),{left:400,top:0,width:400,height:400});
 const portrait=coverCrop(1200,400,155,180);assert.ok(portrait.left>400);assert.equal(portrait.top,0);
 assert.deepEqual(coverCrop(100,300,100,100),{left:0,top:100,width:100,height:100});assert.throws(()=>coverCrop(0,100,100,100));
 const prompt=coverGenerationPrompt(brief);assert.match(prompt,/portrait listing/);assert.match(prompt,/upper-right/);assert.match(prompt,/Do not generate maps/);assert.match(prompt,/Default prompt kernel/);
});
test('each visual API adapter sends all crops and the full supplied rubric',()=>{
 for(const protocol of ['openai','openai-responses','anthropic','gemini'] as Protocol[]){
  const route:TaskRoute={id:'grader',name:'Grader',stage:'planning',protocol,baseUrl:'https://example.com/v1',model:'vision'};
  const wire=coverReviewRequest(route,'secret',brief,images),body=JSON.parse(wire.body);
  assert.match(wire.body,/Tradeoff matrix/);assert.match(wire.body,/no real neighboring covers/);assert.equal(wire.body.includes('secret'),false);
  if(protocol==='anthropic'){assert.equal(body.messages[0].content.filter((part:any)=>part.type==='image').length,9);assert.equal(wire.headers['x-api-key'],'secret');}
  else if(protocol==='gemini'){assert.equal(body.contents[0].parts.filter((part:any)=>part.inline_data).length,9);assert.equal(wire.headers['x-goog-api-key'],'secret');}
  else if(protocol==='openai-responses'){assert.equal(body.input[0].content.filter((part:any)=>part.type==='input_image').length,9);assert.equal(body.store,false);}
  else assert.equal(body.messages[0].content.filter((part:any)=>part.type==='image_url').length,9);
  assert.throws(()=>coverReviewRequest(route,'secret',brief,images.slice(1)));assert.throws(()=>coverReviewRequest(route,'secret',brief,images.map(image=>({...image,dataUrl:'https://remote/image.png'}))));
 }
 assert.equal(coverGradingRoute(defaultSettings(),'codex','').protocol,'codex');
});
test('grade totals are local, conservative across crops, and never trust a model total',()=>{
 const record={views:coverViews.map(view=>({id:view.id,scores:scores(9),criticalContentClipped:false,fix:'Keep visual hierarchy'})),summary:'Good composition',tradeoffs:'Detail is subordinate',recommendations:['Fix the crop'],total:100};
 const result=()=>coverReviewResult('openai',{choices:[{message:{content:JSON.stringify(record)}}]});
 assert.equal(result().total,90);assert.equal(result().needsRevision,false);
 record.views[1].scores.A.score=4;assert.equal(result().total,69);assert.equal(result().needsRevision,true);
 record.views[1].scores.A.score=9;record.views[1].criticalContentClipped=true;assert.equal(result().needsRevision,true);
 record.views.pop();assert.throws(result,/incomplete/);
});
