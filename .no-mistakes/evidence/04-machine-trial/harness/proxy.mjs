import { WebSocketServer } from 'ws';
import { connect } from 'node:net';
const server = new WebSocketServer({ host: '127.0.0.1', port: 55440 });
server.on('connection', (ws, request) => {
 const port=Number(new URL(request.url, 'http://localhost').searchParams.get('port'));
 if (![55439,9].includes(port)) { ws.close(); return; }
 const tcp = connect({host:'127.0.0.1',port});
 ws.on('message', data => tcp.write(data));
 tcp.on('data', data => { if(ws.readyState===1) ws.send(data); });
 tcp.on('error', () => ws.close());
 tcp.on('close', () => ws.close());
 ws.on('close', () => tcp.destroy());
 ws.on('error', () => tcp.destroy());
});
console.log('Disposable PostgreSQL WebSocket bridge on 127.0.0.1:55440');
