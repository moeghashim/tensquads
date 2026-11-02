import './neon.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {openPostgres,createRepositories,saveWorkspace,schema,workspaceTransaction} from '@tensquads/adapters';
import {workspaceFromDesign,replaceDemoAccount} from '../packages/seed/src/index.ts';
import {chatTrigger,evalChatTrigger} from '@tensquads/domain';
import {eq,and,sql} from 'drizzle-orm';
const admin=new pg.Client({connectionString:'postgres://phase_user:phase_password@127.0.0.1:55439/postgres'});await admin.connect();await admin.query('CREATE DATABASE phase_policy');await admin.end();
const opened=openPostgres('postgres://phase_user:phase_password@127.0.0.1:55439/phase_policy'),db=opened.db;await opened.migrate();
const out={};
try{
 await saveWorkspace(db,workspaceFromDesign()); const repos=createRepositories(db),scope={accountId:'demo',mode:'account'};
 out.seedTotals=await repos.platform.totals({accountId:'platform',mode:'platform'});
 assert.deepEqual(Object.fromEntries(Object.entries(out.seedTotals).filter(([k])=>['accounts','agents','squads','mrr','allTime','tasksDone','images','openBugs','featuresRequested'].includes(k))),{accounts:9,agents:66,squads:17,mrr:1294,allTime:14568,tasksDone:331,images:7,openBugs:8,featuresRequested:15});
 assert.equal((await db.select().from(schema.mandates)).length,0);out.seedMandates=0;
 const policy=repos.policy,rule=(await policy.listRules(scope))[0],approval=(await policy.listApprovals(scope))[0];
 const draft={approvalId:approval.id,ruleId:rule.id,limitValue:40,policyVersion:'policy-1',saidYes:'owner',at:new Date()};
 const refusal=async()=>{try{await policy.createMandate(scope,draft);throw Error('unexpected creation');}catch(e){assert.match(e.message,/only after a person says yes/);return e.message;}};
 out.pendingRefusal=await refusal();await db.update(schema.approvals).set({status:'Declined'}).where(and(eq(schema.approvals.accountId,'demo'),eq(schema.approvals.id,approval.id)));out.declinedRefusal=await refusal();
 await db.update(schema.approvals).set({status:'Approved'}).where(and(eq(schema.approvals.accountId,'demo'),eq(schema.approvals.id,approval.id)));
 out.made=await policy.createMandate(scope,draft);await db.update(schema.rules).set({action:'changed-after-yes',ruleWhen:'changed-after-yes',approval:'changed-after-yes'}).where(and(eq(schema.rules.accountId,'demo'),eq(schema.rules.id,rule.id)));
 out.readAfterRuleEdit=await policy.mandate(scope,approval.id);assert.deepEqual(out.readAfterRuleEdit,out.made);
 await assert.rejects(()=>policy.createMandate(scope,draft),/exactly one Mandate/);
 assert.equal(await policy.mandate({accountId:'leen',mode:'account'},approval.id),null);out.otherAccountRead=null;
 await replaceDemoAccount(db,'demo','local-owner');assert.equal((await db.select().from(schema.mandates)).length,0);out.afterResetMandates=0;
 out.ownerGate=evalChatTrigger(chatTrigger('demo','ads'),'demo');out.otherOwnerGate=evalChatTrigger(chatTrigger('demo','ads'),'other');assert.deepEqual(out.ownerGate,{gate:true,judgement:null});assert.deepEqual(out.otherOwnerGate,{gate:false,judgement:null});
 const retries=[];
 for(const code of ['40P01','23505','57014','55P03']){let attempts=0;await assert.rejects(()=>workspaceTransaction(db,async tx=>{attempts++;await tx.execute(sql.raw(`DO $$ BEGIN RAISE EXCEPTION 'injected database failure' USING ERRCODE = '${code}'; END $$`));},{deadlineMs:30000}));assert.equal(attempts,code==='40P01'?3:1);retries.push({databaseSQLSTATE:code,attempts});}
 let attempts=0;await assert.rejects(()=>workspaceTransaction(db,async tx=>{attempts++;await new Promise(r=>setTimeout(r,90));await tx.execute(sql.raw("DO $$ BEGIN RAISE EXCEPTION 'deadlock' USING ERRCODE = '40P01'; END $$"));},{deadlineMs:120}),/The workspace write did not finish/);assert.equal(attempts,1);out.retries=retries;out.insufficientRetryBudget={attempts,deadlineMs:120,delayMs:90};
 out.noSendOptions=await workspaceTransaction(db,async tx=>{const r=await tx.execute(sql`SELECT current_setting('lock_timeout') as lock_timeout, current_setting('statement_timeout') as statement_timeout`);return r.rows[0];});assert.deepEqual(out.noSendOptions,{lock_timeout:'0',statement_timeout:'0'});
 out.result='pass';
}finally{await opened.close();await writeFile('/Users/moeghashim/.no-mistakes/evidence/01M6DN54VTEX6MZG45D17D2FEQ/policy-and-retry-state.json',JSON.stringify(out,null,2));}
console.log(JSON.stringify(out,null,2));
