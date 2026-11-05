import './transport.mjs';
import assert from 'node:assert/strict';
import { Pool } from '@neondatabase/serverless';
import { openPostgres, migrationRevision } from '../packages/adapters/src/neon/postgres.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
import { createRepositories } from '@tensquads/adapters';
import { Kernel } from '@tensquads/kernel';
import { deleteWorkspaceAccount } from '../e2e/workspace.ts';
const url = 'postgresql://validator@127.0.0.1:55439/ci_local_validation?sslmode=disable';
process.env.TEST_DATABASE_URL = url;
const first = openPostgres(url), second = openPostgres(url);
const pool = new Pool({connectionString:url});
const observer = await pool.connect();
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise, ms=3000) {
 let timer;
 try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Operation blocked')),ms);})]); }
 finally {clearTimeout(timer);}
}
async function waiting() {
 for(let n=0;n<100;n++) {
  const rows=await pool.query("SELECT classid::text, mode, granted FROM pg_locks WHERE locktype='advisory' AND NOT granted");
  if(rows.rows.some(row=>row.classid==='1952804468')) return rows.rows;
  await delay(20);
 }
 throw new Error('No blocked account lock observed');
}
try {
 await Promise.all([first.migrate(),second.migrate()]);
 let rows=await pool.query('SELECT version FROM schema_revision WHERE id=1');
 assert.equal(rows.rows[0].version,migrationRevision);
 await replaceDemoAccount(first.db,'live-a','local-clerk-a');
 await replaceDemoAccount(second.db,'live-b','local-clerk-b');
 console.log(JSON.stringify({scenario:'Concurrent first migrations',revision:rows.rows[0].version,accounts:(await pool.query('SELECT id FROM accounts ORDER BY id')).rows}));
 await observer.query('BEGIN');
 await observer.query('SELECT pg_advisory_xact_lock(1952804467,1)');
 const started=Date.now();
 await bounded(first.migrate());
 console.log(JSON.stringify({scenario:'Current migration bypasses held exclusive maintenance lock',elapsedMs:Date.now()-started,exclusiveLockStillHeld:true}));
 await observer.query('ROLLBACK');
 await observer.query('BEGIN');
 await observer.query("SELECT pg_advisory_xact_lock(1952804468,hashtext('live-a'))");
 let resetDone=false;
 const reset=replaceDemoAccount(first.db,'live-a','local-clerk-a').then(()=>{resetDone=true;});
 const locks=await waiting();
 const kernel = new Kernel(createRepositories(second.db));
 const result = await bounded(kernel.setAgentOn({accountId:'live-b',mode:'account'},'support',false,{tab:'local-validation',seq:1},Date.now()+30000));
 const stored=await pool.query("SELECT is_on FROM agents WHERE account_id='live-b' AND id='support'");
 assert.equal(result.status,'written'); assert.equal(stored.rows[0].is_on,false); assert.equal(resetDone,false);
 await bounded(deleteWorkspaceAccount('live-b'));
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM accounts WHERE id='live-b'")).rows[0].n,0);
 console.log(JSON.stringify({scenario:'Account A reset waits on its fence while account B writes and cleanup finish',waitingLocks:locks,resetDone,otherAccountWrite:result.status,storedSupportOn:stored.rows[0].is_on,deletedAccountB:true}));
 await observer.query('ROLLBACK'); await reset;
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM accounts WHERE id='live-a'")).rows[0].n,1);
 await observer.query('BEGIN');
 await observer.query("SELECT pg_advisory_xact_lock(1952804468,hashtext('live-a'))");
 let deleted=false; const removal=deleteWorkspaceAccount('live-a').then(()=>{deleted=true;});
 await waiting(); assert.equal(deleted,false);
 await observer.query('ROLLBACK'); await removal;
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,0);
 console.log(JSON.stringify({scenario:'Same-account cleanup waits for writer and deletes after release',blockedBeforeRelease:true,accountsRemaining:0}));
 await pool.query("UPDATE schema_revision SET version='stale' WHERE id=1");
 await pool.query('ALTER TABLE accounts DROP COLUMN sort_order');
 await pool.query("CREATE FUNCTION reject_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected revision failure'; END $$");
 await pool.query('CREATE TRIGGER fail_revision BEFORE UPDATE ON schema_revision FOR EACH ROW EXECUTE FUNCTION reject_revision()');
 await assert.rejects(first.migrate(),/injected revision failure/);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='accounts' AND column_name='sort_order'")).rows[0].n,0);
 assert.equal((await pool.query('SELECT version FROM schema_revision')).rows[0].version,'stale');
 await pool.query('DROP TRIGGER fail_revision ON schema_revision');
 await Promise.all([first.migrate(),second.migrate()]);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='accounts' AND column_name='sort_order'")).rows[0].n,1);
 assert.equal((await pool.query('SELECT version FROM schema_revision')).rows[0].version,migrationRevision);
 console.log(JSON.stringify({scenario:'Failed stale migration rolls back DDL; concurrent retry repairs schema and records revision',failedRevision:'stale',columnAbsentAfterFailure:true,columnRestoredOnRetry:true,revision:migrationRevision}));
} finally {
 await observer.query('ROLLBACK').catch(()=>{});observer.release();
 await Promise.all([first.close(),second.close(),pool.end()]);
}
