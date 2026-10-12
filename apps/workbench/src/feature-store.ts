import {request} from './host';
export async function feature<T>(key:string,fallback:T):Promise<T>{const source=await request('featureGet',{key});return source?JSON.parse(source):fallback;}
export async function saveFeature(key:string,value:any){return request('featureSet',{key,value:JSON.stringify(value)});}
