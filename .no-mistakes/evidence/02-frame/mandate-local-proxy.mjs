import net from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { neonConfig } from '@neondatabase/serverless';
const server = new WebSocketServer({host:'127.0.0.1',port:55440});
server.on('connection', ws => {
 const socket=net.connect({host:'127.0.0.1',port:55439});
 ws.on('message',data=>socket.write(data));
 socket.on('data',data=>{if(ws.readyState===WebSocket.OPEN)ws.send(data)});
 ws.on('close',()=>socket.destroy()); socket.on('end',()=>ws.close());
 socket.on('error',()=>ws.close()); ws.on('error',()=>socket.destroy());
});
