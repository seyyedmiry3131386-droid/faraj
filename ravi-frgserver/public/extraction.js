import {POLICE_CONTACT} from './incident-language.js';
import {detailSchema,relevantExtraIds,visibleFields} from './details.js';
import {normalizeAnalysis,eventIds,detailId,localAnalysis,incidentClauses,EVENTS,normalize} from './scenarios.js';
import {answerIsUnknown} from './answers.js';
import {numericErrors,asciiDigits} from './inputs.js';
import {narrativePrefills,derived,vehicleCharacteristics} from './narrative-facts.js';

// Only copy text spans. Select values, entity links, phone/plate segmentation,
// diagnoses and missing facts always require the reporter's explicit input.
export function extractionCatalog(events){
 return Object.fromEntries(['time','place','source','person','object','vehicle',...events.map(detailId)].map(id=>[id,(detailSchema(id,events[0])?.fields||[]).filter(f=>!f.type&&!f.show&&!f.ref).map(f=>({id:f.id,label:f.label}))]));
}
export function groundPrefills(raw,text,analysis){
 if(analysis.needsClarification||analysis.observationOnly)return [];
 const allowed=relevantExtraIds(analysis),seen=new Set(),rows=new Map();
 return (Array.isArray(raw)?raw:[]).slice(0,120).flatMap(p=>{
  if(!p||!allowed.includes(p.section)||p.section==='contact'||typeof p.value!=='string'||typeof p.evidence!=='string')return [];
  const evidence=p.evidence.trim(),value=p.value.trim();
  if(evidence.length<3||evidence.length>2000||!text.includes(evidence)||!value)return [];
  const schema=detailSchema(p.section,analysis.event);
  if(!schema)return [];
  const field=schema.fields.find(f=>f.id===p.field);
  // A choice or a count is accepted only when the quoted words name exactly
  // that option («دیشب» → «شب», «دو نفر» → 2); everything else is copied.
  const named=Boolean(field&&(field.type==='select'||field.numeric)&&derived(p.section,p.field,evidence)===value);
  if(!evidence.includes(value)&&!named)return [];
  // Model proposals are not allowed to turn a sentence, an unlinked color or
  // a guessed model into a vehicle characteristic, even if it is a quote.
  if(p.section==='vehicle'&&['observation','model','color'].includes(p.field)&&
    !vehicleCharacteristics(evidence).some(f=>f[p.field]===value))return [];
  if(p.field==='answer'){
   if(['person','object','vehicle'].includes(p.section)||value.length>2000)return [];
  }else if(!field||field.type==='select'&&!named||field.ref||value.length>(field.max||300)||field.validate||field.numeric&&numericErrors(field,value).length)return [];
  // Reject isolated keyword extraction that removes negation or hearsay.
  if(/شنید|گفت|احتمال|شاید|نمی|نشد|نبود|نیست|نامعلوم/.test(evidence)&&p.field==='answer'&&value!==evidence)return [];
  const rowKey=schema.repeat?String(p.rowKey||'first').slice(0,80):'first';
  const key=JSON.stringify([p.section,rowKey,p.field]);
  if(seen.has(key))return [];
  const keys=rows.get(p.section)||new Set();keys.add(rowKey);if(keys.size>20)return [];rows.set(p.section,keys);seen.add(key);
  return [{section:p.section,rowKey,field:p.field,value:field?.numeric?asciiDigits(value):value,evidence}];
 }).slice(0,80);
}

const clauses=incidentClauses;
export function localPrefills(text,analysis){
 if(analysis.mode!=='preview')return [];
 const out=[],add=(section,field,value,evidence=value,rowKey='first')=>{if(value)out.push({section,field,value,evidence,rowKey})};
 const parts=clauses(text),topics=eventIds(analysis);
 let cursor=0;
 const spans=parts.map(value=>{const start=text.indexOf(value,cursor);cursor=start+value.length;return {value,start,end:cursor}});
 for(const [id,value] of Object.entries(analysis.known||{}))add(id,'answer',value);
 const location=text.match(/(?:داخل|توی|در)\s+(?:یک\s+)?(?:رستوران|کافه|مغازه|فروشگاه|کارگاه|انبار|منزل|ساختمان)[^،؛.!؟\n]{0,100}?(?=\s+(?:دیدم|دیدیم|شاهد|متوجه|که)|[،؛.!؟\n]|$)/u)?.[0]||text.match(/وارد\s+(?:یک\s+)?((?:سوپر\s*مارکت|فروشگاه|مغازه)[^،؛.!؟\n]{0,80}?)\s+شد(?:م|یم)/u)?.[1];
 add('place','answer',location);
 if(location){
  const building=location.match(/(?:سوپر\s*مارکت|رستوران|کافه|مغازه|فروشگاه|کارگاه|انبار)(?:\s+سنتی)?/)?.[0];
  add('place','building',building,location);
  const district=location.match(/\sدر\s+(.+)$/u)?.[1];if(district)add('place','district',district,location);
 }
 // Use the classified occurrence, including its qualifier, for every topic.
 // A handling failure must not erase the event it refers to.
 for(const id of topics){
  const quote=analysis.eventEvidence?.[id];
  const offset=analysis.localEventOffsets?.[id];
  const part=quote&&(Number.isInteger(offset)?spans.find(p=>p.start<=offset&&p.end>=offset+quote.length)?.value:parts.find(p=>p.includes(quote)));
  // The clause splitter can cut a sentence in two («شیشهٔ | ماشینم…»); then
  // the whole clause that holds the quote is used, or the quote itself.
  const whole=quote&&(text.split(/(?<=[.؛!؟\n،])\s*/u).map(x=>x.trim().replace(/[.؛!؟،]$/u,'').trim()).find(x=>x.includes(quote))||quote);
  add(detailId(id),'answer',part&&quote&&part.includes(quote)?part:whole);
 }
 if(topics.includes('assault')){
  const offset=analysis.localEventOffsets?.assault;
  const p=spans.find(p=>p.start<=offset&&p.end>offset)?.value;
  const tool=p?.match(/سلاح سرد|سلاح گرم|چاقو|قمه|چوب/)?.[0];add('details_assault','tool',tool,p);
 }
 if(topics.includes('official_complaint')){
  const p=parts.find(p=>/کلانتری\s*[\d۰-۹٠-٩]+/.test(p));
  if(p)add('details_official_complaint','agency',p.match(/کلانتری\s*[\d۰-۹٠-٩]+/)[0],p);
  const contact=parts.find(p=>POLICE_CONTACT.test(normalize(p)));
  if(contact)add('details_official_complaint','channel',contact);
  const partial=parts.find(p=>/(?:صرفا|صرفاً|فقط)[^؛.!؟\n]{0,35}(?:نزاع|درگیری)[^؛.!؟\n]{0,25}(?:تمام+|پایان|برطرف|خاتمه)/u.test(normalize(p)));
  if(contact&&partial)add('details_official_complaint','response',partial);

 }
 // Vehicle characteristics are extracted separately from short, explicit
 // model/color spans; a sentence about parking is not itself a characteristic.
 return out;
}

// Correct a generic model label only where an explicit staff/fight relation is
// supported by the narrative. Internal string IDs (manual choices/drafts) stay put.
export function refineStaffConflict(raw,text){
 if(raw.refusal||!Array.isArray(raw.events)||!raw.events.some(e=>e?.type==='assault'||e?.type==='pdf_a04'))return raw;
 const local=localAnalysis(text),quote=local.eventEvidence?.pdf_a04;
 if(!local.events.includes('pdf_a04')||!quote||!/دعوا|نزاع|درگیری|درگیر|زد و خورد|حمله|تعرض/.test(quote))return raw;
 const separate=local.events.includes('assault');
 const related=e=>typeof e==='string'&&text.includes(e)&&(e.includes(quote)||/دعوا|نزاع|درگیری|درگیر|زد و خورد|حمله|تعرض/.test(e)&&local.localEpisodes.some(p=>p.event==='pdf_a04'&&p.evidence.includes(e)));
 if(!raw.events.some(e=>e?.type==='pdf_a04'||e?.type==='assault'&&related(e.evidence)))return raw;
 const remap=item=>{
  if(!related(item.evidence))return item;
  return {...item,...(item.section==='details_assault'?{section:'details_pdf_a04'}:{}),...(item.event==='assault'?{event:'pdf_a04'}:{})};
 };
 const events=raw.events.filter(e=>e?.type!=='pdf_a04'&&(separate||e?.type!=='assault'||!related(e.evidence))).map(e=>e?.type==='assault'&&related(e.evidence)&&separate?{...e,evidence:local.eventEvidence.assault}:e);
 events.push({type:'pdf_a04',evidence:quote});
 return {...raw,events,...Object.fromEntries(['prefills','episodes','questions','prompts','topicAssignments'].map(key=>[key,(Array.isArray(raw[key])?raw[key]:[]).map(remap)]))};
}
// A completeness check for explicit, grounded observations across the topic bank. This
// runs only on fresh model proposals with evidence, never on manual string IDs,
// confirmed drafts, refusals, or an already-normalized response.
const coverageTopics=new Set(Object.keys(EVENTS).filter(id=>id!=='other'));
export function completeIncidentCoverage(raw,text){
 if(raw.refusal||raw.reviewed||!Array.isArray(raw.events)||raw.events.some(e=>!e||typeof e.type!=='string'||typeof e.evidence!=='string'))return raw;
 const local=localAnalysis(text);
 const candidates=local.events.filter(id=>coverageTopics.has(id));
 if(!candidates.length)return raw;
 const present=new Set(raw.events.map(e=>e.type));
 const added=candidates.filter(id=>!present.has(id));
 // Remove a generic threat only when each of its local occurrences is covered
 // by a more specific staff or weapon threat; separate ordinary threats survive.
 const redundant=raw.events.some(e=>e.type==='harassment')&&!local.events.includes('harassment')&&candidates.some(id=>['pdf_a04','weapon_threat','public_nuisance'].includes(id))&&raw.events.filter(e=>e.type==='harassment').every(e=>text.includes(e.evidence)&&local.localEpisodes.some(p=>['pdf_a04','weapon_threat','public_nuisance'].includes(p.event)&&(p.evidence.includes(e.evidence)||e.evidence.includes(p.evidence))));
 const events=raw.events.filter(e=>(e.type!=='other'||!added.length)&&!(redundant&&e.type==='harassment'));
 for(const id of added)events.push({type:id,evidence:local.eventEvidence[id]});
 const episodes=[...(Array.isArray(raw.episodes)?raw.episodes:[]),...local.localEpisodes.filter(e=>candidates.includes(e.event))];
 const prefills=[...(Array.isArray(raw.prefills)?raw.prefills:[]),...localPrefills(text,local).filter(p=>candidates.some(id=>p.section===detailId(id)))];
 return {...raw,events,prefills,episodes,known:{...raw.known,time:raw.known?.time||local.known.time||''},clarification:added.length?{needed:false}:raw.clarification};
}
export function prepareAnalysis(raw,text){
 raw=refineStaffConflict(raw,text);
 raw=completeIncidentCoverage(raw,text);
 const a=normalizeAnalysis(raw,text);
 if(raw.refusal){a.prefills=[];a.episodes=[];return a;}
 const known=Object.entries(a.known).filter(([,v])=>v).map(([section,value])=>({section,field:'answer',rowKey:'first',value,evidence:value}));
 const proposed=[...(Array.isArray(raw.prefills)?raw.prefills:[]),...localPrefills(text,a),...known];
 // Invalid model proposals must not suppress a valid local extraction. A
 // grounded entity still wins, to avoid merging descriptions of two vehicles.
 const grounded=groundPrefills(proposed,text,a);
 const listed=new Set(grounded.filter(p=>['person','vehicle','object'].includes(p.section)).map(p=>p.section));
 const local=groundPrefills(narrativePrefills(text,eventIds(a)).filter(p=>!listed.has(p.section)),text,a);
 const seen=new Set(grounded.map(p=>JSON.stringify([p.section,p.rowKey,p.field])));
 a.prefills=[...grounded,...local.filter(p=>!seen.has(JSON.stringify([p.section,p.rowKey,p.field])))].slice(0,80);
 a.topicAssignments=groundTopicAssignments(raw.topicAssignments,text,a);
 a.episodes=(Array.isArray(raw.episodes)&&raw.episodes.length?raw.episodes:a.mode==='preview'?a.localEpisodes||a.prefills.filter(p=>p.section.startsWith('details_')&&p.field==='answer').map(p=>({event:p.section.slice(8),evidence:p.evidence})):[]).filter(e=>eventIds(a).includes(e.event)&&typeof e.evidence==='string'&&e.evidence.length>=3&&text.includes(e.evidence)).filter((e,i,all)=>all.findIndex(p=>p.event===e.event&&p.evidence===e.evidence)===i).slice(0,24).map(e=>({event:e.event,evidence:e.evidence}));
 return a;
}

// Internal topic organisation only; never infer ownership or person-to-person links.
export function groundTopicAssignments(raw,text,a){
 if(a.observationOnly||a.needsClarification)return [];
 const result=[],seen=new Set();
 for(const p of Array.isArray(raw)?raw.slice(0,80):[]){
  if(!['person','place','object','vehicle'].includes(p?.section)||!eventIds(a).includes(p.event)||typeof p.evidence!=='string'||p.evidence.length<6||p.evidence.length>600||!text.includes(p.evidence))continue;
  const source=a.prefills.find(f=>f.section===p.section&&f.rowKey===p.rowKey&&f.field!=='answer'&&p.evidence.includes(f.value));
  const eventQuote=a.eventEvidence?.[p.event];
  if(!source||!eventQuote||!p.evidence.includes(eventQuote))continue;
  const key=JSON.stringify([p.section,p.rowKey,p.event]);if(seen.has(key))continue;seen.add(key);
  result.push({section:p.section,rowKey:p.rowKey,event:p.event,evidence:p.evidence});
 }
 return result;
}
export function applyTopicAssignments(state){
 for(const data of Object.values(state.extra||{}))for(const row of data.rows||[])delete row._topicSuggestions;
 for(const p of state.analysis?.topicAssignments||[]){
  const audit=(state.prefillAudit||[]).find(f=>f.section===p.section&&f.rowKey===p.rowKey&&f.rowId&&f.status!=='rejected'&&currentValue(state,f)===f.value);
  const row=audit&&rowFor(state,audit);if(!row||answerIsUnknown(state.answers[p.section]))continue;
  row._topicSuggestions??=[];row._topicSuggestions.push({event:p.event,evidence:p.evidence,field:audit.field,value:audit.value});
 }
}

const rowFor=(state,p)=>state.extra?.[p.section]?.rows?.find(r=>r._id===p.rowId);
export const currentPrefillValue=(state,p)=>p.field==='answer'?state.answers[p.section]:rowFor(state,p)?.[p.field];
const currentValue=currentPrefillValue;
// Older drafts sometimes auto-filled a whole parking/incident sentence as a
// vehicle characteristic. Withdraw only that unedited automatic value; the
// original quotation remains in the narrative and the audit entry is retained.
export function removeLegacyVehicleNarratives(state){
 let changed=0;
 for(const p of state.prefillAudit||[]){
  if(p.section!=='vehicle'||p.field!=='observation'||p.status==='rejected'||p.editedValue!==undefined||currentValue(state,p)!==p.value)continue;
  const value=String(p.value||'').trim(),evidence=String(p.evidence||'').trim();
  if(value!==evidence||vehicleCharacteristics(evidence).some(f=>f.observation===value))continue;
  if(value.length<80&&!/(?:^|\s)(?:پارک|دیدم|دیدیم|بود|بودند|شد|شدند|رفت|شکست|سرقت|برد|می\s)/u.test(normalize(value)))continue;
  const row=rowFor(state,p);if(!row)continue;
  delete row.observation;p.status='rejected';p.rejectionReason='legacy_vehicle_narrative';changed++;
 }
 return changed;
}
export function applyPrefills(state,makeRow){
 const old=state.prefillAudit||[],sameText=state.prefillText===state.text;
 // A later AI analysis of the same description may fill a previously untouched
 // section, but cannot undo any reviewed, edited or rejected extraction.
 const touchedSections=new Set(sameText?old.map(p=>p.section):[]);
 const editedSections=new Set(old.filter(p=>p.field!=='answer'&&currentValue(state,p)!==p.value&&p.status!=='rejected').map(p=>p.section));
 for(const p of sameText?[]:old)if(p.status!=='rejected'&&currentValue(state,p)===p.value){
  if(p.field==='answer')delete state.answers[p.section];else delete rowFor(state,p)[p.field];
 }
 for(const data of Object.values(state.extra||{}))data.rows=(data.rows||[]).filter(r=>!r._auto||Object.keys(r).some(k=>!k.startsWith('_')&&r[k]));
 state.prefillAudit=sameText?old:[];state.prefillText=state.text;
 const rowMap=new Map();
 for(const p of state.analysis.prefills||[]){
  if(touchedSections.has(p.section))continue;
  if(answerIsUnknown(state.answers[p.section]))continue;
  if(p.field==='answer'){
   if(String(state.answers[p.section]||'').trim())continue;
   state.answers[p.section]=p.value;
   state.prefillAudit.push({...p,status:'pending'});continue;
  }
  if(editedSections.has(p.section))continue;
  const schema=detailSchema(p.section,state.analysis.event);
  const data=state.extra[p.section]??={enabled:false,rows:[]};
  // Never attach a new extracted fact to a user-authored entity.
  if(data.rows.some(r=>!r._auto&&Object.keys(r).some(k=>!k.startsWith('_')&&r[k])))continue;
  const key=JSON.stringify([p.section,p.rowKey]);
  let row=rowMap.get(key);
  if(!row){if(data.rows.length>=20)continue;row={...makeRow(),_auto:true};data.rows.push(row);rowMap.set(key,row)}
  if(!schema||row[p.field])continue;
  row[p.field]=p.value;data.enabled=true;
  state.prefillAudit.push({...p,rowId:row._id,status:'pending'});
 }
}
export function activePrefills(state,section){
 const allowed=relevantExtraIds(state.analysis);
 return (state.prefillAudit||[]).filter(p=>(!section||p.section===section)&&allowed.includes(p.section)&&p.status!=='rejected'&&!answerIsUnknown(state.answers[p.section])&&currentValue(state,p)===(p.editedValue??p.value)&&(p.field==='answer'||state.extra[p.section]?.enabled));
}
export function rejectPrefill(state,index){
 const p=state.prefillAudit?.[index];if(!p)return;
 if(currentValue(state,p)===(p.editedValue??p.value)){if(p.field==='answer')delete state.answers[p.section];else delete rowFor(state,p)[p.field]}
 p.status='rejected';state.confirmed=false;
}
export function confirmPrefills(state,section){for(const p of activePrefills(state,section))p.status='confirmed'}
export function remainingFields(state,section){
 const schema=detailSchema(section,state.analysis?.event);if(!schema||!state.extra?.[section]?.enabled)return [];
 const data=state.extra[section];
 return [...new Set(data.rows.flatMap(row=>visibleFields(schema,row).filter(f=>!f.ref&&!row[f.id]&&f.id!=='eventRef').map(f=>f.label)))];
}

/**
 * Fills the date of the time section from a day-word in the narrative.
 *
 * «دیشب» names a day; the reporter should not have to convert it into a
 * calendar date themselves. The date is computed, not quoted, so it does not go
 * through the prefill audit (whose rule is that every value is verbatim from
 * the narrative). It is marked `_derivedFrom` instead, shown with its source
 * word, and it never overwrites a date the reporter entered or changed.
 * Only the clock time is left for them to choose.
 */
export function applyRelativeDate(state,makeRow,resolve,today=new Date()){
 const date=resolve(state.text,today);
 const data=state.extra.time;
 const row=data?.rows?.[0];
 // Their own date wins, and so does a date they deliberately cleared.
 if(row&&(row.date&&!row._derivedFrom||row._dateCleared))return;
 if(!date){
  // The narrative no longer names a day: withdraw a date we derived earlier.
  if(row?._derivedFrom){delete row.date;delete row._derivedFrom}
  return;
 }
 const word=(String(state.text).match(/(?:همین\s*(?:الان|حالا)|هم\s*اکنون|اکنون|الان|امروز|امشب|دیروز|دیشب|شب\s*گذشته|روز\s*گذشته|پریشب|پریروز)/u)||[''])[0];
 const target=data??(state.extra.time={enabled:false,rows:[]});
 const r=target.rows[0]??(target.rows[0]={...makeRow(),_auto:true});
 r.date=date;r._derivedFrom=word;target.enabled=true;
}
