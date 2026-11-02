import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema } from '../packages/adapters/src/neon/schema.ts';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
const state = globalThis as any;
state.__localDb ??= { client: new PGlite() };
const store = state.__localDb;
store.db ??= drizzle(store.client, { schema });
store.ready ??= store.client.exec(migrationSql);
export function openPostgres() { return { db: store.db, migrate: () => store.ready, close: async () => {} }; }
export function migrationStatements(script: string) { return [script]; }
export async function reset() {
 await store.ready;
 const { replaceDemoAccount } = await import('../packages/seed/src/demo-account.ts');
 await replaceDemoAccount(store.db, 'local-gate', 'local-user');
}
