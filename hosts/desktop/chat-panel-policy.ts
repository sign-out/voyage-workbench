export const chatPanelHome='https://chatgpt.com/';
export function chatPanelOrigin(value:string){
 try{const url=new URL(value);return url.protocol==='https:'?url.origin:'non-https';}catch{return 'invalid-url';}
}
const allowedHosts=new Set(['chatgpt.com','auth.openai.com','auth0.openai.com','accounts.google.com','appleid.apple.com','login.microsoftonline.com','login.live.com']);
export function chatPanelNavigationAllowed(value:string){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowedHosts.has(url.hostname);}catch{return false;}
}
export function chatPanelBounds(value:any,width:number,height:number){
 if(!value||!['x','y','width','height'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])))throw new Error('Invalid Chat panel bounds.');
 const x=Math.min(width,Math.max(0,Math.round(value.x))),y=Math.min(height,Math.max(0,Math.round(value.y)));
 return {x,y,width:Math.min(width-x,Math.max(0,Math.round(value.width))),height:Math.min(height-y,Math.max(0,Math.round(value.height)))};
}
