// Asking in the reporter's own position.
//
// «زمانی که این وسیله را دیدید» is the right question for someone who saw it
// and the wrong one for someone who was told about it: they did not see the
// vehicle, and the question quietly asks them to pretend they did. So once we
// know how the reporter knows — from their answer, or from their own words —
// questions written for an eyewitness are re-worded for the reporter's actual
// position. Only wording changes; the fields, their stored values and the
// order of questions stay exactly the same.

import { normalize } from './persian-normalize.js';

/**
 * How the reporter knows: 'witness' (saw it), 'victim' (it happened to them),
 * 'hearsay' (someone told them), 'online' (they saw it on the internet), or
 * '' when nothing says so yet.
 */
export function reportMode(answers = {}, text = '') {
 const a = String(answers.source || '');
 if (/از\s*(?:شخص|فرد)\s*دیگری\s*شنیدم|از\s*فرد\s*دیگری\s*شنیدم/u.test(a)) return 'hearsay';
 if (/فضای\s*مجازی/u.test(a)) return 'online';
 if (/برای\s*خودم/u.test(a)) return 'victim';
 if (/خودم\s*(?:شاهد|این\s*را\s*دیدم)|خودم\s*دیدم/u.test(a)) return 'witness';
 const t = normalize(text);
 if (/به\s*من\s*گفت|بهم\s*گفت|تعریف\s*کرد|خبر\s*داد|شنیدم/u.test(t)) return 'hearsay';
 if (/(?:اینستاگرام|تلگرام|کانال|فضای\s*مجازی)\S*\s+(?:\S+\s+){0,2}دیدم/u.test(t)) return 'online';
 return '';
}

// Eyewitness wording → wording for someone who was told, or who read it
// online. Written out phrase by phrase rather than generated: a rule that
// rewrote every «دیدید» would also rewrite the places where it is right.
const RELAYED = {
 // vehicle
 'زمانی که این وسیله را دیدید': 'زمانی که این وسیله مشاهده شد',
 'دربارهٔ این وسیله چه چیزی مشاهده کردید؟': 'دربارهٔ این وسیله چه چیزی گفته شد؟',
 'چه بخش‌هایی از پلاک را مشاهده کردید؟': 'چه بخش‌هایی از پلاک مشاهده شده بود؟',
 'اگر پلاک را ندیدید، همان گزینه را انتخاب کنید.': 'اگر چیزی از پلاک گفته نشد، همان گزینه را انتخاب کنید.',
 'بخش‌هایی از پلاک را که دیده‌اید وارد کنید.': 'بخش‌هایی از پلاک را که گفته شد وارد کنید.',
 'نشانهٔ خاص یا جهت حرکت را به یاد دارید؟': 'از نشانهٔ خاص یا جهت حرکت چیزی گفته شد؟',
 // person
 'فقط آنچه از این فرد دیدید یا درباره‌اش شنیدید بنویسید.': 'فقط آنچه دربارهٔ این فرد به شما گفته شد بنویسید.',
 'سن و ظاهر این فرد را به یاد دارید؟': 'از سن و ظاهر این فرد چیزی گفته شد؟',
 'چه ویژگی ظاهری دیگری به یاد دارید؟': 'ویژگی ظاهری دیگری گفته شد؟',
 'تعداد افراد مشاهده‌شده': 'تعداد افراد گفته‌شده',
 // guide
 'همان اتفاق را کمی بازتر بگویید: دقیقاً چه چیزی دیدید یا شنیدید؟': 'همان اتفاق را کمی بازتر بگویید: دقیقاً چه چیزی به شما گفته شد؟',
 'یک یا دو جمله، فقط آنچه دیدید.': 'یک یا دو جمله، همان‌طور که برایتان تعریف شد.',
 'فقط آنچه دیدید؛ حدس نزنید.': 'فقط آنچه گفته شد؛ حدس نزنید.',
 'آیا از ظاهر یا نشانه‌های این افراد اطلاعاتی دارید؟': 'آیا درباره ظاهر یا نشانه‌های این افراد اطلاعاتی به شما داده شد؟',
 'آیا از مشخصات این وسیله نقلیه اطلاعاتی دارید؟': 'آیا مشخصاتی از این وسیله نقلیه به شما گفته شد؟',
 'فقط آنچه خودتان دیدید.': 'فقط آنچه به شما گفته شد.',
 'یا آنچه دیدید را بنویسید': 'یا آنچه گفته شد را بنویسید',
 'چیزی ندیدم': 'چیزی گفته نشد',
};
const ONLINE = {
 ...RELAYED,
 'دربارهٔ این وسیله چه چیزی گفته شد؟': 'دربارهٔ این وسیله چه چیزی در آن مطلب بود؟',
 'همان اتفاق را کمی بازتر بگویید: دقیقاً چه چیزی به شما گفته شد؟': 'همان اتفاق را کمی بازتر بگویید: دقیقاً چه چیزی دیدید یا خواندید؟',
 'یک یا دو جمله، همان‌طور که برایتان تعریف شد.': 'یک یا دو جمله، همان‌طور که در آن مطلب بود.',
};
const TABLES = { hearsay: RELAYED, online: ONLINE };

/** One string, re-worded for this reporter. Unknown strings pass through. */
export function phrase(text, mode) {
 const table = TABLES[mode];
 if (!table || typeof text !== 'string') return text;
 // One hop, then the online overrides for the already-relayed wording.
 const once = table[text] ?? text;
 return mode === 'online' ? (ONLINE[once] ?? once) : once;
}

/** A page or step with its title, hint, field labels and option labels re-worded. Never mutates. */
export function adapt(item, mode) {
 if (!item || !TABLES[mode]) return item;
 const out = { ...item };
 for (const key of ['title', 'hint', 'freeTextLabel', 'label']) if (typeof out[key] === 'string') out[key] = phrase(out[key], mode);
 if (Array.isArray(item.fields)) out.fields = item.fields.map(f => (typeof f === 'object' && f ? { ...f, label: phrase(f.label, mode) } : f));
 if (Array.isArray(item.options)) out.options = item.options.map(o => (typeof o === 'object' && o ? { ...o, label: phrase(o.label, mode) } : o));
 return out;
}
