import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect, expectNoHorizontalScroll, waitForScreenFonts } from './support.ts';
import { installPinnedFonts } from './fonts.ts';

const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6NFWN3W1HNCQGQJTYSG1X0J';
const notes: string[] = [];
const base = '42545c68860e4c4d59c1a342895853a3f16f20cc';
let server: ReturnType<typeof createServer>;
let reviewUrl: string;

test.beforeAll(async () => {
  const oldDrawing = execFileSync('git', ['show', `${base}:apps/landing/review-src/squadmates.mjs`], {encoding:'utf8'});
  const drawingUrl = `data:text/javascript;base64,${Buffer.from(oldDrawing).toString('base64')}`;
  const oldPage = execFileSync('git', ['show', `${base}:apps/landing/review-src/characters.mjs`], {encoding:'utf8'}).replace('./squadmates.mjs', drawingUrl);
  const {charactersPage} = await import(`data:text/javascript;base64,${Buffer.from(oldPage).toString('base64')}`);
  const current = readFileSync('apps/landing/public/review/characters.html', 'utf8');
  const previous = current.replace(/<main>[\s\S]*<\/main>/, `<main>${charactersPage()}</main>`);
  writeFileSync(`${evidence}/review-characters-before.html`, previous);
  writeFileSync(`${evidence}/review-characters-after.html`, current);
  server = createServer((req,res) => {
    res.writeHead(200, {'content-type':'text/html'}).end(req.url === '/before' ? previous : current);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  reviewUrl = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  writeFileSync(`${evidence}/live-observations.txt`, notes.join('\n'));
});

test('review sheet preserves the nine existing drawings and adds Sydney', async ({browser}) => {
  const context = await browser.newContext({viewport:{width:1440,height:900}, reducedMotion:'reduce'});
  const before = await context.newPage();
  const after = await context.newPage();
  await installPinnedFonts(before, true);
  await installPinnedFonts(after, true);
  await before.goto(`${reviewUrl}/before`);
  await after.goto(`${reviewUrl}/after`);
  await before.evaluate(() => document.fonts.ready);
  await after.evaluate(() => document.fonts.ready);
  const names = ['Petra','Pisa','Kyoto','Rio','Zurich','Giza','Machu','Angkor','Delphi'];
  await expect(after.locator('.mate')).toHaveCount(10);
  for (const name of names) {
    const oldCard = before.locator('.mate').filter({has: before.locator('b', {hasText:new RegExp(`^${name}$`)})});
    const newCard = after.locator('.mate').filter({has: after.locator('b', {hasText:new RegExp(`^${name}$`)})});
    expect(await newCard.screenshot({animations:'disabled'}), `${name} card pixels`).toEqual(await oldCard.screenshot({animations:'disabled'}));
  }
  expect(await after.locator('.states').screenshot({animations:'disabled'})).toEqual(await before.locator('.states').screenshot({animations:'disabled'}));
  await expect(after.getByRole('img', {name:'Sydney, People',exact:true})).toBeVisible();
  for (const [width,height] of [[1440,900],[390,844]]) {
    await before.setViewportSize({width,height});
    await after.setViewportSize({width,height});
    await expectNoHorizontalScroll(after);
    await before.screenshot({path:`${evidence}/review-before-${width}.png`,fullPage:true,animations:'disabled'});
    await after.screenshot({path:`${evidence}/review-after-${width}.png`,fullPage:true,animations:'disabled'});
  }
  notes.push('Review sheet: nine existing character cards and all 27 state drawings match base pixels; Sydney has an accessible name; no page overflow at 1440 or 390.');
  await context.close();
});

test('sign-up shows character names, role tags and Petra copy for both business types', async ({page}) => {
  for (const [width,height] of [[1440,900],[390,844]]) {
    await page.setViewportSize({width,height});
    for (const kind of ['new','existing']) {
      await page.goto('/signup');
      await page.getByRole('button',{name:kind === 'new' ? /A new business/ : /An existing business/}).click();
      if (kind === 'new') await expect(page.getByText('Petra uses this to brief every squad. You can change it later.')).toBeVisible();
      await expect(page.getByText("Ask Petra what's going on; Petra routes the question to the right squad.")).toBeVisible();
      await page.getByRole('button',{name:'Choose my squads'}).click();
      for (const [name,role] of [['Pisa','Orders'],['Kyoto','Support'],['Rio','Marketing'],['Zurich','Finance'],['Giza','Inventory'],['Machu','Market researcher'],['Angkor','Website builder']]) {
        const row = page.getByRole('button').filter({hasText: name});
        await expect(row).toHaveCount(1);
        await expect(row).toContainText(role);
        await expect(row.locator('svg[viewBox="0 0 64 64"]')).toHaveAttribute('aria-hidden','true');
        await expect(row.locator('svg[viewBox="0 0 64 64"]')).not.toHaveAttribute('aria-label');
      }
      await expect(page.getByText(`${kind === 'new' ? 3 : 4} squads and Petra's squad will be created.`)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await waitForScreenFonts(page);
      await page.screenshot({path:`${evidence}/signup-${kind}-${width}.png`,fullPage:true,animations:'disabled'});
      if (kind === 'new') {
        for (const name of ['Pisa','Kyoto','Rio']) await page.getByRole('button').filter({hasText:name}).click();
        await expect(page.getByText('Pick at least one squad to start.')).toBeVisible();
        await page.getByRole('button',{name:'Create my workspace'}).click();
        await expect(page.getByLabel('Email')).toHaveCount(0);
        await page.screenshot({path:`${evidence}/signup-zero-${width}.png`,fullPage:true,animations:'disabled'});
      }
    }
  }
  notes.push('Sign-up: both business types show seven named drawings and role tags with decorative SVGs; Petra copy and selection counts are correct at 1440 and 390; deselecting all squads blocks account creation.');
});

test('protected routes require credentials that are absent in the isolated checkout', async ({page}) => {
  for (const route of ['/overview','/chat','/agents','/agents/support','/traffic','/rules','/admin/images']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/signin$/);
    notes.push(`${route} redirects to /signin without Clerk credentials.`);
  }
  await page.screenshot({path:`${evidence}/authentication-boundary.png`,fullPage:true});
});
