import React,{createContext,useContext,useEffect,useId,useMemo,useState} from 'react';
import {at,edit,insert,parse,remove,type Node,type Path} from '../../../packages/core/document';
import {childSchema,enumValues,fieldTitle,initialValue,moveArrayItem,schemaFields,type Schema} from './structured-source';
import {entryImage,healthSummary,nodeText,referenceCatalog,referenceTarget,safeImageUrl,type ReferenceCatalog} from './world-references';
import {TextField} from './TextField';
import {ImageInspection} from './ImageInspection';
import {FieldFillButton,useFieldFill} from './FieldFill';

const WorldEditorContext=createContext<{catalog:ReferenceCatalog;worldSource:string;section?:string;basePath:Path}>({catalog:{},worldSource:'{}',basePath:[]});

function NumberField({raw,readOnly,change,title}:{raw:string;readOnly:boolean;change:(value:string)=>void;title:string}){
 const [value,setValue]=useState(raw),[error,setError]=useState('');
 useEffect(()=>{setValue(raw);setError('');},[raw]);
 return <><input aria-label={title} inputMode="decimal" readOnly={readOnly} value={value} onChange={event=>{const next=event.target.value;setValue(next);try{if(parse(next).kind!=='number')throw new Error();change(next);setError('');}catch{setError('Enter a complete JSON number. This unfinished value is not saved.');}}}/>{error&&<small role="alert">{error}</small>}</>;
}

export function StructuredEditor({text,onChange,readOnly=false,schema,worldSource=text,section,basePath=[]}:{text:string;onChange:(text:string)=>void;readOnly?:boolean;schema?:Schema;worldSource?:string;section?:string;basePath?:Path}){
 const root=parse(text);
 const catalog=useMemo(()=>referenceCatalog(worldSource),[worldSource]);
 return <WorldEditorContext.Provider value={{catalog,worldSource,section,basePath}}><div className="structured-editor"><FormNode source={text} node={root} path={[]} schema={schema} readOnly={readOnly} change={onChange} title={root.kind==='string'?'Text value':'Value'}/></div></WorldEditorContext.Provider>;
}
function FormNode({source,node,path,schema,readOnly,change,title}:{source:string;node:Node;path:Path;schema?:Schema;readOnly:boolean;change:(text:string)=>void;title:string}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<string|number|null>(null),[newKey,setNewKey]=useState(''),[error,setError]=useState(''),[limit,setLimit]=useState(50);
 const inputId=useId();
 const context=useContext(WorldEditorContext);
 const fill=useFieldFill();
 const raw=source.slice(node.start,node.end);
 const replace=(value:string)=>{fill?.edited(context.basePath.concat(path));change(edit(source,path,value));};
 const values=enumValues(schema);
 if(node.kind==='string'){
  const value=String(node.value),fullPath=context.basePath.concat(path),target=referenceTarget(context.section,fullPath);
  if(target){
   let choices=context.catalog[target]||[];
   if(target==='areas'){
    let location='';try{const parent=at(parse(context.worldSource),fullPath.slice(0,-1));location=nodeText(parent,'currentLocation');}catch{}
    choices=choices.filter(choice=>choice.parent===location);
   }
   return <label className="form-field"><span>{title}</span><input aria-label={title} list={inputId} readOnly={readOnly} value={value} onChange={event=>replace(JSON.stringify(event.target.value))}/><datalist id={inputId}>{choices.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</datalist><small>{choices.find(choice=>choice.id===value)?.name|| (value?'This ID is not in the available local choices. It is preserved; it may be supplied at runtime.':'No reference selected.')} {target==='areas'?'Areas from this character’s current location.':'Choose an existing world entry or type an exact ID.'}</small></label>;
  }
  if(values.length)return <label className="form-field"><span>{title}</span><select aria-label={title} disabled={readOnly} value={value} onChange={event=>replace(JSON.stringify(event.target.value))}>{!values.includes(value)&&<option>{value}</option>}{values.map(option=><option key={option}>{option}</option>)}</select></label>;
  const image=/^(portraitUrl|imageUrl|cutoutUrl|cutoutSourceUrl|image)$/.test(String(fullPath.at(-1)))?safeImageUrl(value):'';
  return <><TextField title={title} value={value} readOnly={readOnly} fieldPath={fullPath} onChange={next=>replace(JSON.stringify(next))}/>{image&&<ImageInspection url={image} name={title}><img className="form-image" src={image} alt={title} referrerPolicy="no-referrer"/></ImageInspection>}</>;
 }
 if(node.kind==='number')return <label className="form-field"><span>{title}</span><NumberField raw={raw} readOnly={readOnly} change={replace} title={title}/></label>;
 if(node.kind==='boolean')return <label className="form-field form-boolean"><input type="checkbox" aria-label={title} disabled={readOnly} checked={node.value===true} onChange={event=>replace(String(event.target.checked))}/><span>{title}</span></label>;
 if(node.kind==='null')return <div className="form-field"><span>{title}</span><code>null</code><small>Change the value type in JSON view.</small></div>;
 const collection=node.kind==='array'||typeof schema==='object'&&schema._type==='record';
 const itemSchema=childSchema(schema,node.kind==='array'?0:'entry');
 const active=node.children.find(child=>child.key===selected);
 const matching=node.children.filter(child=>!query||String(child.key).toLowerCase().includes(query.toLowerCase())||source.slice(child.node.start,child.node.end).toLowerCase().includes(query.toLowerCase()));
 const deleteItem=(key:string|number)=>{if(window.confirm('Remove '+fieldTitle(key)+' from this draft?')){const next=remove(source,path.concat(key));fill?.edited(context.basePath.concat(node.kind==='array'?path:path.concat(key)));change(next);setSelected(null);}};
 const moveItem=(index:number,direction:-1|1)=>{const next=moveArrayItem(source,path,index,direction);fill?.edited(context.basePath.concat(path));change(next);};
 const add=(key:string|number,valueSchema?:Schema)=>{try{const value=initialValue(valueSchema),next=insert(source,path,key,value);fill?.created(context.basePath.concat(path,key),value,valueSchema);change(next);setError('');setNewKey('');setQuery('');setSelected(key);}catch(reason){setError(String(reason instanceof Error?reason.message:reason));}};
 if(collection&&active&&active.node.kind==='object')return <section className="form-detail"><button onClick={()=>setSelected(null)}>← Back to entries</button><h3>{entryTitle(active.key,active.node)}</h3><EntrySummary source={source} node={active.node}/><FormNode source={source} node={active.node} path={path.concat(active.key)} schema={itemSchema} readOnly={readOnly} change={change} title={entryTitle(active.key,active.node)}/><button className="danger" disabled={readOnly} onClick={()=>deleteItem(active.key)}>Remove entry</button></section>;
 if(collection)return <section className="form-collection"><div className="form-collection-tools"><label htmlFor={inputId}>Search entries<input id={inputId} type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(50);}}/></label><span role="status">{matching.length} of {node.children.length} entries</span></div>{matching.slice(0,limit).map(child=><div className="form-entry" key={child.key}>{child.node.kind==='object'?<button className="form-entry-open" onClick={()=>setSelected(child.key)}><EntryThumbnail node={child.node} name={entryTitle(child.key,child.node)}/><span><strong>{entryTitle(child.key,child.node)}</strong><small>{String(child.key)}{parentLabel(child.node,context.catalog)}</small></span></button>:<FormNode source={source} node={child.node} path={path.concat(child.key)} schema={itemSchema} readOnly={readOnly} change={change} title={fieldTitle(child.key)}/>}<div className="form-entry-actions">{node.kind==='array'&&<><button aria-label={'Move '+fieldTitle(child.key)+' up'} disabled={readOnly||child.key===0} onClick={()=>moveItem(Number(child.key),-1)}>↑</button><button aria-label={'Move '+fieldTitle(child.key)+' down'} disabled={readOnly||child.key===node.children.length-1} onClick={()=>moveItem(Number(child.key),1)}>↓</button></>}<button className="danger" disabled={readOnly} onClick={()=>deleteItem(child.key)}>Remove</button></div></div>)}{matching.length>limit&&<button onClick={()=>setLimit(limit+50)}>Show more entries ({matching.length-limit} remaining)</button>}{!matching.length&&<p>{node.children.length?'No matching entries.':'No entries yet.'}</p>}{!readOnly&&<div className="form-add">{node.kind==='object'&&<input aria-label="New entry ID" placeholder="New entry ID" value={newKey} onChange={event=>setNewKey(event.target.value)}/>}<button disabled={node.kind==='object'&&!newKey.trim()} onClick={()=>add(node.kind==='array'?node.children.length:newKey,itemSchema)}>Add entry</button>{error&&<p role="alert">{error}</p>}</div>}</section>;
 const fields=schemaFields(schema),missing=Object.keys(fields).filter(key=>!node.children.some(child=>child.key===key));
 return <section className="form-object"><HealthDisplay source={source} node={node}/>{node.children.map(child=>child.node.kind==='object'||child.node.kind==='array'?<FieldGroup key={child.key} title={fieldTitle(child.key)} count={child.node.children.length}><FormNode source={source} node={child.node} path={path.concat(child.key)} schema={childSchema(schema,child.key)} readOnly={readOnly} change={change} title={fieldTitle(child.key)}/></FieldGroup>:<FormNode key={child.key} source={source} node={child.node} path={path.concat(child.key)} schema={childSchema(schema,child.key)} readOnly={readOnly} change={change} title={fieldTitle(child.key)}/>)}{missing.length>0&&!readOnly&&<details><summary>Add a field</summary><p>Absent fields stay absent until you add them.</p>{missing.map(key=><button key={key} onClick={()=>add(key,fields[key])}>Add {fieldTitle(key)}</button>)}</details>}</section>;
}
function FieldGroup({title,count,children}:{title:string;count:number;children:React.ReactNode}){
 const [open,setOpen]=useState(false);
 const context=useContext(WorldEditorContext),child=React.isValidElement<{path:Path;readOnly:boolean}>(children)?children:null;
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary>{title} <small>{count} entries</small></summary>{open&&<>{child&&<div className="form-group-heading"><FieldFillButton path={context.basePath.concat(child.props.path)} title={title} readOnly={child.props.readOnly}/></div>}{children}</>}</details>;
}
function EntryThumbnail({node,name}:{node:Node;name:string}){
 const [failed,setFailed]=useState(''),image=entryImage(node);
 return image&&image!==failed?<img className="form-entry-thumbnail" src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(image)}/>:<span className="form-entry-placeholder" aria-hidden="true">{name.slice(0,1)}</span>;
}
function EntrySummary({source,node}:{source:string;node:Node}){
 const image=entryImage(node),context=useContext(WorldEditorContext);
 return <>{parentLabel(node,context.catalog)&&<p className="muted">{parentLabel(node,context.catalog).slice(3)}</p>}{image&&<ImageInspection url={image} name={nodeText(node,'properName')||nodeText(node,'name')||'Entry image'}><img className="form-image" src={image} alt="Entry image" referrerPolicy="no-referrer"/></ImageInspection>}</>;
}
function HealthDisplay({source,node}:{source:string;node:Node}){
 const health=healthSummary(source,node);if(!health)return null;
 return <div className="form-health" role="group" aria-label="Character health"><strong>Health · {health.current} / {health.maximum}</strong>{health.percentage!==undefined?<div role="meter" aria-label="Health percentage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.percentage}><span style={{width:health.percentage+'%'}}/></div>:<small>Exact values shown; a proportional bar is unavailable for these values.</small>}</div>;
}
function parentLabel(node:Node,catalog:ReferenceCatalog){
 for(const [field,section] of [['currentLocation','locations'],['region','regions'],['realm','realms']]){
  const value=nodeText(node,field);if(value)return ' · '+fieldTitle(field)+': '+(catalog[section]?.find(choice=>choice.id===value)?.name||value);
 }
 return '';
}
function entryTitle(key:string|number,node:Node){
 for(const field of ['properName','name','title']){try{const value=at(node,[field]);if(value.kind==='string'&&value.value)return String(value.value);}catch{}}
 return fieldTitle(key);
}
