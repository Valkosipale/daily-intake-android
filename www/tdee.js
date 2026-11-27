/* Local-only energy model. Constants are deliberately not user settings. */
(function(root){
  const C=Object.freeze({baseline:1.20,stepCoefficient:0.0004,baselineSteps:2000,kcalPerKg:7700,windowDays:42,minDays:28,minWeights:6,maxOffset:500,alpha:0.10});
  const METS=Object.freeze({light:3.5,moderate:4.5,hard:6.0});
  const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
  const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(dayNumber(date))&&new Date(dayNumber(date)*86400000).toISOString().slice(0,10)===date;
  const shift=(date,n)=>new Date((dayNumber(date)+n)*86400000).toISOString().slice(0,10);
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const mean=a=>a.reduce((sum,n)=>sum+n,0)/a.length;
  function median(a){const b=a.slice().sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;}
  function bmr(profile,kg){return 10*kg+6.25*profile.heightCm-5*profile.age+(profile.sex==='male'?5:-161);}
  function gymCalories(kg,workout={}){return Math.max(0,(METS[workout.intensity]||METS.moderate)-1)*3.5*kg/200*Math.max(0,Number(workout.minutes)||0);}
  function estimate(profile,kg,steps=0,workout={}){
    const resting=bmr(profile,kg),baseline=resting*C.baseline,perStep=kg*C.stepCoefficient;
    const recordedSteps=Math.max(0,Number(steps)||0),additionalSteps=Math.max(0,recordedSteps-C.baselineSteps);
    const stepCalories=additionalSteps*perStep,gym=gymCalories(kg,workout);
    return {bmr:resting,baseline,perStep,steps:recordedSteps,additionalSteps,stepCalories,gymCalories:gym,estimatedTDEE:baseline+stepCalories+gym};
  }
  // Theil–Sen robust linear regression using actual calendar dates. Pairs at
  // least seven days apart avoid making adjacent water-weight changes dominant.
  function weightTrend(weights){
    if(weights.length<2) return null;
    const first=dayNumber(weights[0].date),points=weights.map(w=>({x:dayNumber(w.date)-first,y:w.kg}));
    const slopes=[];
    for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) if(points[j].x-points[i].x>=7) slopes.push((points[j].y-points[i].y)/(points[j].x-points[i].x));
    if(!slopes.length) return null;
    const slope=median(slopes),intercept=median(points.map(p=>p.y-slope*p.x));
    const residuals=points.map(p=>p.y-intercept-slope*p.x);
    const noise=1.4826*median(residuals.map(n=>Math.abs(n-median(residuals))));
    // RMS (capped per reading) also detects a lone large fluctuation when MAD=0.
    const rms=Math.sqrt(mean(residuals.map(n=>Math.min(n*n,9))));
    const centre=mean(points.map(p=>p.x)),spread=points.reduce((sum,p)=>sum+(p.x-centre)**2,0);
    const uncertainty=2*Math.max(noise,rms*.5)/Math.sqrt(spread||1);
    const maxGap=Math.max(...points.slice(1).map((p,i)=>p.x-points[i].x));
    return {dailyKg:slope,weeklyKg:slope*7,noise:Math.max(noise,rms*.5),uncertainty,maxGap,span:points.at(-1).x,count:points.length};
  }
  function unavailable(reason,extra={}){return {eligible:false,confidence:'Low',quality:0,days:0,averageIntake:null,weeklyTrend:null,reason,...extra};}
  function observe({today,days,weights,previousTargets=[],previousEstimates=[]}){
    const start=shift(today,-C.windowDays);
    const unique=new Map();
    for(const w of weights) if(w&&validDate(w.date)&&w.date>=start&&w.date<today&&typeof w.kg==='number'&&Number.isFinite(w.kg)&&w.kg>=30&&w.kg<=300) unique.set(w.date,w);
    const readings=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
    if(readings.length<C.minWeights) return unavailable('Need at least 6 weigh-ins in the last 42 completed days.');
    // Find the longest fully covered period bounded by actual weigh-ins. Missing
    // intake/activity is never imputed, omitted from its denominator, or zeroed.
    let best=null;
    for(let i=0;i<readings.length;i++) for(let j=i+C.minWeights-1;j<readings.length;j++){
      const span=dayNumber(readings[j].date)-dayNumber(readings[i].date);
      if(span<C.minDays) continue;
      const period=[];
      for(let d=readings[i].date;d<readings[j].date;d=shift(d,1)) period.push(days[d]);
      if(period.some(d=>!d||!d.caloriesComplete||!Number.isFinite(d.calories)||d.calories<0||!d.activityComplete||!Number.isFinite(d.estimatedTDEE))) continue;
      if(!best||span>best.period.length||(span===best.period.length&&readings[j].date>best.end)) best={period,weights:readings.slice(i,j+1),start:readings[i].date,end:readings[j].date};
    }
    if(!best) return unavailable('Need 28 continuous completed days of usable food and activity logs, bounded by 6 weigh-ins spanning 28 days. Missing or possibly partial logs are excluded.');
    const trend=weightTrend(best.weights),averageIntake=mean(best.period.map(d=>d.calories));
    const details={days:best.period.length,start:best.start,endExclusive:best.end,averageIntake,weeklyTrend:trend.weeklyKg,weightCount:trend.count,trend};
    if(Math.abs(trend.dailyKg)>.15||trend.uncertainty>.06||trend.noise>1.5) return unavailable('Weight changes are too uncertain for reliable calibration; water and meal weight may dominate.',details);
    const observedTDEE=averageIntake-trend.dailyKg*C.kcalPerKg;
    if(observedTDEE<800||observedTDEE>6000) return unavailable('Intake and weight imply an implausible expenditure. Check logging and allow more stable history.',details);
    const averageEstimatedTDEE=mean(best.period.map(d=>d.estimatedTDEE));
    const intakeQuality=mean(best.period.map(d=>d.calorieQuality??.85)),activityQuality=mean(best.period.map(d=>d.activityQuality??.85));
    const distribution=clamp(10/trend.maxGap,0,1);
    let quality=.20*clamp(best.period.length/41,0,1)+.20*clamp(trend.count/12,0,1)+.15*distribution+.15*intakeQuality+.15*activityQuality+.15*clamp(1-trend.noise/1.5,0,1);
    const recent=(previousEstimates.length?previousEstimates:previousTargets).slice(-7);
    const variability=recent.length>2?Math.sqrt(mean(recent.map(n=>(n-mean(recent))**2))):0;
    const staleDays=Math.max(0,dayNumber(today)-dayNumber(best.end)-1);
    quality*=(.5+.5*distribution)*clamp(1-variability/1000,.5,1)*clamp(1-trend.uncertainty/.12,.4,1)*clamp(1-staleDays/14,.2,1);
    const confidence=quality>=.85&&trend.count>=10&&best.period.length>=35&&trend.maxGap<=10?'High':quality>=.55?'Moderate':'Low';
    return {eligible:confidence!=='Low',confidence,quality,...details,observedTDEE,averageEstimatedTDEE,calibrationTarget:observedTDEE-averageEstimatedTDEE,reason:'Automatically calibrated from completed-day intake and a robust long-term weight trend.'};
  }
  function calibrate(previous,observation,completedDate){
    const old={offset:0,lastCalibrationDate:null,limitStreak:0,targets:[],estimates:[],...previous};
    if(!observation.eligible||old.lastCalibrationDate>=completedDate) return old;
    const limitStreak=Math.abs(observation.calibrationTarget)>C.maxOffset?old.limitStreak+1:0;
    const warning=limitStreak>=3;
    const alpha=C.alpha*observation.quality*(warning?.5:1);
    // Bound the target as well as the final offset; one extreme target cannot
    // jump straight to the 500-kcal guardrail on its first update.
    const target=clamp(observation.calibrationTarget,-C.maxOffset,C.maxOffset);
    return {offset:clamp(old.offset*(1-alpha)+target*alpha,-C.maxOffset,C.maxOffset),lastCalibrationDate:completedDate,limitStreak,warning,targets:[...old.targets,observation.calibrationTarget].slice(-14),estimates:[...old.estimates,observation.observedTDEE].filter(Number.isFinite).slice(-14)};
  }
  const api={C,METS,dayNumber,validDate,shift,bmr,gymCalories,estimate,weightTrend,observe,calibrate};
  root.TdeeModel=api;if(typeof module==='object') module.exports=api;
})(typeof window==='object'?window:globalThis);
