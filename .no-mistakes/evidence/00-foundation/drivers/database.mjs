import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {openPglite} from '../packages/adapters/test/pglite.ts';
import {createRepositories,saveWorkspace} from '../packages/adapters/src/index.ts';
import {workspaceFromDesign} from '../packages/seed/src/index.ts';
const opened=await openPglite();
try {
 const snapshot=workspaceFromDesign();
 const repos=createRepositories(opened.db);
 const platform={accountId:'platform',mode:'platform'};
 await saveWorkspace(opened.db,snapshot);
 const initial=await repos.platform.totals(platform);
 await saveWorkspace(opened.db,snapshot);
 const repeated=await repos.platform.totals(platform);
 assert.deepEqual(initial,repeated);
 await assert.rejects(()=>saveWorkspace(opened.db,{...snapshot,accounts:[...snapshot.accounts,...snapshot.accounts]}));
 const afterRejectedReplacement=await repos.platform.totals(platform);
 assert.deepEqual(initial,afterRejectedReplacement);
 const agents=await repos.squads.listAgents({accountId:'demo',mode:'account'});
 const evidence={initial,repeated,afterRejectedReplacement,success:agents.map(({id,success})=>({id,success}))};
 assert.deepEqual(initial,{accounts:9,agents:66,squads:17,mrr:1294,allTime:14568,tasksDone:331,images:7,openBugs:8,featuresRequested:15});
 writeFileSync('/Users/moeghashim/.no-mistakes/evidence/01M6A41GP1MDXJ1Q12SBYVHE25/database.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence));
} finally {await opened.close();}
