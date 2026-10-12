import * as doc from '../../../packages/core/document';
import * as features from '../../../packages/core/features';
import * as authoring from '../../../packages/core/authoring';
self.onmessage=({data})=>{try{const fn=(doc as any)[data.method]||(features as any)[data.method]||(authoring as any)[data.method];self.postMessage({id:data.id,result:fn(...data.args)});}catch(e){self.postMessage({id:data.id,error:(e as Error).message});}};
