// Measures the self-hosted language model on YOUR server — its own accuracy,
// not the browser engine's.
//
// It sends the held-out probes (sentences written for testing, never used to
// build the rules) straight to the model and scores what the MODEL ALONE
// returned. Then it scores the combined result the site actually uses (model +
// browser engine). It also runs a number of AI interviews with a simulated
// reporter and counts repeated questions and questions about facts the
// description already gave.
//
//   ollama pull qwen3:8b            (once)
//   node evaluation/llm-eval.mjs                 # 60 probes, 20 controls, 10 interviews
//   node evaluation/llm-eval.mjs --limit 300 --interviews 30
//
// Settings come from .env (LLM_URL, LLM_MODEL, …) exactly as for the site.
// Results: evaluation-output/llm-eval-<model>.json (every answer, for review).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { modelScores } from './llm-metrics.mjs';

if (existsSync('.env')) for (const line of readFileSync('.env', 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !line.trimStart().startsWith('#') && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const env = process.env;
if (!env.LLM_URL && !env.LLM_MODEL) { console.log('No self-hosted model is configured. Put LLM_URL and LLM_MODEL in .env (see llm/README.fa.md).'); process.exit(1); }

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : fallback; };
const LIMIT = arg('--limit', 60), CONTROLS = arg('--controls', 20), INTERVIEWS = arg('--interviews', 10);

const { local, interviewStep, interviewInput } = await import('../llm.js');
const { LOCAL_SYSTEM, localSchema, validateModelAnalysis } = await import('../worker.js');
const { prepareAnalysis } = await import('../public/extraction.js');
const { EVENTS, localAnalysis } = await import('../public/scenarios.js');

const sets = ['holdout', 'holdout-c', 'holdout-d', 'holdout-e', 'holdout-f', 'holdout-g', 'holdout-h', 'holdout-i', 'holdout-j'];
let probes = [], negatives = [];
for (const s of sets) { const m = await import(`./${s}.mjs`); probes.push(...(m.probes || []).map(p => ({ ...p, set: s }))); negatives.push(...(m.negatives || []).map(n => ({ text: n[0], topic: n[1], set: s }))); }
// A fixed spread over all sets and topics, the same every run.
const spread = (list, n) => { if (list.length <= n) return list; const step = list.length / n; return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]); };
probes = spread(probes, LIMIT); negatives = spread(negatives, CONTROLS);
const supersedes = Object.fromEntries(Object.keys(EVENTS).map(id => [id, Object.entries(EVENTS).filter(([, t]) => (t.replaces || []).includes(id)).map(([k]) => k)]));
const covers = (detected, must) => detected.includes(must) || supersedes[must].some(id => detected.includes(id));

async function analyse(text) {
  const t0 = performance.now();
  try {
    const out = await local(env, { instructions: LOCAL_SYSTEM, input: JSON.stringify({ description: text, region: '' }), text: { format: { schema: localSchema } }, max_output_tokens: 4096 });
    const ms = performance.now() - t0;
    const raw = validateModelAnalysis(JSON.parse(out));
    const model = [...new Set((raw.events || []).map(e => e?.type).filter(t => EVENTS[t] && t !== 'other'))];
    const combined = prepareAnalysis({ episodes: [], topicAssignments: [], prompts: [], ...raw }, text).events.filter(t => t !== 'other');
    return { ok: true, ms, model, combined, raw };
  } catch (e) {
    // The UI falls back to the browser engine when the API fails. Keep model
    // quality separate from the result of that fallback.
    const combined = localAnalysis(text).events.filter(t => t !== 'other');
    return { ok: false, fallback: true, ms: performance.now() - t0, model: [], combined, error: e.message };
  }
}

console.log(`model ${env.LLM_MODEL || 'qwen3:8b'} at ${env.LLM_URL || 'http://127.0.0.1:11434'} — ${probes.length} probes, ${negatives.length} controls, ${INTERVIEWS} interviews`);
const rows = [], negRows = [], times = [];
for (const [i, p] of probes.entries()) {
  const r = await analyse(p.text); times.push(r.ms);
  rows.push({ ...p, ...r, modelHit: covers(r.model, p.must), combinedHit: covers(r.combined, p.must) });
  process.stdout.write(`\rprobes ${i + 1}/${probes.length}`);
}
for (const [i, n] of negatives.entries()) {
  const r = await analyse(n.text); times.push(r.ms);
  negRows.push({ ...n, ...r, modelFalse: covers(r.model, n.topic), combinedFalse: covers(r.combined, n.topic) });
  process.stdout.write(`\rcontrols ${i + 1}/${negatives.length}   `);
}

// Interviews: the simulated reporter answers «نمی‌دانم» to everything, which
// is the hardest case for not repeating yourself.
const KNOWN = [
  { fact: 'time', said: /دیروز|دیشب|امروز|ساعت\s*[۰-۹0-9]|صبح|ظهر|عصر|شب/, asked: /(?:چه|کدام)\s*(?:زمانی|ساعتی|روزی|تاریخی)|کی\s+(?:اتفاق|بود|افتاد)/ },
  { fact: 'place', said: /خیابان|کوچه|محله|میدان|بلوار|پارک|مترو|بازار|مغازه|فروشگاه/, asked: /کجا|چه\s*مکانی|کدام\s*(?:خیابان|محله)|نشانی/ },
  { fact: 'people', said: /(?:یک|دو|سه|چهار|پنج|چند)\s*(?:تا\s*)?نفر/, asked: /چند\s*نفر/ },
];
const interviews = [];
for (const p of spread(probes, INTERVIEWS)) {
  const turns = []; let repeats = 0, reasked = [], error = '';
  for (let k = 0; k < 12; k++) {
    let v;
    try { v = await interviewStep(b => local(env, b), interviewInput({ mode: 'detail', text: p.text, turns })); }
    catch (e) { error = e.message; break; }
    if (v.done) break;
    if (turns.some(t => t.q === v.question)) repeats++;
    for (const k2 of KNOWN) if (k2.said.test(p.text) && k2.asked.test(v.question)) reasked.push(k2.fact + ': ' + v.question);
    turns.push({ q: v.question, a: '' });
  }
  interviews.push({ text: p.text, turns: turns.map(t => t.q), repeats, reasked, error });
  process.stdout.write(`\rinterviews ${interviews.length}/${INTERVIEWS}   `);
}
console.log('\n');

const pct = (a, b) => b ? +(a / b * 100).toFixed(1) : 0;
const valid = [...rows, ...negRows].filter(r => r.ok).length;
const sorted = [...times].sort((a, b) => a - b);
const summary = {
  model: env.LLM_MODEL || 'qwen3:8b',
  probes: rows.length, controls: negRows.length,
  usableResponseRate: pct(valid, rows.length + negRows.length),
  fallbackCount: [...rows, ...negRows].filter(r => r.fallback).length,
  ...modelScores(rows, negRows),
  siteRecall_modelPlusEngine: pct(rows.filter(r => r.combinedHit).length, rows.length),
  siteControlRejection: pct(negRows.filter(r => !r.combinedFalse).length, negRows.length),
  medianSecondsPerReport: +(sorted[Math.floor(sorted.length / 2)] / 1000 || 0).toFixed(1),
  interviews: interviews.length,
  avgQuestionsPerInterview: +(interviews.reduce((n, x) => n + x.turns.length, 0) / (interviews.length || 1)).toFixed(1),
  repeatedQuestions: interviews.reduce((n, x) => n + x.repeats, 0),
  questionsAboutFactsAlreadyGiven: interviews.reduce((n, x) => n + x.reasked.length, 0),
  interviewErrors: interviews.filter(x => x.error).length,
};
console.log(JSON.stringify(summary, null, 1));
mkdirSync('evaluation-output', { recursive: true });
const file = `evaluation-output/llm-eval-${summary.model.replace(/[^\w.-]+/g, '_')}.json`;
writeFileSync(file, JSON.stringify({ summary, rows, negRows, interviews }, null, 1));
console.log(`\nEvery answer is in ${file}; read the interviews there to judge the questions yourself.`);
