import { WebSocketServer } from 'ws';
import net from 'node:net';
const server = new WebSocketServer({host:'127.0.0.1',port:55440});
server.on('connection', ws => {
 const tcp = net.connect({host:'127.0.0.1',port:55439});
 ws.on('message', bytes => tcp.write(bytes));
 tcp.on('data', bytes => {if(ws.readyState===1) ws.send(bytes);});
 tcp.on('error', () => ws.close());
 tcp.on('close', () => ws.close());
 ws.on('close', () => tcp.destroy());
});
console.log('Local WebSocket transport listening on 127.0.0.1:55440');
