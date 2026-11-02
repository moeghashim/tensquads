import {test as base,expect} from './support.ts';
export {expect};
export {generatedEvents,installLocalFonts} from './workspace.ts';
export type {WorkspaceUser} from './workspace.ts';
export const test=base.extend<{workspaceUser:any,accountId:string}>({
 workspaceUser:async({request},use)=>{const r=await request.get('/__local_reset');expect(r.ok()).toBe(true);await use({});},
 accountId:async({},use)=>{await use('local-validation')},
});
export async function openWorkspace(page:any,_user:any){await page.goto('/overview');await expect(page.getByRole('heading',{name:'Good morning, Moe'})).toBeVisible();}
