const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const html=fs.readFileSync('www/index.html','utf8');
function setup(){const c=vm.createContext({lastPhotoSet:[{base64:'stored-1',mime:'image/jpeg'},{base64:'stored-2',mime:'image/png'}],lastPhotoBase64:'legacy',lastPhotoMimeType:'image/jpeg'});vm.runInContext(html.slice(html.indexOf('function buildPromptParts('),html.indexOf('// Retries a flaky async call')),c);return c;}
test('multiple photos become separate parts of the same AI message',()=>{
 const c=setup(),photos=[{base64:'front',mime:'image/jpeg'},{base64:'label',mime:'image/png'}];const parts=c.buildPromptParts('Analyze together',photos);assert.equal(parts.length,3);assert.equal(parts[0].text,'Analyze together');assert.equal(parts[1].inline_data.data,'front');assert.equal(parts[2].inline_data.data,'label');assert.equal(parts[2].inline_data.mime_type,'image/png');assert.equal(photos.length,2);
});
test('editor defaults retain all stored photos while explicit null isolates text questions',()=>{
 const c=setup();assert.equal(c.buildPromptParts('Correct this').length,3);assert.equal(c.buildPromptParts('Text only',null).length,1);assert.equal(c.buildPromptParts('No images',[]).length,1);
});
test('legacy single-photo context remains supported',()=>{
 const c=setup();c.lastPhotoSet=null;assert.equal(c.buildPromptParts('Legacy')[1].inline_data.data,'legacy');const explicit=c.buildPromptParts('Explicit',{base64:'single',mime:'image/jpeg'});assert.equal(explicit.length,2);assert.equal(explicit[1].inline_data.data,'single');
});
