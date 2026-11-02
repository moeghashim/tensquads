import {test as base,expect,waitForHydration} from '../e2e/support.ts';
import {installPinnedFonts} from '../e2e/fonts.ts';
export {expect};
export async function admin(action,value=''){const r=await fetch('http://127.0.0.1:3000/__validation',{method:'POST',body:JSON.stringify({action,value})});if(!r.ok)throw Error(await r.text());return r.json();}
export const test=base.extend({workspaceUser:async({},use)=>{await use({email:'',password:'',userId:'validation-user',accountId:'validation'});}, accountId:[async({},use)=>{await admin('reset');await use('validation');},{auto:true}]});
export async function installLocalFonts(page){await installPinnedFonts(page,true);}
export async function openWorkspace(page,user){await page.goto('/overview');await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();}
export async function generatedEvents(accountId){return (await admin('events')).filter(x=>/^e\d+$/.test(x.id));}
