import {createVoiceRecorder} from './voice-recorder.js';
import {recordingPreview} from './recording-preview.js';
import {resolveRelativeDate} from './jalali.js';
import {inMiniApp,loadHostSdk,emergencyBrowserUrl,copyText,openExternal,browserUrl} from './host.js';
import {requestLocation} from './device-permissions.js';
import {screenKey,screenOrder,markEntrance,tick} from './motion.js';
import {createFieldVoice} from './field-voice.js';
import {createDictation,speechSupported,appendSpeech} from './speech.js';
import {guidanceNeed,GUIDE_STEPS,FOLLOW_UPS,coreStepsFor,finalNarrative,stepsFor,canFinishGuide,missingFacts,readAnswer,triage,interviewProgress,carryGuideAnswers,unknownStagesInText,newsDomain,reportMeta} from './guidance.js';
import {orderedClientStep,orderedInterviewPath} from './interview-order.js';
import {uiLabel} from './ui-label.js';
import {renderGuide,triageBanner,triageKey} from './guide-view.js';
import {requestApi} from './api-client.js';
import {newSubmissionKey,sendCentral,centralStatus} from './central-client.js';
import {privacySummary} from './privacy.js';
import {newInterview,interviewRequest,answerCurrent,applyStep,stepBack,answersNarrative,guideFallback,interviewRecord,renderInterview} from './ai-interview.js';
import {enhanceSelects} from './legacy-select.js';
import {legacyShell,legacyWelcome} from './legacy-layout.js';
import {topicChoices,topicMatches,topicEntries} from './topic-view.js';
import {startAnalysisReview,needsAnalysisReview,reviewFrame,editReviewFact,advanceAnalysisReview,completeAnalysisReview,backAnalysisReview,renderAnalysisReview} from './analysis-review.js';
import {detailPages,pageComplete,pageHasInput,nextDetailPage,pageErrors,firstInvalidPage,sectionHasDetails,fieldIsAsked,GATE_COPY,isHearsay} from './question-flow.js';
import {renderFlow} from './flow-view.js';
import {prepareAnalysis,applyPrefills,applyTopicAssignments,activePrefills,rejectPrefill,confirmPrefills,applyRelativeDate,removeLegacyVehicleNarratives} from './extraction.js';
import {BANK_VERSION,CATEGORIES,requiredCategories,questionAnswered} from './question-bank.js';
import {normalizeFieldInput} from './inputs.js';
import {normalizePlateInput} from './plates.js';
import {migrateContact,setContactInput,socialPlatform,socialAddress} from './contacts.js';
import {answerIsUnknown,setAnswer,effectiveExtras,reconcileAnswers} from './answers.js';
import {savedPlatePreview} from './plate-ui.js';
import {EVENTS,localAnalysis,questionsFor,validateFiles,eventIds,detailId} from './domain.js';
import {YES,NO,detailSchema,extraSections,extraErrors,relevantExtraIds,entityGraph,removeEntityRow} from './details.js';
const paths={plus:'M12 5v14M5 12h14',spark:'m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3M20 2v4M18 4h4',edit:'m16 3 5 5-13 13H3v-5L16 3M14 5l5 5',mic:'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6',arrow:'M19 12H5m6-6-6 6 6 6',back:'M5 12h14m-6-6 6 6-6 6',chevron:'m9 6 6 6-6 6',down:'m7 10 5 5 5-5',check:'m5 12 4 4L19 6',shield:'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7l-9-4Zm-4 9 3 3 5-6',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',help:'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',file:'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8M8 16h6',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',folder:'M3 6h6l2 2h10v12H3V6Z',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',lock:'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4M12 14v3',bolt:'m13 2-9 12h7l-1 8 10-13h-8l1-7Z',upload:'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',clip:'m9 16 8-8a3 3 0 0 0-4-4L4 13a5 5 0 0 0 7 7L21 10M8 13l7-7',close:'m6 6 12 12M6 18 18 6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',image:'M3 3h18v18H3V3Zm0 13 6-6 5 6 3-3 4 4M16 7h.01',download:'M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4',search:'M20 20l-6-6M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',menu:'M4 6h16M4 12h16M4 18h16',stop:'M6 6h12v12H6V6Z',bulb:'M9 18h6M9 21h6M8 14a7 7 0 1 1 8 0l-1 2H9l-1-2Z',copy:'M8 8h13v13H8V8ZM16 5V2H2v14h3',car:'m3 9 2-5h14l2 5v10h-3v-3H6v3H3V9Zm0 0h18M6 12h2M16 12h2',card:'M2 5h20v14H2V5Zm0 5h20M5 15h5',leaf:'M21 3C8 1 1 9 5 16s17 4 16-13ZM4 21 16 9',refresh:'M20 8V3l-3 3a8 8 0 1 0 3 11M20 3h-5',external:'M14 3h7v7M10 14 21 3M10 3H3v18h18v-7'};
const icon=(n,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n]||paths.spark}"/></svg>`;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fa=n=>Number(n).toLocaleString('fa-IR');
const filesize=n=>n<1024*1024?`${fa(Math.ceil(n/1024))} کیلوبایت`:`${fa(Math.round(n/1024/1024*10)/10)} مگابایت`;
const app=document.querySelector('#app');
const emptyReporter=()=>({name:'',mobile:'',rank:'',post:'',province:''});
const initialState=(view='welcome')=>({view,step:0,text:'',region:'',answers:{},extra:{},analysis:null,qIndex:0,files:[],voice:false,recording:false,busy:false,confirmed:false,brief:false,askDetail:false,startInterviewAfterReview:false,guide:null,carried:null,ai:null,intakeGuide:null,completedGuide:null,pausedGuide:null,pausedAi:null,reporter:emptyReporter(),identityConfirmed:false,pendingSubmission:null,centralReceipt:false,newsDomain:'',qualityGrade:'',quantityNote:''});
let state=initialState(),reports=[],draft=null,config={ai:false,provider:'',interview:false,model:'',transcription:false,central:false,loaded:false,error:''},db,storageOK=true,saveTimer,toastTimer,questionHelp=false,errors='',fileURLs=[];
let lastRecording=null,recordingStarted=0,voiceTimer=null,transcriptReviewed=true,draftLoaded=false;
let voicePhase='idle',voiceURL='',lastTranscribed=null,connectionMessage='';
let dictationPhase='idle',dictationDraft='',guideError='',engineNote='';
// A host may grant or deny microphone access. Never pre-emptively block Bale;
// request it only on a tap and keep manual/file alternatives available.
let micBlocked=false;
const miniApp=inMiniApp();
loadHostSdk();
const dictation=createDictation({
 onState(phase){dictationPhase=phase;if(phase==='idle')dictationDraft='';render()},
 onPartial(text){dictationDraft=text;const el=document.querySelector('#dictation-partial');if(el)el.textContent=text},
 onFinal(text){dictationDraft='';state.text=appendSpeech(state.text,text).slice(0,6000);transcriptReviewed=false;autoSave();render()},
 onError(message,code){
  // A refused microphone will keep refusing; switch to the routes that work
  // instead of leaving a button that fails every time it is pressed.
  if(['not-allowed','service-not-allowed','audio-capture'].includes(code))micBlocked=true;
  errors=message;render();
 }
});
function stopDictation(){dictation.stop()}
const dbReady=new Promise((resolve,reject)=>{const req=indexedDB.open('ravi-v1',1);req.onupgradeneeded=()=>{req.result.createObjectStore('reports',{keyPath:'id'});req.result.createObjectStore('drafts')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
async function storeGet(store,key){const d=await dbReady;return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store)[key===undefined?'getAll':'get'](key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function storePut(store,value,key){const d=await dbReady;return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite');t.objectStore(store).put(value,...(key===undefined?[]:[key]));t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})}
let draftRevision=null;
class DraftConflict extends Error{}
// Compare and write/delete in one IndexedDB transaction. Another tab must not
// silently overwrite a newer draft, even if both tabs opened at the same time.
async function changeDraft(value){
 const d=await dbReady;
 return new Promise((resolve,reject)=>{
  const t=d.transaction('drafts','readwrite'),store=t.objectStore('drafts'),get=store.get('current');let conflict=false,next=null;
  get.onsuccess=()=>{
   const actual=get.result?(get.result.revision??0):null;
   if(actual!==draftRevision){conflict=true;t.abort();return}
   if(value===null)store.delete('current');
   else{next=(actual??0)+1;store.put({...value,revision:next},'current')}
  };
  t.oncomplete=()=>{draftRevision=next;resolve(next)};
  t.onabort=()=>reject(conflict?new DraftConflict('draft changed in another tab'):t.error||new Error('draft transaction aborted'));
  t.onerror=()=>{};
 });
}
const removeDraft=()=>changeDraft(null);
function setStorageStatus(ok,conflict=false){
 storageOK=ok;const el=document.querySelector('#storage-alert');if(!el)return;
 el.hidden=ok;if(!ok)el.innerHTML=`<span>${conflict?'پیش‌نویس در پنجرهٔ دیگری تغییر کرده است. این پنجره آن را بازنویسی نمی‌کند؛ متن خود را پیش از تازه‌سازی نگه دارید.':'پیش‌نویس ذخیره نشد. فضای ذخیره‌سازی یا حالت خصوصی مرورگر را بررسی کنید.'}</span> <button type="button" data-action="download-unsaved">دریافت متن فعلی</button>`;
}
function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('toast-visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('toast-visible'),4500)}
async function persist(){
 try{
  // Erasing a draft must not resurrect its former sensitive content after a
  // reload. The delete is queued even if an earlier write is still pending.
  if(!state.text.trim()&&!state.files.length&&!state.guide&&!state.ai&&!state.pausedGuide&&!state.pausedAi){await removeDraft();draft=null;setStorageStatus(true);return true}
  reconcileAnswers(state);
  const guide=state.guide?{...state.guide,pendingAdvance:null,autoAdvancedAt:0}:null;
  const value={text:state.text,region:state.region,analysis:state.analysis,analysisReview:state.analysisReview||null,prefillAudit:state.prefillAudit||[],prefillText:state.prefillText,clarificationHandled:state.clarificationHandled||false,answers:state.answers,extra:state.extra||{},step:state.step,qIndex:state.qIndex,flow:state.flow||null,files:state.files,ai:state.ai||null,guide,carried:state.carried||null,intakeGuide:state.intakeGuide||null,completedGuide:state.completedGuide||null,pausedGuide:state.pausedGuide||null,pausedAi:state.pausedAi||null,askDetail:Boolean(state.askDetail),startInterviewAfterReview:Boolean(state.startInterviewAfterReview),brief:state.brief||false,reporter:state.reporter||emptyReporter(),identityConfirmed:Boolean(state.identityConfirmed),pendingSubmission:state.pendingSubmission||null,updated:Date.now()};
  const revision=await changeDraft(value);draft={...value,revision};setStorageStatus(true);return true;
 }catch(error){setStorageStatus(false,error instanceof DraftConflict);toast(error instanceof DraftConflict?'پیش‌نویس در پنجرهٔ دیگری تغییر کرده است.':'ذخیرهٔ پیش‌نویس ممکن نشد؛ فضای ذخیره‌سازی مرورگر را بررسی کنید.');return false}
}
function autoSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,500)}
const api=requestApi;
function stopVoice(){voiceCapture.stop({discard:true});clearInterval(voiceTimer);state.recording=false}
const voiceCapture=createVoiceRecorder({
 onState(phase){voicePhase=phase;state.recording=phase!=='idle';clearInterval(voiceTimer);
  if(phase==='recording'){recordingStarted=Date.now();voiceTimer=setInterval(()=>{const el=document.querySelector('#record-timer');if(el){const n=Math.floor((Date.now()-recordingStarted)/1000);el.textContent=`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')} / 3:00`}},500)}
  render();
 },
 onError(message){errors=message;render()},
 onFile(file){rememberRecording(file);render();void transcribeAudio(file)}
});
function rememberRecording(file){if(lastRecording===file)return;if(voiceURL)URL.revokeObjectURL(voiceURL);lastRecording=file;lastTranscribed=null;voiceURL=URL.createObjectURL(file)}
function clearRecording(){if(voiceURL)URL.revokeObjectURL(voiceURL);voiceURL='';lastRecording=null;lastTranscribed=null}
function renderRecordingPreview(){return recordingPreview({url:voiceURL,hasRecording:Boolean(lastRecording),alreadyTranscribed:lastTranscribed===lastRecording,canRetry:config.transcription||!config.loaded,busy:state.busy||state.recording},escape)}
function miniAppVoicePanel(){
 const transcribes=config.transcription;
 return `<div class="voice-panel miniapp-voice">
  <p id="voice-status" role="status">${miniApp?'میکروفون در این برنامه در دسترس نیست.':'اجازهٔ میکروفون داده نشد.'} با ضبط‌کنندهٔ خود گوشی صدا را ضبط کنید و فایل را بفرستید.</p>
  <button class="primary" data-action="audio-capture" ${state.busy?'disabled':''}>${icon('mic')}ضبط با گوشی</button>
  <input id="audio-capture" type="file" accept="audio/*" capture hidden>
  <button class="secondary" data-action="audio-upload" ${state.busy?'disabled':''}>${icon('upload')}انتخاب فایل صوتی</button>
  <input id="audio-input" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.aac,.amr,.3gp" hidden>
  ${miniApp?'<button class="plain" data-action="open-browser">باز کردن در مرورگر گوشی</button>':''}
  <small>${transcribes?'فایل صوتی به متن تبدیل می‌شود؛ متن را پیش از ادامه بررسی کنید.':'تبدیل فایل صوتی به متن روی این سرور فعال نیست؛ فایل را دریافت کنید و شرح را بنویسید.'}</small>
  ${renderRecordingPreview()}
 </div>`;
}
// With our own speech server, recording goes to it and nowhere else. The
// browser's dictation is not offered: in Chrome and Edge it sends the audio to
// the browser maker's service, which is exactly what a self-hosted model is
// meant to avoid.
function localVoicePanel(){
 const rec=state.recording,busy=state.busy;
 const label=voicePhase==='requesting'?'منتظر اجازهٔ میکروفون… برای لغو دوباره بزنید.':voicePhase==='stopping'?'در حال آماده‌سازی صوت…':rec?'در حال ضبط؛ برای پایان دوباره بزنید.':busy?'در حال تبدیل صدا به متن…':'برای شروع ضبط روی میکروفون بزنید؛ ممکن است اجازه خواسته شود.';
 const destination=!config.loaded?'وضعیت سرویس گفتار هنوز مشخص نیست؛ پس از ضبط ممکن است تبدیل امتحان شود.':!config.transcription?'تبدیل گفتار فعال نیست؛ صوت برای پخش و دریافت نگه داشته می‌شود.':config.sttLocal?'پس از ضبط، صوت برای تبدیل به سرویس گفتار تنظیم‌شده ارسال می‌شود.':'پس از ضبط، صوت برای تبدیل به OpenAI ارسال می‌شود.';
 return `<div class="voice-panel">
  <button class="record-btn ${rec?'recording':''}" data-action="record" aria-label="${voicePhase==='requesting'?'لغو درخواست میکروفون':rec?'پایان ضبط':'شروع ضبط و درخواست اجازهٔ میکروفون'}" ${busy&&!rec?'disabled':''}>${icon(rec?'stop':'mic')}</button>
  <p id="voice-status" role="status">${escape(label)}</p>
  ${voicePhase==='recording'?'<span id="record-timer" class="record-timer">0:00 / 3:00</span>':''}
  ${busy?'<div class="busy-bar" style="width:min(260px,80%);border-radius:9px"></div>':''}
  <small>${escape(destination)}</small>
  <button class="plain audio-upload-button" data-action="audio-upload" ${busy||rec?'disabled':''}>${icon('upload')}انتخاب فایل صوتی</button>
  <input id="audio-input" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.aac,.amr,.3gp" hidden>
  ${miniApp?`<button class="plain" data-action="audio-capture" ${busy||rec?'disabled':''}>ضبط با برنامهٔ گوشی</button><input id="audio-capture" type="file" accept="audio/*" capture hidden><button class="plain" data-action="open-browser">اگر دسترسی ممکن نبود، باز کردن در مرورگر گوشی</button>`:''}
  ${renderRecordingPreview()}
 </div>`;
}
function voicePanel(){
 if(miniApp)return localVoicePanel();
 if(micBlocked)return miniAppVoicePanel();
 if(config.sttLocal)return localVoicePanel();
 const pending=['requesting','stopping'].includes(voicePhase);
 const listening=dictationPhase==='listening';
 const onDevice=speechSupported();
 const label=listening?'در حال شنیدن؛ صحبت کنید. برای پایان، دکمه را دوباره بزنید.':voicePhase==='requesting'?'منتظر اجازهٔ میکروفون…':voicePhase==='stopping'?'در حال ذخیرهٔ صوت…':state.recording?'در حال ضبط؛ برای پایان دکمه را بزنید.':state.busy?'در حال پردازش…':'';
 const dictateButton=onDevice?`<button class="record-btn ${listening?'recording':''}" data-action="dictate" aria-label="${listening?'پایان گفتن':'شروع گفتن'}" ${state.busy||pending||state.recording?'disabled':''}>${icon(listening?'stop':'mic')}</button>`:'';
 return `<div class="voice-panel">${dictateButton}
 <p id="voice-status" role="status">${escape(label)}</p>
 ${listening?`<p class="dictation-partial" id="dictation-partial">${escape(dictationDraft)}</p>`:''}
 ${voicePhase==='recording'?'<span id="record-timer" class="record-timer">0:00 / 3:00</span>':''}
 ${onDevice?'':'<small>مرورگر شما موتور تشخیص گفتار ندارد (مثلاً فایرفاکس). می‌توانید متن را بنویسید، یا صدا را ضبط کنید و فایل آن را به‌عنوان مستند نگه دارید.</small>'}
 ${window.self!==window.top?'<a class="plain" href="/" target="_blank" rel="noopener">باز کردن سامانه در تب جدا برای ضبط</a>':''}
 <details class="voice-fallback"><summary>ضبط فایل صوتی (نگهداری صدا به‌عنوان مستند)</summary>
  <button class="plain" data-action="record" ${state.busy||listening?'disabled':''}>${icon(state.recording?'stop':'mic')}${state.recording?'پایان ضبط':'ضبط صدا'}</button>
  <button class="plain audio-upload-button" data-action="audio-upload" ${state.busy||state.recording?'disabled':''}>${icon('upload')}انتخاب فایل صوتی</button>
  <input id="audio-input" type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.aac,.amr,.3gp" hidden>
  ${renderRecordingPreview()}
 </details></div>`;
}
async function checkConnection(){
 if(state.busy||state.recording)return;state.busy=true;connectionMessage='در حال بررسی اتصال…';errors='';render();
 try{await api('check',{});config.ai=true;config.loaded=true;config.error='';connectionMessage='اتصال متنی برقرار است. تبدیل صوت با ارسال فایل بررسی می‌شود.'}
 catch(e){connectionMessage=e.message}
 finally{state.busy=false;render()}
}
function changeView(view){stopVoice();state.view=view;errors='';render();window.scrollTo({top:0,behavior:'instant'})}
function stepper(){return `<div class="progress" aria-label="مراحل ثبت گزارش">${['شرح موقعیت','تکمیل اطلاعات','مستندات','مرور و ثبت'].map((x,i)=>`${i?'<div class="step-connector"></div>':''}<div class="step ${state.step===i?'current':state.step>i?'done':''}" ${state.step===i?'aria-current="step"':''}><span class="step-number">${state.step>i?icon('check'):fa(i+1)}</span><span>${x}</span></div>`).join('')}</div>`}
function shell(content){return legacyShell(content,{view:state.view,icon})}
function welcome(){return legacyWelcome({hasCurrent:!state.savedId&&Boolean(state.text.trim()||state.files.length),draft,icon})}
// Asked once, right after the description: a report can end here, or go on
// into the detailed questions. Two answers, nothing else on the screen.
function detailChoicePage(){return `<div class="content flow-content">${stepper()}<section class="panel focused-question detail-choice" aria-labelledby="detail-choice-title"><h2 id="detail-choice-title" class="question-title" tabindex="-1">آیا می‌خواهید گزارش تکمیلی بدهید؟</h2><div class="detail-choice-actions"><button class="primary" data-action="detail-yes">بله</button><button class="secondary" data-action="detail-no">خیر</button></div></section></div>`}
function pendingSubmissionPage(){return `<div class="content"><section class="panel"><h2>ارسال گزارش در انتظار تأیید</h2><p>پیش‌نویس و فایل‌ها برای جلوگیری از ارسال تکراری نگه داشته شده‌اند. تا دریافت شناسهٔ سرور، ثبت مرکزی تأیید نشده است.</p>${errors?`<p class="error-note" role="alert">${escape(errors)}</p>`:''}<div class="actions"><button class="primary" data-action="retry-central" ${state.busy?'disabled':''}>${state.busy?'در حال ارتباط…':'بررسی وضعیت و تلاش دوباره'}</button><button class="secondary" data-action="edit-pending" ${state.busy?'disabled':''}>بازگشت به ویرایش</button></div></section></div>`}
function home(){if(state.pendingSubmission)return pendingSubmissionPage();if(state.guide)return renderGuide(state.guide,{escape,fa,icon,stepper,miniApp},guideError);if(aiActive())return renderInterview(state.ai,{escape,icon,stepper,fa,miniApp},{loading:aiLoading,error:aiError});if(state.askDetail&&state.step>0)return detailChoicePage();if(state.step>0&&needsAnalysisReview(state))return renderAnalysisReview(state,{escape,fa,icon,stepper},errors);if(state.step===1)return questionPage();if(state.step===2)return evidencePage();if(state.step===3)return reviewPage();return `<div class="content">${stepper()}${draft&&!state.text?`<div class="resume-banner"><span>یک گزارش نیمه‌تمام دارید.</span><button class="plain" data-action="draft">ادامهٔ پیش‌نویس ${icon('arrow')}</button></div>`:''}<section class="hero"><h2>شرح گزارش</h2></section><div id="triage-slot" data-key="${triageKey(state.text)}">${triageBanner(state.text,{escape,icon},null,{miniApp})}</div><section class="composer" aria-label="شرح موقعیت"><p class="storage-note">برای بازیابی، پیش‌نویس و فایل‌های انتخابی به‌طور خودکار و بدون رمزگذاری اختصاصی در این مرورگر ذخیره می‌شوند؛ روی دستگاه مشترک احتیاط کنید.</p><div class="composer-tabs"><button class="${state.voice?'active':''}" data-action="voice-tab">${icon('mic')}ضبط صدا</button><button class="${!state.voice?'active':''}" data-action="text-tab">${icon('edit')}نوشتن شرح</button></div>${state.voice?voicePanel():''}<output id="news-domain" class="news-domain-hint" aria-live="polite" ${state.text.trim()?'':'hidden'}>${state.text.trim()?`حوزه خبری پیشنهادی: ${escape(newsDomain(state.text).join('، '))}`:''}</output><textarea id="description" aria-label="شرح موقعیت" placeholder="چه اتفاقی افتاده؟ به زبان خودتان و در چند جمله توضیح دهید…" maxlength="6000" ${state.busy?'disabled':''}>${escape(state.text)}</textarea>${!transcriptReviewed&&state.text?'<p class="transcript-note">متن از صوت تبدیل شده است؛ نام‌ها، پلاک و شماره‌ها را پیش از تحلیل بررسی و اصلاح کنید.</p>':''}<div class="composer-bottom"><div class="input-meta"><span id="char-count">${fa(state.text.length)} / ۶۰۰۰</span></div><button class="primary" id="analyze-btn" data-action="analyze" ${state.text.trim().length<3||state.busy||state.recording?'disabled':''}>${icon('spark')}${state.busy?'در حال بررسی…':'تحلیل و ادامه'}${icon('arrow')}</button></div>${state.busy?'<div class="busy-bar"></div>':''}</section>${engineNote?`<p class="engine-note" role="status">${escape(engineNote)}</p>`:''}${errors?`<div class="error-note" role="alert">${escape(errors)}${state.text.trim().length>=3?'<div><button class="secondary" data-action="analysis-preview">ادامه با مسیر پایه</button></div>':''}</div>`:''}</div>`}
function header(title,sub,ic='spark'){return `<div class="flow-header"><div class="mini-brand">${icon(ic)}</div><h2>${escape(title)}</h2><p>${sub}</p></div>`}

const newRow=()=>({_id:Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('')});
function applyCarriedAnswers(){
 if(state.carried&&state.carried.forText===state.text){
  for(const [id,value] of Object.entries(state.carried.answers))if(!String(state.answers[id]||'').trim())setAnswer(state,id,value,{group:['person','object','vehicle','contact'].includes(id)});
  const row=state.carried.sourceRow;
  if(row&&Object.keys(row).length){const data=state.extra.source??={enabled:false,rows:[]};const r=data.rows[0]??(data.rows[0]={...newRow(),_auto:true});for(const [k,v] of Object.entries(row))if(!r[k])r[k]=v;data.enabled=true}
  if(state.carried.detailsUnknown)for(const id of relevantExtraIds(state.analysis))if(id.startsWith('details_')&&!String(state.answers[id]||'').trim())setAnswer(state,id,'اطلاعات بیشتری ندارم');
  reconcileAnswers(state);
 }
}
function acceptAnalysis(raw){
 state.analysis=prepareAnalysis(raw,state.text);reconcileAnswers(state);
 if(removeLegacyVehicleNarratives(state))toast('یک برداشت قدیمی از مشخصه وسیله کنار گذاشته شد؛ متن اصلی محفوظ است.');
 applyPrefills(state,newRow);applyRelativeDate(state,newRow,resolveRelativeDate);applyTopicAssignments(state);
 applyCarriedAnswers();
 const first=detailId(state.analysis.event);
 if(state.extra.details&&!state.extra[first]){state.extra[first]=state.extra.details;delete state.extra.details}
 if(state.answers.details&&!state.answers[first]){state.answers[first]=state.answers.details;delete state.answers.details}
 for(const row of state.extra.contact?.rows||[])migrateContact(row);
 for(const data of Object.values(state.extra))for(const row of data.rows||[])row._id??=newRow()._id;
 state.qIndex=Math.max(0,Math.min(state.qIndex,currentQuestions().length-1));
}
function labelFor(id,record){return record?.answerLabels?.[id]||answerLabel[id]||(record?.analysis||state.analysis)?.questions?.find(q=>q.id===id)?.title||''}
function editTopics(){
 const a=state.analysis;
 modal('موضوع‌ها و بخش‌های این گزارش',`<p>هر گزارش می‌تواند چند دسته و چند موضوع داشته باشد. انتخاب‌ها قابل اصلاح‌اند.</p>${a.observationOnly||a.needsClarification?'':`<h3>دسته‌های اصلی مرتبط</h3><p>برای دسته‌های انتخاب‌شده پاسخ به بخش اصلی لازم است؛ «نمی‌دانم» هم پاسخ معتبر است. دسته‌های دیگر اختیاری‌اند.</p><div class="category-options">${Object.entries(CATEGORIES).map(([id,c])=>`<label class="topic-option"><input type="checkbox" data-category="${id}" ${requiredCategories(a).includes(id)?'checked':''}><span><b>${c.title}</b><small>${c.description}</small></span></label>`).join('')}</div>`}${topicChoices(a,escape)}<button class="primary" data-action="apply-topics">اعمال و تنظیم سؤال‌ها</button>`)
 document.querySelector('#topic-search')?.addEventListener('input',e=>{
  let visible=0;
  document.querySelectorAll('[data-topic-choice]').forEach(row=>{row.hidden=!topicMatches(row.dataset.topicSearch,e.target.value);if(!row.hidden)visible++});
  document.querySelector('.topic-search-empty').hidden=visible>0;
 });
}
function applyTopics(){
 const events=[...document.querySelectorAll('[data-topic]:checked')].map(el=>el.dataset.topic);
 if(!events.length)return toast('حداقل یک موضوع انتخاب کنید.');
 const categoryInputs=document.querySelectorAll('[data-category]');
 const categorySelection=[...document.querySelectorAll('[data-category]:checked')].map(el=>el.dataset.category);
 if(categoryInputs.length&&!categorySelection.length)return toast('حداقل یک دستهٔ اصلی انتخاب کنید.');
 const prior=state.analysis;
 // Changing the event set recalculates its mandatory coverage before manual adjustment.
 const sameTopics=events.join('|')===eventIds(prior).join('|');
 acceptAnalysis({...prior,events,categorySelection:sameTopics?categorySelection:[],reviewed:true});
 state.analysis.eventEvidence=Object.fromEntries(Object.entries(prior.eventEvidence||{}).filter(([id])=>events.includes(id)));
 startAnalysisReview(state);questionHelp=false;errors='';closeModal();persist();render();
 toast('سؤال‌ها بر پایهٔ چهار دسته تنظیم شدند؛ جزئیات نامعلوم اختیاری‌اند.')
}
function showQuestionBank(){
 const questions=Object.fromEntries(questionsFor({events:Object.keys(EVENTS),event:'other'}).map(q=>[q.id,q]));
 modal('بانک سؤال‌های ثبت گزارش',`<p>چهار دسته، قابل ترکیب در یک گزارش. پاسخ به بخش اصلی لازم است، اما همهٔ کادرها اختیاری هستند و «نمی‌دانم» پذیرفته می‌شود.</p>${Object.entries(CATEGORIES).map(([id,c])=>`<section class="bank-category"><h3>${c.title}</h3><p>${c.description}</p>${c.sections.filter(x=>x!=='event_details').map(section=>{const schema=detailSchema(section,'other');return schema?`<details><summary>${escape(schema.title)}</summary><p>${escape(questions[section]?.title||'')}</p><p>${schema.fields.filter(f=>fieldIsAsked(section,f.id)).map(f=>escape(f.label)).join(' · ')}</p></details>`:''}).join('')}${id==='event'?topicEntries().map(([event,e])=>`<details><summary>${escape(e.title)}</summary><p>${escape(e.detail)}</p><p>${detailSchema(detailId(event),event).fields.filter(f=>fieldIsAsked(detailId(event),f.id)).map(f=>escape(f.label)).join(' · ')}</p></details>`).join(''):''}</section>`).join('')}`)
}


async function finishClarification(){
 const value=state.answers.clarify?.trim();if(!value)return;
 if(answerIsUnknown(value)){
  acceptAnalysis({...state.analysis,clarificationHandled:true,clarification:{needed:false},followups:[],questions:[],prompts:[]});
  state.answers.details_other='اطلاعات بیشتری ندارم';state.qIndex=0;errors='';await persist();render();return;
 }
 const addition=`\n\nتوضیح تکمیلی گزارش‌دهنده: ${value}`;
 if(state.text.length+addition.length>6000){errors='شرح و توضیح تکمیلی در مجموع باید حداکثر ۶۰۰۰ نویسه باشند؛ توضیح را کوتاه‌تر کنید.';render();return}
 state.text+=addition;state.clarificationHandled=true;state.step=0;state.confirmed=false;await analyze(true);
}
function bindPlateInputs(){
 document.querySelectorAll('[data-plate-template]').forEach(el=>el.addEventListener('change',e=>{const index=+e.target.dataset.plateTemplate,row=state.extra.vehicle.rows[index];row.plateTemplate=e.target.value;delete row._plateSkipped;row.plateDrafts??={};row.plateDrafts[row.plateTemplate]??={};state.confirmed=false;errors='';persist();render();document.querySelector(`[data-plate-template="${index}"]`)?.focus()}));
 document.querySelectorAll('[data-plate-part]').forEach(el=>{
  const update=value=>{const row=state.extra.vehicle.rows[+el.dataset.plateRow];el.value=normalizePlateInput(row,el.dataset.platePart,value);row.plateDrafts??={};row.plateDrafts[row.plateTemplate]??={};row.plateDrafts[row.plateTemplate][el.dataset.platePart]=el.value;delete row._plateSkipped;state.confirmed=false;errors='';autoSave();refreshQuestionButton()};
  el.addEventListener('input',()=>update(el.value));
  el.addEventListener('paste',e=>{e.preventDefault();update(el.value.slice(0,el.selectionStart)+e.clipboardData.getData('text')+el.value.slice(el.selectionEnd))});
 });
}

function focusQuestion(){const el=document.querySelector('.question-title');if(el){el.tabIndex=-1;el.focus({preventScroll:true});el.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}}
function currentExtra(){return effectiveExtras(state.extra,state.answers)}
// A brief report has no questionnaire at all: every place that asks «what is
// left to answer» sees an empty list, so nothing routes the reporter back into
// questions they chose to skip.
function currentQuestions(){return state.brief||aiCovers()?[]:(state.analysis?questionsFor(state.analysis):[])}
function currentExtraSections(){return extraSections(currentExtra(),state.analysis?.event,relevantExtraIds(state.analysis),state.analysis)}
function extraSummary(sections,editable=false){return sections.map(section=>`<section class="extra-summary"><div class="review-header"><h3>${escape(section.title)}</h3>${editable?`<button class="plain" data-edit-section="${section.id}">${icon('edit')}ویرایش</button>`:''}</div>${section.rows.map((row,i)=>`${section.singular?`<h4>${escape(section.singular)} ${fa(i+1)}</h4>`:''}${row.map(f=>`<div class="answer-line"><label>${escape(f.label)}</label><div class="answer-value">${f.plate?savedPlatePreview(f.plate):''}<p dir="auto">${escape(f.value)}</p></div></div>`).join('')}`).join('')}</section>`).join('')}
function formatExtraText(sections=[]){return sections.map(s=>`${s.title}:\n${s.rows.map((r,i)=>`${s.singular?`${s.singular} ${i+1}\n`:''}${r.map(f=>`${f.label}: ${f.value}`).join('\n')}`).join('\n\n')}`).join('\n\n')}
function prefillPanel(q){
 const entries=activePrefills(state,q.id);if(!entries.length)return '';
 const schema=detailSchema(q.id,state.analysis.event);
 return `<details class="flow-prefill"><summary>${icon('spark')}بخش‌هایی از پاسخ را از شرح شما وارد کردم.</summary><p>این پاسخ‌ها قابل اصلاح یا حذف‌اند.</p>${entries.map(p=>`<div class="prefill-item"><b>${escape(p.field==='answer'?'پاسخ این سؤال':schema?.fields.find(f=>f.id===p.field)?.label||p.field)}</b><p>${escape(p.editedValue??p.value)}</p><details><summary>عبارت منبع</summary><blockquote>${escape(p.evidence)}</blockquote></details><button class="plain" data-reject-prefill="${state.prefillAudit.indexOf(p)}">حذف این پاسخ</button></div>`).join('')}</details>`;
}
function flowState(q){
 if(!state.flow||state.flow.section!==q.id)state.flow={section:q.id,phase:'main',row:0,page:null,showKnown:false};
 return state.flow;
}
function flowPages(q,row){return detailPages(q.id,row,state.analysis.event,{analysis:state.analysis,extra:currentExtra(),answers:state.answers,text:state.text,rowIndex:state.extra[q.id]?.rows?.indexOf(row)||0})}
function flowFrame(q){
 const flow=flowState(q),data=state.extra[q.id],schema=detailSchema(q.id,state.analysis.event);
 if(flow.phase==='fields'&&(!data?.enabled||answerIsUnknown(state.answers[q.id])))flow.phase='main';
 flow.row=Math.max(0,Math.min(flow.row||0,Math.max(0,(data?.rows?.length||1)-1)));
 const row=data?.rows?.[flow.row]||{},pages=flowPages(q,row);
 let pageIndex=pages.findIndex(p=>p.id===flow.page);
 if(flow.phase==='fields'&&pageIndex<0){pageIndex=nextDetailPage(pages,row,-1,flow.showKnown);if(pageIndex<0)flow.phase=schema?.repeat?'more':'main';else flow.page=pages[pageIndex].id}
 return {flow,schema,row,pages,pageIndex,page:pages[pageIndex],hasDetails:sectionHasDetails(q.id,currentExtra()[q.id],state.analysis.event)};
}
function refreshFlow(){errors='';questionHelp=false;state.confirmed=false;persist();render();focusQuestion()}
function advanceSection(){
 const q=currentQuestions()[state.qIndex];confirmPrefills(state,q.id);state.flow=null;
 if(state.qIndex<currentQuestions().length-1)state.qIndex++;else state.step=2;
 refreshFlow();
}
function beginDetails(showKnown=false,rowIndex){
 const q=currentQuestions()[state.qIndex],flow=flowState(q);
 state.extra[q.id]??={enabled:true,rows:[]};const data=state.extra[q.id];data.enabled=true;
 if(!data.rows.length)data.rows.push(newRow());
 if(q.group&&answerIsUnknown(state.answers[q.id]))setAnswer(state,q.id,YES,{group:true});
 flow.row=rowIndex??flow.row??0;flow.showKnown=showKnown;
 const row=data.rows[flow.row],pages=flowPages(q,row),index=nextDetailPage(pages,row,-1,showKnown);
 if(index<0){flow.phase=detailSchema(q.id,state.analysis.event)?.repeat?'more':'main'}
 else{flow.phase='fields';flow.page=pages[index].id}
 refreshFlow();
}
function validateCurrentSection(){
 const q=currentQuestions()[state.qIndex],data=currentExtra()[q.id];
 const problems=extraErrors(q.id,data,state.analysis.event);if(!problems.length)return true;
 for(const [index,row] of (data?.rows||[]).entries()){
  const p=firstInvalidPage(q.id,row,state.analysis.event,{analysis:state.analysis,extra:currentExtra()});
  if(p){state.flow={section:q.id,phase:'fields',row:index,page:p.id,showKnown:true};break}
 }
 errors=problems.join(' ');render();focusQuestion();return false;
}
function finishFlowSection(){if(validateCurrentSection())advanceSection()}
function answerChoice(value){
 const q=currentQuestions()[state.qIndex];
 if(q.group&&value===NO&&sectionHasDetails(q.id,currentExtra()[q.id],state.analysis.event)){finishFlowSection();return}
 setAnswer(state,q.id,value,{group:q.group});
 if(q.group){if(value===YES)beginDetails();else advanceSection();return}
 // Keyword taps commit the choice and move on; the user need not tap twice.
 errors='';persist();nextQuestion();
}
function markSectionUnknown(){
 const q=currentQuestions()[state.qIndex],c=flowFrame(q);
 if(String(state.answers[q.id]||'').trim())return;
 // «No more» does not erase previously entered or confirmed details.
 if(c.hasDetails)return finishFlowSection();
 setAnswer(state,q.id,q.group?NO:'اطلاعی ندارم');
 if(q.id==='clarify')return finishClarification();
 advanceSection();
}
function skipFlowSection(){
 const q=currentQuestions()[state.qIndex];if(!q)return;
 const c=flowFrame(q);
 if(c.flow.phase==='fields'){
  if(pageHasInput(c.page,c.row))return;
  // The reporter may have said they saw part of a plate but not be able to
  // provide its digits. Keep that answer without inventing or requiring digits.
  if(c.page?.plate)c.row._plateSkipped=true;
 }
 finishFlowSection();
}
function addFlowRow(){
 const q=currentQuestions()[state.qIndex];if(!validateCurrentSection())return;
 const data=state.extra[q.id];if(data.rows.length>=20)return;
 data.rows.push(newRow());beginDetails(false,data.rows.length-1);
}
function backQuestion(){
 const q=currentQuestions()[state.qIndex],c=flowFrame(q),f=c.flow;
 if(f.phase==='fields'){
  if(c.pageIndex>0)f.page=c.pages[c.pageIndex-1].id;
  else if(f.row>0){f.row--;const pages=flowPages(q,state.extra[q.id].rows[f.row]);f.page=pages.at(-1)?.id}
  else f.phase='main';
 }else if(f.phase==='more'){
  const p=c.pages.at(-1);if(p){f.phase='fields';f.page=p.id;f.showKnown=true}else f.phase='main';
 }else if(f.phase==='gate')f.phase='main';
 else{state.flow=null;if(state.qIndex>0)state.qIndex--;else if(state.completedGuide?.forText===state.text){state.guide={...state.completedGuide,pendingAdvance:null,autoAdvancedAt:0};refreshFlow();focusGuide();return}else state.step=0}
 refreshFlow();
}
async function nextQuestion(){
 const q=currentQuestions()[state.qIndex];if(state.busy)return;
 const c=flowFrame(q),f=c.flow;
 if(f.phase==='main'){
  if(!String(state.answers[q.id]||'').trim())return;
  if(q.required&&!questionAnswered(q,state.answers,currentExtra()))return;
  if(q.id==='clarify')return finishClarification();
  if(answerIsUnknown(state.answers[q.id]))return advanceSection();
  if(q.group){if(state.answers[q.id]===YES&&!c.hasDetails)return beginDetails();return finishFlowSection()}
  if(q.id==='source'&&isHearsay(state.answers.source)&&c.pages.some(p=>p.id==='informant'&&!pageComplete(p,c.row)))return beginDetails();
  if(String(state.answers[q.id]||'').trim()&&c.schema&&c.pages.some(p=>!pageComplete(p,c.row))){f.phase='gate';refreshFlow();return}
  return finishFlowSection();
 }
 if(f.phase==='fields'){
  if(!pageHasInput(c.page,c.row))return;
  const problems=pageErrors(q.id,c.row,state.analysis.event,c.page);
  if(problems.length){errors=problems.join(' ');render();return}
  const next=nextDetailPage(c.pages,c.row,c.pageIndex,f.showKnown);
  if(next>=0){f.page=c.pages[next].id;refreshFlow();return}
  const rows=state.extra[q.id].rows;
  if(f.row+1<rows.length)return beginDetails(f.showKnown,f.row+1);
  if(c.schema.repeat){f.phase='more';refreshFlow();return}
  return finishFlowSection();
 }
}
function openReviewEditor(index){
 const p=reviewFrame(state).entries.find(p=>p.index===index);if(!p||p.unavailable)return;
 const field=p.fieldSchema,max=p.field==='answer'?2000:field?.max||300;
 modal(`اصلاح ${p.label}`,`<label class="review-edit-label" for="review-edit-value">${escape(p.label)}</label><textarea class="field" id="review-edit-value" rows="4" maxlength="${max}" ${field?.numeric?'inputmode="numeric" dir="ltr"':''}>${escape(p.value)}</textarea><p class="storage-note">با خالی‌گذاشتن این کادر، پاسخ حذف می‌شود.</p><p id="review-edit-error" class="error-note" role="alert" hidden></p><div class="actions"><button class="secondary" data-action="close-modal">انصراف</button><button class="primary" id="save-review-edit">ذخیرهٔ اصلاح</button></div>`);
 const input=document.querySelector('#review-edit-value');input.focus();
 if(field?.numeric)input.addEventListener('input',()=>{input.value=normalizeFieldInput(field,input.value)});
 document.querySelector('#save-review-edit').onclick=()=>{
  const error=editReviewFact(state,index,input.value);
  if(error){const note=document.querySelector('#review-edit-error');note.hidden=false;note.textContent=error;return}
  applyTopicAssignments(state);closeModal();persist();render();focusQuestion();
 };
}
function prepareQuestionAfterReview(){
 // Kept inside so the function stays self-contained (tests run it in isolation).
 const guideAnswered=id=>{
  const c=state.carried;if(!c||c.forText!==state.text)return false;
  if(id.startsWith('details_'))return c.detailsUnknown&&state.answers[id]==='اطلاعات بیشتری ندارم';
  return Object.hasOwn(c.answers,id)&&state.answers[id]===c.answers[id];
 };
 const qs=currentQuestions();
 while(state.qIndex<qs.length){
  const q=qs[state.qIndex];
  if(state.flow?.section===q.id||!state.analysisReview?.complete)return;
  const blocked=state.carried?.forText===state.text?(state.carried.blockedSections||[]):[];
  if(blocked.includes(q.id)||(q.id.startsWith('details_')&&blocked.includes('details_*'))){state.qIndex++;continue}
  const reviewedAnswer=(state.prefillAudit||[]).some(p=>p.section===q.id&&p.field==='answer'&&p.status==='confirmed'&&state.answers[q.id]===(p.editedValue??p.value));
  if(reviewedAnswer&&answerIsUnknown(state.answers[q.id])){state.qIndex++;continue}
  // Answered in the guided interview: the reporter has already been asked
  // this, in plainer words, a minute ago. Asking again is the repeat they
  // noticed. An «I don't know» there is final here; a real answer is in the
  // narrative and, for a gated section, still opens its detail pages below.
  if(guideAnswered(q.id)&&(answerIsUnknown(state.answers[q.id])||!q.group)){state.qIndex++;continue}
  const accepted=activePrefills(state,q.id).some(p=>p.status==='confirmed');
  if(!accepted||!q.group&&!state.answers[q.id]||extraErrors(q.id,currentExtra()[q.id],state.analysis.event).length)return;
  const data=currentExtra()[q.id],rows=data?.rows?.length?data.rows:[{}];
  const remaining=rows.some(row=>nextDetailPage(flowPages(q,row),row)>=0);
  if(remaining){state.flow={section:q.id,phase:'gate',row:0,page:null,showKnown:false};return}
  state.qIndex++;
 }
}
function questionPage(){
 prepareQuestionAfterReview();
 const qs=currentQuestions(),q=qs[state.qIndex];if(!q){state.step=2;return evidencePage()}
 const c=flowFrame(q),data=currentExtra()[q.id];
 const rows=extraSections({[q.id]:data},state.analysis.event,[q.id],state.analysis);
 const known=rows.length?`<details class="flow-known"><summary>جزئیات ثبت‌شدهٔ این بخش</summary>${extraSummary(rows)}<button class="plain" data-action="flow-edit">ویرایش این جزئیات</button></details>`:'';
 const rowSections=data?extraSections({[q.id]:{...data,rows:[c.row]}},state.analysis.event,[q.id],state.analysis):[];
 const rowSummary=rowSections.length?`<details class="flow-known"><summary>نمایش اطلاعات این مورد</summary>${extraSummary(rowSections)}</details>`:'';
 return renderFlow({...c,q,analysis:state.analysis,text:state.text,answer:state.answers[q.id]||'',unknown:answerIsUnknown(state.answers[q.id]),known,rowSummary,rowCount:data?.rows?.length||0,pageCount:c.pages.length,index:state.qIndex,total:qs.length,gateTitle:GATE_COPY[q.id]||'جزئیات بیشتری دربارهٔ این اتفاق می‌دانید؟',prefill:prefillPanel(q),error:errors,help:questionHelp,canNext:c.flow.phase==='fields'||!q.required||questionAnswered(q,state.answers,currentExtra())},{icon,escape,fa,stepper,miniApp});
}
function filesMarkup(editable=true,files=state.files){return `<div class="file-list">${files.map((f,i)=>{let thumb=icon(f.type.startsWith('image/')?'image':'file');if(/^image\/(?:jpeg|png|webp|gif)$/.test(f.type)){const url=URL.createObjectURL(f.blob);fileURLs.push(url);thumb=`<img class="file-thumb" src="${url}" alt="پیش‌نمایش ${escape(f.name)}">`}return `<div class="file-item">${thumb.startsWith('<img')?thumb:`<span class="file-thumb">${thumb}</span>`}<div class="file-info"><b dir="auto">${escape(f.name)}</b><small>${filesize(f.size)} · آماده</small></div>${icon('check','file-ok')}<button class="icon-button" data-${editable?'remove':'download'}-file="${i}" aria-label="${editable?'حذف':'دریافت'} ${escape(f.name)}">${icon(editable?'trash':'download')}</button></div>`}).join('')}</div>`}
function evidencePage(){return `<div class="content">${stepper()}${header('روایتتان را با مستندات کامل کنید.','فایل‌های مرتبط را اضافه کنید؛ پیش از ثبت، دوباره آن‌ها را می‌بینید.','clip')}<section class="panel"><label class="dropzone" id="dropzone"><input type="file" class="visually-hidden" id="file-input" aria-label="انتخاب مستندات" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime,video/3gpp,audio/mpeg,audio/wav,audio/mp4,audio/webm,audio/ogg,audio/aac,audio/amr,audio/3gpp,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp4,.mov,.webm,.3gp,.mp3,.wav,.m4a,.aac,.amr,.ogg,.pdf" multiple><span class="upload-icon">${icon('upload')}</span><b>فایل‌ها را اینجا رها کنید یا انتخاب کنید</b><span class="drop-hint">تصویر، ویدئو، فایل صوتی یا سند PDF</span><span class="fake-button">${icon('plus')} انتخاب مستندات</span></label><label class="secondary camera-picker">${icon('image')}گرفتن عکس با دوربین<input type="file" class="visually-hidden" id="photo-capture" aria-label="گرفتن عکس با دوربین" accept="image/*" capture="environment"></label><p class="storage-note">فقط فایل‌هایی که خودتان انتخاب می‌کنید خوانده می‌شوند. ${config.central?'اگر انتخاب‌گر بله باز نشد، فایل را با برنامهٔ گوشی آماده کنید و دوباره در بله انتخاب کنید؛ ثبت مرکزی در مرورگر مستقل ممکن است بدون احراز بله رد شود.':'اگر انتخاب‌گر بله باز نشد، از مرورگر گوشی استفاده کنید.'}</p>${miniApp?'<button class="plain" data-action="open-browser">باز کردن سامانه در مرورگر گوشی</button>':''}<div class="upload-footnote"><span>حداکثر ۱۰ فایل · مجموع ۱۰۰ مگابایت</span><span>${fa(state.files.length)} فایل · ${filesize(state.files.reduce((n,f)=>n+f.size,0))}</span></div>${filesMarkup()}${errors?`<div class="error-note" role="alert">${escape(errors)}</div>`:''}</section><p class="storage-note">${icon('lock')}${config.central?'پس از تأیید و ثبت، فایل‌ها همراه گزارش به سامانهٔ مرکزی برای بررسی مسئولان مجاز ارسال می‌شوند.':'فایل‌ها همراه گزارش در این مرورگر ذخیره می‌شوند؛ به مرجع دیگری ارسال نمی‌شوند.'}</p><div class="actions"><button class="secondary" data-action="evidence-back">${icon('back')}بازگشت</button><button class="primary" data-action="review">${state.files.length?'تأیید مستندات و ادامه':'بدون مستندات ادامه می‌دهم'}${icon('arrow')}</button></div></div>`}
const answerLabel={...Object.fromEntries(Object.entries(EVENTS).map(([id,e])=>[detailId(id),e.title])),time:'زمان رخداد',place:'مکان رخداد',details:'جزئیات',source:'نحوهٔ اطلاع',person:'افراد مرتبط',vehicle:'وسیلهٔ نقلیه',object:'اشیاء و اموال مرتبط',contact:'راه ارتباطی'};
function currentInterviewRecord(){
 const ai=interviewRecord(state.ai),g=state.completedGuide;
 if(!g||g.forText!==state.text)return ai;
 const skipped=new Set(g.skipped||[]),answers=g.answers||{};
 const turns=[...GUIDE_STEPS,...FOLLOW_UPS].filter(s=>Object.hasOwn(answers,s.id)||skipped.has(s.id))
  .map(s=>({q:s.title,a:String(answers[s.id]||'').trim()||'نمی‌دانم'}));
 // Preserve pre-migration/free-form answers from old AI drafts, but don't
 // duplicate the new fixed questions which are represented by the guide.
 const legacy=[...(ai?.turns||[]).filter(t=>!GUIDE_STEPS.some(s=>s.title===t.q)),...(g.legacyTurns||[])];
 return {...(ai||{}),turns:[...legacy,...turns]};
}
function interviewSummary(record,editable=false){if(!record?.turns?.length)return '';return `<section class="extra-summary ai-summary"><div class="review-header"><h3>پرسش و پاسخ با دستیار</h3>${editable?`<button class="plain" data-action="ai-edit">${icon('edit')}ویرایش</button>`:''}</div>${record.turns.map(t=>`<div class="answer-line"><label>${escape(uiLabel(t.q))}</label><p dir="auto">${escape(t.a)}</p></div>`).join('')}</section>`}
function allAnswers(){const allowed=relevantExtraIds(state.analysis);return Object.fromEntries(Object.entries(state.answers).filter(([k])=>allowed.includes(k)))}
function reviewPage(){return `<div class="content">${stepper()}${header('یک نگاه آخر، پیش از ثبت.','همه‌چیز درست است؟ روایت و مستنداتتان را مرور کنید.','check')}<section class="panel"><div class="review-header"><h3>خلاصهٔ گزارش</h3><span class="analysis-tag">${escape(state.analysis?.title||'گزارش')}</span></div><div class="answer-line"><label>شرح موقعیت</label><p>${escape(state.text)}</p><button class="plain" data-action="edit-text" aria-label="ویرایش شرح">${icon('edit')}</button></div>${Object.entries(allAnswers()).filter(([k,v])=>v&&labelFor(k)).map(([k,v])=>`<div class="answer-line"><label>${escape(labelFor(k))}</label><p>${escape(v)}</p><button class="plain" data-edit-answer="${k}" aria-label="ویرایش ${escape(labelFor(k))}">${icon('edit')}</button></div>`).join('')}</section>${currentInterviewRecord()?.turns?.length?`<section class="panel">${interviewSummary(currentInterviewRecord(),true)}</section>`:''}${currentExtraSections().length?`<section class="panel">${extraSummary(currentExtraSections(),true)}</section>`:''}<section class="panel"><div class="review-header"><h3>مستندات <span class="small-tag">${fa(state.files.length)} فایل</span></h3><button class="plain" data-action="edit-evidence">${icon('edit')}ویرایش</button></div>${state.files.length?filesMarkup(false):'<p class="storage-note">مستندی اضافه نکرده‌اید.</p>'}</section><label class="consent"><input type="checkbox" id="confirm" ${state.confirmed?'checked':''}><span>شرح گزارش و مستندات را مرور کرده‌ام و اطلاعات ثبت‌شده مطابق دانسته‌های من است.</span></label><div class="actions"><button class="secondary" data-action="edit-evidence">${icon('back')}بازگشت</button><button class="primary" id="submit-report" data-action="submit" ${!state.confirmed||state.busy?'disabled':''}>${icon('check')}${state.busy?'در حال ذخیره…':'ثبت نهایی گزارش'}</button></div><p class="storage-note">${config.central?'پس از ثبت، گزارش، مستندات و شناسهٔ تأییدشدهٔ حساب بله به کارتابل مرکزی برای مسئولان مجاز ارسال می‌شوند؛ شناسهٔ دریافت را نگه دارید. این کار به معنای احراز نام واقعی یا ارسال به سامانهٔ دیگری نیست.':'این نسخه گزارش را در همین مرورگر ذخیره می‌کند. ثبت در اینجا به معنای ارسال رسمی یا دریافت توسط نهاد دیگری نیست.'}</p></div>`}
function historyPage(){return `<div class="content history">${header('گزارش‌های من','گزارش‌هایی که در این مرورگر ثبت کرده‌اید.','folder')}<div class="search-field"><input id="report-search" class="field" placeholder="جست‌وجو در گزارش‌ها…" aria-label="جست‌وجوی گزارش">${icon('search')}</div><div class="panel" id="reports-list">${reportList('')}</div></div>`}
function reportList(query){const found=reports.filter(r=>(r.text+r.title+r.id+(r.reporter?.name||'')).includes(query));return found.length?found.map(r=>`<button class="report-card" data-report="${r.id}"><span class="mini-brand">${icon('file')}</span><div class="report-info"><h3>${escape(r.title)}</h3><small>${new Date(r.created).toLocaleDateString('fa-IR')} · ${fa(r.files.length)} مستند</small><small style="display:block" dir="ltr">${r.id}</small><small style="display:block">${escape(r.newsDomain||'—')} · ${escape(r.qualityGrade||'—')} · ${escape(r.reporter?.name||'—')}</small></div>${icon('arrow')}</button>`).join(''):`<div class="empty-state">${icon('folder')}<h3>${query?'گزارشی پیدا نشد.':'اولین روایتتان را ثبت کنید.'}</h3><p>${query?'عبارت دیگری را جست‌وجو کنید.':'گزارش‌های ثبت‌شدهٔ شما اینجا نمایش داده می‌شوند.'}</p>${!query?'<button class="primary" data-action="new">ثبت گزارش جدید</button>':''}</div>`}
function successPage(){const r=reports.find(r=>r.id===state.savedId);return `<div class="content"><section class="panel success" style="margin-top:55px"><div class="success-ring">${icon('check')}</div><h2>${state.centralReceipt?'گزارش به سامانهٔ مرکزی رسید.':'روایت شما ذخیره شد.'}</h2><p>${state.centralReceipt?'رسید سرور دریافت شد؛ شناسه را برای پیگیری نگه دارید.':`گزارش و ${fa(r?.files.length||0)} مستند، در این مرورگر نگهداری می‌شوند.`}</p><div class="tracking"><span>${state.centralReceipt?'شناسهٔ دریافت مرکزی':'شناسهٔ محلی گزارش'}</span><b dir="ltr">${escape(state.savedId)}</b><button class="icon-button" data-action="copy-id" aria-label="کپی شناسه">${icon('copy')}</button></div><p>${state.localMirrorOK===false?'نسخهٔ مرورگر ذخیره نشد؛ رسید مرکزی معتبر است. شناسه و متن را اکنون نگه دارید.':'از «گزارش‌های من» می‌توانید نسخهٔ همین مرورگر را ببینید.'}</p><div class="actions"><button class="secondary" data-action="download-report">${icon('download')}دریافت متن گزارش</button><button class="primary" data-action="reports">گزارش‌های من</button></div><button class="plain" data-action="new">شروع گزارش جدید</button><p class="storage-note">${state.centralReceipt?'گزارش در کارتابل مرکزی این سامانه ثبت شده است؛ ارسال به سامانهٔ دیگری انجام نشده است.':'گزارش به نهاد دیگری ارسال نشده است. پاک‌کردن داده‌های مرورگر می‌تواند این نسخه را حذف کند.'}</p></section></div>`}
let lastScreen=null,lastOrder=0,lastGuidePct=0;
// A microphone on every free-text answer after the first description.
const fieldVoice=createFieldVoice({config:()=>config,blocked:()=>micBlocked,api,createVoiceRecorder,createDictation,speechSupported,appendSpeech,toast,icon});
function render(){
 fileURLs.forEach(URL.revokeObjectURL);fileURLs=[];
 const key=screenKey(state),order=screenOrder(state),moved=lastScreen!==null&&key!==lastScreen;
 // A recording into a box that is about to be replaced has nowhere to go.
 fieldVoice.stopAll();
 app.innerHTML=shell(state.view==='welcome'?welcome():state.view==='home'?home():state.view==='reports'?historyPage():successPage());
 bindInputs();enhanceSelects(app);fieldVoice.enhance(app);
 // Only a new screen moves; an update to the current one stays still.
 if(moved)markEntrance(app,order<lastOrder?'back':'forward');
 lastScreen=key;lastOrder=order;
}
function setStepButtons(next,skip,filled){
 const n=document.querySelector(`[data-action="${next}"]`),s=document.querySelector(`[data-action="${skip}"]`);
 if(n)n.disabled=!filled;if(s)s.disabled=filled;
}
function bindInputs(){bindPlateInputs();
 for(const el of document.querySelectorAll('[data-guide-option]'))el.addEventListener('click',()=>{
  if(!state.guide)return;
  const step=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];if(!step)return;
  const option=step.options[+el.dataset.guideOption];
  const input=document.querySelector('#guide-input');if(input)input.value='';state.guide.draft=null;
  // An option whose phrase is empty records «I do not know» and stores nothing.
  (state.guide.chosenLabel??={})[step.id]=option.label;
  // A chip whose phrase is empty is an explicit «I don't know» — unless it is
  // one that asks the reporter to describe the thing in their own words.
  if(option.phrase){state.guide.answers[step.id]=option.phrase;markSkipped(step.id,false)}
  else{delete state.guide.answers[step.id];markSkipped(step.id,!option.needsDetail)}
  rebaseGuide(step.id);
  tick();
  // A single tap is the whole answer for a choice question, so move on by
  // itself — after a beat, so the reporter sees what they picked. Not when the
  // option asks them to describe it, and not if they have started typing.
  // The step id is checked again, so a quick «ادامه» cannot advance twice.
  if(!option.needsDetail&&!String(input?.value||'').trim()){
   const at=step.id;state.guide.pendingAdvance=at;
   setTimeout(()=>{if(!state.guide||state.guide.pendingAdvance!==at)return;const now=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];if(now?.id!==at)return;state.guide.pendingAdvance=null;state.guide.autoAdvancedAt=Date.now();guideError='';advanceGuide()},320);
  }
  guideError='';persist();render();
 });
 document.querySelector('#guide-input')?.addEventListener('input',e=>{
  guideError='';if(!state.guide)return;
  const step=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];
  if(step){
   // A typed edit replaces a previously selected chip, even when cleared.
   state.guide.pendingAdvance=null;state.guide.autoAdvancedAt=0;
   delete state.guide.answers[step.id];if(state.guide.chosenLabel)delete state.guide.chosenLabel[step.id];
   markSkipped(step.id,false);state.guide.draft={step:step.id,value:e.target.value};
   setStepButtons('guide-next','guide-skip',Boolean(e.target.value.trim()));autoSave();
  }
 });
 document.querySelector('#ai-answer')?.addEventListener('input',e=>{if(state.ai){state.ai.draft=e.target.value;setStepButtons('ai-send','ai-unknown',Boolean(e.target.value.trim()));autoSave()}});
document.querySelector('#audio-input')?.addEventListener('change',e=>{if(e.target.files[0])transcribeAudio(e.target.files[0])});document.querySelector('#audio-capture')?.addEventListener('change',e=>{if(e.target.files[0])transcribeAudio(e.target.files[0])});bindDetailInputs();document.querySelector('#description')?.addEventListener('input',e=>{state.text=e.target.value;document.querySelector('#char-count').textContent=`${fa(state.text.length)} / ۶۰۰۰`;document.querySelector('#analyze-btn').disabled=state.text.trim().length<3||state.recording;
 // Urgent-route advice is refreshed in place rather than by re-rendering, so
 // the reporter keeps their caret and their half-finished sentence.
 // Replaced only when it changes: rewriting identical markup on every
 // keystroke would replay its entrance animation with each letter typed.
 const slot=document.querySelector('#triage-slot');if(slot){const key=triageKey(state.text);if(slot.dataset.key!==key){slot.dataset.key=key;slot.innerHTML=triageBanner(state.text,{escape,icon},null,{miniApp})}}
 const domain=document.querySelector('#news-domain');if(domain){domain.hidden=!state.text.trim();domain.textContent=state.text.trim()?`حوزه خبری پیشنهادی: ${newsDomain(state.text).join('، ')}`:''}
 autoSave()});document.querySelector('#answer')?.addEventListener('input',e=>{const q=currentQuestions()[state.qIndex],wasUnknown=answerIsUnknown(state.answers[q.id]);setAnswer(state,q.id,e.target.value);refreshQuestionButton();autoSave();if(wasUnknown!==answerIsUnknown(e.target.value)){const caret=e.target.selectionStart;render();const input=document.querySelector('#answer');input?.focus();input?.setSelectionRange(caret,caret)}});document.querySelector('#file-input')?.addEventListener('change',e=>addFiles(e.target.files));document.querySelector('#photo-capture')?.addEventListener('change',e=>addFiles(e.target.files));document.querySelector('#confirm')?.addEventListener('change',e=>{state.confirmed=e.target.checked;document.querySelector('#submit-report').disabled=!e.target.checked});document.querySelector('#report-search')?.addEventListener('input',e=>document.querySelector('#reports-list').innerHTML=reportList(e.target.value));const dz=document.querySelector('#dropzone');if(dz){dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragging')});dz.addEventListener('dragleave',()=>dz.classList.remove('dragging'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragging');addFiles(e.dataTransfer.files)})}}
function refreshQuestionButton(){
 const q=currentQuestions()[state.qIndex],button=document.querySelector('#next-question'),skip=document.querySelector('#skip-question');
 if(!q||!button)return;
 const c=flowFrame(q),filled=c.flow.phase==='fields'?pageHasInput(c.page,c.row):c.flow.phase==='main'?Boolean(String(state.answers[q.id]||'').trim()):false;
 button.disabled=!filled;if(skip)skip.disabled=filled;
}
function bindDetailInputs(){
 document.querySelectorAll('[data-detail-field]').forEach(el=>{
  const d=el.dataset,row=state.extra[d.detailGroup].rows[+d.detailRow];
  const schema=detailSchema(d.detailGroup,state.analysis.event,{analysis:state.analysis,extra:currentExtra()}),field=schema.fields.find(f=>f.id===d.detailField);
  const update=(value,paste=false)=>{
   let rerender=el.tagName==='SELECT';
   if(d.detailGroup==='contact'&&['subscriber','mobile','international','socialValue'].includes(d.detailField)){
    const result=setContactInput(row,d.detailField,value,{paste});if(result.error){toast(result.error);return}el.value=result.value;rerender||=Boolean(result.rerender);
   }else {el.value=normalizeFieldInput(field,value);row[d.detailField]=el.value}
   if(field?.widget==='social'){
    const parsed=socialAddress(row.platform,row.socialValue),preview=document.querySelector(`[data-social-preview="${d.detailRow}"]`),prefix=document.querySelector(`[data-social-prefix="${d.detailRow}"]`);
    if(preview)preview.textContent=parsed.error?'':parsed.url;
    if(prefix)prefix.textContent=/^https?:\/\//.test(row.socialValue||'')?'':socialPlatform(row.platform)?.prefix||'https://';
   }
   state.confirmed=false;errors='';autoSave();refreshQuestionButton();
   if(rerender){const id=el.id;render();document.getElementById(id)?.focus()}
  };
  el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>update(el.value));
  if(field?.numeric)el.addEventListener('paste',e=>{e.preventDefault();update(el.value.slice(0,el.selectionStart)+e.clipboardData.getData('text')+el.value.slice(el.selectionEnd),true)});
  if(field?.widget==='social')el.addEventListener('blur',()=>{const parsed=socialAddress(row.platform,row.socialValue);if(!parsed.error)update(parsed.value)});
 });
}
function modal(title,body){document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${escape(title)}"><div class="modal-head"><h2>${escape(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="بستن">${icon('close')}</button></div>${body}</section></div>`;enhanceSelects(document.querySelector('#modal-root'));document.querySelector('.modal button')?.focus()}
function closeModal(){document.querySelector('#modal-root').innerHTML=''}
async function analyze(clarificationHandled=false){transcriptReviewed=true;if(state.busy||state.recording||state.text.trim().length<3)return;stopVoice();state.busy=true;errors='';render();try{if(!config.loaded)await getConfig().catch(()=>{});// The browser engine is a complete path on its own: analysis never depends on
  // an external service. A configured model is used when one is reachable, and
  // which engine actually ran is always stated rather than implied.
  let result;
  if(config.ai){
   try{result=await api('analyze',{text:state.text,region:state.region},{timeout:config.provider==='local'?250000:undefined});engineNote=''}
   catch(e){engineNote=`${e.message} تحلیل با موتور داخلی مرورگر انجام شد.`;result=localAnalysis(state.text)}
  }else{
   result=localAnalysis(state.text);
   engineNote=config.loaded?'':`${config.error||'وضعیت سرویس بیرونی مشخص نشد.'} تحلیل با موتور داخلی مرورگر انجام شد.`;
  }if(result.refusal)throw new Error(result.refusal);acceptAnalysis(clarificationHandled?{...result,clarificationHandled:true,clarification:{needed:false}}:result);startAnalysisReview(state);state.askDetail=true;await persist()}catch(e){errors=e.message}finally{state.busy=false;render()}}
async function addFiles(input){errors='';const {accepted,errors:errs}=validateFiles(Array.from(input),state.files);for(const f of accepted)state.files.push({name:f.name,size:f.size,type:f.type,blob:f});state.confirmed=false;errors=errs.join(' ');await persist();render();if(accepted.length)toast(`${fa(accepted.length)} مستند اضافه شد.`)}

// ---- AI interview -------------------------------------------------------
let aiLoading=false,aiError='',aiSeq=0;
function aiActive(){return Boolean(state.ai&&!state.ai.fallback&&(state.ai.mode==='intake'?state.step===0:state.step===1&&!state.askDetail))}
function aiCovers(){return Boolean(state.ai&&state.ai.mode==='detail'&&!state.ai.fallback)}
function focusAi(){requestAnimationFrame(()=>(document.querySelector('#ai-question')||document.querySelector('.ai-thinking'))?.focus?.())}
function migrateGuideDraft(g){
 if(!g||g.orderVersion===2)return g;
 g.answers??={};g.skipped??=[];g.mode??='intake';g.legacyTurns??=[];
 // In older drafts «who» asked about the victim, not the actor. Preserve that
 // answer as legacy text rather than relabelling it as the new actor answer.
 for(const [id,q] of [['who','چه کسی: این اتفاق برای چه کسی افتاد؟'],['evidence','مدرک یا نشانه‌ای دارید؟']]){
  const value=String(g.draft?.step===id?g.draft.value:g.answers[id]||'').trim();
  if(value){g.legacyTurns.push({q,a:value});g.base=[g.base||'',value].filter(Boolean).join('\n')}
  else if(g.skipped.includes(id))g.legacyTurns.push({q,a:'نمی‌دانم'});
  delete g.answers[id];g.skipped=g.skipped.filter(x=>x!==id);
  if(g.draft?.step===id)g.draft=null;
 }
 const steps=stepsFor(g.answers,g.base||'',g.skipped),core=new Set(GUIDE_STEPS.map(s=>s.id));
 const next=steps.findIndex(s=>core.has(s.id)&&!String(g.answers[s.id]||'').trim()&&!g.skipped.includes(s.id));
 g.index=next>=0?next:Math.max(0,steps.findIndex(s=>!core.has(s.id)&&!String(g.answers[s.id]||'').trim()&&!g.skipped.includes(s.id)));
 g.orderVersion=2;return g;
}
function migrateAiDraft(ai){
 if(!ai?.current)return;
 const path=orderedInterviewPath({mode:ai.mode,text:state.text,turns:ai.turns||[]});
 if(path.error||path.next?.id===ai.current.stage&&path.next?.title===ai.current.question)return;
 const value=String(ai.draft||'').trim();
 if(value)ai.turns.push({q:ai.current.question,a:value});
 ai.current=null;ai.draft='';ai.done=false;
}
async function askNext(){
 const ai=state.ai;if(!ai)return;const seq=++aiSeq;aiLoading=true;aiError='';render();
 const topics=state.analysis?eventIds(state.analysis).map(id=>EVENTS[id]?.title).filter(Boolean):[];
 try{const raw=await api('interview',interviewRequest(ai,state.text,topics),{timeout:250000});if(seq!==aiSeq||state.ai!==ai)return;
  const step=orderedClientStep(ai,raw,state.text);
  if(step.done)step.narrative=answersNarrative(ai,state.text);
  applyStep(ai,step)}
 catch(e){if(seq!==aiSeq||state.ai!==ai)return;aiError=e.message||'دستیار پاسخ نداد.'}
 if(seq!==aiSeq)return;aiLoading=false;
 if(state.ai===ai&&ai.done){await finishInterview(false);return}
 await persist();render();focusAi();
}
function sendAiAnswer(value){const ai=state.ai;if(!ai||aiLoading||!answerCurrent(ai,value))return;persist();askNext()}
async function finishInterview(early){
 const ai=state.ai;if(!ai)return;
 if(early&&!ai.done){toast('برای ادامه، مراحل پایه را کامل کنید؛ در هر مرحله می‌توانید «نمی‌دانم» را انتخاب کنید.');return}
 aiSeq++;aiLoading=false;aiError='';
 // The same dependency-checked local follow-ups are used after either model
 // or offline core stages. Unknown parents stay closed in both paths.
 state.guide={...guideFallback(ai,state.text,ai.mode==='detail'&&state.intakeGuide?.forText===state.text?state.intakeGuide:null),mode:ai.mode};
 if(ai.mode==='detail'){ai.fallback=true;ai.done=true;ai.current=null;state.step=1}
 else state.ai=null;
 guideError='';errors='';
 if(state.guide.index>=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped).length){await finishGuide();return}
 await persist();render();focusGuide();
}
async function analyzeOrGuide(){
 if(state.busy||state.recording)return;
 const need=guidanceNeed(state.text).need;
 if(need==='unsure'||need==='empty'){
  stopVoice();stopDictation();
  if(!config.loaded)await getConfig().catch(()=>{});
  // The server and the offline guide use the same ordered base stages.
  if(state.pausedGuide?.mode!=='detail'&&state.pausedGuide?.forText===state.text){state.guide=state.pausedGuide;state.pausedGuide=null;await persist();render();focusGuide();return}
  if(state.pausedAi?.mode==='intake'&&state.pausedAi.forText===state.text){state.ai=state.pausedAi;state.pausedAi=null;await persist();render();if(!state.ai.current&&!state.ai.done)askNext();else focusAi();return}
  if(config.interview){state.ai=newInterview('intake');errors='';engineNote='';askNext();return}
  state.guide={orderVersion:2,mode:'intake',index:0,answers:{},skipped:[],base:''};guideError='';errors='';engineNote='';
  await persist();render();focusGuide();return;
 }
 return analyze();
}
const markSkipped=(id,on=true)=>{const g=state.guide;if(!g)return;const set=new Set(g.skipped||[]);on?set.add(id):set.delete(id);g.skipped=[...set]};
// Answers can open a branch before the current follow-up. Keep the current
// question anchored by id instead of accidentally advancing from a shifted index.
function rebaseGuide(id){if(!state.guide)return;const i=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped).findIndex(s=>s.id===id);if(i>=0)state.guide.index=i}
function focusGuide(){requestAnimationFrame(()=>document.querySelector('#guide-title')?.focus())}
function captureGuideInput(){
 if(!state.guide)return;
 const step=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];const el=document.querySelector('#guide-input');
 if(!step)return;
 if(!el)return;
 // Typed wording wins over a chosen chip, because it is the reporter's own.
 // «نمی‌دانم» and its variants are read as a skip: an unknown is not a fact,
 // and it must not end up in the report as though it were one.
 // An EMPTY box is not a skip: it is what the box looks like after the
 // reporter picked a chip. Only an explicit «نمی‌دانم» typed into it is.
 // Treating empty as a skip wiped every chip answer on «ادامه», so the same
 // question came straight back.
 const {answer,reason}=readAnswer(el.value);state.guide.draft=null;
 if(answer){state.guide.answers[step.id]=answer;markSkipped(step.id,unknownStagesInText(answer).includes(step.id))}
 else if(reason==='unknown'){delete state.guide.answers[step.id];markSkipped(step.id)}
 else if(!(step.options||[]).some(o=>o.phrase===state.guide.answers[step.id]))delete state.guide.answers[step.id];
 rebaseGuide(step.id);
}
function advanceGuide(){
 if(!state.guide)return;
 // Answering can add or remove a branch, so the end is recomputed here.
 if(state.guide.index+1<stepsFor(state.guide.answers,state.guide.base,state.guide.skipped).length){state.guide.index++;persist();render();focusGuide();return}
 finishGuide();
}
async function finishGuide(){
 const guide=state.guide;if(!guide)return;
 const answers=guide.answers||{};
 const skipped=[...new Set([...(guide.skipped||[]),...unknownStagesInText(guide.base||'')])];
 const carried=carryGuideAnswers(answers,skipped);
 if(guide.mode==='detail'){
  // Keep the original description and every answer separately, just like an
  // AI interview. No truncation, silent rewrite, or loss of confirmed fields.
  state.completedGuide={...guide,skipped,pendingAdvance:null,autoAdvancedAt:0,forText:state.text};
  const old=state.carried?.forText===state.text?state.carried:null;
  for(const [id,value] of Object.entries(old?.answers||{}))if(state.answers[id]===value&&carried.answers[id]!==value){
   delete state.answers[id];if(answerIsUnknown(value)&&state.extra[id]?.rows?.length)state.extra[id].enabled=true;
  }
  if(old?.detailsUnknown&&!carried.detailsUnknown)for(const id of relevantExtraIds(state.analysis))
   if(id.startsWith('details_')&&state.answers[id]==='اطلاعات بیشتری ندارم')delete state.answers[id];
  state.guide=null;state.pausedGuide=null;state.carried={...carried,forText:state.text};
  applyCarriedAnswers();state.step=1;state.qIndex=0;state.flow=null;errors='';guideError='';
  await persist();render();focusQuestion();return;
 }
 const text=finalNarrative(answers,guide.base||'');
 if(!text){guideError='هنوز هیچ پاسخی ثبت نشده است. دست‌کم به یک پرسش پاسخ دهید.';render();return}
 if(text.length>6000){guideError='پاسخ‌ها از ظرفیت ۶۰۰۰ نویسه بیشترند؛ با بازگشت، برخی پاسخ‌ها را کوتاه‌تر کنید.';render();return}
 state.text=text;state.guide=null;state.pausedGuide=null;transcriptReviewed=true;errors='';guideError='';
 state.intakeGuide={answers:{...answers},skipped,forText:state.text};
 state.carried={...carried,forText:state.text};
 await persist();render();
 toast('شرح گزارش از پاسخ‌های شما ساخته شد. می‌توانید آن را ویرایش کنید.');
 document.querySelector('#description')?.focus();
}

async function transcribeAudio(file){
 if(state.busy||state.recording)return;
 if(!file||file.size===0){errors='صوت خالی است؛ دوباره ضبط کنید.';render();return}
 if(file.size>24*1024*1024){errors='حجم صوت باید حداکثر ۲۴ مگابایت باشد.';render();return}
 if(file===lastTranscribed){toast('متن این صوت قبلاً اضافه شده است.');return}
 rememberRecording(file);
 if(config.loaded&&!config.transcription){errors='تبدیل صوت به متن فعال نیست؛ صوت را پخش یا دریافت کنید و شرح را بنویسید.';render();return}
 state.busy=true;errors='';render();
 try{
  // The server decides availability; a failed config fetch must not block capture/upload.
  const form=new FormData();form.append('file',file,file.name);
  const result=await api('transcribe',form);
  if(typeof result.text!=='string'||!result.text.trim())throw new Error('گفتار قابل تشخیصی دریافت نشد؛ صوت را گوش کنید و دوباره ضبط کنید.');
  const combined=(state.text+' '+result.text.trim()).trim();
  if(combined.length>6000)throw new Error('متن صوت از ظرفیت شرح بیشتر است؛ شرح را کوتاه کنید و تبدیل را دوباره بزنید. صوت همچنان در دسترس است.');
  state.text=combined;lastTranscribed=file;transcriptReviewed=false;state.transcriptModel=result.model;config.transcription=true;config.loaded=true;config.error='';await persist();toast('متن آماده است؛ نام‌ها و شماره‌ها را بازبینی کنید.');
 }catch(e){errors=e.message}
 finally{state.busy=false;render()}
}
async function startRecording(){
 if(state.busy)return;
 if(voicePhase==='recording'){voiceCapture.stop();return}
 if(voicePhase==='requesting'){voiceCapture.stop({discard:true});return}
 if(voicePhase!=='idle')return;
 errors='';connectionMessage='';await voiceCapture.start();
}
function useCurrentLocation(){
 const target=document.querySelector('#guide-input, #ai-answer, #answer');
 if(!target){toast('ابتدا محل حادثه را برای واردکردن نشانی باز کنید.');return}
 toast('در انتظار اجازهٔ موقعیت مکانی…');
 requestLocation({onPosition({latitude,longitude,accuracy}){
  if(!target.isConnected){toast('صفحه عوض شد؛ موقعیت به گزارش اضافه نشد.');return}
  const value=`موقعیت فعلی دستگاه: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}${accuracy===null?'':` (دقت تقریبی ${Math.round(accuracy)} متر)`}`;
  const prior=target.value.trim();const combined=prior?`${prior}\n${value}`:value;
  if(target.maxLength>0&&combined.length>target.maxLength){toast('برای افزودن موقعیت، متن این پاسخ را کمی کوتاه‌تر کنید.');return}
  target.value=combined;target.dispatchEvent(new Event('input',{bubbles:true}));
  if(state.ai&&target.id==='ai-answer')state.ai.draft=combined;
  toast('موقعیت کنونی اضافه شد؛ اگر محل حادثه متفاوت است، پاسخ را اصلاح کنید.');
 },onError:toast});
}
function buildReportRecord(){
 const aiMeta=state.ai?{domain:state.ai.domain,quality_grade:state.ai.quality_grade,quantity_note:state.ai.quantity_note,reporter_role:state.ai.reporter_role}:null;
 const meta=aiMeta||reportMeta(state.text,state.analysis);
 state.newsDomain=Array.isArray(meta.domain)?meta.domain.join('، '):(meta.domain||'سایر');
 state.qualityGrade=meta.quality_grade||meta.quality?.grade||'ضعیف';
 state.quantityNote=meta.quantity_note||meta.quantity||'متوسط';
 return {id:`RV-${Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()}`,created:Date.now(),title:state.analysis.title,bankVersion:BANK_VERSION,requiredCategories:requiredCategories(state.analysis),analysis:{...state.analysis,prefills:[],known:{}},prefillAudit:activePrefills(state).map(p=>({...p,status:'confirmed'})),answerLabels:Object.fromEntries(currentQuestions().map(q=>[q.id,labelFor(q.id)])),graph:entityGraph(currentExtra(),state.analysis),text:state.text,region:state.region,reporter:{...(state.reporter||emptyReporter()),role:meta.reporter_role},newsDomain:state.newsDomain,qualityGrade:state.qualityGrade,quantityNote:state.quantityNote,answers:allAnswers(),extraSections:currentExtraSections(),interview:currentInterviewRecord(),files:state.files};
}
async function finishSavedReport(record,{central=false}={}){
 let localOK=true;
 try{await storePut('reports',record)}catch(error){if(!central)throw error;localOK=false}
 reports.unshift(record);state.savedId=record.id;state.centralReceipt=central;state.localMirrorOK=localOK;state.view='success';
 try{await removeDraft();draft=null}catch{/* the receipt remains authoritative; a stale draft can be rechecked */}
 state.pendingSubmission=null;state.text='';state.files=[];state.answers={};state.extra={};state.prefillAudit=[];state.prefillText=undefined;state.analysis=null;state.ai=null;state.guide=null;state.step=0;state.confirmed=false;
 toast(central?'رسید سامانهٔ مرکزی دریافت شد.':'گزارش و مستندات در این مرورگر ذخیره شدند.');
}
async function finishCentral(id){
 const pending=state.pendingSubmission;if(!pending)return;
 const record={...pending.report,id,central:true,files:state.files};
 await finishSavedReport(record,{central:true});
}
async function retryCentral(){
 if(state.busy||!state.pendingSubmission)return;
 state.busy=true;errors='';render();
 try{
  if(!config.loaded)await getConfig();
  if(!config.loaded||!config.central)throw new Error('وضعیت سامانهٔ مرکزی مشخص نیست؛ اتصال را بررسی کنید.');
  const pending=state.pendingSubmission,status=await centralStatus(pending.key);
  if(status.state==='accepted'){await finishCentral(status.id);return}
  if(status.state==='processing')throw new Error('ارسال قبلی هنوز در حال پردازش است؛ کمی بعد دوباره وضعیت را بررسی کنید.');
  const receipt=await sendCentral(pending,state.files);await finishCentral(receipt.id);
 }catch(error){errors=error.message||'ارسال تأیید نشد؛ اطلاعات در پیش‌نویس باقی مانده است.';await persist()}
 finally{state.busy=false;render()}
}
async function editPending(){
 if(state.busy||!state.pendingSubmission)return;
 state.busy=true;errors='';render();
 try{
  const status=await centralStatus(state.pendingSubmission.key);
  if(status.state==='accepted'){await finishCentral(status.id);return}
  if(status.state==='processing')throw new Error('ارسال قبلی هنوز در حال پردازش است؛ کمی بعد وضعیت را بررسی کنید.');
  modal('بازگشت به ویرایش',`<p>اکنون رسیدی برای ارسال قبلی پیدا نشد. اگر ارتباط قطع بوده، ممکن است ارسال دیرتر برسد؛ ثبت دوباره پس از ویرایش می‌تواند گزارش تکراری بسازد.</p><div class="actions"><button class="secondary" data-action="close-modal">انصراف</button><button class="primary" data-action="confirm-edit-pending">با آگاهی، ویرایش می‌کنم</button></div>`);
 }catch(error){errors=error.message||'وضعیت ارسال قابل بررسی نیست؛ دوباره تلاش کنید.'}
 finally{state.busy=false;render()}
}
async function submit(){
 if(state.busy||!state.confirmed)return;
 if(!config.loaded){await getConfig();if(!config.loaded){errors='وضعیت ذخیره و ارسال قابل بررسی نیست؛ اتصال را بررسی کنید.';render();return}}
 if(needsAnalysisReview(state)){state.step=state.brief?2:1;state.confirmed=false;render();return}
 const missing=currentQuestions().findIndex(q=>q.required&&!questionAnswered(q,state.answers,currentExtra()));
 if(missing>=0){state.qIndex=missing;state.step=1;state.confirmed=false;errors='این بخش را تکمیل کنید یا گزینهٔ «نمی‌دانم» را انتخاب کنید.';render();return}
 const validation=currentQuestions().flatMap(q=>extraErrors(q.id,currentExtra()?.[q.id],state.analysis.event));
 if(validation.length){toast(validation[0]);return}
 if(!state.identityConfirmed){showReporterIdentity();return}
 clearTimeout(saveTimer);
 const record=buildReportRecord();
 if(config.central){
  const {id,files,...report}=record;
  state.pendingSubmission={key:newSubmissionKey(),report:{...report,central:true,files:files.map(({name,size,type})=>({name,size,type}))}};
  // A retry key and the original snapshot must survive refresh before we start
  // an upload whose outcome could become ambiguous on a dropped connection.
  state.busy=true;render();const saved=await persist();state.busy=false;
  if(!saved){state.pendingSubmission=null;errors='پیش‌نویس برای ارسال امن ذخیره نشد. فضای مرورگر را بررسی کنید.';render();return}
  return retryCentral();
 }
 state.busy=true;render();
 try{await finishSavedReport(record)}catch{toast('ذخیره انجام نشد؛ فضای مرورگر را بررسی کنید. اطلاعات شما همچنان در فرم موجود است.')}
 finally{state.busy=false;render()}
}
function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function showReporterIdentity(){const r=state.reporter||emptyReporter();modal('مشخصات گزارش‌دهنده',`<form id="reporter-identity-form"><p>این مشخصات اختیاری‌اند؛ فقط موارد لازم را وارد کنید. ${config.central?'با گزارش به کارتابل مرکزی ارسال می‌شوند.':'در همین مرورگر ذخیره می‌شوند.'}</p><div class="field-row"><label for="rep-province">استان</label><input id="rep-province" maxlength="80" placeholder="مثلاً تهران" value="${escape(r.province)}"></div><div class="field-row"><label for="rep-name">نام و نام خانوادگی</label><input id="rep-name" maxlength="120" placeholder="نام و نام خانوادگی" value="${escape(r.name)}"></div><div class="field-row"><label for="rep-mobile">شماره همراه</label><input id="rep-mobile" type="tel" maxlength="32" placeholder="۰۹۱۲۳۴۵۶۷۸۹" value="${escape(r.mobile)}"></div><div class="field-row"><label for="rep-rank">عنوان رده</label><input id="rep-rank" maxlength="80" value="${escape(r.rank)}"></div><div class="field-row"><label for="rep-post">عنوان سمت</label><input id="rep-post" maxlength="80" value="${escape(r.post)}"></div><div class="actions"><button type="button" class="secondary" data-action="close-modal">بازگشت</button><button class="primary" type="button" data-action="save-identity">ادامه و ثبت گزارش</button></div></form>`)}
function reportText(r){const rep=r.reporter||{};return `سازمان سوم فرماندهی جمهوری اسلامی ایران\nاستان: ${rep.province||'—'}\nنام و نام خانوادگی: ${rep.name||'—'}\nشماره همراه: ${rep.mobile||'—'}\nعنوان رده: ${rep.rank||'—'}\nعنوان سمت: ${rep.post||'—'}\nنقش گزارش‌دهنده: ${rep.role||'—'}\nشناسهٔ گزارش: ${r.id}\nتاریخ ثبت: ${new Date(r.created).toLocaleString('fa-IR')}\nحوزه خبری: ${r.newsDomain||'—'}\nدرجة کیفی گزارش: ${r.qualityGrade||'—'}\nکمیت گزارش: ${r.quantityNote||'—'}\n\nشرح گزارش (بخش اصلی):\n${r.text}\n\nپاسخ‌های ثبت‌شده:\n${Object.entries(r.answers).filter(([k,v])=>v&&labelFor(k,r)).map(([k,v])=>`${labelFor(k,r)}: ${v}`).join('\n\n')}${r.interview?.turns?.length?`\n\nپرسش و پاسخ با دستیار:\n${r.interview.turns.map(t=>`${t.q}\n${t.a}`).join('\n\n')}`:''}\n\n${formatExtraText(r.extraSections)}\n\nمستندات:\n${r.files.map(f=>`${f.name} (${filesize(f.size)})`).join('\n')||'بدون مستندات'}\n\n${r.central?'این گزارش به کارتابل مرکزی همین سامانه ارسال شده است؛ ارسال خودکار به سامانهٔ دیگری انجام نشده است.':'این گزارش محلی است و به نهاد دیگری ارسال نشده است.'}`}
let activeReport=null;
function showReport(id){activeReport=reports.find(r=>r.id===id);if(!activeReport)return;const r=activeReport;const rep=r.reporter||{};modal(r.title,`<p>${escape(r.region)} · ${new Date(r.created).toLocaleString('fa-IR')}</p><p><b>استان:</b> ${escape(rep.province||'—')} · <b>نام و نام خانوادگی:</b> ${escape(rep.name||'—')} · <b>شماره همراه:</b> ${escape(rep.mobile||'—')} · <b>عنوان رده:</b> ${escape(rep.rank||'—')} · <b>عنوان سمت:</b> ${escape(rep.post||'—')} · <b>نقش:</b> ${escape(rep.role||'—')}</p><p><b>حوزه خبری:</b> ${escape(r.newsDomain||'—')} · <b>درجة کیفی:</b> ${escape(r.qualityGrade||'—')} · <b>کمیت گزارش:</b> ${escape(r.quantityNote||'—')}</p><p style="white-space:pre-wrap">${escape(r.text)}</p>${Object.entries(r.answers).filter(([k,v])=>v&&labelFor(k,r)).map(([k,v])=>`<h3>${escape(labelFor(k,r))}</h3><p>${escape(v)}</p>`).join('')}${interviewSummary(r.interview)}${extraSummary(r.extraSections||[])}<h3>مستندات (${fa(r.files.length)})</h3>${filesMarkup(false,r.files)}<button class="primary" data-action="download-active">${icon('download')}دریافت متن گزارش</button>`)}
async function startDetailedInterview(){
 state.startInterviewAfterReview=false;
  if(state.pausedGuide?.mode==='detail'&&state.pausedGuide.forText===state.text){
   state.guide=state.pausedGuide;state.pausedGuide=null;await persist();render();focusGuide();return
  }
  if(state.pausedAi?.mode==='detail'&&state.pausedAi.forText===state.text){
   state.ai=state.pausedAi;state.pausedAi=null;await persist();render();if(!state.ai.current&&!state.ai.done)askNext();else focusAi();return
  }
  const prior=state.intakeGuide?.forText===state.text?state.intakeGuide:null;
  if(config.interview){
   state.ai=newInterview('detail');
   // Preserve already answered or explicitly unknown intake stages when a
   // second, detail-mode interview starts on that exact unchanged narrative.
   if(prior)for(const s of coreStepsFor({},state.text)){
    if(!Object.hasOwn(prior.answers||{},s.id)&&!(prior.skipped||[]).includes(s.id))break;
    state.ai.turns.push({stage:s.id,q:s.title,a:prior.answers?.[s.id]||'',options:(s.options||[]).filter(o=>o.phrase).map(o=>o.label).slice(0,4),hint:s.hint});
   }
   await persist();askNext();return
  }
  state.guide={orderVersion:2,mode:'detail',index:0,answers:{...(prior?.answers||{})},skipped:[...(prior?.skipped||[])],base:state.text};
  if(prior){const completed=new Set([...Object.keys(prior.answers||{}),...(prior.skipped||[])]);
   const steps=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped);
   const next=steps.findIndex(s=>!completed.has(s.id));state.guide.index=next<0?steps.length:next}
  if(state.guide.index>=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped).length){await finishGuide();return}
  await persist();render();focusGuide()
}
const actions={'download-unsaved':()=>{const snapshot={شرح:state.text,راهنما:state.guide||null,پرسشهای_هوشمند:state.ai||null,پاسخها:state.answers,جزئیات:state.extra,نام_مستندات:state.files.map(f=>f.name),توجه:'این نسخه فقط متن است؛ خود فایل‌های پیوست در آن نیستند.'};download(new Blob([JSON.stringify(snapshot,null,2)],{type:'text/plain;charset=utf-8'}),'ravi-unsaved.txt')},'retry-central':retryCentral,'edit-pending':editPending,'confirm-edit-pending':()=>{state.pendingSubmission=null;state.confirmed=false;errors='';closeModal();persist();render()},'detail-yes':async()=>{state.askDetail=false;errors='';state.startInterviewAfterReview=true;
  if(needsAnalysisReview(state)){await persist();render();focusQuestion();return}
  await startDetailedInterview()},
 'detail-no':async()=>{state.askDetail=false;state.startInterviewAfterReview=false;state.ai=null;completeAnalysisReview(state,{brief:true});errors='';await persist();render()},
 'ai-send':()=>{const el=document.querySelector('#ai-answer'),value=String(el?.value||'').trim();if(!value){toast('پاسخ را بنویسید، یکی از گزینه‌ها را بزنید یا «نمی‌دانم» را انتخاب کنید.');el?.focus();return}sendAiAnswer(value)},
 'ai-unknown':()=>{if(String(document.querySelector('#ai-answer')?.value||'').trim())return;sendAiAnswer('')},
 'ai-retry':()=>askNext(),
 'ai-back':()=>{const ai=state.ai;if(!ai)return;aiSeq++;aiLoading=false;aiError='';
  if(stepBack(ai)){persist();render();focusAi();return}
  state.pausedAi={...ai,forText:state.text};state.ai=null;if(ai.mode==='detail'){state.askDetail=true;state.step=1}else state.step=0;persist();render()},
 'ai-finish':()=>finishInterview(true),
 'ai-edit':()=>{
  if(state.completedGuide?.forText===state.text){state.guide={...state.completedGuide,pendingAdvance:null,autoAdvancedAt:0};state.step=1;state.askDetail=false;state.confirmed=false;persist();render();focusGuide();return}
  const ai=state.ai;if(!ai)return;ai.fallback=false;state.step=1;state.askDetail=false;stepBack(ai);state.confirmed=false;persist();render();focusAi()
 },
 'ai-fallback':async()=>{const ai=state.ai;if(!ai)return;aiSeq++;aiLoading=false;aiError='';
  // Failure never jumps over an unfinished core stage in either mode.
  state.guide={...guideFallback(ai,state.text,ai.mode==='detail'&&state.intakeGuide?.forText===state.text?state.intakeGuide:null),mode:ai.mode};
  if(ai.mode==='intake')state.ai=null;else{ai.fallback=true;ai.current=null;state.step=1}
  guideError='';
  if(state.guide.index>=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped).length){await finishGuide();return}
  await persist();render();focusGuide()},
 'analysis-review-next':async()=>{const done=advanceAnalysisReview(state);errors='';if(done&&state.startInterviewAfterReview){await startDetailedInterview();return}await persist();render();focusQuestion()},'analysis-review-back':()=>{backAnalysisReview(state);errors='';persist();render();focusQuestion()},'question-bank':showQuestionBank,home:()=>changeView('welcome'),'continue-report':()=>changeView('home'),reports:()=>changeView('reports'),new:()=>{if(!draftLoaded){toast('در حال بازیابی پیش‌نویس؛ چند لحظه صبر کنید.');return}if(state.busy){toast('لطفاً تا پایان عملیات جاری صبر کنید.');return}if(draft||(!state.savedId&&(state.text.trim()||state.files.length||lastRecording))){modal('گزارش جدیدی شروع می‌کنید؟',`<p>با شروع گزارش جدید، پیش‌نویس قبلی و مستندات پیوست آن حذف می‌شوند.${state.pendingSubmission?' ممکن است ارسال در انتظار قبلاً به سرور رسیده باشد؛ بهتر است ابتدا وضعیت آن را بررسی کنید.':''} آیا مطمئن هستید؟</p><div class="actions"><button class="secondary" data-action="close-modal">انصراف</button><button class="primary" data-action="reset">حذف پیش‌نویس و شروع گزارش جدید</button></div>`)}else actions.reset()},reset:async()=>{stopVoice();clearTimeout(saveTimer);if(draft||(!state.savedId&&(state.text.trim()||state.files.length||lastRecording))){try{await removeDraft()}catch{toast('حذف پیش‌نویس انجام نشد. دوباره تلاش کنید.');return}}state=initialState('home');aiSeq++;aiLoading=false;aiError='';draft=null;clearRecording();connectionMessage='';transcriptReviewed=true;questionHelp=false;errors='';closeModal();render()},draft:()=>{if(!draft){toast('پیش‌نویسی ندارید. با نوشتن شرح، پیش‌نویس خودکار ذخیره می‌شود.');return}Object.assign(state,{extra:{}},draft,{view:'home',busy:false,voice:false,recording:false,confirmed:false});if(state.guide)migrateGuideDraft(state.guide);if(state.pausedGuide)migrateGuideDraft(state.pausedGuide);if(state.ai)migrateAiDraft(state.ai);if(state.analysis)acceptAnalysis(state.analysis);if(aiActive()&&!state.ai.current&&!state.ai.done)askNext();render();toast((state.prefillAudit||[]).some(p=>p.rejectionReason==='legacy_vehicle_narrative')?'پیش‌نویس بازیابی شد؛ برداشت نادرست قدیمی از مشخصه وسیله کنار گذاشته شد و متن اصلی محفوظ است.':'پیش‌نویس و مستندات بازیابی شدند.')},'text-tab':()=>{if(state.busy)return;if(state.recording){toast('ابتدا ضبط را پایان دهید.');return}state.voice=false;render()},'voice-tab':()=>{state.voice=true;render()},'analysis-preview':async()=>{if(state.busy||state.recording||state.text.trim().length<3)return;const result=localAnalysis(state.text);acceptAnalysis(state.clarificationHandled?{...result,clarificationHandled:true,clarification:{needed:false}}:result);startAnalysisReview(state);state.askDetail=true;errors='';await persist();render()},record:startRecording,
 dictate:()=>{
  if(state.busy||state.recording)return;
  errors='';
  if(dictationPhase==='listening')dictation.stop();else dictation.start();
  render();
 },
 'guide-open':()=>{stopVoice();stopDictation();state.guide=state.pausedGuide?.forText===state.text?state.pausedGuide:{orderVersion:2,mode:'intake',index:0,answers:{},skipped:[],base:state.text.trim()};state.pausedGuide=null;guideError='';errors='';persist();render();focusGuide()},
 'guide-back':()=>{
  guideError='';
  if(!state.guide)return;
  state.guide.pendingAdvance=null;captureGuideInput();
  if(state.guide.index===0){
   const g=state.guide;state.pausedGuide={...g,forText:state.text};state.guide=null;
   if(g.mode==='detail'){state.askDetail=true;state.step=1}else state.step=0;
   persist();render();return
  }
  state.guide.index--;persist();render();focusGuide();
 },
 'guide-skip':()=>{
  if(!state.guide)return;state.guide.pendingAdvance=null;
  guideError='';
  const step=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];if(!step)return;
  if(String(document.querySelector('#guide-input')?.value||'').trim()||String(state.guide.answers[step.id]||'').trim())return;
  delete state.guide.answers[step.id];state.guide.draft=null;markSkipped(step.id);rebaseGuide(step.id);
  advanceGuide();
 },
 'guide-next':()=>{
  if(!state.guide)return;
  // Habit: pick an option, then press «ادامه». The option already moved on by
  // itself, so a press that lands just after it would skip a question the
  // reporter never saw. Ignore it.
  if(Date.now()-(state.guide.autoAdvancedAt||0)<900){state.guide.autoAdvancedAt=0;return}
  state.guide.pendingAdvance=null;
  captureGuideInput();
  const step=stepsFor(state.guide.answers,state.guide.base,state.guide.skipped)[state.guide.index];if(!step)return;
  if(!String(state.guide.answers[step.id]||'').trim()&&!(state.guide.skipped||[]).includes(step.id)){
   guideError='برای ادامه، این بخش را بنویسید یا گزینه نداشتن اطلاعات را بزنید.';
   render();return}
  guideError='';advanceGuide();
 },
 'guide-finish':()=>{if(!state.guide)return;captureGuideInput();if(!canFinishGuide(stepsFor(state.guide.answers,state.guide.base,state.guide.skipped),state.guide.index))return;guideError='';finishGuide()},
'audio-upload':()=>document.querySelector('#audio-input')?.click(),
 'audio-capture':()=>document.querySelector('#audio-capture')?.click(),
 'open-browser':()=>{
  // Keep the host's openLink within the original user gesture. Do not copy
  // sensitive report text to the clipboard without a separate user request.
  if(!openExternal(browserUrl())){toast('مرورگر باز نشد؛ نشانی سامانه را در مرورگر گوشی باز کنید.');return}
  toast(config.central?'پیش‌نویس منتقل نمی‌شود؛ ثبت مرکزی به بازکردن دوباره در بله و احراز حساب نیاز دارد.':'پیش‌نویس و فایل‌ها ممکن است به مرورگر دیگر منتقل نشوند؛ این صفحه را نگه دارید.');
 },'retry-transcribe':()=>lastRecording&&transcribeAudio(lastRecording),'download-recording':()=>lastRecording&&download(lastRecording,lastRecording.name),'check-connection':checkConnection,analyze:analyzeOrGuide,'edit-text':()=>{stopVoice();state.step=0;state.confirmed=false;render();document.querySelector('#description')?.focus()},'question-back':backQuestion,'question-next':nextQuestion,'flow-start':()=>beginDetails(),'flow-edit':()=>beginDetails(true),'flow-finish':finishFlowSection,'flow-skip':skipFlowSection,'flow-add':addFlowRow,'flow-unknown':markSectionUnknown,'correct-event':editTopics,'apply-topics':applyTopics,'answer-help':async()=>{const q=currentQuestions()[state.qIndex];questionHelp=`${q.hint} می‌توانید با زبان ساده پاسخ دهید یا بنویسید «نمی‌دانم».`;if(config.ai&&!q.group&&!answerIsUnknown(state.answers[q.id])&&state.answers[q.id]?.trim()){questionHelp='در حال آماده‌سازی پیشنهاد…';render();try{const out=await api('help',{question:q.title,answer:state.answers[q.id]});questionHelp=out.text}catch(e){questionHelp=e.message}}render()},location:useCurrentLocation,upload:()=>document.querySelector('#file-input')?.click(),'evidence-back':()=>{if(state.completedGuide?.forText===state.text){state.guide={...state.completedGuide,pendingAdvance:null,autoAdvancedAt:0};state.step=1;render();focusGuide();return}state.step=currentQuestions().length?1:0;state.qIndex=Math.max(0,currentQuestions().length-1);state.flow=null;render()},review:()=>{state.step=3;state.confirmed=false;persist();render()},'edit-evidence':()=>{state.step=2;state.confirmed=false;render()},'close-modal':closeModal,'copy-id':async()=>{try{await navigator.clipboard.writeText(state.savedId);toast('کپی شد.');}catch{toast('کپی نشد.');}},'submit':submit,'save-identity':()=>{const f=document.querySelector('#reporter-identity-form');if(!f)return;state.reporter={province:f.querySelector('#rep-province')?.value.trim()||'',name:f.querySelector('#rep-name')?.value.trim()||'',mobile:f.querySelector('#rep-mobile')?.value.trim()||'',rank:f.querySelector('#rep-rank')?.value.trim()||'',post:f.querySelector('#rep-post')?.value.trim()||''};state.identityConfirmed=true;closeModal();submit();},'download-report':()=>{const r=reports.find(r=>r.id===state.savedId);download(new Blob([reportText(r)],{type:'text/plain;charset=utf-8'}),`${r.id}.txt`)},'download-active':()=>download(new Blob([reportText(activeReport)],{type:'text/plain;charset=utf-8'}),`${activeReport.id}.txt`),help:()=>modal('راهنمای ثبت گزارش',`<h3>۱. روایت کنید</h3><p>اتفاق را با متن یا صدا شرح دهید. متن حاصل از صوت را بازبینی کنید و «تحلیل و ادامه» را بزنید.</p><h3>۲. جزئیات را تکمیل کنید</h3><p>ابتدا موضوع‌ها و پاسخ‌های برداشت‌شده از متن را تأیید، اصلاح یا حذف کنید. سپس به سؤال‌های باقی‌مانده پاسخ دهید. «نمی‌دانم» هم پاسخ معتبر است.</p><h3>۳. مستندات را اضافه کنید</h3><p>تا ۱۰ تصویر، ویدئو، صوت یا سند، با مجموع حجم ۱۰۰ مگابایت اضافه کنید.</p><h3>۴. مرور و ثبت</h3><p>${config.central?'با تأیید شما گزارش، فایل‌ها و شناسهٔ حساب بله به کارتابل مرکزی ارسال می‌شوند. رسید را نگه دارید. نسخهٔ این مرورگر هم در صورت موفقیت ذخیرهٔ محلی از «گزارش‌های من» قابل دریافت است.':'اطلاعات را تأیید کنید. گزارش و فایل‌ها در این مرورگر باقی می‌مانند و از «گزارش‌های من» قابل دریافت‌اند.'}</p>`),about:()=>modal('راوی، همراه ثبت روایت شما',`<p>راوی برای کوتاه‌کردن مسیر ثبت گزارش طراحی شده است: شرح اولیه، سؤال‌های مرتبط، مستندات و مرور نهایی.</p><p>تمرکز این نسخه بر رخدادهای مشخص، خسارت، سرقت، کلاهبرداری و مشکلات خدمات عمومی است. اطلاعات فردی غیرضروری درخواست نمی‌شود.</p><p>${config.ai?'اتصال هوش مصنوعی تنظیم شده است؛ دسترسی حساب هنگام درخواست بررسی می‌شود.':'این نسخه در حالت پیش‌نمایش کار می‌کند؛ تشخیص اولیه بر اساس قواعد ساده است و اتصال هوش مصنوعی هنوز فعال نشده است.'}</p>`),settings:()=>modal('تنظیمات دستیار',`<h3>وضعیت اتصال</h3><p>${config.ai?'تنظیمات اتصال ذخیره شده است. خطاهای دسترسی یا اعتبار حساب هنگام درخواست نمایش داده می‌شوند.':'حالت پیش‌نمایش فعال است. تشخیص اولیه بر اساس قواعد ساده انجام می‌شود.'}</p><h3>تبدیل صوت</h3><p>تبدیل گفتار فارسی با سرویس تنظیم‌شده و بازبینی متن پیش از تحلیل. دقت نام‌ها، اعداد و بخش‌های مبهم باید با صوت بررسی شود.</p><h3>ذخیرهٔ گزارش و مستندات</h3><p>${config.central?'پس از ثبت نهایی، گزارش و فایل‌ها به کارتابل مرکزی می‌رسند. پیش‌نویس و نسخهٔ احتمالی گزارش در همین مرورگر است و خودکار به دستگاه دیگر منتقل نمی‌شود.':'در این حالت اطلاعات در همین مرورگر ذخیره می‌شود. برای استفاده روی دستگاه دیگر، متن گزارش و مستندات را دریافت کنید.'}</p><button class="secondary" data-action="recheck">${icon('refresh')}بررسی دوبارهٔ اتصال</button>`),recheck:async()=>{await getConfig();closeModal();render();toast(config.ai?'اتصال هوش مصنوعی تنظیم شده است؛ دسترسی حساب هنگام درخواست بررسی می‌شود.':'هنوز اتصال هوش مصنوعی فعال نشده است.')},privacy:()=>modal('حریم خصوصی و اطلاعات',`<p>پیش‌نویس، فایل‌های انتخابی و نسخهٔ احتمالی گزارش ثبت‌شده در حافظهٔ همین مرورگر، بدون رمزگذاری اختصاصی برنامه نگهداری می‌شوند. افراد دارای دسترسی به دستگاه یا حساب مرورگر ممکن است به آنها دسترسی داشته باشند. پاک‌کردن داده‌های سایت می‌تواند آنها را حذف کند و بازیابی یا پیگیری ارسال در انتظار را ناممکن کند. ${config.central?'با تأیید کاربر، گزارش به کارتابل مرکزی این سامانه فرستاده می‌شود؛ به سامانهٔ دیگری ارسال خودکار ندارد.':'در این نسخه گزارش به مرجع دیگری ارسال نمی‌شود.'}</p><p>${privacySummary(config)}</p><p>ضبط صوت در مرورگر انجام می‌شود؛ تبدیل فایل به متن به سرویس گفتار فعال نیاز دارد. از واردکردن رمز، اطلاعات بانکی کامل و داده‌های خصوصی غیرضروری خودداری کنید.</p>`)};
document.addEventListener('click',async e=>{const btn=e.target.closest('[data-action],[data-sample],[data-answer],[data-event],[data-remove-file],[data-download-file],[data-edit-answer],[data-report],[data-add-row],[data-remove-row],[data-edit-section],[data-reject-prefill],[data-review-edit]');if(!btn||btn.disabled)return;e.preventDefault();const d=btn.dataset;if(d.reviewEdit!==undefined){openReviewEditor(+d.reviewEdit);return}if(d.rejectPrefill!==undefined){rejectPrefill(state,+d.rejectPrefill);persist();render();return}if(d.action){await actions[d.action]?.();return}if(d.sample){if(state.busy||state.recording)return;state.text={theft:'دیروز وقتی به محل پارک خودرو در تجریش برگشتم، متوجه شدم شیشهٔ خودرو شکسته و کیف داخل آن به سرقت رفته است.',fraud:'از یک فروشگاه اینترنتی خرید کردم و هزینه را پرداخت کردم، اما کالا ارسال نشده و فروشنده پاسخ نمی‌دهد.',service:'چراغ‌های روشنایی بخشی از پیاده‌رو در محلهٔ ما چند شب است خاموش هستند و دید کافی وجود ندارد.'}[d.sample];state.voice=false;render();autoSave();document.querySelector('#description').focus()}if(d.answer){answerChoice(d.answer)}if(d.removeFile!==undefined){state.files.splice(+d.removeFile,1);state.confirmed=false;persist();render()}if(d.downloadFile!==undefined){const f=document.querySelector('.modal')&&activeReport?activeReport.files[+d.downloadFile]:state.files[+d.downloadFile];if(f)download(f.blob,f.name)}if(d.editAnswer){const k=d.editAnswer;if(['person','object','vehicle','contact'].includes(k)){state.qIndex=currentQuestions().findIndex(q=>q.id===k);state.flow=null;state.step=1;state.confirmed=false;render();return}modal(`ویرایش ${labelFor(k)}`,`<textarea id="edit-value" class="field" rows="4" maxlength="2000">${escape(allAnswers()[k])}</textarea><div class="actions"><button class="secondary" data-action="close-modal">انصراف</button><button class="primary" id="save-edit">ذخیره تغییر</button></div>`);document.querySelector('#save-edit').onclick=()=>{const v=document.querySelector('#edit-value').value.trim();if(!v)return toast('پاسخ را بنویسید یا «نمی‌دانم» وارد کنید.');setAnswer(state,k,v);closeModal();persist();render()}}if(d.addRow){if(state.extra[d.addRow].rows.length>=20)return;state.extra[d.addRow].rows.push(newRow());persist();render()}if(d.removeRow){const [id,i]=d.removeRow.split(':');removeEntityRow(state.extra,id,+i);persist();render()}if(d.editSection){state.qIndex=currentQuestions().findIndex(q=>q.id===d.editSection);state.flow=null;state.step=1;state.confirmed=false;beginDetails(true)}if(d.report)showReport(d.report)});
document.addEventListener('click',async e=>{
 const option=e.target.closest('[data-ai-option]');
 if(option&&state.ai?.current&&!aiLoading){e.preventDefault();const value=state.ai.current.options[+option.dataset.aiOption];if(value)sendAiAnswer(value);return}
 const dial=e.target.closest('[data-dial]');
 if(dial){
  const n=dial.dataset.dial;
  if(!emergencyBrowserUrl(n)){e.preventDefault();return}
  const box=document.querySelector('#triage-fallback');
  if(box){box.hidden=false;box.innerHTML=`اگر شماره‌گیر باز نشد، <b dir="ltr">${fa(n)}</b> را دستی در برنامهٔ تلفن وارد کنید. <button type="button" data-dial-browser="${n}">باز کردن صفحهٔ تماس در مرورگر</button> <button type="button" data-copy="${n}">کپی شماره</button>`}
  // Do not prevent the anchor's default: the user's original tap goes straight
  // to tel:. No WebView API confirms whether the OS actually opened a dialer.
  return;
 }
 const dialBrowser=e.target.closest('[data-dial-browser]');
 if(dialBrowser){
  e.preventDefault();const url=emergencyBrowserUrl(dialBrowser.dataset.dialBrowser);
  if(!url||!openExternal(url))toast('مرورگر باز نشد؛ شماره را دستی در برنامهٔ تلفن وارد کنید.');
  return;
 }
 const copy=e.target.closest('[data-copy]');
 if(copy){e.preventDefault();toast(await copyText(copy.dataset.copy)?'شماره کپی شد.':'کپی نشد؛ شماره را خودتان بگیرید.')}
});
window.addEventListener('beforeunload',e=>{if(!storageOK&&(state.text.trim()||state.files.length||state.guide||state.ai)){e.preventDefault();e.returnValue=''}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&document.querySelector('.modal')){const els=[...document.querySelectorAll('.modal button,.modal input,.modal textarea,.modal select,.modal a')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);if(!els.length)return;const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
async function getConfig(){try{const v=await api('config');if(typeof v.ai!=='boolean')throw new Error('تنظیمات اتصال قابل خواندن نیست.');config={ai:v.ai,provider:v.provider||'',interview:Boolean(v.ai&&v.interview),model:String(v.model||''),transcription:v.transcription!==false,sttLocal:Boolean(v.sttLocal),central:Boolean(v.central),loaded:true,error:''}}catch(e){config={ai:false,provider:'',interview:false,model:'',transcription:false,central:false,loaded:false,error:e.message}}}

render();try{[reports,draft]=await Promise.all([storeGet('reports'),storeGet('drafts','current')]);draftRevision=draft?(draft.revision??0):null;reports.sort((a,b)=>b.created-a.created);if(draft?.region)state.region=draft.region}catch{setStorageStatus(false);toast('ذخیره‌سازی مرورگر در دسترس نیست؛ ممکن است حالت خصوصی فعال باشد.')}draftLoaded=true;await getConfig();render();
