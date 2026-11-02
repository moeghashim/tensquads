import { openPglite } from '../packages/adapters/test/pglite.ts';
import { workspaceFromDesign } from '../packages/seed/src/index.ts';
import { saveWorkspace, readWorkspaceFrame, schema } from '@tensquads/adapters';
import { readOverview } from '../apps/web/src/server/overview-read.ts';
import { and, eq } from 'drizzle-orm';
const state = globalThis as any;
state.__overviewLocal ??= { opening: openPglite(), accountId: 'demo' };
const local = state.__overviewLocal;
async function database() { const opened = await local.opening; if (!local.seeded) { await saveWorkspace(opened.db, workspaceFromDesign()); local.seeded=true; } return opened.db; }
export async function requireWorkspace(work:any) { return work({accountId:local.accountId,mode:'account'}, await database()); }
export const readFrame = readWorkspaceFrame;
export async function sendWorkspace() { throw new Error('Sending is outside this test.'); }
export async function control(action:string) {
 const db = await database();
 if (action==='reset') { await saveWorkspace(db, workspaceFromDesign()); local.accountId='demo'; }
 if (action==='no-store') local.accountId='leen';
 if (action==='blank') {
 await db.update(schema.accounts).set({owner:' ',mission:' '}).where(eq(schema.accounts.id,'demo'));
 const stored=await db.select().from(schema.overviewTiles).where(eq(schema.overviewTiles.accountId,'demo'));
 await db.update(schema.overviewTiles).set({tiles:stored[0].tiles.map(t=>t.label==='Orders'?{...t,value:' ',delta:' '}:t)}).where(eq(schema.overviewTiles.accountId,'demo'));
 await db.update(schema.agents).set({name:' ',role:' ',lastText:' ',success:' ',saved:' '}).where(and(eq(schema.agents.accountId,'demo'),eq(schema.agents.id,'inventory')));
 await db.update(schema.missionProposals).set({mission:' ',targets:[[' ',' '],['Stock-outs','0'],['Label',''],['','Goal']]}).where(eq(schema.missionProposals.accountId,'demo'));
 await db.update(schema.approvals).set({title:' ',detail:' ',amount:' '}).where(and(eq(schema.approvals.accountId,'demo'),eq(schema.approvals.id,'ap3')));
 }
 if(action==='email') await db.update(schema.accounts).set({owner:'sara@example.com'}).where(eq(schema.accounts.id,'demo'));
 if(action==='missing-limit') await db.delete(schema.stateEntries).where(and(eq(schema.stateEntries.accountId,'demo'),eq(schema.stateEntries.key,'policy.refund_auto_limit')));
 if(action==='missing-rule') await db.delete(schema.rules).where(and(eq(schema.rules.accountId,'demo'),eq(schema.rules.id,'r1')));
 return { overview: await readOverview(db,{accountId:local.accountId,mode:'account'}), mandates:await db.select().from(schema.mandates), events:await db.select().from(schema.busEvents), approvals:await db.select().from(schema.approvals), agents:await db.select().from(schema.agents), tiles:await db.select().from(schema.overviewTiles), state:await db.select().from(schema.stateEntries) };
}
