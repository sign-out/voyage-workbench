import React from 'react';
import {MoreHorizontal} from 'lucide-react';
import {WorkspaceMenu} from './WorkspaceMenu';
import {useCompactLayout} from './responsive-layout';

export function EditorMoreActions({children}:{children:React.ReactNode}){
 const phone=useCompactLayout();
 if(!phone)return <div className="editor-secondary-actions">{children}</div>;
 return <WorkspaceMenu className="editor-more-actions">
  <summary aria-label="More editor actions"><MoreHorizontal size={20}/></summary>
  <div className="editor-secondary-actions" role="group" aria-label="More editor actions">{children}</div>
 </WorkspaceMenu>;
}
