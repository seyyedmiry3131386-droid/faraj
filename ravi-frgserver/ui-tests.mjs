// End-to-end checks in a real browser: the guided interview, dictation through
// the browser's own recogniser, and analysis with no model configured.
//
// These need Chromium and a running `npm run dev`, so they are a separate
// script rather than part of `npm test`. Run:
//   npm run dev &
//   npm run test:ui
// Set RAVI_UI_SCREENSHOT=/path/shot.png to capture the final screen.
//
// The speech engine is stubbed in the page, because a headless browser has no
// microphone. Everything else is the real application code and the real server.
import { GUIDE_STEPS } from './public/guidance.js';

const BASE = process.env.RAVI_UI_BASE || 'http://localhost:4173/';
const CHROME = process.env.RAVI_UI_CHROME || process.env.PLAYWRIGHT_CHROMIUM;
const launchOptions = CHROME ? { executablePath: CHROME } : {};

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('Playwright is required for browser checks; run npm ci first.'); process.exit(1); }
try { const probe = await fetch(BASE); if (!probe.ok) throw new Error(String(probe.status)); }
catch { console.error(`no dev server at ${BASE}; start it with \`npm run dev\` first`); process.exit(1); }

const browser=await chromium.launch(launchOptions);
const page=await browser.newPage({viewport:{width:430,height:900},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
// Stub the browser speech engine so the dictation path can be exercised headless.
await page.addInitScript(()=>{
 class FakeRecognition{
  start(){FakeRecognition.live=this;setTimeout(()=>{
   this.onresult?.({resultIndex:0,results:[{isFinal:false,0:{transcript:'دیروز کیفم'}}]});
   setTimeout(()=>this.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:'دیروز توی خیابان بهار کیفم را زدند'}}]}),60);
  },40)}
  stop(){this.onend?.()}
 }
 window.webkitSpeechRecognition=FakeRecognition;window.SpeechRecognition=FakeRecognition;
});
const failures=[];
const step=async(label,fn)=>{try{await fn();console.log('ok   -',label)}catch(e){failures.push(label);console.log('not ok -',label,'-',String(e).split('\n')[0])}};
const advanceGuide=async(p,action)=>{
 const before=(await p.textContent('#guide-title')).trim();
 await p.click(`[data-action="${action}"]`);
 await p.waitForFunction(t=>!document.querySelector('#guide-title')||document.querySelector('#guide-title').textContent.trim()!==t,before,{timeout:10000});
};
await page.goto(BASE,{waitUntil:'networkidle'});
await page.locator('[data-action="continue-report"], [data-action="new"]').first().click();
await page.waitForSelector('#description');

await step('the voice tab offers dictation without instruction text, and never claims to be offline',async()=>{
 await page.locator('[data-action="voice-tab"]').first().click();
 await page.waitForSelector('[data-action="dictate"]',{timeout:5000});
 // The explanatory note was removed on request. What must never appear is
 // the opposite claim: browser dictation is not guaranteed to stay on device.
 const panel=await page.locator('.voice-panel').innerText();
 if(/آفلاین است|روی دستگاه شما می‌ماند|از دستگاه خارج نمی‌شود/.test(panel))throw new Error('claims to be offline: '+panel);
 if(/دکمه را بزنید و حرف بزنید/.test(panel))throw new Error('instruction text is back');
});
await step('dictation writes the recognised sentence into the description',async()=>{
 await page.locator('[data-action="dictate"]').click();
 await page.waitForFunction(()=>document.querySelector('#description')?.value.includes('خیابان بهار'),{timeout:6000});
 const text=await page.locator('#description').inputValue();
 console.log('     dictated:',text);
});
await step('the offline guide asks all seven stages in order before follow-ups',async()=>{
 await page.locator('[data-action="text-tab"]').first().click();
 await page.fill('#description','نمیدونم چی بگم');
 await page.click('#analyze-btn');
 await page.waitForSelector('#guide-title');
 const fill=async text=>{await page.fill('#guide-input',text);await advanceGuide(page,'guide-next')};
 for(const guideStep of GUIDE_STEPS){
  const title=(await page.textContent('#guide-title')).trim();
  if(title!==guideStep.title)throw new Error(`expected ${guideStep.id}, got ${title}`);
  if(await page.locator('[data-action="guide-finish"]').count())throw new Error('early finish bypasses a core stage');
  if(guideStep.id==='source'){
   await page.locator('.guide-chip',{hasText:'خودم دیدم'}).first().click();
   // Wait out the double-click guard before submitting a later typed answer.
   await page.waitForTimeout(1300);
  }else if(guideStep.id==='when')await fill('دیروز حدود ظهر');
  else if(guideStep.id==='where')await fill('خیابان بهار، نزدیک نانوایی');
  else if(guideStep.id==='result')await fill('شیشهٔ سمت راننده شکسته بود و کیف و گوشی را از داخل ماشین بردند');
  else await advanceGuide(page,'guide-skip');
 }
 // Relevant optional branches only start after the core stages.
 for(let i=0;i<25 && await page.locator('#guide-title').count();i++)await advanceGuide(page,'guide-skip');
 await page.waitForSelector('#description',{timeout:6000});
 const text=await page.locator('#description').inputValue();
 console.log('     narrative:',text);
 if(/انگیزه|سر اختلاف|به خاطر|سر پول/.test(text))throw new Error('invented a motive');
 for(const kept of ['خیابان بهار','دیروز','کیف و گوشی','من خودم این را دیدم'])if(!text.includes(kept))throw new Error('lost: '+kept);
});
await step('the description screen carries no instruction panels',async()=>{
 // The fact strip, the «don't know what to write?» box and the missing-facts
 // panel were removed on request; the interview opens by itself instead.
 for(const gone of ['.fact-strip','.guide-offer','.missing-facts','[data-action="guide-open"]'])
  if(await page.locator(gone).count())throw new Error('still on the page: '+gone);
});
await step('analysis offline proposes the right topics',async()=>{
 await page.locator('#analyze-btn').click();
 // Right after the description: «گزارش تکمیلی می‌دهید؟» — yes leads to the review.
 await page.waitForSelector('[data-action="detail-yes"]',{timeout:12000});
 await page.click('[data-action="detail-yes"]');
 await page.waitForSelector('.analysis-tag',{timeout:12000});
 console.log('     topics:',(await page.locator('.analysis-tag').allInnerTexts()).join('، '));
});
await step('the guide keeps a chip answer, and the questionnaire does not repeat the guide',async()=>{
 // Regression 1: an empty text box was read as «skip», so picking a chip and
 // pressing «ادامه» erased the answer and the same question came back forever.
 // Regression 2: the guide and the questionnaire asked the same questions.
 const ctx=await browser.newContext({viewport:{width:390,height:844}});const q=await ctx.newPage();
 await q.goto(BASE);await q.locator('[data-action="continue-report"], [data-action="new"]').first().click();
 await q.click('[data-action="text-tab"]').catch(()=>{});
 await q.fill('#description','نمیدونم چی بگم');await q.click('#analyze-btn');
 await q.waitForSelector('#guide-title');
 // Tap an option and then, out of habit, «ادامه» as well: one question forward, not two.
 await q.click('text=خودم دیدم');await q.waitForTimeout(420);
 if(await q.locator('[data-action="guide-next"]').isEnabled())throw new Error('continue should be disabled on the new blank stage');
 const second=(await q.textContent('#guide-title')).trim();
 if(second===GUIDE_STEPS[0].title)throw new Error('the chip answer was wiped; the first question came back');
 if(second!==GUIDE_STEPS[1].title)throw new Error('a habitual «ادامه» skipped a question; now on: '+second);
 await q.waitForTimeout(1000);
 const guideAsked=[];
 for(let i=0;i<25 && await q.locator('#guide-title').count();i++){
  const t=(await q.textContent('#guide-title')).trim();guideAsked.push(t);
  if(t===GUIDE_STEPS.find(s=>s.id==='result').title){await q.fill('#guide-input','کیفم را از داخل ماشین بردند');await advanceGuide(q,'guide-next')}
  else{const skip=q.locator('[data-action="guide-skip"]');await advanceGuide(q,await skip.count()?'guide-skip':'guide-next')}
 }
 await q.click('#analyze-btn');await q.waitForSelector('[data-action="detail-yes"]');await q.click('[data-action="detail-yes"]');await q.waitForTimeout(500);
 const formAsked=[];
 for(let i=0;i<30;i++){
  const heading=q.locator('h2.question-title').first();if(!await heading.count())break;
  const t=(await heading.textContent()).trim();if(!t)break;formAsked.push(t);
  const unknown=q.locator('[data-answer]').filter({hasText:/نمی‌دانم|اطلاعی ندارم|^خیر|ندارم/});
  if(await unknown.count()&&await unknown.first().isVisible()){await unknown.first().click();const nx=q.locator('[data-action="question-next"]').first();if(await nx.count()&&await nx.isEnabled())await nx.click()}
  else{let clicked=false;for(const sel of ['[data-action="guide-skip"]','[data-action="flow-unknown"]','[data-action="analysis-review-next"]','[data-action="question-next"]','[data-action="flow-skip"]','[data-action="flow-finish"]']){const el=q.locator(sel).first();if(await el.count()&&await el.isVisible()&&await el.isEnabled()){await el.click();clicked=true;break}}if(!clicked)break}
  await q.waitForTimeout(150);
 }
 await ctx.close();
 // The object section can ask for additional properties of a known item; it
 // is not the same as the base «what happened?» question answered above.
 for(const repeated of ['این اتفاق چه زمانی افتاد؟','این اتفاق کجا افتاد؟','چگونه از این اتفاق مطلع شدید؟','از افراد مرتبط با این اتفاق چیزی می‌دانید؟'])
  if(formAsked.includes(repeated))throw new Error(`asked again after the guide: ${repeated}`);
 console.log(`     guide asked ${guideAsked.length}, questionnaire then asked ${formAsked.length}: ${formAsked.join(' / ')}`);
});
await step('a later question has its own microphone, and speech lands in that box',async()=>{
 // Browser dictation stands in for the microphone here (a headless browser has
 // none); the same button records to the speech server when one is configured.
 const ctx=await browser.newContext({viewport:{width:390,height:844}});const q=await ctx.newPage();
 await q.addInitScript(()=>{
  class R{constructor(){this.lang='';this.continuous=false;this.interimResults=false}
   start(){setTimeout(()=>{this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:'دو نفر با موتور آمدند'}],{isFinal:true})]});setTimeout(()=>this.onend?.(),20)},40)}
   stop(){this.onend?.()} abort(){}}
  window.SpeechRecognition=R;window.webkitSpeechRecognition=R;
 });
 await q.goto(BASE);await q.locator('[data-action="continue-report"], [data-action="new"]').first().click();
 await q.click('[data-action="text-tab"]').catch(()=>{});
 await q.fill('#description','نمیدونم چی بگم');await q.click('#analyze-btn');await q.waitForSelector('#guide-title');
 await q.click('text=خودم دیدم');
 for(let i=0;i<6;i++){await q.waitForTimeout(450);const t=(await q.textContent('#guide-title')).trim();if(t===GUIDE_STEPS.find(s=>s.id==='result').title)break;const skip=q.locator('[data-action="guide-skip"]');if(await skip.count())await skip.click()}
 if((await q.textContent('#guide-title')).trim()!==GUIDE_STEPS.find(s=>s.id==='result').title)throw new Error('did not reach the result stage');
 if(!await q.locator('.field-voice [data-field-voice]').count())throw new Error('no microphone on the free-text answer');
 await q.click('.field-voice [data-field-voice]');
 await q.waitForFunction(()=>document.querySelector('#guide-input')?.value?.includes('موتور'),null,{timeout:5000});
 const value=await q.inputValue('#guide-input');
 await ctx.close();
 if(!value.includes('دو نفر با موتور آمدند'))throw new Error('speech did not reach the answer box: '+value);
});
await step('after the description: one question, yes or no; «no» files it as a general report',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});const q=await ctx.newPage();
 await q.goto(BASE);await q.locator('[data-action="continue-report"], [data-action="new"]').first().click();
 await q.click('[data-action="text-tab"]').catch(()=>{});
 await q.fill('#description','دیروز ظهر در خیابان بهار موتورم را از جلوی مغازه بردند');
 await q.click('#analyze-btn');
 await q.waitForSelector('[data-action="detail-yes"]');
 const title=(await q.textContent('.detail-choice .question-title')).trim();
 const buttons=await q.locator('.detail-choice button').allInnerTexts();
 if(title!=='آیا می‌خواهید گزارش تکمیلی بدهید؟')throw new Error('wrong question: '+title);
 if(buttons.join('|')!=='بله|خیر')throw new Error('expected exactly بله / خیر, got '+buttons.join('|'));
 await q.click('[data-action="detail-no"]');await q.waitForTimeout(400);
 // «No»: no review, no questionnaire — straight to the documents step.
 const onDocuments=await q.locator('#dropzone, [data-action="upload"]').count();
 const questionnaire=await q.locator('#extraction-review-title').count();
 await ctx.close();
 if(!onDocuments||questionnaire)throw new Error('«خیر» did not go straight to documents');
});
await step('a dropdown can be used with a mouse and with a finger',async()=>{
 // Regression: pressing an option moved focus out of the search box, the
 // focusout handler closed the menu, and the click landed on nothing — every
 // list in the form was keyboard-only. Both pointer kinds are checked because
 // only one of them moves focus on press.
 for(const hasTouch of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch});
  const probe=await context.newPage();
  // Serve the fixture only inside this test, not as a production public page.
  await probe.route('**/__selecttest.html',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/legacy-ui.css"></head><body><label for="k">نوع وسیله</label><select id="k"><option value="">انتخاب کنید</option><option>خودرو</option><option>ون</option><option>موتورسیکلت</option><option>وانت</option></select><p id="out">-</p><script type="module">import {enhanceSelects} from '/legacy-select.js';enhanceSelects(document.body);document.querySelector('#k').addEventListener('change',e=>{document.querySelector('#out').textContent='VALUE='+e.target.value})</script></body></html>`}));
  await probe.goto(BASE+'__selecttest.html');
  await probe.click('.searchable-select-trigger');
  await probe.waitForSelector('.searchable-select-option',{state:'visible',timeout:5000});
  await probe.click('.searchable-select-option:nth-of-type(3)');
  const chosen=(await probe.textContent('.searchable-select-trigger-copy')).trim();
  const value=(await probe.textContent('#out')).trim();
  await context.close();
  if(chosen!=='ون'||value!=='VALUE=ون')throw new Error(`${hasTouch?'touch':'mouse'}: trigger=${chosen} out=${value}`);
 }
});
await step('local speech busy keeps the recording visible for download and retry',async()=>{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});const q=await ctx.newPage();let calls=0;
 try{
  await q.route('**/api/config',r=>r.fulfill({json:{ai:false,provider:'',interview:false,transcription:true,sttLocal:true}}));
  await q.route('**/api/transcribe',r=>{calls++;return calls===1?r.fulfill({status:503,json:{error:'سرویس گفتار مشغول است؛ کمی بعد دوباره تلاش کنید.',code:'stt_busy'}}):r.fulfill({json:{text:'متن نمونهٔ صوت',model:'whisper-test'}})});
  await q.goto(BASE,{waitUntil:'networkidle'});await q.locator('[data-action="continue-report"], [data-action="new"]').first().click();
  await q.waitForSelector('#description');await q.click('[data-action="voice-tab"]');
  await q.locator('#audio-input').setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:Buffer.from('test audio')});
  await q.waitForSelector('[data-action="retry-transcribe"]',{timeout:5000});
  if(!await q.locator('[data-action="download-recording"]').isVisible())throw new Error('download missing after busy response');
  await q.click('[data-action="retry-transcribe"]');
  await q.waitForFunction(()=>document.querySelector('#description')?.value.includes('متن نمونهٔ صوت'),null,{timeout:5000});
  if(calls!==2)throw new Error('retry did not send exactly once');
  if(await q.locator('[data-action="retry-transcribe"]').count())throw new Error('already transcribed recording can be appended twice');
 }finally{await ctx.close()}
});
if(process.env.RAVI_UI_SCREENSHOT)await page.screenshot({path:process.env.RAVI_UI_SCREENSHOT});
await step('no page errors',async()=>{if(errors.length)throw new Error(errors[0])});
await browser.close();
if(failures.length){console.error(`${failures.length} browser check(s) failed: ${failures.join(', ')}`);process.exit(1)}
console.log('all browser checks passed');
