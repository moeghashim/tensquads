import {neonConfig} from '@neondatabase/serverless';
neonConfig.wsProxy = (host,port) => Number(port) === 9 ? '127.0.0.1:9' : '127.0.0.1:15433';
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;
neonConfig.forceDisablePgSSL = true;
