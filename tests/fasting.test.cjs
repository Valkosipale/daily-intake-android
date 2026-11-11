const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const html=fs.readFileSync('www/index.html','utf8');
function setup(){
 const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),key:i=>[...data.keys()][i],get length(){return data.size}};
 const c=vm.createContext({window:{localStorage:storage},hasStorage:()=>true,console,currentDate:'2026-11-10',currentEntries:[]});
 vm.runInContext(html.slice(html.indexOf('function isFastingDay('),html.indexOf("document.getElementById('fastingDayBtn').addEventListener")),c);
 vm.runInContext(html.slice(html.indexOf('function getDayTotalsFromStorage('),html.indexOf("// 'week'")),c);
 vm.runInContext(html.slice(html.indexOf('async function saveEntries('),html.indexOf('function render(){')),c);
 return {c,storage};
}
test('explicit fasting is counted separately from an unlogged zero-calorie day',()=>{
 const {c}=setup();assert.equal(c.getDayTotalsFromStorage('2026-11-10').fasting,false);c.setFastingDay('2026-11-10',true);const t=c.getDayTotalsFromStorage('2026-11-10');assert.equal(t.fasting,true);assert.equal(t.cal,0);assert.equal(t.count,0);assert.equal(c.getFastingDays()[0],'2026-11-10');
});
test('removing a fasting marker returns the day to unlogged',()=>{
 const {c}=setup();c.setFastingDay('2026-11-10',true);c.setFastingDay('2026-11-10',false);assert.equal(c.getDayTotalsFromStorage('2026-11-10').fasting,false);assert.equal(c.getFastingDays().length,0);
});
test('food always takes precedence and saving food clears the fasting marker',async()=>{
 const {c,storage}=setup();c.setFastingDay('2026-11-10',true);c.currentEntries.push({name:'Food',calories:100});await c.saveEntries();assert.equal(c.isFastingDay('2026-11-10'),false);c.setFastingDay('2026-11-10',true);const t=c.getDayTotalsFromStorage('2026-11-10');assert.equal(t.fasting,false);assert.equal(t.cal,100);assert.equal(t.count,1);assert.equal(JSON.parse(storage.getItem('dic:log:2026-11-10'))[0].name,'Food');
});
