const {test}=require('node:test');const assert=require('node:assert/strict');const ai=require('../www/openai.js');
test('OpenAI sends all photos, strict nullable schema and only its own key',async()=>{
 const schema={type:'OBJECT',properties:{answer:{type:'STRING'},nutrition_update:{type:'OBJECT',nullable:true,properties:{calories:{type:'NUMBER'}}}}};
 let sent;
 const reply=await ai.request([{text:'Analyze JSON'},{inline_data:{mime_type:'image/jpeg',data:'first'}},{inline_data:{mime_type:'image/png',data:'second'}}],true,schema,'openai-test',async(url,opts)=>{sent={url,...opts,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'{"answer":"OK"}'}}]})}});
 assert.equal(sent.url,'https://api.openai.com/v1/chat/completions');assert.equal(sent.headers.Authorization,'Bearer openai-test');
 assert.equal(sent.body.model,'gpt-4.1-mini');assert.equal(sent.body.messages[0].content[2].image_url.url,'data:image/png;base64,second');
 const converted=sent.body.response_format.json_schema.schema;
 assert.equal(converted.additionalProperties,false);assert.deepEqual(converted.required,['answer','nutrition_update']);assert.deepEqual(converted.properties.nutrition_update.type,['object','null']);assert.equal(converted.properties.nutrition_update.additionalProperties,false);assert.equal(schema.properties.nutrition_update.type,'OBJECT');assert.equal(reply.text,'{"answer":"OK"}');
});
test('missing key, quota, refusals and incomplete responses fail safely',async()=>{
 await assert.rejects(ai.request([],true,null,''),/No OpenAI API key/);
 for(const data of [{choices:[{finish_reason:'length',message:{content:'partial'}}]},{choices:[{finish_reason:'stop',message:{refusal:'Cannot help'}}]}]){
  await assert.rejects(ai.request([],true,null,'key',async()=>({ok:true,json:async()=>data})),e=>e.retryable===false);
 }
 await assert.rejects(ai.request([],true,null,'key',async()=>({ok:false,status:429,json:async()=>({error:{message:'Insufficient quota: add credits'}})})),e=>e.retryable===false&&/credits/.test(e.message));
});
