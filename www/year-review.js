// Annual totals use completed calendar months, with no carry-over between years.
function completedYearMonths(year,today){
  const currentYear=Number(today.slice(0,4));
  const count=year<currentYear?12:year===currentYear?Number(today.slice(5,7))-1:0;
  return Array.from({length:count},(_,index)=>{
    const month=index+1;
    const start=year+'-'+String(month).padStart(2,'0')+'-01';
    const days=new Date(year,month,0).getDate();
    return {start,end:start.slice(0,8)+days,days};
  });
}
function buildYearReview(year,today,readDay,readTdee,readSteps,excludedMonths=[]){
  const keys=['cal','protein','carbs','fat','fiber','salt'];
  const completed=completedYearMonths(year,today);
  const hidden=new Set(excludedMonths);
  const months=completed.filter(month=>!hidden.has(month.start.slice(0,7))).map(month=>{
    const totals=Object.fromEntries(keys.map(key=>[key,0]));
    let loggedDays=0,foodDays=0,fastingDays=0,tdee=0,steps=0,stepDays=0,missingTdee=false;
    for(let day=1;day<=month.days;day++){
      const date=month.start.slice(0,8)+String(day).padStart(2,'0');
      const food=readDay(date);
      if(!(food.count>0||food.fasting===true)) continue;
      loggedDays++;
      if(food.count>0) foodDays++; else fastingDays++;
      for(const key of keys) totals[key]+=Number(food[key])||0;
      const burn=readTdee(date);
      if(burn===null) missingTdee=true;
      else tdee+=burn;
      const recorded=readSteps(date);
      if(recorded){steps+=recorded.steps;stepDays++;}
    }
    return {...month,totals,loggedDays,foodDays,fastingDays,tdee:missingTdee?null:tdee,steps,stepDays};
  });
  const logged=months.filter(month=>month.loggedDays>0);
  return {year,months,completedMonths:completed.length,excludedCount:completed.length-months.length,
    foodDays:logged.reduce((n,m)=>n+m.foodDays,0),fastingDays:logged.reduce((n,m)=>n+m.fastingDays,0),loggedDays:logged.reduce((n,m)=>n+m.loggedDays,0),
    calories:logged.reduce((n,m)=>n+m.totals.cal,0),
    tdee:logged.some(m=>m.tdee===null)?null:logged.reduce((n,m)=>n+m.tdee,0)};
}
if(typeof module!=='undefined'&&module.exports) module.exports={completedYearMonths,buildYearReview};
