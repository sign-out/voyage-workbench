import React from 'react';
import {ModelPicker} from './ModelPicker';
import {modelChoicesForStage,type ModelChoice} from '../../../packages/core/model-catalog';
import type {Profile,Stage} from '../../../packages/core/providers';

export function StageModelPicker({stage,profile,models,catalogError,value,onChange,disabled=false}:{stage:Stage;profile?:Profile;models?:ModelChoice[];catalogError?:string;value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const codex=profile?.protocol==='codex',artwork=stage==='artwork';
 const inherited=artwork&&!codex?profile?.imageModel:profile?.model;
 const effective=value||inherited||'';
 const selected=effective?models?.find(model=>model.id===effective):models?.find(model=>model.isDefault);
 const incompatible=codex&&artwork&&selected?.inputModalities&&!selected.inputModalities.includes('image');
 const unlisted=codex&&models!==undefined&&effective&&!selected;
 return <div className="stage-model-picker"><label>{artwork?(codex?'Codex CLI orchestrator model':'Image model'):'Model'}<ModelPicker label={stage+' model'} value={value} onChange={onChange} disabled={disabled} models={modelChoicesForStage(profile,models,stage)} placeholder={inherited?'Use connection default · '+inherited:codex?'Codex CLI default':artwork?'Enter image model ID':'Use connection default'}/></label>
 {codex&&artwork&&<small className="muted">Choose the CLI text model that calls image_gen.imagegen, not an image-engine ID. Codex CLI manages the image engine using your ChatGPT sign-in; no direct API fallback. Models explicitly lacking image input are excluded.</small>}
 {codex&&models===undefined&&<small className="muted">{catalogError?'CLI model discovery failed: '+catalogError+' Saved choices are unchanged. Refresh models to retry.':'Use Refresh models to load or retry the Codex CLI catalog. Defaults and saved model IDs remain unchanged; no models are guessed.'}</small>}
 {codex&&models?.length===0&&<small className="muted">The CLI returned no listed models. Use its default or an exact model you have verified; no fallback catalog is substituted.</small>}
 {incompatible&&<p role="alert">The saved Codex model cannot read images. Choose an image-capable CLI model; if inherited, change the connection default or set an artwork override. It has not been changed automatically.</p>}
 {unlisted&&<small className="muted">Saved model {effective} is not advertised by this CLI catalog. It is preserved, but access and compatibility are unverified.</small>}
 {codex&&!value&&selected?.availabilityNux?.message&&<small className="muted">Codex CLI notice: {selected.availabilityNux.message}</small>}
 </div>;
}
