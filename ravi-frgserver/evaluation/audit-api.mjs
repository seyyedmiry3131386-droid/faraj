// Exercise the fresh-API completion path with deliberately missing topics.
// This is a local postprocessor test, not an upstream model-quality benchmark.
import {createReadStream} from 'node:fs';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {prepareAnalysis} from '../public/extraction.js';
import {questionsFor} from '../public/domain.js';
const out=resolve(process.argv[2]);const summary=JSON.parse(await readFile(resolve(out,'results.json'),'utf8'));
const result={scope:'Local fresh-API postprocessing with deliberately incomplete mock proposals; no live API calls.',sampledCases:0,proposalsChecked:0,passed:0,failed:0,byTopicCount:{}};
for(const shard of summary.shards){
 let lineIndex=0;
 for await(const line of createInterface({input:createReadStream(resolve(out,shard.file)).pipe(createGunzip()),crlfDelay:Infinity})){
  if(lineIndex++%1000)continue;
  const row=JSON.parse(line),k=row.expected_topics.length;
  result.sampledCases++;result.byTopicCount[k]=(result.byTopicCount[k]||0)+1;
  const topic=row.expected_topics[result.sampledCases%k];
  for(const events of [[],[{type:topic,evidence:row.evidence[topic]}]]){
   result.proposalsChecked++;
   const a=prepareAnalysis({events,known:{}},row.text);
   try{assert.deepEqual([...a.events].sort(),row.expected_topics);assert.equal(new Set(questionsFor(a).map(q=>q.id)).size,questionsFor(a).length);result.passed++}catch{result.failed++}
  }
 }
}
await writeFile(resolve(out,'api-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;
