const {test}=require('node:test');const assert=require('node:assert/strict');
const M=require('../www/tdee.js'),Local=require('../www/tdee-local.js');
const profile={sex:'male',age:40,heightCm:173,weightKg:80};
function history({slope=0,intake=2200,spike=false}={}){
 const today='2026-11-27',start=M.shift(today,-42),days={},weights=[];
 for(let i=0;i<42;i++){
  const date=M.shift(start,i);
  days[date]={calories:intake,caloriesComplete:true,calorieQuality:1,activityComplete:true,activityQuality:1,estimatedTDEE:2200};
  if(i%4===0||i===41)weights.push({date,kg:80+i*slope+(spike&&i===20?2.5:0)});
 }
 return {today,days,weights};
}
function memory(seed={}){const data=new Map(Object.entries(seed));return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),key:i=>[...data.keys()][i],get length(){return data.size},data};}
function seedLocal(h){
 const gym={},steps={},observations={};const seed={'dic:profile':JSON.stringify(profile),'dic:weightLog':JSON.stringify(h.weights)};
 for(const [date,day] of Object.entries(h.days)){
  seed['dic:log:'+date]=JSON.stringify([{name:'Full meal 1',calories:day.calories/3},{name:'Full meal 2',calories:day.calories/3},{name:'Full meal 3',calories:day.calories/3}]);
  gym[date]={minutes:0,intensity:'moderate'};steps[date]={manual:8000};observations[date]={profile,gym:gym[date]};
 }
 seed['dic:gym']=JSON.stringify(gym);seed['dic:steps']=JSON.stringify(steps);seed['dic:tdee:v2']=JSON.stringify({version:2,started:M.shift(h.today,-42),observations});return seed;
}
test('male and female Mifflin–St Jeor BMR, baseline and no separate food thermogenesis',()=>{
 assert.equal(M.bmr(profile,80),1686.25);assert.equal(M.bmr({...profile,sex:'female'},80),1520.25);
 const t=M.estimate(profile,80,0);assert.equal(t.baseline,2023.5);assert.equal(t.estimatedTDEE,2023.5);
 assert.equal(M.bmr({...profile,age:41},80),1681.25);assert.equal(M.bmr({...profile,heightCm:174},80),1692.5);
});
test('weight-dependent steps include a 2000-step allowance and support zero/high counts',()=>{
 assert.equal(M.estimate(profile,80,0).stepCalories,0);assert.equal(M.estimate(profile,80,2000).stepCalories,0);
 assert.equal(M.estimate(profile,80,10000).stepCalories,256);assert.equal(M.estimate(profile,100,10000).stepCalories,320);
 assert.equal(M.estimate(profile,80,100000).stepCalories,3136);assert.equal(M.estimate(profile,80,-100).stepCalories,0);
});
test('all resistance-training intensities subtract rest exactly once',()=>{
 for(const [intensity,met] of Object.entries({light:3.5,moderate:4.5,hard:6})) assert.equal(M.gymCalories(80,{minutes:60,intensity}),(met-1)*3.5*80/200*60);
 assert.equal(M.gymCalories(80,{minutes:0,intensity:'hard'}),0);
 const t=M.estimate(profile,80,10000,{minutes:60,intensity:'moderate'});assert.equal(t.estimatedTDEE,t.baseline+256+294);
});
test('stable weight, loss and gain have the correct energy-balance signs',()=>{
 for(const slope of [0,-.04,.04]){
  const o=M.observe(history({slope}));assert.equal(o.eligible,true);assert.equal(o.confidence,'High');assert.ok(Math.abs(o.weeklyTrend-slope*7)<1e-10);assert.ok(Math.abs(o.observedTDEE-(2200-slope*7700))<1e-8);
 }
});
test('irregular measurements use calendar spacing, not measurement index',()=>{
 const h=history({slope:-.03});h.weights=[0,3,11,17,28,36,41].map(i=>({date:M.shift(h.today,-42+i),kg:80-i*.03}));
 const o=M.observe(h);assert.equal(o.eligible,true);assert.ok(Math.abs(o.weeklyTrend+.21)<1e-10);assert.equal(o.days,41);
});
test('weekly cheat/refeed days are included in the full intake average without clipping',()=>{
 const h=history();for(let i=0;i<42;i++)if(i%7===6)h.days[M.shift(h.today,-42+i)].calories=6000;
 const o=M.observe(h);const used=Object.entries(h.days).filter(([date])=>date<o.endExclusive).map(([,v])=>v.calories);
 assert.equal(o.averageIntake,used.reduce((a,b)=>a+b,0)/used.length);assert.equal(o.averageIntake>2600,true);
});
test('missing calorie and activity days are not zeroed or removed from the denominator',()=>{
 for(const field of ['caloriesComplete','activityComplete']){
  const h=history();h.days[M.shift(h.today,-22)][field]=false;
  assert.equal(M.observe(h).eligible,false);
 }
 const h=history();delete h.days[M.shift(h.today,-22)];assert.equal(M.observe(h).eligible,false);
});
test('a shorter fully covered interval can calibrate only when bounded by actual weights',()=>{
 const h=history();h.days[M.shift(h.today,-42)].activityComplete=false;
 const o=M.observe(h);assert.equal(o.eligible,true);assert.equal(o.start,M.shift(h.today,-38));assert.equal(o.days,37);
});
test('isolated water-weight spikes barely affect the robust slope and lower quality',()=>{
 const clean=M.observe(history({slope:-.02})),noisy=M.observe(history({slope:-.02,spike:true}));
 assert.ok(Math.abs(noisy.weeklyTrend-clean.weeklyTrend)<1e-10);assert.ok(noisy.quality<clean.quality);
 const h=history();h.weights=h.weights.map((w,i)=>({...w,kg:w.kg+(i%2?4:-4)}));assert.equal(M.observe(h).eligible,false);
});
test('short-term extreme weight changes cannot drive large corrections',()=>{
 const h=history({slope:-.2});assert.equal(M.observe(h).eligible,false);
});
test('insufficient duration, too few weights and incomplete today cannot enable calibration',()=>{
 const h=history();h.weights=h.weights.slice(-6);assert.equal(M.observe(h).eligible,false);
 const few=history();few.weights=few.weights.slice(0,5);assert.equal(M.observe(few).eligible,false);
 const full=history();const before=M.observe(full);full.days[full.today]={calories:99999,caloriesComplete:true,activityComplete:true,estimatedTDEE:1};full.weights.push({date:full.today,kg:120});assert.deepEqual(M.observe(full),before);
});
test('exponential smoothing is daily, quality weighted and bounded',()=>{
 const o={eligible:true,quality:1,calibrationTarget:200};let state=M.calibrate({},o,'2026-11-26');assert.equal(state.offset,20);
 assert.deepEqual(M.calibrate(state,o,'2026-11-26'),state);assert.deepEqual(M.calibrate(state,o,'2026-11-25'),state);
 state=M.calibrate(state,o,'2026-11-27');assert.equal(state.offset,38);
 assert.equal(M.calibrate({}, {...o,quality:.5},'2026-11-26').offset,10);
 assert.equal(M.calibrate(state,{eligible:false},'2026-11-28').offset,38);
});
test('repeated extreme corrections produce low-confidence warning without an initial jump',()=>{
 const o={eligible:true,quality:1,calibrationTarget:5000};let s={};
 for(let i=1;i<=60;i++){s=M.calibrate(s,o,M.shift('2026-09-01',i));assert.ok(Math.abs(s.offset)<=500);if(i===1)assert.equal(s.offset,50);if(i===3)assert.equal(s.warning,true);}
 assert.ok(s.offset>400);assert.equal(M.calibrate(s,{...o,calibrationTarget:100},'2027-01-01').warning,false);
});
test('local migration preserves original food, weights, steps, workouts and legacy TDEE across launches',()=>{
 const seed={'dic:profile':JSON.stringify(profile),'dic:weightLog':JSON.stringify([{date:'2026-10-01',kg:80}]),'dic:steps':JSON.stringify({'2026-11-25':{manual:9000}}),'dic:gym':JSON.stringify({'2026-11-25':{minutes:60,intensity:'moderate'}}),'dic:log:2026-11-25':JSON.stringify([{name:'Dinner',calories:1800}])};
 const storage=memory(seed),store=Local.create(storage);let c=store.sync('2026-11-27');const old=store.result(c,'2026-11-25','2026-11-27');
 const expected=Math.round(1686.25*1.2)+Math.round(9000*.5*80*(.413*173/100)/1000)+Math.round((3.5-1)*3.5*80/200*60);
 assert.equal(old.total,expected);assert.match(old.saved.source,/reconstructed/);assert.notEqual(old.recalculated,old.total);
 storage.setItem('dic:profile',JSON.stringify({...profile,age:50,weightKg:90}));c=Local.create(storage).sync('2026-11-28');assert.equal(store.result(c,'2026-11-25','2026-11-28').total,expected);
 for(const key of Object.keys(seed).filter(k=>k!=='dic:profile'))assert.equal(storage.getItem(key),seed[key]);
});
test('saved completed-day values cannot be overwritten by later activity or profile edits',()=>{
 const h=history(),storage=memory(seedLocal(h)),store=Local.create(storage);const c=store.sync(h.today),date=M.shift(h.today,-2),saved=store.result(c,date,h.today).total;
 const step=JSON.parse(storage.getItem('dic:steps'));step[date].manual=50000;storage.setItem('dic:steps',JSON.stringify(step));
 const updated=store.sync(h.today);assert.equal(store.result(updated,date,h.today).total,saved);assert.notEqual(store.result(updated,date,h.today).recalculated,saved);
});
test('relaunches apply calibration only once; current/future activity still changes personalized TDEE',()=>{
 const h=history(),storage=memory(seedLocal(h));let store=Local.create(storage),c=store.sync(h.today);const offset=c.state.calibration.offset;
 assert.ok(offset!==0);for(let i=0;i<5;i++){store=Local.create(storage);c=store.sync(h.today);assert.equal(c.state.calibration.offset,offset);}
 const a=store.result(c,h.today,h.today,{profile,weightKg:80,steps:2000,gym:{minutes:0}}),b=store.result(c,h.today,h.today,{profile,weightKg:80,steps:12000,gym:{minutes:0}});
 assert.equal(Math.round(b.total-a.total),320);assert.equal(a.calibrationOffset,b.calibrationOffset);assert.equal(a.projected,true);
});
test('missing phone finalization and unknown workouts cannot become complete historical activity',()=>{
 const h=history(),seed=seedLocal(h),steps=JSON.parse(seed['dic:steps']);for(const date of Object.keys(steps))steps[date]={phone:8000};seed['dic:steps']=JSON.stringify(steps);
 const storage=memory(seed),store=Local.create(storage);assert.equal(store.sync(h.today).observation.eligible,false);
 for(const date of Object.keys(steps))store.noteStepRead(date,h.today);assert.equal(store.sync(h.today).observation.eligible,true);
 const s=JSON.parse(storage.getItem('dic:tdee:v2'));s.observations={};storage.setItem('dic:tdee:v2',JSON.stringify(s));assert.equal(store.sync(h.today).observation.eligible,false);
});
test('missing/partial food does not count as fasting; explicit fasting does',()=>{
 const h=history(),seed=seedLocal(h),date=M.shift(h.today,-22);seed['dic:log:'+date]='[]';const storage=memory(seed),store=Local.create(storage);
 assert.equal(store.sync(h.today).observation.eligible,false);storage.setItem('dic:fasting:'+date,'true');assert.equal(store.sync(h.today).observation.eligible,true);
 storage.setItem('dic:log:'+date,JSON.stringify([{calories:100}]));assert.equal(store.sync(h.today).observation.eligible,false);
 storage.setItem('dic:log:'+date,JSON.stringify([{calories:null}]));assert.equal(store.sync(h.today).observation.eligible,false);
});
test('backup roundtrip preserves calibration metadata and refuses to replace existing snapshots',()=>{
 const h=history(),storage=memory(seedLocal(h)),store=Local.create(storage);const context=store.sync(h.today),backup=store.exportData();
 const other=Local.create(memory(seedLocal(h)));other.restore(backup);assert.deepEqual(other.exportData(),backup);
 const date=Object.keys(backup.records)[0];const incoming=JSON.parse(JSON.stringify(backup));incoming.records[date].total=1;other.restore(incoming);assert.equal(other.exportData().records[date].total,context.state.records[date].total);
});

test('confidence responds to unstable previous expenditure estimates and stale weigh-ins',()=>{
 const h=history(),stable=M.observe({...h,previousEstimates:[2200,2200,2200,2200]}),unstable=M.observe({...h,previousEstimates:[1200,4000,1200,4000]});
 assert.equal(stable.confidence,'High');assert.ok(unstable.quality<stable.quality);assert.equal(unstable.confidence,'Low');
 const stale={...h,today:M.shift(h.today,8)};assert.ok(M.observe(stale).quality<stable.quality);
});
test('a repeated guardrail warning disables applied calibration and is visible as Low confidence',()=>{
 const h=history({intake:3500}),seed=seedLocal(h),old=JSON.parse(seed['dic:tdee:v2']);
 old.calibration={offset:100,lastCalibrationDate:M.shift(h.today,-2),limitStreak:2,targets:[],estimates:[]};seed['dic:tdee:v2']=JSON.stringify(old);
 const c=Local.create(memory(seed)).sync(h.today);assert.equal(c.state.calibration.warning,true);assert.equal(c.observation.confidence,'Low');assert.equal(c.activeOffset,0);assert.match(c.observation.reason,/500/);
});
test('storage failure falls back to physiological estimates without modifying old records',()=>{
 const h=history(),storage=memory(seedLocal(h)),original=storage.getItem('dic:log:'+M.shift(h.today,-22));storage.setItem=()=>{throw Error('quota')};
 const c=Local.create(storage).sync(h.today);assert.equal(c.activeOffset,0);assert.equal(c.observation.confidence,'Low');assert.match(c.observation.reason,/storage/);assert.equal(storage.getItem('dic:log:'+M.shift(h.today,-22)),original);
});
test('unknown workout history and invalid food calories invalidate the aligned period',()=>{
 const h=history(),seed=seedLocal(h),date=M.shift(h.today,-22),snapshot=JSON.parse(seed['dic:tdee:v2']),gym=JSON.parse(seed['dic:gym']);
 delete snapshot.observations[date].gym;delete gym[date];seed['dic:tdee:v2']=JSON.stringify(snapshot);seed['dic:gym']=JSON.stringify(gym);
 assert.equal(Local.create(memory(seed)).sync(h.today).observation.eligible,false);
});
test('negative corrections are also smoothed and capped',()=>{
 const o={eligible:true,quality:1,calibrationTarget:-2000};let s=M.calibrate({},o,'2026-11-01');assert.equal(s.offset,-50);
 for(let i=1;i<80;i++)s=M.calibrate(s,o,M.shift('2026-11-01',i));assert.ok(s.offset>=-500&&s.offset<-400);assert.equal(s.warning,true);
});
test('repeated same-date weights cannot satisfy minimum measurement count',()=>{
 const h=history();h.weights=[...Array.from({length:6},()=>({date:M.shift(h.today,-42),kg:80})),{date:M.shift(h.today,-1),kg:79}];assert.equal(M.observe(h).eligible,false);
});
test('a pending activity batch defers smoothing until the whole observation is available',()=>{
 const h=history(),storage=memory(seedLocal(h)),store=Local.create(storage);
 const pending=store.sync(h.today,{allowCalibration:false});assert.equal(pending.state.calibration.lastCalibrationDate,null);
 const finished=store.sync(h.today);assert.equal(finished.state.calibration.lastCalibrationDate,M.shift(h.today,-1));assert.notEqual(finished.state.calibration.offset,0);
});
