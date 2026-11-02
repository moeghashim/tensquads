import { openPglite } from '../packages/adapters/test/pglite.ts';
import { saveWorkspace, readWorkspaceFrame, createRepositories } from '@tensquads/adapters';
import { workspaceFromDesign } from '../packages/seed/src/index.ts';
import { Kernel } from '@tensquads/kernel';
let scope = { accountId: 'demo', mode: 'account' as const };
const ready = (async () => { const opened = await openPglite(); await saveWorkspace(opened.db, workspaceFromDesign()); return opened; })();
export async function requireWorkspace(work) { return work(scope, (await ready).db); }
export const readFrame = readWorkspaceFrame;
export async function sendWorkspace(method, data) { return requireWorkspace((scope, db) => new Kernel(createRepositories(db))[method](scope,data)); }
export async function control(action, id) {
 const {db} = await ready;
 if (action === 'reset') { scope={accountId:'demo',mode:'account'}; await saveWorkspace(db,workspaceFromDesign()); }
 if (action === 'no-store') scope={accountId:'leen',mode:'account'};
 if (action === 'empty-mission') await db.execute("update mission_proposals set mission = '' where account_id = 'demo'");
 if (action === 'no-rule') await db.execute("delete from rules where account_id = 'demo' and agent = 'support'");
 if(action==='events') { const r=await db.execute("select * from bus_events where account_id='demo' and id ~ '^e[0-9]+$' order by seq"); return r.rows; }
 if(action==='agent') { const r=await db.execute("select * from agents where account_id='demo' and id='"+id+"'"); return r.rows[0]; }
 if(action==='mandate') {
 const {schema} = await import('@tensquads/adapters'); const {eq,and,asc} = await import('drizzle-orm'); const {policyVersion} = await import('@tensquads/domain');
 const rows=await db.select().from(schema.mandates).where(and(eq(schema.mandates.accountId,'demo'),eq(schema.mandates.approvalId,id)));
 const rules=await db.select().from(schema.rules).where(eq(schema.rules.accountId,'demo')).orderBy(asc(schema.rules.sortOrder));
 return {row:rows[0]??null, version:policyVersion(rules.map(r=>({id:r.id,when:r.ruleWhen,agent:r.agent,action:r.action,approval:r.approval,on:r.isOn})))};
 }
 const result = await db.execute("select (select count(*) from mandates where account_id='demo') as mandates, (select count(*) from approvals where account_id='demo' and status='Pending') as pending");
 return result;
}
