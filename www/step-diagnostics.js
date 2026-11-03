/* Read-only, on-device step diagnostics. Reports leave the device only when copied/shared by the user. */
function diagnosticNumber(value){
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function explainStepDiagnostics(report){
  if(!report || !report.samsung || !report.combined) return 'The diagnostic returned an incomplete response. Please share the report.';
  const samsung = report.samsung;
  const samsungRecords = Array.isArray(report.sources) && report.sources.some(s=>s.packageName === 'com.sec.android.app.shealth');
  if(samsung.directError || samsung.bucketError) return 'Samsung Health queries returned an error. The report contains the error; this does not establish that Samsung has no data.';
  if(diagnosticNumber(samsung.directSteps) && (!diagnosticNumber(samsung.bucketSteps) || samsung.directSteps !== samsung.bucketSteps)){
    return 'The two Samsung Health reading methods disagree. The app’s current daily-bucket reader may be missing steps. Please share this report.';
  }
  if(diagnosticNumber(samsung.directSteps)){
    return `Health Connect returned ${samsung.directSteps.toLocaleString()} Samsung Health steps using both reading methods. Compare this with Samsung Health for the date shown below, then share the report.`;
  }
  if(samsungRecords) return 'Samsung Health records are present, but the total query returned no step count. Our reader needs further investigation. Please share the report.';
  if(report.rawComplete === true) return 'Health Connect returned no readable Samsung Health step records for this date. This identifies what the app can access; it does not prove that Samsung cannot share watch steps.';
  return 'The record scan was incomplete, so we cannot tell whether Samsung Health records are available. Please share the report.';
}

function formatStepDiagnostics(report){
  const number = v=>diagnosticNumber(v) ? String(v) : 'no total';
  const lines = [
    'Daily Intake Step Check v1',
    `Date: ${report.selectedDate || 'unknown'}`,
    `Checked: ${report.checkedAt || 'unknown'}`,
    `Time zone: ${report.timeZone || 'unknown'}`,
    `Range: ${report.startDate || '?'} to ${report.endDate || '?'}`,
    `Android API: ${report.androidApi ?? 'unknown'}`,
    '', explainStepDiagnostics(report), ''
  ];
  for(const [key, label] of [['samsung','Samsung Health'],['combined','Health Connect combined']]){
    const total = report[key] || {};
    lines.push(`${label}: direct=${number(total.directSteps)}, daily-bucket=${number(total.bucketSteps)}`);
    if(total.directError) lines.push(`  Direct query error: ${total.directError}`);
    if(total.bucketError) lines.push(`  Bucket query error: ${total.bucketError}`);
    if(Array.isArray(total.contributingPackages)) lines.push(`  Contributing apps: ${total.contributingPackages.join(', ') || 'none reported'}`);
  }
  lines.push('', `Record scan complete: ${report.rawComplete === true ? 'yes' : 'no'}`, `Records read: ${report.recordsRead ?? 'unknown'}`);
  if(report.rawError) lines.push(`Record scan error: ${report.rawError}`);
  if(report.sourcesTruncated) lines.push('Source list truncated after 32 apps.');
  for(const source of Array.isArray(report.sources) ? report.sources : []){
    const total = source.totals || {};
    lines.push('', `Source app: ${source.packageName}`, `  Records: ${source.recordCount}; direct=${number(total.directSteps)}, daily-bucket=${number(total.bucketSteps)}`,
      `  Device metadata: watch=${source.watchRecords}, phone=${source.phoneRecords}, other/unknown=${source.otherDeviceRecords}`,
      `  Latest record end: ${source.latestRecordEnd || 'unknown'}`,
      `  Raw record sum: ${source.rawRecordStepSum} (diagnostic only; overlapping/cross-midnight records may double count)`);
    if(total.directError) lines.push(`  Direct query error: ${total.directError}`);
    if(total.bucketError) lines.push(`  Bucket query error: ${total.bucketError}`);
  }
  lines.push('', 'Raw record sums are NOT daily totals. Device metadata does not prove which device counted every step.',
    'No food logs, body stats, account identifiers, or individual step records are included. Nothing is uploaded automatically.');
  return lines.join('\n');
}

async function runStepDiagnostics(){
  const button = document.getElementById('runStepCheckBtn');
  const summary = document.getElementById('stepCheckSummary');
  const output = document.getElementById('stepCheckReport');
  const copy = document.getElementById('copyStepCheckBtn');
  if(button.disabled) return;
  const date = currentDate;
  button.disabled = true; copy.disabled = true;
  document.getElementById('stepCheckPanel').hidden = false;
  output.value = '';
  summary.textContent = 'Checking step access and reading source totals…';
  try{
    const Health = getHealthPlugin();
    if(!Health) throw new Error('Step checks require the Android app.');
    if(!(await Health.isHealthAvailable())?.available) throw new Error('Health Connect is unavailable on this phone.');
    let permissions = await Health.checkHealthPermissions({permissions:['READ_STEPS']});
    if(!healthPermissionGranted(permissions, 'READ_STEPS')) permissions = await Health.requestHealthPermissions({permissions:['READ_STEPS']});
    if(!healthPermissionGranted(permissions, 'READ_STEPS')) throw new Error('Step read access was not granted. No diagnostic data was read.');
    if(typeof Health.diagnoseSteps !== 'function') throw new Error('This APK does not include the native step diagnostic. Install Daily Intake Step Check.');
    const nativeReport = await Health.diagnoseSteps({startDate:localMidnightIso(date), endDate:localMidnightIso(shiftDate(date,1))});
    const report = {...nativeReport, selectedDate:date, checkedAt:new Date().toISOString()};
    if(report.schemaVersion !== 1) throw new Error('Unexpected diagnostic response. No conclusion can be drawn.');
    summary.textContent = explainStepDiagnostics(report);
    output.value = formatStepDiagnostics(report);
    copy.disabled = false;
  }catch(error){
    summary.textContent = 'The step check could not complete. This does not tell us whether Samsung has shared steps.';
    output.value = `Daily Intake Step Check v1\nDate: ${date}\nError: ${error.message || String(error)}`;
    copy.disabled = false;
  }finally{ button.disabled = false; }
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = {diagnosticNumber, explainStepDiagnostics, formatStepDiagnostics};
} else {
  document.getElementById('runStepCheckBtn').addEventListener('click', runStepDiagnostics);
  document.getElementById('copyStepCheckBtn').addEventListener('click', async ()=>{
    const report = document.getElementById('stepCheckReport');
    try{
      await navigator.clipboard.writeText(report.value);
      showToast('Step report copied — paste it into this chat');
    }catch(error){
      report.focus(); report.select();
      showToast('Select and copy the report text');
    }
  });
  if(window.STEP_CHECK_COMPANION) window.addEventListener('load', ()=>openBodyDialog());
}
