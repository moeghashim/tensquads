import './neon-config.mjs';
import { createServer } from 'node:http';
import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { createTrialAccount, deleteRows } from '../scripts/bus-trial.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const pool=new Pool({connectionString:'postgres://trial:trial@127.0.0.1:55439/trial'});
const server=createServer(async(req,res)=>{
 try {
  let body=''; for await(const chunk of req) body+=chunk;
  const query=JSON.parse(body);
  const result=await pool.query({text:query.query,values:query.params,rowMode:'array'});
  result.rows=result.rows.map(row=>row.map(value=>value===null?null:String(value)));
  res.setHeader('content-type','application/json'); res.end(JSON.stringify(result));
 } catch(error){res.writeHead(400);res.end(JSON.stringify({message:error.message}));}
});
await new Promise(resolve=>server.listen(55441,'127.0.0.1',resolve));
neonConfig.fetchEndpoint='http://127.0.0.1:55441/sql';
const sql=neon('postgres://trial:trial@127.0.0.1:55439/trial');
const account='bus9999951105',other='untouched9999951105';
try {
 await createTrialAccount(sql,other);
 await createTrialAccount(sql,account);
 await createTrialAccount(sql,account);
 await sql`insert into bus_events (account_id,id,time_text,from_agent,to_agent,kind,skill,body,payload,writes,trace,seq) values (${account},'trial-event','','orders','master','Task','trial','Trial.','{}','[]','trace',1)`;
 await sql`insert into state_entries(account_id,key,value,sort_order) values (${account},'trial','true',1)`;
 const before=await sql`select id from accounts order by id`;
 const left=await deleteRows(sql,account);
 const after=await sql`select id from accounts order by id`;
 assert.equal(left,0); assert.ok(before.some(row=>row.id===account));
 assert.ok(after.some(row=>row.id===other)); assert.ok(!after.some(row=>row.id===account));
 const report={action:'create twice, insert FK children, delete trial children then parent',before,remainingTrialRows:left,after};
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6NC4RDTNH0JF13FF0F042VJ/trial-account.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
} finally {
 await deleteRows(sql,account); await deleteRows(sql,other);
 await pool.end(); server.close();
}
