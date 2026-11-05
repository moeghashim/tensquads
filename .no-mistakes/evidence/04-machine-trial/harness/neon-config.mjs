import { neonConfig } from '@neondatabase/serverless';
neonConfig.useSecureWebSocket = false;
neonConfig.wsProxy = (host, port) => `127.0.0.1:55440/v2?port=${port}`;
neonConfig.pipelineConnect = false;
