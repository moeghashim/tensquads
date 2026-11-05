import './neon.mjs';
import {test,expect} from '@playwright/test';
import {Pool} from '@neondatabase/serverless';
import {deleteWorkspaceAccount} from '../e2e/workspace.ts';
import {replaceDemoAccount} from '../packages/seed/src/demo-account.ts';
import {openPostgres} from '../packages/adapters/src/neon/postgres.ts';
test('cleanup B finishes while A is locked; cleanup A waits then deletes only A',async()=>{
 const url=process.env.TEST_DATABASE_URL!;
 const pg=openPostgres(url);const pool=new Pool({connectionString:url,max:1});const client=await pool.connect();
 let deletion:Promise<void>|undefined;
 try {
 await replaceDemoAccount(pg.db,'cleanup-a','cleanup-clerk-a');await replaceDemoAccount(pg.db,'cleanup-b','cleanup-clerk-b');
 await client.query("select pg_advisory_lock_shared(1952804467,1);select pg_advisory_lock(1952804468,hashtext('cleanup-a'))");
 let done=false;deletion=deleteWorkspaceAccount('cleanup-a').then(()=>{done=true});
 await deleteWorkspaceAccount('cleanup-b');expect(done).toBe(false);
 const mid=await client.query("select id from accounts where id like 'cleanup-%' order by id");expect(mid.rows).toEqual([{id:'cleanup-a'}]);
 console.log('While A fence held: cleanup B committed, A remains:',mid.rows);
 await client.query('select pg_advisory_unlock_all()');await deletion;
 const after=await client.query("select id from accounts order by id");expect(after.rows).toEqual([{id:'account-a'},{id:'account-b'}]);
 console.log('After release: cleanup A committed; unrelated accounts retained:',after.rows);
 }finally{await client.query('select pg_advisory_unlock_all()');await deletion;client.release();await pool.end();await pg.close();}
});
