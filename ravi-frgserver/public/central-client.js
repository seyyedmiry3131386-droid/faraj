// Central submission uses only the signed Bale initData; initDataUnsafe and
// browser-supplied user IDs are never used for authentication.
const failure=(message,code)=>Object.assign(new Error(message),{code});
async function signedData(){
 if(window.__raviBaleSdk)await Promise.race([window.__raviBaleSdk,new Promise(resolve=>setTimeout(resolve,5000))]);
 const value=window.Bale?.WebApp?.initData;
 if(typeof value!=='string'||!value)return null;
 return value;
}
export function newSubmissionKey(){
 if(crypto.randomUUID)return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
async function call(url,options){
 const initData=await signedData();
 if(!initData)throw failure('برای ارسال مرکزی، سامانه را از داخل بازوی بله باز کنید. پیش‌نویس در این مرورگر باقی می‌ماند.','bale_auth');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),900000);
 try{
  const response=await fetch(url,{...options,credentials:'same-origin',headers:{...options.headers,'X-Bale-Init-Data':initData},signal:controller.signal});
  let value;try{value=await response.json()}catch{throw failure('پاسخ سرور قابل خواندن نیست؛ وضعیت ارسال را بررسی کنید.','response')}
  if(!response.ok)throw failure(value.error||'ارسال انجام نشد؛ دوباره تلاش کنید.',value.code||'central_error');return value;
 }catch(error){
  if(controller.signal.aborted)throw failure('زمان ارسال تمام شد. پیش از ارسال دوباره، وضعیت را بررسی کنید.','timeout');
  if(error instanceof TypeError)throw failure('ارتباط قطع شد. ممکن است گزارش رسیده باشد؛ وضعیت را بررسی کنید.','network');
  throw error;
 }finally{clearTimeout(timer)}
}
export function sendCentral(pending,files){
 const form=new FormData();form.append('report',JSON.stringify(pending.report));
 for(const f of files)form.append('files',f.blob,f.name);
 return call('/api/central/reports',{method:'POST',headers:{'X-Submission-Key':pending.key},body:form});
}
export function centralStatus(key){return call(`/api/central/status?key=${encodeURIComponent(key)}`,{method:'GET',headers:{}})}
