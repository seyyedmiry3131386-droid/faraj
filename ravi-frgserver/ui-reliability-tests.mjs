// Browser regressions for the complete report lifecycle and interrupted drafts.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {GUIDE_STEPS} from './public/guidance.js';
const base=process.env.RAVI_UI_BASE||'http://127.0.0.1:4173/';
const chrome=process.env.RAVI_UI_CHROME||process.env.PLAYWRIGHT_CHROMIUM;
const browser=await chromium.launch(chrome?{executablePath:chrome}:{});
const failures=[];
async function run(name,fn){try{await fn();console.log('ok - '+name)}catch(error){failures.push(name);console.error('not ok - '+name+': '+error.stack)}}
async function start(context){const p=await context.newPage();await p.goto(base);await p.click('[data-action="new"]');await p.waitForSelector('#description');return p}
async function toReview(p){
 await p.fill('#description','دیروز ظهر در خیابان بهار موتورم را از جلوی مغازه بردند');await p.click('#analyze-btn');await p.waitForSelector('[data-action="detail-no"]');await p.click('[data-action="detail-no"]');await p.waitForSelector('#file-input',{state:'attached'});
}
try{
 await run('local report, identity cancellation, attachment and receipt survive reload',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await start(ctx),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await toReview(p);await p.locator('#file-input').setInputFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF test evidence')});
   await p.waitForFunction(()=>document.body.innerText.includes('evidence.pdf'));await p.click('[data-action="review"]');await p.check('#confirm');await p.click('#submit-report');
   await p.waitForSelector('#reporter-identity-form');await p.click('#reporter-identity-form [data-action="close-modal"]');
   assert.ok(await p.locator('#confirm').isVisible(),'cancelling must leave review intact');
   await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');await p.fill('#rep-name','کاربر آزمایشی');await p.click('[data-action="save-identity"]');
   await p.waitForSelector('.success');const id=(await p.locator('.tracking b').innerText()).trim();assert.match(id,/^RV-/);
   await p.reload();await p.click('[data-action="reports"]');await p.waitForSelector(`[data-report="${id}"]`);await p.click(`[data-report="${id}"]`);
   assert.match(await p.locator('.modal').innerText(),/کاربر آزمایشی/);assert.match(await p.locator('.modal').innerText(),/evidence\.pdf/);
   const [download]=await Promise.all([p.waitForEvent('download'),p.click('[data-action="download-active"]')]);assert.match(download.suggestedFilename(),/\.txt$/);
   assert.deepEqual(errors,[]);
  }finally{await ctx.close()}
 });
 await run('an in-progress offline guide and its unsent answer survive refresh',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await start(ctx);
  try{
   await p.fill('#description','نمیدونم چی بگم');await p.click('#analyze-btn');await p.waitForSelector('#guide-title');
   await p.click('text=خودم دیدم');await p.waitForFunction(title=>document.querySelector('#guide-title')?.textContent.trim()!==title,GUIDE_STEPS[0].title);await p.waitForTimeout(1000);
   await p.click('[data-action="guide-skip"]');await p.waitForFunction(title=>document.querySelector('#guide-title')?.textContent.trim()===title,GUIDE_STEPS.find(x=>x.id==='when').title);
   await p.fill('#guide-input','حدود ظهر');await p.waitForTimeout(900);await p.reload();await p.click('[data-action="draft"]');await p.waitForSelector('#guide-title');
   assert.equal((await p.textContent('#guide-title')).trim(),GUIDE_STEPS.find(x=>x.id==='when').title);assert.equal(await p.inputValue('#guide-input'),'حدود ظهر');
   await p.click('[data-action="guide-next"]');await p.waitForFunction(title=>document.querySelector('#guide-title')?.textContent.trim()===title,GUIDE_STEPS.find(x=>x.id==='where').title);
  }finally{await ctx.close()}
 });
 await run('erasing a draft does not resurrect its old text',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await start(ctx);
  try{await p.fill('#description','شرح آزمایشی برای حذف');await p.waitForTimeout(900);await p.fill('#description','');await p.waitForTimeout(900);await p.reload();assert.equal(await p.locator('[data-action="draft"]').count(),0)}finally{await ctx.close()}
 });
 await run('a second tab cannot silently overwrite a newer draft',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),one=await start(ctx);
  try{
   await one.fill('#description','نسخه اولیه پیش نویس');await one.waitForTimeout(900);
   const two=await ctx.newPage();await two.goto(base);await two.click('[data-action="draft"]');await two.waitForSelector('#description');
   await one.fill('#description','نسخه جدید در پنجره اول');await one.waitForTimeout(900);
   await two.fill('#description','نسخه جداگانه در پنجره دوم');await two.waitForSelector('#storage-alert:not([hidden])');
   assert.match(await two.locator('#storage-alert').innerText(),/پنجرهٔ دیگری/);
   const [saved]=await Promise.all([two.waitForEvent('download'),two.click('[data-action="download-unsaved"]')]);assert.match(saved.suggestedFilename(),/\.txt$/);
   await one.reload();await one.click('[data-action="draft"]');assert.equal(await one.inputValue('#description'),'نسخه جدید در پنجره اول');
  }finally{await ctx.close()}
 });
 await run('a failed local save does not show a false receipt or discard the form',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='reports')throw new DOMException('full','QuotaExceededError');return put.apply(this,args)}});
  const p=await start(ctx);
  try{await toReview(p);await p.click('[data-action="review"]');await p.check('#confirm');await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');await p.click('[data-action="save-identity"]');await p.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('ذخیره انجام نشد'));assert.equal(await p.locator('.success').count(),0);assert.ok(await p.locator('#confirm').isVisible())}finally{await ctx.close()}
 });
}finally{await browser.close()}
if(failures.length){console.error(`${failures.length} reliability check(s) failed`);process.exit(1)}
console.log('All local lifecycle checks passed.');
