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
 await page.screenshot({path:`${evidence}/run-send-console.png`,fullPage:true});
 writeFileSync(`${evidence}/run-console-errors.txt`,errors.join('\n')+'\n');
 expect(errors).toEqual([]);
});
