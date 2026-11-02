import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
import { schema } from '../packages/adapters/src/neon/schema.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
const key = '__trafficValidationDb';
export async function database() {
  if (!globalThis[key]) globalThis[key] = (async () => {
    const client = new PGlite(); await client.exec(migrationSql);
    const db = drizzle(client, {schema});
    await replaceDemoAccount(db, 'validation', 'validation-user');
    return {db, client, close:async()=>{}};
  })();
  return globalThis[key];
}
export async function admin(action, value) {
 const {db,client}=await database();
 if(action==='reset') await replaceDemoAccount(db,'validation','validation-user');
 if(action==='sql') return (await client.query(value)).rows;
 return (await client.query("select id, seq, body from bus_events where account_id='validation' order by seq")).rows;
}
