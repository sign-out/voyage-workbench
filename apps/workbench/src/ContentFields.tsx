import React from 'react';
import {ChevronDown,ChevronRight,Folder,Music} from 'lucide-react';
import type {Path} from '../../../packages/core/document';

export type ContentField={key:string|number;kind:string;preview:string};
export type ContentReference={section:string;title:string;tab?:string;uiLocation?:string};
const groups=[['world','World'],['mechanics','Mechanics'],['ai','AI'],['music','Music'],['other','Other']] as const;
const bundledCategories:Record<string,string[]>={
 world:['storySettings','worldLore','storyStarts','itemTypes','factions','npcs','premadeCharacters','regions','locations','quests','narrativeEvents','npcTypes','realms','arcs','worldVoices','unassignedAreas'],
 mechanics:['relationshipStages','attributeSettings','resourceSettings','skills','skillSettings','progressionSettings','traits','traitCategories','death','endGame','itemSettings','abilities','triggers','combatSettings'],
 ai:['aiInstructions','imagePromptConfiguration','generateCharacterBackground','generateConversationStarters','generateDialogue','generateEncounters','generateInitialStart','generateLocationDetails','generateNpcChatSummary','generateNPCDetails','generateNPCUpdates','generateRegionDetails','generateStory','generateItemGenerationAndUsage','generateActionInfo','generateLearnedAbilities','generateNewNPC','generateNPCIntents','summarization'],
 music:['gameplayMusicSettings','characterCreationMusic']
};
export function groupContentFields(fields:ContentField[],references:ContentReference[]){
 return groups.map(([id,title])=>({id,title,fields:fields.filter(field=>{
  const key=String(field.key),reference=references.find(entry=>entry.section===key);
  const fallback=Object.keys(bundledCategories).find(category=>bundledCategories[category].includes(key))||'other';
  const group=fallback==='music'?'music':reference?.tab&&groups.some(([groupId])=>groupId===reference.tab)?reference.tab:fallback;
  return group===id;
 })}));
}
export function ContentFields({fields,references,path,grouped,onNavigate}:{fields:ContentField[];references:ContentReference[];path:Path;grouped:boolean;onNavigate:(path:Path)=>void}){
 const row=(field:ContentField)=>{const reference=references.find(entry=>entry.section===String(field.key));return <button className="content-field" key={field.key} onClick={()=>onNavigate(path.concat(field.key))}><i aria-hidden="true" className={'type '+field.kind}>{field.kind==='object'?'{}':field.kind==='array'?'[]':field.kind==='string'?'Aa':'#'}</i><span>{reference?.title||String(field.key)}<small>{reference?String(field.key):field.preview}</small></span><ChevronRight size={16}/></button>;};
 if(!grouped)return <>{fields.map(row)}</>;
 return <div className="content-groups">{groupContentFields(fields,references).map(group=>{const regular=group.fields.filter(field=>!references.find(entry=>entry.section===String(field.key))?.uiLocation?.includes('Advanced')),advanced=group.fields.filter(field=>references.find(entry=>entry.section===String(field.key))?.uiLocation?.includes('Advanced'));return <details key={group.id} className={'content-group content-group-'+group.id}><summary><ChevronDown className="content-disclosure" size={16}/>{group.id==='music'?<Music size={20}/>:<Folder size={20}/>}<strong>{group.title}</strong><span>{group.fields.length}</span></summary>{!group.fields.length&&<p className="muted padded">No {group.title.toLowerCase()} fields in this world yet.</p>}{regular.map(row)}{advanced.length>0&&<details className="content-advanced"><summary><ChevronDown className="content-disclosure" size={16}/>Advanced <span>{advanced.length}</span></summary>{advanced.map(row)}</details>}</details>;})}</div>;
}
