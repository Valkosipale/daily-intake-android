const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
process.env.TZ = 'Europe/Helsinki';
const html = fs.readFileSync('www/index.html', 'utf8');
const code = html.slice(html.indexOf('function getHealthPlugin()'), html.indexOf('// ---- Body stats dialog ----'));
const shiftCode = html.slice(html.indexOf('function shiftDate('), html.indexOf('function getDayTotalsFromStorage('));
function setup(overrides = {}) {
  const entries = {};
  const status = {textContent: ''};
  const button = {disabled: false};
  let queries = 0, requests = 0, previews = 0;
  const plugin = {
    isHealthAvailable: async () => ({available: true}),
    checkHealthPermissions: async () => ({permissions: {READ_STEPS: true}}),
    requestHealthPermissions: async () => { requests++; return {permissions: {READ_STEPS: true}}; },
    queryAggregated: async () => { queries++; return {aggregatedData: [{value: 6200}]}; },
    ...overrides
  };
  const ctx = vm.createContext({
    window: {Capacitor: {Plugins: {HealthPlugin: plugin}}},
    console: {error() {}}, currentDate: '2026-11-04',
    document: {getElementById: id => id === 'readStepsBtn' ? button : status},
    getStepsMap: () => entries,
    setStepsField: (date, field, value) => { entries[date] = {...entries[date], [field]: value}; },
    effectiveSteps: date => entries[date],
    updateTdeeDisplay() {}, updateBodyPreview() { previews++; },
    formatDateShort: date => date,
    showToast() {}, showErrorModal() {}, showConfirmModal: async () => false
  });
  vm.runInContext(shiftCode + code, ctx);
  return {ctx, entries, plugin, status, button, queries: () => queries, requests: () => requests, previews: () => previews};
}
test('reads steps without requesting permission automatically and throttles successful reads', async () => {
  const s = setup();
  const result = await s.ctx.refreshPhoneSteps('2026-11-04');
  assert.equal(result.steps, 6200);
  assert.equal(s.entries['2026-11-04'].phone, 6200);
  assert.equal(s.requests(), 0);
  assert.match(s.status.textContent, /Automatic steps/);
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'throttled');
  assert.equal(s.queries(), 1);
});
test('permission denial never queries health data or prompts in background', async () => {
  const s = setup({checkHealthPermissions: async () => ({permissions: {READ_STEPS: false}})});
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'no-permission');
  assert.equal(s.requests(), 0);
  assert.equal(s.queries(), 0);
});
test('permission response supports native object and documented array formats', () => {
  const s = setup();
  assert.equal(s.ctx.healthPermissionGranted({permissions: [{READ_STEPS: true}]}, 'READ_STEPS'), true);
  assert.equal(s.ctx.healthPermissionGranted(null, 'READ_STEPS'), false);
});
test('concurrent refreshes share one native query', async () => {
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const s = setup({queryAggregated: async () => { calls++; await gate; return {aggregatedData: [{value: 100}]}; }});
  const a = s.ctx.refreshPhoneSteps('2026-11-04');
  const b = s.ctx.refreshPhoneSteps('2026-11-04', {force: true});
  release();
  assert.equal((await a).steps, 100);
  assert.equal((await b).steps, 100);
  assert.equal(calls, 1);
});
test('empty data preserves cached reading; explicit zero replaces it without changing manual steps', async () => {
  const s = setup({queryAggregated: async () => ({aggregatedData: []})});
  s.entries['2026-11-04'] = {phone: 4000, manual: 5000};
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'no-data');
  assert.equal(s.entries['2026-11-04'].phone, 4000);
  s.plugin.queryAggregated = async () => ({aggregatedData: [{value: 0}]});
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'ok');
  assert.equal(s.entries['2026-11-04'].phone, 0);
  assert.equal(s.entries['2026-11-04'].manual, 5000);
});
test('invalid data and native errors preserve saved totals and allow immediate retry', async () => {
  const s = setup({queryAggregated: async () => ({aggregatedData: [{value: -10}]})});
  s.entries['2026-11-04'] = {phone: 1234};
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'error');
  assert.equal(s.entries['2026-11-04'].phone, 1234);
  s.plugin.queryAggregated = async () => { throw Error('permission revoked'); };
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).status, 'error');
  s.plugin.queryAggregated = async () => ({aggregatedData: [{value: 1500}]});
  assert.equal((await s.ctx.refreshPhoneSteps('2026-11-04')).steps, 1500);
});
test('local day boundaries handle daylight saving and date changes during queries', async () => {
  const s = setup();
  const start = s.ctx.localMidnightIso('2026-03-29');
  const end = s.ctx.localMidnightIso(s.ctx.shiftDate('2026-03-29', 1));
  assert.equal((Date.parse(end) - Date.parse(start)) / 3600000, 23);
  await s.ctx.refreshPhoneSteps('2026-11-03');
  assert.equal(s.entries['2026-11-03'].phone, 6200);
  assert.equal(s.previews(), 0);
});
test('explicit connect requests permission and always re-enables button after errors', async () => {
  const s = setup();
  let granted = false;
  s.plugin.checkHealthPermissions = async () => ({permissions: {READ_STEPS: granted}});
  s.plugin.requestHealthPermissions = async () => { granted = true; return {permissions: {READ_STEPS: true}}; };
  await s.ctx.connectPhoneSteps();
  assert.equal(s.entries['2026-11-04'].phone, 6200);
  assert.equal(s.button.disabled, false);
  s.plugin.isHealthAvailable = async () => { throw Error('unavailable'); };
  await s.ctx.connectPhoneSteps();
  assert.equal(s.button.disabled, false);
  assert.match(s.status.textContent, /Could not connect/);
});
