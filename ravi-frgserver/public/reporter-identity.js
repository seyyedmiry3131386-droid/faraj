import {asciiDigits} from './inputs.js';

// These are reporter-entered contact details, not verification of a person's
// real identity. Bale's signed account identity is checked separately.
export const REPORTER_FIELDS = Object.freeze([
 {id:'name',label:'نام و نام خانوادگی',max:120},
 {id:'province',label:'استان',max:80},
 {id:'mobile',label:'شماره همراه',max:10},
 {id:'rank',label:'عنوان رده',max:80},
 {id:'post',label:'عنوان سمت',max:80},
]);

/** Validate without silently truncating a pasted or old phone number. */
export function validateReporterIdentity(input) {
 const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
 const value = {}, errors = {};
 for (const {id,label,max} of REPORTER_FIELDS) {
  const raw = typeof source[id] === 'string' ? source[id].trim() : '';
  value[id] = id === 'mobile' ? asciiDigits(raw) : raw;
  if (!value[id]) errors[id] = `«${label}» را وارد کنید.`;
  else if (id === 'mobile' && !/^\d{10}$/.test(value[id]))
   errors[id] = 'شماره همراه باید دقیقاً ۱۰ رقم و فقط شامل عدد باشد.';
  else if (id !== 'mobile' && value[id].length > max)
   errors[id] = `«${label}» بیش از حد طولانی است.`;
 }
 return {value, errors, valid:Object.keys(errors).length === 0};
}
