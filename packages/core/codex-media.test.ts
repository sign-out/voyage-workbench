import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codexMediaInput,codexMediaThread,codexImageResult} from './codex-media';
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
 const input=codexMediaInput('Refine this cover',[{id:'original',dataUrl:image}]);assert.equal(input[2].type,'image');assert.equal(input[2].url,image);
 for(const value of ['https://example.com/image.png','file:///private/key','data:image/png;base64,@@@'])assert.throws(()=>codexMediaInput('Inspect',[{id:'original',dataUrl:value}]));assert.throws(()=>codexMediaInput(' '));
});
test('generated media requires real image bytes rather than a message or saved path',()=>{
 assert.equal(codexImageResult({type:'imageGeneration',status:'completed',result:image.split(',')[1]}).dataUrl,image);
 for(const result of ['/tmp/generated.png','https://example.com/image.png',Buffer.from('RIFFxxxxWAVE').toString('base64'),''])assert.throws(()=>codexImageResult({type:'imageGeneration',status:'completed',result}));
 assert.throws(()=>codexImageResult({type:'imageGeneration',status:'failed',failure:{message:'Denied'},result:image}));assert.throws(()=>codexImageResult({type:'agentMessage',text:'I generated an image'}));
});
