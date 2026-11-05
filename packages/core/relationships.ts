import type {Node,Path} from './document';
export const relationshipRules=[
 {section:'npcs',field:'currentLocation',target:'locations'},
 {section:'npcs',field:'faction',target:'factions'},
 {section:'locations',field:'region',target:'regions'},
 {section:'regions',field:'realm',target:'realms'},
 {section:'traits',field:'unlockedBy',target:'traits',alternateTarget:'storyStarts',array:true},
 {section:'traits',field:'excludedBy',target:'traits',alternateTarget:'storyStarts',array:true},
] as const;

export function structuralReferences(world:Node,base:Path){
 const links:{from:Path;to:Path;missing:boolean;self:boolean;value:string;target:string}[]=[];
 for(const rule of relationshipRules){
  const collection=world.children.find(child=>child.key===rule.section)?.node;
  if(collection?.kind!=='object')continue;
  for(const entry of collection.children){
   if(entry.node.kind!=='object')continue;
   const field=entry.node.children.find(child=>child.key===rule.field)?.node;
   if(!field)continue;
   const array='array' in rule&&rule.array;
   const values=array?(field.kind==='array'?field.children:[]):[{key:null,node:field}];
   for(const value of values){
    if(value.node.kind!=='string'||!value.node.value)continue;
    const target=String(value.node.value),from=base.concat(rule.section,entry.key,rule.field);
    if(array)from.push(value.key!);
    const targetSections:string[]=[rule.target];if('alternateTarget' in rule)targetSections.push(rule.alternateTarget);
    const matches=targetSections.filter(section=>world.children.some(child=>child.key===section&&child.node.kind==='object'&&child.node.children.some(entry=>entry.key===target)));
    for(const section of matches.length?matches:[rule.target])links.push({from,to:base.concat(section,target),value:target,target:targetSections.join(' or '),missing:!matches.length,self:rule.section===section&&entry.key===target});
   }
  }
 }
 return links;
}
