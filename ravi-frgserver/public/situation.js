// Reading the reporter's situation before asking them anything.
//
// Two jobs, both offline and both conservative:
//
//  1. Triage — some accounts need a phone call before they need a form. When
//     the narrative describes something still happening, someone hurt, or a
//     person in danger, the assistant says so first and names the number.
//     It never diagnoses and never decides for the reporter; it surfaces the
//     number and lets them choose.
//  2. Seeding — whatever the reporter already wrote is information they should
//     not be asked for twice. Each of the seven facts is checked against their
//     own words, and a fact they already gave is marked known so the interview
//     skips it. Nothing is copied into an answer: a known fact stays in their
//     original sentence, it is never rewritten into catalogue wording.

import { normalize } from './persian-normalize.js';

// ------------------------------------------------------------------ triage
// Wording that says the event is happening now, not that it happened. The
// present/progressive and «دارد» forms carry this in Persian, so they are
// matched next to the behaviour rather than on their own.
const NOW = /(?:همین\s*(?:الان|حالا|لحظه)|الان|اکنون|هم\s*اکنون|در\s*حال|دارن?د?\s|دارن\s|هنوز|همچنان|ادامه\s*دارد|ادامه\s*داره|تمام\s*نشده)/u;
const ONGOING_HARM = /(?:کتک|میزن|می\s*زن|درگیر|دعوا|نزاع|تهدید|چاقو|اسلحه|قمه|شلیک|تیراندازی|گروگان|نگه\s*داشت|زندانی|حبس|فرار|تعقیب|اتش\s*سوزی|اتیش|حریق|دود|نشت\s*گاز|بوی\s*گاز|گیر\s*کرده|زیر\s*اوار)/u;
const INJURY = /(?:زخمی|مجروح|خون(?:ریزی|ی)?|بیهوش|از\s*حال\s*رفت|نفس\s*نمی|تنفس|شکستگی|سوختگی|برق\s*گرفت|مسموم|حالش\s*بد|اورژانس|امبولانس|بیمارستان|درمانگاه|کما|تشنج)/u;
const LIFE_RISK = /(?:خودکشی|خودزنی|خودم\s*را\s*بکشم|رگ\s*زد|قرص\s*خورد|دار\s*زد|جان(?:ش)?\s*در\s*خطر|می\s*کشند?ش?|بکشند?ش?|نجات)/u;
const CHILD_RISK = /(?:کودک|بچه|نوزاد|طفل|دانش\s*اموز|نوجوان)/u;
const FIRE_RISK = /(?:اتش\s*سوزی|اتیش|حریق|شعله|دود\s*غلیظ|انفجار|ترکید|نشت\s*گاز|بوی\s*گاز|کپسول)/u;

/** True when the narrative reads as something still in progress. */
export const isHappeningNow = text => NOW.test(normalize(text));

/**
 * What, if anything, the reporter should do before filling in a form.
 * `level` is 'emergency' when life or safety is at stake right now,
 * 'attention' when the account mentions harm that may still need care, and
 * 'none' otherwise. The message is advice, never an instruction, and the
 * report itself always stays available.
 */
export function triageWording(text) {
 const value = normalize(text);
 if (!value) return { level: 'none', numbers: [] };
 const numbers = new Set();
 const happening = NOW.test(value);

 if (LIFE_RISK.test(value)) {
  numbers.add('۱۱۵');
 }
 if (happening && ONGOING_HARM.test(value)) {
  numbers.add('۱۱۰');
 }
 if (FIRE_RISK.test(value) && happening) {
  numbers.add('۱۲۵');
 }
 if (INJURY.test(value)) {
  numbers.add('۱۱۵');
 }
 if (CHILD_RISK.test(value) && (ONGOING_HARM.test(value) || INJURY.test(value))) {
  numbers.add('۱۲۳');
 }
 if (!numbers.size) return { level: 'none', numbers: [] };
 const emergency = happening || LIFE_RISK.test(value);
 return { level: emergency ? 'emergency' : 'attention', numbers: [...numbers] };
}

// ----------------------------------------------------------------- seeding
// The reporter's own words, read once, so the interview can skip what they
// have already told us. These are the same seven facts the checklist tracks;
// the patterns live in guidance.js and are passed in, so there is one
// definition of each fact and no second opinion about what counts.

/**
 * Which facts the reporter's text already carries.
 * `checks` is the FACT_CHECKS list; the result is a Set of fact ids.
 */
export function knownFacts(text, checks) {
 const value = normalize(text);
 const out = new Set();
 if (!value) return out;
 for (const check of checks) if (check.test.test(value)) out.add(check.id);
 return out;
}

// Ways a reporter says «I don't know» inside an answer box. Treated as a skip,
// so the words never land in the report as if they were a fact.
const NO_ANSWER = /^(?:نمی\s*(?:دانم|دونم)|نمیدونم|نمیدانم|نمیدونم\s*والا|نمی\s*دونم\s*والا|بلد\s*نیستم|یادم\s*نیست|به\s*یاد\s*ندارم|ندیدم|نفهمیدم|مطمین\s*نیستم|هیچی|هیچ|ندارم|اطلاعی\s*ندارم|اطلاعات(?:ی|\s*بیشتری)?\s*ندارم|نامعلوم|نامشخص|معلوم\s*نیست|فراموش\s*کردم|\?|؟|-|_|\.)+$/u;

/** True when an answer box holds «I don't know» rather than an answer. */
export const isNonAnswer = value => {
 const v = normalize(value);
 return !v || NO_ANSWER.test(v);
};
