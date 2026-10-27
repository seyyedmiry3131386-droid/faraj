// The same replayable order is used by the server and the browser. A model's
// proposed question, cursor or done flag never determines the next stage.
import {coreStepsFor,guideStageForQuestion} from './guidance.js';

// Drafts made before the seven-stage change may contain the old victim
// question and a separate evidence question. Preserve their answers as legacy
// text, but do not mistake the old victim question for the new actor question.
const OLD_WHO='چه کسی: این اتفاق برای چه کسی افتاد؟';
const OLD_EVIDENCE='مدرک یا نشانه‌ای دارید؟';

export function orderedInterviewPath({mode='detail',text='',turns=[]}={}){
 const steps=coreStepsFor({},mode==='detail'?text:'');
 const recovered=[];let cursor=0,legacyCount=0,oldDraft=false;
 const keepLegacy=turn=>{legacyCount++;const {stage,...rest}=turn;recovered.push(rest)};
 for(const turn of turns){
  const legacyStage=(turn.stage==='who'&&turn.q===OLD_WHO)||(turn.stage==='evidence'&&turn.q===OLD_EVIDENCE);
  if(legacyStage){oldDraft=true;keepLegacy(turn);continue}
  const step=guideStageForQuestion(turn.q,turn.stage||null);
  if(step&&steps[cursor]?.id===step.id){
   cursor++;recovered.push({...turn,stage:step.id});continue;
  }
  // Out-of-order tagged stages from a current client are invalid. Following an
  // identified old draft, keep its remaining old turns as text rather than
  // allowing them to skip the new actor stage.
  if(turn.stage&&!(oldDraft&&step))return {error:'ترتیب مرحله‌های مصاحبه نامعتبر است.'};
  keepLegacy(turn);
 }
 if(legacyCount>20)return {error:'پرسش و پاسخ‌ها نامعتبرند.'};
 return {next:steps[cursor]||null,turns:recovered};
}

export function orderedClientStep(ai,raw,text=''){
 const path=orderedInterviewPath({mode:ai.mode,text,turns:ai.turns});
 if(path.error)throw new Error(path.error);
 if(!path.next)return {...raw,done:true,stage:null,question:'',hint:'',options:[]};
 const step=path.next;
 return {...raw,done:false,stage:step.id,question:step.title,hint:step.hint,
  options:(step.options||[]).filter(o=>o.phrase).map(o=>o.label).slice(0,4),narrative:''};
}
