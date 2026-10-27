// A stand-in for Ollama, used ONLY by the tests. It speaks the same protocol
// (/api/chat, and /v1/chat/completions for OpenAI-compatible servers) and
// answers with fixed, predictable JSON, so the plumbing between the site and a
// real model can be tested where no model can be downloaded.
//
// It is not a model and measures nothing about a model's quality.
//
//   node mock-llm.mjs 11999
import http from 'node:http';
import { localAnalysis } from './public/scenarios.js';

const SCRIPT = [
  { question: 'چه چیزهایی از داخل ماشین برده شد؟', options: [] },
  { question: 'دوربینی در آن خیابان هست که ماجرا را ضبط کرده باشد؟', options: ['بله', 'خیر'] },
  { question: 'همسایه‌تان را می‌شناسید و راهی برای تماس با او دارید؟', options: ['بله، شماره‌اش را دارم', 'نه'] },
];

export function reply(messages) {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const user = messages.find(m => m.role === 'user')?.content || '{}';
  const input = JSON.parse(user);
  if (/interviewer/.test(system)) {
    const asked = input.previous_questions_and_answers || [];
    const next = SCRIPT[asked.length];
    const facts = [];
    const text = String(input.narrative || '');
    const when = text.match(/دیشب|دیروز|امروز/); if (when) facts.push({ label: 'زمان', value: when[0] });
    const where = text.match(/خیابان\s+\S+/); if (where) facts.push({ label: 'مکان', value: where[0] });
    facts.push({ label: 'ساختگی', value: 'این جمله در گزارش نیست' });
    if (input.mode === 'intake' && asked.length === 0) return { done: false, question: 'چه اتفاقی افتاد؟', options: [], facts: [], urgent: '', narrative: '' };
    if (input.mode === 'intake' && asked.length >= 1) return { done: true, question: '', options: [], facts, urgent: '', narrative: asked.map(t => t.answer).join('. ') };
    if (!next) return { done: true, question: '', options: [], facts, urgent: '', narrative: '' };
    return { done: false, ...next, options: [...next.options, 'نمی‌دانم'], facts, urgent: /الان|همین حالا/.test(text) ? '110' : '', narrative: '' };
  }
  const a = localAnalysis(input.description || '');
  return {
    categories: [], events: a.events.map(type => ({ type, evidence: a.eventEvidence?.[type] || '' })),
    known: { time: a.known?.time || '', place: a.known?.place || '', source: a.known?.source || '' },
    prefills: [], followups: [], questions: [], clarification: { needed: Boolean(a.needsClarification) }, refusal: '',
  };
}

export function start(port = 11999) {
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    try {
      const v = JSON.parse(body || '{}');
      server.requests.push({ path: req.url, body: v });
      if (v.model === 'missing') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'model "missing" not found, try pulling it first' })); return; }
      const content = JSON.stringify(reply(v.messages || []));
      const out = req.url.startsWith('/v1/')
        ? { choices: [{ message: { role: 'assistant', content: `<think>thinking…</think>${content}` }, finish_reason: 'stop' }] }
        : { message: { role: 'assistant', content }, done: true, done_reason: 'stop' };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  server.requests = [];
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1]?.endsWith('mock-llm.mjs')) start(Number(process.argv[2]) || 11999).then(() => console.log('mock model on', process.argv[2] || 11999));
