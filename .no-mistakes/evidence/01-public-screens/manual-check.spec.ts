import { test, expect, waitForScreenFonts, expectNoHorizontalScroll } from './support.ts';
const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6BNFBY1SP71MQW7C63D6KKB';
for (const width of [1440, 390]) {
 test(`evidence and sign-up field persistence at ${width}`, async ({page}) => {
  await page.setViewportSize({width, height:900});
  for (const [url, name] of [['/', 'home'], ['/signin', 'signin'], ['/signup', 'signup']]) {
   await page.goto(url);
   await waitForScreenFonts(page);
   await expectNoHorizontalScroll(page);
   await page.screenshot({path:`${evidence}/${name}-${width}.png`, fullPage:true});
  }
  await page.getByRole('button', {name:/A new business/}).click();
  await page.getByLabel('Business name').fill('Disposable Harbor');
  await page.getByLabel('Company mission').fill('Serve the neighborhood');
  await page.getByRole('button', {name:'Marketplace', exact:true}).click();
  await page.getByRole('button', {name:'Social', exact:true}).click();
  for (const name of ['Online store','Marketplace','Social']) {
   await expect(page.getByRole('button', {name, exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', {name:'Choose my squads'}).click();
  const support=page.getByRole('button', {name:/Replies in your voice/});
  await support.click();
  await expect(page.getByText('2 squads and one master squad will be created.')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', {name:'Create my workspace'}).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', {name:'Create my workspace'}).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your email and password to sign in.');
  await page.screenshot({path:`${evidence}/account-empty-${width}.png`,fullPage:true});
  await page.getByRole('button', {name:'Back',exact:true}).click();
  await expect(support).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button', {name:'Back',exact:true}).click();
  await expect(page.getByLabel('Business name')).toHaveValue('Disposable Harbor');
  await expect(page.getByLabel('Company mission')).toHaveValue('Serve the neighborhood');
  for (const name of ['Online store','Marketplace','Social']) {
   await expect(page.getByRole('button', {name, exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await page.getByRole('button', {name:'Back',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Where are you starting from?'})).toBeVisible();
 });
}
