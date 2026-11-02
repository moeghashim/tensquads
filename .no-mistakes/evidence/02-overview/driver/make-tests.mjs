import {readFileSync,writeFileSync} from 'node:fs';
let source=readFileSync('e2e/overview.spec.ts','utf8');
source=source.replace('"./workspace.ts"','"./local-workspace.ts"');
source=source.replace('const dir = ".no-mistakes/evidence/02-overview";', 'const dir = "/Users/moeghashim/.no-mistakes/evidence/01M6EKR5EE3AQFM23MF7PE72ZF";');
source=source.replace(/const postgres = openPostgres\(secretsFor\(\["testDatabase"\]\)\.testDatabase\);[\s\S]*?await openWorkspace\(page, workspaceUser\);/, 'await page.request.get("http://localhost:3000/__test?action=empty-mission");\n\tawait openWorkspace(page, workspaceUser);');
source=source.slice(0,source.indexOf('async function mandateFor('))+`async function mandateFor(accountId, approvalId) { return fetch('http://localhost:3000/__test?action=mandate&id='+approvalId).then(r=>r.json()); }\nasync function agentFor(accountId, id) { return fetch('http://localhost:3000/__test?action=agent&id='+id).then(r=>r.json()); }\n`;
writeFileSync('e2e/local-overview.spec.ts',source);
