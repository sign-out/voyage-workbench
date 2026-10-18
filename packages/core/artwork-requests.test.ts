import test from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce,hash} from './project';
import {artworkDestinations} from './artwork';
import {proposedArtwork} from './artwork-requests';
import {assistantPacket} from './assistant-context';
import {agentSystem,toolDefinitions} from './providers';

const source='{"initialGameState":{"npcs":{"guide":{"name":"Guide","description":"A lighthouse keeper"},"malo":{"name":"Mal0","portraitUrl":"https://images.example/malo.webp"}},"exact":9007199254740993}}';
const destinationId=artworkDestinations(source).find(item=>item.label==='Guide')!.id;
const request={destinationId,prompt:'Paint a lighthouse keeper in the world’s watercolor style.'};
function planning(){return reduce(reduce(create('p','World',source,1),{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',prompt:'Create the missing portraits'}),{type:'taskRunning',taskId:'task',attempt:'attempt'});}
const propose=(id='art')=>({type:'proposeArtwork',id,taskId:'task',attempt:'attempt',request});

test('artwork requests persist without approving, generating, or editing the world',()=>{
 const before=planning(),after=reduce(before,propose());
 assert.equal(after.activeSource,source);assert.deepEqual(after.workOrder,before.workOrder);assert.equal(before.artworkProposals,undefined);
 assert.deepEqual(after.artworkProposals?.[0],{...request,id:'art',taskId:'task',baseHash:hash(source),label:'Guide',created:after.updated});
 const restored=JSON.parse(JSON.stringify(reduce(after,{type:'taskDone',taskId:'task',attempt:'attempt',text:'Review the artwork request.'})));
 assert.equal(restored.artworkProposals[0].prompt,request.prompt);
 assert.equal(reduce(restored,{type:'dismissArtworkProposal',id:'art'}).artworkProposals?.length,0);
 assert.equal(restored.artworkProposals.length,1);
});
test('only current running planners may propose valid destinations and bounded briefs',()=>{
 for(const patch of [{attempt:'old'},{request:{...request,destinationId:'invented'}},{request:{...request,prompt:''}},{request:{...request,prompt:'x'.repeat(12001)}}])assert.throws(()=>reduce(planning(),{...propose(),...patch}));
 assert.throws(()=>proposedArtwork(source,{...request,destinationId:'creation-cover'}));
 const proposed=reduce(planning(),propose());
 assert.throws(()=>reduce(proposed,propose()));assert.throws(()=>reduce(proposed,propose('another')));
 const stopped=reduce(planning(),{type:'taskStop',taskId:'task',attempt:'attempt',state:'CANCELED'});
 assert.throws(()=>reduce(stopped,propose()));
 const changed=reduce(planning(),{type:'edit',path:['initialGameState','npcs','guide','name'],source:'"New name"',baseHash:hash(source)});
 assert.throws(()=>reduce(changed,propose()));
 const work=planning();work.tasks[0].kind='work';assert.throws(()=>reduce(work,propose()));
});
test('planning packets expose actionable artwork IDs without leaking URLs or claiming generation',()=>{
 const project=planning(),packet=assistantPacket(project,project.tasks[0]);
 assert.deepEqual(packet.artworkDestinations!.map(item=>[item.label,item.hasArtwork]).sort(),[['Guide',false],['Mal0',true]]);
 assert.equal(packet.artworkDestinations!.find(item=>item.label==='Guide')!.id,destinationId);
 assert.doesNotMatch(JSON.stringify(packet.artworkDestinations),/https:/);
 assert.ok(toolDefinitions(false).some(tool=>tool.name==='propose_artwork'));
 assert.ok(!toolDefinitions(true).some(tool=>tool.name==='propose_artwork'));
 assert.match(agentSystem(false),/inline Approve & generate control/);
 assert.match(agentSystem(false),/Preserve existing images/);
});
test('large valid worlds can still plan and build when artwork inspection exceeds its bounds',()=>{
 const source=JSON.stringify({title:'Large world',npcs:{guide:{name:'Guide'}},history:Array(100001).fill(0)});
 let project=create('large','Large world',source,1);
 project=reduce(project,{type:'prepareTask',id:'task',attempt:'attempt',kind:'plan',prompt:'Improve the title'});
 const task=project.tasks[0],packet=assistantPacket(project,task);
 assert.deepEqual(packet.artworkDestinations,[]);assert.equal(packet.artworkDestinationsTruncated,true);
 assert.match(packet.artworkDestinationsUnavailable!,/Continue using scoped world tools/);
 assert.equal(packet.request,'Improve the title');
 assert.equal(assistantPacket(project,{...task,kind:'work'}).artworkDestinations,undefined);
});
