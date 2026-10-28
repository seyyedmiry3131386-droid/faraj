// Real Chromium checks for navigation, responsive controls, and draft recovery.
// AI responses below are deliberate mocks, not a model-quality evaluation.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {GUIDE_STEPS,LEGACY_STAGE_TITLES,stepsFor} from './public/guidance.js';
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
   assert.match(await p.locator('#news-domain').innerText(),/حوزه خبری پیشنهادی:.*انتظامی/s);
   assert.ok(await p.evaluate(()=>document.querySelector('#triage-slot').nextElementSibling===document.querySelector('#news-domain')),'domain must be a separate panel right below triage');
   assert.ok(await p.locator('#triage-slot .triage').isVisible());
   const cards=await p.locator('#triage-slot, #news-domain').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom}}));
   assert.equal(cards.length,2);assert.ok(cards[1].y>=cards[0].bottom);assert.ok(Math.abs(cards[0].width-cards[1].width)<2);
   assert.ok(await p.evaluate(()=>Boolean(document.querySelector('#news-domain').compareDocumentPosition(document.querySelector('#description'))&Node.DOCUMENT_POSITION_FOLLOWING)));
   assert.ok(!(await p.locator('body').innerText()).includes('برای بازیابی، پیش‌نویس و فایل‌های انتخابی به‌طور خودکار و بدون رمزگذاری اختصاصی در این مرورگر ذخیره می‌شوند'));
   await p.fill('#description','در بیمارستان خدمات درمانی دریافت نکرده است');assert.match(await p.locator('#news-domain').innerText(),/اجتماعی/);assert.doesNotMatch(await p.locator('#news-domain').innerText(),/رفاه/);
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
   assert.ok(!follow.some(t=>/چند نفر در این اتفاق|ظاهر یا نشانه‌های این افراد/.test(t)),follow.join('|'));
   assert.ok(!follow.some(t=>/مشخصات این وسیله نقلیه/.test(t)),'vehicle details asked after skipping its parent');
   assert.ok(!follow.some(t=>/از کِی این مشکل شروع شده است/.test(t)),follow.join('|'));
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
   const old={text:'نمیدونم چی بگم',step:0,files:[],guide:{index:2,base:'',answers:{source:'من خودم این را دیدم',who:'این اتفاق برای مادرم افتاد',evidence:'فیلم دارم'},skipped:[],draft:{step:'when',value:'حدود ظهرِ دیروز'}}};
   await writeDraft(p,old);await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),GUIDE_STEPS[1].title);
   assert.equal(await p.inputValue('#guide-input'),'');
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++){
    const title=(await p.textContent('#guide-title')).trim();
    if(title===GUIDE_STEPS[4].title){await p.fill('#guide-input','کیفم را بردند');await nextGuide(p,'guide-next')}
    else if(title===GUIDE_STEPS[2].title){assert.equal(await p.inputValue('#guide-input'),'حدود ظهرِ دیروز');await nextGuide(p,'guide-next')}
    else await nextGuide(p,'guide-skip');
   }
   await p.waitForSelector('#description');const text=await p.inputValue('#description');
   assert.ok(text.includes('این اتفاق برای مادرم افتاد'));assert.ok(text.includes('فیلم دارم'));assert.ok(text.includes('کیفم را بردند'));assert.ok(text.includes('حدود ظهرِ دیروز'));
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
 await test('witness wording is formal and self-harm observation is clear without a topic caption',async()=>{
  {
   const {c,p}=await context(390);
   try{
    const answers={result:'یک خودرو کیفم را برد',source:'من خودم این را دیدم'},steps=stepsFor(answers),index=steps.findIndex(s=>s.id==='witness');assert.ok(index>=0);
    await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],guide:{orderVersion:4,mode:'intake',index,answers,skipped:[],base:''}});await p.waitForSelector('#guide-title');
    assert.equal((await p.textContent('#guide-title')).trim(),'آیا فرد دیگری هم این اتفاق را مشاهده کرد؟');await bar(p,'guide-next','guide-skip',false);
   }finally{await c.close()}
  }
  {
   const {c,p}=await context(390);
   try{
    const text='او گفت قصد خودکشی دارد',analysis=prepareAnalysis(localAnalysis(text),text),index=questionsFor(analysis).findIndex(q=>q.id==='details_self_harm');assert.ok(index>=0,JSON.stringify(analysis));
    const state={text,analysis,answers:{details_self_harm:'بله، اطلاعات دارم'},extra:{details_self_harm:{enabled:true,rows:[{_id:'self'}]}},step:1,qIndex:index,flow:{section:'details_self_harm',phase:'fields',row:0,page:'observation',showKnown:true},analysisReview:{version:1,text,eventKey:[...analysis.events].sort().join('|'),page:0,items:[],complete:true},prefillAudit:[],prefillText:text,files:[]};
    await writeDraft(p,state);await p.waitForSelector('[data-detail-field="observation"]');
    assert.equal((await p.locator('.question-title').innerText()).trim(),'چه گفته یا رفتاری باعث نگرانی شما شده است؟');assert.equal(await p.locator('.topic-caption').count(),0);
    assert.equal((await p.locator('.flow-progress > span').innerText()).trim(),'پرسش‌های تکمیلی');
    await bar(p,'question-next','flow-skip',false);
   }finally{await c.close()}
  }
 });
 await test('an old duration draft is kept, skipped in navigation and survives refresh',async()=>{
  const {c,p}=await context(390);
  try{
   const answers={source:'من خودم این را دیدم',who:'یک نفر',when:'دیروز',where:'تهران',result:'مشکل قطع آب ادامه دارد',ongoing:'این وضعیت در لحظهٔ ثبت گزارش ادامه داشت'};
   const oldSteps=stepsFor(answers,'',[],{includeDeprecated:true}),durationIndex=oldSteps.findIndex(s=>s.id==='duration');assert.ok(durationIndex>=0);
   const old={text:'نمیدونم چی بگم',step:0,files:[],guide:{orderVersion:2,mode:'intake',index:durationIndex,base:'',answers,skipped:[],draft:{step:'duration',value:'از دو هفته پیش'}}};
   await writeDraft(p,old);await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),oldSteps[durationIndex+1].title);
   await p.click('[data-action="guide-back"]');assert.equal((await p.textContent('#guide-title')).trim(),oldSteps[durationIndex-1].title);
   await nextGuide(p,'guide-next');await p.waitForTimeout(900);await p.reload();await p.click('[data-action="draft"]');await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),oldSteps[durationIndex+1].title);
   const visited=[];
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++){visited.push((await p.textContent('#guide-title')).trim());await nextGuide(p,'guide-skip')}
   await p.waitForSelector('#description');assert.ok((await p.inputValue('#description')).includes('از دو هفته پیش'));
   assert.ok(!visited.some(x=>/زمان شروع|از کِی/.test(x)),visited.join('|'));
  }finally{await c.close()}
 });
 await test('a finished old guide rebases to its end without losing a prior duration answer',async()=>{
  const {c,p}=await context(390);
  try{
   const answers={source:'من خودم این را دیدم',when:'دیروز',result:'مشکل قطع آب ادامه دارد',ongoing:'این وضعیت ادامه داشت',duration:'از سه هفته پیش'};
   const index=stepsFor(answers,'',[],{includeDeprecated:true}).length;
   await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],guide:{orderVersion:2,mode:'intake',index,base:'',answers,skipped:[]}});
   await p.waitForSelector('#description');assert.ok((await p.inputValue('#description')).includes('از سه هفته پیش'));
  }finally{await c.close()}
 });
 await test('old separate count draft is retained while its repeated question disappears',async()=>{
  const {c,p}=await context(390);
  try{
   const answers={source:'من خودم این را دیدم',who:'یک نفر این کار را انجام داد',when:'دیروز',where:'تهران',result:'سرقت و درگیری رخ داد',reason:'نامعلوم',method:'نامعلوم'};
   const old=stepsFor(answers,'',[],{legacyPeople:true}),index=old.findIndex(s=>s.id==='peopleCount');assert.ok(index>=0);
   await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],guide:{orderVersion:3,mode:'intake',index,base:'',answers,skipped:[],draft:{step:'peopleCount',value:'حدود سه نفر'}}});
   await p.waitForSelector('#guide-title');assert.match(await p.textContent('#guide-title'),/ظاهر یا نشانه/);
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++){
    assert.doesNotMatch(await p.textContent('#guide-title'),/چند نفر در این اتفاق نقش داشتند/);
    await nextGuide(p,'guide-skip');
   }
   await p.waitForSelector('#description');assert.match(await p.inputValue('#description'),/حدود سه نفر/);
  }finally{await c.close()}
 });
 await test('old AI question titles and unsent draft survive reload and Back',async()=>{
  const {c,p}=await context(390);
  try{
   await p.route('**/api/config',r=>r.fulfill({json:{ai:true,interview:true,provider:'local',model:'mock'}}));
   await p.route('**/api/interview',r=>r.fulfill({json:{done:true,question:'ساختگی',options:[],facts:[],domain:'رفاه'}}));
   const ai={mode:'intake',turns:[{stage:'source',q:LEGACY_STAGE_TITLES.source,a:'خودم دیدم',options:[]}],current:{stage:'who',question:LEGACY_STAGE_TITLES.who,options:[]},draft:'یک نفر با کلاه',facts:[],done:false,domain:'رفاه'};
   await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],ai});await p.waitForSelector('#ai-question');
   assert.equal((await p.textContent('#ai-question')).trim(),GUIDE_STEPS[1].title);assert.equal(await p.inputValue('#ai-answer'),'یک نفر با کلاه');
   await p.click('[data-action="ai-back"]');assert.equal((await p.textContent('#ai-question')).trim(),GUIDE_STEPS[0].title);assert.equal(await p.inputValue('#ai-answer'),'خودم دیدم');
   await p.click('[data-action="ai-send"]');await p.waitForFunction(t=>document.querySelector('#ai-question')?.textContent.trim()===t,GUIDE_STEPS[1].title);
   assert.equal(await p.inputValue('#ai-answer'),'یک نفر با کلاه');
  }finally{await c.close()}
 });
 await test('an unrecognised old AI question after the last core step does not crash or lose its draft',async()=>{
  const {c,p}=await context(390);
  try{
   await p.route('**/api/config',r=>r.fulfill({json:{ai:true,interview:true,provider:'local',model:'mock'}}));
   await p.route('**/api/interview',r=>r.fulfill({json:{done:true,question:'',options:[],facts:[]}}));
   const turns=GUIDE_STEPS.map((s,i)=>({stage:s.id,q:LEGACY_STAGE_TITLES[s.id],a:i===4?'کیفم را بردند':i===0?'خودم دیدم':''}));
   const ai={mode:'intake',turns,current:{question:'پرسش قدیمی دیگر',options:[]},draft:'توضیح قدیمی حفظ شود',facts:[],done:false};
   await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],ai});
   await p.waitForFunction(()=>document.querySelector('#guide-title')||document.querySelector('#description'),null,{timeout:15000});
   for(let i=0;i<30&&await p.locator('#guide-title').count();i++)await nextGuide(p,'guide-skip');
   await p.waitForSelector('#description');assert.ok((await p.inputValue('#description')).includes('توضیح قدیمی حفظ شود'));
  }finally{await c.close()}
 });
 await test('old victim question has no display prefix and remains distinct from actor after Back',async()=>{
  const {c,p}=await context(390);
  try{
   await p.route('**/api/config',r=>r.fulfill({json:{ai:true,interview:true,provider:'local',model:'mock'}}));
   await p.route('**/api/interview',r=>r.fulfill({json:{done:false,question:'نامربوط',options:[],facts:[]}}));
   const victim='چه کسی: این اتفاق برای چه کسی افتاد؟';
   const ai={mode:'intake',turns:[{stage:'source',q:LEGACY_STAGE_TITLES.source,a:'خودم دیدم'}, {stage:'who',q:victim,a:'برای مادرم بود'}],current:{stage:'who',question:LEGACY_STAGE_TITLES.who,options:[]},draft:'فاعل ناشناس بود',facts:[],done:false};
   await writeDraft(p,{text:'نمیدونم چی بگم',step:0,files:[],ai});await p.waitForSelector('#ai-question');
   assert.equal((await p.textContent('#ai-question')).trim(),GUIDE_STEPS[1].title);await p.click('[data-action="ai-back"]');
   assert.equal((await p.textContent('#ai-question')).trim(),'این اتفاق برای چه کسی افتاد؟');assert.equal(await p.inputValue('#ai-answer'),'برای مادرم بود');
   await p.click('[data-action="ai-send"]');await p.waitForFunction(t=>document.querySelector('#ai-question')?.textContent.trim()===t,GUIDE_STEPS[1].title);
   assert.equal(await p.inputValue('#ai-answer'),'فاعل ناشناس بود');
  }finally{await c.close()}
 });
 await test('no browser exceptions',async()=>assert.deepEqual(errors,[]));
}finally{await browser.close()}
if(failures.length){console.error(`${failures.length} UI check(s) failed`);process.exit(1)}
console.log('All ordered-flow browser checks passed.');
