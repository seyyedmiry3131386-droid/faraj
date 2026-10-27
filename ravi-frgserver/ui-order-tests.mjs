// Real Chromium checks for navigation, responsive controls, and draft recovery.
// AI responses below are deliberate mocks, not a model-quality evaluation.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {GUIDE_STEPS} from './public/guidance.js';
import {localAnalysis} from './public/scenarios.js';
import {prepareAnalysis} from './public/extraction.js';
import {questionsFor} from './public/domain.js';
const base=process.env.RAVI_UI_BASE||'http://127.0.0.1:4173/';
const chrome=process.env.RAVI_UI_CHROME||process.env.PLAYWRIGHT_CHROMIUM;
const browser=await chromium.launch(chrome?{executablePath:chrome}:{});
const failures=[],errors=[];
async function test(name,fn){try{await fn();console.log('ok - '+name)}catch(e){failures.push(name);console.error('not ok - '+name+'\n'+e.stack)}}
async function context(width=320){const c=await browser.newContext({viewport:{width,height:750}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return {c,p}}
async function start(p){await p.goto(base);await p.click('[data-action="new"]');await p.waitForSelector('#description')}
async function bar(p,next,skip,filled){
 const parent=p.locator('.three-step-actions');assert.equal(await parent.count(),1);
 const buttons=parent.locator('button');assert.equal(await buttons.count(),3);
 const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,height:r.height}}));
 const width=p.viewportSize().width;
 assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1&&b.right<=width+1&&b.x>=-1),JSON.stringify(boxes));
 assert.equal(await p.locator(`[data-action="${next}"]`).isEnabled(),filled);
 assert.equal(await p.locator(`[data-action="${skip}"]`).isEnabled(),!filled);
}
async function nextGuide(p,action){const before=(await p.textContent('#guide-title')).trim();await p.click(`[data-action="${action}"]`);await p.waitForFunction(t=>!document.querySelector('#guide-title')||document.querySelector('#guide-title').textContent.trim()!==t,before,{timeout:12000})}
async function writeDraft(p,draft){
 await p.goto(base);
 await p.evaluate(d=>new Promise((resolve,reject)=>{const r=indexedDB.open('ravi-v1',1);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{r.result.createObjectStore('reports',{keyPath:'id'});r.result.createObjectStore('drafts')};r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite');t.objectStore('drafts').put({...d,revision:1},'current');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}}),draft);
 await p.reload();await p.click('[data-action="draft"]');
}
try{
 await test('live domain and the offline seven-stage bar work on a narrow phone',async()=>{
  const {c,p}=await context(320);
  try{
   await start(p);assert.equal(await p.locator('#news-domain').isHidden(),true);
   await p.fill('#description','دیروز کیفم را سرقت کردند');
   assert.match(await p.locator('#news-domain').innerText(),/حوزه خبری پیشنهادی:.*انتظامی/);
   assert.ok(await p.evaluate(()=>Boolean(document.querySelector('#news-domain').compareDocumentPosition(document.querySelector('#description'))&Node.DOCUMENT_POSITION_FOLLOWING)));
   await p.fill('#description','نمیدونم چی بگم');await p.click('#analyze-btn');await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),GUIDE_STEPS[0].title);await bar(p,'guide-next','guide-skip',false);
   await p.fill('#guide-input','من خودم دیدم');await bar(p,'guide-next','guide-skip',true);
   await p.fill('#guide-input','');await bar(p,'guide-next','guide-skip',false);
   await p.locator('[data-guide-option]',{hasText:'خودم دیدم'}).click();
   await p.waitForFunction(t=>document.querySelector('#guide-title')?.textContent.trim()===t,GUIDE_STEPS[1].title);
   await bar(p,'guide-next','guide-skip',false);await nextGuide(p,'guide-skip');
   await p.fill('#guide-input','نزدیک ظهر');await bar(p,'guide-next','guide-skip',true);
   await p.click('[data-action="guide-back"]');assert.equal((await p.textContent('#guide-title')).trim(),GUIDE_STEPS[1].title);
   await nextGuide(p,'guide-skip');assert.equal(await p.inputValue('#guide-input'),'نزدیک ظهر');await bar(p,'guide-next','guide-skip',true);
   await nextGuide(p,'guide-next');await nextGuide(p,'guide-skip');
   const quote='سارق با خودرو وسیلهٔ آبی را برد';await p.fill('#guide-input',quote);await nextGuide(p,'guide-next');
   await nextGuide(p,'guide-skip');await nextGuide(p,'guide-skip');
   const follow=[];
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++){
    const title=(await p.textContent('#guide-title')).trim();follow.push(title);await bar(p,'guide-next','guide-skip',false);await nextGuide(p,'guide-skip');
   }
   await p.waitForSelector('#description');assert.ok((await p.inputValue('#description')).includes(quote),'user quote changed');
   assert.ok(!follow.some(t=>/چند نفر در این اتفاق|ظاهر یا نشانه‌های آن‌ها/.test(t)),follow.join('|'));
   assert.ok(!follow.some(t=>/از آن وسیله چه چیزی/.test(t)),'vehicle details asked after skipping its parent');
  }finally{await c.close()}
 });
 await test('detailed fields update all three buttons and preserve text on back and reload',async()=>{
  const {c,p}=await context(320);
  try{
   const text='یک خودرو در تصادف در خیابان بود';const analysis=prepareAnalysis(localAnalysis(text),text);
   const index=questionsFor(analysis).findIndex(q=>q.id==='vehicle');assert.ok(index>=0);
   const state={text,analysis,answers:{vehicle:'بله، اطلاعات دارم'},extra:{vehicle:{enabled:true,rows:[{_id:'test-vehicle',plateStatus:'پلاک را ندیدم'}]}},step:1,qIndex:index,flow:{section:'vehicle',phase:'fields',row:0,page:'observation',showKnown:true},analysisReview:{version:1,text,eventKey:[...analysis.events].sort().join('|'),page:0,items:[],complete:true},prefillAudit:[],prefillText:text,files:[]};
   await writeDraft(p,state);await p.waitForSelector('[data-detail-field="observation"]');
   assert.equal(await p.locator('label[for="detail-vehicle-0-observation"]').innerText(),'مشخصه وسیله');
   await bar(p,'question-next','flow-skip',false);
   const field=p.locator('[data-detail-field="observation"]');await field.fill('وسیلهٔ آبی');await bar(p,'question-next','flow-skip',true);
   await field.fill('');await bar(p,'question-next','flow-skip',false);
   await p.locator('[data-detail-field="count"]').fill('۲');await bar(p,'question-next','flow-skip',true);
   await p.locator('[data-detail-field="count"]').fill('');await field.fill('وسیلهٔ آبی');
   await p.click('[data-action="question-back"]');await bar(p,'question-next','flow-skip',true);
   await p.click('[data-action="question-next"]');await p.waitForSelector('[data-detail-field="observation"]');
   assert.equal(await p.locator('[data-detail-field="observation"]').inputValue(),'وسیلهٔ آبی');await bar(p,'question-next','flow-skip',true);
   await p.waitForTimeout(950);await p.reload();await p.click('[data-action="draft"]');await p.waitForSelector('[data-detail-field="observation"]');
   assert.equal(await p.locator('[data-detail-field="observation"]').inputValue(),'وسیلهٔ آبی');await bar(p,'question-next','flow-skip',true);
  }finally{await c.close()}
 });
 await test('a question keyword advances automatically without a second tap',async()=>{
  const {c,p}=await context(320);
  try{
   const text='یک کیف سرقت شد',analysis=prepareAnalysis(localAnalysis(text),text),index=questionsFor(analysis).findIndex(q=>q.id==='time');
   const state={text,analysis,answers:{},extra:{},step:1,qIndex:index,flow:{section:'time',phase:'main'},analysisReview:{version:1,text,eventKey:[...analysis.events].sort().join('|'),page:0,items:[],complete:true},prefillAudit:[],prefillText:text,files:[]};
   await writeDraft(p,state);await p.waitForSelector('#answer');await bar(p,'question-next','flow-unknown',false);
   const before=await p.locator('.question-title').innerText();await p.locator('[data-answer]',{hasText:'دیروز'}).click();
   await p.waitForFunction(t=>document.querySelector('.question-title')?.textContent.trim()!==t,before,{timeout:10000});
   assert.match(await p.locator('.question-title').innerText(),/زمان دقیق‌تر/);assert.equal(await p.locator('#answer').count(),0);
  }finally{await c.close()}
 });
 await test('skipping the first vehicle detail does not ask for its plate or other details',async()=>{
  const {c,p}=await context(320);
  try{
   const text='تصادف شد',analysis=prepareAnalysis(localAnalysis(text),text),index=questionsFor(analysis).findIndex(q=>q.id==='vehicle');
   const state={text,analysis,answers:{vehicle:'بله، اطلاعات دارم'},extra:{vehicle:{enabled:true,rows:[{_id:'v'}]}},step:1,qIndex:index,flow:{section:'vehicle',phase:'fields',row:0,page:'description',showKnown:true},analysisReview:{version:1,text,eventKey:[...analysis.events].sort().join('|'),page:0,items:[],complete:true},prefillAudit:[],prefillText:text,files:[]};
   await writeDraft(p,state);await p.waitForSelector('[data-detail-field="kind"]');await bar(p,'question-next','flow-skip',false);
   await p.click('[data-action="flow-skip"]');await p.waitForFunction(()=>!document.querySelector('[data-detail-field="kind"]'),null,{timeout:10000});
   assert.equal(await p.locator('[data-plate-part]').count(),0);assert.match(await p.locator('.question-title').innerText(),/کجا/);
  }finally{await c.close()}
 });
 await test('old victim/evidence draft stays intact and is not treated as the new actor',async()=>{
  const {c,p}=await context(390);
  try{
   const old={text:'نمیدونم چی بگم',step:0,files:[],guide:{index:2,base:'',answers:{source:'من خودم این را دیدم',who:'این اتفاق برای مادرم افتاد',evidence:'فیلم دارم'},skipped:[]}};
   await writeDraft(p,old);await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),GUIDE_STEPS[1].title);
   assert.equal(await p.inputValue('#guide-input'),'');
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++){
    const title=(await p.textContent('#guide-title')).trim();
    if(title===GUIDE_STEPS[4].title){await p.fill('#guide-input','کیفم را بردند');await nextGuide(p,'guide-next')}
    else await nextGuide(p,'guide-skip');
   }
   await p.waitForSelector('#description');const text=await p.inputValue('#description');
   assert.ok(text.includes('این اتفاق برای مادرم افتاد'));assert.ok(text.includes('فیلم دارم'));assert.ok(text.includes('کیفم را بردند'));
  }finally{await c.close()}
 });
 await test('AI back preserves a later unsent answer and live buttons with an uncooperative server',async()=>{
  const {c,p}=await context(320);
  try{
   await p.route('**/api/config',r=>r.fulfill({json:{ai:true,interview:true,provider:'local',model:'mock'}}));
   await p.route('**/api/interview',r=>r.fulfill({json:{done:true,stage:'evidence',question:'سؤال ساختگی',options:['جعلی'],facts:[],narrative:'متن ساختگی'}}));
   await start(p);await p.fill('#description','نمیدونم چی بگم');await p.click('#analyze-btn');await p.waitForSelector('#ai-question');
   assert.equal((await p.textContent('#ai-question')).trim(),GUIDE_STEPS[0].title);await bar(p,'ai-send','ai-unknown',false);
   await p.fill('#ai-answer','از یک آشنا شنیدم');await bar(p,'ai-send','ai-unknown',true);await p.click('[data-action="ai-send"]');
   await p.waitForFunction(t=>document.querySelector('#ai-question')?.textContent.trim()===t,GUIDE_STEPS[1].title);
   await p.fill('#ai-answer','یک نفر با کلاه');await p.click('[data-action="ai-back"]');
   assert.equal(await p.inputValue('#ai-answer'),'از یک آشنا شنیدم');await bar(p,'ai-send','ai-unknown',true);
   await p.click('[data-action="ai-send"]');await p.waitForFunction(t=>document.querySelector('#ai-question')?.textContent.trim()===t,GUIDE_STEPS[1].title);
   assert.equal(await p.inputValue('#ai-answer'),'یک نفر با کلاه');await bar(p,'ai-send','ai-unknown',true);
  }finally{await c.close()}
 });
 await test('no browser exceptions',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close()}
if(failures.length){console.error(`${failures.length} UI check(s) failed`);process.exit(1)}
console.log('All ordered-flow browser checks passed.');
