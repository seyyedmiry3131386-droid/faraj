import test from 'node:test';
import assert from 'node:assert/strict';
import {seeds,controls} from './evaluation/seeds.mjs';
import {localAnalysis,EVENTS} from './public/scenarios.js';
import {prepareAnalysis} from './public/extraction.js';
import {questionsFor} from './public/domain.js';

test('all 63 independently labelled topic seeds select exactly their topic in local and incomplete-API paths',()=>{
 assert.equal(Object.keys(seeds).length,Object.keys(EVENTS).length-1);
 for(const [id,phrases] of Object.entries(seeds))for(const text of phrases){
  const local=prepareAnalysis(localAnalysis(text),text),completed=prepareAnalysis({events:[],known:{}},text);
  assert.deepEqual(local.events,[id],text);assert.deepEqual(completed.events,[id],text);
  assert.ok(questionsFor(completed).some(q=>q.id==='details_'+id));
 }
});

test('all ordered two-topic seeds preserve separate occurrences and complete missing API proposals',()=>{
 for(const [a,phrasesA] of Object.entries(seeds))for(const [b,phrasesB] of Object.entries(seeds)){
  if(a===b)continue;
  const text=phrasesA[0]+'؛ '+phrasesB[1]+'.',expected=new Set([a,b]);
  const local=localAnalysis(text),api=prepareAnalysis({events:[{type:a,evidence:phrasesA[0]}],known:{}},text);
  assert.deepEqual(new Set(local.events),expected,text);
  assert.deepEqual(new Set(api.events),expected,text);
 }
});

test('negation, uncertainty and ordinary criticism do not become additional incidents',()=>{
 for(const [negative,id] of controls){
  assert.ok(!localAnalysis(negative).events.includes(id),negative);
  for(const [topic,phrases] of Object.entries(seeds)){
   for(const separator of ['. ','؛ ','\n']){
    const text=negative+separator+phrases[0];
    assert.deepEqual(localAnalysis(text).events,[topic],text);
   }
  }
 }
});

test('unrelated predicates do not create cross-sentence theft, corruption, repeated harm or suppression',()=>{
 const cases=[
  ['سرقت کیف رخ داد. تهدید با سلاح سرد رخ داد.',['theft','weapon_threat']],
  ['از عملکرد مأموران انتقاد کردند. کلاهبردار پس از دریافت پول پاسخ نداد.',['fraud']],
  ['فروش سلاح را دیدم؛ اخاذی هر روز تکرار می شد',['hazardous_supply','pdf_b15']],
  ['مسدود شدن خیابان را دیدم؛ تجمع مسالمت آمیز در محل دیگری بود',['pdf_a02']],
  ['ورود اجباری همراه با تهدید رخ داد؛ با چاقو تهدید نکرد',['pdf_a17']],
  ['مأمور قلابی در محل بود؛ جعل عنوان برای دریافت وجه رخ داد',['impersonation','pdf_b22']],
  ['فراخوان خشونت علیه افراد در فضای مجازی منتشر شد',['online_harm']],
  ['خشونت جنسی گزارش شد؛ در خیابان دیگری فردی را کتک زدند',['sexual_violence','assault']]
 ];
 for(const [text,expected] of cases)assert.deepEqual(new Set(localAnalysis(text).events),new Set(expected),text);
});
