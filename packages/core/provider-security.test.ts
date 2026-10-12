import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest,defaultSettings,imageRoute,resolveRoute,validateEndpoint} from './providers';
test('remote provider credentials and world data require TLS, loopback endpoints remain usable',()=>{
 for(const endpoint of ['http://localhost:1234/v1','http://127.0.0.1:4500','http://[::1]:1234/v1','https://api.example.com/v1'])assert.equal(validateEndpoint(endpoint),endpoint);
 for(const endpoint of ['http://api.example.com/v1','http://192.168.1.4:1234','http://localhost.example.com','http://127.0.0.1.evil.example','https://user:password@example.com','https://example.com?key=secret','https://example.com:99999','http://localhost\\@evil.example'])assert.throws(()=>validateEndpoint(endpoint));
});
test('old saved insecure profiles cannot bypass transport checks through routes or image generation',()=>{
 const settings=defaultSettings();settings.profiles.push({id:'unsafe',name:'Old profile',protocol:'openai',baseUrl:'http://remote.example/v1',model:'model'});settings.routes.planning={profileId:'unsafe',model:''};settings.routes.artwork={profileId:'unsafe',model:'image'};
 assert.throws(()=>resolveRoute(settings,'planning'),/HTTPS/);assert.throws(()=>imageRoute(settings),/HTTPS/);assert.throws(()=>apiRequest({...settings.profiles[1],stage:'planning'},'secret',[],false),/HTTPS/);
});
