// HTTPS browser integration with a simulated Bale SDK, signed test initData,
// the real Node central service, SQLite, encrypted files and staff interface.
// This does not claim to be a test of a real Bale client or production host.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createHmac,randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {CentralStore} from './central-store.mjs';
import {fromBase32,totpAt} from './central-crypto.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'ravi-central-ui-'));
let child,proxy,browser;
try{
 const cert=path.join(dir,'cert.pem'),privateKey=path.join(dir,'key.pem');
 const gen=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',privateKey,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:report.localhost,DNS:staff.localhost'],{stdio:'ignore'});
 if(gen.status!==0)throw new Error('openssl could not create the temporary test certificate');
 const key=randomBytes(32),bot='123456789:synthetic-test-only-token';
 const store=new CentralStore(path.join(dir,'data'),key);const seed=await store.addStaff('reviewer.one','an integration test password','reviewer');const adminSeed=await store.addStaff('admin.one','an admin test password','admin');store.close();
 let upstreamPort=0;
 proxy=https.createServer({key:await readFile(privateKey),cert:await readFile(cert)},(req,res)=>{
  const upstream=http.request({host:'127.0.0.1',port:upstreamPort,path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
 });
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 const port=proxy.address().port,app=`https://report.localhost:${port}`,admin=`https://staff.localhost:${port}`;
 child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',APP_ORIGIN:app,ADMIN_ORIGIN:admin,CENTRAL_ENABLED:'1',CENTRAL_DATA_DIR:path.join(dir,'data'),CENTRAL_DATA_KEY:key.toString('base64'),BALE_BOT_TOKEN:bot,OPENAI_API_KEY:'',ANTHROPIC_API_KEY:'',LLM_URL:'',LLM_MODEL:'',STT_URL:''},stdio:['ignore','pipe','pipe']});
 upstreamPort=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('server startup timeout')),10000);child.stdout.on('data',s=>{output+=s;const m=output.match(/loopback:(\d+)/);if(m){clearTimeout(timer);resolve(+m[1])}});child.stderr.on('data',s=>output+=s);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}: ${output}`))})});
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),query_id:'synthetic',user:JSON.stringify({id:4711,first_name:'Test'})});
 const check=[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(bot).digest();params.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
 const executablePath=process.env.RAVI_UI_CHROME||process.env.PLAYWRIGHT_CHROMIUM;
 browser=await chromium.launch(executablePath?{executablePath}:{});
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},acceptDownloads:true});
 await context.route('https://tapi.bale.ai/miniapp.js',route=>route.fulfill({contentType:'text/javascript',body:`window.Bale={WebApp:{initData:${JSON.stringify(params.toString())},isMiniAppSupported:true,ready(){},expand(){},openLink(){}}};`}));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 // This goes through the real production headers, including public CSP.
 const dial=await context.newPage();dial.on('pageerror',e=>errors.push(e.message));await dial.goto(app+'/call.html?n=110');assert.equal(await dial.locator('#call').getAttribute('href'),'tel:110');await dial.close();
 await p.goto(app+'/?via=bale');await p.waitForFunction(()=>window.Bale?.WebApp?.initData);await p.click('[data-action="new"]');await p.waitForSelector('#description');
 await p.fill('#description','دیروز ظهر در خیابان بهار موتورم را از جلوی مغازه بردند');await p.click('#analyze-btn');await p.waitForSelector('[data-action="detail-no"]');await p.click('[data-action="detail-no"]');await p.waitForSelector('#file-input',{state:'attached'});
 await p.locator('#file-input').setInputFiles({name:'مدرک-آزمایشی.pdf',mimeType:'application/pdf',buffer:Buffer.from('confidential test evidence')});await p.waitForFunction(()=>document.body.innerText.includes('مدرک-آزمایشی.pdf'));
 await p.click('[data-action="review"]');assert.match(await p.locator('.storage-note').last().innerText(),/کارتابل مرکزی/);await p.check('#confirm');await p.click('#submit-report');await p.waitForSelector('#reporter-identity-form');await p.fill('#rep-name','کاربر آزمایشی');
 let posts=0;
 const drop=async route=>{
  posts++;const request=route.request(),headers=await request.allHeaders();
  const status=await new Promise((resolve,reject)=>{
   const out=http.request({host:'127.0.0.1',port:upstreamPort,path:'/api/central/reports',method:'POST',headers:{...headers,host:`report.localhost:${port}`,'x-forwarded-proto':'https'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
   out.on('error',reject);out.end(request.postDataBuffer());
  });
  assert.equal(status,201);await route.abort('failed');
 };
 await p.route('**/api/central/reports',drop);await p.click('[data-action="save-identity"]');await p.waitForSelector('[data-action="retry-central"]');
 await p.waitForFunction(()=>document.querySelector('.error-note')?.textContent.includes('ارتباط قطع شد'),null,{timeout:15000});
 // A response lost after commit is resolved using the same durable key, even
 // after a page reload; a second report upload must not be sent.
 await p.reload();await p.click('[data-action="draft"]');await p.waitForSelector('[data-action="retry-central"]');await p.unroute('**/api/central/reports',drop);await p.click('[data-action="retry-central"]');await p.waitForSelector('.success');
 const receipt=(await p.locator('.tracking b').innerText()).trim();assert.match(receipt,/^RV-[A-F0-9]{32}$/);assert.equal(posts,1);assert.match(await p.locator('.success').innerText(),/سامانهٔ مرکزی/);
 const db=new Database(path.join(dir,'data','reports.sqlite3'),{readonly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM reports').get().n,1);db.close();
 console.log('ok - signed Bale report reaches central storage once, even when its first response is lost');
 const staffContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1100,height:800},acceptDownloads:true}),sp=await staffContext.newPage();sp.on('pageerror',e=>errors.push(e.message));
 await sp.clock.install();await sp.goto(admin);await sp.waitForSelector('#login-panel:not([hidden])');await sp.fill('#username','reviewer.one');await sp.fill('#password','an integration test password');await sp.fill('#otp',totpAt(fromBase32(seed),Math.floor(Date.now()/30000)));await sp.click('#login-form button');
 await sp.waitForSelector('#inbox:not([hidden])');await sp.waitForFunction(id=>document.querySelector('#list')?.textContent.includes(id),receipt);await sp.click('#list button');await sp.waitForSelector('#detail:not([hidden])');
 assert.match(await sp.locator('#report-text').innerText(),/موتورم/);assert.match(await sp.locator('#report-answers').innerText(),/کاربر آزمایشی/);assert.match(await sp.locator('#report-answers').innerText(),/4711/);
 assert.equal(await sp.locator('#audit-button').isVisible(),false);
 const fileResponse=await sp.evaluate(async p=>{const r=await fetch(p);return {status:r.status,disposition:r.headers.get('content-disposition')}},`/api/staff/reports/${receipt}/files/0`);
 assert.equal(fileResponse.status,200);assert.match(fileResponse.disposition,/filename\*=UTF-8''%D9%85/);assert.equal(await sp.locator('#report-files a').getAttribute('download'),'مدرک-آزمایشی.pdf');
 // The serverless headless Chromium used here reports the generic name
 // "download" even for a minimal network download with a correct header.
 // Verify header/anchor and contents; real-device filename behavior is separate.
 const [download]=await Promise.all([sp.waitForEvent('download'),sp.click('#report-files a')]);assert.equal((await readFile(await download.path())).toString(),'confidential test evidence');
 await sp.selectOption('#status','in_review');await sp.click('#status-form button');await sp.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('وضعیت ثبت شد'));
 const [idleLogout]=await Promise.all([sp.waitForResponse(r=>r.url().endsWith('/api/staff/logout')),sp.clock.fastForward(30*60*1000+1)]);
 assert.equal(idleLogout.status(),200);await sp.waitForSelector('#login-panel:not([hidden])');assert.equal(await sp.locator('#report-text').innerText(),'');
 console.log('ok - named staff logs in, reads and updates the report; idle expiry clears and revokes the session');
 await sp.fill('#username','admin.one');await sp.fill('#password','an admin test password');await sp.fill('#otp',totpAt(fromBase32(adminSeed),Math.floor(Date.now()/30000)));await sp.click('#login-form button');
 await sp.waitForSelector('#inbox:not([hidden])');await sp.fill('#report-id',receipt);await sp.click('#find-report button');await sp.waitForSelector('#detail:not([hidden])');
 assert.match(await sp.locator('#report-text').innerText(),/موتورم/);await sp.click('#audit-button');await sp.waitForSelector('#audit-panel:not([hidden])');assert.match(await sp.locator('#audit-list').innerText(),/report_opened/);
 await sp.click('#logout');await sp.waitForSelector('#login-panel:not([hidden])');
 assert.equal(await sp.locator('#audit-panel').isVisible(),false);assert.equal(await sp.locator('#audit-list').innerText(),'');assert.equal(await sp.locator('#report-text').innerText(),'');
 assert.deepEqual(errors,[]);
 console.log('ok - admin searches by receipt, sees restricted audit, and logout clears sensitive content');
 await context.close();await staffContext.close();
}finally{
 await browser?.close();child?.kill('SIGTERM');await new Promise(resolve=>proxy?proxy.close(resolve):resolve());await rm(dir,{recursive:true,force:true});
}
console.log('All simulated central browser checks passed.');
