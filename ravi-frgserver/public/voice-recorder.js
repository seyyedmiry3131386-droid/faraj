export function microphoneMessage(error) {
  const messages = {
    NotAllowedError: 'دسترسی میکروفون رد یا مسدود شد. دسترسی بله در تنظیمات گوشی و اجازهٔ همین سایت را بررسی کنید؛ یا فایل صوتی انتخاب کنید.',
    NotFoundError: 'میکروفونی پیدا نشد. اتصال میکروفون را بررسی کنید یا فایل صوتی انتخاب کنید.',
    NotReadableError: 'میکروفون در دسترس نیست؛ برنامه‌های دیگری که از آن استفاده می‌کنند را ببندید و دوباره تلاش کنید.',
    OverconstrainedError: 'تنظیمات میکروفون پشتیبانی نمی‌شود؛ فایل صوتی انتخاب کنید.',
    SecurityError: 'این محیط اجازهٔ ضبط نمی‌دهد؛ سامانه را در مرورگر گوشی باز کنید یا فایل صوتی انتخاب کنید.',
    NotSupportedError: 'ضبط مستقیم در این محیط پشتیبانی نمی‌شود؛ فایل صوتی انتخاب کنید یا سامانه را در مرورگر گوشی باز کنید.',
  };
  return messages[error?.name] || 'ضبط صدا انجام نشد؛ میکروفون را بررسی کنید یا فایل صوتی انتخاب کنید.';
}

// Capture is local and deliberately independent of API configuration/availability.
export function createVoiceRecorder({onState=()=>{}, onFile=()=>{}, onError=()=>{},
  mediaDevices=globalThis.navigator?.mediaDevices, Recorder=globalThis.MediaRecorder,
  secure=globalThis.isSecureContext, policy=globalThis.document?.permissionsPolicy || globalThis.document?.featurePolicy,
  maxDuration=180000}={}) {
  let session=null;
  function release(s) {
    clearTimeout(s.timer);
    s.stream?.getTracks().forEach(track=>track.stop());
  }
  function finish(s) {
    release(s);
    if (session!==s) return;
    session=null;
    onState('idle');
    if (s.cancelled) return;
    const type=s.recorder?.mimeType || s.chunks.find(chunk=>chunk.type)?.type || 'audio/webm';
    const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':type.includes('wav')?'wav':'webm';
    const file=new File(s.chunks,`recording.${ext}`,{type});
    if (file.size) onFile(file);
    else onError('صدایی ذخیره نشد؛ کمی صحبت کنید و دوباره پایان ضبط را بزنید.');
  }
  function stop({discard=false}={}) {
    const s=session;
    if (!s) return;
    if (discard) {
      s.cancelled=true;
      session=null;
      onState('idle');
    }
    if (s.recorder?.state==='recording') {
      if (!discard) onState('stopping');
      // Let the recorder flush its final chunk before releasing its input tracks.
      try {s.recorder.stop();} catch {finish(s);}
    } else if (!s.recorder) {
      s.cancelled=true;
      session=null;
      onState('idle');
    }
    if (discard) release(s);
  }
  async function start() {
    if (session) return;
    if (secure===false) return onError('برای ضبط صدا، سامانه را با نشانی امن HTTPS باز کنید.');
    if (policy?.allowsFeature && !policy.allowsFeature('microphone')) return onError('ضبط در این پنجره مجاز نیست. سامانه را در تب جدا یا مرورگر گوشی باز کنید و اجازهٔ میکروفون بدهید.','SecurityError');
    if (!mediaDevices?.getUserMedia || !Recorder) return onError(microphoneMessage({name:'NotSupportedError'}),'NotSupportedError');
    const s={chunks:[],cancelled:false};session=s;onState('requesting');
    try {
      try {s.stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});}
      catch(e) {
        if (session!==s) return;
        if (!['OverconstrainedError','NotSupportedError'].includes(e.name)) throw e;
        s.stream=await mediaDevices.getUserMedia({audio:true});
      }
      if (session!==s || s.cancelled) {release(s);return;}
      const types=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'];
      const mime=types.find(type=>Recorder.isTypeSupported?.(type));
      try {s.recorder=new Recorder(s.stream,{audioBitsPerSecond:128000,...(mime?{mimeType:mime}:{})});}
      catch(e) {
        if (e.name!=='NotSupportedError') throw e;
        s.recorder=new Recorder(s.stream);
      }
      s.recorder.ondataavailable=e=>{if(e.data?.size)s.chunks.push(e.data);};
      s.recorder.onstop=()=>finish(s);
      s.recorder.onerror=()=>{
        if(session!==s)return;
        onError('ضبط قطع شد؛ اگر صوتی ذخیره شده باشد می‌توانید آن را پخش یا دریافت کنید.');
        // MediaRecorder emits dataavailable and stop after an error.
        stop();
      };
      s.recorder.start(500);
      onState('recording');
      s.timer=setTimeout(()=>stop(),maxDuration);
    } catch(e) {
      release(s);
      if (session!==s) return;
      session=null;onState('idle');onError(microphoneMessage(e),e?.name);
    }
  }
  return {start,stop};
}
