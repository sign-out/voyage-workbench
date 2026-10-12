import {open,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export function exportSource(source:unknown):string {
  if(typeof source!=='string'||!source.length)throw new Error('Nothing to export. Reload the saved local world and retry.');
  return source;
}

export async function writeExport(filePath:string,source:unknown):Promise<void> {
  const text=exportSource(source),temporary=path.join(path.dirname(filePath),'.voyage-export-'+randomUUID());
  let file:Awaited<ReturnType<typeof open>>|undefined;
  try{file=await open(temporary,'wx',0o600);await file.writeFile(text,'utf8');await file.sync();await file.close();file=undefined;await rename(temporary,filePath);}
  finally{if(file)await file.close();await unlink(temporary).catch(()=>{});}
}
export async function writeMediaExport(filePath:string,data:Uint8Array):Promise<void>{
 const temporary=path.join(path.dirname(filePath),'.voyage-export-'+randomUUID());let file:Awaited<ReturnType<typeof open>>|undefined;
 try{file=await open(temporary,'wx',0o600);await file.writeFile(data);await file.sync();await file.close();file=undefined;await rename(temporary,filePath);}
 finally{if(file)await file.close();await unlink(temporary).catch(()=>{});}
}
