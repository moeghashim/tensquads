import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor=ws;
neonConfig.wsProxy=()=> '127.0.0.1:55440';
neonConfig.useSecureWebSocket=false;
neonConfig.pipelineConnect=false;
