import { test as base, expect } from '../e2e/support.ts';
import { installPinnedFonts } from '../e2e/fonts.ts';
export const test = base.extend({
 workspaceUser: async ({},use)=>{ await use({}); },
 accountId: [async ({request},use)=>{await request.get('/__test/reset'); await use('traffic-validation');}, {auto:true}],
});
export { expect };
export async function installLocalFonts(page) {await installPinnedFonts(page,true);}
export async function openWorkspace(page,user) {await page.goto('/overview'); await expect(page.getByRole('navigation',{name:'Workspace'})).toBeVisible();}
export async function generatedEvents(accountId) {return (await (await fetch('http://localhost:3000/__test/events')).json()).filter(row=>/^e\d+$/.test(row.id));}
