import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'../e2e', testMatch:'.validation-boundary.spec.ts', workers:1, fullyParallel:false,
 reporter:[['line'], ['json',{outputFile:'/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ/round3-boundary-results.json'}]],
 outputDir:'/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ/round3-boundary-playwright',
 snapshotPathTemplate:'{testDir}/traffic.spec.ts-snapshots/{arg}{ext}',
 use:{baseURL:'http://localhost:3000',viewport:{width:1440,height:900},deviceScaleFactor:1,screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--font-render-hinting=none','--disable-font-subpixel-positioning','--force-color-profile=srgb']}}
});
