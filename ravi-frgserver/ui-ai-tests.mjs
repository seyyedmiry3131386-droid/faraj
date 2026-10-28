// Browser checks for the model-assisted path and the server-enforced order.
//
// No real model is downloaded here. The page's calls to /api/interview go
// through the real worker and the real safety checks (llm.js) to mock-llm.mjs,
// which answers with fixed questions like a model would. What is tested is the
// screen, the flow and the fallback, not the quality of any model.
//
//   npm run dev &
//   npm run test:ui:ai
const BASE = process.env.RAVI_UI_BASE || 'http://localhost:4173/';
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  try { const { createRequire } = await import('node:module'); ({ chromium } = createRequire(process.env.PLAYWRIGHT_MODULES || import.meta.url)('playwright')); }
  catch { console.error('Playwright is required for browser checks; run npm ci first.'); process.exit(1); }
}
try { const probe = await fetch(BASE); if (!probe.ok) throw new Error(); } catch { console.error(`no dev server at ${BASE}`); process.exit(1); }

const { default: worker } = await import('./worker.js');
const { start } = await import('./mock-llm.mjs');
const { localAnalysis } = await import('./public/scenarios.js');
const { prepareAnalysis } = await import('./public/extraction.js');
const { GUIDE_STEPS, coreStepsFor, interviewOptionLabels } = await import('./public/guidance.js');
const mock = await start(0);
const env = { LLM_URL: `http://127.0.0.1:${mock.address().port}`, LLM_MODEL: 'qwen3:8b' };

const chromePath = process.env.RAVI_UI_CHROME || process.env.PLAYWRIGHT_CHROMIUM;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(()=>{
 window.__geoCalls=[];
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok,_fail,options){
  window.__geoCalls.push({active:navigator.userActivation?.isActive,options});
  ok({coords:{latitude:35.123456,longitude:51.654321,accuracy:40}});
 }}});
});
const errors = []; page.on('pageerror', e => errors.push(String(e)));
let interviewDown = false, malicious = false;
await page.route('**/api/config', r => r.fulfill({ json: { ai: true, interview: true, provider: 'local', model: 'qwen3:8b', transcription: false, sttLocal: false } }));
await page.route('**/api/analyze', async r => { const { text } = r.request().postDataJSON(); r.fulfill({ json: { ...prepareAnalysis(localAnalysis(text), text), mode: 'ai' } }); });
await page.route('**/api/interview', async r => {
  if (malicious) return r.fulfill({json:{done:true,stage:'evidence',question:'پرسش خارج از ترتیب',hint:'',options:['ساختگی'],facts:[],urgent:'',narrative:'روایت ساختگی'}});
  if (interviewDown) return r.fulfill({ status: 502, json: { error: 'مدل هوش مصنوعی روی سرور در دسترس نیست؛ برنامهٔ مدل (Ollama) را روشن کنید.' } });
  const res = await worker.fetch(new Request('http://localhost/api/interview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: r.request().postData() }), env);
  r.fulfill({ status: res.status, json: await res.json() });
});

let failed = 0;
async function step(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.stack); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const TEXT = 'دیشب حدود ساعت ۱۱ در خیابان بهار دو نفر با موتور آمدند، شیشهٔ ماشینم را شکستند و کیف و گوشی‌ام را از داخل ماشین بردند. همسایه‌مان دید و به من گفت.';

async function fresh() {
  await page.goto(BASE);
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('ravi-v1'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(BASE);
  await page.locator('[data-action="continue-report"], [data-action="new"]').first().click();
  await page.click('[data-action="text-tab"]');
}
const question = async (previous) => {
  await page.waitForFunction(prev => { const el = document.querySelector('#ai-question'); return el && el.textContent.trim() !== prev; }, previous ?? null, { timeout: 15000 });
  return (await page.locator('#ai-question').textContent()).trim();
};
const advanceGuide = async action => {
  const before=(await page.textContent('#guide-title')).trim();
  await page.click(`[data-action="${action}"]`);
  await page.waitForFunction(t=>!document.querySelector('#guide-title')||document.querySelector('#guide-title').textContent.trim()!==t,before,{timeout:10000});
};
const acceptReview=async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-action="analysis-review-next"]')||document.querySelector('.ai-interview')||document.querySelector('#guide-title'),null,{timeout:15000});
  for(let i=0;i<40;i++){
    const next=page.locator('[data-action="analysis-review-next"]');
    if(!await next.count())return;
    const caption=await page.locator('.flow-step-caption small').first().textContent();
    await next.click();
    await page.waitForFunction(old=>!document.querySelector('[data-action="analysis-review-next"]')||document.querySelector('.flow-step-caption small')?.textContent!==old,caption,{timeout:15000});
  }
  throw Error('too many review pages');
};
const finishDetails=async()=>{
 for(let i=0;i<80&&!await page.locator('#dropzone').count();i++){
  if(await page.locator('#guide-title').count()){await advanceGuide('guide-skip');continue}
  let clicked=false;
  for(const sel of ['[data-action="analysis-review-next"]','[data-action="flow-skip"]','[data-action="flow-unknown"]','[data-action="question-next"]','[data-action="flow-finish"]']){
   const el=page.locator(sel).first();if(await el.count()&&await el.isVisible()&&await el.isEnabled()){await el.click();clicked=true;break}
  }
  if(!clicked)throw Error('cannot reach attachments: '+(await page.locator('body').innerText()).slice(-500));
 }
 await page.waitForSelector('#dropzone',{timeout:15000});
};


await step('the model-assisted detail path starts at the first missing ordered stage', async () => {
  await fresh();
  await page.fill('#description', TEXT); await page.click('#analyze-btn');
  await page.click('[data-action="detail-yes"]');
  await acceptReview();
  const q1 = await question();
  assert(q1 === coreStepsFor({}, TEXT)[0].title, q1);
  assert(await page.locator('.flow-content textarea#ai-answer').count() === 1, 'answer box');
  const actual=(await page.locator('[data-ai-option]').allInnerTexts()).map(s=>s.trim());
  const expected=interviewOptionLabels(coreStepsFor({}, TEXT)[0]);
  assert(JSON.stringify(actual)===JSON.stringify(expected), 'contextual stage choices');
});

await step('facts the model invented are not shown; facts from the description are', async () => {
  await page.locator('.ai-facts summary').click().catch(() => {});
  const facts = await page.locator('.ai-facts li').allInnerTexts();
  assert(facts.some(f => f.includes('خیابان بهار')), facts.join('|'));
  assert(!facts.some(f => f.includes('ساختگی')), 'invented fact shown');
});

await step('back restores a typed answer and an unknown completes the next stage', async () => {
  const [first, second] = coreStepsFor({}, TEXT);
  await page.fill('#ai-answer', 'شنیدم سر اختلاف قبلی بوده است');
  await page.click('[data-action="ai-send"]');
  const q2 = await question(first.title);
  assert(q2 === second.title, q2);
  const chips = await page.locator('[data-ai-option]').allInnerTexts();
  assert(!chips.includes('نمی‌دانم'), 'unknown is a separate button');
  await page.click('[data-action="ai-back"]');
  assert((await question(q2)) === first.title, 'back');
  assert((await page.inputValue('#ai-answer')) === 'شنیدم سر اختلاف قبلی بوده است', 'answer restored');
  await page.click('[data-action="ai-send"]');
  await question(first.title);
  await page.click('[data-action="ai-unknown"]');
  await page.waitForSelector('#guide-title', { timeout: 15000 });
  await finishDetails();
});

await step('the questions and answers are in the final review, «نمی‌دانم» included', async () => {
  const next = page.locator('.content .primary').last(); await next.click();
  await page.waitForSelector('.ai-summary', { timeout: 10000 });
  const t = await page.locator('.ai-summary').innerText();
  assert(t.includes('شنیدم سر اختلاف قبلی بوده است') && t.includes('نمی‌دانم'), t);
});

await step('intake follows all seven stages even when the model wants to stop early', async () => {
  await fresh();
  await page.fill('#description', 'نمیدونم چی بگم'); await page.click('#analyze-btn');
  let previous = null;
  for (const expected of GUIDE_STEPS) {
    const current = await question(previous);
    assert(current === expected.title, `expected ${expected.id}, got ${current}`);
    assert(await page.locator('[data-action="ai-finish"]').count() === 0, 'early finish cannot bypass the stages');
    if(expected.id==='source'){
      // Even a stale/custom early-finish button must not jump to the end.
      await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='ai-finish';document.body.append(b);b.click();b.remove()});
      await page.waitForTimeout(100);
      assert((await page.textContent('#ai-question')).trim()===current, 'early finish action bypassed source');
    }
    if (expected.id === 'source') await page.locator('[data-ai-option]', {hasText: 'خودم دیدم'}).click();
    else if (expected.id === 'when' || expected.id === 'where' || expected.id === 'result') {
      const answer = {when:'دیروز',where:'ایستگاه مترو',result:'گوشی‌ام را در مترو زدند'}[expected.id];
      await page.fill('#ai-answer', answer);
      if(expected.id==='where'){
        assert((await page.evaluate(()=>window.__geoCalls.length))===0,'location was requested before a tap');
        await page.click('[data-action="location"]');
        assert((await page.inputValue('#ai-answer')).includes('35.12346, 51.65432'),'location was not appended to the AI answer');
        assert((await page.evaluate(()=>window.__geoCalls[0].active))===true,'location lost its user gesture');
      }
      await page.click('[data-action="ai-send"]');
    } else await page.click('[data-action="ai-unknown"]');
    previous = current;
  }
  await page.waitForFunction(()=>document.querySelector('#guide-title')||document.querySelector('#description'),null,{timeout:15000});
  for(let i=0;i<30&&await page.locator('#guide-title').count();i++)await advanceGuide('guide-skip');
  await page.waitForSelector('#description', { timeout: 15000 });
  const narrative = await page.inputValue('#description');
  assert(narrative.includes('گوشی‌ام را در مترو زدند') && narrative.includes('من خودم این را دیدم') && narrative.includes('دیروز') && narrative.includes('35.12346, 51.65432'), narrative);
  assert(!narrative.includes('نمی‌دانم'), narrative);
});

await step('the browser ignores a premature or out-of-order server response',async()=>{
  await fresh();malicious=true;
  try{
    await page.fill('#description','نمیدونم چی بگم');await page.click('#analyze-btn');
    let previous=null;
    for(const expected of GUIDE_STEPS){
      const current=await question(previous);assert(current===expected.title,`expected ${expected.id}: ${current}`);
      if(expected.id==='result'){await page.fill('#ai-answer','کیفم را بردند');await page.click('[data-action="ai-send"]')}
      else await page.click('[data-action="ai-unknown"]');
      previous=current;
    }
    await page.waitForFunction(()=>document.querySelector('#guide-title')||document.querySelector('#description'),null,{timeout:15000});
    for(let i=0;i<30&&await page.locator('#guide-title').count();i++)await advanceGuide('guide-skip');
    assert(!(await page.inputValue('#description')).includes('روایت ساختگی'),'invented narrative');
  }finally{malicious=false}
});

await step('an interrupted intake continues offline at the next stage without losing answers', async () => {
  await fresh();
  await page.fill('#description', 'نمیدونم چی بگم'); await page.click('#analyze-btn');
  assert((await question()) === GUIDE_STEPS[0].title, 'source first');
  await page.locator('[data-ai-option]', {hasText:'از فرد دیگری شنیدم'}).click();
  assert((await question(GUIDE_STEPS[0].title)) === GUIDE_STEPS[1].title, 'who second');
  await page.click('[data-action="ai-unknown"]');
  assert((await question(GUIDE_STEPS[1].title)) === GUIDE_STEPS[2].title, 'when third');
  await page.fill('#ai-answer', 'دیروز');
  interviewDown = true;
  await page.click('[data-action="ai-send"]');
  await page.waitForSelector('[data-action="ai-fallback"]', {timeout:15000});
  await page.click('[data-action="ai-fallback"]');
  interviewDown = false;
  assert((await page.textContent('#guide-title')).trim() === GUIDE_STEPS[3].title, 'fallback must continue at where');
  for(let i=0;i<25 && await page.locator('#guide-title').count();i++) {
    const title=(await page.textContent('#guide-title')).trim();
    if(title===GUIDE_STEPS[4].title){await page.fill('#guide-input','کیفم را بردند');await advanceGuide('guide-next')}
    else await advanceGuide('guide-skip');
  }
  await page.waitForSelector('#description',{timeout:15000});
  const narrative=await page.inputValue('#description');
  assert(narrative.includes('این را از فرد دیگری شنیدم') && narrative.includes('دیروز') && narrative.includes('کیفم را بردند'),narrative);
});

await step('if the model stops answering, the fixed questions take over and nothing is lost', async () => {
  await fresh();
  await page.fill('#description', TEXT); await page.click('#analyze-btn');
  await page.click('[data-action="detail-yes"]');
  await acceptReview();
  await question();
  await page.fill('#ai-answer', 'کیف و گوشی');
  interviewDown = true;
  await page.click('[data-action="ai-send"]');
  await page.waitForSelector('[data-action="ai-fallback"]', { timeout: 15000 });
  assert(/Ollama/.test(await page.locator('.error-note').innerText()), 'Persian reason shown');
  await page.click('[data-action="ai-fallback"]');
  await page.waitForSelector('.question-title', { timeout: 10000 });
  assert(await page.locator('#ai-question').count() === 0, 'offline guide');
  assert((await page.textContent('#guide-title')).trim()===coreStepsFor({},TEXT)[1].title,'fallback must continue at the next ordered stage');
  interviewDown = false;
});

await step('the emergency call box is on the description page only, never on later screens', async () => {
  await fresh();
  await page.fill('#description', 'همین الان دو نفر با چاقو جلوی خانه‌مان دعوا می‌کنند و یکی زخمی شده');
  await page.waitForSelector('.triage', { timeout: 5000 });
  await page.click('#analyze-btn');
  await page.waitForSelector('[data-action="detail-yes"]');
  assert(await page.locator('.triage, [data-dial]').count() === 0, 'call box on the yes/no page');
  await page.click('[data-action="detail-yes"]');
  await acceptReview();
  await question();
  assert(await page.locator('.triage, [data-dial]').count() === 0, 'call box on an interview question');
});

await step('no page errors', async () => { if (errors.length) throw new Error(errors[0]); });
await browser.close(); mock.close();
console.log(failed ? `${failed} failed` : 'all AI-path browser checks passed');
process.exit(failed ? 1 : 0);
