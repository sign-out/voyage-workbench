import React,{useMemo,useState} from 'react';
import {parse,type Change} from '../../../packages/core/document';

export function ImportReplacementNotice(){
 return <p className="import-note" role="status">This imports world/GameState data, not a JSON Schema. It is a replacement proposal, not a merge or schema migration: existing fields absent from the imported document can be proposed for removal. Nothing changes until you accept. To keep both worlds, close this project first and import the file as a new local project.</p>;
}

export function ProposalFormattingNotice(){
 return <p className="import-note" role="status">Formatting-only differences are kept automatically: current object key order, whitespace and equivalent value spellings do not need review. Only actual value changes are listed. Added or removed fields and array reordering still need review.</p>;
}

export function ProposalDiff({change}:{change:Change}){
 const [showExact,setShowExact]=useState(false);
 const order=useMemo(()=>change.kind==='order'?{before:parse(change.before).children.map(child=>child.key),after:parse(change.after).children.map(child=>child.key)}:null,[change.kind,change.before,change.after]);
 const exact=<div className="diff"><pre className="before">{change.before||'Not present'}</pre><pre className="after">{change.after||'Removed'}</pre></div>;
 if(!order)return exact;
 return <><p>Object key order changed. This entry compares key order, not all values in the object. Value edits, additions and removals are listed separately and still need review.</p><div className="diff" aria-label="Object key order before and after"><pre className="before">{JSON.stringify(order.before,null,2)}</pre><pre className="after">{JSON.stringify(order.after,null,2)}</pre></div><button aria-expanded={showExact} onClick={()=>setShowExact(!showExact)}>{showExact?'Hide exact object JSON':'Show exact object JSON'}</button>{showExact&&exact}</>;
}
