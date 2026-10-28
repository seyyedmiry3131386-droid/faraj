// Local operator-only account management. Passwords are read from stdin, not
// command-line arguments. Keep the TOTP seed secret and enrol it immediately.
import {CentralStore} from './central-store.mjs';
import {dataKey} from './central-crypto.mjs';
import {loadCentralEnv} from './central-config.mjs';

async function readSecret(prompt){
 if(!process.stdin.isTTY){let s='';for await(const chunk of process.stdin)s+=chunk;return s.replace(/\r?\n$/,'')}
 process.stderr.write(prompt);process.stdin.setEncoding('utf8');process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const onData=buf=>{for(const c of buf.toString('utf8')){
  if(c==='\u0003'){cleanup();reject(new Error('cancelled'));return}
  if(c==='\r'||c==='\n'){cleanup();process.stderr.write('\n');resolve(value);return}
  if(c==='\u007f'||c==='\b')value=Array.from(value).slice(0,-1).join('');else if(c>=' '&&value.length<256)value+=c;
 }};const cleanup=()=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause()};process.stdin.on('data',onData)});
}
const [command,rawUser,rawRole]=process.argv.slice(2),username=String(rawUser||'').toLowerCase();
if(!['add','reset','disable','list'].includes(command)){console.error('Usage: node staff-cli.mjs add <username> [reviewer|admin] | reset <username> | disable <username> | list');process.exit(2)}
let store;
try{
 const env=loadCentralEnv(process.env);store=new CentralStore(env.CENTRAL_DATA_DIR,dataKey(env.CENTRAL_DATA_KEY));
 if(command==='add'||command==='reset'){
  const secret=await readSecret('Password (at least 14 characters): ');
  if(process.stdin.isTTY){const again=await readSecret('Repeat password: ');if(secret!==again)throw new Error('Passwords did not match')}
  const seed=command==='add'?await store.addStaff(username,secret,rawRole||'reviewer'):await store.resetStaff(username,secret);
  const uri=`otpauth://totp/${encodeURIComponent('Ravi:'+username)}?secret=${seed}&issuer=Ravi&algorithm=SHA1&digits=6&period=30`;
  console.log('Account created. Enrol this one-time TOTP secret in an authenticator; do not share or log it:');
  console.log(uri);
 }else if(command==='disable'){
  if(!store.disableStaff(username))throw new Error('Account not found');console.log('Account disabled and its sessions revoked.');
 }else{
  for(const row of store.db.prepare('SELECT username,role,disabled,created FROM staff ORDER BY username').all())console.log(`${row.username}\t${row.role}\t${row.disabled?'disabled':'active'}\t${new Date(row.created).toISOString()}`);
 }
}catch(error){console.error(`Account operation failed: ${error.message}`);process.exitCode=1}
finally{store?.close()}
