import React from 'react';

export function WorldExportButtons({disabled=false,onExport}:{disabled?:boolean;onExport:(format:'project'|'voyage')=>void}){
 return <><button disabled={disabled} onClick={()=>onExport('project')}>Export project JSON</button><button disabled={disabled} onClick={()=>onExport('voyage')}>Export Voyage GameState</button><p>Project JSON keeps the editable envelope and metadata. Voyage GameState exports only the saved game-state object, like Studio. Neither option rewrites IDs or includes unapplied drafts.</p></>;
}
