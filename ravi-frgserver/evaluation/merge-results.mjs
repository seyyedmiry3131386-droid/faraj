// Combines the partial summaries written by parallel shard processes into one
// results.json. It sums counters and concatenates shard records; it never
// recomputes a metric from predictions.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const out=resolve(process.argv[2]||'../evaluation-output');
const files=(await readdir(out)).filter(f=>/^results-.+\.json$/.test(f)).sort();
if(!files.length)throw Error(`no partial summaries in ${out}`);
const parts=await Promise.all(files.map(async f=>JSON.parse(await readFile(resolve(out,f),'utf8'))));
const base=parts[0];
const merged={...base,partials:files,shards:[],examples:[],failuresByKind:{},byTopicCount:{},
 topics:Object.fromEntries(Object.keys(base.topics).map(id=>[id,{expected:0,found:0,falsePositive:0}])),
 novice:{...base.novice,total:0,passed:0,failed:0,needMatches:0,topicMatches:0,groundingFailures:0,missingFactFailures:0,byNeed:{}},
 passed:0,failed:0,labelExactMatches:0,evidenceFailures:0,questionFailures:0,reviewFailures:0,
 duplicateCandidatesSkipped:0,uniqueNarratives:0,durationSeconds:0};
const add=(target,source)=>{for(const [k,v] of Object.entries(source))target[k]=(target[k]||0)+v};
for(const part of parts){
 for(const key of ['passed','failed','labelExactMatches','evidenceFailures','questionFailures','reviewFailures','duplicateCandidatesSkipped','uniqueNarratives'])merged[key]+=part[key]||0;
 merged.durationSeconds=Math.max(merged.durationSeconds,part.durationSeconds||0);
 merged.shards.push(...part.shards);
 merged.examples.push(...(part.examples||[]).slice(0,20));
 add(merged.failuresByKind,part.failuresByKind||{});
 for(const [k,v] of Object.entries(part.byTopicCount||{}))merged.byTopicCount[k]=v;
 for(const [id,v] of Object.entries(part.topics||{}))add(merged.topics[id]??={expected:0,found:0,falsePositive:0},v);
 const n=part.novice||{};
 for(const key of ['passed','failed','needMatches','topicMatches','groundingFailures','missingFactFailures'])merged.novice[key]+=n[key]||0;
 for(const [need,v] of Object.entries(n.byNeed||{}))add(merged.novice.byNeed[need]??={expected:0,matched:0},v);
}
merged.novice.total=merged.novice.passed+merged.novice.failed;
merged.shards.sort((a,b)=>a.file.localeCompare(b.file));
merged.total=merged.passed+merged.failed;
merged.finishedAt=new Date().toISOString();
merged.wallClockNote='durationSeconds is the longest single process, not the sum: shards ran in parallel.';
await writeFile(resolve(out,'results.json'),JSON.stringify(merged,null,2)+'\n');
console.log(JSON.stringify({out,total:merged.total,passed:merged.passed,failed:merged.failed,shards:merged.shards.length}));
