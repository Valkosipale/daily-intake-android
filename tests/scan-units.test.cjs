const {test}=require('node:test');const assert=require('node:assert/strict');
const {SCAN_NUTRIENTS,scanTotals,setScanUnit,setScanItemWeight,setScanNutrient,scanValidationMessage,applyScanNutrition}=require('../www/scan-units.js');
const food=()=>({name:'Food',grams:'150',unit:'g',calPer100:200,proteinPer100:10,carbsPer100:30,fatPer100:5,fiberPer100:2,saltPer100:0.5});
test('known serving converts to one item and keeps totals when switching back',()=>{
 const f=food();setScanUnit(f,'item');assert.equal(f.calPerItem,300);assert.equal(f.quantity,'1');f.quantity='2';assert.equal(scanTotals([f]).calories,600);setScanUnit(f,'g');assert.equal(f.grams,'300');assert.equal(scanTotals([f]).calories,600);setScanUnit(f,'item');assert.equal(f.quantity,'2');
});
test('unknown item weight never reinterprets per100g values as per-item values',()=>{
 const f=food();f.grams='';setScanUnit(f,'item');assert.equal(f.calPerItem,'');assert.match(scanValidationMessage([f]),/calories per item/);setScanNutrient(f,SCAN_NUTRIENTS[0],'80');f.quantity='2';assert.equal(scanTotals([f]).calories,160);assert.equal(f.calPer100,200);assert.equal(scanTotals([f]).grams,0);
});
test('optional item weight converts manual per-item nutrition without changing its total',()=>{
 const f=food();f.grams='';setScanUnit(f,'item');setScanNutrient(f,SCAN_NUTRIENTS[0],'80');f.quantity='2';setScanItemWeight(f,'50');assert.equal(f.calPer100,160);assert.equal(scanTotals([f]).calories,160);setScanUnit(f,'g');assert.equal(f.grams,'100');assert.equal(scanTotals([f]).calories,160);
});
test('mixed weighed and counted foods sum correctly without inventing grams',()=>{
 const counted={unit:'item',quantity:'2',calPerItem:80,proteinPerItem:6,carbsPerItem:1,fatPerItem:5,fiberPerItem:0,saltPerItem:0.1};
 const t=scanTotals([food(),counted]);assert.equal(t.calories,460);assert.equal(t.grams,150);assert.equal(t.items,2);assert.equal(t.protein,27);assert.equal(t.hasPerItem,true);
});
test('fractional comma-decimal quantities work without weighing',()=>{
 const t=scanTotals([{unit:'item',quantity:'1,5',calPerItem:80}]);assert.equal(t.calories,120);assert.equal(t.items,1.5);
});
test('changing weight recalculates converted values, while clearing weight removes unsafe conversion',()=>{
 const f=food();setScanUnit(f,'item');setScanItemWeight(f,'50');assert.equal(f.calPerItem,100);setScanItemWeight(f,'');assert.equal(f.calPerItem,'');assert.equal(f.calPer100,200);
});
test('AI per-item values with no weight cannot revive stale per100g nutrition',()=>{
 const f=food();f.grams='';setScanUnit(f,'item');applyScanNutrition(f,{calPerItem:100,proteinPerItem:5,carbsPerItem:10,fatPerItem:4,fiberPerItem:1,saltPerItem:0.2});assert.equal(f.calPer100,'');assert.equal(scanTotals([f]).calories,100);
});
test('invalid quantities, item weights and nutrition are rejected; explicit zero calories are allowed',()=>{
 const f={unit:'item',quantity:'0',calPerItem:80};assert.match(scanValidationMessage([f]),/quantity/);f.quantity='1';f.itemWeightG='-2';assert.match(scanValidationMessage([f]),/positive item weight/);f.itemWeightG='';f.calPerItem='-1';assert.match(scanValidationMessage([f]),/zero or greater/);f.calPerItem=0;assert.equal(scanValidationMessage([f]),'');
});

test('nutrition display uses at most two decimals without changing calculation precision',()=>{
 const {formatScanValue}=require('../www/scan-units.js');
 assert.equal(formatScanValue(108.10000000000001),'108.1');
 assert.equal(formatScanValue(6.815),'6.82');
 assert.equal(formatScanValue(0.46412500000000007),'0.46');
 assert.equal(formatScanValue(0),'0');assert.equal(formatScanValue(''),'');
 const f=food();f.grams='235';setScanUnit(f,'item');
 const precise=f.saltPerItem;formatScanValue(precise);assert.equal(f.saltPerItem,precise);
});
