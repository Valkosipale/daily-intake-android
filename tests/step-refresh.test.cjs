const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('www/step-refresh.js','utf8');
function setup(native=true){
 const events={},timers=new Map(),calls=[];let next=0,interval;
 const document={visibilityState:'visible',addEventListener:(name,fn)=>events[name]=fn};
 const ctx=vm.createContext({document,console,currentDate:'2026-11-09',
  window:{addEventListener:(name,fn)=>events[name]=fn,Capacitor:native?{getPlatform:()=> 'android',Plugins:{App:{addListener:(name,fn)=>{events[name]=fn;return Promise.resolve({})}}}}:undefined},
  refreshPhoneSteps:(...args)=>{calls.push(args);return Promise.resolve({status:'ok'})},
  setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),setInterval:fn=>{interval=fn}
 });
 vm.runInContext(code,ctx);
 return {events,calls,document,ctx,timers,tick:ms=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn()}},interval:()=>interval()};
}
test('native return refreshes despite no browser visibility event or throttle window',()=>{
 const s=setup();s.events.appStateChange({isActive:false});s.events.appStateChange({isActive:true});s.tick(150);
 assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].force,true);assert.equal(s.calls[0][0],'2026-11-09');s.tick(3000);assert.equal(s.calls.length,2);
});
test('resume and visibility events coalesce and follow-up reads the selected day',()=>{
 const s=setup();s.events.resume();s.events.appStateChange({isActive:true});s.events.visibilitychange();s.events.focus();s.tick(150);assert.equal(s.calls.length,1);s.ctx.currentDate='2026-11-10';s.tick(3000);assert.equal(s.calls[1][0],'2026-11-10');
});
test('background cancels deferred refreshes and pauses periodic queries',()=>{
 const s=setup();s.events.resume();s.events.appStateChange({isActive:false});s.tick(150);s.tick(3000);s.interval();assert.equal(s.calls.length,0);
 s.events.resume();s.tick(150);s.events.appStateChange({isActive:false});s.tick(3000);s.tick(15000);s.interval();assert.equal(s.calls.length,1);
});
test('browser-only foreground fallback and visible minute refresh remain available',()=>{
 const s=setup(false);s.document.visibilityState='hidden';s.events.visibilitychange();s.interval();assert.equal(s.calls.length,0);s.document.visibilityState='visible';s.events.visibilitychange();s.tick(150);assert.equal(s.calls.length,1);s.interval();assert.equal(s.calls.length,2);assert.equal(s.calls[1][1],undefined);
});

test('stale WebView hidden events do not override a native foreground state',()=>{
 const s=setup();s.events.appStateChange({isActive:true});s.document.visibilityState='hidden';s.events.visibilitychange();s.tick(150);
 assert.equal(s.calls.length,1);assert.equal(s.calls[0][1].restart,true);s.tick(15000);assert.equal(s.calls.length,2);s.interval();assert.equal(s.calls.length,3);
});

test('manual refresh queues bounded follow-up reads without more taps, and background cancels them',()=>{
 const s=setup();s.ctx.window.queueStepRefreshFollowups();
 for(const ms of [2000,4000,6000,10000,15000])s.tick(ms);
 assert.equal(s.calls.length,5);assert.ok(s.calls.every(call=>call[1].force && !call[1].restart));
 s.ctx.window.queueStepRefreshFollowups();s.events.appStateChange({isActive:false});
 for(const ms of [2000,4000,6000,10000,15000])s.tick(ms);
 assert.equal(s.calls.length,5);
});
