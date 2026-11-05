import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeReferences} from '../packages/core/references';

const legacy=JSON.parse(readFileSync('docs/wiki.json','utf8')).map(({tab,uiLocation,section,title,summary,schema,sizeLimits,related}:any)=>({tab,uiLocation,section,title,summary,schema,sizeLimits,related,schemaVersion:36,provenance:'Legacy V36-era wiki; advisory section coverage, not a complete V36 codec',environment:'unverified'}));
const snapshot=readFileSync('docs/references/voyage-v37-community.json','utf8');
const provenance=JSON.parse(readFileSync('docs/references/voyage-v37-community.meta.json','utf8'));
if(createHash('sha256').update(snapshot).digest('hex')!==provenance.bundledSha256)throw new Error('Bundled Voyage schema fingerprint mismatch.');
const current=normalizeReferences(JSON.parse(snapshot)).map(entry=>({section:entry.section,title:legacy.find((item:any)=>item.section===entry.section)?.title||entry.section,schema:entry.schema,schemaVersion:37,provenance:provenance.source,environment:'unverified',snapshotHash:provenance.sha256}));
mkdirSync('apps/workbench/public/references',{recursive:true});
writeFileSync('apps/workbench/public/references/sections.json',JSON.stringify(legacy.concat(current)));
