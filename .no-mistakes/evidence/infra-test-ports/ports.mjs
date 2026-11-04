import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {resolveE2ePort,stablePort} from '../scripts/e2e-port.mjs';
const occupied=29669;
const response=await fetch(`http://localhost:${occupied}`); console.log(`Existing Vite server http://localhost:${occupied}/ responded ${response.status}.`);
delete process.env.CI;delete process.env.TS_E2E_PORT;
const port=await resolveE2ePort();
console.log(`Auto port selection returned ${port}; preferred worktree port ${stablePort(process.cwd())}.`);
process.env.TS_E2E_PORT=String(occupied);
try{console.log(`Explicit occupied Vite port returned ${await resolveE2ePort()} instead of rejecting.`)}catch(e){console.log(e.message)}
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
try{process.env.TS_E2E_PORT=String(socket.address().port);await assert.rejects(resolveE2ePort(),/already in use/);console.log('IPv4 occupied port correctly rejected.')}finally{await new Promise(r=>socket.close(r))}
process.env.TS_E2E_PORT='65536';await assert.rejects(resolveE2ePort(),/1 to 65535/);console.log('Out-of-range override 65536 rejected.');
delete process.env.TS_E2E_PORT;process.env.CI='true';assert.equal(await resolveE2ePort(),3000);console.log('CI with no override chose 3000.');
