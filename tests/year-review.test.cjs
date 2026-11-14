const {test}=require('node:test');const assert=require('node:assert/strict');
const {completedYearMonths,buildYearReview}=require('../www/year-review.js');
test('only completed calendar months appear, including leap-year February',()=>{
 assert.equal(completedYearMonths(2026,'2026-11-14').length,10);
 assert.equal(completedYearMonths(2026,'2026-12-31').length,11);
 assert.equal(completedYearMonths(2026,'2027-01-01').length,12);
 assert.equal(completedYearMonths(2027,'2027-01-01').length,0);
 assert.equal(completedYearMonths(2027,'2026-11-14').length,0);
 assert.equal(completedYearMonths(2024,'2025-01-01')[1].end,'2024-02-29');
});
test('annual totals exclude current months and other years, while fasting days count',()=>{
 const days={'2025-12-31':{count:1,cal:999},'2026-01-02':{count:1,cal:1600},'2026-01-03':{count:0,fasting:true,cal:0},'2026-02-01':{count:1,cal:9999}};
 const queried=[];
 const review=buildYearReview(2026,'2026-02-14',d=>days[d]||{count:0},d=>{queried.push(d);return 2200},()=>({steps:5000}));
 assert.equal(review.months.length,1);assert.equal(review.loggedDays,2);assert.equal(review.calories,1600);assert.equal(review.tdee,4400);assert.equal(review.months[0].steps,10000);assert.deepEqual(queried,['2026-01-02','2026-01-03']);
});
test('missing dates are unlogged, and missing TDEE is not counted as zero burn',()=>{
 const read=d=>d==='2026-01-01'?{count:1,cal:1000}:{count:0};
 const review=buildYearReview(2026,'2026-03-01',read,()=>null,()=>null);
 assert.equal(review.loggedDays,1);assert.equal(review.months[0].tdee,null);assert.equal(review.tdee,null);assert.equal(review.months[1].loggedDays,0);
});
test('new year starts empty and the previous year remains available in isolation',()=>{
 const read=d=>d==='2026-12-31'?{count:1,cal:2000}:{count:0};
 assert.equal(buildYearReview(2027,'2027-01-01',read,()=>2200,()=>null).calories,0);
 assert.equal(buildYearReview(2026,'2027-01-01',read,()=>2200,()=>null).calories,2000);
});
