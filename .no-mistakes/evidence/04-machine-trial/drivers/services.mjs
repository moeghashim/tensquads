import EmbeddedPostgres from 'embedded-postgres';
import { WebSocketServer } from 'ws';
import net from 'node:net';
const pg = new EmbeddedPostgres({databaseDir: `${process.cwd()}/.phase-test/pgdata`, user:'phaseuser',password:'phase-local',port:55439,persistent:true,createPostgresUser:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',''],onLog:console.log,onError:console.error});
await pg.start(); await pg.createDatabase('phase_tests');
const wss=new WebSocketServer({host:'127.0.0.1',port:55440});
wss.on('connection',ws=>{ const tcp=net.connect({host:'127.0.0.1',port:55439}); ws.on('message',data=>tcp.write(data)); tcp.on('data',data=>ws.send(data)); tcp.on('error',()=>ws.close()); tcp.on('close',()=>ws.close()); ws.on('close',()=>tcp.destroy()); });
console.log('Disposable Postgres ready on 55439; Neon WebSocket bridge on 55440.');
async function stop(){for(const client of wss.clients)client.terminate(); await new Promise(r=>wss.close(r)); await pg.stop();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
