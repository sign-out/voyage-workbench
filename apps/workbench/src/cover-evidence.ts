import {coverCrop,coverViews,type CoverEvidence} from '../../../packages/core/covers';
import {imageInfo} from './features-api';
function titleLines(context:CanvasRenderingContext2D,title:string,width:number){
 const lines:string[]=[];let current='';
 for(const word of title.split(/\s+/)){const candidate=current?current+' '+word:word;if(current&&context.measureText(candidate).width>width){lines.push(current);current=word;}else current=candidate;}
 if(current)lines.push(current);
 const visible=lines.slice(0,3);if(lines.length>3)visible[2]+='…';
 return visible.map(line=>{while(context.measureText(line).width>width&&line.length>1)line=line.slice(0,-2)+'…';return line;});
}
export async function coverEvidence(dataUrl:string,title:string):Promise<CoverEvidence[]>{
 const {image,width,height}=await imageInfo(dataUrl);
 const canvas=document.createElement('canvas');
 const originalScale=Math.min(1,1024/Math.max(width,height));canvas.width=Math.round(width*originalScale);canvas.height=Math.round(height*originalScale);canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
 const evidence:CoverEvidence[]=[{id:'original',dataUrl:canvas.toDataURL('image/png')}];
 for(const view of coverViews){
  canvas.width=view.width;canvas.height=view.height;const context=canvas.getContext('2d')!,crop=coverCrop(width,height,view.width,view.height);
  context.beginPath();const radius=12;context.moveTo(radius,0);context.arcTo(view.width,0,view.width,view.height,radius);context.arcTo(view.width,view.height,0,view.height,radius);context.arcTo(0,view.height,0,0,radius);context.arcTo(0,0,view.width,0,radius);context.closePath();context.clip();
  context.drawImage(image,crop.left,crop.top,crop.width,crop.height,0,0,view.width,view.height);
  if(view.id==='phone'||view.id==='desktop'){
   const gradient=context.createLinearGradient(0,0,0,view.height);gradient.addColorStop(0,'#0005');gradient.addColorStop(.4,'#0000');gradient.addColorStop(1,'#000');context.fillStyle=gradient;context.fillRect(0,0,view.width,view.height);
   const fontSize=view.id==='phone'?28:36;context.font='bold '+fontSize+'px Georgia';context.fillStyle='#fff';const lines=titleLines(context,title,view.width-48),lineHeight=fontSize*1.15;
   lines.forEach((line,index)=>context.fillText(line,24,view.height-18-(lines.length-1-index)*lineHeight));
  }else{context.fillStyle='#1c222599';context.beginPath();context.arc(view.width-18,18,12,0,Math.PI*2);context.fill();}
  evidence.push({id:view.id,dataUrl:canvas.toDataURL('image/png')});
 }
 const crop=coverCrop(width,height,100,63);
 for(const id of ['thumbnail','blur','grayscale']){canvas.width=100;canvas.height=63;const context=canvas.getContext('2d')!;context.filter=id==='blur'?'blur(2px)':id==='grayscale'?'grayscale(1)':'none';context.drawImage(image,crop.left,crop.top,crop.width,crop.height,0,0,100,63);evidence.push({id,dataUrl:canvas.toDataURL('image/png')});}
 return evidence;
}
