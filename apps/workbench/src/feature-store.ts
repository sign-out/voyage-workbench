import {request} from './host';
export async function feature<T>(key:string,fallback:T):Promise<T>{const source=await request('featureGet',{key});return source?JSON.parse(source):fallback;}
export async function saveFeature(key:string,value:any){const result=await request('featureSet',{key,value:JSON.stringify(value)});if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function'&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('voyage-feature-changed',{detail:{key}}));return result;}
