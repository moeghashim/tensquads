import EmbeddedPostgres from './node_modules/embedded-postgres/dist/index.js';
import { WebSocketServer } from 'ws';
import net from 'node:net';
const pg = new EmbeddedPostgres({databaseDir: new URL('./pgdata', import.meta.url).pathname,user:'validator',password:'disposable',port:55439,persistent:true,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-c',"unix_socket_directories="],onLog:()=>{},onError:console.error});
await pg.initialise();
await pg.start();
await pg.createDatabase('validation');
const ws = new WebSocketServer({host:'127.0.0.1',port:55440});
ws.on('connection', socket => {
 const tcp = net.connect({host:'127.0.0.1',port:55439});
 socket.on('message',data=>tcp.write(data));
 tcp.on('data',data=>{if(socket.readyState===1)socket.send(data)});
 tcp.on('error',()=>socket.close());
 tcp.on('close',()=>socket.close());
 socket.on('close',()=>tcp.destroy());
 socket.on('error',()=>tcp.destroy());
});
process.on('SIGTERM',async()=>{for(const s of ws.clients)s.terminate();ws.close();await pg.stop();process.exit(0)});
console.log('Disposable PostgreSQL ready on 127.0.0.1:55439; WebSocket bridge 55440');
