(function(root){
  // Convert Gemini nutrition schemas to strict JSON Schema for OpenAI.
  function schemaForOpenAI(schema){
    const result={type:schema.type.toLowerCase()};
    if(schema.properties){
      result.properties=Object.fromEntries(Object.entries(schema.properties).map(([key,value])=>[key,schemaForOpenAI(value)]));
      result.required=Object.keys(result.properties);
      result.additionalProperties=false;
    }
    if(schema.items) result.items=schemaForOpenAI(schema.items);
    if(schema.nullable) result.type=[result.type,'null'];
    return result;
  }
  async function request(parts,jsonMode,schema,key,fetcher=fetch){
    if(!key) throw new Error('No OpenAI API key set');
    const content=parts.map(part=>part.text!==undefined?{type:'text',text:part.text}:{type:'image_url',image_url:{url:'data:'+part.inline_data.mime_type+';base64,'+part.inline_data.data}});
    const body={model:'gpt-4.1-mini',messages:[{role:'user',content}],max_completion_tokens:8192};
    if(jsonMode) body.response_format=schema?{type:'json_schema',json_schema:{name:'nutrition_reply',strict:true,schema:schemaForOpenAI(schema)}}:{type:'json_object'};
    let response;
    try{response=await fetcher('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body)});}
    catch(error){throw new Error('Network request to OpenAI failed: '+error.message);}
    if(!response.ok){
      let message='Request failed';
      try{message=(await response.json()).error?.message||message;}catch(_){}
      const error=new Error('OpenAI API HTTP '+response.status+': '+message);
      if(response.status<500&&response.status!==429) error.retryable=false;
      // Exhausted credit is not fixed by retrying the request.
      if(response.status===429&&/quota|billing|credit/i.test(message)) error.retryable=false;
      throw error;
    }
    const choice=(await response.json()).choices?.[0];
    if(choice?.message?.refusal){const error=new Error('OpenAI could not analyze this request: '+choice.message.refusal);error.retryable=false;throw error;}
    if(choice?.finish_reason!=='stop'){const error=new Error('OpenAI did not finish its response. No incomplete nutrition was saved. Please try fewer photos or a simpler question.');error.retryable=false;throw error;}
    const text=choice.message?.content;
    if(typeof text!=='string'||!text.trim()) throw new Error('No response text from OpenAI');
    return {text,finishReason:'STOP'};
  }
  root.OpenAINutrition={request,schemaForOpenAI};
  if(typeof module==='object') module.exports=root.OpenAINutrition;
})(typeof window==='object'?window:globalThis);
