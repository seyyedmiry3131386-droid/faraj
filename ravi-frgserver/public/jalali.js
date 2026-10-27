// Turning «دیروز» into a date the form can carry.
//
// A reporter who writes «دیشب» has told us the day. Asking them to also type
// ۱۴۰۵/۰۶/۲۹ is asking them to do arithmetic we can do ourselves — and to do
// it in a calendar most people do not convert in their head. So the day is
// filled in for them and only the clock is left to choose.
//
// The conversion follows the official Iranian calendar, which is astronomical:
// Nowruz falls on the day of the vernal equinox as observed in Tehran. The
// common «2820-year cycle» arithmetic disagrees with it in some years — it puts
// Nowruz 1404 on 20 March 2025 when the official date was the 21st. This is the
// 33-year break-table algorithm (Borkowski), which matches the official calendar
// across 1178–1633 AP. No library, no network.

// Integer division and remainder that truncate toward zero, as the algorithm
// is specified; Math.floor would shift every date before the epoch.
const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
 const gy = jy + 621;
 let leapJ = -14, jp = BREAKS[0], jump = 0;
 for (let i = 1; i < BREAKS.length; i++) {
  const jm = BREAKS[i];
  jump = jm - jp;
  if (jy < jm) break;
  leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
  jp = jm;
 }
 let n = jy - jp;
 leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
 if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
 const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
 const march = 20 + leapJ - leapG;
 if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
 let leap = mod(mod(n + 1, 33) - 1, 4);
 if (leap === -1) leap = 4;
 return { leap, gy, march };
}
function g2d(gy, gm, gd) {
 const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
 return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
 let j = 4 * jdn + 139361631;
 j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
 const i = div(mod(j, 1461), 4) * 5 + 308;
 const gd = div(mod(i, 153), 5) + 1;
 const gm = mod(div(i, 153), 12) + 1;
 return { gy: div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd };
}
function d2j(jdn) {
 const { gy } = d2g(jdn);
 let jy = gy - 621;
 const r = jalCal(jy);
 let k = jdn - g2d(gy, 3, r.march);
 if (k >= 0) {
  if (k <= 185) return { year: jy, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
  k -= 186;
 } else {
  jy -= 1;
  k += 179;
  if (r.leap === 1) k += 1;
 }
 return { year: jy, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const pad = n => String(n).padStart(2, '0');

/** A Gregorian date as a Persian-digit Jalali string, «۱۴۰۵/۰۶/۲۹». */
export function toJalali(date = new Date()) {
 const { year, month, day } = d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
 return `${fa(year)}/${fa(pad(month))}/${fa(pad(day))}`;
}

// How many days back each expression points. «دیشب» is last night, which is
// yesterday's date: someone writing at 2am about «دیشب» means the evening that
// has just ended, and the day it belongs to is the one before today.
const OFFSETS = [
 [/(?:^|\s)(?:همین\s*(?:الان|حالا)|هم\s*اکنون|اکنون|الان|امروز|امشب|همین\s*امروز)(?:\s|$|[،.؛])/u, 0],
 [/(?:^|\s)(?:دیروز|دیشب|شب\s*گذشته|روز\s*گذشته)(?:\s|$|[،.؛])/u, -1],
 [/(?:^|\s)(?:پریشب|پریروز)(?:\s|$|[،.؛])/u, -2],
];

/**
 * The calendar date a narrative's relative day-word points at, or ''.
 * Only day-words are resolved. «هفتهٔ گذشته» and «چند روز پیش» name a range,
 * not a day, so they are left alone rather than guessed into a date.
 */
export function resolveRelativeDate(text, today = new Date()) {
 const value = String(text ?? '');
 for (const [pattern, offset] of OFFSETS) {
  if (!pattern.test(value)) continue;
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return toJalali(date);
 }
 return '';
}
