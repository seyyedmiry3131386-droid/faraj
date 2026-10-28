// Orthographic folding for Persian narratives, shared by the browser and the
// evaluation harness. Reports arrive with Arabic letter forms, Arabic-Indic
// digits, zero-width joiners, tatweel padding and optional diacritics; none of
// those change what was reported, so matching folds them away.
//
// Two views are produced from one table:
//  * `normalize(text)` — a folded string for plain `.test()` checks.
//  * `foldIndexed(text)` — the same folding plus an index map back into the
//    original narrative, so every quoted span stays verbatim.

// One-to-one letter and digit folds.
const FOLD = new Map(Object.entries({
 'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ۍ': 'ی', 'ې': 'ی', 'ﯼ': 'ی', 'ﯽ': 'ی', 'ﻯ': 'ی', 'ﻰ': 'ی',
 'ك': 'ک', 'ڪ': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک', 'ﮎ': 'ک', 'ﮏ': 'ک',
 'ة': 'ه', 'ۀ': 'ه', 'ۃ': 'ه', 'ۂ': 'ه', 'ھ': 'ه', 'ﻩ': 'ه', 'ﻪ': 'ه',
 'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ﺁ': 'ا', 'ﺍ': 'ا',
 'ؤ': 'و', 'ۇ': 'و', 'ۈ': 'و', 'ۋ': 'و', 'ۆ': 'و', 'ۅ': 'و',
 'ٮ': 'ب', 'ڤ': 'ف', 'ٯ': 'ق', 'ڢ': 'ف',
 '٠': '۰', '١': '۱', '٢': '۲', '٣': '۳', '٤': '۴', '٥': '۵', '٦': '۶', '٧': '۷', '٨': '۸', '٩': '۹'
}));

// Removed entirely: they carry no lexical content for topic matching.
// U+064B–U+0655 harakat/hamza-above (the ezafe mark in «وعدهٔ کار»),
// U+0670 superscript alef, U+0640 tatweel, joiners and bidi marks.
const STRIP = /[ً-ٰٕـ‍‎‏⁦-⁩﻿­]/;
// Kept as a separator: the zero-width non-joiner marks a morpheme boundary,
// so «می‌زند» must match the same patterns as «می زند».
const TO_SPACE = /[‌ -​  　 \t]/;

const foldChar = c => FOLD.get(c) ?? c;

/** Folded text plus `map`, where `map[i]` is the source index of the i-th kept character. */
export function foldIndexed(text) {
 const src = String(text ?? '');
 let s = '';
 const map = [];
 for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (STRIP.test(c)) continue;
  s += TO_SPACE.test(c) ? ' ' : foldChar(c);
  map.push(i);
 }
 map.push(src.length);
 return { s, map };
}

/** Folded text for boolean checks. Offsets are not preserved; use `foldIndexed` for spans. */
export const normalize = text => foldIndexed(text).s.trim();

/**
 * Folds a regular-expression source so patterns can be written in ordinary
 * Persian and still match folded narratives. Only letters and digits are
 * touched, so regex syntax is untouched.
 */
export const foldPattern = src => String(src).replace(/./gu, foldChar);

/**
 * Builds a rule regular expression from a pattern written in ordinary Persian.
 * Every match is anchored to the start of a word, so a short pattern such as
 * «در» can never fire on the middle of «مادرم». Patterns add their own trailing
 * boundary where the word must also end, because Persian clitics («تهدیدمان»)
 * legitimately continue a matched stem.
 */
export const rx = (src, flags = 'gu') => new RegExp('(?<![\\p{L}\\p{N}_])(?:' + foldPattern(src) + ')', flags);
