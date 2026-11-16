import type {SchemaReference} from './references';

export const alphaAuthoringEvidence={source:'https://api.unofficial.voyage/schema.json',retrieved:'2026-11-09',sha256:'916fa4909c15571d9b6701aa33c197125f841602c8026c9f13b20550437d5da2',official:false};
export const locationMoveEffect={_type:'intersection',parts:[
 {_type:'required',fields:{type:{_type:'union',of:[{_type:'literal',value:'location-move'}]},location:'string',operator:{_type:'union',of:[{_type:'literal',value:'set'},{_type:'literal',value:'add'}]}}},
 {_type:'partial',fields:{x:'number',y:'number',region:'string'}}
]};

function effectType(value:any):string|undefined{
 if(value?._type==='intersection')return value.parts.map(effectType).find((type:any)=>type!==undefined);
 const type=value?.fields?.type;return type?._type==='union'&&type.of.length===1&&type.of[0]?._type==='literal'?type.of[0].value:undefined;
}
function extendEffects(value:any):any{
 if(!value||typeof value!=='object')return value;
 if(value._type==='union'&&value.of.some((part:any)=>effectType(part)==='location-hidden')&&value.of.some((part:any)=>effectType(part)==='location-image')){
  if(value.of.some((part:any)=>effectType(part)==='location-move'))return value;
  return {...value,of:value.of.concat(locationMoveEffect)};
 }
 if(Array.isArray(value)){const mapped=value.map(extendEffects);return mapped.some((item,index)=>item!==value[index])?mapped:value;}
 let result=value;Object.keys(value).forEach(key=>{const child=extendEffects(value[key]);if(child!==value[key]){if(result===value)result={...value};result[key]=child;}});return result;
}
export function alphaAuthoringReferences(references:SchemaReference[],version:number|null,environment?:string){
 if(environment!=='alpha'||version!==37)return references;
 return references.map(entry=>{
  let schema=entry.schema;
  if(['triggerDefinitions','narrativeEvents','questTriggers','quests'].includes(entry.section))schema=extendEffects(schema);
  if(entry.section==='resourceSettings'&&schema?._type==='record'&&schema.codomain?._type==='intersection'){
   const codomain=schema.codomain,parts=codomain?._type==='intersection'?codomain.parts:[codomain];
   const known=parts.reduce((fields:any,part:any)=>({...fields,...part?.fields}),{});
   const fields:Record<string,string>={};for(const [key,type]of Object.entries({description:'string',usageInstructions:'string',isHealth:'boolean'}))if(!Object.prototype.hasOwnProperty.call(known,key))fields[key]=type;
   if(Object.keys(fields).length)schema={...schema,codomain:{_type:'intersection',parts:parts.concat({_type:'partial',fields})}};
  }
  if(entry.section==='attributeSettings'&&schema?._type==='intersection'){
   schema={...schema,parts:schema.parts.map((part:any)=>{
    const modifiers=part.fields?.attributeStatModifiers;
    if(modifiers?._type!=='record'||modifiers.codomain?._type!=='intersection')return part;
    return {...part,fields:{...part.fields,attributeStatModifiers:{...modifiers,codomain:{_type:'union',of:[{_type:'array',of:modifiers.codomain},modifiers.codomain]}}}};
   })};
  }
  return schema===entry.schema?entry:{...entry,schema,alphaAuthoringEvidence,compatibilityNote:'Alpha supplemental community fields; legacy data is preserved, not migrated. Official validation decides acceptance.'};
 });
}
