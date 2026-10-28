import test from 'node:test';
import assert from 'node:assert/strict';
import {REPORTER_FIELDS,validateReporterIdentity} from './public/reporter-identity.js';

const person={name:'کاربر آزمایشی',province:'تهران',mobile:'9123456789',rank:'رده آزمایشی',post:'سمت آزمایشی'};

test('all five reporter fields are required, and whitespace alone is not information',()=>{
 assert.equal(validateReporterIdentity(person).valid,true);
 for(const field of REPORTER_FIELDS){
  const result=validateReporterIdentity({...person,[field.id]:' \t '});
  assert.equal(result.valid,false,field.id);assert.ok(result.errors[field.id],field.id);
 }
 assert.equal(validateReporterIdentity(null).valid,false);
 assert.equal(validateReporterIdentity({...person,name:{}}).valid,false);
 assert.equal(validateReporterIdentity({...person,name:'x'.repeat(121)}).valid,false);
});

test('phone is exactly ten digits; Persian and Arabic numerals are converted, never truncated',()=>{
 for(const mobile of ['9123456789','۹۱۲۳۴۵۶۷۸۹','٩١٢٣٤٥٦٧٨٩']){
  const result=validateReporterIdentity({...person,mobile});assert.equal(result.valid,true,mobile);assert.equal(result.value.mobile,'9123456789');
 }
 for(const mobile of ['912345678','09123456789','۹۱۲-۳۴۵۶۷۸۹','۹۱۲۳۴۵۶۷۸a','+989123456789','۱۲۳۴۵ ۶۷۸۹','']){
  const result=validateReporterIdentity({...person,mobile});assert.equal(result.valid,false,mobile);assert.ok(result.errors.mobile);
  assert.equal(result.value.mobile.replace(/[^0-9]/g,'').length,mobile.replace(/[۰-۹]/g,'0').replace(/[٠-٩]/g,'0').replace(/[^0-9]/g,'').length);
 }
});
