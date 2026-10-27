import test from 'node:test';
import {privacySummary} from './public/privacy.js';
import {recordingPreview} from './public/recording-preview.js';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVoiceRecorder} from './public/voice-recorder.js';
import {requestApi} from './public/api-client.js';
import worker from './worker.js';

function capture(overrides={}) {
 const events=[],files=[],errors=[],tracks=[{stop(){events.push('track-stopped')}}];
 let recorder;
 class Recorder {
  static isTypeSupported(type){return type==='audio/webm;codecs=opus'}
  constructor(){recorder=this;this.state='inactive';this.mimeType='audio/webm;codecs=opus'}
  start(){this.state='recording';events.push('started')}
  stop(){this.state='inactive';events.push('stop-called');queueMicrotask(()=>{this.ondataavailable({data:new Blob(['last audio chunk'],{type:this.mimeType})});this.onstop()})}
 }
 const device={async getUserMedia(){events.push('permission');return {getTracks:()=>tracks}}};
 const voice=createVoiceRecorder({Recorder,mediaDevices:device,secure:true,onState:s=>events.push(s),onFile:f=>files.push(f),onError:e=>errors.push(e),...overrides});
 return {voice,events,files,errors,device,get recorder(){return recorder}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('privacy disclosure describes the actual model and speech destinations independently',()=>{
 const local=privacySummary({ai:true,provider:'local',transcription:true,sttLocal:true});
 assert.match(local,/مدل زبانی تنظیم‌شده/);assert.match(local,/سرویس گفتار تنظیم‌شده/);assert.doesNotMatch(local,/OpenAI/);
 const speechOnly=privacySummary({ai:false,transcription:true,sttLocal:true});
 assert.match(speechOnly,/تحلیل متن در مرورگر/);assert.match(speechOnly,/سرویس گفتار تنظیم‌شده/);
 const hosted=privacySummary({ai:true,provider:'anthropic',transcription:true,sttLocal:false});
 assert.match(hosted,/Anthropic/);assert.match(hosted,/OpenAI/);
 assert.match(privacySummary({loaded:false}),/مشخص نیست/);
});

test('recording recovery controls appear after a local or mini-app transcription failure',async()=>{
 const escape=s=>String(s).replaceAll('"','&quot;');
 const failed=recordingPreview({url:'blob:test"',hasRecording:true,alreadyTranscribed:false,canRetry:true,busy:false},escape);
 assert.match(failed,/data-action="retry-transcribe"/);assert.match(failed,/data-action="download-recording"/);assert.match(failed,/blob:test&quot;/);
 assert.doesNotMatch(recordingPreview({hasRecording:false},escape),/recording-preview/);
 const done=recordingPreview({url:'blob:test',hasRecording:true,alreadyTranscribed:true,canRetry:true,busy:false},escape);
 assert.doesNotMatch(done,/retry-transcribe/);assert.match(done,/متن این صوت اضافه شد/);
 assert.match(recordingPreview({url:'blob:test',hasRecording:true,alreadyTranscribed:false,canRetry:true,busy:true},escape),/disabled/);
 const app=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
 assert.equal(app.match(/\$\{renderRecordingPreview\(\)\}/g)?.length,3,'local, mini-app and browser panels each provide recovery');
});

test('local capture needs no API config and releases tracks after the final chunk',async()=>{
 const c=capture();await c.voice.start();c.voice.stop();assert.equal(c.events.includes('track-stopped'),false);
 await flush();assert.equal(c.files.length,1);assert.equal(await c.files[0].text(),'last audio chunk');
 assert.equal(c.files[0].name,'recording.webm');assert.ok(c.events.indexOf('track-stopped')>c.events.indexOf('stop-called'));
});
test('repeated starts cannot create multiple simultaneous microphone sessions',async()=>{
 let resolve;const c=capture({mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 const first=c.voice.start();await c.voice.start();assert.equal(c.events.filter(x=>x==='requesting').length,1);
 resolve({getTracks:()=>[]});await first;c.voice.stop({discard:true});await flush();assert.equal(c.files.length,0);
});
test('cancelling during permission prompt releases late streams without recording',async()=>{
 let resolve,stops=0;const c=capture({mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 const pending=c.voice.start();c.voice.stop({discard:true});resolve({getTracks:()=>[{stop(){stops++}}]});await pending;
 assert.equal(stops,1);assert.equal(c.files.length,0);assert.equal(c.events.includes('started'),false);
});
test('old stop callback cannot deliver audio into a new report or stop its recorder',async()=>{
 const c=capture();await c.voice.start();c.voice.stop({discard:true});await c.voice.start();await flush();
 assert.equal(c.files.length,0);assert.equal(c.recorder.state,'recording');c.voice.stop();await flush();assert.equal(c.files.length,1);
});
test('permission, absent device, busy device and insecure context have actionable errors',async()=>{
 for(const [name,pattern] of [['NotAllowedError',/اجازه/],['NotFoundError',/پیدا نشد/],['NotReadableError',/برنامه/]]){
  const c=capture({mediaDevices:{getUserMedia:async()=>{throw Object.assign(new Error(),{name})}}});await c.voice.start();assert.match(c.errors[0],pattern);assert.equal(c.files.length,0);
 }
 const insecure=capture({secure:false});await insecure.voice.start();assert.match(insecure.errors[0],/HTTPS/);
 const embedded=capture({policy:{allowsFeature:()=>false}});await embedded.voice.start();assert.match(embedded.errors[0],/تب جدا/);assert.equal(embedded.events.includes('permission'),false);
});
test('unsupported constraints retry plain audio, without retrying denied permission',async()=>{
 let calls=0;const c=capture({mediaDevices:{getUserMedia:async opts=>{calls++;if(calls===1)throw Object.assign(new Error(),{name:'OverconstrainedError'});assert.equal(opts.audio,true);return {getTracks:()=>[]}}}});
 await c.voice.start();assert.equal(calls,2);c.voice.stop();await flush();assert.equal(c.files.length,1);
});
test('Safari MP4 capture retains its correct extension and MIME type',async()=>{
 class MP4 {static isTypeSupported(t){return t==='audio/mp4'}constructor(s,o){assert.equal(o.mimeType,'audio/mp4');this.mimeType='audio/mp4';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.onstop()}}
 const c=capture({Recorder:MP4});await c.voice.start();c.voice.stop();assert.equal(c.files[0].name,'recording.m4a');assert.equal(c.files[0].type,'audio/mp4');
});
test('maximum duration stops capture and delivers audio once',async()=>{
 const c=capture({maxDuration:5});await c.voice.start();await new Promise(r=>setTimeout(r,20));assert.equal(c.files.length,1);c.voice.stop();assert.equal(c.files.length,1);
});
test('client translates HTML access-denial, network and timeout errors',async()=>{
 await assert.rejects(requestApi('transcribe',new FormData(),{fetcher:async()=>new Response('<html>blocked</html>',{status:403})}),e=>e.code==='site_response'&&/تب جدا/.test(e.message));
 await assert.rejects(requestApi('check',{}, {fetcher:async()=>{throw new TypeError('fetch failed')}}),e=>e.code==='network'&&/شبکه/.test(e.message));
 await assert.rejects(requestApi('check',{}, {timeout:2,fetcher:(_u,o)=>new Promise((_resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'}))))}),e=>e.code==='timeout');
});
test('model requests wait for a pending host SDK and attach its signed data',async()=>{
 const previous=globalThis.window;let resolveSdk,called=false;
 globalThis.window={__raviBaleSdk:new Promise(resolve=>{resolveSdk=resolve})};
 try{
  // Public config must not wait for the SDK: it is needed to render the app.
  await requestApi('config',{}, {fetcher:async(_url,opts)=>{assert.equal(opts.method,'GET');return Response.json({})}});
  const result=requestApi('check',{}, {fetcher:async(_url,opts)=>{called=true;assert.equal(opts.headers['X-Bale-Init-Data'],'signed-launch');return Response.json({ok:true})}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(called,false);
  globalThis.window.Bale={WebApp:{initData:'signed-launch'}};resolveSdk();assert.equal((await result).ok,true);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
});
test('multipart boundary is browser-owned and server error code is preserved',async()=>{
 const form=new FormData();form.append('file',new File(['audio'],'test.m4a',{type:'audio/mp4'}));
 await assert.rejects(requestApi('transcribe',form,{fetcher:async (_url,opts)=>{assert.equal(opts.body,form);assert.deepEqual(opts.headers,{});return Response.json({error:'اعتبار کافی نیست',code:'insufficient_quota'},{status:502})}}),e=>e.code==='insufficient_quota');
});
const audioRequest=(type='audio/wav',name='test.wav',bytes='audio')=>{const form=new FormData();form.append('file',new File([bytes],name,{type}));return new Request('https://example.com/api/transcribe',{method:'POST',body:form})};
test('uploads with mobile/Windows generic MIME types reach the transcription service',async(t)=>{
 let calls=0;t.mock.method(globalThis,'fetch',async (_url,opts)=>{calls++;assert.ok(opts.body.get('file').size);return Response.json({text:'این یک آزمون صوتی است'})});
 for(const [mime,name] of [['application/octet-stream','recording.m4a'],['video/mp4','recording.mp4'],['','recording.wav'],['application/octet-stream','recording.aac'],['video/3gpp','recording.3gp']])assert.equal((await worker.fetch(audioRequest(mime,name),{OPENAI_API_KEY:'test'})).status,200);
 assert.equal(calls,5);assert.equal((await worker.fetch(audioRequest('text/plain','file.txt'),{OPENAI_API_KEY:'test'})).status,400);
 assert.equal((await worker.fetch(audioRequest('audio/wav','empty.wav',''),{OPENAI_API_KEY:'test'})).status,400);assert.equal(calls,5);
});
test('quota and regional failures remain explicit; no fallback hides access errors or leaks keys',async(t)=>{
 let calls=0;const logs=[];t.mock.method(console,'error',v=>logs.push(v));
 for(const [code,status,pattern] of [['insufficient_quota',429,/اعتبار/],['unsupported_country_region_territory',403,/منطقه/],['invalid_api_key',401,/کلید/]]){
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:{code,message:'secret-never-echo-this'}},{status})});
  const r=await worker.fetch(audioRequest(),{OPENAI_API_KEY:'secret-never-echo-this'});const result=await r.json();assert.equal(result.code,code);assert.match(result.error,pattern);assert.equal(JSON.stringify(result).includes('secret-never'),false);
 }
 assert.equal(calls,3);assert.equal(logs.length,3);assert.equal(logs.join('').includes('secret-never'),false);
});
test('connection check calls Responses instead of claiming key presence means health',async(t)=>{
 let calls=0;t.mock.method(globalThis,'fetch',async (url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(JSON.parse(opts.body).store,false);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'OK'}]}]})});
 const env={OPENAI_API_KEY:'test'};const config=await (await worker.fetch(new Request('https://example.com/api/config'),env)).json();assert.equal(config.connection,'unchecked');assert.equal(calls,0);
 const r=await worker.fetch(new Request('https://example.com/api/check',{method:'POST',body:'{}'}),env);assert.deepEqual(await r.json(),{ok:true,text:'ready',transcription:'not_tested'});assert.equal(calls,1);
});
const source=await readFile(new URL('./public/app.js',import.meta.url),'utf8');
test('actual transcription flow keeps failed recording, retries with config offline, adds text once',async()=>{
 const fn=source.slice(source.indexOf('async function transcribeAudio('),source.indexOf('async function startRecording('));
 let calls=0;const state={text:'شرح قبلی',busy:false,recording:false},config={ai:false,loaded:false};
 const run=new Function('deps',`const {state,config,api}=deps;let lastRecording=null,lastTranscribed=null,transcriptReviewed=true,errors='';const render=()=>{},toast=()=>{},persist=async()=>{},rememberRecording=f=>{lastRecording=f};${fn};return {send:transcribeAudio,snapshot:()=>({lastRecording,lastTranscribed,errors})}`)({state,config,api:async()=>{calls++;if(calls===1)throw new Error('اعتبار کافی نیست');return {text:'متن صوت آزمایشی'}}});
 const file=new File(['voice'],'voice.webm',{type:'audio/webm'});await run.send(file);assert.equal(run.snapshot().lastRecording,file);assert.match(run.snapshot().errors,/اعتبار/);assert.equal(state.text,'شرح قبلی');
 await run.send(file);assert.equal(state.text,'شرح قبلی متن صوت آزمایشی');await run.send(file);assert.equal(calls,2);
 // A working transcription proves speech-to-text works, not that a text model
 // is connected: with our own speech server there may be no text model at all.
 assert.equal(config.transcription,true);assert.equal(config.ai,false);assert.equal(state.busy,false);
});
test('analysis runs on the browser engine when configuration cannot load, and says so',async()=>{
 const fn=source.slice(source.indexOf('async function analyze('),source.indexOf('async function addFiles('));let analyzed=0;
 const state={busy:false,recording:false,text:'شرح آزمایشی برای بررسی اتصال'},config={loaded:false,ai:false,error:'ارتباط قطع است'};
 const run=new Function('deps',`const {state,config,localAnalysis}=deps;let transcriptReviewed=true,errors='',engineNote='';const stopVoice=()=>{},render=()=>{},getConfig=async()=>{};${fn};return async()=>{await analyze();return {errors,engineNote}}`)({state,config,localAnalysis:()=>{analyzed++;return {events:['other'],known:{}}}});
 const out=await run();
 // The local engine is a complete path, so a failed configuration fetch does not
 // block the report; it must never be presented as an external model's answer.
 assert.equal(analyzed,1);assert.equal(state.busy,false);
 assert.match(out.engineNote,/موتور داخلی مرورگر/);
 assert.match(out.engineNote,/ارتباط قطع/);
});
