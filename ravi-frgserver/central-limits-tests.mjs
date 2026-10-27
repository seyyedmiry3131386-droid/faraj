// Optional disk-intensive HTTP boundary regression: writes ~200 MiB of
// synthetic data through the real streaming intake. Not a capacity benchmark.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {once} from 'node:events';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BOT='123456789:synthetic-limit-test-token',LIMIT=100*1024*1024;
function signed(){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123})});
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(BOT).digest();p.set('hash',createHmac('sha256',key).update(check).digest('hex'));return p.toString();
}
test('central streaming accepts exactly 100 MiB and rejects 100 MiB plus one byte',{timeout:120000},async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'ravi-limits-test-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',APP_ORIGIN:'http://report.localhost',ADMIN_ORIGIN:'http://staff.localhost',CENTRAL_ENABLED:'1',CENTRAL_ALLOW_INSECURE_DEV:'1',CENTRAL_DATA_DIR:root,CENTRAL_DATA_KEY:randomBytes(32).toString('base64'),BALE_BOT_TOKEN:BOT},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{child.kill('SIGTERM');if(child.exitCode===null)await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);await rm(root,{recursive:true,force:true})});
 const port=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.stdout.on('data',x=>{output+=x;const m=output.match(/loopback:(\d+)/);if(m){clearTimeout(timer);resolve(+m[1])}});child.stderr.on('data',x=>output+=x);child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}: ${output}`))})});
 async function upload(size){
  const boundary='synthetic-ravi-boundary',report=JSON.stringify({title:'آزمون',text:'گزارش ساختگی برای بررسی محدودیت'});
  const head=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="report"\r\n\r\n${report}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  const tail=Buffer.from(`\r\n--${boundary}--\r\n`),chunk=Buffer.alloc(1024*1024,65);
  const req=http.request({host:'127.0.0.1',port,path:'/api/central/reports',method:'POST',headers:{Host:'report.localhost',Origin:'http://report.localhost','X-Bale-Init-Data':signed(),'X-Submission-Key':randomUUID(),'Content-Type':`multipart/form-data; boundary=${boundary}`,'Content-Length':String(head.length+size+tail.length)}});
  const response=new Promise((resolve,reject)=>{req.on('response',res=>{let body='';res.on('data',x=>body+=x);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}))});req.on('error',reject)});
  if(!req.write(head))await once(req,'drain');
  for(let remaining=size;remaining>0;){const n=Math.min(remaining,chunk.length);if(!req.write(chunk.subarray(0,n)))await once(req,'drain');remaining-=n}
  req.end(tail);return response;
 }
 const exact=await upload(LIMIT);assert.equal(exact.status,201,JSON.stringify(exact.body));
 const excess=await upload(LIMIT+1);assert.equal(excess.status,413,JSON.stringify(excess.body));assert.equal(excess.body.code,'too_large');
});
