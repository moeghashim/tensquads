import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { schema } from './schema.ts';
import { migrationSql } from './migration-sql.ts';
import { writeAccount } from './save.ts';
import { demoData, workspaceFromDesign } from '../../../seed/src/workspace.ts';
async function create(){const client=new PGlite();globalThis.__overviewTestClient=client;await client.exec(migrationSql);const db=drizzle(client,{schema});await seed(db);return db;}
async function seed(db){const demo=workspaceFromDesign().accounts.find(x=>x.account.id==='demo');await writeAccount(db,{...demoData(),masterName:demo.masterName,clerkUserId:'local-test-user',account:{...demo.account,id:'local-test-account'}});}
globalThis.__overviewTestDb ??= create();
const db=await globalThis.__overviewTestDb;
export function openPostgres(){return {db,migrate:async()=>{},close:async()=>{}};}
export async function reset(){await seed(db);}

export async function state(){const names=['approvals','mandates','bus_events','agents','state_entries','mission_proposals'];const out={};for(const name of names)out[name]=(await db.$client.query('select * from '+name+" where account_id='local-test-account'")).rows;return out;}
export async function emptyMission(){await db.$client.exec("update mission_proposals set mission='' where account_id='local-test-account'");}

export async function delayNext(){
 const client=globalThis.__overviewTestClient;const original=client.transaction;
 client.transaction=async function(callback){client.transaction=original;return original.call(client,async tx=>{const query=tx.query.bind(tx);let delayed=false;tx.query=async (...args)=>{const result=await query(...args);if(!delayed && /^update /i.test(args[0])){delayed=true;await new Promise(r=>setTimeout(r,31000));}return result;};return callback(tx);});};
}

export async function noStore(){await db.$client.exec("delete from daily_revenue; delete from overview_tiles; delete from approvals; delete from mission_proposals; update agents set tasks=0,saved='',success='',last_text='',mission='',contribution=0,targets='[]'; update accounts set owner='new@example.com',mission='';");}
