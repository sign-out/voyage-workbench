import React from 'react';
import {supportedProtocol,protocols} from '../../../packages/core/providers';
import {connectionPresets,type ConnectionPreset} from './provider-presets';

export function ConnectionCatalog({platform,onSelect,onClose}:{platform:string;onSelect:(preset:ConnectionPreset)=>void;onClose:()=>void}){
 return <section id="connection-catalog" className="connection-card provider-presets" aria-label="Available connections"><div className="page-heading"><h3>Add a connection</h3><button onClick={onClose}>Close catalog</button></div><p>Choose a provider, connect its key or sign-in, then choose models for your stages. Adding a connection does not change existing routes or send a model request.</p>{[false,true].map(cli=><div key={String(cli)}><h4>{cli?'Agent harnesses':'Direct model APIs'}</h4><div className="connection-catalog-grid">{connectionPresets.filter(preset=>!!protocols.find(protocol=>protocol.id===preset.protocol)?.cli===cli).map(preset=>{const available=supportedProtocol(preset.protocol,platform);return <button key={preset.id} disabled={!available} onClick={()=>onSelect(preset)}><strong>{preset.name}</strong><span>{preset.description}</span>{!available&&<span>On-device CLI runtime not available yet. API connections are separate choices.</span>}</button>;})}</div></div>)}</section>;
}
