import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { verifyAccount, region, reportError } from './config.js';
import { runMigrations, unlock } from './lib/migrations.js';
try {
  const mode=process.argv[2]||'up';
  if(!['up','status','unlock'].includes(mode))throw new Error('Usage: node migrate.js up|status|unlock');
  await verifyAccount();
  const client=new DynamoDBClient({region});
  if(mode==='unlock') {
    if(process.argv[4]!=='--confirm-stopped')throw new Error('Stop the previous migration process first, then use: npm run db:unlock -- OWNER --confirm-stopped');
    await unlock(client,process.argv[3]);console.log('Lock released.');
  } else {
    const dir=new URL('./migrations/',import.meta.url);
    const files=(await readdir(dir)).filter(f=>/^\d{3}-[a-z0-9-]+\.js$/.test(f)).sort();
    if(new Set(files.map(f=>f.slice(0,3))).size!==files.length)throw new Error('Duplicate migration version.');
    const migrations=[];
    for(const file of files){const url=new URL(file,dir);migrations.push({id:file.slice(0,-3),checksum:createHash('sha256').update(await readFile(url)).digest('hex'),spec:(await import(url)).default});}
    await runMigrations(client,migrations,{status:mode==='status'});
  }
} catch(error){reportError(error);}
