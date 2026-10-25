const fs=require('node:fs');
const path=require('node:path');

const base='https://api-alpha.aidungeon.com/creator/v1';
function list(data,name){const value=data?.data??data;return Array.isArray(value)?value:Array.isArray(value?.[name])?value[name]:null;}
function identifier(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:null;}
function validationBody(text,stage){
 const {parse,statePath,read}=require('../build/native-ts/document.js');
 const root=parse(text),state=statePath(root);
 if(!state.length)throw new Error('World response has no recognized initialGameState envelope.');
 const world=read(text,state.slice(0,-1));
 if(!['draft','publish'].includes(stage))throw new Error('Unsupported validation stage.');
 return '{"stage":'+JSON.stringify(stage)+',"world":'+world+'}';
}
async function runChecks(key,request=fetch,makeValidationBody=validationBody){
 if(typeof key!=='string'||!key.trim())throw new Error('No Alpha Voyage key is stored in this profile. Connect it in the app first.');
 const checks=[],deadline=Date.now()+180000;
 let halted=false;
 async function check(method,endpoint,label,body){
  if(halted||checks.length>=16||Date.now()>=deadline)return null;
  if(!((method==='GET'&&/^\/(usage|worlds(?:\?page=[01](?:&type=mod)?|\/[A-Za-z0-9_-]+(?:\/revisions(?:\/[A-Za-z0-9_-]+)?|\/moderation)?)?|mods)$/.test(endpoint))||(method==='POST'&&endpoint==='/validate')))throw new Error('Live test request is not read-only or validation.');
  const result={check:label,method,status:null};checks.push(result);
  try{
   const response=await request(base+endpoint,{method,headers:{Authorization:'Bearer '+key,Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body,redirect:'error',signal:AbortSignal.timeout(Math.min(15000,Math.max(1,deadline-Date.now())))});
   result.status=response.status;
   result.etagPresent=!!response.headers.get('etag');
   result.retryAfterPresent=!!response.headers.get('retry-after');
   result.requestIdPresent=!!response.headers.get('x-request-id');
   if(!response.ok){if([401,403,429].includes(response.status)||response.status>=500)halted=true;return null;}
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>8*1024*1024)throw new Error('Response exceeds test size limit.');chunks.push(Buffer.from(chunk.value));}}finally{await reader.cancel().catch(()=>{});}
   const text=Buffer.concat(chunks).toString('utf8'),json=JSON.parse(text);
   result.json=true;
   return {text,json,result};
  }catch{result.failure='Request or response could not be verified; no automatic retry was made.';halted=true;return null;}
 }
 await check('GET','/usage','usage');
 const worlds=await check('GET','/worlds?page=0','worlds first page');
 const rows=worlds&&list(worlds.json,'worlds');
 if(worlds)worlds.result.listRecognized=rows!==null;
 if(rows?.length)await check('GET','/worlds?page=1','worlds second page');
 await check('GET','/worlds?page=0&type=mod','owned mods');
 await check('GET','/mods','available mods');
 const world=rows?.find(row=>identifier(row?.shortId)),worldId=identifier(world?.shortId);
 if(worldId){
  const remote=await check('GET','/worlds/'+worldId,'owned world download');
  const revisions=await check('GET','/worlds/'+worldId+'/revisions','revision list');
  const history=revisions&&list(revisions.json,'revisions');
  if(revisions)revisions.result.listRecognized=history!==null;
  const revision=history?.find(row=>identifier(row?.revisionId??row?.id)),revisionId=identifier(revision?.revisionId??revision?.id);
  if(revisionId)await check('GET','/worlds/'+worldId+'/revisions/'+revisionId,'revision download');
  await check('GET','/worlds/'+worldId+'/moderation','existing moderation result');
  if(remote)for(const stage of ['draft','publish']){
   let body;try{body=makeValidationBody(remote.text,stage);}catch{checks.push({check:stage+' validation',skipped:'World envelope was not recognized safely.'});continue;}
   const validation=await check('POST','/validate',stage+' validation',body),report=validation?.json?.data;
   if(validation){validation.result.contractValid=typeof report?.valid==='boolean'&&Array.isArray(report?.errors)&&Array.isArray(report?.warnings)&&report?.stage===stage;validation.result.worldValid=report?.valid===true;validation.result.errorCount=Array.isArray(report?.errors)?report.errors.length:null;validation.result.warningCount=Array.isArray(report?.warnings)?report.warnings.length:null;}
  }
 }
 return {environment:'alpha',mutationsSent:0,automaticRetries:0,halted,attemptedChecksPassed:checks.every(result=>result.status>=200&&result.status<300&&!result.failure&&!result.skipped&&result.contractValid!==false),worldAvailable:!!worldId,checks,notTested:['remote save/restore/publication','upload reservations and media PUTs','paid generation','forced rate limits','production credentials']};
}
async function main(){
 const {app,safeStorage}=require('electron');
 const args=process.argv.slice(2);
 if(args.length&&!(args.length===2&&args[0]==='--profile'))throw new Error('Usage: electron tools/voyage-api-authenticated.cjs [--profile /absolute/app/profile]');
 if(args.length){if(!path.isAbsolute(args[1]))throw new Error('Profile must be an absolute app profile path.');app.setPath('userData',args[1]);}
 await app.whenReady();
 try{
  const file=path.join(app.getPath('userData'),'credentials.bin');
  if(!fs.existsSync(file))throw new Error('No persisted app credentials are available. Connect the phone or save the Alpha key in the desktop app; do not paste it into chat.');
  if(!safeStorage.isEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw new Error('Secure app credential storage is unavailable in this session. Open the desktop app in the original unlocked desktop session.');
  let key;try{key=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)))['voyage-alpha'];}catch{throw new Error('Stored app credentials could not be unlocked. Reconnect the key in the app.');}
  const report=await runChecks(key);
  const directory=path.resolve('.build-tools');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'voyage-api-authenticated.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report,null,2));app.exit(report.halted||!report.attemptedChecksPassed?1:0);
 }catch(error){console.error(error.message);app.exit(2);}
}
module.exports={runChecks,validationBody};
if(require.main===module)main().catch(()=>{console.error('Authenticated API test could not start. No credential details were logged.');require('electron').app.exit(2);});
