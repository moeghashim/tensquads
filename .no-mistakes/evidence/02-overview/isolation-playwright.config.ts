import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'../e2e',testMatch:'.local-*.spec.ts',workers:1,timeout:90000,reporter:'line',outputDir:process.env.LOCAL_EVIDENCE+'/playwright',use:{baseURL:'http://localhost:3000',viewport:{width:1440,height:900},trace:'on',screenshot:'only-on-failure'}});
