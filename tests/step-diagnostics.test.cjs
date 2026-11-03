const {test}=require('node:test');
const assert=require('node:assert/strict');
const {explainStepDiagnostics,formatStepDiagnostics}=require('../www/step-diagnostics.js');
const report=()=>({schemaVersion:1,selectedDate:'2026-11-04',timeZone:'Europe/Helsinki',startDate:'2026-11-03T22:00:00Z',endDate:'2026-11-04T22:00:00Z',androidApi:34,rawComplete:true,recordsRead:2,sources:[],combined:{directSteps:148,bucketSteps:148},samsung:{directSteps:null,bucketSteps:null}});
test('distinguishes missing Samsung records from a confirmed complete scan',()=>{
 const r=report();assert.match(explainStepDiagnostics(r),/no readable Samsung Health/);
 r.rawComplete=false;assert.match(explainStepDiagnostics(r),/incomplete/);
});
test('Samsung raw records without aggregate total flag reader investigation',()=>{
 const r=report();r.sources=[{packageName:'com.sec.android.app.shealth'}];
 assert.match(explainStepDiagnostics(r),/records are present/);
});
test('direct versus bucket discrepancy flags the current reader rather than blaming sharing',()=>{
 const r=report();r.samsung={directSteps:204,bucketSteps:148};
 assert.match(explainStepDiagnostics(r),/methods disagree/);
 r.samsung.bucketSteps=null;assert.match(explainStepDiagnostics(r),/methods disagree/);
});
test('a measured zero is a valid total; read errors never imply no Samsung data',()=>{
 const r=report();r.samsung={directSteps:0,bucketSteps:0};
 assert.match(explainStepDiagnostics(r),/0 Samsung Health steps/);
 r.samsung.directError='Permission denied';assert.match(explainStepDiagnostics(r),/error/);
});
test('report includes source packages and device metadata without treating raw sums as daily totals',()=>{
 const r=report();r.sources=[{packageName:'com.sec.android.app.shealth',recordCount:2,rawRecordStepSum:409,watchRecords:1,phoneRecords:1,otherDeviceRecords:0,totals:{directSteps:204,bucketSteps:204}}];
 const text=formatStepDiagnostics(r);
 assert.match(text,/com.sec.android.app.shealth/);assert.match(text,/watch=1, phone=1/);
 assert.match(text,/direct=204, daily-bucket=204/);assert.match(text,/NOT daily totals/);
 assert.match(text,/Nothing is uploaded automatically/);
});
