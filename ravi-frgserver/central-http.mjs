// Optional Node-only central intake and staff inbox. The Bale signature is
// verified before a byte of a report upload is read. The admin origin must be
// separate in production. No raw report, token, audio or password is logged.
import Busboy from 'busboy';
import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createReadStream,createWriteStream,mkdirSync,realpathSync} from 'node:fs';
import {mkdtemp,rm,chmod,open} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable} from 'node:stream';
import path from 'node:path';
import {isIP} from 'node:net';
import {CentralStore} from './central-store.mjs';
import {dataKey,verifyBaleInitData,userKey} from './central-crypto.mjs';
import {readApiBody} from './http-body.mjs';
import {validateReporterIdentity} from './public/reporter-identity.js';

const FILE_LIMIT=100*1024*1024,REQUEST_LIMIT=FILE_LIMIT+1024*1024,REPORT_LIMIT=512*1024,MAX_FILES=10;
const ID=/^RV-[A-F0-9]{32}$/,KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
function fail(res,status,code,message,headers={}){
 if(res.headersSent||res.destroyed)return;
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
 res.end(JSON.stringify({error:message,code}));
}
function json(res,body,status=200,headers={}){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body))}
function sanitizedFilename(name){
 const clean=String(name||'').replace(/[\x00-\x1f\x7f/\\\u202a-\u202e\u2066-\u2069]/g,'_').trim();
 return [...clean].slice(0,180).join('')||'attachment';
}
const isOrigin=(req,origin)=>req.headers.origin===origin;
function cookieValue(req,name){
 const pairs=String(req.headers.cookie||'').split(';').map(s=>s.trim().split('='));
 const matches=pairs.filter(p=>p[0]===name);return matches.length===1?matches[0].slice(1).join('='):'';
}
function sameToken(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&aa.length>0&&timingSafeEqual(aa,bb)}
function reportShape(text){
 let value;try{value=JSON.parse(text)}catch{throw new HttpError(400,'invalid_report','ساختار گزارش معتبر نیست.')}
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.text!=='string'||value.text.trim().length<3||value.text.length>6000||typeof value.title!=='string'||value.title.length>300)
  throw new HttpError(400,'invalid_report','شرح گزارش یا عنوان آن معتبر نیست.');
 return value;
}
async function readJson(req,res,limit=16*1024){
 const body=await readApiBody(req,res,limit);if(body===null)return null;
 try{const v=JSON.parse(body.toString('utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null}catch{return null}
}

async function receiveUpload(req,store,id,{existingSubmission=false}={}){
 const announced=Number(req.headers['content-length']||0);
 if(announced>REQUEST_LIMIT)throw new HttpError(413,'too_large','حجم کل گزارش بیش از حد مجاز است.');
 // Browser multipart filenames are UTF-8. Busboy otherwise defaults these
 // header parameters to Latin-1 and corrupts Persian filenames.
 // Busboy emits partsLimit upon reaching its limit, so reserve one more
 // boundary than the allowed 10 files + 1 report field.
 // The same inclusive-boundary behavior applies to file/field bytes. Permit
 // exactly the documented maximum; +1 is flagged and rejected below.
 let bb;try{bb=Busboy({headers:req.headers,defParamCharset:'utf8',limits:{fileSize:FILE_LIMIT+1,files:MAX_FILES,fields:1,fieldSize:REPORT_LIMIT+1,parts:MAX_FILES+2}})}catch{throw new HttpError(400,'invalid_upload','فایل‌های گزارش قابل خواندن نیستند.')}
 const tempDir=await mkdtemp(path.join(store.incoming,'upload-'));await chmod(tempDir,0o700);
 let reportText=null,problem=null,bytes=0,total=0;const files=[],pending=[];
 const flag=(status,code,message)=>{problem ||= new HttpError(status,code,message)};
 bb.on('field',(name,value,info)=>{
  if(name!=='report'||reportText!==null||info.valueTruncated)flag(info.valueTruncated?413:400,'invalid_report','اطلاعات گزارش معتبر نیست یا بیش از حد طولانی است.');
  else reportText=value;
 });
 bb.on('file',(field,file,info)=>{
  if(field!=='files'){flag(400,'invalid_upload','فایل پیوست معتبر نیست.');file.resume();return}
  const idx=files.length,entry={name:sanitizedFilename(info.filename),size:0,iv:randomBytes(12),tag:null,digest:''};files.push(entry);
  const knownMime=/^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime|3gpp)|audio\/(mpeg|mp3|wav|x-wav|mp4|webm|ogg|x-m4a|aac|3gpp|amr)|application\/pdf)$/i.test(info.mimeType||'');
  const knownExtension=/\.(?:jpe?g|png|webp|gif|heic|heif|mp4|mov|webm|3gp|mp3|wav|m4a|aac|amr|ogg|pdf)$/i.test(entry.name);
  if(!knownMime&&!((!info.mimeType||info.mimeType==='application/octet-stream')&&knownExtension))flag(400,'unsupported_file','نوع فایل پیوست پشتیبانی نمی‌شود.');
  const cipher=createCipheriv('aes-256-gcm',store.key,entry.iv);cipher.setAAD(Buffer.from(`attachment:${id}:${idx}`));
  const digest=createHash('sha256');
  const count=new Transform({transform(chunk,encoding,done){entry.size+=chunk.length;total+=chunk.length;digest.update(chunk);if(total>FILE_LIMIT)flag(413,'too_large','مجموع فایل‌ها باید حداکثر ۱۰۰ مگابایت باشد.');done(null,chunk)}});
  file.on('limit',()=>flag(413,'too_large','حجم فایل بیش از حد مجاز است.'));
  const target=path.join(tempDir,`${idx}.bin`);
  pending.push(pipeline(file,count,cipher,createWriteStream(target,{flags:'wx',mode:0o600})).then(async()=>{
   // Flush encrypted contents before the corresponding SQLite row can commit.
   // This relies on the filesystem and storage hardware honoring fsync.
   const handle=await open(target,'r');try{await handle.sync()}finally{await handle.close()}
   entry.tag=cipher.getAuthTag();entry.digest=digest.digest('hex');if(!entry.size)flag(400,'empty_file','فایل خالی پذیرفته نمی‌شود.');
  }).catch(()=>{flag(400,'invalid_upload','خواندن یا ذخیرهٔ فایل کامل نشد.')}));
 });
 bb.on('filesLimit',()=>flag(413,'too_many_files','حداکثر ۱۰ فایل پذیرفته می‌شود.'));
 bb.on('fieldsLimit',()=>flag(400,'invalid_report','اطلاعات گزارش معتبر نیست.'));
 bb.on('partsLimit',()=>flag(413,'too_large','تعداد بخش‌های گزارش بیش از حد مجاز است.'));
 try{
  await new Promise((resolve,reject)=>{
   req.on('data',chunk=>{bytes+=chunk.length;if(bytes>REQUEST_LIMIT){flag(413,'too_large','حجم گزارش بیش از حد مجاز است.');req.unpipe(bb);bb.destroy(problem)}});
   req.once('aborted',()=>bb.destroy(new Error('upload aborted')));
   req.once('error',error=>bb.destroy(error));
   bb.once('error',reject);bb.once('close',resolve);req.pipe(bb);
  });
  await Promise.all(pending);
  if(problem)throw problem;
  if(reportText===null)throw new HttpError(400,'invalid_report','اطلاعات گزارش ارسال نشده است.');
  const report=reportShape(reportText);
  const identity=validateReporterIdentity(report.reporter);
  // A report accepted before this rule can still be retried with the same
  // key and exact fingerprint. commit() refuses altered or new content.
  if(!identity.valid&&!existingSubmission)throw new HttpError(400,'invalid_identity',Object.values(identity.errors)[0]);
  if(identity.valid)report.reporter={...report.reporter,...identity.value};
  const h=createHash('sha256').update(Buffer.from(reportText)).update('\0');
  for(const f of files)h.update(JSON.stringify({name:f.name,size:f.size,digest:f.digest})).update('\0');
  return {tempDir,report,files,fingerprint:h.digest('hex')};
 }catch(error){await Promise.allSettled(pending);await rm(tempDir,{recursive:true,force:true});throw problem||error}
}

// Bound both attempts per key and total tracked keys. When all tracked keys
// are active, deny new ones until the window expires instead of growing RAM.
export function createAttemptLimiter({maxKeys=10000,maxAttempts=6,windowMs=15*60*1000,clock=Date.now}={}){
 const attempts=new Map();
 const limited=which=>{
  const now=clock();
  if(!attempts.has(which)&&attempts.size>=maxKeys){
   for(const [key,v] of attempts)if(!v.some(t=>now-t<windowMs))attempts.delete(key);
   if(attempts.size>=maxKeys)return true;
  }
  const values=(attempts.get(which)||[]).filter(t=>now-t<windowMs);
  if(values.length>=maxAttempts){attempts.set(which,values);return true}
  values.push(now);attempts.set(which,values);return false;
 };
 limited.clear=which=>attempts.delete(which);
 return limited;
}

export function createCentral(env,{publicRoot}={}){
 const appOrigin=new URL(env.APP_ORIGIN||'').origin,adminOrigin=new URL(env.ADMIN_ORIGIN||'').origin;
 const insecure=env.CENTRAL_ALLOW_INSECURE_DEV==='1';
 if(!insecure&&(new URL(appOrigin).protocol!=='https:'||new URL(adminOrigin).protocol!=='https:'||appOrigin===adminOrigin))
  throw new Error('Central service requires separate HTTPS APP_ORIGIN and ADMIN_ORIGIN');
 const token=String(env.BALE_BOT_TOKEN||'');if(token.length<16||token.length>256||/[^\x21-\x7e]/.test(token))throw new Error('BALE_BOT_TOKEN is required');
 const key=dataKey(env.CENTRAL_DATA_KEY),directory=path.resolve(String(env.CENTRAL_DATA_DIR||''));
 if(!env.CENTRAL_DATA_DIR||!path.isAbsolute(env.CENTRAL_DATA_DIR)||(publicRoot&&(directory===publicRoot||directory.startsWith(publicRoot+path.sep))))
  throw new Error('CENTRAL_DATA_DIR must be an absolute directory outside public assets');
 // Resolve symlinked parents before the store changes permissions or writes;
 // a seemingly external path must not point back into public assets.
 mkdirSync(directory,{recursive:true,mode:0o700});
 const realDirectory=realpathSync(directory);
 if(publicRoot&&(realDirectory===publicRoot||realDirectory.startsWith(publicRoot+path.sep)))throw new Error('CENTRAL_DATA_DIR must be outside public assets');
 const store=new CentralStore(realDirectory,key),active=new Set(),rateLimited=createAttemptLimiter();let uploads=0,logins=0,downloads=0;
 const limit=Number.isInteger(Number(env.CENTRAL_MAX_UPLOADS))?Math.max(1,Math.min(8,Number(env.CENTRAL_MAX_UPLOADS))):2;
 const maxAge=Number(env.BALE_MAX_AUTH_AGE_SECONDS)||7200;
 if(!Number.isFinite(maxAge)||maxAge<60||maxAge>86400)throw new Error('BALE_MAX_AUTH_AGE_SECONDS must be between 60 and 86400');
 function reporter(req){
  const identity=verifyBaleInitData(String(req.headers['x-bale-init-data']||''),token,{maxAgeSeconds:maxAge});
  return identity?{...identity,owner:userKey(key,identity.id)}:null;
 }
 function ip(req){const candidate=String(req.headers['x-real-ip']||'');return isIP(candidate)?candidate:(req.socket.remoteAddress||'unknown')}
 function session(req){return store.session(cookieValue(req,'__Host-ravi_staff'))}
 const denyOrigin=res=>fail(res,403,'origin','درخواست از مبدأ مجاز ارسال نشده است.');
 const staffCookie=(value,maxAge)=>`__Host-ravi_staff=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

 async function handle(req,res,url,{admin=false}={}){
  try{
   if(url.pathname==='/api/central/reports'&&req.method==='POST'&&!admin){
    const rejectUpload=(status,code,message,headers={})=>fail(res,status,code,message,{'Connection':'close',...headers});
    if(!isOrigin(req,appOrigin))return rejectUpload(403,'origin','درخواست از مبدأ مجاز ارسال نشده است.');
    const identity=reporter(req);if(!identity)return rejectUpload(401,'bale_auth','برای ارسال مرکزی، مینی‌اپ را دوباره از داخل بله باز کنید.');
    const owner=identity.owner;
    const submissionKey=String(req.headers['x-submission-key']||'');if(!KEY.test(submissionKey))return rejectUpload(400,'submission_key','شناسهٔ ارسال معتبر نیست.');
    const activeKey=`${owner}:${submissionKey}`;
    if(active.has(activeKey))return rejectUpload(409,'processing','ارسال قبلی هنوز در حال پردازش است؛ کمی بعد وضعیت را بررسی کنید.');
    if(uploads>=limit)return rejectUpload(503,'busy','سامانهٔ دریافت مشغول است؛ کمی بعد دوباره تلاش کنید.',{'Retry-After':'5'});
    uploads++;active.add(activeKey);
    try{
     const id='RV-'+randomBytes(16).toString('hex').toUpperCase();
     const upload=await receiveUpload(req,store,id,{existingSubmission:Boolean(store.status(owner,submissionKey))});
     let result;
     try{result=store.commit({id,owner,key:submissionKey,...upload,verifiedBaleId:identity.id})}catch(error){await rm(upload.tempDir,{recursive:true,force:true});throw error}
     if(result.conflict)return fail(res,409,'submission_conflict','این شناسه قبلاً برای محتوای دیگری ثبت شده است؛ پیش از ارسال تازه با مسئول سامانه بررسی کنید.');
     return json(res,{id:result.id,duplicate:result.duplicate},result.duplicate?200:201);
    }finally{uploads--;active.delete(activeKey)}
   }
   if(url.pathname==='/api/central/status'&&req.method==='GET'&&!admin){
    if(req.headers.origin&&req.headers.origin!==appOrigin)return denyOrigin(res);
    const identity=reporter(req);if(!identity)return fail(res,401,'bale_auth','برای بررسی، مینی‌اپ را دوباره از داخل بله باز کنید.');
    const owner=identity.owner;
    const key=url.searchParams.get('key')||'';if(!KEY.test(key))return fail(res,400,'submission_key','شناسهٔ ارسال معتبر نیست.');
    const found=store.status(owner,key);
    return json(res,found?{state:'accepted',id:found.id}:active.has(`${owner}:${key}`)?{state:'processing'}:{state:'missing'});
   }
   if(!url.pathname.startsWith('/api/staff/')||!admin)return fail(res,404,'not_found','مسیر پیدا نشد.');
   if(url.pathname==='/api/staff/login'&&req.method==='POST'){
    if(!isOrigin(req,adminOrigin))return denyOrigin(res);
    const data=await readJson(req,res);if(res.headersSent)return;
    const username=typeof data?.username==='string'?data.username.trim().toLowerCase().slice(0,64):'';
    const password=typeof data?.password==='string'?data.password.slice(0,256):'';
    const otp=typeof data?.otp==='string'?data.otp:'';
    if(rateLimited(`ip:${ip(req)}`)||rateLimited(`user:${username}`))return fail(res,429,'login_limit','تعداد تلاش‌ها بیش از حد است؛ بعداً دوباره تلاش کنید.',{'Retry-After':'900'});
    if(logins>=4)return fail(res,503,'busy','سامانه مشغول است؛ کمی بعد دوباره تلاش کنید.',{'Retry-After':'5'});
    logins++;
    try{
     const s=await store.authenticate(username,password,otp);
     if(!s){store.audit(/^[a-z][a-z0-9._-]{2,63}$/.test(username)?username:'unknown','login_failed');return fail(res,401,'login','نام کاربری، رمز یا کد یک‌بارمصرف نادرست است.')}
     rateLimited.clear(`user:${username}`);rateLimited.clear(`ip:${ip(req)}`);return json(res,{username:s.username,role:s.role,csrf:s.csrf},200,{'Set-Cookie':staffCookie(s.token,8*60*60)});
    }finally{logins--}
   }
   const s=session(req);if(!s)return fail(res,401,'staff_auth','ابتدا وارد کارتابل شوید.');
   if(req.method!=='GET'&&(!isOrigin(req,adminOrigin)||!sameToken(req.headers['x-csrf-token'],s.csrf)))return denyOrigin(res);
   if(url.pathname==='/api/staff/session'&&req.method==='GET')return json(res,{username:s.username,role:s.role,csrf:s.csrf});
   if(url.pathname==='/api/staff/logout'&&req.method==='POST'){store.logout(s);return json(res,{ok:true},200,{'Set-Cookie':staffCookie('',0)})}
   if(url.pathname==='/api/staff/audit'&&req.method==='GET'){
    if(s.role!=='admin')return fail(res,403,'forbidden','این بخش فقط برای مدیر مجاز است.');
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER);
    const items=store.listAudit(Number.isSafeInteger(before)&&before>0?before:Number.MAX_SAFE_INTEGER);
    store.audit(s.username,'audit_viewed');return json(res,{items});
   }
   if(url.pathname==='/api/staff/reports'&&req.method==='GET'){
    const before=Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER),items=store.listReports({before:Number.isFinite(before)?before:Number.MAX_SAFE_INTEGER});
    store.audit(s.username,'reports_list');return json(res,{items});
   }
   const match=url.pathname.match(/^\/api\/staff\/reports\/(RV-[A-F0-9]{32})(?:\/(status|files\/(\d+)))?$/);
   if(match){const [,id,action,index]=match;
    if(!action&&req.method==='GET'){const item=store.getReport(id);if(!item)return fail(res,404,'not_found','گزارش پیدا نشد.');store.audit(s.username,'report_opened',id);return json(res,item)}
    if(action==='status'&&req.method==='POST'){
     const data=await readJson(req,res);if(res.headersSent)return;
     if(!['new','in_review','closed'].includes(data?.status))return fail(res,400,'status','وضعیت معتبر نیست.');
     if(!store.changeStatus(id,data.status,s.username))return fail(res,404,'not_found','گزارش پیدا نشد.');return json(res,{ok:true});
    }
    if(index!==undefined&&req.method==='GET'){
     const n=Number(index);if(!Number.isSafeInteger(n)||n<0||n>=MAX_FILES)return fail(res,404,'not_found','فایل پیدا نشد.');
     const file=store.getAttachment(id,n);if(!file)return fail(res,404,'not_found','فایل پیدا نشد.');
     if(downloads>=2)return fail(res,503,'busy','دریافت فایل مشغول است؛ دوباره تلاش کنید.',{'Retry-After':'5'});
     downloads++;
     try{
      const decipher=()=>{const d=createDecipheriv('aes-256-gcm',key,file.iv);d.setAAD(Buffer.from(`attachment:${id}:${n}`));d.setAuthTag(file.tag);return d};
      // Verify the GCM tag before sending any plaintext. The immutable file is
      // read a second time for streaming, keeping memory bounded for 100 MB.
      await pipeline(createReadStream(file.path),decipher(),new Writable({write(_c,_e,cb){cb()}}));
      store.audit(s.username,'attachment_downloaded',id);
      const safe=encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.size,'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${safe}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
      await pipeline(createReadStream(file.path),decipher(),res);return;
     }finally{downloads--}
    }
   }
   return fail(res,404,'not_found','مسیر پیدا نشد.');
  }catch(error){
   if(error instanceof HttpError)return fail(res,error.status,error.code,error.message,url.pathname==='/api/central/reports'?{'Connection':'close'}:{});
   // Operational metadata only; do not log raw exceptions or uploaded data.
   console.error(JSON.stringify({event:'central_request_failed',route:url.pathname.split('/').slice(0,4).join('/')}));
   return fail(res,500,'central_error','عملیات انجام نشد؛ اطلاعات فرم را نگه دارید و دوباره تلاش کنید.');
  }
 }
 return {handle,store,appOrigin,adminOrigin,authorizeReporter:req=>Boolean(reporter(req)),close:()=>store.close()};
}
