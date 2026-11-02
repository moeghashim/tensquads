import {test,expect} from '../.traffic-validation/workspace.ts';
import {writeFileSync} from 'node:fs';
const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ';
test('send next event selects the new event without React render errors',async({page})=>{
 const errors:string[]=[];
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/traffic');
 await page.getByRole('button',{name:'Send next event'}).click();
 await expect(page.getByRole('complementary',{name:'Message details'})).toContainText('Daily stock check');
 await page.screenshot({path:`${evidence}/round3-send-console.png`,fullPage:true});
 writeFileSync(`${evidence}/round3-console-errors.txt`,errors.join('\n')+'\n');
 expect(errors).toEqual([]);
});

test('empty selection uses second event and a removed selected id falls back to the last event',async({page,request})=>{
 const errors:string[]=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 const rows=await (await request.get('/__test/events')).json();
 await page.goto('/traffic');
 const inspector=page.getByRole('complementary',{name:'Message details'});
 await expect(inspector).toContainText(rows[1].body);
 const chosen=rows.at(-1), fallback=rows.at(-2);
 await page.locator(`[data-event-id="${chosen.id}"]`).click();
 await expect(inspector).toContainText(chosen.body);
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Overview',exact:true}).click();
 expect((await request.get('/__test/drop?id='+encodeURIComponent(chosen.id))).ok()).toBe(true);
 await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Squad traffic',exact:true}).click();
 await expect(inspector).toContainText(fallback.body);
 await page.screenshot({path:`${evidence}/round3-selection-fallback.png`,fullPage:true});
 expect(errors).toEqual([]);
 console.log(JSON.stringify({initialSelection:rows[1].id,removedSelection:chosen.id,fallbackSelection:fallback.id,consoleErrors:errors}));
});
