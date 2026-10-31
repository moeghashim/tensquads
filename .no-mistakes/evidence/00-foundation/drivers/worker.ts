import * as adapters from '../packages/adapters/src/index.ts';
import { migrationSql } from '../packages/adapters/src/neon/migration-sql.ts';
export default {
  async fetch() {
    const opened = adapters.openPostgres('postgres://disposable:disposable@127.0.0.1:1/test');
    const repositories = adapters.createRepositories(opened.db);
    await opened.close();
    const bus = adapters.createMemoryBus({events: [], store: {}, script: [{from:'master',to:'orders',kind:'Task',skill:'check',text:'Test',payload:{},writes:[]}]});
    return Response.json({exports:Object.keys(adapters), repositoryAreas:Object.keys(repositories), firstEvent:bus.nextEvent(), migrationSql});
  }
};
