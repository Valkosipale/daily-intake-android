const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function setup(){const c=vm.createContext({});vm.runInContext(html.slice(html.indexOf('function parseMacroJSON('),html.indexOf('// Builds the prompt parts')),c);vm.runInContext(html.slice(html.indexOf('function parsePhotoItems('),html.indexOf('async function requestPhotoEstimates(')),c);return c;}
const food=(name,indices,calories)=>({food_name:name,photo_indices:indices,calories_per_100g:calories,protein_per_100g:2,carbs_per_100g:20,fat_per_100g:1,fiber_per_100g:1,salt_per_100g:0.5});
test('distinct products retain separate nutrition and relevant photo indices',()=>{
 const items=setup().parsePhotoItems(JSON.stringify({items:[food('Gochujang',[1],200),food('Sweet sauce',[2],100)]}),2);
 assert.equal(items.length,2);assert.equal(items[0].estimate.calPer100,200);assert.equal(items[1].estimate.calPer100,100);assert.equal(items[0].photoIndices[0],1);assert.equal(items[1].photoIndices[0],2);assert.equal(items[0].estimate.typicalWeightG,0);
});
test('multiple views may support one product, and one image may show separate foods',()=>{
 const c=setup();const grouped=c.parsePhotoItems(JSON.stringify({items:[food('Bottle',[1,2,2],100)]}),2);assert.equal(grouped.length,1);assert.equal(grouped[0].photoIndices.length,2);
 assert.equal(c.parsePhotoItems(JSON.stringify({items:[food('A',[1],100),food('B',[1],200)]}),1).length,2);
});
test('invalid food lists, incomplete nutrients and invalid photo mappings are rejected',()=>{
 const c=setup();const incomplete=food('Bad',[2],100);delete incomplete.salt_per_100g;
 for(const response of [null,{items:[]},{items:[food('A',[1],100),incomplete]},{items:[food('A',[0],100)]},{items:[food('A',[3],100)]},{items:[food('A',[],100)]},{items:[food('A',['1'],100)]}])assert.throws(()=>c.parsePhotoItems(JSON.stringify(response),2));
});
test('unrequested AI serving weights never prefill the individual food amounts',()=>{
 const f={...food('Sauce',[1],100),typical_weight_g:500};assert.equal(setup().parsePhotoItems(JSON.stringify({items:[f]}),1)[0].estimate.typicalWeightG,0);
});
test('photo analysis accepts more than twenty distinct foods without an app count cap',()=>{
 const foods=Array.from({length:25},(_,i)=>food('Food '+i,[1],100+i));
 assert.equal(setup().parsePhotoItems(JSON.stringify({items:foods}),1).length,25);
});
