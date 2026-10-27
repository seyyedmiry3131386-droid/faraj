import {EVENTS,eventIds} from './scenarios.js';
import {sourceReference} from './numbered-topics.js';
import {asciiDigits} from './inputs.js';

export const normalizeTopicQuery=text=>asciiDigits(String(text||'')).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u200c–—_-]/g,' ').replace(/\s+/g,' ').trim();
export function topicMatches(haystack,query){
 const source=normalizeTopicQuery(haystack),search=normalizeTopicQuery(query);
 const ref=search.match(/^(?:بند\s*)?(الف|ب)\s*(\d+)$/);
 if(ref)return new RegExp(`(?:^|\\s)${ref[1]}\\s+${ref[2]}(?:\\s|$)`).test(source);
 if(['الف','ب'].includes(search))return source.includes('بند '+search+' ');
 if(/^\d+$/.test(search))return new RegExp(`(?:^|\\s)${search}(?:\\s|$)`).test(source);
 return search.split(' ').filter(Boolean).every(word=>source.includes(word));
}
// One catalog, ordered by its public Persian labels, regardless of source.
export const topicEntries=()=>Object.entries(EVENTS).sort((a,b)=>a[1].title.localeCompare(b[1].title,'fa'));
export function topicChoices(analysis,escape){
 const selected=eventIds(analysis);
 return `<label class="topic-search-label" for="topic-search">جست‌وجوی موضوع</label><input class="field" type="search" id="topic-search" placeholder="نام موضوع را بنویسید" autocomplete="off"><p class="topic-search-empty" hidden>موضوعی با این عبارت پیدا نشد.</p><div class="topic-grid">${topicEntries().map(([id,e])=>`<div class="topic-choice" data-topic-choice data-topic-search="${escape(e.title+' '+(e.aliases||[]).join(' ')+' '+sourceReference(e)+' '+(e.source?.original||''))}"><label class="topic-option"><input type="checkbox" data-topic="${id}" ${selected.includes(id)?'checked':''}><span>${escape(e.title)}</span></label></div>`).join('')}</div>`;
}
