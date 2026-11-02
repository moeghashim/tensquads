import {test,expect} from './support.ts';
test('an unauthenticated visitor to overview is sent to sign in',async({page})=>{
 await page.goto('/overview');
 await expect(page).toHaveURL(/\/signin$/);
 await expect(page.getByLabel('Email')).toBeVisible();
 await page.screenshot({path:'/Users/moeghashim/.no-mistakes/evidence/01M6E1MX216VYJ1R76P4Y74P86/overview-auth-guard.png',fullPage:true});
});
