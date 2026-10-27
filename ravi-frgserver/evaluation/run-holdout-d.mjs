// Scores the local classifier against the held-out probes. Reports recall of
// the intended topic, out-of-scope predictions, and false positives on the
// hard-negative controls. No label is ever taken from a prediction.
import {localAnalysis,EVENTS} from '../public/scenarios.js';
import {probes,negatives} from './holdout-d.mjs';

// A narrower topic that declares it replaces the intended one satisfies the
// probe: the taxonomy defines that substitution, so it is not a recall miss.
const supersedes=Object.fromEntries(Object.keys(EVENTS).map(id=>[id,
 Object.entries(EVENTS).filter(([,t])=>(t.replaces||[]).includes(id)).map(([k])=>k)]));

// Development and reporting splits. Rules are tuned against `--dev` only;
// `--test` is scored once, so the reported figure is not a tuning artefact.
const seenPerTopic={};
const withSplit=probes.map(pr=>{const n=seenPerTopic[pr.must]=(seenPerTopic[pr.must]??-1)+1;return {...pr,split:n%2?'test':'dev'}});
const argv=process.argv.slice(2),verbose=argv.includes('--verbose'),json=argv.includes('--json');
const only=argv.includes('--dev')?'dev':argv.includes('--test')?'test':null;
const probeSet=only?withSplit.filter(p=>p.split===only):withSplit;
const rows=[];
let hit=0,extra=0;
for(const {must,text,allow} of probeSet){
 const detected=localAnalysis(text).events;
 const ok=detected.includes(must)||supersedes[must].some(id=>detected.includes(id));
 const out=detected.filter(id=>id!==must&&id!=='other'&&!allow.includes(id)&&!supersedes[must].includes(id));
 if(ok)hit++;if(out.length)extra++;
 rows.push({must,text,detected,ok,out});
}
const negRows=[];
let fp=0;
for(const [text,topic] of negatives){
 const detected=localAnalysis(text).events;
 // A subtype of the control's topic is the same false positive under a narrower name.
 const bad=detected.includes(topic)||(supersedes[topic]||[]).some(id=>detected.includes(id));
 if(bad)fp++;
 negRows.push({topic,text,detected,bad});
}
const byTopic={};
for(const r of rows){(byTopic[r.must]??={total:0,hit:0}).total++;if(r.ok)byTopic[r.must].hit++}
const weak=Object.entries(byTopic).filter(([,v])=>v.hit<v.total).sort((a,b)=>a[1].hit/a[1].total-b[1].hit/b[1].total);
const summary={
 split:only||"all",probes:probeSet.length,recall:+(hit/probeSet.length*100).toFixed(2),
 outOfScopePredictions:extra,
 negativeControls:negatives.length,controlsWronglyReported:fp,
 // Share of the hard-negative controls correctly NOT reported. This is a
 // rejection rate on these controls, not the classifier's precision.
 controlRejectionRate:+((negatives.length-fp)/negatives.length*100).toFixed(2),
 weakTopics:weak.map(([id,v])=>`${id} ${v.hit}/${v.total}`)
};
if(json){console.log(JSON.stringify({summary,rows,negRows},null,1));process.exit(0)}
console.log(JSON.stringify(summary,null,1));
if(verbose){
 console.log('\n--- missed ---');
 for(const r of rows)if(!r.ok)console.log(`${r.must}\t[${r.detected}]\t${r.text}`);
 console.log('\n--- out of scope ---');
 for(const r of rows)if(r.out.length)console.log(`${r.must}\t+${r.out}\t${r.text}`);
 console.log('\n--- control false positives ---');
 for(const r of negRows)if(r.bad)console.log(`${r.topic}\t[${r.detected}]\t${r.text}`);
}
