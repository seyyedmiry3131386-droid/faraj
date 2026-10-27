import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
await cp('public','dist/client',{recursive:true});
await cp('worker.js','dist/server/index.js');
await cp('llm.js','dist/server/llm.js');
// The worker shares the guide, its rules, and their dependencies with the
// browser. Copy the entire module tree so deployed builds cannot miss imports.
await cp('public','dist/server/public',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'ravi-assistant',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*']}},null,2));
console.log('Built static assets and server Worker.');
