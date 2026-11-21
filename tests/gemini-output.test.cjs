const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function setup(responses){const requests=[];const c=vm.createContext({getGeminiKey:()=> 'test-key',GEMINI_MODEL:'gemini-3.5-flash',setTimeout:fn=>fn(),fetch:async(url,options)=>{requests.push(JSON.parse(options.body));const data=responses.shift();if(!data)throw Error('Unexpected extra request');return {ok:true,json:async()=>data}}});vm.runInContext(html.slice(html.indexOf('function nutritionResponseSchema('),html.indexOf('// Builds the prompt parts')),c);vm.runInContext(html.slice(html.indexOf('async function withRetry('),html.indexOf('async function requestMacroEstimate(')),c);return {c,requests};}
const reply=(text,finishReason='STOP')=>({candidates:[{finishReason,content:{parts:[{text}]}}]});
const nutrition={food_name:'Sauces',calories_per_100g:163,protein_per_100g:2,carbs_per_100g:32,fat_per_100g:2.6,fiber_per_100g:1,salt_per_100g:1.2};
test('truncated photo JSON retries with a larger budget and the same photos/schema',async()=>{
 const {c,requests}=setup([reply('{"food_name":"Sauces","salt_per_100g','MAX_TOKENS'),reply(JSON.stringify(nutrition))]);
 const parts=[{text:'Analyze'},{inline_data:{mime_type:'image/jpeg',data:'photo-1'}},{inline_data:{mime_type:'image/jpeg',data:'photo-2'}}];
 const schema=c.nutritionResponseSchema();const result=await c.callGeminiRaw(parts,true,schema);assert.equal(c.parseMacroJSON(result.text,result.finishReason).saltPer100,1.2);
 assert.deepEqual(requests.map(r=>r.generationConfig.maxOutputTokens),[8192,16384]);assert.deepEqual(requests[0].contents,requests[1].contents);assert.deepEqual(requests[0].generationConfig.responseSchema,requests[1].generationConfig.responseSchema);assert.ok(schema.required.includes('salt_per_100g'));
});
test('empty MAX_TOKENS retries, and repeated truncation stops without outer retry loops',async()=>{
 const {c,requests}=setup([reply('','MAX_TOKENS'),reply('partial','MAX_TOKENS')]);
 await assert.rejects(c.withRetry(()=>c.callGeminiRaw([{text:'Analyze'}],true),1),/ran out of response space/);assert.equal(requests.length,2);
});
test('all non-thought response text parts are joined',async()=>{
 const {c}=setup([{candidates:[{finishReason:'STOP',content:{parts:[{text:'hidden reasoning',thought:true},{text:'{"answer":'},{text:'"Done"}'}]}}]}]);assert.equal((await c.callGeminiRaw([],true)).text,'{"answer":"Done"}');
});
test('incomplete or invalid nutrition is never silently converted to zeros',()=>{
 const {c}=setup([]);const missing={...nutrition};delete missing.salt_per_100g;
 for(const value of [missing,{...nutrition,protein_per_100g:-1},{...nutrition,food_name:''},{...nutrition,calories_per_100g:'163'}])assert.throws(()=>c.parseMacroJSON(JSON.stringify(value),'STOP'),/incomplete nutrition/);
 const valid={...nutrition,salt_per_100g:0};assert.equal(c.parseMacroJSON(JSON.stringify(valid),'STOP').saltPer100,0);
});
test('required output schema respects per-item versus per-100g fields',()=>{
 const {c}=setup([]);const schema=c.nutritionResponseSchema('item');assert.ok(schema.required.includes('calories_per_item'));assert.equal(schema.properties.calories_per_100g,undefined);assert.ok(c.nutritionResponseSchema('g',true).required.includes('typical_weight_g'));
});
