// Limits for the Node HTTP adapters. Worker deployments still enforce their own
// validation; these limits stop the adapter buffering an unlimited request
// before the Worker has a chance to see it.
import {INTERVIEW_BODY_LIMIT} from './public/api-limits.js';
// Interview history may contain 20 legacy answers plus every grouped stage.
// 640 KiB also fits valid JSON with all allowed characters Unicode-escaped.
export const apiBodyLimit = pathname => pathname === '/api/transcribe' ? 26 * 1024 * 1024 : pathname === '/api/interview' ? INTERVIEW_BODY_LIMIT : 128 * 1024;

function reply(req, res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close', ...headers });
  res.end(JSON.stringify(payload));
  // Discard any body already in flight without retaining it in memory.
  req.on('error', () => {});
  req.resume();
}

// Admission covers the entire upload AND downstream response. It is per Node
// process; production reverse proxies/multiple workers need their own limits.
export function makeUploadAdmission(env = process.env) {
  const n = Number(env.STT_PROXY_MAX_ACTIVE);
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, 64) : 2;
  let active = 0;
  return (req, res, pathname) => {
    if (pathname !== '/api/transcribe' || req.method !== 'POST') return () => {};
    if (active >= limit) {
      reply(req, res, 503, { error: 'سرویس گفتار مشغول است؛ کمی بعد صوت را دوباره ارسال کنید.', code: 'stt_busy' }, { 'Retry-After': '5' });
      return null;
    }
    active++;
    let released = false;
    return () => { if (!released) { released = true; active--; } };
  };
}

export async function readApiBody(req, res, limit, timeoutMs=120000) {
  const announced = Number(req.headers['content-length'] || 0);
  if (announced > limit) {
    reply(req, res, 413, { error: 'حجم درخواست بیش از حد مجاز است.', code: 'too_large' });
    return null;
  }
  return await new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    const timer=setTimeout(()=>{cleanup();chunks=[];reply(req,res,408,{error:'زمان بارگذاری درخواست تمام شد.',code:'upload_timeout'});resolve(null)},timeoutMs);
    timer.unref?.();
    const cleanup = () => { clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAborted); };
    const onData = chunk => {
      size += chunk.length;
      if (size > limit) {
        cleanup(); chunks = [];
        reply(req, res, 413, { error: 'حجم درخواست بیش از حد مجاز است.', code: 'too_large' });
        resolve(null);
      } else chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks, size)); };
    const onError = error => { cleanup(); reject(error); };
    const onAborted = () => { cleanup(); reject(new Error('request aborted')); };
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
}
