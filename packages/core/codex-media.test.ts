import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codexMediaInput,codexMediaThread,codexMediaPreflight,codexImageResult} from './codex-media';
import {defaultSettings,imageRoute} from './providers';
const image='data:image/png;base64,'+Buffer.from('\x89PNG\r\n\x1a\n','binary').toString('base64');
test('Codex is an explicit artwork route and does not replace an existing default',()=>{
 const settings=defaultSettings();assert.equal(settings.routes.artwork.profileId,'');settings.routes.artwork={profileId:'codex',model:''};
 const route=imageRoute(settings);assert.equal(route.protocol,'codex');assert.equal(route.model,'');settings.routes.artwork.model='chosen-model';assert.equal(imageRoute(settings,route).model,'');
 settings.routes.artwork.model='';settings.profiles[0].model='profile-model';assert.equal(imageRoute(settings).model,'profile-model');
});
test('media threads enable image generation only for explicit image requests',()=>{
 const generation=codexMediaThread('/private','model',true),analysis=codexMediaThread('/private','',false);
 assert.equal(generation.config['features.image_generation'],true);assert.equal(analysis.config['features.image_generation'],false);assert.equal(generation.sandbox,'read-only');assert.deepEqual(generation.dynamicTools,[]);assert.equal(generation.approvalPolicy,'never');assert.equal(analysis.model,undefined);
 assert.match(generation.developerInstructions,/image_gen\.imagegen/);assert.match(generation.developerInstructions,/code-mode/);assert.match(generation.developerInstructions,/at most one/);assert.equal(generation.config['features.omit_app_server_notification_media'],false);
 const input=codexMediaInput('Refine this cover',[{id:'original',dataUrl:image}]);assert.equal(input[2].type,'image');assert.equal(input[2].url,image);
 for(const value of ['https://example.com/image.png','file:///private/key','data:image/png;base64,@@@'])assert.throws(()=>codexMediaInput('Inspect',[{id:'original',dataUrl:value}]));assert.throws(()=>codexMediaInput(' '));
});
test('CLI preflight rejects unsupported accounts, namespaces, image engines and text-only models without switching routes',()=>{
 const account={type:'chatgpt',planType:'plus'},capabilities={imageGeneration:true,namespaceTools:true};
 const catalog=[{id:'vision',isDefault:true,inputModalities:['text','image']},{id:'text-only',inputModalities:['text']}];
 assert.equal(codexMediaPreflight(account,capabilities,catalog,'',true).resolvedModel,'vision');
 assert.equal(codexMediaPreflight(account,capabilities,catalog,'',true).model,'');
 assert.match(codexMediaPreflight(account,capabilities,catalog,'custom-pin',true).detail,/not in the current CLI catalog/);
 for(const current of [null,{type:'apiKey'},{type:'chatgpt',planType:'free'}])assert.throws(()=>codexMediaPreflight(current,capabilities,catalog,'',true));
 assert.throws(()=>codexMediaPreflight(account,{imageGeneration:true,namespaceTools:false},catalog,'',true),/namespace/);
 assert.throws(()=>codexMediaPreflight(account,capabilities,catalog,'text-only',true),/cannot read image/);
 assert.throws(()=>codexMediaPreflight(account,capabilities,catalog,'gpt-image-2',true),/orchestrator/);
 assert.throws(()=>codexMediaPreflight(account,capabilities,catalog,'dall-e-3',true),/orchestrator/);
 assert.throws(()=>codexMediaPreflight(account,capabilities,[{id:'default-text',isDefault:true,inputModalities:['text']}],'',true),/cannot read image/);
 assert.equal(codexMediaPreflight({type:'apiKey'},{},catalog,'vision',false).model,'vision');
});
test('CLI artifact failures preserve usage-limit and model explanations rather than reporting success',()=>{
 assert.throws(()=>codexImageResult({type:'imageGeneration',status:'failed',failure:{type:'usageLimitExceeded',resetsAt:1800000000},result:''}),/usage limit reached; resets at/);
 assert.throws(()=>codexImageResult(undefined,'This model cannot use image generation.'),/Model reply: This model cannot use image generation/);
 try{codexImageResult(undefined,'x'.repeat(2000));assert.fail('Missing image accepted');}catch(error){assert.ok((error as Error).message.length<1100);}
});
test('generated media requires real image bytes rather than a message or saved path',()=>{
 assert.equal(codexImageResult({type:'imageGeneration',status:'completed',result:image.split(',')[1]}).dataUrl,image);
 for(const result of ['/tmp/generated.png','https://example.com/image.png',Buffer.from('RIFFxxxxWAVE').toString('base64'),''])assert.throws(()=>codexImageResult({type:'imageGeneration',status:'completed',result}));
 assert.throws(()=>codexImageResult({type:'imageGeneration',status:'failed',failure:{message:'Denied'},result:image}));assert.throws(()=>codexImageResult({type:'agentMessage',text:'I generated an image'}));
});
