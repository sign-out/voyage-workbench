const {cursorOperation}=require('./cursor-sdk.cjs');
const {createInterface}=require('node:readline');
const abort=new AbortController();
process.on('SIGTERM',()=>abort.abort());
process.on('SIGINT',()=>abort.abort());
console.log=console.info=console.warn=console.error=()=>{};
const emit=event=>process.stdout.write(JSON.stringify({voyageCursor:1,...event})+'\n');
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
let bytes=0;
process.stdin.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){abort.abort();process.exit(1);}});
lines.once('line',async line=>{
 lines.close();
 try{
  const request=JSON.parse(line);
  const sdk=require('@cursor/sdk');
  await cursorOperation(sdk,request,process.cwd(),emit,abort.signal);
  process.exit(0);
 }catch(error){emit({type:'error',message:'Cursor operation failed. Check sign-in, model access, connection, or usage limits. No API fallback was used.'});process.exit(1);}
});
