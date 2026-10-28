import {normalize} from './persian-normalize.js';

// Suggestions are never extracted facts. These lists only decide which
// optional shortcuts are sensible to offer; nothing is saved until tapped.
// When topics or roles are ambiguous, leave the answer box and skip button
// available instead of asking the reporter to accept an invented detail.
const ACTOR_TOPICS = new Set([
 'theft', 'home_burglary', 'vehicle_theft', 'fraud', 'investment_fraud',
 'assault', 'harassment', 'weapon_threat', 'damage', 'confinement',
 'trafficking', 'impersonation', 'data_breach', 'cyber_attack', 'identity_misuse',
 'drug_supply', 'pdf_a03', 'pdf_a04', 'pdf_a09', 'pdf_a14', 'pdf_a15',
 'pdf_a16', 'pdf_a17', 'pdf_b15', 'pdf_b16', 'pdf_b22', 'pdf_b25', 'pdf_b26',
]);
const DISPUTE_TOPICS = new Set(['assault', 'harassment', 'family_dispute', 'property_dispute']);
// A number may refer to a witness or victim rather than an actor. That is
// exactly why it is unsafe to offer competing counts when one is mentioned.
const PERSON_COUNT = /(?:^|[^\p{L}\p{N}_])(?:یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|چند|[\d۰-۹]+)\s*(?:تا\s*)?(?:نفر|فرد|شخص|مرد|زن|پسر|دختر)(?![\p{L}\p{N}_])/u;
const FINANCIAL = /پول|بدهی|بدهکار|طلب|قرض/u;
const NEGATED_OR_UNCERTAIN = /(?:نیست|نبود|نشد|نکرد|ندارد|نداشت|ندارم|نمی\s*دان|نمیدان|شاید|احتمال|مطمئن\s*نیست)/u;
const SELF_HARM_PERSON = [
 {label: 'فرد یا افراد مورد اشاره را می‌شناسم', phrase: 'فرد یا افراد مورد اشاره را می‌شناسم'},
 {label: 'فرد یا افراد مورد اشاره را نمی‌شناسم', phrase: 'فرد یا افراد مورد اشاره را نمی‌شناسم'},
];
const neutralResult = {
 hint: 'آنچه مشاهده کرده یا شنیده‌اید را به اختصار شرح دهید؛ موارد نامعلوم را حدس نزنید.',
 placeholder: 'شرح کوتاهی از آنچه می‌دانید بنویسید.',
};
const neutralMethod = {
 hint: 'فقط اگر از نحوه رخداد اطلاع دارید، آن را شرح دهید.',
 placeholder: 'آنچه درباره نحوه رخداد می‌دانید بنویسید.',
};

/** Return a presentation-only copy; stage IDs, ordering and answers never change. */
export function adaptiveGuideSuggestions(step, {text = '', events = [], actorCountText = text} = {}) {
 const topics = [...new Set(events.filter(id => id !== 'other'))];
 const words = normalize(text);
 const selfHarm = topics.includes('self_harm');
 const singleActorTopic = topics.length === 1 && ACTOR_TOPICS.has(topics[0]);

 if (step.id === 'who') {
  if (selfHarm) {
   return {...step,
    hint: 'فقط آنچه درباره فرد یا افراد مورد اشاره می‌دانید بنویسید؛ هویت یا علت را حدس نزنید.',
    freeTextLabel: 'یا آنچه درباره فرد یا افراد مورد اشاره می‌دانید بنویسید',
    // With multiple topics, it may not be clear which person is being asked
    // about. Avoid associating the wrong person with either incident.
    options: topics.length === 1 ? SELF_HARM_PERSON.map(o => ({...o})) : [],
   };
  }
  if (!singleActorTopic) return {...step, options: []};
  const countMentioned = PERSON_COUNT.test(normalize(actorCountText));
  return {...step, options: (step.options || []).filter(o =>
   !countMentioned || !['یک نفر', 'چند نفر'].includes(o.label))};
 }

 if (step.id === 'reason') {
  // A prior conflict is at least relevant to a single dispute. A financial
  // motive is offered only if the account actually mentions money or debt.
  // Negation/uncertainty or multiple incidents make even these unsafe.
  const dispute = topics.length === 1 && DISPUTE_TOPICS.has(topics[0]) && !NEGATED_OR_UNCERTAIN.test(words);
  const options = (step.options || []).filter(o => !o.phrase ||
   (dispute && o.label === 'سر اختلاف قبلی بود') ||
   (dispute && FINANCIAL.test(words) && o.label === 'سر پول یا بدهی بود'));
  // The historical phrases say the cause was heard from someone else. Show
  // that qualification on the chip itself rather than silently adding it.
  return {...step, options: options.map(o => o.phrase ? {...o, label:o.phrase} : o)};
 }

 // The old examples described a theft even when the report was about another
 // topic, or when the incident was not known yet. Keep examples neutral then.
 if ((step.id === 'result' || step.id === 'method') && !(topics.length === 1 && topics[0] === 'theft')) {
  const presentation = step.id === 'result' ? neutralResult : neutralMethod;
  if (!selfHarm) return {...step, ...presentation};
  return {...step, ...presentation,
   hint: 'فقط آنچه درباره وضعیت یا گفته فرد می‌دانید بنویسید؛ درباره علت یا روش آسیب حدس نزنید.',
   placeholder: 'آنچه مشاهده کرده یا شنیده‌اید را بنویسید.',
  };
 }

 // These follow-ups had hard-coded numbers and examples of weapons. In a
 // self-harm account they can contradict the narrative or focus on methods;
 // preserve a free-text answer and the ordinary skip instead.
 if (selfHarm && ['peopleCount', 'injury', 'weapon'].includes(step.id)) {
  return {...step, options: [], allowFreeText: true,
   freeTextLabel: 'فقط آنچه را می‌دانید بنویسید',
   hint: step.id === 'injury' ? 'اگر فرد در خطر فوری است، با ۱۱۵ تماس بگیرید.' : 'فقط آنچه را می‌دانید بنویسید؛ حدس نزنید.',
  };
 }
 return step;
}
