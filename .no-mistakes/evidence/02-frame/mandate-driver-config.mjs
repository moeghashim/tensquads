import WebSocket from 'ws';
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor=WebSocket;
neonConfig.wsProxy=()=> '127.0.0.1:55440';
neonConfig.useSecureWebSocket=false;
neonConfig.pipelineConnect=false;
process.env.TEST_DATABASE_URL='postgresql://mandate_test@127.0.0.1:55439/mandate_test?sslmode=disable';
