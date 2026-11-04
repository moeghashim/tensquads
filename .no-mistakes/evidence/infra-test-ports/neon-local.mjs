import {neonConfig} from '@neondatabase/serverless';
neonConfig.wsProxy = () => '127.0.0.1:45433';
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineTLS = false;
neonConfig.pipelineConnect = false;
