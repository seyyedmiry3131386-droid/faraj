import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,mkdir,symlink,stat,realpath,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import Database from 'better-sqlite3';
import {CentralStore} from './central-store.mjs';
import {createCentral} from './central-http.mjs';
import {dataKey,fromBase32,totpAt,verifyBaleInitData,verifyTotp} from './central-crypto.mjs';

const BOT='123456789:local-test-token-only';
function signed({id=12345,userJSON,when=Math.floor(Date.now()/1000),token=BOT}={}){
 const p=new URLSearchParams({auth_date:String(when),query_id:'test',user:userJSON??JSON.stringify({id,first_name:'Test'})});
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));return p.toString();
}

test('Bale initData rejects tampering, duplicate parameters, old and future signatures',()=>{
 const valid=signed();assert.equal(verifyBaleInitData(valid,BOT)?.id,'12345');
 assert.equal(verifyBaleInitData(signed({userJSON:'{"id":9007199254740993}'}),BOT)?.id,'9007199254740993');
 assert.equal(verifyBaleInitData(signed({userJSON:'{"id":9007199254740992}'}),BOT)?.id,'9007199254740992');
 // Fixed vector generated independently with Python hmac/hashlib.
 const vector='auth_date=1760000000&query_id=vector&user=%7B%22id%22%3A9007199254740993%2C%22first_name%22%3A%22%D8%B9%D9%84%DB%8C%22%7D&hash=36b60433bfae390e44fefc8a8074cc56292643f42a86624ed1f578d0bddb5a40';
 assert.equal(verifyBaleInitData(vector,BOT,{now:1760000000000})?.id,'9007199254740993');
 assert.equal(verifyBaleInitData(valid.replace('12345','12346'),BOT),null);
 assert.equal(verifyBaleInitData(valid+'&auth_date=1',BOT),null);
 assert.equal(verifyBaleInitData(signed({when:1}),BOT),null);
 assert.equal(verifyBaleInitData(signed({when:Math.floor(Date.now()/1000)+1000}),BOT),null);
 assert.equal(verifyBaleInitData(valid,'different token'),null);
});

test('TOTP accepts a valid timestep once, rejects bad codes, and encryption keys must be 32 bytes',()=>{
 const secret=Buffer.from('12345678901234567890'),now=59000,step=1,code=totpAt(secret,step);
 assert.equal(code,'287082');assert.equal(verifyTotp(secret,code,{now}),step);
 assert.equal(verifyTotp(secret,code,{now,lastStep:step}),null);
 assert.equal(verifyTotp(secret,'000000',{now}),null);
 assert.throws(()=>dataKey('insecure'));assert.equal(dataKey(randomBytes(32).toString('base64')).length,32);
});

test('central storage rejects a symlink into public assets without changing permissions',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ravi-symlink-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const publicDir=path.join(root,'public'),link=path.join(root,'alias');await mkdir(publicDir,{mode:0o755});await symlink(publicDir,link,'dir');
 const mode=(await stat(publicDir)).mode,realPublic=await realpath(publicDir);
 assert.throws(()=>createCentral({APP_ORIGIN:'https://report.example',ADMIN_ORIGIN:'https://staff.example',CENTRAL_DATA_DIR:link,CENTRAL_DATA_KEY:randomBytes(32).toString('base64'),BALE_BOT_TOKEN:BOT},{publicRoot:realPublic}),/outside public assets/);
 assert.equal((await stat(publicDir)).mode,mode);
});

test('central intake, idempotency, isolated staff authentication, audit and encrypted files',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ravi-central-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const rawKey=randomBytes(32),key=rawKey.toString('base64');
 const initial=new CentralStore(dir,rawKey);const seed=await initial.addStaff('reviewer.one','a long test password only','reviewer');const adminSeed=await initial.addStaff('admin.one','another long test password','admin');initial.close();
 assert.throws(()=>new CentralStore(dir,randomBytes(32)),/does not match/);
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',APP_ORIGIN:'http://report.localhost',ADMIN_ORIGIN:'http://staff.localhost',CENTRAL_ALLOW_INSECURE_DEV:'1',CENTRAL_ENABLED:'1',CENTRAL_DATA_DIR:dir,CENTRAL_DATA_KEY:key,BALE_BOT_TOKEN:BOT},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill('SIGTERM'));
 const port=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(new Error('server startup timeout')),10000);child.stdout.on('data',v=>{out+=v;const m=out.match(/loopback:(\d+)/);if(m){clearTimeout(timer);resolve(+m[1])}});child.stderr.on('data',v=>{out+=v});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}: ${out}`))})});
 const base=`http://127.0.0.1:${port}`;
 const send=async(url,{admin=false,headers={},body,method='GET'}={})=>{
  if(body instanceof FormData){const encoded=new Request(base+url,{method:'POST',body});headers={'Content-Type':encoded.headers.get('content-type'),...headers};body=Buffer.from(await encoded.arrayBuffer())}
  return await new Promise((resolve,reject)=>{
   const req=http.request({host:'127.0.0.1',port,path:url,method,headers:{Host:admin?'staff.localhost':'report.localhost',...headers}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
   });req.on('error',reject);req.end(body);
  });
 };
 const host='http://report.localhost',staffHost='http://staff.localhost',init=signed(),submission=randomUUID();
 assert.equal((await (await send('/api/config')).json()).central,true);
 assert.equal((await send('/api/check',{method:'POST',headers:{Origin:host,'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.notEqual((await send('/api/check',{method:'POST',headers:{Origin:host,'Content-Type':'application/json','X-Bale-Init-Data':init},body:'{}'})).status,401);
 const upload=(text='شرح گزارش آزمایشی')=>{const form=new FormData();form.append('report',JSON.stringify({title:'سرقت',text,answers:{when:'دیروز'},verifiedBaleId:'999999'}));form.append('files',new Blob(['sensitive attachment contents'],{type:'application/pdf'}),'مدرک-آزمایشی.pdf');return form};
 const post=(body,extra={})=>send('/api/central/reports',{method:'POST',headers:{Origin:host,'X-Bale-Init-Data':init,'X-Submission-Key':submission,...extra},body});
 assert.equal((await send('/api/central/reports',{method:'POST',headers:{Origin:host,'X-Bale-Init-Data':'forged','X-Submission-Key':submission},body:upload()})).status,401);
 assert.equal((await post(upload(),{Origin:'http://attacker.invalid'})).status,403);
 const many=count=>{const form=new FormData();form.append('report',JSON.stringify({title:'آزمون',text:'گزارش ساختگی'}));for(let i=0;i<count;i++)form.append('files',new Blob(['x'],{type:'application/pdf'}),`file${i}.pdf`);return form};
 const tenKey=randomUUID();const ten=await send('/api/central/reports',{method:'POST',headers:{Origin:host,'X-Bale-Init-Data':init,'X-Submission-Key':tenKey},body:many(10)});assert.equal(ten.status,201,'exactly ten files must be accepted');
 const eleven=await post(many(11));assert.equal(eleven.status,413,'eleven files must be rejected');
 const invalid=new FormData();invalid.append('report',JSON.stringify({title:'آزمون',text:'گزارش ساختگی'}));invalid.append('files',new Blob(['x'],{type:'text/plain'}),'script.sh');
 assert.equal((await post(invalid)).status,400,'unsupported attachments must be rejected');
 // Hold two streaming uploads open to exercise admission and cleanup after a
 // dropped client. No user or production data is involved.
 const holding=[];t.after(()=>holding.forEach(req=>req.destroy()));
 const hold=key=>{
  const req=http.request({host:'127.0.0.1',port,path:'/api/central/reports',method:'POST',headers:{Host:'report.localhost',Origin:host,'X-Bale-Init-Data':init,'X-Submission-Key':key,'Content-Type':'multipart/form-data; boundary=ravi-hold'}});
  req.on('error',()=>{});req.write('--ravi-hold\r\nContent-Disposition: form-data; name="report"\r\n\r\n{"title":"test","text":"synthetic report"}\r\n--ravi-hold\r\nContent-Disposition: form-data; name="files"; filename="hold.pdf"\r\nContent-Type: application/pdf\r\n\r\npartial');holding.push(req);return req;
 };
 const heldKeys=[randomUUID(),randomUUID()];heldKeys.forEach(hold);
 const stateOf=async key=>(await (await send(`/api/central/status?key=${key}`,{headers:{'X-Bale-Init-Data':init}})).json()).state;
 const waitFor=async(expected)=>{const end=Date.now()+5000;while(Date.now()<end){const states=await Promise.all(heldKeys.map(stateOf));if(states.every(x=>x===expected))return;await new Promise(r=>setTimeout(r,20))}throw new Error(`uploads did not reach ${expected}`)};
 await waitFor('processing');
 assert.equal((await send('/api/central/reports',{method:'POST',headers:{Origin:host,'X-Bale-Init-Data':init,'X-Submission-Key':heldKeys[0]},body:upload()})).status,409);
 const busy=await post(upload());assert.equal(busy.status,503);assert.equal((await busy.json()).code,'busy');
 holding.forEach(req=>req.destroy());await waitFor('missing');assert.deepEqual(await readdir(path.join(dir,'incoming')),[],'aborted temporary uploads must be removed');
 const first=await post(upload());assert.equal(first.status,201);const received=await first.json();assert.match(received.id,/^RV-[A-F0-9]{32}$/);assert.equal(received.duplicate,false);
 const repeat=await post(upload());assert.equal(repeat.status,200);assert.deepEqual(await repeat.json(),{id:received.id,duplicate:true});
 const conflict=await post(upload('شرح متفاوت برای همان شناسه'));assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'submission_conflict');
 const status=await send(`/api/central/status?key=${submission}`,{headers:{'X-Bale-Init-Data':init}});assert.deepEqual(await status.json(),{state:'accepted',id:received.id});
 const other=await send(`/api/central/status?key=${submission}`,{headers:{'X-Bale-Init-Data':signed({id:222})}});assert.equal((await other.json()).state,'missing');
 const adminPage=await send('/',{admin:true});assert.equal(adminPage.status,200);assert.match(adminPage.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal((await send('/',{headers:{Host:'unexpected.localhost'}})).status,421);
 assert.equal((await send('/__selecttest.html')).status,404);
 assert.equal((await send('/staff.js')).status,404);
 assert.equal((await send('/api/staff/reports',{admin:true})).status,401);
 const otp=totpAt(fromBase32(seed),Math.floor(Date.now()/30000));
 const login=await send('/api/staff/login',{admin:true,method:'POST',headers:{Origin:staffHost,'Content-Type':'application/json'},body:JSON.stringify({username:'reviewer.one',password:'a long test password only',otp})});
 assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const authHeaders={Cookie:cookie};
 const list=await send('/api/staff/reports',{admin:true,headers:authHeaders});assert.equal((await list.json()).items[0].id,received.id);
 const detail=await send('/api/staff/reports/'+received.id,{admin:true,headers:authHeaders});const d=await detail.json();assert.equal(d.report.text,'شرح گزارش آزمایشی');assert.equal(d.report.verifiedBaleId,'12345');assert.equal(d.files[0].name,'مدرک-آزمایشی.pdf');
 assert.equal((await send('/api/staff/audit',{admin:true,headers:authHeaders})).status,403);
 const adminLogin=await send('/api/staff/login',{admin:true,method:'POST',headers:{Origin:staffHost,'Content-Type':'application/json'},body:JSON.stringify({username:'admin.one',password:'another long test password',otp:totpAt(fromBase32(adminSeed),Math.floor(Date.now()/30000))})});
 assert.equal(adminLogin.status,200);const adminCookie=adminLogin.headers.get('set-cookie').split(';')[0];
 const audit=await send('/api/staff/audit',{admin:true,headers:{Cookie:adminCookie}});assert.equal(audit.status,200);assert.ok((await audit.json()).items.some(item=>item.action==='report_opened'));
 const noCsrf=await send(`/api/staff/reports/${received.id}/status`,{admin:true,method:'POST',headers:{...authHeaders,Origin:staffHost,'Content-Type':'application/json'},body:JSON.stringify({status:'closed'})});assert.equal(noCsrf.status,403);
 const update=await send(`/api/staff/reports/${received.id}/status`,{admin:true,method:'POST',headers:{...authHeaders,Origin:staffHost,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:JSON.stringify({status:'in_review'})});assert.equal(update.status,200);
 const file=await send(`/api/staff/reports/${received.id}/files/0`,{admin:true,headers:authHeaders});assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'application/octet-stream');assert.equal(await file.text(),'sensitive attachment contents');
 const db=new Database(path.join(dir,'reports.sqlite3'),{readonly:true});const row=db.prepare('SELECT payload FROM reports WHERE id=?').get(received.id);assert.equal(Buffer.from(row.payload).includes(Buffer.from('شرح گزارش آزمایشی')),false);assert.ok(db.prepare('SELECT count(*) AS n FROM audit').get().n>=4);db.close();
 const filePath=path.join(dir,'objects',received.id,'0.bin'),encrypted=await readFile(filePath);assert.equal(encrypted.includes(Buffer.from('sensitive attachment contents')),false);encrypted[0]^=1;await writeFile(filePath,encrypted);
 const corrupted=await send(`/api/staff/reports/${received.id}/files/0`,{admin:true,headers:authHeaders});assert.equal(corrupted.status,500);assert.equal((await corrupted.json()).code,'central_error');
 const replay=await send('/api/staff/login',{admin:true,method:'POST',headers:{Origin:staffHost,'Content-Type':'application/json'},body:JSON.stringify({username:'reviewer.one',password:'a long test password only',otp})});assert.equal(replay.status,401);
 const logout=await send('/api/staff/logout',{admin:true,method:'POST',headers:{...authHeaders,Origin:staffHost,'X-CSRF-Token':session.csrf,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);assert.equal((await send('/api/staff/reports',{admin:true,headers:authHeaders})).status,401);
});
