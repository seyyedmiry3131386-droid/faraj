// Questions are filled from the description, and only relevant ones are asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {localAnalysis} from './public/scenarios.js';
import {prepareAnalysis} from './public/extraction.js';
import {questionsFor} from './public/domain.js';
import {derived} from './public/narrative-facts.js';

const CAR='دیشب حدود ساعت ۱۱ در خیابان بهار دو نفر با موتور آمدند، شیشهٔ ماشینم را شکستند و کیف و گوشی‌ام را از داخل ماشین بردند. پلاک موتورشان را ندیدم. همسایه‌مان دید و به من گفت.';
const run=text=>prepareAnalysis({...localAnalysis(text),mode:'preview'},text);
const get=(a,section,field)=>a.prefills.filter(p=>p.section===section&&p.field===field).map(p=>p.value);

test('a car break-in: vehicle asked, no phone/online-account question',()=>{
 const a=run(CAR),ids=questionsFor(a).map(q=>q.id);
 assert.ok(a.events.includes('vehicle_theft'),a.events.join());
 assert.ok(ids.includes('vehicle'));assert.ok(!ids.includes('contact'));
});
test('what the description says is filled: hour, part of day, how many, who told them, plate not seen, what was taken',()=>{
 const a=run(CAR);
 assert.deepEqual(get(a,'time','clock'),['حدود ساعت ۱۱']);
 assert.deepEqual(get(a,'time','period'),['شب']);
 assert.deepEqual(get(a,'person','count'),['2']);
 assert.deepEqual(get(a,'source','informantKnown'),['بله، می‌شناسمش']);
 assert.deepEqual(get(a,'source','informantRelation'),['همسایه‌مان']);
 assert.ok(get(a,'vehicle','plateStatus').includes('پلاک را ندیدم'));
 assert.deepEqual(get(a,'object','label').sort(),['کیف','گوشی'].sort());
});
test('every filled value is copied from the description, or is the one option its words name',()=>{
 const a=run(CAR);
 for(const p of a.prefills){
  assert.ok(CAR.includes(p.evidence),p.evidence);
  assert.ok(p.evidence.includes(p.value)||derived(p.section,p.field,p.evidence)===p.value,`${p.section}.${p.field}=${p.value}`);
 }
});
test('money sent by card transfer: the account/number question is asked',()=>{
 const a=run('دیروز در دیوار آگهی گوشی دیدم و دو میلیون کارت به کارت کردم ولی فروشنده جواب نداد و گوشی را نفرستاد.');
 assert.ok(questionsFor(a).some(q=>q.id==='contact'));
});
test('carrying something somewhere is not theft',()=>{
 assert.ok(!localAnalysis('گوشی‌ام را به تعمیرگاه بردند').events.includes('theft'));
 assert.ok(localAnalysis('کیف و گوشی‌ام را از داخل ماشین بردند').events.includes('vehicle_theft'));
});
