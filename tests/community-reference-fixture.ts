export function communityFixture(version=37):Record<string,string> {
 const payloads={
  'schema.json':{_type:'intersection',parts:[{_type:'required',fields:{heroesVersion:{_type:'literal',value:version},npcs:{_type:'record',codomain:'unknown'}}},{_type:'partial',fields:{triggerDefinitions:{_type:'record',codomain:'unknown'}}}]},
  'wiki.json':[{section:'npcs',title:'Characters',summary:'Portraits and voice tags.',filePath:['npcs'],schema:'string',body:'Community character help. '.repeat(400)},{section:'quests',title:'Quests',summary:'Party quests.',filePath:['parties','','quests'],body:'Keep quest identities stable.'}],
  'limits.json':{schemaVersion:'V'+version,count:2,limits:[{id:'triggerSize',label:'Per-trigger compact JSON',measure:'compactJson',enforced:10000,sections:['mechanics/triggerDefinitions']},{id:'triggerScript',label:'Script size',note:'Counted toward the per-trigger budget; no separate character cap.',sections:['mechanics/triggerDefinitions']}]},
  'voice-catalog.json':{schemaVersion:'V'+version,count:2,field:'voiceTag',voiceTags:['female calm controlled','male gruff']},
  'guides.json':[{section:'world-building',title:'World building',summary:'Advisory tutorial.',json:'/guides/world-building.json'}],
  'guides/world-building.json':{section:'world-building',title:'World building',summary:'Advisory tutorial.',body:'Never apply guidance unless requested. <script>untrusted</script>'}
 };
 return {...Object.fromEntries(Object.entries(payloads).map(([file,payload])=>[file,JSON.stringify(payload)])),'base-world.json':'{\n "heroesVersion": '+version+', "exact": 9007199254740993, "npcs": {}\n}\n'};
}
