const $=id=>document.getElementById(id);
let csrf='',currentId='',cursor=null,idleTimer=null,idleDeadline=0;
const IDLE_MS=30*60*1000;
const labels={new:'جدید',in_review:'در حال بررسی',closed:'بسته‌شده'};
function notice(text=''){$('notice').textContent=text}
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);return node}
function expireIdle(){
 if(!csrf)return;const oldCsrf=csrf;signedOut();notice('نشست به علت عدم فعالیت پایان یافت؛ دوباره وارد شوید.');
 // Revoke immediately if the server still considers the session live. The
 // sensitive DOM is cleared without waiting for this network request.
 fetch('/api/staff/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':oldCsrf},body:'{}'}).catch(()=>{});
}
function armIdle(){clearTimeout(idleTimer);idleDeadline=Date.now()+IDLE_MS;idleTimer=setTimeout(expireIdle,IDLE_MS)}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&csrf&&Date.now()>=idleDeadline)expireIdle()});
async function api(path,{method='GET',body}={}){
 const sessionAtStart=csrf;
 const response=await fetch('/api/staff/'+path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(method==='GET'?{}:{'X-CSRF-Token':csrf})},...(body?{body:JSON.stringify(body)}:{})});
 if(sessionAtStart&&sessionAtStart!==csrf)throw new Error('نشست پایان یافته است؛ دوباره وارد شوید.');
 if(response.status===401&&path!=='login')signedOut();
 let value;try{value=await response.json()}catch{throw new Error('پاسخ سرور قابل خواندن نیست.')}
 if(sessionAtStart&&sessionAtStart!==csrf&&response.status!==401)throw new Error('نشست پایان یافته است؛ دوباره وارد شوید.');
 if(!response.ok)throw Object.assign(new Error(value.error||'عملیات انجام نشد.'),{status:response.status,code:value.code});
 if(csrf)armIdle();return value;
}
function signedOut(){
 clearTimeout(idleTimer);idleTimer=null;idleDeadline=0;csrf='';currentId='';cursor=null;$('login-panel').hidden=false;$('inbox').hidden=true;$('logout').hidden=true;$('detail').hidden=true;
 $('audit-button').hidden=true;$('audit-panel').hidden=true;$('audit-list').replaceChildren();$('list').replaceChildren();$('more').hidden=true;
 for(const id of ['staff-name','report-title','report-meta','report-text','report-extra'])$(id).textContent='';
 $('report-answers').replaceChildren();$('report-files').replaceChildren();
 for(const id of ['username','password','otp','report-id'])$(id).value='';
}
async function signedIn(info){csrf=info.csrf;armIdle();$('staff-name').textContent=info.username;$('login-panel').hidden=true;$('inbox').hidden=false;$('logout').hidden=false;$('audit-button').hidden=info.role!=='admin';cursor=null;$('list').replaceChildren();await loadReports()}
async function loadReports(){
 const q=cursor?`?before=${encodeURIComponent(cursor)}`:'';
 const {items}=await api('reports'+q);if(!items.length&&!cursor)$('list').append(el('p','هنوز گزارشی دریافت نشده است.'));
 for(const r of items){
  const card=el('article');card.className='card';const text=el('div');text.append(el('strong',r.title),el('p',`${r.id} · ${new Date(r.created).toLocaleString('fa-IR')} · ${labels[r.status]||'نامشخص'}`));
  const open=el('button','مشاهده');open.addEventListener('click',()=>openReport(r.id));card.append(text,open);$('list').append(card);
 }
 cursor=items.length?items.at(-1).cursor:null;$('more').hidden=items.length<25;
}
async function openReport(id){
 notice();try{
  const item=await api(`reports/${encodeURIComponent(id)}`);currentId=item.id;
  const r=item.report;$('report-title').textContent=r.title||'گزارش';$('report-meta').textContent=`${item.id} · ${new Date(item.created).toLocaleString('fa-IR')}`;$('report-text').textContent=r.text||'';
  $('status').value=item.status;$('report-answers').replaceChildren();
  if(r.verifiedBaleId)$('report-answers').append(el('p',`شناسهٔ تأییدشدهٔ حساب بله: ${r.verifiedBaleId} (به‌معنای احراز نام یا هویت حقیقی نیست)`));
  const reporter=r.reporter||{};for(const [label,value] of [['نام اظهاری',reporter.name],['تلفن اظهاری',reporter.mobile],['استان',reporter.province],['رده',reporter.rank],['سمت',reporter.post]])if(value){const p=el('p',`${label}: ${value}`);$('report-answers').append(p)}
  for(const [key,value] of Object.entries(r.answers||{}))if(value){const p=el('p',`${r.answerLabels?.[key]||key}: ${value}`);$('report-answers').append(p)}
  if(!$('report-answers').children.length)$('report-answers').append(el('p','موردی ثبت نشده است.'));
  $('report-files').replaceChildren();for(const file of item.files){const li=el('li');const a=el('a',`${file.name} (${Math.ceil(file.size/1024)} کیلوبایت)`);a.href=`/api/staff/reports/${encodeURIComponent(item.id)}/files/${file.index}`;a.download=file.name;li.append(a);$('report-files').append(li)}
  if(!item.files.length)$('report-files').append(el('li','بدون فایل'));
  const {text,answers,reporter:ignoredReporter,files,...extra}=r;$('report-extra').textContent=JSON.stringify(extra,null,2);$('detail').hidden=false;$('detail').scrollIntoView({behavior:'smooth'});
 }catch(error){notice(error.message);if(error.status===401)signedOut()}
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();notice();const button=event.submitter;button.disabled=true;
 try{const info=await api('login',{method:'POST',body:{username:$('username').value,password:$('password').value,otp:$('otp').value}});await signedIn(info)}catch(error){notice(error.message)}finally{$('password').value='';$('otp').value='';button.disabled=false}
});
$('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:{}})}catch{}signedOut();notice('از کارتابل خارج شدید.')});
$('find-report').addEventListener('submit',event=>{event.preventDefault();const id=$('report-id').value.trim().toUpperCase();if(!/^RV-[A-F0-9]{32}$/.test(id)){notice('شناسهٔ دریافت معتبر نیست.');return}openReport(id)});
$('more').addEventListener('click',()=>loadReports().catch(error=>notice(error.message)));
$('audit-button').addEventListener('click',async()=>{try{const {items}=await api('audit');$('audit-list').replaceChildren();for(const item of items)$('audit-list').append(el('p',`${new Date(item.time).toLocaleString('fa-IR')} · ${item.actor} · ${item.action}${item.report_id?' · '+item.report_id:''}`));$('audit-panel').hidden=false}catch(error){notice(error.message)}});
$('close-audit').addEventListener('click',()=>{$('audit-panel').hidden=true});
$('close-detail').addEventListener('click',()=>{$('detail').hidden=true;currentId=''});
$('status-form').addEventListener('submit',async event=>{event.preventDefault();if(!currentId)return;try{await api(`reports/${encodeURIComponent(currentId)}/status`,{method:'POST',body:{status:$('status').value}});notice('وضعیت ثبت شد.');$('list').replaceChildren();cursor=null;await loadReports()}catch(error){notice(error.message)}});
try{await signedIn(await api('session'))}catch{signedOut()}
