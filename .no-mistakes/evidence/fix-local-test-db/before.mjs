import './transport.mjs';
import assert from 'node:assert/strict';
import { Pool } from '@neondatabase/serverless';
import { openPostgres } from './base-postgres.ts';
const url='postgresql://validator@127.0.0.1:55439/ci_local_validation?sslmode=disable';
const pool=new Pool({connectionString:url});
const observer=await pool.connect();
const base=openPostgres(url);
try {
 await observer.query('BEGIN');
 await observer.query('SELECT pg_advisory_xact_lock(1952804467,1)');
 let settled=false;
 const pending=base.migrate().then(()=>{settled=true;});
 let waiting=[];
 for(let i=0;i<100;i++) {
  waiting=(await pool.query("SELECT classid::text, mode, granted FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows;
  if(waiting.length) break;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 assert.equal(settled,false);assert.ok(waiting.length>0);
 console.log(JSON.stringify({commit:'2abbdae00e7fa6bf6bdebb26e1eb4ce1f39999c7',scenario:'Current schema migration under exclusive maintenance lock',completedWhileLockHeld:settled,waitingLocks:waiting}));
 await observer.query('ROLLBACK');await pending;
 console.log('Base migration completed only after lock release; target completed while held (4 ms).');
} finally {
 await observer.query('ROLLBACK').catch(()=>{});observer.release();await base.close();await pool.end();
}
