import {readFileSync} from 'node:fs';
import path from 'node:path';
// Prefer root-managed credential files or systemd credentials over putting
// secrets in shell commands or the web root. Never echo the values.
export function loadCentralEnv(source=process.env){
 const env={...source};
 for(const name of ['BALE_BOT_TOKEN','CENTRAL_DATA_KEY']){
  const file=env[`${name}_FILE`];if(!file)continue;
  if(env[name])throw new Error(`Set either ${name} or ${name}_FILE, not both`);
  if(!path.isAbsolute(file))throw new Error(`${name}_FILE must be an absolute path`);
  const value=readFileSync(file,'utf8').trim();if(!value)throw new Error(`${name}_FILE is empty`);env[name]=value;
 }
 return env;
}
