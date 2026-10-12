import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {connectionPresets,profileFromPreset} from './provider-presets';
import {ConnectionCatalog} from './ConnectionCatalog';
import {defaultSettings,validateSettings,resolveRoute,supportedProtocol} from '../../../packages/core/providers';

test('every built-in connection creates a valid profile without changing routes or choosing a paid model',()=>{
 for(const preset of connectionPresets){const settings=defaultSettings(),routes=JSON.stringify(settings.routes),profile=profileFromPreset(preset,'test-'+preset.id);settings.profiles.push(profile);const validated=validateSettings(settings);assert.equal(JSON.stringify(validated.routes),routes);assert.equal(profile.model,'');assert.equal(profile.imageModel,'');assert.ok(!('key' in profile));settings.routes.planning={profileId:profile.id,model:'selected-model'};assert.equal(resolveRoute(settings,'planning').protocol,preset.protocol);}
});
test('catalog makes all supported providers discoverable on desktop and explains Android harness restrictions',()=>{
 for(const platform of ['desktop','android']){const markup=renderToStaticMarkup(<ConnectionCatalog platform={platform} onSelect={()=>{}} onClose={()=>{}}/>);for(const preset of connectionPresets)assert.ok(markup.includes(preset.name));assert.ok(markup.includes('does not change existing routes'));assert.equal((markup.match(/disabled=""/g)||[]).length,connectionPresets.filter(preset=>!supportedProtocol(preset.protocol,platform)).length);}
});
