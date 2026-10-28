// Real Node HTTP requests against the shared dev/production body adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {apiBodyLimit,makeUploadAdmission,readApiBody} from './http-body.mjs';
import {orderedInterviewPath} from './public/interview-order.js';
import {start as startMockModel} from './mock-llm.mjs';
import worker from './worker.js';

function startFixture(bodyLimit=()=>1024) {
  const admit=makeUploadAdmission({STT_PROXY_MAX_ACTIVE:'1'});
  let unblock, entered;
  const gate=new Promise(r=>{unblock=r}), started=new Promise(r=>{entered=r});
  const server=http.createServer(async(req,res)=>{
    const release=admit(req,res,req.url);
    if(!release)return;
    try{
      const body=await readApiBody(req,res,bodyLimit(req.url));
      if(body===null)return;
      if(req.url==='/api/transcribe'){entered();await gate}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({size:body.length}));
    }catch{if(!res.headersSent&&!res.destroyed){res.writeHead(500);res.end()}}
    finally{release()}
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port,unblock,started})));
}
function request(port,path,chunks,{length,method='POST',headers:customHeaders={}}={}) {
  return new Promise((resolve,reject)=>{
    const headers={...customHeaders,...(length===undefined?{}:{'Content-Length':String(length)})};
    const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
      const data=[];res.on('data',c=>data.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(Buffer.concat(data).toString()||'{}')}));
    });
    req.on('error',reject);
    for(const c of chunks)req.write(c);
    req.end();
  });
}

test('Node adapters limit known and chunked request bodies before buffering',async t=>{
  const f=await startFixture();t.after(()=>{f.unblock();f.server.close()});
  assert.equal(apiBodyLimit('/api/transcribe'),26*1024*1024);
  assert.equal(apiBodyLimit('/api/interview'),640*1024);
  assert.equal(apiBodyLimit('/api/help'),128*1024);
  assert.equal((await request(f.port,'/api/help',[Buffer.alloc(100)],{length:100})).status,200);
  for(const options of [{length:1025},{}]){
    const r=await request(f.port,'/api/help',[Buffer.alloc(600),Buffer.alloc(425)],options);
    assert.equal(r.status,413);assert.equal(r.body.code,'too_large');
  }
});

test('interview HTTP body fits maximum escaped field dimensions and enforces its own boundary',async t=>{
  const f=await startFixture(apiBodyLimit);t.after(()=>{f.unblock();f.server.close()});
  // Worst-case Unicode escaping, even though the UI normally sends UTF-8.
  const dimensions={mode:'intake',orderVersion:5,text:'پ'.repeat(6000),topics:Array(8).fill('پ'.repeat(80)),
    turns:Array.from({length:45},()=>({q:'پ'.repeat(400),a:'پ'.repeat(1500),stage:'s'.repeat(40)}))};
  const escaped=JSON.stringify(dimensions).replace(/[^\x00-\x7f]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
  const bytes=Buffer.from(escaped);assert.ok(bytes.length>128*1024);assert.ok(bytes.length<apiBodyLimit('/api/interview'));
  const accepted=await request(f.port,'/api/interview',[bytes],{length:bytes.length});
  assert.equal(accepted.status,200);assert.equal(accepted.body.size,bytes.length);
  const limit=apiBodyLimit('/api/interview');
  assert.equal((await request(f.port,'/api/interview',[Buffer.alloc(limit)],{length:limit})).status,200);
  for(const options of [{length:limit+1},{}]){
    const r=await request(f.port,'/api/interview',[Buffer.alloc(limit),Buffer.alloc(1)],options);
    assert.equal(r.status,413);assert.equal(r.body.code,'too_large');
  }
  // Direct Worker deployments have no Node adapter; multibyte bodies must
  // still be bounded in bytes, not only JavaScript character count.
  const wide='界'.repeat(Math.floor(limit/3)+1);
  assert.ok(wide.length<limit&&Buffer.byteLength(wide)>limit);
  const direct=await worker.fetch(new Request('http://localhost/api/interview',{method:'POST',body:wide}),{LLM_URL:'http://127.0.0.1:1'});
  assert.equal(direct.status,413);
});

test('real development HTTP and Worker accept a valid long grouped interview, not just the adapter',async t=>{
  const model=await startMockModel(0);t.after(()=>model.close());
  const child=spawn(process.execPath,['dev.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',LLM_URL:`http://127.0.0.1:${model.address().port}`,LLM_MODEL:'mock'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));
  const port=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('dev server did not start')),10000);
    child.stdout.on('data',data=>{output+=data;const m=output.match(/Ravi listening on http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`dev server exited ${code}`))});
  });
  const answers={source:'از همسایه شنیدم',informantKnown:'فردی که این را به من گفت را می‌شناسم',
    informantRelation:'همسایه',informantContact:'شماره دارم',who:'دو نفر',peopleDescription:'قد بلند',
    peopleKnown:'افراد برای من ناشناس بودند',when:'دیروز',where:'تهران',result:'سرقت رخ داد'};
  const expected=['source','informantKnown','informantRelation','informantContact','who','peopleDescription','peopleKnown','when','where','result'];
  const turns=Array.from({length:20},(_,i)=>({q:`پرسش قدیمی ${i}`,a:'یادداشت'}));
  for(const id of expected){
    const next=orderedInterviewPath({mode:'intake',orderVersion:5,turns}).next;assert.equal(next.id,id);
    turns.push({stage:id,q:next.title,a:answers[id]});
  }
  const longTurns=turns.map(turn=>({...turn,a:(turn.a+' '+ '界'.repeat(1500)).slice(0,1500)}));
  const input={mode:'intake',text:'',orderVersion:5,topics:[],turns:longTurns};
  const body=Buffer.from(JSON.stringify(input));assert.ok(body.length>128*1024);assert.ok(JSON.stringify(input).length>40000);
  const response=await request(port,'/api/interview',[body],{length:body.length,headers:{'Content-Type':'application/json'}});
  assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.stage,'vehicleInvolved');
  assert.equal(response.body.done,false);assert.equal(model.requests.length,1);
  const bad=Buffer.from(JSON.stringify({...input,orderVersion:999,turns:[]}));
  assert.equal((await request(port,'/api/interview',[bad],{length:bad.length,headers:{'Content-Type':'application/json'}})).status,400);
  const help=Buffer.from(JSON.stringify({question:'q',answer:'界'.repeat(40001)}));
  assert.equal((await request(port,'/api/help',[help],{length:help.length,headers:{'Content-Type':'application/json'}})).status,413);
});

test('Node adapters refuse excess uploads before buffering and recover after completion',async t=>{
  const f=await startFixture();t.after(()=>{f.unblock();f.server.close()});
  const first=request(f.port,'/api/transcribe',[Buffer.alloc(50)],{length:50});
  await f.started;
  const excess=await request(f.port,'/api/transcribe',[Buffer.alloc(50)],{length:50});
  assert.equal(excess.status,503);assert.equal(excess.body.code,'stt_busy');assert.equal(excess.headers['retry-after'],'5');
  assert.equal((await request(f.port,'/api/help',[Buffer.alloc(10)],{length:10})).status,200);
  f.unblock();assert.equal((await first).status,200);
  assert.equal((await request(f.port,'/api/transcribe',[Buffer.alloc(50)],{length:50})).status,200);
});

test('the development server preserves HTTPS preview origins and still blocks cross-origin POSTs',async t=>{
  const child=spawn(process.execPath,['dev.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));
  const port=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('dev server did not start')),10000);
    child.stdout.on('data',data=>{output+=data;const m=output.match(/Ravi listening on http:\/\/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`dev server exited ${code}`))});
  });
  const send=headers=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:'/api/not-a-real-route',method:'POST',headers:{'Content-Type':'application/json',...headers}},res=>{
      res.resume();res.on('end',()=>resolve(res.statusCode));
    });
    req.on('error',reject);req.end('{}');
  });
  const host='4173-example.e2b.app';
  assert.notEqual(await send({Host:host,Origin:`https://${host}`,'X-Forwarded-Proto':'https'}),403);
  assert.notEqual(await send({Host:host,Origin:`https://${host}`}),403);
  assert.equal(await send({Host:host,Origin:'https://attacker.invalid','X-Forwarded-Proto':'https'}),403);
  assert.notEqual(await send({Host:'localhost:4173',Origin:'http://localhost:4173'}),403);
});

test('production adapter serves mobile assets and enforces the configured public origin',async t=>{
  const child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'0',APP_ORIGIN:'https://ravi.example'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill('SIGTERM'));
  const port=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(new Error('production server did not start')),10000);
    child.stdout.on('data',data=>{output+=data;const m=output.match(/Ravi listening on loopback:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]))}});
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`production server exited ${code}`))});
  });
  const send=(path,{method='GET',headers={}}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path,method,headers},res=>{
      res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));
    });req.on('error',reject);req.end(method==='POST'?'{}':undefined);
  });
  const home=await send('/');assert.equal(home.status,200);assert.match(home.headers['content-security-policy'],/script-src 'self' https:\/\/tapi\.bale\.ai/);assert.doesNotMatch(home.headers['content-security-policy'],/script-src[^;]*unsafe-inline/);
  assert.equal((await send('/call.js')).headers['content-type'],'text/javascript; charset=utf-8');
  assert.equal((await send('/assets/faraja.webp')).headers['content-type'],'image/webp');
  assert.equal((await send('/assets/Vazir.ttf')).headers['content-type'],'font/ttf');
  assert.notEqual((await send('/api/not-a-real-route',{method:'POST',headers:{Origin:'https://ravi.example','Content-Type':'application/json'}})).status,403);
  assert.equal((await send('/api/not-a-real-route',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'}})).status,403);
});

test('a slow API body is stopped at the total upload deadline',async t=>{
 const server=http.createServer(async(req,res)=>{const body=await readApiBody(req,res,1024,40);if(body!==null)res.end('unexpected')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const result=await new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/help',method:'POST'},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{req.destroy();resolve({status:res.statusCode,body:JSON.parse(data)})})});
  req.on('error',reject);req.write('slow');
 });
 assert.equal(result.status,408);assert.equal(result.body.code,'upload_timeout');
});
