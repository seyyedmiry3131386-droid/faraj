// One answer policy shared by rendering, persistence, validation and exports.
const normal=s=>String(s||'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/[،,.!?؟؛:]/g,' ').replace(/\s+/g,' ').trim();
const UNKNOWN=new Set(['نمی دانم','نمیدانم','نمی دونم','نمیدونم','اطلاعی ندارم','اطلاعاتی ندارم','اطلاعات بیشتری ندارم','مکان را نمی دانم','زمان دقیق را نمی دانم','خیر اطلاعی ندارم','نامعلوم','نامشخص'].map(normal));
export const answerIsUnknown=value=>UNKNOWN.has(normal(value));
export function setAnswer(state,id,value,{group=false}={}){
 state.answers[id]=value;state.confirmed=false;
 if(answerIsUnknown(value)){if(state.extra?.[id])state.extra[id].enabled=false}
 else if(group&&value==='بله، اطلاعات دارم'){state.extra??={};state.extra[id]??={rows:[]};state.extra[id].enabled=true}
}
export function effectiveExtras(extra={},answers={}){
 return Object.fromEntries(Object.entries(extra).map(([id,data])=>[id,{...data,enabled:Boolean(data?.enabled)&&!answerIsUnknown(answers[id])}]));
}
export function reconcileAnswers(state){
 state.answers??={};state.extra??={};
 for(const [id,value] of Object.entries(state.answers))if(answerIsUnknown(value)&&state.extra[id])state.extra[id].enabled=false;
 return state;
}
