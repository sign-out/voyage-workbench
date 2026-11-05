import React from 'react';

export interface RunOptions {autoResume:boolean;allowDelegation:boolean}
export function AgentRunOptions({value,onChange,capabilities,disabled=false}:{value:RunOptions;onChange:(value:RunOptions)=>void;capabilities:{checkpointResume:boolean;delegation:boolean}|null;disabled?:boolean}){
 return <fieldset disabled={disabled}><legend>Permissions for the next Work Order</legend>
 <label><input type="checkbox" aria-label="Allow read-only delegated reviews" checked={value.allowDelegation} disabled={!capabilities?.delegation} onChange={event=>onChange({...value,allowDelegation:event.target.checked})}/>Allow up to two read-only child reviews using the same provider and model</label>
 <label><input type="checkbox" aria-label="Allow automatic checkpoint continuation" checked={value.autoResume} disabled={!capabilities?.checkpointResume} onChange={event=>onChange({...value,autoResume:event.target.checked})}/>Allow up to two automatic checkpoint continuations after a host restart</label>
 <p className="muted">Optional additional provider calls may incur charges. Reviews cannot edit or approve work. Continuation starts a fresh session from saved staged edits, not a replay of the old session. Lifetime tool budgets, approved scope, and local completion checks remain in force. Stop/cancel is never automatically retried. These permissions reset after starting work.</p>
 {capabilities&&!capabilities.delegation&&!capabilities.checkpointResume&&<p>These orchestration features are unavailable on this host. No provider fallback is used.</p>}
 {capabilities?.checkpointResume&&!capabilities.delegation&&<p>Checkpoint continuation runs when this Android project is reopened and the agent service is idle. Child-review delegation is currently desktop-only.</p>}
 </fieldset>;
}
