import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
import { schema } from '../packages/adapters/src/neon/schema.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
export const client = new PGlite();
export const db = drizzle(client, { schema });
export const ready = client.exec(migrationSql).then(() => replaceDemoAccount(db, 'traffic-validation', 'validation-user'));
export async function reset(mode = 'seed') {
 await ready;
 await replaceDemoAccount(db, 'traffic-validation', 'validation-user');
 if (mode === 'empty') await client.exec("delete from bus_events where account_id='traffic-validation'");
 if (mode === 'stock') await client.exec(`update state_entries set value='"before-write"' where account_id='traffic-validation' and key='inventory.low_stock'`);
 if (mode === 'missing') await client.exec("delete from skills where account_id='traffic-validation' and agent_id='orders'; delete from machines where account_id='traffic-validation' and agent_id='orders'; delete from agents where account_id='traffic-validation' and id='orders'");
}
export async function events() { await ready; return (await client.query("select id,seq,body from bus_events where account_id='traffic-validation' order by seq")).rows; }
