// Versioned contract shared by UI, API and the untrained model prototype.
// Required means the reporter must respond to a section; no fact is mandatory.
import {NUMBERED_TOPICS} from './numbered-topics.js';
export const BANK_VERSION='2026-09-colloquial-v9';
export const CATEGORIES={
 person:{title:'افراد',sections:['person','contact'],description:'نقش و مشخصات مشاهده‌شدهٔ افراد مرتبط؛ راه ارتباطی استفاده‌شده در همین رخداد'},
 place:{title:'اماکن',sections:['place'],description:'مکان، نشانی، نوع محل، مسیر و نحوهٔ اطلاع'},
 event:{title:'رویداد',sections:['time','event_details','source'],description:'چه اتفاقی افتاد، چه زمانی، ترتیب رخدادها، نتیجه و منبع اطلاع'},
 object:{title:'اشیاء',sections:['object','vehicle'],description:'اموال، مدارک، وسایل دیجیتال و وسایل نقلیهٔ مرتبط'}
};
const core={
 ...Object.fromEntries(Object.entries(NUMBERED_TOPICS).map(([id,e])=>[id,e.categories])),
 drug_use:['event'],drug_supply:['event','object'],weapon_threat:['person','event','object'],vehicle_irregularity:['event','object'],resource_extraction:['place','event','object'],financial_complaint:['event'],property_dispute:['place','event'],family_dispute:['event'],medical_care:['place','event'],traffic_violation:['event','object'],passenger_complaint:['event'],workplace_accident:['place','event'],self_harm:['event'],fireworks:['place','event','object'],sexual_violence:['event'],online_harm:['event'],public_nuisance:['place','event'],
 official_complaint:['event'],business_observation:['place','event'],environment:['place','event'],disaster:['place','event'],supply_issue:['event','object'],food_safety:['place','event','object'],shooting:['event'],explosion:['place','event'],impersonation:['person','event'],discovery:['person','place','event'],hazardous_supply:['event','object'],
 trafficking:['person','event'],confinement:['person','event'],assault:['person','event'],harassment:['person','event'],
 theft:['event','object'],forgery:['event','object'],damage:['event','object'],accident:['event','object'],
 data_breach:['event','object'],fraud:['event'],
 // topics added later: where each one's questions belong
 home_burglary:['place','event','object'],vehicle_theft:['event','object'],
 bribery:['person','event'],embezzlement:['event','object'],dereliction:['person','event'],corrupt_network:['person','event'],abuse_of_office:['person','event'],
 stolen_goods:['place','event','object'],gambling:['place','event'],investment_fraud:['event'],cyber_attack:['event','object'],
 identity_misuse:['event','object'],dangerous_instruction:['event'],drone_sighting:['place','event'],fire:['place','event'],service:['place','event'],other:['event']
};
const ids=values=>[...new Set((values||[]).filter(id=>Object.hasOwn(CATEGORIES,id)))];
export function categoryForSection(id){
 if(id==='person'||id==='contact')return 'person';
 if(id==='place')return 'place';
 if(id==='object'||id==='vehicle')return 'object';
 return 'event';
}
export function requiredCategories(analysis={}){
 const events=analysis.events?.map(e=>typeof e==='string'?e:e.type)||[analysis.event||'other'];
 if(analysis.observationOnly||events.every(e=>e==='other'))return ['event'];
 const manual=ids(analysis.categorySelection);
 if(manual.length)return manual;
 return ids([...events.flatMap(id=>core[id]||['event']),...ids(analysis.categories)]);
}
export function inferCategories(text,events){
 const s=String(text||'').replace(/\u200c/g,' ');
 const found=new Set(events.flatMap(id=>core[id]||['event']));
 if(/افراد|فرد|شاهد|راننده|فروشنده|آسیب دیده|(?:یک|دو|سه|چهار|پنج|چند|[۰-۹\d]+)\s*(?:تا\s*)?نفر|سارق|دزد|مهاجم|مجروح|قربانی/.test(s))found.add('person');
 if(/خیابان|کوچه|ساختمان|محله|انبار|پارکینگ|کارگاه|منزل|مغازه|فروشگاه|محل نگهداری|رستوران|کافه/.test(s))found.add('place');
 if(/خودرو|ماشین|وسیله|موتور|کامیون|ون |کیف|مدرک|گوشی|لپ تاپ|کالا|بسته|سند/.test(s))found.add('object');
 return [...found];
}
export function sectionRequired(id,analysis){
 if(id==='clarify')return true;
 // Supplemental communication, vehicle, provenance and custom questions remain optional.
 if(id==='contact'||id==='vehicle'||id==='source'||id.startsWith('custom_'))return false;
 return requiredCategories(analysis).includes(categoryForSection(id));
}
export function questionAnswered(q,answers={},extra={}){
 if(String(answers[q.id]||'').trim())return true;
 return Boolean(extra[q.id]?.enabled&&extra[q.id].rows?.some(row=>Object.entries(row).some(([key,value])=>!key.startsWith('_')&&typeof value==='string'&&value.trim())));
}
export function orderedSections(analysis,eventSections,customSections=[]){
 if(analysis.needsClarification)return ['clarify'];
 if(analysis.observationOnly||((analysis.events||[analysis.event]).every(e=>e==='other')))return ['time','place',...eventSections,'source'];
 const required=requiredCategories(analysis);
 const order=Object.keys(CATEGORIES).sort((a,b)=>Number(required.includes(b))-Number(required.includes(a)));
 return order.flatMap(id=>CATEGORIES[id].sections.flatMap(section=>section==='event_details'?[...eventSections,...customSections]:[section]));
}
// Topics whose report normally turns on a phone number, an account, a page or
// a payment; and those that turn on a vehicle. Everything else is asked about
// a vehicle or a contact only when the narrative itself mentions one.
const CONTACT_TOPICS=new Set(['fraud','harassment','impersonation','investment_fraud','identity_misuse','online_harm','data_breach','cyber_attack','gambling','dangerous_instruction','financial_complaint','trafficking']);
const VEHICLE_TOPICS=new Set(['vehicle_theft','accident','traffic_violation','vehicle_irregularity','passenger_complaint']);
// Someone did this to the reporter, so «did you see who?» is always relevant.
const PERSON_TOPICS=new Set(['theft','home_burglary','vehicle_theft','assault','harassment','sexual_violence','weapon_threat','confinement','trafficking','bribery','abuse_of_office','dereliction','corrupt_network','embezzlement','impersonation']);
const ONLINE_TOPICS=new Set(['online_harm','data_breach','cyber_attack','identity_misuse','dangerous_instruction']);
/**
 * Whether a section belongs in THIS report's questions. A section that has
 * nothing to do with the incident is not shown at all (it used to be offered
 * as optional, which read as an irrelevant question).
 */
export function sectionRelevant(section,analysis={},required=requiredCategories(analysis)){
 const events=(analysis.events||[analysis.event]).map(e=>typeof e==='string'?e:e?.type).filter(Boolean);
 const follow=new Set(analysis.followups||[]);
 const manual=ids(analysis.categorySelection);
 if(manual.length&&['person','place','object','vehicle','contact'].includes(section)&&manual.includes(categoryForSection(section))&&section!=='vehicle'&&section!=='contact')return true;
 switch(section){
  case 'person':return required.includes('person')||follow.has('person')||events.some(e=>PERSON_TOPICS.has(e));
  case 'object':return required.includes('object');
  case 'place':return required.includes('place')||!events.length||!events.every(e=>ONLINE_TOPICS.has(e));
  case 'vehicle':return follow.has('vehicle')||events.some(e=>VEHICLE_TOPICS.has(e));
  case 'contact':return follow.has('contact')||events.some(e=>CONTACT_TOPICS.has(e));
  default:return true;
 }
}
export const BANK_AI_RULES=`Question bank version ${BANK_VERSION}. Four multi-label categories: person (افراد), place (اماکن), event (رویداد), object (اشیاء). Vehicles are objects, communication channels are supplemental incident-related information. Return every explicitly related category with a verbatim evidence quote. Multiple categories may be required together. The UI requires a response to each related main section, accepting 'I do not know'; every individual field is optional. Other categories are offered as optional and can be skipped. Never invent missing details, fill unknowns, treat empty as no, or infer a person's guilt. The fixed bank covers: person role, source, voluntarily observed appearance; place role/address/building/postcode/floor/unit; event time/sequence/consequence/source and per-topic fields; object type/brand/model/quantity/serial/condition/last observation plus vehicles/plate templates; incident communication including provincial landline + subscriber, mobile, email, platform + social path. The UI presents at most three related fields per step and never asks the reporter to choose internal event/entity classifications. Do not duplicate these fields in custom questions. A bare allegation without concrete harm still requires clarification before any personal information.`;
