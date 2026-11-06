import {useEffect,useRef,useState,type SetStateAction} from 'react';

export function useWorldField<T>(fallback:T,projectId:string){
 const [value,setValue]=useState(fallback),dirty=useRef(false),identity=useRef(projectId);
 useEffect(()=>{if(identity.current!==projectId){identity.current=projectId;dirty.current=false;setValue(fallback);}else if(!dirty.current)setValue(fallback);},[fallback,projectId]);
 function edit(next:SetStateAction<T>){dirty.current=true;setValue(next);}
 function reset(){dirty.current=false;setValue(fallback);}
 return [value,edit,reset] as const;
}
