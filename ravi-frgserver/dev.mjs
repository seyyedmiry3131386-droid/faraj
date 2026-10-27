import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import worker from './worker.js';
import {apiBodyLimit,makeUploadAdmission,readApiBody} from './http-body.mjs';

// Environment variables win over .env. A BOM and Windows line endings are
// tolerated, so files saved with Notepad work on older Node versions too.
if(existsSync('.env'))for(const line of readFileSync('.env','utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
 const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
 if(!m||line.trimStart().startsWith('#'))continue;
 const value=m[2].trim().replace(/^["']|["']$/g,'');
 if(value&&!process.env[m[1]])process.env[m[1]]=value;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf'};
const root=path.resolve('public');
const port=Number(process.env.PORT||4173);
const admit=makeUploadAdmission();
const server=http.createServer(async(req,res)=>{
 try{
  const host=/^[\w.\-:\[\]]+$/.test(req.headers.host||'')?req.headers.host:`localhost:${port}`;
  // The preview proxy terminates HTTPS before this HTTP server. Preserve the
  // public origin for the Worker's same-origin check; never use localhost in
  // browser-facing URLs. This server is development-only; production uses a
  // fixed APP_ORIGIN behind a trusted reverse proxy in server.mjs.
  const forwarded=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const scheme=forwarded==='https'||(!forwarded&&/(?:^|\.)e2b\.app(?::\d+)?$/i.test(host))?'https':'http';
  const url=new URL(req.url,`${scheme}://${host}`);
  if(url.pathname.startsWith('/api/')){
   const release=admit(req,res,url.pathname);
   if(!release)return;
   try{
    const body=await readApiBody(req,res,apiBodyLimit(url.pathname));
    if(body===null)return;
    const headers=new Headers();
    for(const [name,value] of Object.entries(req.headers))if(value!==undefined&&!['host','connection','transfer-encoding'].includes(name))headers.set(name,Array.isArray(value)?value.join(', '):value);
    const opts={method:req.method,headers};
    if(req.method!=='GET'&&req.method!=='HEAD')opts.body=body;
    // Central storage is served only by the production Node adapter. The dev
    // preview must never advertise it when no central handler is mounted.
    const response=await worker.fetch(new Request(url,opts),{...process.env,CENTRAL_NODE_READY:'0'});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
   }finally{release()}
   return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
 }catch(error){
  if(!res.headersSent&&!res.destroyed){res.writeHead(error instanceof URIError?400:404);res.end('Not found')}
 }
});
server.requestTimeout=120000;
server.headersTimeout=15000;
server.listen(port,'0.0.0.0',()=>{const actual=server.address().port;console.log(`Ravi listening on http://localhost:${actual} (and on this machine's network address, port ${actual})`)});
