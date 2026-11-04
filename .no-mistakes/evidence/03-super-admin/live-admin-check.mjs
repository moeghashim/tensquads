import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(process.cwd() + '/package.json');
const { chromium, expect } = require('@playwright/test');
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6KP052CAMPQST2JZQ2JF1NE';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const results = [];
try {
  for (const path of ['/admin', '/admin/images']) {
    await page.goto('http://localhost:3000' + path);
    await expect(page).toHaveURL(/\/signin$/);
    await expect(page.getByRole('heading', { name: 'Sign in to tensquads' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Platform admin' })).toHaveCount(0);
    await page.screenshot({ path: evidence + (path === '/admin' ? '/visitor-admin.png' : '/visitor-images.png'), fullPage: true });
    results.push({ action: 'Visit ' + path + ' without a session', url: page.url(), visible: 'Sign in to tensquads', adminNavigation: false });
  }
  await context.addCookies([{name:'ts_special_account', value:'northwind.' + Date.now(), url:'http://localhost:3000', httpOnly:true, secure:true, sameSite:'Lax'}]);
  for (const path of ['/admin', '/admin/images', '/overview']) {
    await page.goto('http://localhost:3000' + path);
    await expect(page).toHaveURL(/\/signin$/);
    results.push({ action: 'Visit ' + path + ' with forged special-session cookie and no Clerk session', url: page.url(), authorized: false });
  }
  const calls = await page.evaluate(async () => {
    const specifier = '/src/server/admin.ts';
    const mod = await import(specifier);
    const results = [];
    for (const name of ['loadAdminAccounts', 'loadAdminImages', 'loadAdminAttention', 'openSpecialSession']) {
      try {
        const data = await mod[name](...(name === 'openSpecialSession' ? [{data:'northwind'}] : []));
        results.push({name, resolved: true, type: typeof data, data });
      } catch (error) {
        results.push({name, resolved: false, redirect: error?.options?.to ?? error?.to ?? error?.headers?.get?.('location') ?? null, message: error?.message ?? null, keys: Object.keys(error ?? {}) });
      }
    }
    return results;
  });
  for (const call of calls) {
    expect(call.resolved, JSON.stringify(call)).toBe(false);
    expect(call.redirect, JSON.stringify(call)).toBe('/signin');
  }
  results.push({action:'Invoke admin reads and special-session POST directly without authentication', calls});
  await page.setViewportSize({width:390, height:844});
  await page.screenshot({path:evidence+'/visitor-forged-cookie-390.png',fullPage:true});
  await writeFile(evidence + '/live-admin-results.json', JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally { await context.close(); await browser.close(); }
