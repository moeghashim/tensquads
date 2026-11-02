import net from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { neonConfig } from '@neondatabase/serverless';
export const bridge = new WebSocketServer({host:'127.0.0.1', port:55440});
bridge.on('connection', ws => {
  const socket = net.connect({host:'127.0.0.1',port:55439});
  ws.on('message', data => socket.write(data));
  socket.on('data', data => { if(ws.readyState===WebSocket.OPEN) ws.send(data); });
  socket.on('error', () => ws.close());
  socket.on('close', () => ws.close());
  ws.on('close', () => socket.destroy());
  ws.on('error', () => socket.destroy());
});
neonConfig.webSocketConstructor = WebSocket;
neonConfig.wsProxy = () => '127.0.0.1:55440';
neonConfig.useSecureWebSocket = false;
neonConfig.forceDisablePgSSL = true;
neonConfig.pipelineConnect = false;
export const connection = 'postgresql://mandate_tester@127.0.0.1:55439/postgres?sslmode=disable';
