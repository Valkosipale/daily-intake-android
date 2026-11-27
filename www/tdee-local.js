/* Storage adapter: additive migration, immutable historical estimates, no network. */
(function(root){
  const M=typeof module==='object'?require('./tdee.js'):root.TdeeModel;
  const KEY='dic:tdee:v2';
  function create(storage){
    const read=(key,fallback)=>{try{const v=JSON.parse(storage.getItem(key));return v??fallback;}catch(_){return fallback;}};
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
    const map=key=>object(read(key,{}));
    const validProfile=p=>p&&(p.sex==='male'||p.sex==='female')&&Number.isFinite(p.age)&&p.age>=15&&p.age<=100&&Number.isFinite(p.heightCm)&&p.heightCm>=100&&p.heightCm<=250&&Number.isFinite(p.weightKg)&&p.weightKg>=30&&p.weightKg<=300;
    function state(){
      const s=object(read(KEY,{}));
      return {version:2,started:s.started||null,excludedMonths:Array.isArray(s.excludedMonths)?s.excludedMonths:[],originals:object(s.originals),records:object(s.records),observations:object(s.observations),stepChecks:object(s.stepChecks),timeline:object(s.timeline),calibration:object(s.calibration)};
    }
    function save(s){storage.setItem(KEY,JSON.stringify(s));}
    function weights(){const w=read('dic:weightLog',[]);return (Array.isArray(w)?w:[]).filter(w=>w&&M.validDate(w.date)&&Number.isFinite(w.kg)&&w.kg>=30&&w.kg<=300).sort((a,b)=>a.date.localeCompare(b.date));}
    function kgAt(date,list,profile){const w=list.filter(w=>w.date<=date).at(-1);return w?w.kg:profile.weightKg;}
    function stepsAt(date,steps){
      const s=steps[date];if(!s)return null;
      const values=[s.manual,s.phone].filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0);
      return values.length?Math.max(...values):null;
    }
    function workoutAt(date,gym,s){
      const w=gym[date]||s.observations[date]?.gym;
      return w&&Number.isFinite(w.minutes)&&w.minutes>=0&&w.minutes<=300&&M.METS[w.intensity]?w:null;
    }
    function offsetAt(s,date){const key=Object.keys(s.timeline).filter(d=>d<=date&&M.validDate(d)).sort().at(-1);return key?Math.max(-500,Math.min(500,Number(s.timeline[key])||0)):0;}
    function intakeAt(date,profile){
      const entries=read('dic:log:'+date,null);
      if(entries!==null&&!Array.isArray(entries)) return {caloriesComplete:false};
      const arr=entries||[];
      if(arr.some(e=>!e||typeof e.calories!=='number'||!Number.isFinite(e.calories)||e.calories<0)) return {caloriesComplete:false};
      const fasting=!arr.length&&storage.getItem('dic:fasting:'+date)==='true';
      const calories=arr.reduce((n,e)=>n+e.calories,0);
      // Legacy logging has no "day complete" flag. This conservative automatic
      // plausibility gate is a proxy, never proof that all meals were logged.
      const caloriesComplete=fasting||(arr.length>0&&calories>=Math.max(800,M.bmr(profile,profile.weightKg)*.65));
      return {calories,caloriesComplete,calorieQuality:fasting?1:arr.length>=3?.95:.80};
    }
    function legacy(profile,kg,steps,workout){
      const bmr=M.bmr(profile,kg),base=Math.round(bmr*1.2),step=Math.round(steps*.5*kg*(.413*profile.heightCm/100)/1000);
      const met={light:2.5,moderate:3.5,hard:5}[workout?.intensity]||3.5;
      const gym=Math.round((met-1)*3.5*kg/200*(workout?.minutes||0));
      return {total:base+step+gym,formula:'legacy-height-walking-v1',source:'Legacy estimate reconstructed at upgrade',bmr,baseline:base,stepCalories:step,gymCalories:gym};
    }
    function sync(today,options={}){
      const s=state(),profile=read('dic:profile',null),steps=map('dic:steps'),gym=map('dic:gym'),list=weights();
      const hidden=read('dic:hiddenYearMonths',[]);
      const excludedMonths=[...new Set((Array.isArray(hidden)?hidden:[]).filter(value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)))].sort();
      if(JSON.stringify(excludedMonths)!==JSON.stringify(s.excludedMonths.slice().sort())){
        // Drop any learned influence from the old selection, including target
        // stability history. Preserve the daily update guard and saved estimates.
        s.calibration={offset:0,lastCalibrationDate:s.calibration.lastCalibrationDate||null,limitStreak:0,warning:false,targets:[],estimates:[]};
      }
      s.excludedMonths=excludedMonths;
      const excluded=new Set(excludedMonths),calibrationWeights=list.filter(w=>!excluded.has(w.date.slice(0,7)));
      if(!validProfile(profile)) return {state:s,profile:null,observation:M.observe({today,days:{},weights:calibrationWeights})};
      if(!s.started){
        // The old app never stored TDEE snapshots. Preserve what it would have
        // displayed at upgrade, clearly identified as reconstructed, not measured.
        const dates=new Set([...Object.keys(steps),...Object.keys(gym)]);
        for(let i=0;i<storage.length;i++){
          const key=storage.key(i);
          if(/^dic:(log|fasting):\d{4}-\d{2}-\d{2}$/.test(key)) dates.add(key.slice(key.lastIndexOf(':')+1));
        }
        for(const date of dates) if(M.validDate(date)&&date<today&&!s.originals[date]) s.originals[date]=legacy(profile,kgAt(date,list,profile),stepsAt(date,steps)||0,gym[date]);
        s.started=today;
      }
      // Observing the active day's defaults records that no gym workout is
      // currently logged, without inventing rest-day history before the upgrade.
      s.observations[today]={profile:{...profile},gym:gym[today]||{minutes:0,intensity:'moderate'}};
      const days={};
      for(let date=M.shift(today,-42);date<today;date=M.shift(date,1)){
        const observed=s.observations[date];
        const p=observed?.profile;
        const step=stepsAt(date,steps),workout=workoutAt(date,gym,s);
        const manual=steps[date]?.manual;
        const finalSteps=(typeof manual==='number'&&Number.isFinite(manual)&&manual>=0)||s.stepChecks[date]===true;
        if(!validProfile(p)||excluded.has(date.slice(0,7))) continue; // Never substitute today's profile for unknown past activity.
        const kg=kgAt(date,calibrationWeights,p),estimated=M.estimate(p,kg,step||0,workout||{});
        days[date]={...intakeAt(date,{...p,weightKg:kg}),estimatedTDEE:estimated.estimatedTDEE,activityComplete:step!==null&&!!workout&&finalSteps,activityQuality:gym[date]?1:.85};
        if(days[date].activityComplete&&!s.originals[date]&&!s.records[date]){
          const offset=offsetAt(s,date);
          s.records[date]={...estimated,total:Math.round(estimated.estimatedTDEE+offset),calibrationOffset:offset,formula:'adaptive-v2',source:'Saved completed-day estimate',activityComplete:days[date].activityComplete};
        }
      }
      const observation=M.observe({today,days,weights:calibrationWeights,previousTargets:s.calibration.targets||[],previousEstimates:s.calibration.estimates||[]});
      if(excludedMonths.length)observation.reason+=' Months removed from the yearly view are excluded from calibration.';
      const next=M.calibrate(s.calibration,options.allowCalibration===false?{...observation,eligible:false}:observation,M.shift(today,-1));
      s.calibration=next;
      const warning=next.warning===true;
      if(warning){observation.confidence='Low';observation.reason='Repeated corrections exceed 500 kcal/day. Check food and activity logging; water changes or systematic errors may dominate.';}
      // Unreliable windows do not apply a stale offset; the persisted learned
      // offset is retained for recovery, not erased by a temporary data gap.
      let activeOffset=observation.eligible&&!warning?Number(next.offset)||0:0;
      s.timeline[today]=activeOffset;
      try{save(s);}catch(_){
        activeOffset=0;s.timeline[today]=0;
        observation.eligible=false;observation.confidence='Low';
        observation.reason='Local storage could not save calibration. Using the uncalibrated estimate; existing food and activity records are unchanged.';
      }
      return {state:s,profile,weights:list,steps,gym,observation,activeOffset};
    }
    function result(context,date,today,override){
      const {state:s,profile}=context;if(!profile)return null;
      const historic=date<today;
      const saved=historic?(s.originals[date]||s.records[date]):null;
      const p=override?.profile||s.observations[date]?.profile||profile;
      const kg=override?.weightKg??kgAt(date,context.weights,p);
      const steps=override?.steps??stepsAt(date,context.steps)??0;
      const gym=override?.gym||workoutAt(date,context.gym,s)||{minutes:0,intensity:'moderate'};
      const components=M.estimate(p,kg,steps,gym);
      const offset=historic?offsetAt(s,date):context.activeOffset;
      const recalculated=Math.round(components.estimatedTDEE+offset);
      const stepsRecorded=override?.stepsKnown??(stepsAt(date,context.steps)!==null);
      return {...components,stepsRecorded,calibrationOffset:offset,total:!override&&saved?saved.total:recalculated,recalculated,saved,projected:date>=today,source:saved?saved.source:historic?'Recalculated estimate (no saved snapshot)':'Projected full-day expenditure'};
    }
    function noteStepRead(date,today){if(date>=today)return;const s=state();s.stepChecks[date]=true;save(s);}
    function noteActivity(date,profile,gym){if(!validProfile(profile)||!M.validDate(date))return;const s=state();s.observations[date]={profile:{...profile},gym:{...gym}};save(s);}
    function restore(incoming){
      if(!incoming||incoming.version!==2)return;
      const s=state();
      for(const field of ['originals','records']) for(const [date,value] of Object.entries(object(incoming[field]))) if(M.validDate(date)&&value&&Number.isFinite(value.total)&&value.total>0&&!s[field][date]) s[field][date]=value;
      for(const [date,value] of Object.entries(object(incoming.observations))) if(M.validDate(date)&&validProfile(value?.profile)&&!s.observations[date]) s.observations[date]=value;
      for(const [date,value] of Object.entries(object(incoming.stepChecks))) if(M.validDate(date)&&value===true)s.stepChecks[date]=true;
      for(const [date,value] of Object.entries(object(incoming.timeline))) if(M.validDate(date)&&Number.isFinite(value)&&Math.abs(value)<=500&&s.timeline[date]===undefined)s.timeline[date]=value;
      if(!s.started&&M.validDate(incoming.started))s.started=incoming.started;
      const c=incoming.calibration;
      if(c&&Number.isFinite(c.offset)&&Math.abs(c.offset)<=500&&M.validDate(c.lastCalibrationDate)&&(!s.calibration.lastCalibrationDate||c.lastCalibrationDate>s.calibration.lastCalibrationDate)){s.excludedMonths=Array.isArray(incoming.excludedMonths)?incoming.excludedMonths:[];s.calibration={offset:c.offset,lastCalibrationDate:c.lastCalibrationDate,limitStreak:Math.max(0,Number(c.limitStreak)||0),warning:c.warning===true,targets:Array.isArray(c.targets)?c.targets.filter(Number.isFinite).slice(-14):[],estimates:Array.isArray(c.estimates)?c.estimates.filter(Number.isFinite).slice(-14):[]};}
      save(s);
    }
    return {sync,result,noteStepRead,noteActivity,exportData:state,restore};
  }
  root.TdeeLocal={create};if(typeof module==='object')module.exports={create};
})(typeof window==='object'?window:globalThis);
