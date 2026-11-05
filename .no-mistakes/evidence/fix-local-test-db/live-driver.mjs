import assert from 'node:assert/strict';
import { Client } from '@neondatabase/serverless';
import { openPostgres, migrationRevision } from '../packages/adapters/src/neon/postgres.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
import { deleteWorkspaceAccount } from '../e2e/workspace.ts';
const url='postgres://validator:disposable@127.0.0.1:55439/manual';
process.env.TEST_DATABASE_URL=url;
const admin=new Client('postgres://validator:disposable@127.0.0.1:55439/validation');
await admin.connect(); await admin.query('CREATE DATABASE manual'); await admin.end();
const client=new Client(url); await client.connect();
const a=openPostgres(url), b=openPostgres(url);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function bounded(p){return Promise.race([p,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('operation exceeded 5 seconds')),5000); t.unref()})])}
async function revision(){return (await client.query('SELECT version FROM schema_revision WHERE id=1')).rows[0]?.version}
async function waiting(){for(let n=0;n<100;n++){if((await client.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND NOT granted")).rows[0].n>0)return;await delay(20)}throw Error('no lock wait observed')}
try {
 await bounded(Promise.all([a.migrate(),b.migrate()]));
 assert.equal(await revision(),migrationRevision);
 console.log('Concurrent initial migrations: both completed; one current schema_revision persisted:',await revision());
 await replaceDemoAccount(a.db,'live-a','clerk-live-a');
 await replaceDemoAccount(b.db,'live-b','clerk-live-b');
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(1952804467,1)');
 await bounded(b.migrate());
 console.log('Current migration completed while global exclusive lock remained held: no writer blockage.');
 await client.query('ROLLBACK');
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock_shared(1952804467,1), pg_advisory_xact_lock(1952804468,hashtext('live-a'))");
 let resetDone=false;
 const reset=replaceDemoAccount(a.db,'live-a','clerk-live-a').then(()=>{resetDone=true});
 await waiting();
 await bounded(replaceDemoAccount(b.db,'live-b','clerk-live-b'));
 assert.equal(resetDone,false);
 console.log('Reset B completed while reset A waited on its account fence. Persisted accounts:',(await client.query("SELECT id FROM accounts ORDER BY id")).rows);
 await bounded(deleteWorkspaceAccount('live-b'));
 assert.equal(resetDone,false);
 assert.equal((await client.query("SELECT count(*)::int n FROM accounts WHERE id='live-b'")).rows[0].n,0);
 console.log('E2E cleanup B completed while A remained locked; account B removed, account A preserved.');
 await client.query('COMMIT'); await bounded(reset);
 assert.equal((await client.query("SELECT count(*)::int n FROM agents WHERE account_id='live-a'")).rows[0].n,5);
 console.log('Same-account reset completed only after fence release; five agents persisted.');
 await client.query("UPDATE schema_revision SET version='stale' WHERE id=1");
 await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock_shared(1952804467,1)');
 let migrated=false; const migration=b.migrate().then(()=>{migrated=true});
 await waiting(); assert.equal(migrated,false);
 await client.query('COMMIT'); await bounded(migration);
 assert.equal(await revision(),migrationRevision);
 console.log('Stale migration waited for live writer lock, then completed with current revision.');
 await client.query("UPDATE schema_revision SET version='stale' WHERE id=1");
 await client.query("CREATE FUNCTION fail_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disposable migration failure'; END $$");
 await client.query("CREATE EVENT TRIGGER reject_ddl ON ddl_command_start WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION fail_ddl()");
 await assert.rejects(b.migrate(),/disposable migration failure/);
 assert.equal(await revision(),'stale');
 await client.query('DROP EVENT TRIGGER reject_ddl'); await client.query('DROP FUNCTION fail_ddl()');
 await bounded(b.migrate()); assert.equal(await revision(),migrationRevision);
 console.log('Injected database DDL failure rolled migration back, preserved stale revision, released connection; retry succeeded.');
 console.log('Final persisted account/agent state:',(await client.query('SELECT a.id,count(g.id)::int agents FROM accounts a LEFT JOIN agents g ON g.account_id=a.id GROUP BY a.id')).rows);
} finally { await client.query('ROLLBACK').catch(()=>{}); await Promise.all([a.close(),b.close()]); await client.end(); }
