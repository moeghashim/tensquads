import EmbeddedPostgres from 'embedded-postgres';
import { WebSocketServer } from 'ws';
import net from 'node:net';
const pg = new EmbeddedPostgres({databaseDir: new URL('./data', import.meta.url).pathname,user:'validation',password:'validation',port:55439,persistent:true,postgresFlags:['-h','127.0.0.1','-k',''],onLog:()=>{},onError:console.error});
await pg.initialise(); await pg.start(); await pg.createDatabase('validation');
const wss = new WebSocketServer({host:'127.0.0.1',port:55440});
wss.on('connection', ws=>{const socket=net.connect(55439,'127.0.0.1');ws.on('message',data=>socket.write(data));socket.on('data',data=>{if(ws.readyState===1)ws.send(data)});socket.on('error',()=>ws.close());socket.on('close',()=>ws.close());ws.on('close',()=>socket.destroy());});
console.log('Disposable PostgreSQL and transport ready');
process.on('SIGTERM',async()=>{for(const c of wss.clients)c.terminate();wss.close();await pg.stop();process.exit(0)});
