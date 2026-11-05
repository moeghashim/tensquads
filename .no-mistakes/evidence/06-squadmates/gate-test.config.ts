import original from './playwright.config.ts';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  ...original,
  outputDir: '/Users/moeghashim/.no-mistakes/evidence/01M6NFWN3W1HNCQGQJTYSG1X0J/playwright-results',
  use: {...original.use, baseURL: 'http://localhost:43123'},
  webServer: {command: 'npm exec -w @tensquads/web -- vite dev --port 43123 --strictPort', url: 'http://localhost:43123', reuseExistingServer: false, timeout: 120000},
});
