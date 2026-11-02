import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { createRepositories, saveWorkspace, schema } from '@tensquads/adapters';
import { openPostgres, migrationStatements } from '../packages/adapters/src/neon/postgres.ts';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
import './config.mjs';
const client=new PGlite();
for(const engine of ['PGlite','Postgres via Neon driver']) {
 const pg=engine==='PGlite'?null:openPostgres(process.env.TEST_DATABASE_URL!);
 const db=pg?.db??drizzle(client,{schema});
 const migrate=pg?pg.migrate:async()=>{for(const s of migrationStatements(migrationSql))await client.exec(s)};
 const run=async(q:string)=>{const r:any=await db.execute(sql.raw(q));return Array.isArray(r)?r:r.rows};
 const state=()=>run("SELECT account_id,approval_id,limit_value,policy_version FROM mandates WHERE account_id='live-account'");
 console.log('\nENGINE:',engine);
 try {
 await migrate();
 await run("ALTER TABLE approvals DROP CONSTRAINT approvals_account_id_fkey");
 await run("ALTER TABLE approvals ADD CONSTRAINT approvals_account_id_fkey FOREIGN KEY(account_id) REFERENCES accounts(id)");
 await run("INSERT INTO accounts VALUES ('live-account','live-account','Test','Test','test@example.invalid',NULL,'#fff',0,0,0,'now',0,'test',0)");
 await run("INSERT INTO approvals VALUES ('live-account','approved','test','Test','Test','0','Approved',0)");
 await run("INSERT INTO rules VALUES ('live-account','rule','test','test','test','test',true,0)");
 const scope={accountId:'live-account',mode:'account' as const};
 const policy=createRepositories(db).policy;
 const draft={approvalId:'approved',ruleId:'rule',limitValue:40,policyVersion:'policy-1',saidYes:'owner',at:new Date()};
 await policy.createMandate(scope,draft);
 const before=await state();
 await migrate(); await migrate();
 const triggers=await run("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='mandates_never_change' AND NOT tgisinternal");
 assert.equal(triggers[0].n,1);
 console.log('Repeat migration with existing account and Mandate: trigger count',triggers[0].n);
 const fk=await run("SELECT confdeltype FROM pg_constraint WHERE conname='approvals_account_id_fkey'");
 assert.equal(fk[0].confdeltype,'c'); console.log('Existing approvals foreign key upgraded to cascade:',fk);
 for(const q of [
 "UPDATE mandates SET limit_value=999 WHERE account_id='live-account'",
 "UPDATE mandates SET limit_value=limit_value WHERE account_id='live-account'",
 "DELETE FROM mandates WHERE account_id='live-account'",
 "DELETE FROM approvals WHERE account_id='live-account'",
 "INSERT INTO mandates SELECT * FROM mandates WHERE account_id='live-account' ON CONFLICT(account_id,approval_id) DO UPDATE SET limit_value=999"
 ]) {
 let error:any;try{await run(q)}catch(e){error=e}
 assert.ok(error,'SQL must be refused');
 const texts=[];for(let e=error;e;e=e.cause)texts.push(e.message);
 assert.ok(texts.some(t=>t.includes('A Mandate never changes.')));
 assert.deepEqual(await state(),before);
 console.log(q,'=> A Mandate never changes.; persisted:',JSON.stringify(await state()));
 }
 await assert.rejects(()=>policy.createMandate(scope,draft),/exactly one Mandate/);
 console.log('Repository replacement attempt => An Approval holds exactly one Mandate.');
 await run("DELETE FROM rules WHERE account_id='live-account'");
 await run("DELETE FROM accounts WHERE id='live-account'");
 assert.deepEqual(await state(),[]);
 assert.deepEqual(await run("SELECT id FROM approvals WHERE account_id='live-account'"),[]);
 console.log('DELETE account => account, approval and Mandate removed through cascade.');
 await run("INSERT INTO accounts VALUES ('live-account','live-account','Test','Test','test@example.invalid',NULL,'#fff',0,0,0,'now',0,'test',0)");
 await run("INSERT INTO approvals VALUES ('live-account','approved','test','Test','Test','0','Approved',0)");
 await run("INSERT INTO mandates VALUES ('live-account','approved','rule','test','test','test',40,'p1','owner',now())");
 await saveWorkspace(db,{accounts:[],images:[],plans:[]});
 assert.deepEqual(await state(),[]);
 console.log('saveWorkspace(empty disposable snapshot) => account cascade clears Mandate successfully.');
 }finally{if(pg)await pg.close()}
}
await client.close();
