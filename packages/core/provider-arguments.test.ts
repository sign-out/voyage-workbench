import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apiRequest,apiResponse,type Protocol,type TaskRoute} from './providers';

for(const protocol of ['openai','openai-responses'] as Protocol[])test(protocol+' retains identified malformed arguments for bounded tool recovery',()=>{
 const malformed='{"path":[',wire=protocol==='openai'?{choices:[{message:{tool_calls:[{id:'bad',function:{name:'world_read',arguments:malformed}}]}}]}:{status:'completed',output:[{type:'function_call',call_id:'bad',name:'world_read',arguments:malformed}]};
 const response=apiResponse(protocol,wire);
 assert.deepEqual(response.calls,[{id:'bad',name:'world_read',args:null,rawArguments:malformed}]);
 const route:TaskRoute={id:'fixture',name:'Fixture',protocol,baseUrl:'https://example.invalid/v1',model:'fixture',stage:'planning'};
 const request=JSON.parse(apiRequest(route,'',[{role:'user',text:'Inspect'},response,{role:'tool',callId:'bad',name:'world_read',text:'{"error":"Correct the tool argument JSON"}'}],false).body);
 if(protocol==='openai')assert.equal(request.messages[2].tool_calls[0].function.arguments,malformed);
 else assert.equal(request.input[1].arguments,malformed);
});

test('unidentifiable calls and provider errors remain terminal rather than becoming tool recovery',()=>{
 assert.throws(()=>apiResponse('openai',{choices:[{message:{tool_calls:[{function:{name:'world_read',arguments:'{bad'}}]}}]}),/Invalid Chat Completions function call/);
 assert.throws(()=>apiResponse('openai-responses',{status:'completed',output:[{type:'function_call',arguments:'{bad'}]}),/Invalid Responses function call/);
 assert.throws(()=>apiResponse('openai',{error:{message:'Authentication failed'}}),/Authentication/);
});
