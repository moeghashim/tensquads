import { neonConfig } from '@neondatabase/serverless';
neonConfig.wsProxy = () => '127.0.0.1:55440/v2';
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;
