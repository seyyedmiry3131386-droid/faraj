// Single-server central persistence. SQLite is in WAL/FULL mode; files and
// sensitive report JSON are encrypted with an operator-supplied key. Back up
// both the database (using SQLite's online backup) and the objects directory.
import Database from 'better-sqlite3';
import {mkdirSync,chmodSync,renameSync,rmSync,openSync,fsyncSync,closeSync} from 'node:fs';
import path from 'node:path';
import {seal,unseal,hashToken,opaqueToken,passwordHash,passwordMatches,verifyTotp,fromBase32,base32} from './central-crypto.mjs';
import {randomBytes} from 'node:crypto';

const MAX_PAGE=50,SESSION_ABSOLUTE_MS=8*60*60*1000,SESSION_IDLE_MS=30*60*1000;
function syncDirectory(directory){
 const fd=openSync(directory,'r');try{fsyncSync(fd)}finally{closeSync(fd)}
}
export class CentralStore{
 constructor(directory,key){
  if(!path.isAbsolute(directory||''))throw new Error('CENTRAL_DATA_DIR must be an absolute path outside the web root');
  this.directory=path.resolve(directory);this.key=key;
  this.incoming=path.join(this.directory,'incoming');this.objects=path.join(this.directory,'objects');
  for(const dir of [this.directory,this.incoming,this.objects]){mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700)}
  const dbPath=path.join(this.directory,'reports.sqlite3');this.db=new Database(dbPath);chmodSync(dbPath,0o600);
  this.db.pragma('journal_mode = WAL');this.db.pragma('synchronous = FULL');this.db.pragma('foreign_keys = ON');this.db.pragma('busy_timeout = 5000');
  const version=this.db.pragma('user_version',{simple:true});if(version>1)throw new Error('Database schema is newer than this service');
  if(version===0)this.db.transaction(()=>{this.db.exec(`
   CREATE TABLE reports(id TEXT PRIMARY KEY, owner TEXT NOT NULL, submission_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
     created INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', payload BLOB NOT NULL, UNIQUE(owner,submission_key));
   CREATE INDEX reports_created ON reports(created DESC,id DESC);
   CREATE TABLE attachments(report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE, idx INTEGER NOT NULL,
     name BLOB NOT NULL, size INTEGER NOT NULL, iv BLOB NOT NULL, tag BLOB NOT NULL, digest TEXT NOT NULL,
     PRIMARY KEY(report_id,idx));
   CREATE TABLE staff(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, role TEXT NOT NULL,
     salt BLOB NOT NULL, password BLOB NOT NULL, totp BLOB NOT NULL, last_totp INTEGER NOT NULL DEFAULT -1,
     disabled INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
   CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
     csrf BLOB NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL);
   CREATE INDEX sessions_staff ON sessions(staff_id);
   CREATE TABLE audit(id INTEGER PRIMARY KEY, time INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, report_id TEXT);
   CREATE TABLE metadata(name TEXT PRIMARY KEY, value BLOB NOT NULL);
   PRAGMA user_version=1;`);})();
  this.db.exec('CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY, value BLOB NOT NULL)');
  const check=this.db.prepare("SELECT value FROM metadata WHERE name='key_check'").get();
  if(check){
   try{if(unseal(this.key,check.value,'key-check').toString('utf8')!=='ravi-central-key-v1')throw new Error('wrong key')}
   catch{this.db.close();throw new Error('CENTRAL_DATA_KEY does not match the existing database')}
  }else{
   const existing=this.db.prepare('SELECT (SELECT count(*) FROM reports)+(SELECT count(*) FROM staff) AS n').get().n;
   if(existing){this.db.close();throw new Error('Existing central database has no key check; do not start with an unverified key')}
   this.db.prepare("INSERT INTO metadata(name,value) VALUES('key_check',?)").run(seal(this.key,Buffer.from('ravi-central-key-v1'),'key-check'));
  }
 }
 close(){this.db.close()}
 audit(actor,action,id=null){this.db.prepare('INSERT INTO audit(time,actor,action,report_id) VALUES(?,?,?,?)').run(Date.now(),actor,action,id)}
 listAudit(before=Number.MAX_SAFE_INTEGER){return this.db.prepare('SELECT id,time,actor,action,report_id FROM audit WHERE id<? ORDER BY id DESC LIMIT 50').all(before)}
 findSubmission(owner,key){return this.db.prepare('SELECT id,fingerprint FROM reports WHERE owner=? AND submission_key=?').get(owner,key)}
 status(owner,key){const row=this.findSubmission(owner,key);return row?{id:row.id}:null}
 commit({id,owner,key,fingerprint,report,files,tempDir,verifiedBaleId}){
  if(!/^\d{1,24}$/.test(String(verifiedBaleId||''))||/^0+$/.test(String(verifiedBaleId)))throw new Error('invalid verified Bale identity');
  const existing=this.findSubmission(owner,key);
  if(existing){rmSync(tempDir,{recursive:true,force:true});return existing.fingerprint===fingerprint?{id:existing.id,duplicate:true}:{conflict:true}}
  const final=path.join(this.objects,id);
  if(!/^RV-[A-F0-9]{32}$/.test(id))throw new Error('invalid internal id');
  // Same filesystem rename is atomic. If the process stops between rename and
  // commit an encrypted orphan may remain; it is never exposed by the API.
  renameSync(tempDir,final);
  try{
   // Persist file names and the atomic move before SQLite can acknowledge the
   // report. An interrupted transaction can leave an encrypted orphan, not a
   // committed row whose object directory was never synced.
   syncDirectory(final);syncDirectory(this.objects);syncDirectory(this.incoming);
   // The verified account ID is injected by the server, never trusted from the
   // submitted JSON. It is encrypted with the rest of the report.
   const created=Date.now(),payload=seal(this.key,Buffer.from(JSON.stringify({...report,verifiedBaleId:String(verifiedBaleId)})),`report:${id}`);
   this.db.transaction(()=>{
    this.db.prepare('INSERT INTO reports(id,owner,submission_key,fingerprint,created,payload) VALUES(?,?,?,?,?,?)').run(id,owner,key,fingerprint,created,payload);
    const insert=this.db.prepare('INSERT INTO attachments(report_id,idx,name,size,iv,tag,digest) VALUES(?,?,?,?,?,?,?)');
    files.forEach((f,idx)=>insert.run(id,idx,seal(this.key,Buffer.from(f.name),`file:${id}:${idx}:name`),f.size,f.iv,f.tag,f.digest));
    this.audit('reporter','report_received',id);
   })();
   return {id,duplicate:false};
  }catch(error){rmSync(final,{recursive:true,force:true});throw error}
 }
 listReports({before=Number.MAX_SAFE_INTEGER,limit=25}={}){
  const n=Math.max(1,Math.min(MAX_PAGE,Number(limit)||25));
  return this.db.prepare('SELECT rowid AS cursor,id,created,status,payload FROM reports WHERE rowid<? ORDER BY rowid DESC LIMIT ?').all(before,n).map(row=>{
   const report=JSON.parse(unseal(this.key,row.payload,`report:${row.id}`).toString('utf8'));
   return {id:row.id,cursor:row.cursor,created:row.created,status:row.status,title:String(report.title||'گزارش').slice(0,200)};
  });
 }
 getReport(id){
  const row=this.db.prepare('SELECT id,created,status,payload FROM reports WHERE id=?').get(id);if(!row)return null;
  const report=JSON.parse(unseal(this.key,row.payload,`report:${id}`).toString('utf8'));
  const files=this.db.prepare('SELECT idx,name,size FROM attachments WHERE report_id=? ORDER BY idx').all(id).map(f=>({index:f.idx,name:unseal(this.key,f.name,`file:${id}:${f.idx}:name`).toString('utf8'),size:f.size}));
  return {id,created:row.created,status:row.status,report,files};
 }
 getAttachment(id,index){
  const file=this.db.prepare('SELECT idx,name,size,iv,tag,digest FROM attachments WHERE report_id=? AND idx=?').get(id,index);if(!file)return null;
  return {...file,name:unseal(this.key,file.name,`file:${id}:${index}:name`).toString('utf8'),path:path.join(this.objects,id,`${index}.bin`)};
 }
 changeStatus(id,status,actor){
  if(!['new','in_review','closed'].includes(status))return false;
  return this.db.transaction(()=>{
   const change=this.db.prepare('UPDATE reports SET status=? WHERE id=?').run(status,id);
   if(change.changes)this.audit(actor,'status_'+status,id);return Boolean(change.changes);
  })();
 }
 async addStaff(username,password,role='reviewer'){
  if(!/^[a-z][a-z0-9._-]{2,63}$/.test(username))throw new Error('username must be 3-64 lowercase ASCII characters');
  if(!['reviewer','admin'].includes(role))throw new Error('invalid role');
  if(typeof password!=='string'||password.length<14||password.length>256)throw new Error('password must be 14-256 characters');
  const {salt,hash}=await passwordHash(password),secret=randomBytes(20),encoded=base32(secret);
  const totp=seal(this.key,secret,`staff:${username}:totp`);
  this.db.transaction(()=>{
   this.db.prepare('INSERT INTO staff(username,role,salt,password,totp,created) VALUES(?,?,?,?,?,?)').run(username,role,salt,hash,totp,Date.now());
   this.audit(username,'account_created');
  })();return encoded;
 }
 async resetStaff(username,password){
  if(typeof password!=='string'||password.length<14||password.length>256)throw new Error('password must be 14-256 characters');
  const staff=this.db.prepare('SELECT id FROM staff WHERE username=?').get(username);if(!staff)throw new Error('Account not found');
  const {salt,hash}=await passwordHash(password),secret=randomBytes(20),encoded=base32(secret);
  this.db.transaction(()=>{
   this.db.prepare('UPDATE staff SET salt=?,password=?,totp=?,last_totp=-1,disabled=0 WHERE id=?').run(salt,hash,seal(this.key,secret,`staff:${username}:totp`),staff.id);
   this.db.prepare('DELETE FROM sessions WHERE staff_id=?').run(staff.id);this.audit(username,'account_reset');
  })();
  return encoded;
 }
 disableStaff(username){return this.db.transaction(()=>{
  const staff=this.db.prepare('SELECT id FROM staff WHERE username=?').get(username);if(!staff)return false;
  this.db.prepare('UPDATE staff SET disabled=1 WHERE id=?').run(staff.id);
  this.db.prepare('DELETE FROM sessions WHERE staff_id=?').run(staff.id);this.audit(username,'account_disabled');return true;
 })()}
 async authenticate(username,password,otp,{now=Date.now()}={}){
  const staff=this.db.prepare('SELECT * FROM staff WHERE username=?').get(String(username));
  // Use the same expensive KDF for unknown users to reduce enumeration timing.
  const fakeSalt=Buffer.alloc(16),fakeHash=Buffer.alloc(32);
  const correct=await passwordMatches(password,staff?.salt||fakeSalt,staff?.password||fakeHash);
  if(!staff||staff.disabled||!correct)return null;
  let secret;try{secret=unseal(this.key,staff.totp,`staff:${staff.username}:totp`)}catch{return null}
  const step=verifyTotp(secret,otp,{now,lastStep:staff.last_totp});if(step===null)return null;
  return this.db.transaction(()=>{
   // A password reset can complete while the expensive asynchronous scrypt
   // check is in flight. Recheck the credential material inside the same
   // transaction before issuing a session, so an old login cannot survive it.
   const used=this.db.prepare('UPDATE staff SET last_totp=? WHERE id=? AND disabled=0 AND last_totp<? AND salt=? AND password=? AND totp=?').run(step,staff.id,step,staff.salt,staff.password,staff.totp);
   if(!used.changes)return null;
   const token=opaqueToken(),csrf=opaqueToken(),tokenHash=hashToken(token);
   this.db.prepare('INSERT INTO sessions(token_hash,staff_id,csrf,created,seen) VALUES(?,?,?,?,?)').run(tokenHash,staff.id,seal(this.key,Buffer.from(csrf),`session:${tokenHash}`),now,now);
   this.audit(staff.username,'login');return {token,csrf,username:staff.username,role:staff.role};
  })();
 }
 session(token,{now=Date.now()}={}){
  if(!/^[A-Za-z0-9_-]{43}$/.test(String(token||'')))return null;
  const tokenHash=hashToken(token);
  const row=this.db.prepare('SELECT s.token_hash,s.csrf,s.created,s.seen,u.username,u.role,u.disabled FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE s.token_hash=?').get(tokenHash);
  if(!row)return null;
  if(row.disabled||now-row.created>SESSION_ABSOLUTE_MS||now-row.seen>SESSION_IDLE_MS){this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);return null}
  this.db.prepare('UPDATE sessions SET seen=? WHERE token_hash=?').run(now,tokenHash);
  let csrf;try{csrf=unseal(this.key,row.csrf,`session:${tokenHash}`).toString('utf8')}catch{return null}
  return {tokenHash,csrf,username:row.username,role:row.role};
 }
 logout(session){this.db.transaction(()=>{this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.tokenHash);this.audit(session.username,'logout')})()}
}
