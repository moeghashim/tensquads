import EmbeddedPostgres from './node_modules/embedded-postgres/dist/index.js';
import { WebSocketServer } from 'ws';
import net from 'node:net';
const pg = new EmbeddedPostgres({databaseDir: new URL('./data', import.meta.url).pathname, user:'tester',password:'test',port:55439,persistent:true,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',''],onLog:console.log,onError:console.error});
await pg.start(); await pg.createDatabase('validation');
const wss = new WebSocketServer({host:'127.0.0.1',port:55440});
wss.on('connection', ws=>{const socket=net.connect(55439,'127.0.0.1');ws.on('message',data=>socket.write(data));socket.on('data',data=>ws.send(data));socket.on('error',()=>ws.close());socket.on('close',()=>ws.close());ws.on('close',()=>socket.destroy());});
console.log('READY postgres 127.0.0.1:55439 and websocket 55440');
process.on('SIGTERM',async()=>{for(const ws of wss.clients)ws.terminate();wss.close();await pg.stop();process.exit(0)});
