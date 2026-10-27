// Integration checks in Chromium with a simulated Bale SDK and simulated device
// permissions. These do not prove the behaviour of the real Bale app, OS
// permission dialogs, a physical microphone, or a real telephone dialer.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {GUIDE_STEPS} from './public/guidance.js';
let chromium;
try { ({chromium}=await import('playwright')); }
catch { console.error('Playwright is required for browser checks; run npm ci first.'); process.exit(1); }

const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
let speechPosts=0,sdkRequests=0;
const srv=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/config')return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ai:false,transcription:false,sttLocal:false}));
 if(pathname==='/api/transcribe'){speechPosts++;return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:'busy',code:'stt_busy'}));}
 if(pathname==='/parent')return res.writeHead(200,{'content-type':'text/html'}).end(`<iframe src="http://localhost:${srv.address().port}/?via=bale" style="width:390px;height:900px"></iframe>`);
 try {
  const file=join(process.cwd(),'public',pathname==='/'?'index.html':pathname);
  const data=await readFile(file);
  res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream'}).end(data);
 } catch {res.writeHead(404).end('not found')}
});
await new Promise(resolve=>srv.listen(0,'0.0.0.0',resolve));
const base=`http://127.0.0.1:${srv.address().port}/`;
const chrome=process.env.RAVI_UI_CHROME||process.env.PLAYWRIGHT_CHROMIUM;
const browser=await chromium.launch(chrome?{executablePath:chrome}:{});
const errors=[];

async function context({mic='allowed',geo='allowed',sdk='allowed'}={}){
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
 await ctx.route('https://tapi.bale.ai/**',route=>{
  sdkRequests++;
  if(sdk==='blocked')return route.abort('failed');
  return route.fulfill({contentType:'text/javascript',body:`
    window.__sdkCalls=[];window.__opened=[];
    window.Bale={WebApp:{isMiniAppSupported:true,
      ready(){window.__sdkCalls.push('ready')}, expand(){window.__sdkCalls.push('expand')},
      openLink(url,opts){window.__opened.push({url,opts,active:navigator.userActivation?.isActive})}}};
    if(location.hash.includes('tgWebApp'))history.replaceState(null,'',location.pathname+location.search);
  `});
 });
 await ctx.addInitScript(({mic,geo})=>{
  window.__deviceCalls={mic:[],geo:[],stops:0};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   getUserMedia(options){
    window.__deviceCalls.mic.push({options,active:navigator.userActivation?.isActive});
    if(mic==='denied')return Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));
    if(mic==='pending')return new Promise(resolve=>{window.__resolveMic=resolve});
    return Promise.resolve({getTracks(){return[{stop(){window.__deviceCalls.stops++}}]}});
   }
  }});
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
   getCurrentPosition(ok,fail,options){
    window.__deviceCalls.geo.push({options,active:navigator.userActivation?.isActive});
    if(geo==='denied')return fail({code:1});
    if(geo==='pending'){window.__resolveGeo=ok;return}
    ok({coords:{latitude:35.123456,longitude:51.654321,accuracy:30}});
   }
  }});
  window.MediaRecorder=class {
   static isTypeSupported(type){return type==='audio/webm;codecs=opus'}
   constructor(){this.state='inactive';this.mimeType='audio/webm;codecs=opus'}
   start(){this.state='recording'}
   stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['voice'],{type:this.mimeType})});this.onstop?.()})}
  };
 },{mic,geo});
 return ctx;
}
async function open(url=base+'?via=bale',opts={}){
 const ctx=await context(opts),page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(String(e)));
 const config=page.waitForResponse(r=>r.url().endsWith('/api/config'));
 await page.goto(url);await config;
 await page.locator('[data-action="new"], [data-action="continue-report"]').first().click();
 await page.waitForSelector('#description');
 return {ctx,page};
}
async function toWhere(page){
 await page.fill('#description','نمیدونم چی بگم');await page.click('#analyze-btn');
 await page.waitForSelector('#guide-title');
 for(const step of GUIDE_STEPS.slice(0,3)){
  assert.equal((await page.textContent('#guide-title')).trim(),step.title);
  await page.click('[data-action="guide-skip"]');
 }
 assert.equal((await page.textContent('#guide-title')).trim(),GUIDE_STEPS.find(s=>s.id==='where').title);
}
async function step(name,fn){await fn();console.log('ok -',name)}

try {
 await step('SDK launches from the official hash or explicit marker and stays absent in an ordinary browser',async()=>{
  let before=sdkRequests,{ctx,page}=await open(base+'#tgWebAppVersion=1.4&tgWebAppPlatform=android');
  await page.waitForFunction(()=>window.__sdkCalls?.includes('ready'));
  assert.equal(sdkRequests,before+1);assert.deepEqual(await page.evaluate(()=>window.__sdkCalls),['ready','expand']);
  assert.ok(await page.locator('[data-action="voice-tab"]').count());await ctx.close();
  before=sdkRequests;({ctx,page}=await open(base));
  assert.equal(sdkRequests,before);assert.equal(await page.evaluate(()=>Boolean(window.Bale)),false);await ctx.close();
 });

 await step('the form and microphone control stay available if the Bale SDK cannot load',async()=>{
  const {ctx,page}=await open(undefined,{sdk:'blocked'});
  await page.click('[data-action="voice-tab"]');assert.ok(await page.isVisible('[data-action="record"]'));
  assert.equal((await page.evaluate(()=>window.__deviceCalls.mic)).length,0);
  await ctx.close();
 });

 await step('microphone access is requested only on the recording tap; recording remains available without STT',async()=>{
  const before=speechPosts,{ctx,page}=await open();
  assert.deepEqual(await page.evaluate(()=>window.__deviceCalls),{mic:[],geo:[],stops:0});
  await page.click('[data-action="voice-tab"]');
  assert.equal((await page.evaluate(()=>window.__deviceCalls.mic)).length,0);
  await page.click('[data-action="record"]');
  await page.waitForFunction(()=>window.__deviceCalls.mic.length===1);
  const mic=await page.evaluate(()=>window.__deviceCalls.mic[0]);
  assert.equal(mic.active,true);assert.ok(mic.options.audio);assert.equal(mic.options.video,undefined);
  await page.click('[data-action="record"]');await page.waitForSelector('.recording-preview');
  assert.equal(await page.evaluate(()=>window.__deviceCalls.stops),1);
  assert.equal(speechPosts,before,'no upload to an unconfigured speech service');
  assert.ok(await page.isVisible('[data-action="download-recording"]'));
  assert.ok(await page.isVisible('[data-action="audio-upload"]'));
  assert.ok(await page.isVisible('[data-action="open-browser"]'));
  await ctx.close();
 });

 await step('denied microphone offers retry, a file chooser and browser fallback',async()=>{
  const {ctx,page}=await open(undefined,{mic:'denied'});
  await page.click('[data-action="voice-tab"]');await page.click('[data-action="record"]');
  await page.waitForSelector('.error-note');assert.match(await page.textContent('.error-note'),/رد یا مسدود/);
  assert.ok(await page.isVisible('[data-action="record"]'));
  const chooserPromise=page.waitForEvent('filechooser');await page.click('[data-action="audio-upload"]');
  const chooser=await chooserPromise;await chooser.setFiles({name:'voice.wav',mimeType:'audio/wav',buffer:Buffer.from('audio')});
  await page.waitForSelector('.recording-preview');
  assert.equal((await page.evaluate(()=>window.__deviceCalls.mic)).length,1);
  assert.ok(await page.isVisible('[data-action="audio-capture"]'));
  assert.ok(await page.isVisible('[data-action="open-browser"]'));await ctx.close();
 });

 await step('pending microphone permission can be cancelled and late tracks are released',async()=>{
  const {ctx,page}=await open(undefined,{mic:'pending'});
  await page.click('[data-action="voice-tab"]');await page.click('[data-action="record"]');
  await page.waitForFunction(()=>Boolean(window.__resolveMic));
  await page.click('[data-action="record"]');
  await page.evaluate(()=>window.__resolveMic({getTracks(){return[{stop(){window.__deviceCalls.stops++}}]}}));
  await page.waitForFunction(()=>window.__deviceCalls.stops===1);
  assert.equal(await page.locator('.recording-preview').count(),0);await ctx.close();
 });

 await step('location is opt-in and appends to the existing guide answer; denial keeps manual entry',async()=>{
  let {ctx,page}=await open();await toWhere(page);
  assert.equal((await page.evaluate(()=>window.__deviceCalls.geo)).length,0);
  await page.fill('#guide-input','نزدیک میدان اصلی');await page.click('[data-action="location"]');
  const value=await page.inputValue('#guide-input');
  assert.match(value,/نزدیک میدان اصلی/);assert.match(value,/35\.12346, 51\.65432/);
  const call=await page.evaluate(()=>window.__deviceCalls.geo[0]);assert.equal(call.active,true);assert.equal(call.options.maximumAge,0);
  await ctx.close();
  ({ctx,page}=await open(undefined,{geo:'denied'}));await toWhere(page);
  await page.fill('#guide-input','نشانی دستی');await page.click('[data-action="location"]');
  assert.match(await page.textContent('#toast'),/رد یا مسدود/);assert.equal(await page.inputValue('#guide-input'),'نشانی دستی');
  await page.click('[data-action="open-browser"]');
  const opened=(await page.evaluate(()=>window.__opened)).at(-1);
  assert.equal(opened.url,base);assert.equal(opened.active,true);
  assert.match(await page.textContent('#toast'),/منتقل نشوند/);
  await ctx.close();
 });

 await step('a late geolocation result cannot overwrite a different question',async()=>{
  const {ctx,page}=await open(undefined,{geo:'pending'});await toWhere(page);
  await page.click('[data-action="location"]');await page.waitForFunction(()=>Boolean(window.__resolveGeo));
  await page.click('[data-action="guide-skip"]');
  await page.evaluate(()=>window.__resolveGeo({coords:{latitude:35,longitude:51,accuracy:10}}));
  assert.match(await page.textContent('#toast'),/صفحه عوض شد/);
  assert.doesNotMatch(await page.inputValue('#guide-input'),/35\.00000/);await ctx.close();
 });

 await step('file and camera selection are user-activated and only selected files are read',async()=>{
  const {ctx,page}=await open();
  await page.fill('#description','دیروز موتورم را از مقابل خانه دزدیدند');await page.click('#analyze-btn');
  await page.waitForSelector('[data-action="detail-no"]');await page.click('[data-action="detail-no"]');
  await page.waitForSelector('#dropzone');
  let pending=page.waitForEvent('filechooser');await page.click('#dropzone');let chooser=await pending;
  assert.equal(chooser.isMultiple(),true);
  await chooser.setFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('sample')});
  await page.waitForSelector('.file-item');assert.match(await page.textContent('.file-item'),/evidence\.pdf/);
  assert.equal(await page.getAttribute('#photo-capture','capture'),'environment');
  pending=page.waitForEvent('filechooser');await page.locator('.camera-picker').click();chooser=await pending;
  await chooser.setFiles({name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fake image')});
  await page.waitForFunction(()=>document.querySelectorAll('.file-item').length===2);
  assert.equal((await page.evaluate(()=>window.__deviceCalls.mic)).length,0);
  assert.equal((await page.evaluate(()=>window.__deviceCalls.geo)).length,0);await ctx.close();
 });

 await step('emergency taps preserve tel: native default and always show browser/manual fallback',async()=>{
  const {ctx,page}=await open();await page.waitForFunction(()=>window.__sdkCalls?.includes('ready'));
  // A test listener prevents the OS launch AFTER recording whether application
  // code suppressed the event; no real emergency call is attempted.
  await page.evaluate(()=>document.addEventListener('click',e=>{
   const a=e.target.closest('[data-dial]');if(!a)return;
   (window.__dialClicks??=[]).push({href:a.getAttribute('href'),prevented:e.defaultPrevented,active:navigator.userActivation?.isActive});
   e.preventDefault();
  }));
  const cases=[['110','دیروز موتورم را از جلوی خانه دزدیدند'],['115','یک نفر بیهوش شده و نیاز به اورژانس دارد'],['125','الان آتش سوزی و دود غلیظ در ساختمان است'],['123','فردی خودکشی کرده و به کمک نیاز دارد']];
  for(const [n,text] of cases){
   await page.fill('#description',text);
   const link=page.locator(`.triage-numbers a[href="tel:${n}"]`);await link.waitFor({state:'visible'});
   await link.click();assert.ok(await page.isVisible('#triage-fallback'));assert.match(await page.textContent('#triage-fallback'),/دستی/);
   const seen=(await page.evaluate(()=>window.__dialClicks)).at(-1);
   assert.deepEqual(seen,{href:`tel:${n}`,prevented:false,active:true});
   await page.locator(`[data-dial-browser="${n}"]`).click();
   const opened=(await page.evaluate(()=>window.__opened)).at(-1);
   assert.equal(opened.url,`${base}call.html?n=${n}`);assert.equal(opened.active,true);assert.equal(opened.opts.try_instant_view,false);
  }
  await ctx.close();
 });

 await step('external call page allows only emergency numbers and never redirects automatically',async()=>{
  const ctx=await context(),page=await ctx.newPage();
  for(const n of ['110','115','125','123','112']){
   await page.goto(`${base}call.html?n=${n}`);assert.equal(await page.getAttribute('#call','href'),`tel:${n}`);
   assert.ok(await page.isVisible('#call'));assert.ok(page.url().startsWith(`${base}call.html`));
  }
  await page.goto(`${base}call.html?n=09121234567`);
  assert.equal(await page.getAttribute('#call','href'),null);assert.equal(await page.isVisible('#call'),false);
  assert.match(await page.textContent('#help'),/معتبر/);await ctx.close();
 });

 await step('cross-origin iframe policy denial gives a fallback without requesting the microphone',async()=>{
  const ctx=await context(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'parent');
  const child=page.frames().find(f=>f.url().includes('?via=bale'));assert.ok(child,'iframe loaded');
  await child.waitForURL('**/?via=bale');
  assert.equal(await child.evaluate(()=>document.featurePolicy?.allowsFeature('microphone')),false);
  assert.equal(await child.evaluate(()=>document.featurePolicy?.allowsFeature('geolocation')),false);
  await child.locator('[data-action="new"]').click();await child.locator('[data-action="voice-tab"]').click();await child.locator('[data-action="record"]').click();
  assert.match(await child.locator('.error-note').innerText(),/این پنجره/);
  assert.equal((await child.evaluate(()=>window.__deviceCalls.mic)).length,0);
  assert.ok(await child.locator('[data-action="open-browser"]').isVisible());
  await child.locator('[data-action="text-tab"]').click();await toWhere(child);
  await child.locator('[data-action="location"]').click();
  assert.match(await child.locator('#toast').innerText(),/این پنجره/);
  assert.equal((await child.evaluate(()=>window.__deviceCalls.geo)).length,0);
  await ctx.close();
 });

 assert.deepEqual(errors,[]);console.log('All simulated mini-app checks passed.');
} finally {
 await browser.close();await new Promise(resolve=>srv.close(resolve));
}
