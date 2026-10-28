// The server and browser replay the same versioned order. A model's proposed
// question, cursor or done flag never determines the next stage.
import {GUIDE_STEPS,FOLLOW_UPS,GUIDE_ORDER_VERSION,coreStepsFor,stepsFor,guideAnswersFromTurns,guideStageForQuestion,guideStageWithContext,interviewOptionLabels} from './guidance.js';

// 20 historical questions, seven core stages and every active follow-up.
export const MAX_LEGACY_TURNS=20;
export const MAX_INTERVIEW_TURNS=MAX_LEGACY_TURNS+GUIDE_STEPS.length+FOLLOW_UPS.filter(s=>!s.deprecated&&!s.legacyOnly).length;

// Drafts made before the seven-stage change may contain an old victim and a
// separate evidence question; neither is the new actor question.
const OLD_WHO='چه کسی: این اتفاق برای چه کسی افتاد؟';
const OLD_EVIDENCE='مدرک یا نشانه‌ای دارید؟';

export function orderedInterviewPath({mode='detail',text='',turns=[],orderVersion=4}={}){
 const base=mode==='detail'?text:'';
 const grouped=orderVersion===GUIDE_ORDER_VERSION;
 const core=grouped?null:coreStepsFor({},base,{contextual:false});
 const recovered=[];let cursor=0,legacyCount=0,oldDraft=false;
 const contextCache=new Map();
 const keepLegacy=turn=>{legacyCount++;const {stage,...rest}=turn;recovered.push(rest)};
 const groupedNext=()=>{
  const {answers,skipped,completed}=guideAnswersFromTurns(recovered,base);
  const done=new Set(completed);
  return stepsFor(answers,base,skipped,{contextCache}).find(step=>!done.has(step.id))||null;
 };
 for(const turn of turns){
  const legacyStage=(turn.stage==='who'&&turn.q===OLD_WHO)||(turn.stage==='evidence'&&turn.q===OLD_EVIDENCE);
  if(legacyStage){oldDraft=true;keepLegacy(turn);continue}
  const step=guideStageForQuestion(turn.q,turn.stage||null);
  const next=grouped?groupedNext():core[cursor];
  if(step&&next?.id===step.id){
   if(!grouped)cursor++;
   recovered.push({...turn,stage:step.id});continue;
  }
  // Current tagged turns must be exactly in sequence. Old, untagged history
  // remains text and can never skip a required stage or reopen an old actor.
  if(turn.stage&&!(oldDraft&&step))return {error:'ترتیب مرحله‌های مصاحبه نامعتبر است.'};
  keepLegacy(turn);
 }
 if(legacyCount>MAX_LEGACY_TURNS)return {error:'پرسش و پاسخ‌ها نامعتبرند.'};
 if(grouped)return {next:groupedNext(),turns:recovered};
 // Older clients had seven base stages first, with local follow-ups afterward.
 const canonical=GUIDE_STEPS.find(s=>s.id===core[cursor]?.id);
 const context=[text,...recovered.map(t=>t.a)].filter(Boolean).join('\n');
 return {next:guideStageWithContext(canonical,context),turns:recovered};
}

export function orderedClientStep(ai,raw,text=''){
 const path=orderedInterviewPath({mode:ai.mode,text,turns:ai.turns,orderVersion:ai.orderVersion});
 if(path.error)throw new Error(path.error);
 if(!path.next)return {...raw,done:true,stage:null,question:'',hint:'',options:[]};
 const step=path.next;
 return {...raw,done:false,stage:step.id,question:step.title,hint:step.hint,
  options:interviewOptionLabels(step),narrative:''};
}
