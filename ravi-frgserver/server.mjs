import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from './worker.js';
import {apiBodyLimit,makeUploadAdmission,readApiBody} from './http-body.mjs';
import {createCentral} from './central-http.mjs';
import {loadCentralEnv} from './central-config.mjs';

const root=await realpath(fileURLToPath(new URL('./public/',import.meta.url)));
const origin=new URL(process.env.APP_ORIGIN||'http://localhost:4173').origin;
const port=Number(process.env.PORT||4173);
const admit=makeUploadAdmission();
const runtimeEnv=process.env.CENTRAL_ENABLED==='1'?loadCentralEnv(process.env):process.env;
const central=runtimeEnv.CENTRAL_ENABLED==='1'?createCentral(runtimeEnv,{publicRoot:root}):null;
const adminHost=central?new URL(central.adminOrigin).host.toLowerCase():'';
const publicHost=new URL(origin).host.toLowerCase();
// The public mini-app must remain embeddable by Bale, so there is deliberately
// no frame-ancestors restriction here. The staff origin has a separate policy.
const publicCsp="default-src 'self'; script-src 'self' https://tapi.bale.ai; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'";
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const send=(status,message)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(message)};
  try{
    const admin=Boolean(central&&String(req.headers.host||'').toLowerCase()===adminHost);
    const requestOrigin=admin?central.adminOrigin:origin;
    const url=new URL(req.url,requestOrigin);
    if(url.origin!==requestOrigin)return send(400,'Invalid URL');
    if(url.pathname==='/healthz')return send(200,'OK');
    if(central&&String(req.headers.host||'').toLowerCase()!==publicHost&&!admin)return send(421,'Unknown host');
    // The production Node process is loopback-only behind a trusted proxy.
    // Never serve sensitive pages or accept credentials over plain HTTP.
    if(central&&process.env.CENTRAL_ALLOW_INSECURE_DEV!=='1'&&req.headers['x-forwarded-proto']!=='https'){
      res.writeHead(301,{'Location':requestOrigin+url.pathname+url.search,'Cache-Control':'no-store'});res.end();return;
    }
    if(url.pathname.startsWith('/api/central/')||url.pathname.startsWith('/api/staff/')){
      if(!central)return send(503,'Central service is not configured');
      return await central.handle(req,res,url,{admin});
    }
    if(admin&&url.pathname.startsWith('/api/'))return send(404,'Not found');
    if(url.pathname.startsWith('/api/')){
      if(central&&req.method==='POST'){
        if(req.headers.origin!==origin){res.writeHead(403,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Connection':'close'});res.end(JSON.stringify({error:'درخواست نامعتبر است.',code:'origin'}));return}
        if(!central.authorizeReporter(req)){res.writeHead(401,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Connection':'close'});res.end(JSON.stringify({error:'برای استفاده از سرویس، مینی‌اپ را دوباره از داخل بله باز کنید.',code:'bale_auth'}));return}
      }
      const release=admit(req,res,url.pathname);
      if(!release)return;
      try{
        const body=await readApiBody(req,res,apiBodyLimit(url.pathname));
        if(body===null)return;
        const headers=new Headers();
        for(const [name,value] of Object.entries(req.headers))if(value!==undefined&&!['host','connection','transfer-encoding','content-length'].includes(name))headers.set(name,Array.isArray(value)?value.join(', '):value);
        const options={method:req.method,headers};
        if(!['GET','HEAD'].includes(req.method))options.body=body;
        const response=await worker.fetch(new Request(url,options),{...runtimeEnv,CENTRAL_NODE_READY:central?'1':'0'});
        res.writeHead(response.status,Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      }finally{release()}
      return;
    }
    if(!['GET','HEAD'].includes(req.method))return send(405,'Method not allowed');
    const adminAssets=new Set(['/','/staff.js','/staff.css']);
    if(admin&&!adminAssets.has(url.pathname))return send(404,'Not found');
    if(!admin&&['/staff.html','/staff.js','/staff.css'].includes(url.pathname))return send(404,'Not found');
    const decoded=decodeURIComponent(admin&&url.pathname==='/'?'/staff.html':url.pathname==='/'?'/index.html':url.pathname);
    if(decoded.includes('\0')||decoded.split('/').some(p=>p.startsWith('.')||p.startsWith('__')))return send(404,'Not found');
    const file=await realpath(path.resolve(root,'.'+decoded));
    if(!file.startsWith(root+path.sep))return send(404,'Not found');
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':data.length,'X-Content-Type-Options':'nosniff','Cache-Control':admin?'no-store':'no-cache',...(admin?{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'}:{'Content-Security-Policy':publicCsp})});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(error){if(!res.headersSent&&!res.destroyed)send(['ENOENT','ENOTDIR','EISDIR'].includes(error.code)?404:error instanceof URIError?400:500,'Request failed')}
});
// Central evidence uploads can be 100 MiB on mobile; model/API bodies keep
// their own shorter deadline in readApiBody.
server.requestTimeout=900000;
server.headersTimeout=15000;
server.listen(port,'127.0.0.1',()=>console.log(`Ravi listening on loopback:${server.address().port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{central?.close();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()});
