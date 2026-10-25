import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chatPanelNavigationAllowed,chatPanelBounds,chatPanelOrigin} from './chat-panel-policy';
test('Chat diagnostics retain origins only, never credentials, paths or query strings',()=>{
 assert.equal(chatPanelOrigin('https://user:secret@auth.openai.com/account/name?code=private#token'),'https://auth.openai.com');
 assert.equal(chatPanelOrigin('data:text/html,private'),'non-https');
 assert.equal(chatPanelOrigin('not a URL'),'invalid-url');
});
test('Chat panel permits only HTTPS ChatGPT and supported identity hosts',()=>{
 for(const url of ['https://chatgpt.com/','https://auth.openai.com/login','https://accounts.google.com/o/oauth2/auth'])assert.equal(chatPanelNavigationAllowed(url),true,url);
 for(const url of ['file:///etc/passwd','javascript:alert(1)','http://chatgpt.com','https://chatgpt.com.attacker.test','https://user:secret@chatgpt.com','https://chatgpt.com:444','https://example.com','data:text/html,hi'])assert.equal(chatPanelNavigationAllowed(url),false,url);
});
test('Chat panel bounds are finite and constrained to the application window',()=>{
 assert.deepEqual(chatPanelBounds({x:-10,y:30,width:2000,height:900},1000,700),{x:0,y:30,width:1000,height:670});
 assert.deepEqual(chatPanelBounds({x:1200,y:800,width:10,height:10},1000,700),{x:1000,y:700,width:0,height:0});
 for(const value of [null,{}, {x:NaN,y:0,width:10,height:10},{x:0,y:0,width:Infinity,height:10},{x:'0',y:0,width:10,height:10}])assert.throws(()=>chatPanelBounds(value,1000,700));
});
