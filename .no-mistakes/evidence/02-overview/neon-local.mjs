import {neonConfig} from '@neondatabase/serverless';
import WebSocket from './runtime/node_modules/ws/wrapper.mjs';
neonConfig.webSocketConstructor=WebSocket;
neonConfig.wsProxy=()=> '127.0.0.1:55440';
neonConfig.useSecureWebSocket=false;
neonConfig.pipelineConnect=false;
