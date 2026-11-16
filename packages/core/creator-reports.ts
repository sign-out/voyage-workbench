import {voyageProfile,type VoyageEnvironment} from './voyage-compatibility';

export const creatorReportKinds=['summary','daily','session-depth','sources','feedback'] as const;
export type CreatorReportKind=typeof creatorReportKinds[number];
export type CreatorReportQuery={report:CreatorReportKind;environment:VoyageEnvironment;worldId?:string;from?:string;to?:string;rating?:string;query?:string;page?:number;limit?:number};
export const creatorReportLabels:Record<CreatorReportKind,string>={summary:'Publish history & retention',daily:'Daily play','session-depth':'Session depth',sources:'Discovery sources',feedback:'Shared feedback'};

export function creatorReportsAvailable(environment:unknown){return voyageProfile(environment).creatorReports.length>0;}
function record(value:any):Record<string,any>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Voyage returned an unreadable report object. No missing data is treated as zero.');return value;}
function text(value:any){if(typeof value!=='string')throw new Error('Voyage returned unreadable report text.');return value;}
function count(value:any){if(!Number.isSafeInteger(value)||value<0)throw new Error('Voyage returned an unreadable report count.');return value as number;}
function list(value:any,maximum:number):any[]{if(!Array.isArray(value)||value.length>maximum)throw new Error('Voyage returned an unreadable or oversized report list.');return value;}
function day(value:any){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Use a real UTC date in YYYY-MM-DD format.');return value;}
function timestamp(value:any){const result=text(value);if(!Number.isFinite(Date.parse(result)))throw new Error('Voyage returned an unreadable report timestamp.');return result;}
const sourceNames=['home','discover','search','links','profile','other'];
function sourceName(value:any){if(!sourceNames.includes(value))throw new Error('Voyage returned an unknown discovery source. Refresh compatibility information before interpreting it.');return value as string;}

export function creatorReportRequest(input:CreatorReportQuery,selectedEnvironment:unknown){
 const profile=voyageProfile(selectedEnvironment),available:readonly string[]=profile.creatorReports;
 if(!input||!creatorReportKinds.includes(input.report)||!available.includes(input.report))throw new Error('Creator reports are verified only on Alpha. Select the Alpha connection; no fallback request was made.');
 if(input.environment!==selectedEnvironment)throw new Error('The report connection changed. Load the report again on the selected connection.');
 const fields=['report','environment','worldId',...(input.report==='feedback'?['rating','query','page','limit']:input.report==='summary'?[]:['from','to'])];
 for(const key of Object.keys(input))if((input as any)[key]!==undefined&&!fields.includes(key))throw new Error('Unsupported report filter: '+key);
 const worldId=input.worldId?.trim()||'';
 if(worldId&&!/^[a-zA-Z0-9_-]{1,200}$/.test(worldId))throw new Error('Enter a Voyage world short ID, not a URL.');
 if(input.report!=='feedback'&&!worldId)throw new Error('Choose an owned world before loading analytics.');
 const query:string[]=[];
 const add=(key:string,value:string|number)=>query.push(key+'='+encodeURIComponent(value));
 if(input.report==='feedback'){
  if(worldId)add('world',worldId);
  if(input.rating){if(!['positive','negative'].includes(input.rating))throw new Error('Feedback rating must be positive or negative.');add('rating',input.rating);}
  if(input.query){if(typeof input.query!=='string'||input.query.length>500)throw new Error('Feedback search must be at most 500 characters.');add('query',input.query);}
  for(const key of ['page','limit'] as const)if(input[key]!==undefined){const value=count(input[key]);if(value<1||key==='limit'&&value>50)throw new Error('Feedback pages start at 1; page size must be 1–50.');add(key,value);}
 }else if(input.report!=='summary'){
  if(input.from)add('from',day(input.from));if(input.to)add('to',day(input.to));
  if(input.from&&input.to&&(input.from>input.to||(Date.parse(input.to)-Date.parse(input.from))/86400000>=365))throw new Error('Choose a forward range of at most 365 completed UTC days.');
 }
 const endpoint=input.report==='feedback'?'/feedback':'/worlds/'+encodeURIComponent(worldId)+'/analytics'+(input.report==='summary'?'':'/'+input.report);
 return {environment:input.environment,method:'GET' as const,endpoint:endpoint+(query.length?'?'+query.join('&'):'')};
}

type Retention={cohortPlayers:number;retainedPlayers:number;rate:number}|null;
type Summary={shortId:string;published:boolean;firstPublishedAt:string|null;dataThrough:string;publishes:{version:number;publishedAt:string}[];retention:Record<'d1'|'d2to7'|'d8to28',Retention>};
type Range={from:string;to:string;dataThrough:string};
type Daily=Range&{days:{date:string;sessions:number;starts:number;players:number|null;turns:number;playtimeSeconds:number;cappedPlaytimeSeconds:number|null;engagingSessions:number}[]};
type Depth=Range&{sessions:number;turns:{atLeast:number;sessions:number}[];minutes:{atLeast:number;sessions:number}[]};
type Sources=Range&{totals:{source:string;clicks:number}[];days:{date:string;source:string;clicks:number}[]};
type Feedback={page:number;total:number;totalPages:number;worlds:{shortId:string|null;title:string}[];items:{id:string;createdAt:string;rating:string;categories:string[];reason:string;isOwn:boolean;world:{shortId:string|null;title:string|null};heroesVersion:number}[]};
export type CreatorReport={kind:'summary';data:Summary}|{kind:'daily';data:Daily}|{kind:'session-depth';data:Depth}|{kind:'sources';data:Sources}|{kind:'feedback';data:Feedback};

export function parseCreatorReport(kind:CreatorReportKind,source:string):CreatorReport{
 if(typeof source!=='string'||source.length>4*1024*1024)throw new Error('Voyage report exceeds the local 4 MiB text limit.');
 const data=record(record(JSON.parse(source)).data);
 const bool=(value:any)=>{if(typeof value!=='boolean')throw new Error('Voyage returned an unreadable report flag.');return value as boolean;};
 const optionalText=(value:any)=>value===null?null:text(value);
 if(kind==='feedback'){
  const page=count(data.page),total=count(data.total),totalPages=count(data.totalPages);
  if(!page||total>0&&(!totalPages||page>totalPages))throw new Error('Voyage returned inconsistent feedback pagination.');
  const world=(value:any)=>{const entry=record(value);return {shortId:optionalText(entry.shortId),title:optionalText(entry.title)};};
  return {kind,data:{page,total,totalPages,worlds:list(data.worlds,10000).map(value=>{const entry=world(value);return {...entry,title:text(entry.title)};}),items:list(data.items,50).map(value=>{
   const entry=record(value);if(!['positive','negative'].includes(entry.rating))throw new Error('Voyage returned an unknown feedback rating.');
   return {id:text(entry.id),createdAt:timestamp(entry.createdAt),rating:entry.rating,categories:list(entry.categories,100).map(text),reason:text(entry.reason),isOwn:bool(entry.isOwn),world:world(entry.world),heroesVersion:count(entry.heroesVersion)};
  })}};
 }
 const dataThrough=day(data.dataThrough);
 if(kind==='summary'){
  const retention=record(data.retention),cohort=(value:any):Retention=>{
   if(value===null)return null;const entry=record(value),cohortPlayers=count(entry.cohortPlayers),retainedPlayers=count(entry.retainedPlayers);
   if(retainedPlayers>cohortPlayers||typeof entry.rate!=='number'||!Number.isFinite(entry.rate)||entry.rate<0||entry.rate>1)throw new Error('Voyage returned unreadable retention data.');
   return {cohortPlayers,retainedPlayers,rate:entry.rate};
  };
  return {kind,data:{shortId:text(data.shortId),published:bool(data.published),firstPublishedAt:data.firstPublishedAt===null?null:timestamp(data.firstPublishedAt),dataThrough,publishes:list(data.publishes,10000).map(value=>{const entry=record(value);return {version:count(entry.version),publishedAt:timestamp(entry.publishedAt)};}),retention:{d1:cohort(retention.d1),d2to7:cohort(retention.d2to7),d8to28:cohort(retention.d8to28)}}};
 }
 const from=day(data.from),to=day(data.to),range={from,to,dataThrough};
 if(from>to||to>dataThrough||(Date.parse(to)-Date.parse(from))/86400000>=365)throw new Error('Voyage returned an inconsistent completed-day range.');
 const inRange=(value:any)=>{const date=day(value);if(date<from||date>to)throw new Error('Voyage returned a day outside the report range.');return date;};
 if(kind==='daily')return {kind,data:{...range,days:list(data.days,365).map(value=>{const entry=record(value);return {date:inRange(entry.date),sessions:count(entry.sessions),starts:count(entry.starts),players:entry.players===null?null:count(entry.players),turns:count(entry.turns),playtimeSeconds:count(entry.playtimeSeconds),cappedPlaytimeSeconds:entry.cappedPlaytimeSeconds===null?null:count(entry.cappedPlaytimeSeconds),engagingSessions:count(entry.engagingSessions)};})}};
 if(kind==='session-depth'){
  const sessions=count(data.sessions),curve=(value:any)=>{let previousCount=sessions,previousThreshold=-1;return list(value,500).map((value,index)=>{const entry=record(value),atLeast=count(entry.atLeast),reached=count(entry.sessions);if(atLeast<=previousThreshold||reached>previousCount||index===0&&reached!==sessions)throw new Error('Voyage returned an inconsistent session-depth curve.');previousThreshold=atLeast;previousCount=reached;return {atLeast,sessions:reached};});};
  return {kind,data:{...range,sessions,turns:curve(data.turns),minutes:curve(data.minutes)}};
 }
 if(kind==='sources')return {kind,data:{...range,totals:list(data.totals,6).map(value=>{const entry=record(value);return {source:sourceName(entry.source),clicks:count(entry.clicks)};}),days:list(data.days,2190).map(value=>{const entry=record(value);return {date:inRange(entry.date),source:sourceName(entry.source),clicks:count(entry.clicks)};})}};
 throw new Error('Unknown Creator report.');
}
