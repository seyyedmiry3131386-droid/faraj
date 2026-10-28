// Cryptographic primitives for the optional central service. No secret is
// shipped in the repository. Use distinct high-entropy keys in production.
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);

export function dataKey(value){
 const v=String(value||'');
 if(!/^[A-Za-z0-9+/]{43}=$/.test(v))throw new Error('CENTRAL_DATA_KEY must be a base64 encoded 32-byte random key');
 const key=Buffer.from(v,'base64');
 if(key.length!==32||key.toString('base64')!==v)throw new Error('Invalid CENTRAL_DATA_KEY');
 return key;
}
export const hashToken=token=>createHash('sha256').update(String(token)).digest('hex');
export const opaqueToken=()=>randomBytes(32).toString('base64url');
export const userKey=(key,userId)=>createHmac('sha256',key).update('bale-user\0').update(String(userId)).digest('hex');

export function seal(key,value,aad){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(String(aad)));
 const encrypted=Buffer.concat([cipher.update(value),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
}
export function unseal(key,value,aad){
 const bytes=Buffer.from(value);if(bytes.length<28)throw new Error('Invalid encrypted value');
 const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
 decipher.setAAD(Buffer.from(String(aad)));decipher.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
}

// Official Bale mini-app initData algorithm. Values are URL decoded before
// sorting; duplicate keys and unsigned/future/expired data are rejected.
export function verifyBaleInitData(raw,botToken,{now=Date.now(),maxAgeSeconds=86400}={}){
 if(typeof raw!=='string'||raw.length<1||raw.length>8192||!botToken)return null;
 try{
  const params=new URLSearchParams(raw),entries=[...params.entries()];
  if(new Set(entries.map(([key])=>key)).size!==entries.length)return null;
  const provided=params.get('hash');
  if(!provided||!/^[a-f0-9]{64}$/i.test(provided))return null;
  const check=entries.filter(([key])=>key!=='hash').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>`${key}=${value}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(String(botToken)).digest();
  const expected=createHmac('sha256',secret).update(check).digest();
  const actual=Buffer.from(provided,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const date=params.get('auth_date');
  if(!/^\d{1,12}$/.test(date||''))return null;
  const issued=Number(date),nowSeconds=Math.floor(now/1000);
  if(!Number.isSafeInteger(issued)||issued>nowSeconds+60||nowSeconds-issued>maxAgeSeconds)return null;
  // Preserve a signed numeric ID exactly. JSON.parse normally rounds integers
  // beyond 2^53, which could merge two distinct Bale accounts. On runtimes
  // without the reviver source context, accept only safe numeric IDs.
  const user=JSON.parse(params.get('user')||'null',(key,value,context)=>{
   if(key!=='id'||typeof value!=='number')return value;
   if(typeof context?.source==='string')return /^\d{1,24}$/.test(context.source)?context.source:null;
   return Number.isSafeInteger(value)?String(value):null;
  });
  const id=user?.id;
  if(typeof id!=='string'||!/^\d{1,24}$/.test(id)||/^0+$/.test(id))return null;
  return {id,authDate:issued};
 }catch{return null}
}

const SCRYPT={N:32768,r:8,p:1,maxmem:64*1024*1024};
export async function passwordHash(password,salt=randomBytes(16)){
 const derived=await scrypt(String(password),salt,32,SCRYPT);
 return {salt:Buffer.from(salt),hash:Buffer.from(derived)};
}
export async function passwordMatches(password,salt,hash){
 const result=await passwordHash(password,Buffer.from(salt));const expected=Buffer.from(hash);
 return expected.length===result.hash.length&&timingSafeEqual(result.hash,expected);
}

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=ALPHABET[(value>>>(bits-5))&31];bits-=5}}if(bits)out+=ALPHABET[(value<<(5-bits))&31];return out}
export function fromBase32(input){let bits=0,value=0,out=[];for(const ch of String(input).replace(/=+$/,'').toUpperCase()){const n=ALPHABET.indexOf(ch);if(n<0)throw new Error('invalid base32');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out)}
export function totpAt(secret,step){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const h=createHmac('sha1',secret).update(counter).digest(),offset=h[h.length-1]&15;
 return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export function verifyTotp(secret,code,{now=Date.now(),lastStep=-1}={}){
 if(!/^\d{6}$/.test(String(code)))return null;
 const current=Math.floor(now/30000);
 // Prefer the current timestep, then neighbouring timesteps. Never reuse a
 // timestep even if a stolen code is replayed against a different session.
 for(const step of [current,current-1,current+1]){
  if(step<=lastStep||step<0)continue;
  const a=Buffer.from(totpAt(secret,step)),b=Buffer.from(String(code));
  if(timingSafeEqual(a,b))return step;
 }
 return null;
}
