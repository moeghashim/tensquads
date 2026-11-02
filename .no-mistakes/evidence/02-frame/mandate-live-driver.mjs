import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { createRepositories, schema, saveWorkspace } from '@tensquads/adapters';
import { openPostgres, migrationStatements } from '../packages/adapters/src/neon/postgres.ts';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
import { bridge, connection } from './neon-local.mjs';

function errorText(e) { return e ? `${e.message ?? ''}\n${errorText(e.cause)}` : ''; }
async function run(label, db, migrate, close) {
  const rows = async text => (await db.execute(sql.raw(text))).rows;
  const state = () => rows("SELECT * FROM mandates ORDER BY account_id, approval_id");
  async function blocked(statement) {
    const before = await state();
    await assert.rejects(() => db.execute(sql.raw(statement)), e => {
      const text=errorText(e); assert.ok(text.includes('A Mandate never changes.'),text);
      console.log(`${label}: ${statement} -> A Mandate never changes.`); return true;
    });
    assert.deepEqual(await state(),before);
  }
  try {
    console.log(`\n=== ${label} ===`);
    await migrate();
    await db.execute(sql.raw('ALTER TABLE approvals DROP CONSTRAINT approvals_account_id_fkey'));
    await db.execute(sql.raw('ALTER TABLE approvals ADD CONSTRAINT approvals_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id)'));
    await migrate(); await migrate();
    assert.equal((await rows("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='mandates_never_change' AND NOT tgisinternal"))[0].n,1);
    assert.equal((await rows("SELECT confdeltype FROM pg_constraint WHERE conname='approvals_account_id_fkey'"))[0].confdeltype,'c');
    console.log(`${label}: empty migration, legacy FK upgrade and repeat -> one trigger; approvals account FK cascades`);
    await db.execute(sql.raw("INSERT INTO accounts (id, account_id, name, owner, email, tint, agents, online, tasks, last_active, created_week, mission, sort_order) VALUES ('isolated','isolated','Test','Test','test@example.invalid','#fff',0,0,0,'',0,'',0)"));
    await db.execute(sql.raw("INSERT INTO approvals (account_id,id,agent,title,detail,amount,status,sort_order) VALUES ('isolated','approved','test','Test','','','Approved',0)"));
    await db.execute(sql.raw("INSERT INTO rules (account_id,id,rule_when,agent,action,approval,is_on,sort_order) VALUES ('isolated','rule','when','test','action','yes',true,0)"));
    const scope = {accountId:'isolated', mode:'account'};
    const policy = createRepositories(db).policy;
    const draft = {approvalId:'approved',ruleId:'rule',limitValue:40,policyVersion:'v1',saidYes:'tester',at:new Date('2026-11-02T12:00:00Z')};
    await policy.createMandate(scope,draft);
    console.log(`${label}: repository createMandate -> ${JSON.stringify(await state())}`);
    for (const [column,value] of Object.entries({account_id:"'other'",approval_id:"'other'",rule_id:"'other'",rule_when:"'other'",rule_action:"'other'",rule_approval:"'other'",limit_value:'999',policy_version:"'v2'",said_yes:"'other'",said_at:"'2020-01-01'"})) {
      await blocked(`UPDATE mandates SET ${column}=${value} WHERE account_id='isolated'`);
    }
    await blocked("UPDATE mandates SET limit_value=limit_value WHERE account_id='isolated'");
    await blocked("DELETE FROM mandates WHERE account_id='isolated'");
    await blocked("DELETE FROM approvals WHERE account_id='isolated'");
    assert.equal((await rows("SELECT count(*)::int AS n FROM approvals WHERE account_id='isolated'"))[0].n,1);
    const before=await state();
    await assert.rejects(() => policy.createMandate(scope,{...draft, limitValue:999}), /exactly one Mandate/);
    assert.deepEqual(await state(),before);
    console.log(`${label}: replacement Mandate refused; original limit remains 40; approval remains after blocked cascade`);
    await db.execute(sql.raw("DELETE FROM rules WHERE account_id='isolated'"));
    await db.execute(sql.raw("DELETE FROM accounts WHERE id='isolated'"));
    assert.equal((await state()).length,0);
    assert.equal((await rows('SELECT * FROM approvals')).length,0);
    console.log(`${label}: DELETE account -> account, approval and mandate removed by cascade`);

    await replaceDemoAccount(db,'reset-fixture','isolated-clerk');
    const fixturePolicy=createRepositories(db).policy;
    const resetScope={accountId:'reset-fixture',mode:'account'};
    const pending=(await fixturePolicy.listApprovals(resetScope))[0];
    const rule=(await fixturePolicy.listRules(resetScope))[0];
    await db.execute(sql.raw(`UPDATE approvals SET status='Approved' WHERE account_id='reset-fixture' AND id='${pending.id}'`));
    await fixturePolicy.createMandate(resetScope,{...draft,approvalId:pending.id,ruleId:rule.id});
    await replaceDemoAccount(db,'reset-fixture','isolated-clerk');
    assert.equal((await state()).length,0);
    assert.equal((await rows("SELECT count(*)::int AS n FROM accounts WHERE id='reset-fixture'"))[0].n,1);
    console.log(`${label}: replaceDemoAccount with existing Mandate -> one fresh account; zero old mandates`);
    await db.execute(sql.raw(`UPDATE approvals SET status='Approved' WHERE account_id='reset-fixture' AND id='${pending.id}'`));
    await fixturePolicy.createMandate(resetScope,{...draft,approvalId:pending.id,ruleId:rule.id});
    await saveWorkspace(db,{accounts:[],images:[],plans:[]});
    assert.equal((await state()).length,0);
    assert.equal((await rows('SELECT * FROM accounts')).length,0);
    assert.equal((await rows('SELECT * FROM approvals')).length,0);
    console.log(`${label}: saveWorkspace(empty disposable snapshot) with Mandate -> all account rows removed through cascade`);
  } finally { await close(); }
}
try {
  assert.equal(migrationSql,readFileSync('packages/adapters/src/neon/migration.sql','utf8'));
  console.log('Bundled migration equals migration.sql byte for byte.');
  const pglite=new PGlite();
  await run('PGlite',drizzle(pglite,{schema}),async()=>{for(const statement of migrationStatements(migrationSql))await pglite.exec(statement);},()=>pglite.close());
  const pg=openPostgres(connection);
  await run('Postgres 18 via Neon serverless driver',pg.db,pg.migrate,pg.close);
  console.log('\nAll live database scenarios passed. No shared services or production databases used.');
} finally { await new Promise(resolve=>bridge.close(resolve)); }
