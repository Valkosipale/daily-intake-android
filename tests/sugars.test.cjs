const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function context(){
 const ctx=vm.createContext({entryUnit:'g',multiPhotoItems:[]});
 for(const [start,end] of [['function roundNum(','function formatDateShort('],['function computeScale(','function setEntryUnit('],['function mapOffProduct(','async function fetchOffProduct('],['function parseMacroJSON(','function buildPromptParts('],['function computeMultiPhotoTotals(','function renderMultiPhotoList(']]){
  vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end)),ctx);
 }
 return ctx;
}
test('sugars scale with grams while carbs and stated calories stay independent',()=>{
 const c=context();const n=c.computeScaledTotals(150,200,5,30,4,2,12,0.5,'g');
 assert.equal(n.sugars,18);assert.equal(n.carbs,45);assert.equal(n.calories,300);assert.equal(n.salt,0.8);assert.equal(n.fiber,3);
});
test('per-item amounts and comma decimals scale sugars correctly',()=>{
 const c=context();const n=c.computeScaledTotals('2,5',100,1,20,2,1,'6,4',0.2,'item');
 assert.equal(n.sugars,16);assert.equal(n.carbs,50);assert.equal(n.calories,250);
});
test('barcode sugars use sugars_100g rather than total carbs',()=>{
 const c=context();const result=c.mapOffProduct({product_name:'Food',nutriments:{carbohydrates_100g:30,sugars_100g:12,'energy-kcal_100g':200}},'123');
 assert.equal(result.sugarsPer100,12);assert.equal(result.carbsPer100,30);assert.equal(result.missing.includes('sugars'),false);
 const absent=c.mapOffProduct({nutriments:{carbohydrates_100g:30}},'123');
 assert.equal(absent.sugarsPer100,0);assert.equal(absent.missing.includes('sugars'),true);
});
test('AI nutrition JSON retains separate sugar and carb values',()=>{
 const c=context();const n=c.parseMacroJSON(JSON.stringify({food_name:'Food',calories_per_100g:200,carbs_per_100g:30,sugars_per_100g:12}),'STOP');
 assert.equal(n.sugarsPer100,12);assert.equal(n.carbsPer100,30);assert.equal(n.calPer100,200);
});
test('mixed scanned items blend sugars without changing calories or carbs',()=>{
 const c=context();c.multiPhotoItems=[{grams:'150',calPer100:200,proteinPer100:5,carbsPer100:30,fatPer100:4,sugarsPer100:12},{grams:'50',calPer100:100,proteinPer100:2,carbsPer100:10,fatPer100:1,sugarsPer100:2}];
 const n=c.computeMultiPhotoTotals();assert.equal(n.sugars,19);assert.equal(n.carbs,50);assert.equal(n.calories,350);assert.equal(n.grams,200);
});
test('older scanned entries without sugar data remain usable',()=>{
 const c=context();c.multiPhotoItems=[{grams:'100',calPer100:200,proteinPer100:5,carbsPer100:30,fatPer100:4}];
 assert.equal(c.computeMultiPhotoTotals().sugars,0);
});
