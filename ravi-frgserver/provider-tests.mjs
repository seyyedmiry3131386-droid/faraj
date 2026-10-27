// The worker can talk to either provider. These tests stub the network, so
// they prove the wiring — the request that leaves, and the reply that is read
// back — without any key and without a call to anyone's service.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{provider} from './worker.js';
import {GUIDE_STEPS} from './public/guidance.js';

const analysis={events:[{type:'theft',evidence:'موتورم را بردند'}],known:{},clarification:{needed:false}};
const call=(env,body={text:'دیشب در خیابان بهار موتورم را بردند'})=>
 worker.fetch(new Request('https://example.com/api/analyze',{method:'POST',body:JSON.stringify(body)}),env);

test('the provider is chosen from whichever key is present',()=>{
 assert.equal(provider({}),'');
 assert.equal(provider({OPENAI_API_KEY:'k'}),'openai');
 assert.equal(provider({ANTHROPIC_API_KEY:'k'}),'anthropic');
 // With both, the Anthropic key wins: it is the one the operator added last.
 assert.equal(provider({OPENAI_API_KEY:'k',ANTHROPIC_API_KEY:'k'}),'anthropic');
});

test('config reports the provider and says whether audio conversion exists',async()=>{
 const off=await (await worker.fetch(new Request('https://example.com/api/config'),{})).json();
 assert.equal(off.ai,false);
 const claude=await (await worker.fetch(new Request('https://example.com/api/config'),{ANTHROPIC_API_KEY:'k'})).json();
 assert.equal(claude.ai,true);
 assert.equal(claude.provider,'anthropic');
 // Anthropic has no speech-to-text, and the UI is told so rather than left to
 // discover it when a reporter presses record.
 assert.equal(claude.transcription,false);
 const openai=await (await worker.fetch(new Request('https://example.com/api/config'),{OPENAI_API_KEY:'k'})).json();
 assert.equal(openai.transcription,true);
});

test('hosted providers cannot skip the server-controlled interview order',async t=>{
 const proposal={done:true,question:'اول مدرک را بگویید',options:['ساختگی'],facts:[],urgent:'',narrative:''};
 for(const [name,env] of [['openai',{OPENAI_API_KEY:'test'}],['anthropic',{ANTHROPIC_API_KEY:'test'}]]){
  let payload;
  t.mock.method(globalThis,'fetch',async(_url,opts)=>{
   payload=JSON.parse(opts.body);
   return name==='openai'
    ?Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(proposal)}]}]})
    :Response.json({stop_reason:'tool_use',content:[{type:'tool_use',name:'incident',input:proposal}]});
  });
  const request=new Request('https://example.com/api/interview',{method:'POST',body:JSON.stringify({mode:'intake',text:'',turns:[]})});
  const response=await worker.fetch(request,env);
  assert.equal(response.status,200,name);
  const result=await response.json();
  assert.equal(result.done,false,name);
  assert.equal(result.stage,'source',name);
  assert.equal(result.question,GUIDE_STEPS[0].title,name);
  const input=name==='openai'?payload.input:payload.messages[0].content;
  assert.equal(JSON.parse(input).next_guide_step.id,'source',name);
  t.mock.restoreAll();
 }
});

test('a topic label in the refusal field is an invalid model response, not a real refusal',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...analysis,refusal:'رسیدگی‌نشدن یا شکایت از عملکرد دستگاه'})}]}]}));
 const r=await call({OPENAI_API_KEY:'unit-test'});
 assert.equal(r.status,502);assert.equal((await r.json()).code,'invalid_response');
 t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({...analysis,refusal:'نمی‌توانم به شناسایی افراد بر اساس باورشان کمک کنم.'})}]}]}));
 const genuine=await call({OPENAI_API_KEY:'unit-test'});
 assert.equal(genuine.status,200);assert.match((await genuine.json()).refusal,/نمی‌توانم/);
});

test('a saturated local language model returns retryable 503',async t=>{
 let unblock, entered;
 const gate=new Promise(resolve=>{unblock=resolve}), started=new Promise(resolve=>{entered=resolve});
 t.mock.method(globalThis,'fetch',async()=>{entered();await gate;return Response.json({choices:[{message:{content:'OK'},finish_reason:'stop'}]})});
 const env={LLM_URL:'http://busy-test',LLM_API:'openai',LLM_MODEL:'other'};
 const request=()=>new Request('https://example.com/api/check',{method:'POST',body:'{}'});
 const first=worker.fetch(request(),env);await started;
 const busy=await worker.fetch(request(),env);
 assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'5');assert.equal((await busy.json()).code,'llm_busy');
 unblock();assert.equal((await first).status,200);
});

test('an Anthropic request carries the right headers, system prompt and forced tool',async t=>{
 let sent=null;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  sent={url:String(url),headers:opts.headers,body:JSON.parse(opts.body)};
  return Response.json({content:[{type:'tool_use',name:'incident',input:analysis}],stop_reason:'tool_use'});
 });
 const r=await call({ANTHROPIC_API_KEY:'unit-test'});
 assert.equal(r.status,200);
 assert.equal(sent.url,'https://api.anthropic.com/v1/messages');
 assert.equal(sent.headers['x-api-key'],'unit-test');
 assert.equal(sent.headers['anthropic-version'],'2023-06-01');
 // Authorization is OpenAI's header; sending it here would leak the key to a
 // field that service does not read.
 assert.equal(sent.headers.Authorization,undefined);
 assert.ok(sent.body.system.length>100);
 assert.equal(sent.body.tool_choice.name,'incident');
 assert.equal(sent.body.tools[0].input_schema.type,'object');
 const out=await r.json();
 assert.ok(out.events.includes('theft'));
});

test('a truncated Anthropic reply is an error, not a half-read report',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({content:[],stop_reason:'max_tokens'}));
 assert.equal((await call({ANTHROPIC_API_KEY:'unit-test'})).status,502);
 t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>Response.json({content:[{type:'text',text:'سلام'}],stop_reason:'end_turn'}));
 assert.equal((await call({ANTHROPIC_API_KEY:'unit-test'})).status,502);
});

test('an Anthropic error becomes the same Persian message, with no key in it',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({type:'error',error:{type:'authentication_error',message:'invalid x-api-key'}},{status:401}));
 const r=await call({ANTHROPIC_API_KEY:'secret-value'});
 const data=await r.json();
 assert.equal(r.status,502);
 assert.match(data.error,/کلید/);
 assert.equal(JSON.stringify(data).includes('secret-value'),false);
 assert.equal(JSON.stringify(data).includes('x-api-key'),false);
});

test('recording is refused clearly when only Anthropic is configured',async()=>{
 const form=new FormData();
 form.append('file',new File(['audio'],'a.wav',{type:'audio/wav'}));
 const r=await worker.fetch(new Request('https://example.com/api/transcribe',{method:'POST',body:form}),{ANTHROPIC_API_KEY:'k'});
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,'not_configured');
});

test('the OpenAI path is untouched by the addition',async t=>{
 let sent=null;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{
  sent=String(url);
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(analysis)}]}]});
 });
 const r=await call({OPENAI_API_KEY:'unit-test'});
 assert.equal(r.status,200);
 assert.equal(sent,'https://api.openai.com/v1/responses');
});

// ---------------------------------------------------------------------------
// Our own speech model: no key, no outside service.
// ---------------------------------------------------------------------------
const audio=()=>{const f=new FormData();f.append('file',new File(['voice'],'v.webm',{type:'audio/webm'}));return f};
const transcribe=(env,headers={})=>worker.fetch(new Request('https://example.com/api/transcribe',{method:'POST',body:audio(),headers}),env);

test('with STT_URL, recordings go to our own server and need no AI key',async t=>{
 let sent=null;
 t.mock.method(globalThis,'fetch',async(url,opts)=>{sent={url:String(url),headers:opts.headers,file:opts.body.get('file')};return Response.json({text:'دیشب موتورم را بردند',model:'whisper-medium'})});
 const r=await transcribe({STT_URL:'http://127.0.0.1:8765/',STT_TOKEN:'t0k'});
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{text:'دیشب موتورم را بردند',model:'whisper-medium'});
 assert.equal(sent.url,'http://127.0.0.1:8765/transcribe');
 assert.equal(sent.headers['X-STT-Token'],'t0k');
 assert.equal(sent.file.name,'v.webm');
 // Nothing went to OpenAI or anyone else.
 assert.ok(!sent.url.includes('openai'));
});

test('config reports local speech even with no AI key at all',async()=>{
 const c=await (await worker.fetch(new Request('https://example.com/api/config'),{STT_URL:'http://127.0.0.1:8765'})).json();
 assert.equal(c.ai,false);
 assert.equal(c.transcription,true);
 assert.equal(c.sttLocal,true);
 assert.equal(c.transcriptionModel,'local');
});

test('a speech service that is down or silent gives a Persian message, not its own text',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('connect ECONNREFUSED 127.0.0.1:8765')});
 let r=await transcribe({STT_URL:'http://127.0.0.1:8765'});
 let body=await r.json();
 assert.equal(r.status,502);assert.equal(body.code,'stt_unreachable');
 assert.equal(JSON.stringify(body).includes('ECONNREFUSED'),false);
 t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'no speech recognised'},{status:422}));
 r=await transcribe({STT_URL:'http://127.0.0.1:8765'});
 body=await r.json();
 assert.equal(r.status,422);assert.match(body.error,/گفتار/);
 assert.equal(JSON.stringify(body).includes('no speech'),false);
});

test('a corrupt file is distinguished from recognised silence without leaking upstream errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'decoder internal path',code:'invalid_audio'},{status:422}));
 let r=await transcribe({STT_URL:'http://127.0.0.1:8765'});let body=await r.json();
 assert.equal(r.status,422);assert.equal(body.code,'invalid_audio');assert.match(body.error,/فایل صوتی خوانده نشد/);assert.doesNotMatch(JSON.stringify(body),/decoder internal path/);
 t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>Response.json({code:'no_speech'},{status:422}));
 r=await transcribe({STT_URL:'http://127.0.0.1:8765'});body=await r.json();assert.equal(body.code,'no_speech');assert.match(body.error,/گفتار/);
});

test('an excessive decoded duration gets a clear 413 without leaking upstream errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'private detail',code:'audio_too_long'},{status:413}));
 let r=await transcribe({STT_URL:'http://127.0.0.1:8765'});let body=await r.json();
 assert.equal(r.status,413);assert.equal(body.code,'audio_too_long');assert.match(body.error,/مدت صوت/);assert.doesNotMatch(JSON.stringify(body),/private detail/);
 t.mock.restoreAll();
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'private detail'},{status:413}));
 r=await transcribe({STT_URL:'http://127.0.0.1:8765'});body=await r.json();assert.equal(r.status,413);assert.equal(body.code,'audio_too_large');
});

test('speech worker bounds in-flight uploads before multipart parsing and releases them',async t=>{
 let unblock,entered=0,notify;
 const gate=new Promise(r=>{unblock=r}), started=new Promise(r=>{notify=r});
 t.mock.method(globalThis,'fetch',async()=>{if(++entered===2)notify();await gate;return Response.json({text:'متن',model:'whisper'})});
 const env={STT_URL:'http://speech-admission-test',STT_WORKER_MAX_ACTIVE:2};
 const first=transcribe(env),second=transcribe(env);await started;
 const busy=await transcribe(env);
 assert.equal(busy.status,503);assert.equal((await busy.json()).code,'stt_busy');assert.equal(entered,2);
 unblock();assert.equal((await first).status,200);assert.equal((await second).status,200);
 assert.equal((await transcribe(env)).status,200);
});

test('speech saturation is translated to a retryable 503 without upstream details',async t=>{
 t.mock.method(globalThis,'fetch',async()=>Response.json({error:'internal capacity detail'},{status:503}));
 const r=await transcribe({STT_URL:'http://127.0.0.1:8765'});
 assert.equal(r.status,503);assert.equal(r.headers.get('retry-after'),'5');
 const body=await r.json();assert.equal(body.code,'stt_busy');assert.equal(JSON.stringify(body).includes('internal capacity detail'),false);
});

test('an OpenAI key alone still transcribes through OpenAI, as before',async t=>{
 let url='';t.mock.method(globalThis,'fetch',async u=>{url=String(u);return Response.json({text:'متن'})});
 const r=await transcribe({OPENAI_API_KEY:'k'});
 assert.equal(r.status,200);assert.match(url,/api\.openai\.com/);
});
