import {WebSocketServer} from 'ws';
import net from 'node:net';
const server = new WebSocketServer({host:'127.0.0.1',port:45433});
server.on('connection',ws=>{
 const tcp=net.connect({host:'127.0.0.1',port:45432});
 ws.on('message',data=>tcp.write(data));
 tcp.on('data',data=>{if(ws.readyState===1)ws.send(data)});
 tcp.on('error',()=>ws.close()); tcp.on('close',()=>ws.close());
 ws.on('close',()=>tcp.destroy()); ws.on('error',()=>tcp.destroy());
});
console.log('Local Neon wire proxy listening on 45433, Postgres 45432');
