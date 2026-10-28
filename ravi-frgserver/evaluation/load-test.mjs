// Safe, opt-in load probe for the running application or speech service.
// Outputs aggregate timings/statuses only, never audio, prompts, replies or keys.
// Example:
//   STT_TOKEN=... node evaluation/load-test.mjs --url http://127.0.0.1:8765 --scenario stt --audio /path/clip.wav --concurrency 8 --requests 8
//   node evaluation/load-test.mjs --url http://127.0.0.1:4173 --scenario check --concurrency 4 --requests 4
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

function usage(message='') {
  if(message)console.error(message);
  console.error('Usage: node evaluation/load-test.mjs --url URL --scenario stt|transcribe|check|analyze|interview [--audio FILE] [--concurrency N] [--requests N] [--timeout-ms N] [--json FILE] [--allow-remote]');
  process.exit(message?1:0);
}
const values={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(key==='--help')usage();
  if(key==='--allow-remote'){values[key]=true;continue}
  if(!['--url','--scenario','--audio','--concurrency','--requests','--timeout-ms','--json'].includes(key)||!process.argv[i+1])usage(`Unknown or incomplete option: ${key}`);
  values[key]=process.argv[++i];
}
if(!values['--url']||!values['--scenario'])usage('Explicit URL and scenario are required.');
let base;
try{base=new URL(values['--url'])}catch{usage('Invalid URL.')}
if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)usage('Use an HTTP(S) URL without credentials, query or fragment.');
if(!['localhost','127.0.0.1','[::1]','::1'].includes(base.hostname)&&!values['--allow-remote'])usage('Remote targets require --allow-remote and operator permission.');
const scenario=values['--scenario'];
if(!['stt','transcribe','check','analyze','interview'].includes(scenario))usage('Unknown scenario.');
const integer=(key,fallback,min,max)=>{const n=values[key]===undefined?fallback:Number(values[key]);if(!Number.isInteger(n)||n<min||n>max)usage(`${key} must be ${min}–${max}.`);return n};
const concurrency=integer('--concurrency',2,1,64), requests=integer('--requests',concurrency,1,1000), timeout=integer('--timeout-ms',240000,100,600000);
if(concurrency>requests)usage('Concurrency cannot exceed request count.');
let audio;
if(['stt','transcribe'].includes(scenario)){
  if(!values['--audio'])usage('Speech scenarios require --audio.');
  audio=await readFile(values['--audio']);
  if(!audio.length||audio.length>24*1024*1024)usage('Audio must be nonempty and at most 24 MiB.');
}
const mime={'.wav':'audio/wav','.webm':'audio/webm','.mp3':'audio/mpeg','.m4a':'audio/mp4','.mp4':'audio/mp4','.ogg':'audio/ogg','.opus':'audio/ogg','.flac':'audio/flac'};
const target=base.toString().replace(/\/+$/,'')+(scenario==='stt'?'/transcribe':`/api/${scenario}`);
function requestOptions(){
  const headers={};let body;
  if(scenario==='stt'){
    body=audio;headers['Content-Type']=mime[path.extname(values['--audio']).toLowerCase()]||'application/octet-stream';
    if(process.env.STT_TOKEN)headers['X-STT-Token']=process.env.STT_TOKEN;
  }else if(scenario==='transcribe'){
    body=new FormData();const name=path.basename(values['--audio']);
    body.append('file',new File([audio],name,{type:mime[path.extname(name).toLowerCase()]||'application/octet-stream'}));
  }else{
    headers['Content-Type']='application/json';
    body=JSON.stringify(scenario==='analyze'?{text:'دیشب در خیابان بهار موتورم را بردند'}:scenario==='interview'?{mode:'intake',text:'',turns:[]}:{});
  }
  return {method:'POST',headers,body,signal:AbortSignal.timeout(timeout)};
}
const started=performance.now(), rows=[];let next=0;
async function run(){
  while(true){
    const i=next++;if(i>=requests)return;
    const start=performance.now();
    try{
      const response=await fetch(target,requestOptions());
      let code='';try{const v=await response.json();code=typeof v?.code==='string'?v.code:''}catch{}
      rows.push({status:String(response.status),code,ms:performance.now()-start});
    }catch(error){rows.push({status:['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network_error',code:'',ms:performance.now()-start})}
  }
}
await Promise.all(Array.from({length:concurrency},run));
const elapsed=performance.now()-started;
const keyOf=r=>r.status+(r.code?`/${r.code}`:'');
const groups=rows.reduce((acc,r)=>{(acc[keyOf(r)]??=[]).push(r.ms);return acc},{});
function latency(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const p=q=>+(sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]/1000).toFixed(3);
  return {min:p(0),p50:p(.5),p95:p(.95),max:p(1)};
}
const counts=Object.fromEntries(Object.entries(groups).map(([key,v])=>[key,v.length]));
const byStatus=Object.fromEntries(Object.entries(groups).map(([key,v])=>[key,latency(v)]));
const summary={scenario,requests,concurrency,timeoutMs:timeout,elapsedSeconds:+(elapsed/1000).toFixed(3),statuses:counts,latencySeconds:latency(rows.map(r=>r.ms)),latencyByStatus:byStatus};
console.log(JSON.stringify(summary,null,2));
if(values['--json'])await writeFile(values['--json'],JSON.stringify(summary,null,2)+'\n');
