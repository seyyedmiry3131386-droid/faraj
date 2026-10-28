function failure(message, code, status) {
  return Object.assign(new Error(message), {code, status});
}

export async function requestApi(path, data, {fetcher=globalThis.fetch, timeout}={}) {
  const isConfig=path==='config';
  const controller=new AbortController();
  // Allow the default 180 s local STT timeout plus a slow upload; otherwise the
  // browser gives up while the server is still decoding the same recording.
  const timer=setTimeout(()=>controller.abort(),timeout??(path==='transcribe'?300000:path==='config'?10000:95000));
  try {
    const multipart=data instanceof FormData;
    const headers=isConfig||multipart?{}:{'Content-Type':'application/json'};
    // In a central deployment the Node gateway verifies this signed string
    // before allowing model requests. Give the already-started host SDK a
    // bounded chance to load, so an early tap does not spuriously lose auth.
    if(!isConfig&&globalThis.window?.__raviBaleSdk){
      let hostTimer;try{await Promise.race([Promise.resolve(window.__raviBaleSdk),new Promise(resolve=>{hostTimer=setTimeout(resolve,5000)})])}catch{}finally{clearTimeout(hostTimer)}
    }
    const signed=globalThis.window?.Bale?.WebApp?.initData;
    if(!isConfig&&typeof signed==='string'&&signed&&signed.length<=8192)headers['X-Bale-Init-Data']=signed;
    const res=await fetcher(`/api/${path}`,{method:isConfig?'GET':'POST',credentials:'same-origin',
      headers,
      ...(isConfig?{}:{body:multipart?data:JSON.stringify(data??{})}),signal:controller.signal});
    let value;
    try {value=await res.json();} catch {
      throw failure(res.status===401||res.status===403?'دسترسی به سامانه تأیید نشد. سایت را در تب جدا باز کنید و در صورت درخواست وارد شوید.':'سرور پاسخ قابل خواندن نداد؛ صفحه را تازه کنید و دوباره تلاش کنید.','site_response',res.status);
    }
    if (!res.ok) throw failure(value.error||'ارتباط با سرویس برقرار نشد؛ دوباره تلاش کنید.',value.code||'api_error',res.status);
    return value;
  } catch(e) {
    if (controller.signal.aborted || e.name==='TimeoutError' || e.name==='AbortError') throw failure('زمان دریافت پاسخ تمام شد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.','timeout');
    if (e instanceof TypeError) throw failure('ارتباط شبکه قطع شد؛ اتصال اینترنت را بررسی کنید. صوت ضبط‌شده را می‌توانید دوباره ارسال کنید.','network');
    throw e;
  } finally {clearTimeout(timer);}
}
