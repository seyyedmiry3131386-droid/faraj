// Responsive browser checks. The AI endpoint in these tests is deliberately
// mocked; they do not measure a real model or the Bale mobile application.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {GUIDE_STEPS,guideQuestionAliases} from './public/guidance.js';

const base=process.env.RAVI_UI_BASE||'http://127.0.0.1:4173/';
const chrome=process.env.RAVI_UI_CHROME||process.env.PLAYWRIGHT_CHROMIUM;
const browser=await chromium.launch(chrome?{executablePath:chrome}:{});
const failures=[],errors=[];
const expected=['فرد یا افراد مورد اشاره را می‌شناسم','فرد یا افراد مورد اشاره را نمی‌شناسم'];
async function test(name,fn){try{await fn();console.log('ok - '+name)}catch(e){failures.push(name);console.error('not ok - '+name+'\n'+e.stack)}}
async function context(){const c=await browser.newContext({viewport:{width:320,height:750}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return {c,p}}
async function start(p){await p.goto(base);await p.click('[data-action="new"]');await p.waitForSelector('#description')}
async function waitGuide(p,id){await p.waitForFunction(titles=>titles.includes(document.querySelector('#guide-title')?.textContent.trim()),guideQuestionAliases(id),{timeout:15000})}
async function waitAi(p,id){await p.waitForFunction(titles=>titles.includes(document.querySelector('#ai-question')?.textContent.trim()),guideQuestionAliases(id),{timeout:15000})}
async function chips(p,selector){return (await p.locator(selector).allInnerTexts()).map(x=>x.trim())}
async function bar(p,next,skip,filled){
 const parent=p.locator('.three-step-actions');assert.equal(await parent.count(),1);
 const buttons=parent.locator('button');assert.equal(await buttons.count(),3);
 const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right}}));
 assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1&&b.x>=-1&&b.right<=321),JSON.stringify(boxes));
 assert.equal(await p.locator(`[data-action="${next}"]`).isEnabled(),filled);
 assert.equal(await p.locator(`[data-action="${skip}"]`).isEnabled(),!filled);
}
async function review(p){
 await p.waitForFunction(()=>document.querySelector('[data-action="analysis-review-next"]')||document.querySelector('#guide-title')||document.querySelector('#ai-question'),null,{timeout:15000});
 for(let i=0;i<30;i++){
  const next=p.locator('[data-action="analysis-review-next"]');if(!await next.count())return;
  const caption=await p.locator('.flow-step-caption small').first().textContent();
  await next.click();await p.waitForFunction(old=>!document.querySelector('[data-action="analysis-review-next"]')||document.querySelector('.flow-step-caption small')?.textContent!==old,caption,{timeout:15000});
 }
 throw Error('too many review pages');
}
async function writeDraft(p,draft){
 await p.goto(base);
 await p.evaluate(d=>new Promise((resolve,reject)=>{const r=indexedDB.open('ravi-v1',1);r.onerror=()=>reject(r.error);r.onupgradeneeded=()=>{r.result.createObjectStore('reports',{keyPath:'id'});r.result.createObjectStore('drafts')};r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite');t.objectStore('drafts').put({...d,revision:1},'current');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error)}}),draft);
 await p.reload();await p.click('[data-action="draft"]');
}
async function mockAi(p){
 await p.route('**/api/config',r=>r.fulfill({json:{ai:true,interview:true,provider:'local',model:'mock',transcription:false}}));
 await p.route('**/api/interview',r=>r.fulfill({json:{done:true,stage:'evidence',question:'ساختگی',options:['یک نفر','چند نفر'],facts:[],narrative:'ساختگی'}}));
}
try{
 await test('the exact report has relevant offline chips, auto-advance, back and reload on a phone',async()=>{
  const {c,p}=await context();try{
   await start(p);await p.fill('#description','یک نفر خودکشی کرد');await p.click('#analyze-btn');
   await p.click('[data-action="detail-yes"]');await review(p);await waitGuide(p,'source');
   await bar(p,'guide-next','guide-skip',false);
   await p.locator('[data-guide-option]',{hasText:'خودم دیدم'}).click();await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);await bar(p,'guide-next','guide-skip',false);
   await p.locator('[data-guide-option]',{hasText:expected[0]}).click();await waitGuide(p,'peopleDescription');
   await p.click('[data-action="guide-skip"]');await waitGuide(p,'when');
   await p.fill('#guide-input','نزدیک ظهر');await bar(p,'guide-next','guide-skip',true);
   await p.click('[data-action="guide-back"]');await waitGuide(p,'peopleDescription');
   await p.click('[data-action="guide-back"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);
   assert.equal(await p.locator('[data-guide-option][aria-pressed="true"]').innerText(),expected[0]);
   await bar(p,'guide-next','guide-skip',true);
   await p.waitForTimeout(1100);await p.reload();await p.click('[data-action="draft"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);
   assert.equal(await p.locator('[data-guide-option][aria-pressed="true"]').innerText(),expected[0]);
   await p.click('[data-action="guide-next"]');await waitGuide(p,'peopleDescription');
   await p.click('[data-action="guide-skip"]');await waitGuide(p,'when');assert.equal(await p.inputValue('#guide-input'),'نزدیک ظهر');
  }finally{await c.close()}
 });
 await test('earlier answers change choices without erasing the old selection',async()=>{
  const {c,p}=await context();try{
   await start(p);await p.fill('#description','نمیدونم چی بگم');await p.click('#analyze-btn');await waitGuide(p,'source');
   await p.fill('#guide-input','از همسایه شنیدم یک نفر خودکشی کرد');await p.click('[data-action="guide-next"]');await waitGuide(p,'informantKnown');
   await p.click('[data-action="guide-skip"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);
   await p.click('[data-action="guide-back"]');await waitGuide(p,'informantKnown');
   await p.click('[data-action="guide-back"]');await waitGuide(p,'source');
   await p.fill('#guide-input','خودم دیدم کیف سرقت شد');await p.click('[data-action="guide-next"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),['یک نفر','چند نفر','فرد ناشناس','فرد آشنا']);
   await p.locator('[data-guide-option]',{hasText:'چند نفر'}).click();await waitGuide(p,'peopleDescription');
   await p.click('[data-action="guide-back"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),['یک نفر','چند نفر','فرد ناشناس','فرد آشنا']);
   assert.equal(await p.locator('[data-guide-option][aria-pressed="true"]').innerText(),'چند نفر');
   await p.click('[data-action="guide-back"]');await waitGuide(p,'source');
   await p.fill('#guide-input','از همسایه شنیدم یک نفر خودکشی کرد');await p.click('[data-action="guide-next"]');await waitGuide(p,'informantKnown');
   await p.click('[data-action="guide-skip"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);
   assert.equal(await p.inputValue('#guide-input'),'چند نفر این کار را انجام دادند');await bar(p,'guide-next','guide-skip',true);
   await p.waitForTimeout(1100);await p.reload();await p.click('[data-action="draft"]');await waitGuide(p,'who');
   assert.deepEqual(await chips(p,'[data-guide-option]'),expected);
   assert.equal(await p.inputValue('#guide-input'),'چند نفر این کار را انجام دادند');
  }finally{await c.close()}
 });
 await test('old AI draft refreshes choices and keeps its answer and later unsent text',async()=>{
  const {c,p}=await context();try{
   await mockAi(p);
   const ai={mode:'detail',turns:[{stage:'source',q:GUIDE_STEPS[0].title,a:'خودم دیدم'}],
    current:{stage:'who',question:GUIDE_STEPS[1].title,options:['یک نفر','چند نفر']},
    draft:'یک نفر با لباس آبی',facts:[],done:false};
   await writeDraft(p,{text:'یک نفر خودکشی کرد',step:1,files:[],ai});await waitAi(p,'who');
   assert.deepEqual(await chips(p,'[data-ai-option]'),expected);assert.equal(await p.inputValue('#ai-answer'),'یک نفر با لباس آبی');
   await bar(p,'ai-send','ai-unknown',true);await p.click('[data-action="ai-send"]');await waitAi(p,'when');
   await p.fill('#ai-answer','حدود ظهر دیروز');await p.click('[data-action="ai-back"]');await waitAi(p,'who');
   assert.equal(await p.inputValue('#ai-answer'),'یک نفر با لباس آبی');assert.deepEqual(await chips(p,'[data-ai-option]'),expected);
   await p.waitForTimeout(1100);await p.reload();await p.click('[data-action="draft"]');await waitAi(p,'who');
   assert.equal(await p.inputValue('#ai-answer'),'یک نفر با لباس آبی');assert.deepEqual(await chips(p,'[data-ai-option]'),expected);
   await p.click('[data-action="ai-send"]');await waitAi(p,'when');assert.equal(await p.inputValue('#ai-answer'),'حدود ظهر دیروز');
  }finally{await c.close()}
 });
 await test('mocked AI uses earlier context and ignores conflicting model choices',async()=>{
  const {c,p}=await context();try{
   await mockAi(p);await start(p);await p.fill('#description','نمیدونم چی بگم');await p.click('#analyze-btn');await waitAi(p,'source');
   await p.fill('#ai-answer','از فرد دیگری شنیدم یک نفر خودکشی کرد');await p.click('[data-action="ai-send"]');await waitAi(p,'informantKnown');
   await p.click('[data-action="ai-unknown"]');await waitAi(p,'who');
   assert.deepEqual(await chips(p,'[data-ai-option]'),expected);await bar(p,'ai-send','ai-unknown',false);
   await p.locator('[data-ai-option]',{hasText:expected[1]}).click();await waitAi(p,'peopleDescription');
   await p.click('[data-action="ai-back"]');await waitAi(p,'who');
   assert.deepEqual(await chips(p,'[data-ai-option]'),expected);assert.equal(await p.inputValue('#ai-answer'),expected[1]);
  }finally{await c.close()}
 });
 await test('no browser exceptions',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close()}
if(failures.length){console.error(`${failures.length} contextual-choice browser check(s) failed`);process.exit(1)}
console.log('All contextual-choice browser checks passed.');
