import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openPglite, saveWorkspace, createRepositories, createMemoryBus } from '@tensquads/adapters';
import { workspaceFromDesign, design } from '@tensquads/seed';

const out = new URL('./', import.meta.url);
const record = (name, value) => writeFile(new URL(name, out), JSON.stringify(value, null, 2) + '\n');
const browser = await chromium.launch();
const observations = [];
try {
  for (const [name, url] of [
    ['worker', 'http://localhost:8787/'],
    ['cloudflare', 'https://tensquads.moe-678.workers.dev/'],
  ]) {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const response = await page.goto(url, { waitUntil: 'networkidle' });
      const actual = {
        name, url, width, height, status: response.status(),
        title: await page.title(), visibleText: (await page.locator('body').innerText()).trim(),
        horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        controls: await page.locator('button, input, select, textarea, a[href]').count(),
        errors,
      };
      const axe = await new AxeBuilder({ page }).disableRules(['page-has-heading-one']).analyze();
      actual.accessibilityViolations = axe.violations;
      await page.screenshot({ path: new URL(`${name}-${width}.png`, out).pathname, fullPage: true });
      if (width === 1440) await writeFile(new URL(`${name}.html`, out), await response.text());
      observations.push(actual);
      await record('browser.json', observations);
      assert.equal(actual.status, 200);
      assert.equal(actual.title, 'tensquads');
      assert.equal(actual.visibleText, '');
      assert.equal(actual.horizontalOverflow, false);
      assert.equal(actual.controls, 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(axe.violations, []);
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const opened = await openPglite();
try {
  const snapshot = workspaceFromDesign();
  await saveWorkspace(opened.db, snapshot);
  await saveWorkspace(opened.db, snapshot);
  const repos = createRepositories(opened.db);
  const demo = { accountId: 'demo', mode: 'account' };
  const totals = await repos.platform.totals({ accountId: 'platform', mode: 'platform' });
  assert.deepEqual(totals, { accounts: 9, agents: 66, squads: 17, mrr: 1294, allTime: 14568,
    tasksDone: 331, images: 7, openBugs: 8, featuresRequested: 15 });
  const agents = await repos.squads.listAgents(demo);
  const revenue = await repos.platform.dailyRevenue(demo);
  const inbox = await repos.policy.inbox(demo);
  const bus = createMemoryBus({ events: await repos.bus.listEvents(demo),
    store: { ...await repos.bus.readStore(demo), 'inventory.low_stock': 'before-script' },
    script: design.script.map(event => ({ ...event, writes: event.writes ?? [] })) });
  const first = bus.nextEvent();
  assert.equal(bus.store()['inventory.low_stock'], 'before-script');
  const second = bus.nextEvent();
  assert.equal(bus.store()['inventory.low_stock'], '["Black hoodie M","A3 frame"]');
  await record('seed-database.json', { database: 'PGlite, migrated and seeded twice through the application adapters',
    totals, demoAgents: agents.map(({ id, on, tasks, mission }) => ({ id, on, tasks, mission })),
    revenue, inbox, otherAccountAgents: await repos.squads.listAgents({ accountId: 'leen', mode: 'account' }),
    scriptedEvents: [first, second], resultingStore: bus.store() });
} finally {
  await opened.close();
}
console.log('Captured the blank Worker and deployed page at desktop and mobile sizes, plus seeded repository state.');
