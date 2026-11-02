import {defineConfig} from '@playwright/test';
import config from '../playwright.config.ts';
export default defineConfig({...config,testDir:'../e2e',testMatch:'validation-traffic.spec.ts',workers:1,webServer:undefined,outputDir:'/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ/playwright',snapshotPathTemplate:'{testDir}/traffic.spec.ts-snapshots/{arg}{ext}',use:{...config.use,baseURL:'http://127.0.0.1:3000',screenshot:'on',trace:'retain-on-failure'}});
