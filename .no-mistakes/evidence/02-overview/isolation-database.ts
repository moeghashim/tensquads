import { openPglite } from '../packages/adapters/test/pglite.ts';
import { replaceDemoAccount } from '../packages/seed/src/demo-account.ts';
let ready: ReturnType<typeof initialize> | undefined;
async function initialize(){
 const database = await openPglite();
 await replaceDemoAccount(database.db,'local-validation','local-validation-user');
 return database;
}
export async function openLocalDatabase(){
 const database = await (ready ??= initialize());
 return {db:database.db,close:async()=>{}};
}
export async function resetLocalDatabase(){const d=await openLocalDatabase();await replaceDemoAccount(d.db,'local-validation','local-validation-user');}
