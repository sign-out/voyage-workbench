import React,{useEffect,useState} from 'react';
import {authoringPreferences,type AuthoringPreferences} from '../../../packages/core/authoring';
export const authoringStorageKey='voyage-authoring-v1';
export function readAuthoring(storage:Pick<Storage,'getItem'>){try{return authoringPreferences(JSON.parse(storage.getItem(authoringStorageKey)||'null'));}catch{return authoringPreferences(null);}}
export function AuthoringSettings({value,onChange}:{value:AuthoringPreferences;onChange:(value:AuthoringPreferences)=>void}){
 const [advisoryText,setAdvisoryText]=useState(value.advisorySections.join(', '));
 useEffect(()=>setAdvisoryText(value.advisorySections.join(', ')),[JSON.stringify(value.advisorySections)]);
 const update=(patch:Partial<AuthoringPreferences>)=>onChange(authoringPreferences({...value,...patch}));
 return <section className="connection-card authoring-settings"><h3>Authoring defaults</h3><p>Defaults affect new views and new tasks, not saved world content, bookmarks or approved Work Orders. Preservation and explicit review cannot be disabled.</p>
  <label>Completeness advisory sections<input aria-label="Completeness advisory sections" value={advisoryText} onChange={event=>setAdvisoryText(event.target.value)} onBlur={()=>update({advisorySections:advisoryText.split(',').map(section=>section.trim()).filter(Boolean)})}/><small>Comma-separated authored section names; saved when you leave this field. Empty disables optional-content advice, not structural validation.</small></label>
  <label>Recent entries to remember<input aria-label="Recent entry limit" type="number" min="0" max="50" value={value.recentLimit} onChange={event=>update({recentLimit:Number(event.target.value)})}/></label>
  <label>New scope selection<select value={value.scopeDefault} onChange={event=>update({scopeDefault:event.target.value as AuthoringPreferences['scopeDefault']})}><option value="selected">Current entry</option><option value="system">Current system</option></select></label>
  <label>Proposal review grouping<select value={value.reviewGrouping} onChange={event=>update({reviewGrouping:event.target.value as AuthoringPreferences['reviewGrouping']})}><option value="entity">By entry / entity</option><option value="field">Exact field order</option></select></label>
  <label>Reference impact filter<select value={value.impactDirection} onChange={event=>update({impactDirection:event.target.value as AuthoringPreferences['impactDirection']})}><option value="all">Incoming and outgoing</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select></label>
  <label>Asset inventory filter<select value={value.assetKind} onChange={event=>update({assetKind:event.target.value as AuthoringPreferences['assetKind']})}><option value="all">All</option><option value="image">Images</option><option value="audio">Audio</option></select></label>
  <label>Default batch field<input value={value.batchField} onChange={event=>update({batchField:event.target.value})}/></label>
  <label><input type="checkbox" checked={value.guidanceExpanded} onChange={event=>update({guidanceExpanded:event.target.checked})}/>Expand contextual guidance initially</label>
  <label><input type="checkbox" checked={value.readinessAdvice} onChange={event=>update({readinessAdvice:event.target.checked})}/>Show readiness advisory rows</label>
  <label><input type="checkbox" checked={value.duplicateName} onChange={event=>update({duplicateName:event.target.checked})}/>Offer a new display name when duplicating</label>
  <label><input type="checkbox" checked={value.includeNotes} onChange={event=>update({includeNotes:event.target.checked})}/>Include builder notes by default in new agent tasks</label><p className="muted">Each planning/work request has its own override. Address project notes always includes the explicitly queued notes.</p>
  <button onClick={()=>onChange(authoringPreferences(null))}>Reset authoring defaults</button>
 </section>;
}
