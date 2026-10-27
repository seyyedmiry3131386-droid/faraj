// Check all shipped JavaScript, including the Node-only central service and
// browser modules. Parsing does not execute the files or start a server.
import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const dirs=['.','public','scripts','evaluation'];
let count=0;
for(const dir of dirs){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(!entry.isFile()||!(/\.(?:mjs|js)$/.test(entry.name)))continue;
  const file=path.join(dir,entry.name),result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
  count++;
 }
}
console.log(`Syntax checked ${count} JavaScript files.`);
