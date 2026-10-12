export function pageOffset(offset:number,total:number,size:number){return total>0?Math.min(offset,Math.floor((total-1)/size)*size):0;}
