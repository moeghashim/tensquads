import {chromium,expect} from '@playwright/test';
import {installPinnedFonts} from '../e2e/fonts.ts';
import {writeFileSync} from 'node:fs';
const dir='/Users/moeghashim/.no-mistakes/evidence/01M6ES7TDTX6YVPWJTWJ0XP5ZC';
expect((await fetch('http://127.0.0.1:3000/__test/no-store')).status).toBe(200);
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});await installPinnedFonts(p,true);await p.goto('http://localhost:3000/overview');
await expect(p.getByRole('heading',{name:'Good morning, new',exact:true})).toBeVisible();
const tiles=p.locator("main [data-loop='kpis'] > div");await expect(tiles).toHaveCount(6);
for(const label of ['Revenue','Orders','Average order','Profit margin','Hours saved'])await expect(tiles.filter({has:p.getByText(label,{exact:true})})).toContainText('—');
await expect(tiles.filter({hasText:'Tasks done by squads'})).toContainText('0');
await expect(p.locator("main section[aria-label='Revenue'] [data-loop='bars'] > div")).toHaveCount(0);
await expect(p.locator('main')).toContainText('Nothing waiting. Your squads are working inside their limits.');await expect(p.locator("[data-if='dockUnread']")).toHaveCount(0);
for(const width of [1440,390]){await p.setViewportSize({width,height:900});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await p.screenshot({path:dir+'/no-store-'+width+'.png',fullPage:true});}
writeFileSync(dir+'/no-store-visible-output.txt',await p.locator('main').innerText());await b.close();console.log('No-store overview: named greeting, five dash values, zero tasks, empty chart, empty inbox, no badge, and widths 1440/390 verified.');
