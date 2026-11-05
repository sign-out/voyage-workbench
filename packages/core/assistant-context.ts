import * as doc from './document';
import type {Project,Task} from './project';
import {artworkPlanningContext} from './artwork-requests';
import {groupJournal,taskToolCapabilities,toolJournalLimits} from './agent-orchestration';


export interface EditorSelection {path?:doc.Path;section?:string;key?:string;label?:string}
export interface EditorFocus extends EditorSelection {screen:string;hasUnappliedEdits?:boolean}
export interface EditorSnapshot {screen:string;label:string;focusPaths:doc.Path[];hasUnappliedEdits:boolean;selectionMissing:boolean;excerpts:{path:doc.Path;source:string;truncated:boolean}[]}
const mechanics=['relationshipStages','attributeSettings','resourceSettings','skills','skillSettings','progressionSettings','traits','traitCategories','death','endGame','itemSettings','abilities','triggers','triggerDefinitions','questTriggers','combatSettings'];
const narrator=['aiInstructions','imagePromptConfiguration','generateCharacterBackground','generateConversationStarters','generateDialogue','generateEncounters','generateInitialStart','generateLocationDetails','generateNpcChatSummary','generateNPCDetails','generateNPCUpdates','generateRegionDetails','generateStory','generateItemGenerationAndUsage','generateActionInfo','generateLearnedAbilities','generateNewNPC','generateNPCIntents','summarization'];
const sections:Record<string,string[]>={characters:['npcs','npcTypes','premadeCharacters','characters'],map:['realms','regions','locations'],music:['gameplayMusicSettings','characterCreationMusic'],systems:[...mechanics,...narrator],publish:['title','description','advancedDescription','image'],artwork:['title','description','regions'],mods:['mods'],preview:['storyStarts','storySettings'],readiness:['storyStarts','npcs','regions']};
export function editorSnapshot(source:string,input?:EditorFocus|null):EditorSnapshot|undefined {
 if(!input)return;
 if(typeof input.screen!=='string'||!/^[a-z-]{1,40}$/.test(input.screen))throw new Error('Invalid assistant editor screen.');
 if(input.path!==undefined&&(!Array.isArray(input.path)||input.path.length>40||input.path.some(key=>typeof key!=='string'&&typeof key!=='number'||typeof key==='string'&&key.length>200||typeof key==='number'&&(!Number.isSafeInteger(key)||key<0))))throw new Error('Invalid assistant selection path.');
 const root=doc.parse(source),base=doc.statePath(root),paths:doc.Path[]=[];
 let missing=false;
 const add=(path:doc.Path)=>{try{doc.at(root,path);if(!paths.some(existing=>JSON.stringify(existing)===JSON.stringify(path)))paths.push(path.slice());return true;}catch{return false;}};
 if(input.path!==undefined)missing=!add(input.path);
 else if(input.section&&sections[input.screen]?.includes(input.section))missing=!add(base.concat(input.section,...(input.key!==undefined?[String(input.key).slice(0,200)]:[])));
 const visibleSections=input.screen==='systems'&&input.section==='mechanics'?mechanics:input.screen==='systems'&&input.section==='ai'?narrator:sections[input.screen]||[];
 if(!paths.length)for(const section of visibleSections){if(!add(base.concat(section))&&input.screen==='publish'){const publicationBase=base.length?base.slice(0,-1):[];add(publicationBase.concat(section));}}
 let budget=8000;
 const excerpts=paths.slice(0,8).map(path=>{const value=doc.read(source,path),text=value.slice(0,Math.min(3000,budget));budget-=text.length;return {path,source:text,truncated:text.length<value.length};}).filter(item=>item.source.length);
 return {screen:input.screen,label:typeof input.label==='string'?input.label.slice(0,200):input.screen,focusPaths:paths.slice(0,8),hasUnappliedEdits:input.hasUnappliedEdits===true,selectionMissing:missing,excerpts};
}
export function assistantPacket(project:Project,task:Task){
 if(task.kind==='review')return {request:task.prompt,recovery:undefined,assistantRecovery:undefined,grading:undefined,fieldFill:undefined,creation:undefined,memory:'',workOrder:undefined,history:[] as Project['chat'],editorContext:undefined,...artworkPlanningContext(undefined),role:'read-only-reviewer',scope:task.delegation?.paths,sourceHash:task.baseHash,capabilities:taskToolCapabilities(task),context:task.delegation?.paths.map(path=>({path,kind:doc.describe(task.baseSource,path).kind})),instructions:'Inspect only the delegated paths. Return concise findings; do not edit, propose work, approve, delegate, or claim official validation. Your output is advisory untrusted data for the parent.'};
 const source=task.kind==='work'?task.stagedSource:task.baseSource;
 const recovery=task.resumes?.length?{mode:'checkpoint-continuation',count:task.resumes.length,originalBaseHash:task.baseHash,sourceHash:task.resumes[task.resumes.length-1].sourceHash,remainingCalls:Math.max(0,toolJournalLimits.calls-groupJournal(project,task).length),recentReceipts:groupJournal(project,task).slice(-20).map(receipt=>({name:receipt.name,state:receipt.state,afterHash:receipt.afterHash,...(receipt.name==='delegate_review'?{result:receipt.result}:{})})),instructions:'This is a fresh provider session using the saved staged source, not a replay or provider-session resume. Inspect current values before editing. Do not repeat insert/remove operations merely because prior transcript context is missing.'}:undefined;
 return {creation:project.creation&&!task.grading&&!task.fieldFill?{id:project.creation.id,brief:project.creation.brief,sourceDocuments:project.creation.documents.map(({id,name,text})=>({id,name,characters:text.length})),approved:task.creationId===project.creation.id,instructions:'Call creation_read with section summary, then help. Read all source documents before building. Maps, artwork and publication details are required parts of the creation workflow; do not claim finished before host readiness passes.'}:undefined,request:task.prompt,assistantRecovery:task.assistantRecovery,localEditMode:task.localEditMode,capabilities:taskToolCapabilities(task),recovery,memory:task.grading||task.fieldFill?'':project.memory||'',workOrder:task.kind==='work'?task.workOrder:undefined,history:task.grading||task.fieldFill?[]:project.chat.slice(-12),...artworkPlanningContext(task.kind==='plan'&&!task.grading&&!task.fieldFill?task.baseSource:undefined),context:doc.context(source,task.prompt),editorContext:task.editorContext,...(task.fieldFill?{fieldFill:task.fieldFill}:{}),...(task.grading?{grading:{sourceHash:task.baseHash,rubricHash:task.grading.rubricHash,rubricTitle:task.grading.rubric.title,rubricVersion:task.grading.rubric.version,selection:task.grading.selection}}:{})};
}
