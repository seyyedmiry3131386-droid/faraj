// Offline guidance for a reporter who does not know what to write.
//
// Everything here runs in the browser with no API and no network. It does two
// jobs: it notices when a description cannot carry a report on its own, and it
// walks the reporter through short, plain questions whose answers are composed
// back into a narrative in their own words. It never invents a fact, never
// fills an unknown, and every sentence it composes comes from an answer the
// reporter actually gave or an option they actually chose.

import { normalize } from './persian-normalize.js';
import { EVENTS, localAnalysis, eventIds } from './scenarios.js';
import { triageWording, isHappeningNow, knownFacts, isNonAnswer } from './situation.js';
import { reportMode, adapt } from './voice-mode.js';

export { isNonAnswer } from './situation.js';

// ---------------------------------------------------------------- detection
// Ways people say they cannot write the report at all. «نمی‌دانم چرا» and
// «نمی‌دانم کِی» are unknown *facts*, not an inability to describe the event,
// so the lookahead keeps them out: an unknown fact is answered by a question,
// not by restarting the interview.
const FACT_UNKNOWN = '(?!\\s*(?:چرا|کی|کِی|کجا|چه\\s*(?:کسی|زمانی|ساعتی)|چند|چقدر|اسمش|نامش|علتش|دلیلش))';
const UNSURE = new RegExp('(?:نمی\\s*(?:دانم|دونم)' + FACT_UNKNOWN + '|نمیدونم' + FACT_UNKNOWN + '|نمیدانم' + FACT_UNKNOWN + '|چی\\s*(?:بگم|بنویسم|بنویسیم)|چه\\s*(?:بگویم|بنویسم)|بلد\\s*نیستم|بلدنیستم|نمی\\s*(?:توانم|تونم)\\s*(?:بنویسم|توضیح)|کمک(?:م)?\\s*کن|راهنمای[یم]|از\\s*کجا\\s*شروع|چطور\\s*(?:بنویسم|شروع)|هیچی\\s*نمی\\s*دونم|سرم\\s*نمی\\s*شه)','u');
/** Filler that carries no report content. */
const FILLER = /^(?:سلام|درود|الو|ببخشید|لطفا|خواهش|ممنون|تست|test|\.|،|\s)+$/iu;

/**
 * Why a description cannot start a report yet.
 * `ok` means the narrative is usable as written.
 */
export function guidanceNeed(text) {
 const value = normalize(text);
 if (!value) return { need: 'empty', reason: 'هنوز چیزی ننوشته‌اید.' };
 if (FILLER.test(value)) return { need: 'empty', reason: 'متن هنوز شرحی از اتفاق ندارد.' };
 const events = eventIds(localAnalysis(text));
 const classified = !(events.length === 1 && events[0] === 'other');
 // A narrative that already reports a behaviour does not need the interview,
 // even if the reporter also says they do not know why it happened.
 if (classified && value.split(/\s+/).filter(Boolean).length >= 4) return { need: 'ok', reason: '' };
 if (UNSURE.test(value)) return { need: 'unsure', reason: 'نوشته‌اید که نمی‌دانید چه بنویسید.' };
 if (value.length < 12 || value.split(/\s+/).filter(Boolean).length < 4) return { need: 'short', reason: 'شرح خیلی کوتاه است.' };
 if (!classified) return { need: 'vague', reason: 'از این شرح، رفتار یا اتفاق مشخصی برداشت نشد.' };
 return { need: 'ok', reason: '' };
}


// ---------------------------------------------------------------- urgency
// Some reports should not wait for a form to be filled in. A robbery, an
// assault, a rape, an abduction, a fire — the number matters more in the first
// minute than the narrative does, whether or not the reporter wrote the word
// «الان». So urgency is read from the behaviour as well as from the wording,
// and the panel shows the number as something to tap, not a paragraph to read.
const SERVICE = { '۱۱۰': 'پلیس', '۱۱۵': 'اورژانس', '۱۲۵': 'آتش‌نشانی', '۱۲۳': 'اورژانس اجتماعی' };
const URGENT_TOPICS = {
 // Crimes where a fast police response still changes the outcome.
 '۱۱۰': ['theft', 'home_burglary', 'vehicle_theft', 'assault', 'sexual_violence', 'weapon_threat', 'shooting', 'confinement', 'trafficking',
  'harassment', 'drug_supply', 'discovery', 'hazardous_supply',
  'pdf_a03', 'pdf_a09', 'pdf_a13', 'pdf_a14', 'pdf_a15', 'pdf_a16', 'pdf_a17', 'pdf_b15', 'pdf_b16', 'pdf_b25', 'pdf_b26', 'pdf_b27'],
 // Someone may be hurt and may still need care.
 '۱۱۵': ['accident', 'workplace_accident', 'food_safety', 'self_harm', 'disaster', 'shooting', 'pdf_a13'],
 // Fire, gas, blast.
 '۱۲۵': ['fire', 'explosion', 'fireworks', 'pdf_a05'],
 // A child or a person at risk of self-harm.
 '۱۲۳': ['self_harm', 'trafficking', 'sexual_violence', 'pdf_a15', 'pdf_b26'],
};
const ORDER = ['۱۱۰', '۱۱۵', '۱۲۵', '۱۲۳'];

/**
 * Which emergency numbers this account should see, and how loudly.
 * `emergency` when the narrative says it is still happening or someone is
 * hurt; `attention` when the behaviour is urgent by its nature but the account
 * reads as finished. Never a blocker: the report stays open underneath.
 */
export function triage(text, analysis = null) {
 const wording = triageWording(text);
 const topics = String(text || '').trim() ? eventIds(analysis ?? localAnalysis(text)) : [];
 const numbers = new Set(wording.numbers);
 for (const [number, list] of Object.entries(URGENT_TOPICS))
  if (topics.some(id => list.includes(id))) numbers.add(number);
 if (!numbers.size) return { level: 'none', numbers: [], services: [] };
 // Two numbers at most. A panel of four is a panel nobody reads, and the
 // ordering already puts the one that matters first.
 const ordered = ORDER.filter(n => numbers.has(n)).slice(0, 2);
 return {
  // «الان دارند موتورم را می‌برند» is an emergency even though no wording rule
  // of its own fired: the urgency came from the topic, the loudness from the
  // fact that the reporter says it is happening as they write.
  level: wording.level === 'emergency' || isHappeningNow(text) ? 'emergency' : 'attention',
  numbers: ordered,
  services: ordered.map(number => ({ number, name: SERVICE[number] })),
 };
}

// ---------------------------------------------------------------- interview
// Each option carries the wording that goes into the narrative, so the composed
// text stays in the reporter's register instead of catalogue vocabulary.
const opt = (label, phrase = label) => ({ label, phrase });

// A question is worth asking only when the reporter has not already answered
// it. `covers` is that test, read against their own words: «دو نفر آمدند»
// answers «چند نفر بودند؟», so the question never appears. Nothing is copied
// into an answer — their sentence stays in the report as they wrote it, which
// is why skipping the question loses no information.
// Patterns are written in folded orthography (آ→ا, ئ→ی, ك→ک, ي→ی).
const COVERS = {
 detail: /(?:\S+\s+){11}\S+/u,
 result: /(?:برد(?:ن|ند|ه)|بردند|دزدید|سرقت|شکست|خسارت|اسیب\s*(?:دید|زد)|خراب|سالم|پیدا\s*شد|گم\s*شد|نیست|کم\s*شد|خالی)/u,
 peopleCount: /(?:یک|دو|سه|چهار|پنج|شش|چند(?:ین)?|تعدادی|عده|گروهی|[\d۰-۹]+)\s*(?:نفر|نفری|تا\s*(?:مرد|زن|پسر|دختر|نفر|جوان|موتورسوار))|(?:دوتا|سه\s*تا|یه\s*نفر|یک\s*نفر)/u,
 peopleDescription: /(?:قد\s*(?:بلند|کوتاه)|هیکل|لاغر|چاق|کاپشن|مانتو|شلوار|لباس\s*\S+|ماسک|کلاه|ریش|سبیل|خالکوبی|لهجه|موی\s*\S+|حدودا?\s*[\d۰-۹]+\s*ساله|جوان|میانسال|مسن)/u,
 peopleKnown: /(?:ناشناس|نمی\s*شناخت|نمیشناخت|نشناختم|می\s*شناس|میشناس|اشنا|همسایه|همکار|فامیل|قبلا\s*دیده)/u,
 weapon: /(?:چاقو|قمه|شمشیر|ساطور|اسلحه|کلت|تفنگ|شوکر|اسپری|میله|چوب|قپان|سنگ|زنجیر|دست\s*خالی)/u,
 childInvolved: /(?:کودک|بچه|نوزاد|طفل|نوجوان|دانش\s*اموز|[\d۰-۹]+\s*ساله\s*(?:ام|اش)?)/u,
 injury: /(?:زخمی|مجروح|خون(?:ی|ریزی)?|بیهوش|شکستگی|دستش\s*شکست|سوختگی|مسموم|اسیب\s*دید|صدمه|کبود|حالش\s*بد|کسی\s*(?:اسیب|صدمه)\s*ندید)/u,
 injuryCare: /(?:بیمارستان|درمانگاه|اورژانس|امبولانس|منتقل\s*شد|بستری|پانسمان|دکتر\s*برد)/u,
 ongoing: /(?:هنوز|همچنان|ادامه\s*دار|تمام\s*شد|تموم\s*شد|رفع\s*شد|برطرف|متوقف|در\s*جریان|همین\s*(?:الان|حالا))/u,
 duration: /(?:[\d۰-۹]+\s*(?:روز|هفته|ماه|سال)|چند\s*(?:روز|هفته|ماه|سال)|دو\s*هفته|یک\s*ماه|از\s*صبح|از\s*دیشب|مدت\s*ها)/u,
 repeated: /(?:بارها|چندین\s*بار|چند\s*بار|هر\s*(?:روز|شب|هفته)|مرتب|مدام|همیشه|اولین\s*بار|دوباره|باز\s*هم|تکرار)/u,
 vehicleInvolved: /(?:ماشین|خودرو|موتور(?:سیکلت)?|وانت|کامیون|تاکسی|اتوبوس|پراید|پژو|سمند|تیبا|دنا|ال\s*نود|پیکان|دوچرخه)/u,
 vehicleDescription: /(?:پلاک|رنگ\s*\S+|سفید|مشکی|نقره|خاکستری|ابی|قرمز|مدل\s*[\d۰-۹]|پراید|پژو|سمند|تیبا|دنا|پیکان)/u,
 amount: /(?:[\d۰-۹٬,]{3,}|میلیون|میلیارد|هزار\s*تومان|تومان|ریال|مبلغ|بیعانه|قسط)/u,
 paymentMethod: /(?:کارت\s*به\s*کارت|کارت\s*کارت|واریز|انتقال\s*وجه|نقد(?:ی|ا)?|درگاه|شبا|پرداخت\s*کردم|پولی\s*ندادم)/u,
 platform: /(?:تلگرام|واتساپ|واتس\s*اپ|اینستاگرام|اینستا|ایتا|روبیکا|بله|دیوار|شیپور|سایت|لینک|پیامک|اس\s*ام\s*اس|تماس\s*تلفنی)/u,
 witness: /(?:شاهد|شاهدی|کسی\s*(?:دید|ندید)|چند\s*نفر\s*دیدند|همسایه\s*(?:ها\s*)?دید|جلوی\s*چشم)/u,
 reportedBefore: /(?:شکایت|گزارش\s*داد|اطلاع\s*داد|تماس\s*گرفت|پیگیری|کلانتری|شهرداری|۱۱۰|110|۱۳۷|137|۱۲۴|124)/u,
};

// ترتیب ثابت مراحل پایهٔ گزارش؛ هم راهنمای محلی و هم مصاحبهٔ مدل از این
// فهرست استفاده می‌کنند: نحوه اطلاع → چه کسی → چه زمانی → چه مکانی →
// چه چیزی → چرا → چگونه. مستندات جداگانه در صفحه پیوست دریافت می‌شوند؛
// اطلاعاتی که در شرح آمده دوباره پرسیده نمی‌شود.
export const GUIDE_STEPS = [
 {
  id: 'source',
  fact: 'source',
  title: 'این را خودتان دیدید یا از کسی شنیدید؟',
  hint: 'مشاهدهٔ مستقیم و شنیده جدا ثبت می‌شوند.',
  options: [opt('خودم دیدم', 'من خودم این را دیدم'), opt('از فرد دیگری شنیدم', 'این را از فرد دیگری شنیدم'), opt('در فضای مجازی دیدم', 'این را در فضای مجازی دیدم'), opt('مطمئن نیستم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا نحوه اطلاع خود را بنویسید',
  skippable: true,
 },
 {
  id: 'who',
  fact: 'actor',
  title: 'چه کسی این کار را انجام داد؟',
  hint: 'فقط آنچه از فرد یا افراد انجام‌دهنده می‌دانید؛ هویت یا تقصیر را حدس نزنید.',
  options: [opt('یک نفر', 'یک نفر این کار را انجام داد'), opt('چند نفر', 'چند نفر این کار را انجام دادند'), opt('فرد ناشناس', 'فرد انجام‌دهنده برای من ناشناس بود'), opt('فرد آشنا', 'فرد انجام‌دهنده برای من آشنا بود')],
  allowFreeText: true,
  freeTextLabel: 'یا آنچه درباره انجام‌دهنده می‌دانید بنویسید',
  skippable: true,
 },
 {
  id: 'when',
  fact: 'time',
  title: 'این اتفاق چه زمانی رخ داد؟',
  hint: 'تقریبی هم کافی است.',
  options: [opt('همین حالا'), opt('امروز'), opt('دیشب'), opt('دیروز'), opt('چند روز پیش'), opt('هفتهٔ گذشته'), opt('زمانش را نمی‌دانم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا زمان دقیق‌تر را بنویسید',
  skippable: true,
 },
 {
  id: 'where',
  fact: 'place',
  title: 'این اتفاق در کدام محل رخ داد؟',
  hint: 'محله، خیابان یا یک نشانهٔ نزدیک.',
  placeholder: 'مثلاً: خیابان بهار، نزدیک نانوایی',
  allowFreeText: true,
  skippable: true,
 },
 {
  id: 'result',
  fact: 'clarify',
  title: 'چه اتفاقی رخ داد و چه چیزی در آن دخیل بود؟',
  hint: 'یک یا دو جمله از آنچه دیده یا شنیده‌اید؛ مثلاً «شیشهٔ ماشین را شکستند و کیف را بردند».',
  placeholder: 'مثلاً: دو نفر آمدند، شیشهٔ ماشین را شکستند و کیف را بردند.',
  allowFreeText: true,
  skippable: true,
 },
 {
  id: 'reason',
  fact: 'reason',
  title: 'آیا درباره دلیل یا انگیزه این اتفاق اطلاعاتی دارید؟',
  hint: 'فقط اگر چیزی شنیده‌اید یا دیده‌اید.',
  options: [opt('دلیلی نمی‌دانم', ''), opt('سر اختلاف قبلی بود', 'گفتند سر اختلاف قبلی بوده است'), opt('سر پول یا بدهی بود', 'گفتند سر پول یا بدهی بوده است')],
  allowFreeText: true,
  freeTextLabel: 'یا آنچه دربارهٔ دلیل گفته شد را بنویسید',
  skippable: true,
 },
 {
  id: 'method',
  fact: 'method',
  title: 'این اتفاق چگونه رخ داد؟',
  hint: 'فقط آنچه دیده یا شنیده‌اید؛ حدس نزنید.',
  placeholder: 'مثلاً: شیشهٔ کنار در را شکستند و از آنجا وارد شدند',
  allowFreeText: true,
  skippable: true,
 },
];

// Recognize the exact seven-stage wording from older drafts without treating
// the older victim question as the new actor question. Text the reporter
// entered is never rewritten; this lookup is only for system question labels.
export const LEGACY_STAGE_TITLES = Object.freeze({
 source:'نحوه اطلاع: این را خودتان دیدید یا از کسی شنیدید؟',
 who:'چه کسی: چه کسی این کار را انجام داد؟',
 when:'چه زمانی: این اتفاق چه زمانی افتاد؟',
 where:'چه مکانی: کجا اتفاق افتاد؟',
 result:'چه چیزی: چه اتفاقی افتاد و چه چیزی در آن دخیل بود؟',
 reason:'چرا: دلیل یا انگیزه‌ای مطرح شد؟',
 method:'چگونه: این کار چطور انجام شد؟',
});
export function guideStageForQuestion(question, stage = null) {
 return GUIDE_STEPS.find(step => (!stage || step.id === stage) &&
  (question === step.title || question === LEGACY_STAGE_TITLES[step.id])) || null;
}
// Presentation only: retain the old question internally for replay. In
// particular the old victim question must never become the new actor stage.
export function displayGuideQuestion(question, stage = null) {
 if (question === 'چه کسی: این اتفاق برای چه کسی افتاد؟') return 'این اتفاق برای چه کسی افتاد؟';
 return guideStageForQuestion(question,stage)?.title || question;
}

// ------------------------------------------------- situational follow-ups
// Some questions only make sense for some accounts. Asking every reporter about
// a number plate is noise; asking the one who described a hit-and-run is the
// whole point. Each follow-up names its parent and the condition that makes it
// relevant, read from what the reporter has already said. Follow-ups are asked
// after all available core steps, so they cannot interrupt the required order.
//
// A follow-up is never mandatory. «نمی‌دانم» or a skip moves straight on, and
// its own follow-ups disappear with it, so an unanswered branch costs the
// reporter one tap and leaves nothing behind in the report.

/** The account so far, as the conditions see it. */
const situation = (answers = {}, base = '', legacyNarrative = false) => {
 // Before orderVersion 3, these five answers were not included in the text
 // used for follow-up conditions. Reproduce that context only when locating
 // an old cursor; otherwise a newly opened branch can shift its old index.
 const contextAnswers = legacyNarrative ? {...answers,injury:'',injuryCare:'',ongoing:'',duration:'',repeated:''} : answers;
 const composed = composeNarrative(contextAnswers);
 const text = [String(base || '').trim(), composed].filter(Boolean).join(' ');
 return { answers, base: String(base || ''), text, events: eventIds(localAnalysis(text)) };
};
const has = (ctx, ...topics) => topics.some(id => ctx.events.includes(id));
const mentions = (ctx, re) => re.test(normalize(ctx.text));
const answered = (ctx, id) => Boolean(String(ctx.answers[id] ?? '').trim());

/** Topics whose reports normally involve another person doing something. */
const PEOPLE_TOPICS = ['theft', 'assault', 'harassment', 'fraud', 'damage', 'weapon_threat', 'sexual_violence',
 'confinement', 'trafficking', 'impersonation', 'drug_supply', 'pdf_a03', 'pdf_a04', 'pdf_a09', 'pdf_a14',
 'pdf_a15', 'pdf_a16', 'pdf_a17', 'pdf_b15', 'pdf_b16', 'pdf_b22', 'pdf_b25', 'pdf_b26'];
const VEHICLE_TOPICS = ['accident', 'traffic_violation', 'theft', 'pdf_b16', 'vehicle_irregularity', 'pdf_a13'];
const MONEY_TOPICS = ['fraud', 'financial_complaint', 'pdf_b23', 'pdf_b22', 'harassment', 'pdf_b11'];
const ONLINE_TOPICS = ['online_harm', 'data_breach', 'pdf_b27', 'fraud'];
// Accounts where somebody may have been hurt, where the problem may still be
// running, or where this may not be the first time. Each one opens a question
// that would be noise on any other account.
const INJURY_TOPICS = ['assault', 'accident', 'workplace_accident', 'fire', 'explosion', 'shooting', 'weapon_threat',
 'sexual_violence', 'food_safety', 'medical_care', 'self_harm', 'fireworks', 'disaster', 'pdf_a03', 'pdf_a13', 'pdf_a15', 'pdf_a17'];
const ONGOING_TOPICS = ['service', 'public_nuisance', 'harassment', 'confinement', 'trafficking', 'fire', 'environment',
 'supply_issue', 'family_dispute', 'property_dispute', 'drug_supply', 'drug_use', 'pdf_a02', 'pdf_b15', 'pdf_b17', 'pdf_a10'];
const REPEAT_TOPICS = ['harassment', 'service', 'public_nuisance', 'family_dispute', 'pdf_b25', 'pdf_b15', 'online_harm',
 'environment', 'traffic_violation', 'official_complaint', 'pdf_a15'];
const AUTHORITY_TOPICS = ['service', 'official_complaint', 'public_nuisance', 'harassment', 'property_dispute',
 'medical_care', 'passenger_complaint', 'financial_complaint', 'supply_issue', 'pdf_b08', 'pdf_b11'];
const WEAPON_TOPICS = ['assault', 'theft', 'harassment', 'weapon_threat', 'confinement', 'pdf_a03', 'pdf_a09', 'pdf_a17', 'pdf_b15'];
const CHILD_TOPICS = ['trafficking', 'sexual_violence', 'assault', 'drug_supply', 'self_harm', 'pdf_a15', 'pdf_b26', 'online_harm'];

export const FOLLOW_UPS = [
 {
  after: 'who',
  id: 'peopleCount',
  title: 'چند نفر در این اتفاق نقش داشتند؟',
  hint: 'تقریبی هم کافی است.',
  options: [opt('یک نفر', 'یک نفر در این اتفاق دخیل بود'), opt('دو نفر', 'دو نفر در این اتفاق دخیل بودند'),
   opt('سه تا پنج نفر', 'حدود سه تا پنج نفر در این اتفاق دخیل بودند'), opt('بیشتر از پنج نفر', 'بیش از پنج نفر در این اتفاق دخیل بودند'),
   opt('نمی‌دانم چند نفر', '')],
  skippable: true,
  when: ctx => has(ctx, ...PEOPLE_TOPICS) || mentions(ctx, /یک\s+نفر|چند\s+نفر|افراد|فرد|مرد|زن|پسر|دختر|راننده|همسایه|ناشناس/u),
 },
 {
  after: 'peopleCount',
  id: 'peopleDescription',
  title: 'آیا از ظاهر یا نشانه‌های این افراد اطلاعاتی دارید؟',
  hint: 'قد، لباس، سن، لهجه — هر چه یادتان هست.',
  placeholder: 'مثلاً: یکی قد بلند با کاپشن مشکی، دیگری جوان‌تر و با کلاه',
  allowFreeText: true,
  skippable: true,
  // Only worth asking once the reporter has said someone was there.
  when: ctx => answered(ctx, 'peopleCount'),
 },
 {
  after: 'peopleDescription',
  id: 'peopleKnown',
  title: 'آیا این افراد را می‌شناختید؟',
  hint: 'نام لازم نیست.',
  options: [opt('ناشناس بودند', 'افراد برای من ناشناس بودند'), opt('قبلاً دیده بودمشان', 'قبلاً آن‌ها را در محل دیده بودم'),
   opt('آشنا بودند', 'با آن‌ها آشنایی قبلی داشتم'), opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => answered(ctx, 'peopleCount'),
 },
 {
  after: 'result',
  id: 'vehicleInvolved',
  title: 'آیا وسیله نقلیه‌ای در این اتفاق نقش داشت؟',
  hint: 'ماشین یا موتوری که نقش داشت.',
  options: [opt('بله، خودرو', 'یک خودرو در این اتفاق نقش داشت'), opt('بله، موتورسیکلت', 'یک موتورسیکلت در این اتفاق نقش داشت'),
   opt('بله، وسیلهٔ دیگری', 'یک وسیلهٔ نقلیهٔ دیگر در این اتفاق نقش داشت'), opt('نه', ''), opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => has(ctx, ...VEHICLE_TOPICS) || mentions(ctx, /ماشین|خودرو|موتور|وانت|کامیون|تاکسی|اتوبوس/u),
 },
 {
  after: 'vehicleInvolved',
  id: 'vehicleDescription',
  title: 'آیا از مشخصات این وسیله نقلیه اطلاعاتی دارید؟',
  hint: 'رنگ، مدل، یا هر بخشی از پلاک.',
  placeholder: 'مثلاً: پراید سفید، دو رقم آخر پلاک ۴۷',
  allowFreeText: true,
  skippable: true,
  when: ctx => answered(ctx, 'vehicleInvolved'),
 },
 {
  after: 'result',
  id: 'amount',
  title: 'مبلغ مرتبط با این اتفاق چقدر بود؟',
  hint: 'تقریبی کافی است. رمز و شمارهٔ کارت ننویسید.',
  placeholder: 'مثلاً: حدود دوازده میلیون تومان',
  allowFreeText: true,
  skippable: true,
  when: ctx => has(ctx, ...MONEY_TOPICS) || mentions(ctx, /پول|مبلغ|تومان|ریال|واریز|بیعانه|قسط|بدهی/u),
 },
 {
  after: 'method',
  id: 'platform',
  title: 'این اتفاق از طریق کدام پیام‌رسان، وب‌سایت یا شماره انجام شد؟',
  hint: 'فقط بستر همین ماجرا.',
  options: [opt('تلگرام', 'این ماجرا در تلگرام اتفاق افتاد'), opt('واتساپ', 'این ماجرا در واتساپ اتفاق افتاد'),
   opt('اینستاگرام', 'این ماجرا در اینستاگرام اتفاق افتاد'), opt('تماس یا پیامک', 'این ماجرا از طریق تماس یا پیامک انجام شد'),
   opt('یک سایت', 'این ماجرا در یک سایت اینترنتی اتفاق افتاد'), opt('نمی‌دانم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا نام بستر را بنویسید',
  skippable: true,
  when: ctx => has(ctx, ...ONLINE_TOPICS) || mentions(ctx, /تلگرام|واتساپ|اینستاگرام|اینترنت|انلاین|سایت|پیامک|تماس|لینک/u),
 },
 // --- harm, and whether it has been dealt with -------------------------
 {
  after: 'result',
  id: 'injury',
  title: 'آیا فردی در این اتفاق آسیب دید؟',
  hint: 'اگر حال کسی بد است، اول ۱۱۵.',
  options: [opt('کسی آسیب ندید', 'کسی در این اتفاق آسیب ندید'), opt('آسیب جزئی بود', 'یک نفر آسیب جزئی دید'),
   opt('آسیب جدی بود', 'یک نفر آسیب جدی دید'), opt('چند نفر آسیب دیدند', 'چند نفر در این اتفاق آسیب دیدند'),
   opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => has(ctx, ...INJURY_TOPICS) || mentions(ctx, /زخمی|مجروح|خون|بیهوش|شکستگی|سوختگی|کتک|زد|تصادف|سقوط|برق\s*گرفت|مسموم/u),
 },
 {
  after: 'injury',
  id: 'injuryCare',
  title: 'آیا به فرد آسیب‌دیده کمک پزشکی ارائه شد؟',
  hint: 'اگر هنوز نرسیده، ۱۱۵ مقدم است.',
  options: [opt('به بیمارستان یا درمانگاه رفت', 'مصدوم به مرکز درمانی منتقل شد'),
   opt('اورژانس آمد', 'اورژانس در محل حاضر شد'),
   opt('هنوز رسیدگی نشده', 'تا لحظهٔ گزارش، به مصدوم رسیدگی نشده بود'),
   opt('نمی‌دانم', '')],
  skippable: true,
  // Only when the reporter has actually said somebody was hurt.
  when: ctx => /اسیب\s*(?:جزیی|جدی)|اسیب\s*دیدند/u.test(normalize(String(ctx.answers.injury || ''))),
 },
 // --- is it over, or still running ------------------------------------
 {
  after: 'result',
  id: 'ongoing',
  title: 'آیا این وضعیت در زمان ثبت گزارش همچنان ادامه دارد؟',
  hint: 'تعیین می‌کند گزارش فوری بررسی شود یا عادی.',
  options: [opt('بله، همین الان ادامه دارد', 'این وضعیت در لحظهٔ ثبت گزارش ادامه داشت'),
   opt('تمام شده است', 'این اتفاق تمام شده است'),
   opt('تکرار می‌شود ولی الان نه', 'این وضعیت تکرار می‌شود اما در لحظهٔ گزارش برقرار نبود'),
   opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => has(ctx, ...ONGOING_TOPICS) || mentions(ctx, /هنوز|همچنان|ادامه\s*دار|هر\s*(?:روز|شب|هفته)|مرتب|مدام|تکرار|همین\s*(?:الان|حالا)|الان|اکنون|در\s*حال|دارن|دارند\s/u),
 },
 {
  after: 'ongoing',
  id: 'duration',
  deprecated: true, // retained solely to migrate older answered drafts
  title: 'زمان شروع اعلام‌شده در پاسخ پیشین',
  hint: 'تقریبی کافی است.',
  options: [opt('از امروز', 'این مشکل از امروز شروع شده است'), opt('چند روزی است', 'این مشکل چند روزی است ادامه دارد'),
   opt('چند هفته است', 'این مشکل چند هفته‌ای است ادامه دارد'), opt('چند ماه است', 'این مشکل چند ماهی است ادامه دارد'),
   opt('نمی‌دانم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا مدت دقیق‌تر را بنویسید',
  skippable: true,
  when: ctx => answered(ctx, 'ongoing'),
 },
 // --- has this happened before ----------------------------------------
 {
  after: 'ongoing',
  id: 'repeated',
  title: 'آیا این اتفاق پیش از این نیز رخ داده است؟',
  hint: 'تکرار، پروندهٔ متفاوتی می‌سازد.',
  options: [opt('اولین بار است', 'این اتفاق برای اولین بار رخ داده است'),
   opt('دو سه بار شده', 'این اتفاق پیش‌تر هم دو سه بار تکرار شده است'),
   opt('بارها تکرار شده', 'این اتفاق بارها تکرار شده است'), opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => has(ctx, ...REPEAT_TOPICS) || mentions(ctx, /باز\s*هم|دوباره|هر\s*(?:روز|شب|هفته)|مرتب|مدام|همیشه|چندمین\s*بار/u),
 },
 // --- what was in their hands -----------------------------------------
 {
  after: 'peopleKnown',
  id: 'weapon',
  title: 'آیا فرد یا افراد وسیله‌ای در دست داشتند؟',
  hint: 'فقط آنچه خودتان دیدید.',
  options: [opt('چیزی ندیدم', 'چیزی در دست آن‌ها ندیدم'), opt('چاقو یا قمه', 'یکی از آن‌ها چاقو یا قمه در دست داشت'),
   opt('اسلحهٔ گرم', 'یکی از آن‌ها اسلحهٔ گرم در دست داشت'), opt('چوب، میله یا سنگ', 'یکی از آن‌ها چوب یا میله در دست داشت'),
   opt('نمی‌دانم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا آنچه دیدید را بنویسید',
  skippable: true,
  when: ctx => has(ctx, ...WEAPON_TOPICS) || mentions(ctx, /چاقو|قمه|اسلحه|کلت|شوکر|میله|چوب|سنگ|تهدید/u),
 },
 {
  after: 'peopleKnown',
  id: 'childInvolved',
  title: 'آیا کودک یا نوجوانی در این اتفاق حضور داشت؟',
  hint: 'برای کودک در خطر، ۱۲۳ هم هست.',
  options: [opt('نه', ''), opt('بله، آسیب‌دیده بود', 'یک کودک یا نوجوان در این ماجرا آسیب دید'),
   opt('بله، حاضر بود', 'یک کودک یا نوجوان در محل حاضر بود'), opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => has(ctx, ...CHILD_TOPICS) || mentions(ctx, /کودک|بچه|نوزاد|طفل|نوجوان|دانش\s*اموز|مدرسه/u),
 },
 // --- corroboration and prior follow-up --------------------------------
 {
  after: 'result',
  id: 'witness',
  title: 'آیا فرد دیگری هم این اتفاق را مشاهده کرد؟',
  hint: 'نام و شماره لازم نیست.',
  options: [opt('بله، شاهد دیگری بود', 'فرد دیگری هم شاهد این اتفاق بود'),
   opt('چند نفر دیدند', 'چند نفر دیگر هم شاهد این اتفاق بودند'),
   opt('کسی نبود', 'کس دیگری شاهد این اتفاق نبود'), opt('نمی‌دانم', '')],
  skippable: true,
  when: () => true,
 },
 {
  after: 'result',
  id: 'reportedBefore',
  title: 'آیا پیش از این موضوع را به مرجع یا فردی اطلاع داده‌اید؟',
  hint: 'نتیجهٔ پیگیری قبلی به بررسی کمک می‌کند.',
  options: [opt('نه، اولین بار است', 'پیش از این به جایی اطلاع نداده بودم'),
   opt('تماس گرفتم ولی نتیجه نداد', 'پیش‌تر تماس گرفته بودم اما نتیجه‌ای نگرفتم'),
   opt('قبلاً شکایت ثبت کردم', 'پیش‌تر شکایتی در این باره ثبت کرده بودم'), opt('نمی‌دانم', '')],
  allowFreeText: true,
  freeTextLabel: 'یا بنویسید به کجا اطلاع دادید و چه شد',
  skippable: true,
  when: ctx => has(ctx, ...AUTHORITY_TOPICS) || mentions(ctx, /شکایت|پیگیری|تماس\s*گرفتم|اطلاع\s*دادم|گزارش\s*دادم|۱۱۰|110|کلانتری|شهرداری/u),
 },
 // --- the person who told them -----------------------------------------
 {
  after: 'source',
  id: 'informantKnown',
  title: 'آیا فردی را که این موضوع را به شما اطلاع داد می‌شناسید؟',
  hint: 'اگر نمی‌شناسید هم اشکالی ندارد.',
  options: [opt('بله، می‌شناسمش', 'فردی که این را به من گفت را می‌شناسم'), opt('نه، نمی‌شناسمش', 'فردی که این را به من گفت را نمی‌شناسم')],
  skippable: true,
  when: ctx => /از\s*فرد\s*دیگری\s*شنیدم/u.test(String(ctx.answers.source || '')) || /به\s*من\s*گفت|بهم\s*گفت|تعریف\s*کرد|شنیدم/u.test(normalize(ctx.base || '')),
 },
 {
  after: 'informantKnown',
  id: 'informantRelation',
  title: 'آن فرد چه نسبتی با شما دارد و آیا خود او شاهد اتفاق بود؟',
  hint: 'مثلاً «همسایه‌مان است، خودش دید».',
  placeholder: 'مثلاً همسایه، همکار، یکی از اقوام',
  allowFreeText: true,
  skippable: true,
  when: ctx => String(ctx.answers.informantKnown || '').includes('می‌شناسم') && !String(ctx.answers.informantKnown).includes('نمی'),
 },
 {
  after: 'informantKnown',
  id: 'informantContact',
  title: 'آیا شماره یا راه ارتباطی با آن فرد در اختیار دارید؟',
  hint: 'برای پیگیری، حتی یک شماره کافی است.',
  placeholder: 'شمارهٔ تلفن یا شناسهٔ پیام‌رسان',
  allowFreeText: true,
  skippable: true,
  when: ctx => answered(ctx, 'informantKnown') && !/نمی\s*شناسم/u.test(normalize(String(ctx.answers.informantKnown || ''))),
 },
 // --- how the money moved ----------------------------------------------
 {
  after: 'amount',
  id: 'paymentMethod',
  title: 'وجه چگونه انتقال یافت؟',
  hint: 'فقط روش. شمارهٔ حساب ننویسید.',
  options: [opt('کارت به کارت', 'پرداخت به‌صورت کارت‌به‌کارت انجام شد'), opt('واریز بانکی', 'پرداخت با واریز بانکی انجام شد'),
   opt('نقدی', 'پرداخت نقدی انجام شد'), opt('درگاه اینترنتی', 'پرداخت از طریق یک درگاه اینترنتی انجام شد'),
   opt('هنوز پولی نداده‌ام', 'هنوز پولی پرداخت نکرده‌ام'), opt('نمی‌دانم', '')],
  skippable: true,
  when: ctx => answered(ctx, 'amount'),
 },
];

// A statement of ignorance is a completed answer, not a reason to invent
// further details. Only explicit stage-specific wording closes a stage.
export function unknownStagesInText(text='') {
 const words=normalize(text), unknown='(?:نمی\\s*(?:دانم|دونم)|نمیدانم|نمیدونم|معلوم\\s*نیست|اطلاعی\\s*ندارم)';
 const patterns={
  source:'(?:نحوه\\s*اطلاع|چطور\\s*مطلع|از\\s*کجا\\s*(?:مطلع|می\\s*دانم))',
  who:'(?:چه\\s*(?:کسی|کسانی)|فاعل|انجام\\s*دهنده|عامل)',
  when:'(?:چه\\s*زمانی|زمان|ساعت|تاریخ)', where:'(?:چه\\s*مکانی|کجا|مکان|نشانی|محل)',
  result:'(?:چه\\s*(?:اتفاقی|چیزی|شد)|چی\\s*شد)', reason:'(?:چرا|علت|دلیل|انگیزه)',
  method:'(?:چگونه|چطور|نحوه\\s*انجام)',
 };
 return Object.entries(patterns).flatMap(([id,subject])=>{
  const re=new RegExp(`(?:${unknown}[^.،؛!?؟\\n]{0,25}${subject}|${subject}[^.،؛!?؟\\n]{0,25}${unknown})`,'u');
  return re.test(words)?[id]:[];
 });
}
// A witness or victim alone is not the actor. Be conservative: skip «who»
// only for a reported actor role or a person linked to an observed action.
const ACTOR_HINT=/(?:سارق|دزد|مهاجم|قاچاقچی|کلاهبردار|ضارب|رباینده|عامل|انجام\s*دهنده)|(?:یک|یه|دو|سه|چند|[\d۰-۹]+)\s*(?:نفر|مرد|زن|پسر|دختر)(?![^.،؛!?؟\n]{0,20}(?:شاهد|قربانی|مصدوم))[^.،؛!?؟\n]{0,45}(?:برد|دزدید|زد|شکست|گرفت|تهدید|فروخت|حمل|جابجا)/u;

/** Whether the original description already answers a step. */
function coverageInBase(answers, base) {
 const known = knownFacts(base, FACT_CHECKS);
 const words = normalize(base), unknown=new Set(unknownStagesInText(base));
 // Only the original description may suppress a base step. An answer entered
 // later must not cause a different, not-yet-visited step to disappear.
 const events = words ? eventIds(localAnalysis(base)) : ['other'];
 const classified = events.some(id => id !== 'other');
 return step => {
  // Keep answered questions visible for back/edit navigation.
  if (String(answers?.[step.id] ?? '').trim()) return false;
  if (unknown.has(step.id)) return true;
  if (step.fact === 'clarify') return Boolean(words) && classified;
  if (step.fact === 'actor') return ACTOR_HINT.test(words);
  if (step.fact && known.has(step.fact)) return true;
  const detector = COVERS[step.id];
  return Boolean(words && detector && detector.test(words));
 };
}

/** The ordered base steps still needed for this description, without branches. */
export function coreStepsFor(answers = {}, base = '') {
 const covered = coverageInBase(answers, base);
 return GUIDE_STEPS.filter(step => !covered(step));
}

/**
 * The live question list: all missing base steps first, then relevant optional
 * follow-ups in parent/child order. Recomputed from the answers each time.
 */
export function stepsFor(answers = {}, base = '', skipped = [], { includeDeprecated = false } = {}) {
 const ctx = situation(answers, base, includeDeprecated);
 const covered = coverageInBase(answers, base);
 const byAnchor = new Map();
 const blocked = new Set([...(Array.isArray(skipped)?skipped:[]),...unknownStagesInText(base),
  ...Object.entries(answers).filter(([id,v])=>String(v??'').trim()&&(isNonAnswer(v)||unknownStagesInText(v).includes(id))).map(([id])=>id)]);
 const present = new Set(GUIDE_STEPS.map(s => s.id));
 // FOLLOW_UPS is ordered parent before child, so one pass is enough: a
 // follow-up of a follow-up is only kept when its own anchor was kept.
 for (const followUp of FOLLOW_UPS) {
  if (followUp.deprecated && !includeDeprecated) continue;
  // A skipped/unknown parent closes its dependent branch even if a topic
  // classifier happens to think that branch would otherwise be relevant.
  if (blocked.has(followUp.after)) { blocked.add(followUp.id); continue; }
  if (!present.has(followUp.after) || !followUp.when(ctx)) continue;
  byAnchor.set(followUp.after, [...(byAnchor.get(followUp.after) ?? []), followUp]);
  present.add(followUp.id);
 }
 const out = GUIDE_STEPS.filter(step => !covered(step));
 const pushFollowUps = anchor => {
  for (const followUp of byAnchor.get(anchor) ?? []) {
   if (!covered(followUp)) out.push(followUp);
   pushFollowUps(followUp.id);
  }
 };
 // Covered base questions still carry their relevant follow-ups, but no branch
 // is inserted between core steps and changes the question currently on screen.
 for (const step of GUIDE_STEPS) pushFollowUps(step.id);
 // An already complete description may leave no questions. Never invent a
 // duplicate first stage just to keep the screen non-empty.
 const mode = reportMode({ source: SOURCE_FROM_GUIDE_ANSWER[String(answers.source || '')] || '' }, ctx.text);
 return out.map(step => adapt(step, mode));
}
// Rebase a seven-stage draft made before the deprecated duration question was
// removed. Keep its unsent answer, and continue from the same logical step.
export function migrateGuideOrder(g) {
 if (!g || g.orderVersion !== 2) return g;
 g.answers ??= {}; g.skipped ??= [];
 const oldSteps = stepsFor(g.answers, g.base || '', g.skipped, {includeDeprecated:true});
 const oldIndex = Math.max(0, Math.min(Number(g.index) || 0, oldSteps.length));
 const currentId = g.draft?.step || oldSteps[oldIndex]?.id;
 if (currentId === 'duration' && g.draft?.step === 'duration') {
  const value = String(g.draft.value || '').trim();
  if (value && !isNonAnswer(value)) g.answers.duration = value;
  else if (value && !g.skipped.includes('duration')) g.skipped.push('duration');
  g.draft = null;
 }
 let nextSteps = stepsFor(g.answers, g.base || '', g.skipped);
 // If a previously visible conditional step no longer exists, preserve its
 // unsent text as an answer rather than dropping it when the guide completes.
 if (g.draft?.step && !nextSteps.some(s => s.id === g.draft.step)) {
  const {step,value} = g.draft, text=String(value || '').trim();
  if (text && !isNonAnswer(text)) g.answers[step]=text;
  else if (text && !g.skipped.includes(step)) g.skipped.push(step);
  g.draft=null;
  nextSteps=stepsFor(g.answers,g.base||'',g.skipped);
 }
 let target = currentId && currentId !== 'duration' ? nextSteps.findIndex(s => s.id === currentId) : -1;
 if (target < 0) {
  const nextId = oldSteps.slice(oldIndex + (currentId === 'duration' ? 1 : 0)).find(s => nextSteps.some(n => n.id === s.id))?.id;
  target = nextId ? nextSteps.findIndex(s => s.id === nextId) : nextSteps.length;
 }
 g.index = target; g.pendingAdvance = null; g.autoAdvancedAt = 0; g.orderVersion = 3;
 return g;
}

// The guide's own «how do you know» chips, in the wording reportMode reads.
const SOURCE_FROM_GUIDE_ANSWER = {
 'من خودم این را دیدم': 'خودم شاهد بودم',
 'این را از فرد دیگری شنیدم': 'از شخص دیگری شنیدم',
 'این را در فضای مجازی دیدم': 'در فضای مجازی دیدم',
};

/** The step at `index` of this account's live list. */
export const guideStepAt = (answers, index, base = '') => stepsFor(answers, base)[index] ?? null;
/** Kept for callers that only need the fixed base list. */
export const guideStep = index => GUIDE_STEPS[index] ?? null;

/** Early finish is available only after every remaining core step was visited. */
export function canFinishGuide(steps = [], index = 0) {
 const core = new Set(GUIDE_STEPS.map(step => step.id));
 return !steps.slice(Math.max(0, index)).some(step => core.has(step.id));
}

/** True when this step has an answer the composer can use. */
export const stepAnswered = (step, answers = {}) => Boolean(String(answers?.[step?.id] ?? '').trim());

/** The first step that still needs an answer, or -1 when the interview is done. */
export function nextGuideStep(answers = {}, from = 0, base = '') {
 const steps = stepsFor(answers, base);
 for (let i = Math.max(0, from); i < steps.length; i++) {
  const step = steps[i];
  if (!stepAnswered(step, answers) && step.required) return i;
 }
 return from < steps.length ? from : -1;
}

/**
 * Composes the answers into a narrative. Only answered steps contribute, so an
 * unanswered question leaves no trace and no invented fact in the text.
 */
export function composeNarrative(answers = {}) {
 const get = id => String(answers[id] ?? '').trim();
 const source = get('source'), who = get('who'), when = get('when'), where = get('where');
 const result = get('result'), reason = get('reason'), method = get('method'), evidence = get('evidence');
 // Situational answers. Each one appears only if that branch was asked and
 // answered, in the order the reporter was asked, so the narrative reads as
 // one account rather than a form.
 const peopleCount = get('peopleCount'), peopleDescription = get('peopleDescription'), peopleKnown = get('peopleKnown');
 const vehicleInvolved = get('vehicleInvolved'), vehicleDescription = get('vehicleDescription');
 const amount = get('amount'), platform = get('platform');
 const injury = get('injury'), injuryCare = get('injuryCare'), ongoing = get('ongoing'), duration = get('duration');
 const repeated = get('repeated'), weapon = get('weapon'), childInvolved = get('childInvolved');
 const witness = get('witness'), reportedBefore = get('reportedBefore'), paymentMethod = get('paymentMethod');
 const informantKnown = get('informantKnown'), informantRelation = get('informantRelation'), informantContact = get('informantContact');
 const sentences = [];

 const opening = [when && `${when}`, where && `در ${where}`].filter(Boolean).join(' ');
 if (opening) sentences.push(opening);
 if (who) sentences.push(who);
 if (peopleCount) sentences.push(peopleCount);
 if (peopleDescription) sentences.push(`از ظاهر آن‌ها: ${peopleDescription}`);
 if (peopleKnown) sentences.push(peopleKnown);
 if (weapon) sentences.push(weapon);
 if (childInvolved) sentences.push(childInvolved);
 if (method) sentences.push(method);
 if (platform) sentences.push(platform);
 if (result) sentences.push(result);
 if (vehicleInvolved) sentences.push(vehicleInvolved);
 if (vehicleDescription) sentences.push(`از مشخصات وسیله: ${vehicleDescription}`);
 if (amount) sentences.push(`مبلغ مرتبط: ${amount}`);
 if (paymentMethod) sentences.push(paymentMethod);
 // Keep all previously supplied observations, including duration in an old draft.
 if (injury) sentences.push(injury);
 if (injuryCare) sentences.push(injuryCare);
 if (ongoing) sentences.push(ongoing);
 if (duration) sentences.push(duration);
 if (repeated) sentences.push(repeated);
 if (reason) sentences.push(reason);
 if (evidence) sentences.push(evidence);
 if (witness) sentences.push(witness);
 if (reportedBefore) sentences.push(reportedBefore);
 if (source) sentences.push(source);
 if (informantKnown) sentences.push(informantKnown);
 if (informantRelation) sentences.push(`دربارهٔ او: ${informantRelation}`);
 if (informantContact) sentences.push(`راه ارتباط با او: ${informantContact}`);

 return sentences.map(s => s.trim()).filter(Boolean)
  .map(s => (/[.!؟]$/.test(s) ? s : `${s}.`)).join(' ');
}

// ------------------------------------------------------------ missing facts
// The seven facts a report is built from: what happened, when, where, who was
// involved, what evidence exists, why (only as far as the reporter was told or
// saw) and how it was done. Each check reads the narrative only. «چرا» and
// «چگونه» are asked as observations, never as a conclusion: an unknown motive
// or method stays unknown, and the reporter is told so in the hint.
// A digit only counts as a time when it is a clock reading, a year, or sits
// next to a time word: «۳ گوشی» is a quantity, not a moment.
const TIME_HINT = /(?:امروز|دیروز|دیشب|امشب|پریروز|فردا|هفته|ماه|سال|ساعت|دقیقه|صبح|ظهر|عصر|شب|بامداد|الان|اکنون|همین\s*(?:حالا|الان|لحظه)|تازگی|اخیرا|روز\s+گذشته|چند\s+(?:روز|ساعت|دقیقه|هفته)|هفته\s*ی?\s*(?:گذشته|پیش)|[\d۰-۹]{1,2}\s*[:٫][\d۰-۹]{2}|[۰-۹\d]{4}|(?:ساعت|روز|هفته|ماه|سال|دقیقه)\s*[\d۰-۹]|[\d۰-۹]{1,2}\s*(?:صبح|شب|ظهر|عصر|بامداد|روز|هفته|ماه|سال|دقیقه|ساعت))/u;
const PLACE_HINT = /(?:خیابان|کوچه|بلوار|میدان|محله|روستا|شهرک|جاده|پلاک|طبقه|واحد|مغازه|فروشگاه|منزل|خانه|مدرسه|بیمارستان|پارک|ترمینال|فرودگاه|ایستگاه|کارگاه|کارخانه|اداره|بانک|رستوران|کافه|پاساژ|بازار|در\s+محل)/u;
const PERSON_HINT = /(?:یک\s+نفر|چند\s+نفر|فرد|افراد|شخص|مرد|زن|پسر|دختر|کودک|بچه|راننده|فروشنده|همسایه|مامور|سارق|دزد|مهاجم|ناشناس|همکار|مشتری|شاهد|خودم|نزدیکان|بستگان|اقوام|فامیل|دوست|خانواده|همسر|برادر|خواهر|پدر|مادر)/u;
const SOURCE_HINT = /(?:دیدم|دیدیم|شاهد|شنیدم|گفتند|گفت|نقل|خودم|از\s+نزدیک|مشاهده|تماس\s+گرفت)/u;
const EVIDENCE_HINT = /(?:عکس|تصویر|فیلم|ویدیو|دوربین|مدرک|سند|رسید|فاکتور|قرارداد|پیام|اسکرین\s*شات|صوت|ضبط|پیامک|چت|شاهد|گواهی|کد\s+رهگیری|شماره\s+پیگیری)/u;
// «چرا» is recognised only from a reason the reporter was told or observed:
// a stated cause, a prior dispute, a demand. An unstated motive stays unknown.
const REASON_HINT = /(?:به\s*خاطر|بخاطر|به\s+دلیل|بدلیل|چون|زیرا|به\s+علت|انگیزه|دلیل(?:ش|ی)?|علتش|سر\s+(?:اختلاف|پول|بدهی|طلب|جای\s+پارک|کار)|(?:خودش|او|انها|ان\s*ها)\s+گفت|گفت(?:ند)?\s+(?:که|سر|از)|ادعا\s+کرد|از\s+قبل|اختلاف\s+(?:قبلی|داشت)|مشکل\s+داشت|طلب(?:کار)?|کینه|انتقام)/u;
// «چگونه» is recognised from manner wording: an instrument, a route, a moment,
// a way of doing it, or a described action that carries the manner itself.
const METHOD_HINT = /(?:با\s+\S+|بدون\s+\S+|از\s+(?:طریق|سمت|پشت|جلو|راه)|به\s+وسیله|توسط|هنگام|موقع|وقتی|ضمن|نحوه|چگونه|چطور|طوری\s+که|به\s*طور|سریع|ناگهان|یواشکی|پنهانی|مخفیانه|زور|شکست|باز\s+کرد|وارد\s+شد|تماس|پیام|لینک|کلید|نردبان|پنجره|قفل|درب?\s+را)/u;

const FACT_CHECKS = [
 { id: 'source', label: 'از کجا می‌دانید', title: 'این را خودتان دیدید یا از کسی شنیدید؟', hint: 'مشاهدهٔ مستقیم و شنیده جدا ثبت می‌شوند.', test: SOURCE_HINT },
 { id: 'person', label: 'چه کسی', title: 'از افراد مرتبط با این اتفاق چیزی می‌دانید؟', hint: 'فقط نقش‌ها؛ مثلاً «دو نفر ناشناس» یا «راننده». مشخصات خصوصی لازم نیست.', test: PERSON_HINT },
 { id: 'time', label: 'کِی', title: 'این اتفاق چه زمانی افتاد؟', hint: 'زمان تقریبی هم کافی است؛ مثلاً «دیروز حدود ظهر».', test: TIME_HINT },
 { id: 'place', label: 'کجا', title: 'این اتفاق کجا افتاد؟', hint: 'نام محله، خیابان یا نشانهٔ نزدیک؛ اگر نمی‌دانید همین را بنویسید.', test: PLACE_HINT },
 { id: 'method', label: 'چگونه', title: 'این اتفاق چگونه انجام شد؟', hint: 'فقط آنچه دیده یا شنیده‌اید؛ مثلاً «قفل را شکستند» یا «با پیامک لینک فرستاد». اگر نمی‌دانید، همین را بنویسید و حدس نزنید.', test: METHOD_HINT },
 { id: 'reason', label: 'چرا', title: 'دربارهٔ دلیل یا انگیزهٔ این اتفاق چیزی گفته شد یا می‌دانید؟', hint: 'فقط اگر خودتان چیزی شنیده‌اید یا دیده‌اید؛ مثلاً «گفت سر بدهی است». اگر دلیلی نمی‌دانید، «نمی‌دانم» پاسخ درستی است و حدس لازم نیست.', test: REASON_HINT },
 { id: 'evidence', label: 'چه مدرکی', title: 'مدرک یا نشانه‌ای از این اتفاق دارید؟', hint: 'مثلاً عکس، فیلم، رسید، پیام، تصویر دوربین یا فردی که شاهد بوده است. اگر ندارید، رد کنید.', test: EVIDENCE_HINT },
];

/** The seven facts the assistant tracks, for display. */
export const FACT_LABELS = [{ id: 'clarify', label: 'چه شد' }, ...FACT_CHECKS.map(({ id, label }) => ({ id, label }))];

/**
 * The essential facts this narrative does not yet carry, in the order they
 * should be asked. `analysis` is optional; when the topic is still unknown the
 * behaviour question comes first.
 */
export function missingFacts(text, analysis = null) {
 const value = normalize(text);
 const out = [];
 const events = eventIds(analysis ?? localAnalysis(text));
 if (events.length === 1 && events[0] === 'other') {
  out.push({ id: 'clarify', label: 'چه شد', title: 'دقیقاً چه رفتار یا اتفاقی دیدید؟', hint: 'به‌جای عنوان کلی، خود رفتار را بنویسید؛ مثلاً «شیشه را شکستند» یا «پول گرفت و کالا نداد».' });
 }
 for (const check of FACT_CHECKS) if (!check.test.test(value)) out.push({ id: check.id, label: check.label, title: check.title, hint: check.hint });
 return out;
}

/** How many of the seven facts the narrative already carries. */
export function factCoverage(text, analysis = null) {
 const missing = new Set(missingFacts(text, analysis).map(f => f.id));
 const covered = FACT_LABELS.filter(f => !missing.has(f.id));
 return { covered, missing: FACT_LABELS.filter(f => missing.has(f.id)), total: FACT_LABELS.length, count: covered.length };
}

// Old stored model metadata used «رفاه» for this category. Rename only the
// system-generated category, never the reporter's narrative or quotations.
export function displayNewsDomain(value) {
 return String(value || '').split('،').map(s => s.trim()==='رفاه'?'اجتماعی':s.trim()).filter(Boolean).join('، ');
}

/** Suggested news/topic domain of the report. */
export function newsDomain(text, analysis = null) {
 const s = normalize(String(text || ''));
 const events = eventIds(analysis ?? localAnalysis(s));
 const ev = new Set(events);
 const domains = [];
 if (['official_complaint','dereliction','abuse_of_office','theft','home_burglary','vehicle_theft','fraud'].some(id=>ev.has(id)) || /التماس|شکایت از|دستگاه|مامور|اداره|شهرداری|رسیدگی/u.test(s)) domains.push('انتظامی');
 if (ev.has('trafficking') || ev.has('confinement') || ev.has('assault') || ev.has('weapon_threat') || ev.has('shooting') || ev.has('explosion') || ev.has('sexual_violence') || /تهدید|سلاح|تسلیح|تشابیه|فیشینگ|تزریق|بازداشت/u.test(s)) domains.push('امنیتی');
 if (ev.has('service') || ev.has('public_nuisance') || ev.has('supply_issue') || ev.has('food_safety') || ev.has('environment') || /برق|آب|زباله|چراغ|گاز|تهویه|صرفه‌جویی|خدمات شهری/u.test(s)) domains.push('خدماتی');
 if (ev.has('traffic_violation') || ev.has('accident') || ev.has('vehicle_theft') || ev.has('vehicle_irregularity') || /تصادف|پلاک|رانندگی|مسیر|راننده|دربخاطر/u.test(s)) domains.push('مرور');
 if (ev.has('self_harm') || ev.has('medical_care') || ev.has('food_safety') || /بیمارستان|درمان|غذا|سلامت| کودک|نوجوان/u.test(s)) domains.push('اجتماعی');
 if (!domains.length) domains.push('سایر');
 return domains;
}

/** Qualitative grade: share of the narrative that is concrete incident evidence vs filler/repetition. */
export function qualityGrade(text, analysis = null) {
 const s = String(text || '').trim();
 if (!s) return { grade: 'خالی', share: 0, extra: 0 };
 const facts = factCoverage(s, analysis);
 const sentences = s.split(/[.!?\n]+/).filter(x => x.trim().length > 2);
 let concrete = 0;
 for (const st of sentences) {
  const t = st.trim();
  if (TIME_HINT.test(t) || PLACE_HINT.test(t) || PERSON_HINT.test(t) || METHOD_HINT.test(t) || REASON_HINT.test(t) || EVIDENCE_HINT.test(t) || SOURCE_HINT.test(t)) concrete++;
 }
 const share = sentences.length ? Math.round(concrete / sentences.length * 100) : 0;
 const extra = Math.max(0, 100 - share);
 let grade = 'ضعیف';
 if (share >= 70) grade = 'عالی';
 else if (share >= 50) grade = 'معمولی';
 else if (share >= 30) grade = 'ضعیف';
 return { grade, share, extra };
}

/** Quantity assessment: how much substance the report carries (short/medium/full). */
export function quantityNote(text) {
 const s = String(text || '').trim().replace(/\s+/g, ' ');
 const len = s.length;
 if (!len) return 'خالی';
 if (len < 40) return 'کم';
 if (len < 160) return 'متوسط';
 if (len < 400) return 'کامل';
 return 'بیش از حد';
}

/** Single entry point for admin-visible metadata. */
export function reportMeta(text, analysis = null) {
 return { domain: newsDomain(text, analysis), quality: qualityGrade(text, analysis), quantity: quantityNote(text) };
}

/** A short, plain summary of what the local engine understood, for the reporter. */
export function explainAnalysis(analysis) {
 const events = eventIds(analysis).filter(id => id !== 'other');
 if (!events.length) return 'هنوز موضوع مشخصی از شرح شما برداشت نشده است.';
 const titles = events.map(id => EVENTS[id]?.title).filter(Boolean);
 return `از شرح شما این موضوع‌ها برداشت شد: ${titles.join('، ')}. اگر درست نیست، می‌توانید اصلاحشان کنید.`;
}

// -------------------------------------------------------- finishing the interview
// The reporter's own sentence is the report. The interview adds to it; it never
// replaces it. Anything they typed before asking for help stays first and stays
// verbatim, so the narrative they end up filing is still recognisably theirs.

/** The reporter's text and their interview answers, as one narrative. */
export function finalNarrative(answers = {}, base = '') {
 const own = String(base || '').trim();
 const composed = composeNarrative(answers);
 if (!own) return composed;
 if (!composed) return own;
 const head = /[.!؟]$/.test(own) ? own : `${own}.`;
 return `${head} ${composed}`;
}

/**
 * What an answer box actually contains. «نمی‌دانم»، «یادم نیست» and an empty
 * box are all the same thing: no answer. They are recorded as a skip rather
 * than written into the report, because «نمی‌دانم» is not a fact about the
 * event and a report should not read as if it were.
 */
export function readAnswer(value) {
 const text = String(value ?? '').trim();
 if (!text) return { answer: '', skipped: true, reason: 'empty' };
 if (isNonAnswer(text)) return { answer: '', skipped: true, reason: 'unknown' };
 return { answer: text.slice(0, 1500), skipped: false, reason: '' };
}

/**
 * Convert AI interview turns to the same answers as the offline guide. The
 * server-issued stage and question have to agree; old, untagged model turns
 * remain verbatim in `legacy` instead of being assigned an invented stage.
 */
export function guideAnswersFromTurns(turns = []) {
 const answers = {}, skipped = new Set(), completed = [], legacy = [];
 for (const turn of turns) {
  const step = turn?.stage && guideStageForQuestion(turn.q, turn.stage);
  const text = String(turn?.a ?? '').trim();
  if (!step) {
   if (text && !isNonAnswer(text)) legacy.push(text);
   continue;
  }
  completed.push(step.id);
  const option = step.options?.find(o => o.label === text);
  const value = option ? option.phrase : text;
  if (!value || isNonAnswer(value)) {
   delete answers[step.id];
   skipped.add(step.id);
  } else {
   answers[step.id] = value;
   if(unknownStagesInText(value).includes(step.id))skipped.add(step.id);
   else skipped.delete(step.id);
  }
 }
 return { answers, skipped: [...skipped], completed, legacy };
}

/**
 * Where the interview stands: how many questions this account actually has,
 * how many are answered, and whether the seven facts are already covered.
 * The UI uses `enough` to offer an early finish, so a reporter who has said
 * everything is not walked through questions that would add nothing.
 */
export function interviewProgress(answers = {}, base = '') {
 const steps = stepsFor(answers, base);
 const answeredCount = steps.filter(step => stepAnswered(step, answers)).length;
 const text = finalNarrative(answers, base);
 const facts = factCoverage(text);
 return {
  total: steps.length,
  answered: answeredCount,
  remaining: Math.max(0, steps.length - answeredCount),
  facts,
  // Enough to file: the behaviour is recognised and at least five of the
  // seven facts are in the text. The rest stay optional, as they should:
  // a reporter who did not see the motive should not be blocked by it.
  enough: facts.count >= 6 || (facts.count >= 5 && !facts.missing.some(f => f.id === 'clarify')),
 };
}

/**
 * Everything the assistant has worked out about this account, in one call:
 * what it understood, what is still missing, what it would ask next, and
 * whether the reporter should be making a phone call instead. This is the
 * single entry point the UI needs; it runs entirely in the browser.
 */
export function assist(text, analysis = null) {
 const result = analysis ?? localAnalysis(text);
 return {
  need: guidanceNeed(text),
  triage: triage(text),
  topics: eventIds(result).filter(id => id !== 'other'),
  summary: explainAnalysis(result),
  missing: missingFacts(text, result),
  coverage: factCoverage(text, result),
 };
}

// ------------------------------------------------ connecting to the questionnaire
// The guided interview and the detailed questionnaire used to be two separate
// conversations. A reporter who told the guide «نمی‌دانم» to «کجا؟» was asked
// «این اتفاق کجا افتاد؟» again a minute later, word for word. This hands what
// the guide learned to the questionnaire, so each thing is asked once.
//
// An explicit «I don't know» is carried as the questionnaire's own «unknown»
// answer, which closes the question. A question the guide never asked carries
// nothing: the questionnaire is then the first to ask it, not a repeat.

const SOURCE_FROM_GUIDE = {
 'من خودم این را دیدم': 'خودم شاهد بودم',
 'این را از فرد دیگری شنیدم': 'از شخص دیگری شنیدم',
 'این را در فضای مجازی دیدم': 'در فضای مجازی دیدم',
};
const NO_INFO = 'خیر، اطلاعی ندارم';

/**
 * Questionnaire answers implied by the guided interview.
 * `answers` are the guide's answers; `skipped` the ids the reporter explicitly
 * said they did not know. Returns {answers, detailsUnknown}; `detailsUnknown`
 * applies to whichever topic-detail question the analysis later produces.
 */
export function carryGuideAnswers(answers = {}, skipped = []) {
 const said = id => String(answers[id] ?? '').trim();
 const no = new Set(skipped);
 const out = {};
 // when / where: an answer is already in the narrative; an unknown closes it.
 if (said('when')) out.time = said('when');
 else if (no.has('when')) out.time = 'زمان دقیق را نمی‌دانم';
 if (said('where')) out.place = said('where');
 else if (no.has('where')) out.place = 'مکان را نمی‌دانم';
 // how they know
 if (SOURCE_FROM_GUIDE[said('source')]) out.source = SOURCE_FROM_GUIDE[said('source')];
 else if (said('source')) out.source = said('source');
 else if (said('who') === 'این اتفاق برای خودم افتاد') out.source = 'برای خودم اتفاق افتاده';
 else if (no.has('source')) out.source = 'اطلاعی ندارم';
 // people: closed only if the reporter said they do not know who was there.
 if (no.has('peopleCount') || (no.has('who') && !said('peopleCount'))) out.person = NO_INFO;
 // property, vehicle, contact route
 if (no.has('result')) { out.object = NO_INFO; out.vehicle = NO_INFO; }
 if (no.has('vehicleInvolved')) out.vehicle = NO_INFO;
 if (no.has('platform') || no.has('method')) out.contact = NO_INFO;
 // the informant, into the source section's own fields
 const sourceRow = {};
 const knownAnswer = said('informantKnown');
 if (knownAnswer) sourceRow.informantKnown = knownAnswer.includes('نمی') ? 'نه، نمی‌شناسمش' : 'بله، می‌شناسمش';
 if (said('informantRelation')) sourceRow.informantRelation = said('informantRelation');
 if (said('informantContact')) sourceRow.informantContact = said('informantContact');
 const blockedSections=[...(no.has('who')||no.has('peopleCount')?['person']:[]),...(no.has('when')?['time']:[]),
  ...(no.has('where')?['place']:[]),...(no.has('source')?['source']:[]),
  ...(no.has('result')?['clarify','object','vehicle','details_*']:[]),
  ...(no.has('vehicleInvolved')?['vehicle']:[]),...(no.has('method')||no.has('platform')?['contact']:[])];
 return { answers: out, detailsUnknown: no.has('detail')||no.has('result'), sourceRow, blockedSections };
}
