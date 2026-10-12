import React from 'react';

export function PackageMetadata({fields}:{fields:{key:string;source:string}[]}){
 if(!fields.length)return null;
 return <details className="package-metadata"><summary>Package metadata · read only</summary><p>Voyage identity, publication details and server status are separate from world content. Edit public copy through Publish; identity and server status cannot be changed here.</p><dl>{fields.map(field=><React.Fragment key={field.key}><dt>{field.key}</dt><dd><pre>{field.source}</pre></dd></React.Fragment>)}</dl></details>;
}
