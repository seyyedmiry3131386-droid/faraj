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
async function fillIdentity(p){
 for(const [id,value] of Object.entries({name:'کاربر آزمایشی',province:'تهران',mobile:'۹۱۲۳۴۵۶۷۸۹',rank:'رده آزمایشی',post:'سمت آزمایشی'}))await p.fill(`#rep-${id}`,value);
}
try{
 await run('local report, identity cancellation, attachment and receipt survive reload',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await start(ctx),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{
   await toReview(p);await p.locator('#file-input').setInputFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF test evidence')});
   await p.waitForFunction(()=>document.body.innerText.includes('evidence.pdf'));await p.click('[data-action="review"]');await p.check('#confirm');await p.click('#submit-report');
   await p.waitForSelector('#reporter-identity-form');await p.click('#reporter-identity-form [data-action="close-modal"]');
   assert.ok(await p.locator('#confirm').isVisible(),'cancelling must leave review intact');
   await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');await fillIdentity(p);await p.click('[data-action="save-identity"]');
   await p.waitForSelector('.success');const id=(await p.locator('.tracking b').innerText()).trim();assert.match(id,/^RV-/);
   assert.equal(await p.locator('.success [data-action="new"]').evaluate(el=>el.classList.contains('secondary')&&!el.classList.contains('plain')),true);
   assert.doesNotMatch(await p.locator('.success').innerText(),/به نهاد دیگری ارسال نشده|پاک‌کردن داده‌های مرورگر/);
   await p.reload();await p.click('[data-action="reports"]');await p.waitForSelector(`[data-report="${id}"]`);await p.click(`[data-report="${id}"]`);
   assert.match(await p.locator('.modal').innerText(),/کاربر آزمایشی/);assert.match(await p.locator('.modal').innerText(),/evidence\.pdf/);
   const [download]=await Promise.all([p.waitForEvent('download'),p.click('[data-action="download-active"]')]);assert.match(download.suggestedFilename(),/\.txt$/);
   assert.deepEqual(errors,[]);
  }finally{await ctx.close()}
 });
 await run('identity fields are aligned, labelled and keyboard-accessible on mobile and desktop',async()=>{
  for(const [width,height] of [[320,568],[390,844],[1024,800]]){
   const ctx=await browser.newContext({viewport:{width,height}}),p=await start(ctx),errors=[];p.on('pageerror',e=>errors.push(e.message));
   try{
    await toReview(p);await p.click('[data-action="review"]');await p.check('#confirm');await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');
    for(const [id,label] of [['rep-name','نام و نام خانوادگی'],['rep-province','استان'],['rep-mobile','شماره همراه'],['rep-rank','عنوان رده'],['rep-post','عنوان سمت']]){
     const input=p.locator(`#${id}`);assert.equal(await input.count(),1);assert.equal(await input.evaluate(el=>el.labels?.[0]?.innerText.trim()),label);
     const b=await input.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1,`${width}: ${id} outside viewport`);assert.ok(b.height>=44,`${width}: ${id} too short`);
    }
    const grid=await p.locator('.identity-fields').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(grid,width<=520?1:2);
    const buttons=await p.locator('.identity-actions button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y}}));
    assert.equal(buttons.length,2);assert.ok(buttons.every(b=>b.x>=0&&b.right<=width+1));assert.ok(Math.abs(buttons[0].y-buttons[1].y)<1);
    assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'بستن');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement?.id),'rep-name');
    assert.doesNotMatch(await p.locator('#reporter-identity-form').innerText(),/تکمیل این اطلاعات اختیاری است/);
    assert.match(await p.locator('#reporter-identity-form').innerText(),/تکمیل همه کادرها.*الزامی است/);
    await p.click('[data-action="save-identity"]');assert.match(await p.locator('#identity-error').innerText(),/نام و نام خانوادگی/);assert.equal(await p.locator('.success').count(),0);
    await fillIdentity(p);
    for(const [id,label] of [['name','نام و نام خانوادگی'],['province','استان'],['rank','عنوان رده'],['post','عنوان سمت']]){
     const input=p.locator(`#rep-${id}`),value=await input.inputValue();await input.fill('  ');await p.click('[data-action="save-identity"]');
     assert.match(await p.locator('#identity-error').innerText(),new RegExp(label));assert.equal(await input.getAttribute('aria-invalid'),'true');await input.fill(value);
    }
    for(const invalid of ['912345678','09123456789']){
     await p.fill('#rep-mobile',invalid);assert.equal(await p.inputValue('#rep-mobile'),invalid,'extra pasted digits must not be truncated');
     await p.click('[data-action="save-identity"]');assert.match(await p.locator('#identity-error').innerText(),/دقیقاً ۱۰ رقم/);assert.equal(await p.locator('.success').count(),0);
    }
    await p.fill('#rep-mobile','۹۱۲x۳۴۵۶۷۸۹');assert.equal(await p.inputValue('#rep-mobile'),'9123456789');assert.match(await p.locator('#identity-error').innerText(),/فقط باید شامل عدد/);
    await p.click('[data-action="save-identity"]');await p.waitForSelector('.success');
    assert.deepEqual(errors,[]);
   }finally{await ctx.close()}
  }
 });
 await run('an old draft marked confirmed cannot bypass the required identity',async()=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),p=await start(ctx);
  try{
   await toReview(p);await p.click('[data-action="review"]');await p.waitForSelector('#confirm');await p.waitForTimeout(900);
   await p.evaluate(()=>new Promise((resolve,reject)=>{
    const open=indexedDB.open('ravi-v1',1);open.onerror=()=>reject(open.error);open.onsuccess=()=>{
     const db=open.result,t=db.transaction('drafts','readwrite'),store=t.objectStore('drafts'),get=store.get('current');
     get.onsuccess=()=>{const d=get.result;d.identityConfirmed=true;d.reporter={name:'نام قدیمی',province:'',mobile:'09123456789',rank:'',post:''};store.put(d,'current')};
     t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>reject(t.error);
    };
   }));
   await p.reload();await p.click('[data-action="draft"]');await p.waitForSelector('#confirm');await p.check('#confirm');await p.click('#submit-report');
   await p.waitForSelector('#reporter-identity-form');assert.equal(await p.inputValue('#rep-mobile'),'09123456789');
   await p.click('[data-action="save-identity"]');assert.equal(await p.locator('.success').count(),0);assert.match(await p.locator('#identity-error').innerText(),/استان/);
   await fillIdentity(p);await p.click('[data-action="save-identity"]');await p.waitForSelector('.success');
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
  try{await toReview(p);await p.click('[data-action="review"]');await p.check('#confirm');await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');await fillIdentity(p);await p.click('[data-action="save-identity"]');await p.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('ذخیره انجام نشد'));assert.equal(await p.locator('.success').count(),0);assert.ok(await p.locator('#confirm').isVisible())}finally{await ctx.close()}
 });
}finally{await browser.close()}
if(failures.length){console.error(`${failures.length} reliability check(s) failed`);process.exit(1)}
console.log('All local lifecycle checks passed.');
