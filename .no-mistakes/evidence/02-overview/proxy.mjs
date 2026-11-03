import {WebSocketServer} from './runtime/node_modules/ws/wrapper.mjs';
import net from 'node:net';
const server=new WebSocketServer({host:'127.0.0.1',port:55440});
server.on('connection',ws=>{const socket=net.connect({host:'127.0.0.1',port:55439});ws.on('message',data=>socket.write(data));socket.on('data',data=>{if(ws.readyState===1)ws.send(data)});socket.on('close',()=>ws.close());socket.on('error',()=>ws.close());ws.on('close',()=>socket.destroy());ws.on('error',()=>socket.destroy());});
console.log('Isolated PostgreSQL WebSocket proxy ready');
