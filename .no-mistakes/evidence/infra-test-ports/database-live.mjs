import './neon-local.mjs';
import assert from 'node:assert/strict';
import {Pool} from '@neondatabase/serverless';
import {openPostgres} from '../packages/adapters/src/neon/postgres.ts';
import {spawn} from 'node:child_process';
const url='postgresql://localtest@localhost:45432/test_gate';
const pool=new Pool({connectionString:url});
const c=await pool.connect();
const a=openPostgres(url), b=openPostgres(url);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
 await a.migrate();
 await c.query('SELECT pg_advisory_lock(1952804467,1)');
 await Promise.race([a.migrate(),delay(2000).then(()=>{throw Error('Current migration blocked on exclusive lock')})]);
 console.log('Current schema migration completed while another session held the exclusive global lock.');
 await c.query('SELECT pg_advisory_unlock(1952804467,1)');
 await c.query(`CREATE TABLE test_ddl_audit(command text)`);
 await c.query(`CREATE FUNCTION test_audit() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO test_ddl_audit VALUES (tg_tag); END $$`);
 await c.query(`CREATE EVENT TRIGGER test_audit_trigger ON ddl_command_end EXECUTE FUNCTION test_audit()`);
 await c.query(`COMMENT ON TABLE accounts IS 'stale'`);
 await c.query('TRUNCATE test_ddl_audit');
 await c.query('SELECT pg_advisory_lock_shared(1952804467,1)');
 let done=0;
 const jobs=[a.migrate().then(()=>done++),b.migrate().then(()=>done++)];
 const deadline=Date.now()+5000;
 for(;;){
 const r=await c.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=1952804467 AND NOT granted");
 if(r.rows[0].n===2)break;
 assert(Date.now()<deadline,'both stale migrators must wait'); await delay(20);
 }
 assert.equal(done,0); console.log('Both stale migrators waited behind the shared writer lock.');
 await c.query('SELECT pg_advisory_unlock_shared(1952804467,1)');
 await Promise.all(jobs);
 const counts=await c.query('SELECT command,count(*)::int n FROM test_ddl_audit GROUP BY command ORDER BY command');
 const comments=counts.rows.filter(r=>r.command==='COMMENT');
 assert.equal(comments.length,1); assert.equal(comments[0].n,1);
 console.log('After release both migrations completed; DDL audit contains exactly one revision COMMENT: '+JSON.stringify(counts.rows));
 console.log('The losing migrator re-read the revision and did not replay the schema.');
 await c.query('DROP EVENT TRIGGER test_audit_trigger'); await c.query('DROP FUNCTION test_audit()'); await c.query('DROP TABLE test_ddl_audit');
 const runLane=(mode,label,duration)=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/with-db-lane.mjs',mode,'--',process.execPath,'-e',`console.log('${label} entered '+Date.now());setTimeout(()=>console.log('${label} exited '+Date.now()),${duration})`],{env:{...process.env,TEST_DATABASE_URL:url,NODE_OPTIONS:`--import=${process.cwd()}/.local-test/neon-local.mjs`}});
 let out='';child.stdout.on('data',d=>{out+=d;process.stdout.write(d)});child.stderr.on('data',d=>process.stderr.write(d));
 child.on('exit',code=>code===0?resolve(out):reject(Error('lane exit '+code)));
 });
 const x=runLane('shared','browser-A',1500), y=runLane('shared','browser-B',1500);
 await delay(400);
 const z=runLane('exclusive','global-lock-tests',50);
 const [xo,yo,zo]=await Promise.all([x,y,z]);
 const stamp=(out,word)=>Number(out.match(new RegExp(word+' (\\d+)'))[1]);
 assert(stamp(xo,'entered')<stamp(yo,'exited'));assert(stamp(yo,'entered')<stamp(xo,'exited'));
 assert(stamp(zo,'entered')>=Math.max(stamp(xo,'exited'),stamp(yo,'exited')));
 console.log('Shared browser lanes overlapped; exclusive global-lock lane entered after both exited.');
}finally{await c.query('SELECT pg_advisory_unlock_all()');c.release();await Promise.all([pool.end(),a.close(),b.close()])}
