const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function context(){const ctx=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function parseMacroJSON('),html.indexOf('// Builds the prompt parts')),ctx);vm.runInContext(html.slice(html.indexOf('function parseItemQuestionReply('),html.indexOf('async function requestItemQuestion(')),ctx);return ctx;}
const nutrition={food_name:'Karjalanpaisti',calories_per_100g:115,protein_per_100g:14,carbs_per_100g:0.8,fat_per_100g:6.3,fiber_per_100g:0.3,salt_per_100g:0.9};
test('one reply can correct the food and estimate serving grams together',()=>{
 const c=context();const reply=c.parseItemQuestionReply(JSON.stringify({answer:'A typical serving is around 250g.',nutrition_update:nutrition,estimated_grams:250}));
 assert.equal(reply.nutrition.name,'Karjalanpaisti');assert.equal(reply.nutrition.calPer100,115);assert.equal(reply.grams,250);
});
test('a question-only answer leaves nutrition and grams unchanged',()=>{
 const r=context().parseItemQuestionReply(JSON.stringify({answer:'It contains protein.',nutrition_update:null,estimated_grams:null}));assert.equal(r.nutrition,null);assert.equal(r.grams,null);
});
test('weight-only answers do not replace nutrition',()=>{
 const r=context().parseItemQuestionReply(JSON.stringify({answer:'Estimate: 150.5g.',nutrition_update:null,estimated_grams:150.5}));assert.equal(r.nutrition,null);assert.equal(r.grams,150.5);
});
test('correction-only replies preserve serving weight',()=>{
 const r=context().parseItemQuestionReply(JSON.stringify({answer:'Updated the food.',nutrition_update:nutrition,estimated_grams:null}));assert.equal(r.nutrition.name,'Karjalanpaisti');assert.equal(r.grams,null);
});
test('incomplete or negative nutrition is rejected rather than saved as zero',()=>{
 for(const n of [{food_name:'Food'}, {...nutrition,salt_per_100g:-1},{...nutrition,carbs_per_100g:'0.8'}])assert.throws(()=>context().parseItemQuestionReply(JSON.stringify({answer:'Updated',nutrition_update:n})));
});
test('invalid weight, missing answers and malformed JSON are rejected',()=>{
 for(const value of [-1,0,'250'])assert.throws(()=>context().parseItemQuestionReply(JSON.stringify({answer:'Weight',estimated_grams:value})));
 assert.throws(()=>context().parseItemQuestionReply('{bad}'));assert.throws(()=>context().parseItemQuestionReply('{}'));
});
