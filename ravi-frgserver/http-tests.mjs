// Real Node HTTP requests against the shared dev/production body adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {apiBodyLimit,makeUploadAdmission,readApiBody} from './http-body.mjs';

function startFixture() {
  const admit=makeUploadAdmission({STT_PROXY_MAX_ACTIVE:'1'});
  let unblock, entered;
  const gate=new Promise(r=>{unblock=r}), started=new Promise(r=>{entered=r});
  const server=http.createServer(async(req,res)=>{
    const release=admit(req,res,req.url);
    if(!release)return;
    try{
      const body=await readApiBody(req,res,1024);
      if(body===null)return;
      if(req.url==='/api/transcribe'){entered();await gate}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({size:body.length}));
    }catch{if(!res.headersSent&&!res.destroyed){res.writeHead(500);res.end()}}
    finally{release()}
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port,unblock,started})));
}
function request(port,path,chunks,{length,method='POST'}={}) {
  return new Promise((resolve,reject)=>{
    const headers=length===undefined?{}:{'Content-Length':String(length)};
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
  assert.equal(apiBodyLimit('/api/interview'),128*1024);
  assert.equal((await request(f.port,'/api/help',[Buffer.alloc(100)],{length:100})).status,200);
  for(const options of [{length:1025},{}]){
    const r=await request(f.port,'/api/help',[Buffer.alloc(600),Buffer.alloc(425)],options);
    assert.equal(r.status,413);assert.equal(r.body.code,'too_large');
  }
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
